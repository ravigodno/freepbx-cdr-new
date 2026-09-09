#!/usr/bin/env bash
set -Eeuo pipefail
# Pinned published release: unofficial-builds has no latest-v22.x alias.
version=v22.23.2
variant=linux-x64
base=https://nodejs.org/dist
[[ $(uname -m) == x86_64 ]] || { echo 'Only x86_64 runtime is supported'; exit 1; }
glibc=$(getconf GNU_LIBC_VERSION | awk '{print $2}')
if [[ $(printf '%s\n' 2.28 "$glibc" | sort -V | head -1) != 2.28 ]]; then
 [[ "$glibc" == 2.17 ]] || { echo 'Unsupported glibc'; exit 1; }
 variant=linux-x64-glibc-217
 base=https://unofficial-builds.nodejs.org/download/release
 echo 'Using experimental community Node.js glibc-217 build: no official Node.js platform support; see docs/sangoma-installation.md.' >&2
fi
runtime="${PBXPULS_NODE_HOME:-/opt/pbxpuls-runtime/node-$version-$variant}"
if [[ ! -x "$runtime/bin/node" ]]; then
 [[ ! -e "$runtime" ]] || { echo 'Incomplete runtime exists; inspect it before retry'; exit 1; }
 mkdir -p "$(dirname "$runtime")"
 tmp=$(mktemp -d "$(dirname "$runtime")/.download-XXXXXX")
 trap 'rm -rf "$tmp"' EXIT
 archive="node-$version-$variant.tar.xz"
 curl -fSL --connect-timeout 10 --max-time 180 "$base/$version/$archive" -o "$tmp/$archive"
 curl -fsSL --connect-timeout 10 --max-time 30 "$base/$version/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
 (cd "$tmp" && grep " $archive\$" SHASUMS256.txt | sha256sum -c -)
 tar -xJf "$tmp/$archive" -C "$tmp"
 "$tmp/node-$version-$variant/bin/node" --version
 mv "$tmp/node-$version-$variant" "$runtime"
fi
export PATH="$runtime/bin:$PATH"
"$runtime/bin/node" --version
"$runtime/bin/npm" --version
printf '%s\n' "$runtime" > "${PBXPULS_RUNTIME_RESULT:?}"
