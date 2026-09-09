#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${PBXPULS_INSTALL_DIR:-/opt/asterisk-cdr-panel}"
REPOSITORY="${PBXPULS_REPOSITORY:-https://github.com/ravigodno/freepbx-cdr-new.git}"
REF="${PBXPULS_REF:-v5.8.27}"
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
  local missing=() cmd
  for cmd in git curl openssl nc; do
    if ! command_exists "$cmd"; then
      case "$cmd" in g++) missing+=(gcc-c++);; nc) missing+=(nmap-ncat);; *) missing+=("$cmd");; esac
    fi
  done
  (( ${#missing[@]} )) || return 0
  if command_exists apt-get; then
    local packages=() item
    for item in "${missing[@]}"; do case "$item" in gcc-c++) packages+=(g++);; nmap-ncat) packages+=(netcat-openbsd);; *) packages+=("$item");; esac; done
    apt-get update; apt-get install -y "${packages[@]}"
  elif command_exists yum; then yum install -y "${missing[@]}"
  elif command_exists dnf; then dnf install -y "${missing[@]}"
  else fail 'No supported package manager'; fi
}

preflight() {
  [[ $(uname -m) == x86_64 ]] || fail 'Supported architecture: x86_64'
  source /etc/os-release
  case "$ID" in sangoma|centos|rhel|debian|ubuntu|rocky|almalinux) ;; *) fail "Unsupported OS: $ID";; esac
  local libc
  libc=$(getconf GNU_LIBC_VERSION | awk '{print $2}')
  [[ "$libc" == 2.17 || $(printf '%s\n' 2.28 "$libc" | sort -V | head -1) == 2.28 ]] || fail "Unsupported glibc: $libc"
  for cmd in tar xz sha256sum; do command_exists "$cmd" || fail "Required preflight tool: $cmd"; done
  if [[ -n "${PBXPULS_NODE_HOME:-}" ]]; then
    [[ -x "$PBXPULS_NODE_HOME/bin/node" && -x "$PBXPULS_NODE_HOME/bin/npm" ]] || fail 'Incomplete dedicated runtime'
    "$PBXPULS_NODE_HOME/bin/node" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || fail 'Runtime cannot execute'
  fi
  printf 'glibc %s\n' "$libc"
  rpm -q libstdc++ 2>/dev/null || true
  command_exists mysql || fail 'MariaDB client required; do not replace the FreePBX database server'
  command_exists ss || fail 'ss required for port preflight'
  command_exists systemctl || fail 'systemd is required'
  if [[ -e "$APP_DIR" ]]; then
    [[ "${PBXPULS_RESUME:-0}" == 1 && -f "$APP_DIR/.pbxpuls-install-state" ]] || fail 'Existing installation: use update script, or PBXPULS_RESUME=1 for this installer'
  fi
  for port in "$PORT" 3001; do
    if ss -lntH | awk '{print $4}' | grep -Eq ":${port}$"; then
      [[ "${PBXPULS_RESUME:-0}" == 1 && -f "$APP_DIR/.pbxpuls-runtime" ]] || fail "Port $port is occupied"
      source "$APP_DIR/scripts/pbxpuls-runtime.sh"
      pbxpuls_runtime "$APP_DIR"
      pid=$(pm2 pid "$PROCESS_NAME")
      [[ "$pid" =~ ^[1-9][0-9]*$ ]] && [[ $(readlink "/proc/$pid/cwd") == "$APP_DIR" ]] || fail 'Occupied port is not owned by this installation'
      ss -lntpH | grep -E ":${port} " | grep -q "pid=$pid," || fail 'Listener ownership does not match PBXPuls'
    fi
  done
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

initialize_install_state() {
if [[ ! -f .pbxpuls-install-state ]]; then
  for key in DB_PASSWORD AMI_PASSWORD SU_PASSWORD ADMIN_PASSWORD OPERATOR_PASSWORD JWT_SECRET; do
    printf '%s=%q\n' "$key" "$(generate_secret 32)"
  done > .pbxpuls-install-state.tmp
  chmod 600 .pbxpuls-install-state.tmp
  mv .pbxpuls-install-state.tmp .pbxpuls-install-state
fi
}

