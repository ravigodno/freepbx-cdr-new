# Установка FreePBX 17 без Endpoint Manager

Этот wrapper использует актуальный официальный установщик Sangoma для Debian 12, но после `fwconsole ma installlocal` удаляет коммерческий модуль `endpoint` до запуска общего обновления модулей.

Это решает случай, когда установка останавливается на сообщении:

```text
Upgrading module 'endpoint' ...
Checking Settings and Defaults...
```

## Быстрый запуск

```bash
su -
cd /tmp
wget https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/main/scripts/install-freepbx17-no-endpoint.sh -O install-freepbx17-no-endpoint.sh
chmod +x install-freepbx17-no-endpoint.sh
bash install-freepbx17-no-endpoint.sh
```

До слияния ветки используйте адрес ветки:

```bash
su -
cd /tmp
wget https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/agent/freepbx17-installer-no-endpoint/scripts/install-freepbx17-no-endpoint.sh -O install-freepbx17-no-endpoint.sh
chmod +x install-freepbx17-no-endpoint.sh
bash install-freepbx17-no-endpoint.sh
```

## Что делает wrapper

1. Проверяет запуск от `root`.
2. Устанавливает полный системный `PATH`, включая `/usr/sbin`.
3. Скачивает свежий официальный `sng_freepbx_debian_install.sh`.
4. Проверяет, что структура официального скрипта соответствует ожидаемой.
5. После установки локальных модулей выполняет:

```bash
fwconsole ma -f remove endpoint
rm -rf /var/www/html/admin/modules/endpoint
```

6. Продолжает штатный `fwconsole ma upgradeall`, перезагрузку FreePBX и завершающие проверки.

Если официальный установщик изменит нужный участок, wrapper завершится с ошибкой вместо применения потенциально опасного патча.

## Поддерживаемая система

- Debian 12 Bookworm
- FreePBX 17
- запуск от `root`

## Важное предупреждение

Это неофициальный wrapper, не связанный с Sangoma Technologies. Он подходит для систем, где коммерческий Endpoint Manager не используется. Перед применением на рабочей АТС сделайте резервную копию.
