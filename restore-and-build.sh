#!/bin/bash
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"
source scripts/pbxpuls-runtime.sh
pbxpuls_runtime "$PWD"
# Keep the local source diff before this legacy recovery operation replaces a file.
umask 077
saved_diff=$(mktemp /tmp/pbxpuls-restore-XXXXXX.patch)
git diff --binary HEAD -- src/components/AIPBXAdminTab.tsx > "$saved_diff"
echo "Local source backup: $saved_diff"

echo "=== $(date) Откатываю AIPBXAdminTab.tsx ==="

if [ -f src/components/AIPBXAdminTab.tsx.bak-ai-providers ]; then
  cp src/components/AIPBXAdminTab.tsx.bak-ai-providers src/components/AIPBXAdminTab.tsx
elif [ -f src/components/AIPBXAdminTab.tsx.bak-dynamic-models ]; then
  cp src/components/AIPBXAdminTab.tsx.bak-dynamic-models src/components/AIPBXAdminTab.tsx
else
  git checkout -- src/components/AIPBXAdminTab.tsx
fi

echo "=== $(date) Пересобираю ==="
npm run build

echo "=== $(date) Перезапускаю PBXPuls ==="
pm2 restart asterisk-cdr-panel --update-env
pm2 save
pbxpuls_service "$PWD"

echo "=== $(date) Проверяю порт 3000 ==="
port=$(node -e 'require("dotenv").config({quiet:true});console.log(process.env.PORT||3000)')
pbxpuls_http "$port"
npm run pbxpuls:db:check

echo "=== $(date) ГОТОВО ==="
