#!/bin/bash
set -e

APP_DIR="/opt/asterisk-cdr-panel"
PM2_NAME="asterisk-cdr-panel"

cd "$APP_DIR"

echo "[PBXPULS] create .env"
if [ ! -f .env ]; then
cat > .env <<ENV
NODE_ENV=production
PORT=3000
ENV
fi

echo "[PBXPULS] stop old PM2"
pm2 delete "$PM2_NAME" 2>/dev/null || true

echo "[PBXPULS] clean deps"
rm -rf node_modules dist package-lock.json

echo "[PBXPULS] fix permissions"
chown -R root:root "$APP_DIR"
chmod -R 755 "$APP_DIR"

echo "[PBXPULS] npm install"
npm install --legacy-peer-deps --unsafe-perm --no-audit --no-fund

echo "[PBXPULS] fix binaries"
chmod -R +x node_modules/.bin || true
find node_modules -path '*esbuild*bin/esbuild' -type f -exec chmod +x {} \; 2>/dev/null || true

echo "[PBXPULS] build"
npm run build

echo "[PBXPULS] start PM2"
pm2 start dist/server.cjs --name "$PM2_NAME" --cwd "$APP_DIR"
pm2 save

echo "READY: http://SERVER_IP:3000"
echo "Default login: su / su123456"
