#!/usr/bin/env bash
# Run a downloaded copy of this file: the checked-out script can change during update.
set -Eeuo pipefail
umask 077
app="${PBXPULS_INSTALL_DIR:-/opt/asterisk-cdr-panel}"
ref="${1:-v5.8.27}"
[[ $EUID == 0 && "$ref" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Run as root with an explicit release tag'; exit 1; }
cd "$app"
git rev-parse --show-toplevel >/dev/null
backup=$(mktemp -d /root/pbxpuls-update-XXXXXX)
echo "Backup and review: $backup"
git rev-parse HEAD > "$backup/previous-commit"
git diff --binary HEAD > "$backup/local.patch"
git diff --cached --binary > "$backup/index.patch"
cp -p .env "$backup/env"
[[ ! -f .pbxpuls-runtime ]] || cp -p .pbxpuls-runtime "$backup/runtime"
git fetch origin "refs/tags/$ref:refs/tags/$ref"
stage=$(mktemp -d /opt/pbxpuls-update-XXXXXX)
rmdir "$stage"
git clone --shared --no-checkout "$app" "$stage"
(cd "$stage" && git checkout --detach "$ref")
# Integrate each local file; recognize an already incorporated fix before trying a merge.
while IFS= read -r file; do
 [[ -n "$file" ]] || continue
 git diff --binary HEAD -- "$file" > "$backup/file.patch"
 if (cd "$stage" && git apply --check "$backup/file.patch" 2>/dev/null); then
   (cd "$stage" && git apply "$backup/file.patch")
 elif (cd "$stage" && git apply --reverse --check "$backup/file.patch" 2>/dev/null); then :
 else
   (cd "$stage" && git apply --3way "$backup/file.patch") || { echo "Local changes conflict. Resolve in $stage; running installation unchanged."; exit 1; }
 fi
done < <(git diff --name-only HEAD)
(cd "$stage" && git add -A && git diff --binary HEAD > "$backup/integrated.patch")
source "$stage/scripts/pbxpuls-runtime.sh"
# Existing installations without a manifest use their existing root PM2 home.
if [[ ! -f "$app/.pbxpuls-runtime" ]]; then export PM2_HOME="${PM2_HOME:-/root/.pm2}" PBXPULS_SERVICE="${PBXPULS_SERVICE:-pm2-root}"; fi
pbxpuls_runtime "$app"
[[ -x "$PBXPULS_NODE_HOME/bin/pm2" ]] || npm install -g pm2@7.0.3
pm2 jlist > "$backup/pm2.json"
[[ ! -f "/etc/systemd/system/$PBXPULS_SERVICE.service" ]] || cp -p "/etc/systemd/system/$PBXPULS_SERVICE.service" "$backup/service-unit"
node - "$backup/pm2.json" <<'JS'
const list=JSON.parse(require('fs').readFileSync(process.argv[2]));
if(list.some(p=>p.name!=='asterisk-cdr-panel'))throw Error('This PM2 home manages other apps; use a separate reviewed migration');
JS
(cd "$stage" && npm ci --no-audit --no-fund --fetch-timeout=30000 && npm run lint && npm run build)
[[ ! -f public/pbxpuls-ca.crt ]] || cp -p public/pbxpuls-ca.crt "$stage/dist/"
# No installation bootstrap, FreePBX reload or system package upgrade.
cp -p "$stage/scripts/pbxpuls-runtime.sh" "$backup/runtime-functions.sh"
cp -p "$0" "$backup/update-script.sh"
cp -a dist "$backup/dist"
node - "$backup" <<'JS'
const fs=require('fs'),cp=require('child_process');require('dotenv').config({quiet:true});
const db=process.env.PBXPULS_DB_NAME||'pbxpuls';if(!/^[\w-]+$/.test(db))throw Error('Invalid DB name');
const fd=fs.openSync(process.argv[2]+'/database.sql','wx',0o600);
const r=cp.spawnSync('mysqldump',['--single-transaction','--routines','--triggers','--events','-h',process.env.PBXPULS_DB_HOST||'127.0.0.1','-P',process.env.PBXPULS_DB_PORT||'3306','-u',process.env.PBXPULS_DB_USER||'pbxpuls',db],{env:{...process.env,MYSQL_PWD:process.env.PBXPULS_DB_PASSWORD||process.env.PBXPULS_DB_PASS||''},stdio:['ignore',fd,'inherit']});fs.closeSync(fd);if(r.status!==0)process.exit(1);
JS
tar -czf "$backup/legacy-data.tar.gz" data
# Store a self-contained application rollback. Additive DB migrations are retained.
printf 'app=%q\nbackup=%q\nstage=%q\nnodehome=%q\npmhome=%q\n' "$app" "$backup" "$stage" "$PBXPULS_NODE_HOME" "$PM2_HOME" > "$backup/paths"
printf 'service=%q\n' "$PBXPULS_SERVICE" >> "$backup/paths"
cat > "$backup/rollback.sh" <<'ROLLBACK'
#!/bin/bash
set -Eeuo pipefail
source "$(dirname "$0")/paths"
export PATH="$nodehome/bin:$PATH" PM2_HOME="$pmhome"
cd "$app"
pm2 stop asterisk-cdr-panel || true
git diff --binary HEAD > "$backup/failed-version.patch"
# Local differences have durable copies in local.patch and integrated.patch.
git diff --name-only HEAD | while IFS= read -r file; do git checkout HEAD -- "$file"; done
git checkout --detach "$(cat "$backup/previous-commit")"
if [[ -s "$backup/local.patch" ]]; then git apply "$backup/local.patch"; fi
if [[ -d "$backup/node_modules" ]]; then if [[ -d node_modules ]]; then mv node_modules "$stage/failed-node_modules"; fi; mv "$backup/node_modules" node_modules; fi
if [[ -d dist ]]; then mv dist "$stage/failed-dist"; fi
cp -a "$backup/dist" dist
cp -p "$backup/env" .env
if [[ -f "$backup/runtime" ]]; then cp -p "$backup/runtime" .pbxpuls-runtime; else rm -f .pbxpuls-runtime; fi
pm2 delete asterisk-cdr-panel || true
# Restore the original process definition (without starting a second PM2 home).
node - "$backup/pm2.json" "$backup/restore.json" <<'JS'
const fs=require('fs');const list=JSON.parse(fs.readFileSync(process.argv[2]));fs.writeFileSync(process.argv[3],JSON.stringify({apps:list.map(p=>({...p.pm2_env,name:p.name,script:p.pm2_env.pm_exec_path,cwd:p.pm2_env.pm_cwd}))}),{mode:0o600});
JS
pm2 start "$backup/restore.json"
pm2 save
if [[ -f "$backup/service-unit" ]]; then cp -p "$backup/service-unit" "/etc/systemd/system/$service.service"; systemctl daemon-reload; fi
echo 'Application restored; database not overwritten. See release rollback notes.'
ROLLBACK
chmod 700 "$backup/rollback.sh"
echo "Rollback: bash $backup/rollback.sh"
# Stop PBXPuls only; use a DB preview after stop so no concurrent imports change it.
pm2 stop asterisk-cdr-panel
rollback_on_error() { trap - ERR; echo 'Update failed; restoring application'; bash "$backup/rollback.sh"; exit 1; }
trap rollback_on_error ERR
# Stash is retained for additional recovery; no git reset --hard.
if [[ -s "$backup/local.patch" ]]; then git stash save "PBXPuls update backup $backup"; fi
git checkout --detach "$ref"
[[ ! -s "$backup/integrated.patch" ]] || git apply "$backup/integrated.patch"
mv node_modules "$backup/node_modules"
mv "$stage/node_modules" node_modules
mv dist "$backup/dist-at-switch"
mv "$stage/dist" dist
pbxpuls_save_runtime "$app"
npm run pbxpuls:db:setup
if ! node node_modules/tsx/dist/cli.mjs scripts/directory-storage.ts --verify-active > "$backup/directory-active.json"; then
node node_modules/tsx/dist/cli.mjs scripts/directory-storage.ts > "$backup/directory-preview.json"
expected=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).digest)' "$backup/directory-preview.json")
PBXPULS_MAINTENANCE=1 node node_modules/tsx/dist/cli.mjs scripts/directory-storage.ts --apply --expect "$expected"
fi
pm2 delete asterisk-cdr-panel
pm2 start scripts/start-pbxpuls.sh --name asterisk-cdr-panel --interpreter bash --cwd "$app"
pm2 save
pbxpuls_service "$app"
port=$(node -e 'require("dotenv").config({quiet:true});console.log(process.env.PORT||3000)')
pbxpuls_http "$port"
npm run pbxpuls:db:check
trap - ERR
echo "Updated to $ref. Backup: $backup"
