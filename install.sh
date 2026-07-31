#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${PBXPULS_INSTALL_DIR:-/opt/asterisk-cdr-panel}"
REPOSITORY="${PBXPULS_REPOSITORY:-https://github.com/ravigodno/freepbx-cdr-new.git}"
REF="${PBXPULS_REF:-main}"
PROCESS_NAME="${PBXPULS_PROCESS_NAME:-asterisk-cdr-panel}"
SERVICE_USER="pbxpuls"
PORT="${PBXPULS_PORT:-3000}"
CREDENTIALS_FILE="${PBXPULS_CREDENTIALS_FILE:-/root/pbxpuls-install-credentials.txt}"

log() { printf '\n[PBXPuls installer] %s\n' "$*"; }
fail() { printf '\n[PBXPuls installer] ERROR: %s\n' "$*" >&2; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || fail "Запустите установщик от root."
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export DEBIAN_FRONTEND=noninteractive

install_packages() {
  log "Установка системных зависимостей"
  if command_exists apt-get; then
    apt-get update
    apt-get install -y git curl ca-certificates build-essential mariadb-client netcat-openbsd openssl
  elif command_exists dnf; then
    dnf install -y git curl ca-certificates gcc-c++ make mariadb nc openssl
  elif command_exists yum; then
    yum install -y git curl ca-certificates gcc-c++ make mariadb nc openssl
  else
    fail "Не найден поддерживаемый пакетный менеджер: apt, dnf или yum."
  fi
}

read_freepbx_value() {
  local key="$1"
  [[ -r /etc/freepbx.conf ]] || return 0
  if command_exists php; then
    php -r '$key=$argv[1]; @include "/etc/freepbx.conf"; if (isset($amp_conf[$key])) echo $amp_conf[$key]; elseif (defined($key)) echo constant($key);' "$key" 2>/dev/null || true
  fi
}

configure_mysql_admin() {
  MYSQL_ADMIN_MODE=""
  MYSQL_ADMIN_HOST=""
  MYSQL_ADMIN_USER=""
  MYSQL_ADMIN_PASSWORD=""

  if mysql --protocol=socket -uroot -Nse 'SELECT 1' >/dev/null 2>&1; then
    MYSQL_ADMIN_MODE="root_socket"
    return
  fi

  local fpbx_user fpbx_password fpbx_host
  fpbx_user="$(read_freepbx_value AMPDBUSER)"
  fpbx_password="$(read_freepbx_value AMPDBPASS)"
  fpbx_host="$(read_freepbx_value AMPDBHOST)"
  fpbx_host="${fpbx_host:-localhost}"
  if [[ -n "$fpbx_user" ]] && MYSQL_PWD="$fpbx_password" mysql -h "$fpbx_host" -u "$fpbx_user" -Nse 'SELECT 1' >/dev/null 2>&1; then
    MYSQL_ADMIN_MODE="freepbx"
    MYSQL_ADMIN_HOST="$fpbx_host"
    MYSQL_ADMIN_USER="$fpbx_user"
    MYSQL_ADMIN_PASSWORD="$fpbx_password"
    return
  fi

  fail "Нет административного доступа к MariaDB через root-сокет или /etc/freepbx.conf."
}

mysql_admin() {
  if [[ "$MYSQL_ADMIN_MODE" == "root_socket" ]]; then
    mysql --protocol=socket -uroot "$@"
  else
    MYSQL_PWD="$MYSQL_ADMIN_PASSWORD" mysql -h "$MYSQL_ADMIN_HOST" -u "$MYSQL_ADMIN_USER" "$@"
  fi
}

set_env() {
  local key="$1" value="$2" file="$APP_DIR/.env" escaped
  escaped="${value//\\/\\\\}"
  escaped="${escaped//&/\\&}"
  escaped="${escaped//|/\\|}"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*$|${key}=\"${escaped}\"|" "$file"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$file"
  fi
}

generate_secret() {
  openssl rand -hex "${1:-24}"
}

install_packages

command_exists fwconsole || fail "fwconsole не найден. Сначала установите FreePBX 16 или FreePBX 17."
FREEPBX_VERSION="$(fwconsole --version 2>/dev/null | head -n1 | tr -cd '0-9.\n' || true)"
case "$FREEPBX_VERSION" in
  16*|17*) log "Обнаружен FreePBX ${FREEPBX_VERSION}" ;;
  *) fail "Поддерживаются FreePBX 16 и FreePBX 17. Обнаружено: ${FREEPBX_VERSION:-неизвестно}." ;;
esac

if ! command_exists node || ! command_exists npm; then
  fail "Node.js и npm не найдены. Для FreePBX 16/17 установите совместимый Node.js 18 или новее и повторите запуск."
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 18 )) || fail "Требуется Node.js 18 или новее. Сейчас: $(node -v)."
log "Используется $(node -v), npm $(npm -v)"
if (( NODE_MAJOR < 20 )); then
  log "Режим совместимости Node.js $(node -v): основные функции PBXPuls работают, Google GenAI требует Node.js 20+."
