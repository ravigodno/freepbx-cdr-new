#!/bin/bash
# Explicitly opt-in: dedicated PM2 home + temporary systemd unit; never FreePBX services.
set -Eeuo pipefail
[[ ${PBXPULS_ISOLATED_SYSTEMD_TEST:-0} == 1 && $EUID == 0 ]] || exit 1
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d /opt/pbxpuls-service-test-XXXXXX)
export PBXPULS_NODE_HOME=${PBXPULS_TEST_NODE_HOME:?} PM2_HOME="$work/pm2" PBXPULS_SERVICE="pbxpuls-release-test-$$"
source "$repo/scripts/pbxpuls-runtime.sh"
pbxpuls_runtime "$work"
cleanup(){ systemctl stop "$PBXPULS_SERVICE" >/dev/null 2>&1 || true; systemctl disable "$PBXPULS_SERVICE" >/dev/null 2>&1 || true; pm2 kill >/dev/null 2>&1 || true; rm -f "/etc/systemd/system/$PBXPULS_SERVICE.service"; systemctl daemon-reload; rm -rf "$work"; }
trap cleanup EXIT
cat > "$work/server.cjs" <<'JS'
require('http').createServer((req,res)=>res.end(process.version)).listen(0,'127.0.0.1',function(){require('fs').writeFileSync(__dirname+'/port',String(this.address().port))});
JS
pbxpuls_save_runtime "$work"
pm2 start "$work/server.cjs" --name pbxpuls-test --interpreter "$PBXPULS_NODE_HOME/bin/node" >/dev/null
pm2 save >/dev/null
pbxpuls_service "$work"
for cycle in 1 2; do
 systemctl restart "$PBXPULS_SERVICE"
 systemctl is-active --quiet "$PBXPULS_SERVICE"
 for _ in $(seq 1 30); do [[ -s "$work/port" ]] && curl -fs "http://127.0.0.1:$(cat "$work/port")/" > "$work/http" && break; sleep 1; done
 grep -q '^v22\.' "$work/http"
 pm2 jlist > "$work/processes"
 node - "$work/processes" <<'JS'
const p=JSON.parse(require('fs').readFileSync(process.argv[2]));if(p.length!==1||p[0].pm2_env.status!=='online'||!p[0].pm2_env.exec_interpreter.includes('node-v22'))process.exit(1);
JS
done
echo 'PASS isolated systemd enabled/active, two service restarts, single PM2 process, dedicated Node and HTTP'
