#!/usr/bin/env bash
# Shared runtime contract for install, update and systemd. Never source .env as shell code.
pbxpuls_runtime() {
  local app="$1"
  if [[ -f "$app/.pbxpuls-runtime" ]]; then
    [[ $(stat -c %u "$app/.pbxpuls-runtime") == 0 ]] || return 1
    # Generated root-owned deployment configuration, not application/user input.
    source "$app/.pbxpuls-runtime"
  fi
  : "${PBXPULS_NODE_HOME:?Set PBXPULS_NODE_HOME to the dedicated Node.js directory}"
  [[ "$PBXPULS_NODE_HOME" == /* && "$PBXPULS_NODE_HOME" != /usr && "$PBXPULS_NODE_HOME" != /usr/local ]] || return 1
  export PATH="$PBXPULS_NODE_HOME/bin:$PATH"
  export npm_config_prefix="$PBXPULS_NODE_HOME"
  export PM2_HOME="${PM2_HOME:-/opt/pbxpuls-runtime/pm2}"
  export PBXPULS_SERVICE="${PBXPULS_SERVICE:-pbxpuls-pm2}"
  "$PBXPULS_NODE_HOME/bin/node" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
  "$PBXPULS_NODE_HOME/bin/npm" --version >/dev/null
}
pbxpuls_save_runtime() {
  umask 077
  printf 'PBXPULS_NODE_HOME=%q\nPM2_HOME=%q\nPBXPULS_SERVICE=%q\n' "$PBXPULS_NODE_HOME" "$PM2_HOME" "$PBXPULS_SERVICE" > "$1/.pbxpuls-runtime"
  chmod 600 "$1/.pbxpuls-runtime"
}
pbxpuls_service() {
  local app="$1" unit="${PBXPULS_SERVICE}.service"
  [[ "$PBXPULS_SERVICE" =~ ^[a-zA-Z0-9_-]+$ && "$app" != *' '* && "$PBXPULS_NODE_HOME" != *' '* && "$PM2_HOME" != *' '* ]] || return 1
  # A private PM2 home isolates this service from FreePBX's PM2 daemon.
  cat > "/etc/systemd/system/$unit" <<UNIT
[Unit]
Description=PBXPuls PM2 runtime
After=network.target mariadb.service
[Service]
Type=forking
Environment=PATH=$PBXPULS_NODE_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PM2_HOME=$PM2_HOME
PIDFile=$PM2_HOME/pm2.pid
ExecStart=$PBXPULS_NODE_HOME/bin/node $PBXPULS_NODE_HOME/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=$PBXPULS_NODE_HOME/bin/node $PBXPULS_NODE_HOME/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=$PBXPULS_NODE_HOME/bin/node $PBXPULS_NODE_HOME/lib/node_modules/pm2/bin/pm2 kill
Restart=on-failure
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable "$unit"
  systemctl start "$unit"
  systemctl is-enabled --quiet "$unit"
  systemctl is-active --quiet "$unit"
}
pbxpuls_http() {
 local port="$1" ready=0
 for _ in $(seq 1 45); do
  if curl -fs --max-time 3 "http://127.0.0.1:$port/" >/dev/null; then ready=1; break; fi
  sleep 2
 done
 [[ "$ready" == 1 ]]
}