if [[ "${PBXPULS_INSTALL_FUNCTIONS_ONLY:-0}" == 1 ]]; then return 0 2>/dev/null || exit 0; fi

preflight
command_exists fwconsole || fail 'fwconsole not found'
FREEPBX_VERSION="$(fwconsole --version 2>/dev/null | head -n1 | tr -cd '0-9.\n')"
case "$FREEPBX_VERSION" in 16*|17*) ;; *) fail 'FreePBX 16 or 17 required';; esac
configure_mysql_admin
[[ "${PBXPULS_PREFLIGHT_ONLY:-0}" != 1 ]] || exit 0
install_packages
if [[ ! -d "$APP_DIR/.git" ]]; then
  clone_dir=$(mktemp -d "${APP_DIR}.clone-XXXXXX")
  git clone --depth 1 --branch "$REF" "$REPOSITORY" "$clone_dir"
  mv "$clone_dir" "$APP_DIR"
fi
cd "$APP_DIR"
umask 077
initialize_install_state
[[ $(stat -c %u .pbxpuls-install-state) == 0 && $(stat -c %a .pbxpuls-install-state) == 600 ]] || fail "Install state must be root-owned, mode 0600"
source .pbxpuls-install-state
export PBXPULS_RUNTIME_RESULT="$APP_DIR/.runtime-result"
bash scripts/install-runtime.sh
export PBXPULS_NODE_HOME="$(cat "$PBXPULS_RUNTIME_RESULT")"
source scripts/pbxpuls-runtime.sh
pbxpuls_runtime "$APP_DIR"
pbxpuls_save_runtime "$APP_DIR"

cp -n .env.example .env 2>/dev/null || touch .env
chmod 600 .env

# Internal PBXpuls DB and read-only access to FreePBX databases.
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
npm_config_engine_strict=false npm ci
npm run build

# Reuse the existing schema bootstrap without launching HTTP, AMI or timers.
node dist/server.cjs --bootstrap-only > "$APP_DIR/.bootstrap.log" 2>&1
[[ -s data/db.json ]] || fail 'Initial configuration was not created'
chmod 600 data/db.json

log "Создание MariaDB-пользователя pbxpuls и баз данных"
configure_mysql_admin
mysql_admin -e "CREATE DATABASE IF NOT EXISTS \`pbxpuls\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
for host in localhost 127.0.0.1; do
  existing=$(mysql_admin -Nse "SELECT COUNT(*) FROM mysql.user WHERE User='${SERVICE_USER}' AND Host='${host}'")
  if [[ "$existing" == 0 ]]; then
    mysql_admin -e "CREATE USER '${SERVICE_USER}'@'${host}' IDENTIFIED BY '${DB_PASSWORD}';"
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
asterisk -rx 'manager reload' >/dev/null
sleep 2
AMI_RESPONSE="$(printf 'Action: Login\r\nUsername: pbxpuls\r\nSecret: %s\r\nEvents: off\r\n\r\n' "$AMI_PASSWORD" | nc -w 4 127.0.0.1 5038 2>/dev/null || true)"
grep -qiE 'Authentication accepted|Response: Success' <<< "$AMI_RESPONSE" \
  || fail "AMI-пользователь pbxpuls создан, но проверка авторизации не прошла."

log "Проверка и включение SQL-справочника"
node node_modules/tsx/dist/cli.mjs scripts/directory-storage.ts > .directory-preview
expected=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".directory-preview")).digest)')
PBXPULS_MAINTENANCE=1 node node_modules/tsx/dist/cli.mjs scripts/directory-storage.ts --apply --expect "$expected"
log "Запуск PBXPuls через PM2"
[[ -x "$PBXPULS_NODE_HOME/bin/pm2" ]] || npm install -g pm2@7.0.3
if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
  pm2 restart "$PROCESS_NAME" --update-env
else
  pm2 start scripts/start-pbxpuls.sh --name "$PROCESS_NAME" --interpreter bash --cwd "$APP_DIR"
fi
pm2 save
pbxpuls_service "$APP_DIR"
pbxpuls_http "$PORT" || fail 'PBXPuls HTTP check failed'

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
