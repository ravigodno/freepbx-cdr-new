#!/bin/bash
# Real Git integration/rollback with simulated npm/PM2/database/HTTP operations.
set -Eeuo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
realnode=$(command -v node)
work=$(mktemp -d /opt/pbxpuls-update-test-XXXXXX)
cleanup(){
 status=$?
 if [[ $status != 0 ]]; then cat "$work/update.log" "$work/rollback.log" 2>/dev/null || true; fi
 if [[ -f "$work/update.log" ]]; then
  while IFS= read -r backup; do
   if [[ "$backup" == /root/pbxpuls-update-* && -f "$backup/paths" ]]; then
    (source "$backup/paths"; [[ "$stage" != /opt/pbxpuls-update-* ]] || rm -rf "$stage")
    rm -rf "$backup"
   fi
  done < <(sed -n 's/^Backup and review: //p' "$work/update.log")
 fi
 rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$work/origin/scripts" "$work/runtime/bin"
cp "$repo/scripts/pbxpuls-runtime.sh" "$work/origin/scripts/"
# Service implementation is verified separately by test-runtime-service.sh.
printf '\npbxpuls_service(){ :; }\n' >> "$work/origin/scripts/pbxpuls-runtime.sh"
printf 'base\n' > "$work/origin/display.txt"
printf 'base\n' > "$work/origin/custom.txt"
(cd "$work/origin" && git init -q && git config user.email fixture@example.invalid && git config user.name Fixture && git add . && git commit -qm base)
git clone -q "$work/origin" "$work/app"
(cd "$work/origin" && printf 'fixed\n' > display.txt && git add . && git commit -qm release && git tag v5.8.27)
printf 'fixed\n' > "$work/app/display.txt"
printf 'local customization\n' > "$work/app/custom.txt"
mkdir -p "$work/app/data" "$work/app/dist" "$work/app/node_modules/dotenv"
printf '{}\n' > "$work/app/data/db.json"
printf 'old artifact\n' > "$work/app/dist/fixture"
printf 'module.exports={config:()=>({})};\n' > "$work/app/node_modules/dotenv/index.js"
printf 'PBXPULS_DB_NAME=fixture\n' > "$work/app/.env"
cat > "$work/runtime/bin/node" <<SHNODE
#!/bin/bash
if [[ "\${2:-}" == scripts/directory-storage.ts ]]; then echo '{"activeSqlReady":true}'; exit 0; fi
exec "$realnode" "\$@"
SHNODE
cat > "$work/runtime/bin/npm" <<'MOCK'
#!/bin/bash
case "$*" in
 --version) echo 10.9.8;;
 ci*) mkdir -p node_modules/dotenv; echo 'module.exports={config:()=>({})};' > node_modules/dotenv/index.js;;
 'run pbxpuls:db:check') [[ ${PBXPULS_TEST_FAIL_CHECK:-0} != 1 ]] || exit 1;;
 'run build') mkdir -p dist; echo 'new artifact' > dist/fixture;;
esac
MOCK
cat > "$work/runtime/bin/pm2" <<'MOCK'
#!/bin/bash
if [[ "$1" == jlist ]]; then echo '[]'; fi
MOCK
printf '#!/bin/bash\nexit 0\n' > "$work/runtime/bin/curl"
printf '#!/bin/bash\necho "-- simulated dump"\n' > "$work/runtime/bin/mysqldump"
chmod +x "$work/runtime/bin/"*
cp "$repo/scripts/update-pbxpuls.sh" "$work/updater.sh"
PBXPULS_INSTALL_DIR="$work/app" PBXPULS_NODE_HOME="$work/runtime" PM2_HOME="$work/pm2" PBXPULS_SERVICE=pbxpuls-update-fixture bash "$work/updater.sh" v5.8.27 > "$work/update.log" 2>&1
[[ $(cat "$work/app/display.txt") == fixed ]]
[[ $(cat "$work/app/custom.txt") == 'local customization' ]]
[[ $(cat "$work/app/dist/fixture") == 'new artifact' ]]
backup=$(sed -n 's/^Backup and review: //p' "$work/update.log" | head -1)
bash "$backup/rollback.sh" > "$work/rollback.log" 2>&1
[[ $(cat "$work/app/display.txt") == fixed ]]
[[ $(cat "$work/app/custom.txt") == 'local customization' ]]
[[ $(cat "$work/app/dist/fixture") == 'old artifact' ]]
if PBXPULS_TEST_FAIL_CHECK=1 PBXPULS_INSTALL_DIR="$work/app" PBXPULS_NODE_HOME="$work/runtime" PM2_HOME="$work/pm2" PBXPULS_SERVICE=pbxpuls-update-fixture bash "$work/updater.sh" v5.8.27 > "$work/failed-update.log" 2>&1; then echo 'Failed check accepted'; exit 1; fi
[[ $(cat "$work/app/dist/fixture") == 'old artifact' ]]
[[ $(cat "$work/app/custom.txt") == 'local customization' ]]
# Keep the second backup available to the cleanup hook too.
cat "$work/failed-update.log" >> "$work/update.log"
printf 'PASS updater recognizes included fix, retains independent customization, restores old build and local diff (external services simulated)\n'
