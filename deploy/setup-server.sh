#!/usr/bin/env bash
# 第一次上线前在本机跑一次：bash deploy/setup-server.sh
# 通过 ssh 在服务器（默认 ssh 别名 gulugulu，root）上装 Node 24 和 nginx，建运行用户和目录，放好 nginx / systemd 配置。
# 可以重复跑：已有的 /etc/dongle.env 和数据不会动。
set -euo pipefail
HOST=${DEPLOY_HOST:-gulugulu}
cd "$(dirname "$0")"

COPYFILE_DISABLE=1 tar --no-xattrs -cf - nginx.conf site.conf dongle.service dongle-backup.service dongle-backup.timer \
  | ssh "$HOST" 'rm -rf /tmp/dongle-setup && mkdir -p /tmp/dongle-setup && tar --warning=no-unknown-keyword -C /tmp/dongle-setup -xf -'

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
src=/tmp/dongle-setup

echo "== 安装 Node.js、nginx"
dnf install -y -q nodejs npm nginx
node -v

echo "== 用户和目录"
id dongle >/dev/null 2>&1 || useradd --system --home-dir /var/lib/dongle --shell /sbin/nologin dongle
mkdir -p /srv/dongle/releases /srv/dongle/acme /srv/dongle/www /var/lib/dongle /var/backups/dongle
ln -sfn /srv/dongle/current/dist /srv/dongle/www/dongle
chown dongle:dongle /var/lib/dongle /var/backups/dongle
chmod 750 /var/lib/dongle /var/backups/dongle
# 网页导入的说明书、生成过程的中间文件；缓存（Vite、npx）在 /var/cache/dongle（dongle.service 的 CacheDirectory）
install -d -o dongle -g dongle -m 750 /var/lib/dongle/imported /var/lib/dongle/import-work /var/cache/dongle

# 网页上生成说明书时截图复核要用无头 Chrome（版本和 scripts/headless.mjs 的参数配套，从 npmmirror 下载）和中文字体
echo "== 无头 Chrome、中文字体"
CHROME_VER=156.0.8078.80
CHROME_DIR=/opt/chrome-headless-shell-linux64
dnf install -y -q unzip fontconfig google-noto-sans-cjk-sc-fonts nss atk at-spi2-atk at-spi2-core alsa-lib mesa-libgbm \
  libX11 libXcomposite libXdamage libXext libXfixes libXrandr libxcb libxkbcommon
if [ "$(cat $CHROME_DIR/VERSION 2>/dev/null)" != "$CHROME_VER" ]; then
  curl -fsSL --retry 3 -o /tmp/chrome-headless-shell.zip \
    "https://cdn.npmmirror.com/binaries/chrome-for-testing/$CHROME_VER/linux64/chrome-headless-shell-linux64.zip"
  rm -rf $CHROME_DIR && unzip -q /tmp/chrome-headless-shell.zip -d /opt && rm /tmp/chrome-headless-shell.zip
  echo $CHROME_VER > $CHROME_DIR/VERSION
fi
missing=$(ldd $CHROME_DIR/chrome-headless-shell | grep 'not found' || true)
[ -z "$missing" ] || { echo "!! Chrome 缺这些库，用 dnf provides 查包名装上：$missing"; exit 1; }
$CHROME_DIR/chrome-headless-shell --version

# 外观模型减面用 npx @gltf-transform/cli（scripts/tripo.mjs）：先按服务的环境装进缓存，第一次生成时不用等下载
echo "== gltf-transform"
sudo -u dongle env HOME=/var/cache/dongle npm_config_cache=/var/cache/dongle/npm npm_config_registry=https://registry.npmmirror.com \
  npm_config_update_notifier=false bash -c 'cd /var/cache/dongle && npx -y @gltf-transform/cli@4 --version' 2>&1 | grep -v 'Unknown global config'

if [ ! -f /etc/dongle.env ]; then
  install -m 600 /dev/null /etc/dongle.env
  cat > /etc/dongle.env <<'ENV'
# 懂了 Dongle 线上配置（改完 systemctl restart dongle）
# 这些邮箱注册时不用邀请码，并且自动成为管理员（逗号分隔）
ADMIN_EMAILS=
# 注册要邮箱验证码就设成 1（默认不要，忘了密码由管理员在后台重置）
# EMAIL_VERIFY=1
# 发验证码的邮箱（EMAIL_VERIFY=1 时才用）。不填时验证码打印在 journalctl -u dongle 里，管理后台概览页也能看到
# 阿里云封了 25 端口，用 465
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
# MAIL_FROM=懂了 Dongle <no-reply@tripolabs.com>
# 网页上传说明书生成 3D 说明书：AI_*（OpenAI 兼容的多模态模型）必填，TRIPO_API_KEY 选填（写实外观模型）
# 服务器在国内连不上 api.openai.com，用国内能直连的服务（例如阿里云百炼）或者走代理（HTTPS_PROXY + NODE_USE_ENV_PROXY=1）
AI_API_KEY=
# AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# AI_MODEL=
# AI_MANUAL_MODEL=
# TRIPO_API_KEY=
# TRIPO_BASE_URL=https://openapi.tripo3d.com/v3
# 每人同时最多 1 个、全站同时最多 MANUAL_MAX_JOBS 个生成任务；普通用户每天最多 MANUAL_DAILY_LIMIT 份
# MANUAL_MAX_JOBS=2
# MANUAL_DAILY_LIMIT=10
ENV
fi

echo "== nginx"
# 已经跑过 deploy/https.sh 的话 dongle.conf 是 https 版，不覆盖
[ -f /etc/nginx/conf.d/dongle.conf ] || install -m 644 $src/nginx.conf /etc/nginx/conf.d/dongle.conf
install -m 644 $src/site.conf /etc/nginx/dongle-site.conf
# 发行版自带的 nginx.conf 里有个默认 server（欢迎页）；去掉它的 default_server，IP 访问也落到我们这
sed -i -E 's/(listen\s+(\[::\]:)?80)\s+default_server/\1/' /etc/nginx/nginx.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "== systemd"
install -m 644 $src/dongle.service /etc/systemd/system/dongle.service
install -m 644 $src/dongle-backup.service /etc/systemd/system/dongle-backup.service
install -m 644 $src/dongle-backup.timer /etc/systemd/system/dongle-backup.timer
systemctl daemon-reload
systemctl enable dongle >/dev/null 2>&1
systemctl enable --now dongle-backup.timer >/dev/null 2>&1

rm -rf $src
echo "服务器准备好了。接着在本机跑 npm run deploy"
REMOTE
