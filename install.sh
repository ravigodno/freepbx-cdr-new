#!/bin/bash
set -e

APP_DIR="/opt/asterisk-cdr-panel"
PM2_NAME="asterisk-cdr-panel"

cd "$APP_DIR"


echo "[PBXPULS] configure AMI user"
AMI_USER="pbxpuls"
AMI_PASS="$(openssl rand -hex 16)"

if [ -f /etc/asterisk/manager_custom.conf ]; then
cat >> /etc/asterisk/manager_custom.conf <<EOFAMI

[pbxpuls]
secret=$AMI_PASS
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
read=system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write=system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
writetimeout=5000
EOFAMI

asterisk -rx "manager reload" || true
fi

echo "[PBXPULS] configure MariaDB CDR user"
DB_USER="pbxpuls"
DB_PASS="$(openssl rand -hex 16)"

mysql -uroot <<EOFSQL || true
DELETE FROM mysql.user WHERE User='$DB_USER' AND Host='localhost';
FLUSH PRIVILEGES;
CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT SELECT ON asteriskcdrdb.* TO '$DB_USER'@'localhost';
GRANT SELECT ON asterisk.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOFSQL

echo "[PBXPULS] write .env"
cat > .env <<EOFENV
NODE_ENV=production
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=asteriskcdrdb
DB_USER=$DB_USER
DB_PASS=$DB_PASS

AMI_HOST=localhost
AMI_PORT=5038
AMI_USER=$AMI_USER
AMI_PASS=$AMI_PASS
AMI_CONTEXT=from-internal

RECORDINGS_PATH=/var/spool/asterisk/monitor
EOFENV


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


echo "[PBXPULS] sync generated credentials to data/db.json"
node - <<'NODESYNC'
const fs = require('fs');
const path = require('path');

const dbFile = path.join(process.cwd(), 'data', 'db.json');
const envFile = path.join(process.cwd(), '.env');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

if (fs.existsSync(dbFile)) {
  const env = readEnv(envFile);
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

  db.settings = {
    ...(db.settings || {}),
    dbHost: env.DB_HOST || 'localhost',
    dbPort: parseInt(env.DB_PORT || '3306', 10),
    dbName: env.DB_NAME || 'asteriskcdrdb',
    dbUser: env.DB_USER || 'pbxpuls',
    dbPass: env.DB_PASS || '',
    amiHost: env.AMI_HOST || 'localhost',
    amiPort: parseInt(env.AMI_PORT || '5038', 10),
    amiUser: env.AMI_USER || 'pbxpuls',
    amiPass: env.AMI_PASS || '',
    amiContext: env.AMI_CONTEXT || 'from-internal',
    recordingsPath: env.RECORDINGS_PATH || '/var/spool/asterisk/monitor'
  };

  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  console.log('OK: db.json settings synced from .env');
} else {
  console.log('SKIP: data/db.json not found yet');
}
NODESYNC

echo "[PBXPULS] start PM2"
pm2 start dist/server.cjs --name "$PM2_NAME" --cwd "$APP_DIR"
pm2 save

echo "READY: http://SERVER_IP:3000"
echo "Default login: su / su123456"
