# Чистая установка PBXPuls

Поддерживаемые АТС:

- FreePBX 16;
- FreePBX 17;
- локальная MariaDB;
- Asterisk AMI на `127.0.0.1:5038`;
- Node.js 16 или новее.

Установщик не заменяет рабочую версию Node.js и не вмешивается в системные пакеты FreePBX. Это важно для FreePBX 16 на Sangoma Linux 7 и для FreePBX 17 на Debian 12.

## Запуск

Выполнять от `root` на уже установленной FreePBX:

```bash
curl -fsSL https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/main/install.sh | bash
```

Для установки конкретного тега:

```bash
curl -fsSL https://raw.githubusercontent.com/ravigodno/freepbx-cdr-new/v5.6.52/install.sh | PBXPULS_REF=v5.6.52 bash
```

Каталог `/opt/asterisk-cdr-panel` должен отсутствовать. Установщик специально не удаляет и не перезаписывает существующую установку.

## Что создаётся автоматически

### MariaDB

Создаётся служебный пользователь:

```text
login: pbxpuls
hosts: localhost, 127.0.0.1
```

Права:

- `pbxpuls.*` — полный доступ;
- `asterisk.*` — только чтение;
- `asteriskcdrdb.*` — только чтение.

Пароль генерируется случайно и записывается в `.env`. Пустое значение `PBXPULS_DB_PASSWORD=` из шаблона заменяется реальным паролем.

### Asterisk AMI

Создаётся локальный AMI-пользователь:

```text
login: pbxpuls
permit: 127.0.0.1/255.255.255.255
```

Конфигурация хранится в `/etc/asterisk/manager_pbxpuls.conf` и подключается через `manager_custom.conf`.

### Веб-пользователи PBXPuls

Создаются пользователи:

- `su`;
- `admin`;
- `operator`.

Для каждого генерируется отдельный случайный пароль. Пользователи, роли и права записываются сначала в `data/db.json`, затем переносятся миграциями в базу `pbxpuls`.

## Где находятся пароли

После установки отчёт с учётными данными сохраняется только для `root`:

```text
/root/pbxpuls-install-credentials.txt
```

Права файла:

```text
600
```

Секреты не выводятся в Git и не сохраняются в репозитории.

## Проверки установщика

Установка считается успешной только после проверки:

- версии FreePBX 16 или 17;
- наличия Node.js и npm;
- подключения к MariaDB;
- таблиц и миграций PBXPuls;
- пользователей и ролей в SQL;
- чтения `asteriskcdrdb` пользователем `pbxpuls`;
- авторизации AMI-пользователя `pbxpuls`;
- запуска процесса PM2;
- HTTP-ответа приложения на порту `3000`.

При ошибке установщик завершается с ненулевым кодом и показывает точный этап.

## Проверка после установки

```bash
pm2 status
ss -lntp | grep ':3000'
curl -I http://127.0.0.1:3000/
npm --prefix /opt/asterisk-cdr-panel run pbxpuls:db:check
```

Адрес панели:

```text
http://IP-АДРЕС-АТС:3000
```
