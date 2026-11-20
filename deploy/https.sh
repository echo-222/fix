#!/usr/bin/env bash
# 给站点上 https（Let's Encrypt，自动续期）：
#   bash deploy/https.sh ip         域名没备案时先用：给服务器 IP 申请证书（6 天有效，每 3–4 天自动续）
#   REDIRECT=1 bash deploy/https.sh ip   确认 https://<IP> 能打开后再跑一次：http 全部跳到 https
#   bash deploy/https.sh domain [邮箱]  域名（默认 gulugulu.tripolabs.com，DOMAIN=… 可换）的 A 记录指到服务器以后：
#                                    申请域名证书，http 和 https://<IP> 都跳到 https://<域名>/dongle/
# 两种模式都会顺带更新站点配置 site.conf（/etc/nginx/dongle-site.conf）
set -euo pipefail
HOST=${DEPLOY_HOST:-gulugulu}
DOMAIN=${DOMAIN:-gulugulu.tripolabs.com}
MODE=${1:-}
EMAIL=${2:-}
[ "$MODE" = ip ] || [ "$MODE" = domain ] || { sed -n '2,8p' "$0"; exit 1; }
cd "$(dirname "$0")"

COPYFILE_DISABLE=1 tar --no-xattrs -cf - nginx-ip.conf nginx-https.conf site.conf \
  | ssh "$HOST" 'rm -rf /tmp/dongle-https && mkdir -p /tmp/dongle-https && tar --warning=no-unknown-keyword -C /tmp/dongle-https -xf -'

ssh "$HOST" "MODE='$MODE' DOMAIN='$DOMAIN' EMAIL='$EMAIL' REDIRECT='${REDIRECT:-}' bash -s" <<'REMOTE'
set -euo pipefail
src=/tmp/dongle-https
ip=$(curl -fsS --max-time 5 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || curl -fsS --max-time 5 https://ifconfig.me)

# IP 证书要 certbot 5.4 以上，发行版的太旧，装在 /opt/certbot
if [ ! -x /opt/certbot/bin/certbot ]; then
  echo "== 安装 certbot"
  python3 -m venv /opt/certbot
  /opt/certbot/bin/pip install -q --upgrade pip
  /opt/certbot/bin/pip install -q 'certbot>=5.4'
fi
/opt/certbot/bin/certbot --version

if [ ! -e /etc/systemd/system/dongle-certbot.timer ]; then
  cat > /etc/systemd/system/dongle-certbot.service <<'UNIT'
[Unit]
Description=续期 Let's Encrypt 证书
[Service]
Type=oneshot
ExecStart=/opt/certbot/bin/certbot renew --quiet
UNIT
  cat > /etc/systemd/system/dongle-certbot.timer <<'UNIT'
[Unit]
Description=每天两次检查证书续期
[Timer]
OnCalendar=*-*-* 03,15:20:00
RandomizedDelaySec=30min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now dongle-certbot.timer >/dev/null 2>&1
fi

if [ -n "$EMAIL" ]; then account=(--email "$EMAIL"); else account=(--register-unsafely-without-email); fi
mkdir -p /srv/dongle/acme /srv/dongle/www
ln -sfn /srv/dongle/current/dist /srv/dongle/www/dongle
install -m 644 $src/site.conf /etc/nginx/dongle-site.conf

if [ "$MODE" = ip ]; then
  echo "== 给 $ip 申请证书"
  /opt/certbot/bin/certbot certonly --cert-name ip --webroot -w /srv/dongle/acme \
    --ip-address "$ip" --preferred-profile shortlived \
    "${account[@]}" --agree-tos --non-interactive --keep-until-expiring \
    --deploy-hook 'systemctl reload nginx'
  # 6 天的证书：剩 3 天时续，一周两次左右，不会碰到 Let's Encrypt 每周 5 张的限制
  sed -i -E '/^renew_before_expiry/d' /etc/letsencrypt/renewal/ip.conf
  sed -i '1i renew_before_expiry = 3 days' /etc/letsencrypt/renewal/ip.conf
  if [ "$REDIRECT" = 1 ]; then
    echo 'location / { return 301 https://$host$request_uri; }' > /etc/nginx/dongle-http.conf
  else
    echo 'include /etc/nginx/dongle-site.conf;' > /etc/nginx/dongle-http.conf
  fi
  install -m 644 $src/nginx-ip.conf /etc/nginx/conf.d/dongle.conf
  nginx -t
  systemctl reload nginx
  echo "== https://$ip/dongle/ 已启用${REDIRECT:+，http 跳转到 https}"
else
  got=$(curl -fsS --max-time 5 "https://dns.alidns.com/resolve?name=$DOMAIN&type=A" | grep -oE '"data":"[0-9.]+"' | tail -1 | cut -d'"' -f4)
  if [ "$got" != "$ip" ]; then
    echo "!! $DOMAIN 解析到的是 ${got:-（没有）}，不是这台服务器 $ip。先去域名服务商加一条 A 记录指到 $ip，生效后再跑。"
    exit 1
  fi
  # 证书已经有了就不再找 Let's Encrypt（从国内连偶尔超时），只更新 nginx 配置；续期交给 dongle-certbot.timer
  if [ -e "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "== $DOMAIN 已经有证书，只更新 nginx 配置"
  else
    echo "== 给 $DOMAIN 申请证书"
    /opt/certbot/bin/certbot certonly --cert-name "$DOMAIN" --webroot -w /srv/dongle/acme -d "$DOMAIN" \
      "${account[@]}" --agree-tos --non-interactive --keep-until-expiring \
      --deploy-hook 'systemctl reload nginx'
  fi
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__IP__/$ip/g" $src/nginx-https.conf > /tmp/dongle-https/dongle.conf
  [ -e /etc/letsencrypt/live/ip/fullchain.pem ] || sed -i '/^# ip-begin/,/^# ip-end/d' /tmp/dongle-https/dongle.conf
  install -m 644 /tmp/dongle-https/dongle.conf /etc/nginx/conf.d/dongle.conf
  nginx -t
  systemctl reload nginx
  echo "== https://$DOMAIN/dongle/ 已启用"
fi
rm -rf $src
REMOTE
