#!/bin/bash
set -Eeuo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export PBXPULS_INSTALL_FUNCTIONS_ONLY=1
source "$repo/install.sh"
cd "$work"
initialize_install_state
sha256sum .pbxpuls-install-state > before.sha
initialize_install_state
sha256sum -c before.sha
[[ $(stat -c %a .pbxpuls-install-state) == 600 ]]
# Preflight must reject existing unmarked directories and occupied ports before installing anything.
APP_DIR="$work/existing";mkdir "$APP_DIR"
if (preflight) >/dev/null 2>&1; then echo 'Existing installation accepted';exit 1;fi
APP_DIR="$work/new"
ss(){ printf 'LISTEN 0 10 0.0.0.0:3000 0.0.0.0:*\n'; }
if (preflight) >/dev/null 2>&1; then echo 'Occupied port accepted';exit 1;fi
unset -f ss
# An unsupported ABI is rejected before package management.
getconf(){ echo 'glibc 2.12'; }
if (preflight) >/dev/null 2>&1; then echo 'Unsupported ABI accepted';exit 1;fi
printf 'PASS installer preflight and persistent secrets across retry\n'
