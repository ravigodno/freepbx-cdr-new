#!/bin/bash
set -e

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

echo "=== $(date) Проверяю порт 3000 ==="
curl -I --max-time 5 http://127.0.0.1:3000/

echo "=== $(date) ГОТОВО ==="
