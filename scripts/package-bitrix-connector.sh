#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('${project_root}/package.json').version")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]

source_dir="${project_root}/integrations/bitrix-pull"
output_dir="${project_root}/public/downloads"
archive_name="pbxpuls-bitrix-connector-v${version}.zip"
target="${output_dir}/${archive_name}"
[[ -d "$source_dir/local" && -f "$source_dir/README.md" ]]
[[ "$target" == "${project_root}/public/downloads/pbxpuls-bitrix-connector-v${version}.zip" ]]

package_dir="$(mktemp -d)"
[[ -n "$package_dir" && "$package_dir" == /tmp/* && -d "$package_dir" ]]
trap '[[ -n "${package_dir:-}" && "$package_dir" == /tmp/* && -d "$package_dir" ]] && rm -rf -- "${package_dir:?}"' EXIT
root_dir="${package_dir}/pbxpuls-bitrix-connector"
mkdir -p "$root_dir" "$output_dir"
cp -R "${source_dir}/local" "$root_dir/local"
cp "${source_dir}/README.md" "$root_dir/README.md"
cp "${source_dir}/pbxpuls-pull-config.example.php" "$root_dir/pbxpuls-pull-config.example.php"
cp "${source_dir}/schema.sql" "$root_dir/schema.sql"

(cd "$package_dir" && zip -X -q -r "${archive_name}" pbxpuls-bitrix-connector)
mv -f -- "${package_dir}/${archive_name}" "$target"
echo "$target"
