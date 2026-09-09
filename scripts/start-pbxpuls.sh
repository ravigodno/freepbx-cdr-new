#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
source scripts/pbxpuls-runtime.sh
pbxpuls_runtime "$PWD"
export NODE_ENV=production
npm run pbxpuls:db:setup
exec "$PBXPULS_NODE_HOME/bin/node" dist/server.cjs
