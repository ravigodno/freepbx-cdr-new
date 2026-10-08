#!/usr/bin/env bash
# Preview by default. Apply only on the PBX whose dialplan should be changed.
set -Eeuo pipefail
mode="${1:---preview}"
[[ "$mode" == --preview || "$mode" == --apply ]] || { echo 'Usage: bash scripts/enable-conferences.sh [--preview|--apply]'; exit 1; }
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd)
template="$root/setup/pbxpuls_conference.conf"
target=/etc/asterisk/extensions_custom.conf
contexts=(pbxpuls-conference pbxpuls-conference-initiator pbxpuls-conference-participant)
[[ -f "$template" && -f "$target" ]] || { echo 'Conference template or extensions_custom.conf missing'; exit 1; }
command -v asterisk >/dev/null
asterisk -rx 'core show application ConfBridge' | grep -q 'ConfBridge(conference' || { echo 'ConfBridge unavailable'; exit 1; }
ready=0
for context in "${contexts[@]}"; do
  grep -Fxq "[$context]" "$template" || { echo "Template missing $context"; exit 1; }
  output=$(asterisk -rx "dialplan show $context")
  if grep -q 'ConfBridge(' <<< "$output" && grep -Fq "'$context'" <<< "$output"; then ready=$((ready+1)); fi
done
if [[ $ready == 3 ]]; then echo 'All conference contexts already loaded; no changes'; exit 0; fi
# Do not overwrite partial/manual installations or duplicate unloaded sections.
if [[ $ready != 0 ]] || grep -Eq '^\[pbxpuls-conference(-initiator|-participant)?\]' "$target"; then
  echo 'Partial conference configuration detected; review existing contexts before applying'; exit 1
fi
echo "Will back up $target and $template, append the three conference contexts and reload dialplan only."
[[ "$mode" == --apply ]] || exit 0
backup=$(mktemp -d /root/pbxpuls-conference-backup-XXXXXX)
chmod 700 "$backup"
cp -a "$target" "$backup/extensions_custom.conf"
cp -a "$template" "$backup/pbxpuls_conference.conf"
cmp -s "$target" "$backup/extensions_custom.conf"
echo "Backup: $backup"
rollback() {
  trap - ERR
  cp -a "$backup/extensions_custom.conf" "$target"
  asterisk -rx 'dialplan reload'
  echo "Conference setup failed; original configuration restored from $backup" >&2
  exit 1
}
trap rollback ERR
printf '\n; BEGIN PBXPuls dynamic conferences\n' >> "$target"
cat "$template" >> "$target"
printf '\n; END PBXPuls dynamic conferences\n' >> "$target"
asterisk -rx 'dialplan reload'
for context in "${contexts[@]}"; do
  output=$(asterisk -rx "dialplan show $context")
  grep -Fq "'$context'" <<< "$output"
  grep -q 'ConfBridge(' <<< "$output"
done
trap - ERR
echo "Conference contexts enabled. Backup: $backup"
