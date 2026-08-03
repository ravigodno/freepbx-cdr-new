#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."
export NODE_ENV=production

npm run pbxpuls:db:setup
exec node dist/server.cjs
