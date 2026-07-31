#!/usr/bin/env bash
set -Eeuo pipefail

# FreePBX 17 installer wrapper that uses the current official Sangoma installer,
# removes the commercial Endpoint Manager module before module upgrades,
# and then continues the normal installation process.
#
# This project is not affiliated with or endorsed by Sangoma Technologies.
# Use at your own risk and test before production deployment.

OFFICIAL_URL="https://raw.githubusercontent.com/FreePBX/sng_freepbx_debian_install/master/sng_freepbx_debian_install.sh"
WORKDIR="$(mktemp -d /tmp/freepbx17-no-endpoint.XXXXXX)"
OFFICIAL_SCRIPT="${WORKDIR}/sng_freepbx_debian_install.sh"
PATCHED_SCRIPT="${WORKDIR}/sng_freepbx_debian_install.no-endpoint.sh"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

if [[ ${EUID} -ne 0 ]]; then
  echo "Ошибка: запустите скрипт от root (su - или sudo -i)." >&2
  exit 1
fi

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

echo "Скачивание актуального официального установщика FreePBX 17..."
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 3 --connect-timeout 20 "$OFFICIAL_URL" -o "$OFFICIAL_SCRIPT"
elif command -v wget >/dev/null 2>&1; then
  wget --tries=3 --timeout=20 "$OFFICIAL_URL" -O "$OFFICIAL_SCRIPT"
else
  echo "Ошибка: требуется curl или wget." >&2
  exit 1
fi

[[ -s "$OFFICIAL_SCRIPT" ]] || {
  echo "Ошибка: официальный установщик не скачан." >&2
  exit 1
}

INSTALLLOCAL_MARKER='  fwconsole ma installlocal >> "$log"'
UPGRADE_STEP_MARKER='  setCurrentStep "Upgrading FreePBX 17 modules"'
UPGRADE_COMMAND_MARKER='  fwconsole ma upgradeall >> "$log"'

for marker in "$INSTALLLOCAL_MARKER" "$UPGRADE_STEP_MARKER" "$UPGRADE_COMMAND_MARKER"; do
  if ! grep -Fq "$marker" "$OFFICIAL_SCRIPT"; then
    echo "Ошибка: структура официального установщика изменилась." >&2
    echo "Не найден ожидаемый фрагмент: $marker" >&2
    echo "Скрипт остановлен, чтобы не применить некорректное изменение." >&2
    exit 1
  fi
done

awk '
{
  print
  if ($0 == "  fwconsole ma installlocal >> \"$log\"") {
    print ""
    print "  setCurrentStep \"Removing Endpoint Manager module\""
    print "  fwconsole ma -f remove endpoint >> \"$log\" 2>&1 || true"
    print "  rm -rf /var/www/html/admin/modules/endpoint"
  }
}
' "$OFFICIAL_SCRIPT" > "$PATCHED_SCRIPT"

chmod 700 "$PATCHED_SCRIPT"

if [[ $(grep -Fc 'setCurrentStep "Removing Endpoint Manager module"' "$PATCHED_SCRIPT") -ne 1 ]]; then
  echo "Ошибка: изменение установщика не прошло проверку." >&2
  exit 1
fi

if ! grep -Fq 'fwconsole ma upgradeall >> "$log"' "$PATCHED_SCRIPT"; then
  echo "Ошибка: команда обновления остальных модулей неожиданно отсутствует." >&2
  exit 1
fi

echo "Endpoint Manager будет удалён после установки локальных модулей."
echo "Остальные этапы выполнит актуальный официальный установщик Sangoma."
echo "Рабочая копия: $PATCHED_SCRIPT"

# The official script detects that it has been modified, therefore its own
# version/checksum comparison must be skipped. All other user arguments remain.
exec bash "$PATCHED_SCRIPT" --skipversion "$@"
