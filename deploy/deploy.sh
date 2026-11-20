#!/usr/bin/env bash
# 部署（npm run deploy）：本机 build → 打包上传成一个新版本 → 服务器上装依赖 → 切到新版本 → 重启并自检。
# 每个版本在 /srv/dongle/releases/<时间>，/srv/dongle/current 指向正在用的那个，保留最近 5 个；
# 回滚：ssh gulugulu 'ln -sfn /srv/dongle/releases/<旧版本> /srv/dongle/current && systemctl restart dongle'
# 数据（/var/lib/dongle）和配置（/etc/dongle.env）不随版本走。
set -euo pipefail
HOST=${DEPLOY_HOST:-gulugulu}
cd "$(dirname "$0")/.."

# 线上地址是 https://gulugulu.tripolabs.com/dongle/，前端按这个子路径打包（nginx 那边见 site.conf）
[ "${SKIP_BUILD:-}" = 1 ] || BASE_PATH=/dongle/ npm run build
grep -q '"/dongle/assets/' dist/index.html || { echo "!! dist 不是按 /dongle/ 打的包，去掉 SKIP_BUILD 重新跑"; exit 1; }

rel=$(date +%Y%m%d-%H%M%S)
echo "== 上传版本 $rel"
# dist/imported 是本机网页导入的说明书（public/imported，见 .gitignore），不上线；线上导入的在服务器的 /var/lib/dongle/imported。
# 网页上生成说明书要在服务器上跑 Vite（读场景脚本、截图复核）和 scripts/ 里的脚本，所以源码和 Vite 配置也带上；
# 提示词按分流链路现读 .cursor/skills/<skill>/（server/manualSkill.ts），六份 skill 都要带，缺了不报错、只是提示词空着。
# public/ 不重复上传，服务器上从 dist/ 硬链接出来（dist 就是 public 加上打包结果）
COPYFILE_DISABLE=1 tar --no-xattrs --exclude='dist/imported' --exclude='.DS_Store' -czf - \
    dist server src scripts deploy index.html vite.config.ts tsconfig.json package.json package-lock.json .cursor/skills \
  | ssh "$HOST" "mkdir -p /srv/dongle/releases/$rel && tar --warning=no-unknown-keyword --no-same-owner -C /srv/dongle/releases/$rel -xzf -"

ssh "$HOST" "REL=$rel bash -s" <<'REMOTE'
set -euo pipefail
cd /srv/dongle/releases/$REL
prev=$(readlink -f /srv/dongle/current 2>/dev/null || true)
cp -al dist public && rm -rf public/assets public/index.html
# 依赖按 package-lock.json 的哈希装在 /srv/dongle/deps/<哈希>，锁文件没变的版本共用一份。
# 要带 devDependencies：生成说明书用的 Vite 在里面
deps=/srv/dongle/deps/$(sha256sum package-lock.json | cut -c1-16)-full
if [ ! -d "$deps/node_modules" ]; then
  echo "== 安装依赖"
  rm -rf "$deps.tmp" && mkdir -p "$deps.tmp" && cp package.json package-lock.json "$deps.tmp/"
  (cd "$deps.tmp" && npm ci --include=dev --ignore-scripts --no-audit --no-fund --loglevel=error --registry=https://registry.npmmirror.com)
  mv -T "$deps.tmp" "$deps"
fi
ln -sfn "$deps/node_modules" node_modules

# systemd 单元和 nginx 站点配置跟着版本走，有变化才装；nginx 配置不对就整个不上线
units=0
for u in dongle.service dongle-backup.service dongle-backup.timer; do
  cmp -s deploy/$u /etc/systemd/system/$u || { install -m 644 deploy/$u /etc/systemd/system/$u; units=1; }
done
[ $units = 0 ] || systemctl daemon-reload
site=0
if ! cmp -s deploy/site.conf /etc/nginx/dongle-site.conf; then
  cp /etc/nginx/dongle-site.conf /tmp/dongle-site.conf.prev
  install -m 644 deploy/site.conf /etc/nginx/dongle-site.conf
  if ! nginx -t -q; then
    install -m 644 /tmp/dongle-site.conf.prev /etc/nginx/dongle-site.conf
    echo "!! deploy/site.conf 有问题，nginx 配置已还原，没有上线"
    exit 1
  fi
  site=1
fi

ln -sfn /srv/dongle/releases/$REL /srv/dongle/current.next
mv -T /srv/dongle/current.next /srv/dongle/current
mkdir -p /srv/dongle/www && ln -sfn /srv/dongle/current/dist /srv/dongle/www/dongle
systemctl restart dongle

for i in $(seq 1 20); do
  curl -fs -o /dev/null http://127.0.0.1:3000/api/auth/me && break
  sleep 0.5
done
if ! curl -fsS -o /dev/null http://127.0.0.1:3000/api/auth/me; then
  journalctl -u dongle -n 30 --no-pager
  if [ -n "$prev" ]; then
    echo "!! 新版本起不来，切回 $(basename "$prev")"
    ln -sfn "$prev" /srv/dongle/current && systemctl restart dongle
  fi
  exit 1
fi
[ $site = 0 ] || systemctl reload nginx
curl -fsS -o /dev/null http://127.0.0.1/dongle/ || { echo "!! nginx 没有返回首页"; exit 1; }

ls -1dt /srv/dongle/releases/*/ | tail -n +6 | xargs -r rm -rf
used=$(for r in /srv/dongle/releases/*/; do readlink "$r/node_modules"; done | xargs -r -n1 dirname | sort -u)
for d in /srv/dongle/deps/*/; do
  d=${d%/}
  grep -qxF "$d" <<<"$used" || rm -rf "$d"
done
echo "== 已上线版本 $REL"
REMOTE