fi

if [[ -e "$APP_DIR" ]]; then
  fail "Каталог $APP_DIR уже существует. Установщик предназначен для чистой установки и не удаляет существующие данные."
fi

log "Клонирование PBXPuls (${REF})"
git clone --depth 1 --branch "$REF" "$REPOSITORY" "$APP_DIR"
cd "$APP_DIR"

DB_PASSWORD="$(generate_secret 24)"
AMI_PASSWORD="$(generate_secret 24)"
SU_PASSWORD="$(generate_secret 16)"
ADMIN_PASSWORD="$(generate_secret 16)"
OPERATOR_PASSWORD="$(generate_secret 16)"
JWT_SECRET="$(generate_secret 32)"

cp -n .env.example .env 2>/dev/null || touch .env
chmod 600 .env

# Internal PBXPuls DB and read-only access to FreePBX databases.
set_env PBXPULS_DB_HOST 127.0.0.1
set_env PBXPULS_DB_PORT 3306
set_env PBXPULS_DB_NAME pbxpuls
set_env PBXPULS_DB_USER "$SERVICE_USER"
set_env PBXPULS_DB_PASSWORD "$DB_PASSWORD"
set_env DB_HOST localhost
set_env DB_PORT 3306
set_env DB_NAME asteriskcdrdb
set_env DB_USER "$SERVICE_USER"
set_env DB_PASS "$DB_PASSWORD"
set_env FREEPBX_DB_HOST localhost
set_env FREEPBX_DB_PORT 3306
set_env FREEPBX_DB_NAME asteriskcdrdb
set_env FREEPBX_DB_USER "$SERVICE_USER"
set_env FREEPBX_DB_PASSWORD "$DB_PASSWORD"

# Asterisk AMI service account. Both legacy and current variable names are written.
set_env AMI_HOST 127.0.0.1
set_env AMI_PORT 5038
set_env AMI_USER "$SERVICE_USER"
set_env AMI_PASS "$AMI_PASSWORD"
set_env AMI_CONTEXT from-internal
set_env ASTERISK_AMI_HOST 127.0.0.1
set_env ASTERISK_AMI_PORT 5038
set_env ASTERISK_AMI_USER "$SERVICE_USER"
set_env ASTERISK_AMI_PASSWORD "$AMI_PASSWORD"
set_env ASTERISK_AMI_CONTEXT from-internal

set_env RECORDINGS_PATH /var/spool/asterisk/monitor
set_env PORT "$PORT"
set_env NODE_ENV production
set_env JWT_SECRET "$JWT_SECRET"
set_env SU_USERNAME su
set_env SU_PASSWORD "$SU_PASSWORD"
set_env ADMIN_USERNAME admin
set_env ADMIN_PASSWORD "$ADMIN_PASSWORD"
set_env OPERATOR_USERNAME operator
set_env OPERATOR_PASSWORD "$OPERATOR_PASSWORD"
set_env OPERATOR_EXTENSION 101

log "Установка зависимостей и сборка"
npm ci
npm run build

# Create the complete legacy JSON schema before SQL migrations seed users/roles.
# An intentionally invalid runtime DB password prevents the web server from starting;
# bootstrapDatabase() still creates data/db.json with generated web credentials/settings.
log "Формирование начальной конфигурации PBXPuls"
set +e
PBXPULS_DB_PASSWORD="__pbxpuls_bootstrap_only__" NODE_ENV=production timeout 15 node dist/server.cjs > /tmp/pbxpuls-bootstrap.log 2>&1
set -e
[[ -s data/db.json ]] || { cat /tmp/pbxpuls-bootstrap.log >&2 || true; fail "Не удалось создать data/db.json."; }
node -e 'const fs=require("fs"); const db=JSON.parse(fs.readFileSync("data/db.json","utf8")); if(!Array.isArray(db.users)||db.users.length<3||!Array.isArray(db.roles)||db.roles.length<4) process.exit(1);' \
  || fail "Начальная конфигурация пользователей и ролей неполна."
chmod 600 data/db.json

log "Создание MariaDB-пользователя pbxpuls и баз данных"
configure_mysql_admin
mysql_admin -e "CREATE DATABASE IF NOT EXISTS \`pbxpuls\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
for host in localhost 127.0.0.1; do
  mysql_admin -e "CREATE USER IF NOT EXISTS '${SERVICE_USER}'@'${host}' IDENTIFIED BY '${DB_PASSWORD}';"
  if ! mysql_admin -e "ALTER USER '${SERVICE_USER}'@'${host}' IDENTIFIED BY '${DB_PASSWORD}';" >/dev/null 2>&1; then
    mysql_admin -e "SET PASSWORD FOR '${SERVICE_USER}'@'${host}' = PASSWORD('${DB_PASSWORD}');"
  fi
  mysql_admin -e "GRANT ALL PRIVILEGES ON \`pbxpuls\`.* TO '${SERVICE_USER}'@'${host}';"
  mysql_admin -e "GRANT SELECT ON \`asterisk\`.* TO '${SERVICE_USER}'@'${host}';"
  mysql_admin -e "GRANT SELECT ON \`asteriskcdrdb\`.* TO '${SERVICE_USER}'@'${host}';"
done
mysql_admin -e 'FLUSH PRIVILEGES;'

log "Применение миграций и заполнение SQL-пользователей/ролей"
npm run pbxpuls:db:setup
npm run pbxpuls:db:check
MYSQL_PWD="$DB_PASSWORD" mysql -h 127.0.0.1 -u "$SERVICE_USER" pbxpuls -Nse \
  "SELECT CONCAT((SELECT COUNT(*) FROM users),':',(SELECT COUNT(*) FROM roles),':',(SELECT COUNT(*) FROM schema_migrations));" \
  | grep -Eq '^[1-9][0-9]*:[1-9][0-9]*:[1-9][0-9]*$' \
  || fail "SQL-пользователи, роли или миграции не были заполнены."
MYSQL_PWD="$DB_PASSWORD" mysql -h 127.0.0.1 -u "$SERVICE_USER" asteriskcdrdb -Nse 'SELECT 1' >/dev/null \
  || fail "Пользователь pbxpuls не получил доступ к asteriskcdrdb."

log "Создание AMI-пользователя pbxpuls"
install -d -m 0755 /etc/asterisk
cat > /etc/asterisk/manager_pbxpuls.conf <<EOF
; Managed by PBXPuls installer. Do not store this file in public backups.
[pbxpuls]
secret = ${AMI_PASSWORD}
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.255
read = all
write = all
writetimeout = 5000
EOF
chmod 640 /etc/asterisk/manager_pbxpuls.conf
chown root:asterisk /etc/asterisk/manager_pbxpuls.conf 2>/dev/null || true
touch /etc/asterisk/manager_custom.conf
if ! grep -Fq '#include manager_pbxpuls.conf' /etc/asterisk/manager_custom.conf; then
  printf '\n#include manager_pbxpuls.conf\n' >> /etc/asterisk/manager_custom.conf
fi
asterisk -rx 'manager reload' >/dev/null 2>&1 || fwconsole reload >/dev/null
sleep 2
AMI_RESPONSE="$(printf 'Action: Login\r\nUsername: pbxpuls\r\nSecret: %s\r\nEvents: off\r\n\r\n' "$AMI_PASSWORD" | nc -w 4 127.0.0.1 5038 2>/dev/null || true)"
grep -qiE 'Authentication accepted|Response: Success' <<< "$AMI_RESPONSE" \
  || fail "AMI-пользователь pbxpuls создан, но проверка авторизации не прошла."

log "Запуск PBXPuls через PM2"
npm install -g pm2
pm2 delete "$PROCESS_NAME" >/dev/null 2>&1 || true
pm2 start scripts/start-pbxpuls.sh --name "$PROCESS_NAME" --interpreter bash --cwd "$APP_DIR"
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pbxpuls-pm2-startup.log 2>&1 || true

READY=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
if [[ "$READY" -ne 1 ]]; then
  pm2 logs "$PROCESS_NAME" --lines 120 --nostream >&2 || true
  fail "PBXPuls не открыл порт ${PORT}."
fi

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
HOST_IP="${HOST_IP:-127.0.0.1}"
cat > "$CREDENTIALS_FILE" <<EOF
PBXPuls installation credentials
Generated: $(date -Is)
FreePBX detected: ${FREEPBX_VERSION}
URL: http://${HOST_IP}:${PORT}

Web users:
  su / ${SU_PASSWORD}
  admin / ${ADMIN_PASSWORD}
  operator / ${OPERATOR_PASSWORD}

MariaDB service user:
  login: pbxpuls
  password: ${DB_PASSWORD}
  databases: pbxpuls (read/write), asterisk and asteriskcdrdb (read-only)

Asterisk AMI service user:
  login: pbxpuls
  secret: ${AMI_PASSWORD}
EOF
chmod 600 "$CREDENTIALS_FILE"

log "Установка завершена"
printf 'PBXPuls: http://%s:%s\n' "$HOST_IP" "$PORT"
printf 'Учётные данные сохранены только для root: %s\n' "$CREDENTIALS_FILE"
printf 'FreePBX: %s; Node.js: %s\n' "$FREEPBX_VERSION" "$(node -v)"
