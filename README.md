# FreePBX CDR Panel

Панель контроля пропущенных вызовов, обработки обращений клиентов, Click-to-Call через Asterisk AMI и прослушивания записей разговоров для FreePBX / Asterisk.

---

# Возможности системы

* Контроль пропущенных вызовов.
* Автоматическое определение успешного перезвона клиенту.
* SLA-контроль времени реакции операторов.
* Статистика KPI отдела продаж.
* Прослушивание записей разговоров.
* Скачать запись разговора одним кликом.
* Click-To-Call через Asterisk AMI.
* Телефонный справочник клиентов и сотрудников.
* Назначение ответственных за обработку пропущенных вызовов.
* Комментарии к звонкам.
* Разделение ролей Администратор / Оператор.
* Группировка CDR-записей по linkedid.
* Корректная обработка очередей FreePBX.
* Корректная обработка Ring Groups.
* Корректная обработка IVR.
* Отображени������ внутренних номеров, которые пропустили вызов.
* Отображение внутреннего номера, ответившего на вызов.
* Встроенный аудиоплеер записей разговоров.
* Автоматическое определение обработанных и потерянных вызовов по KPI.

---

# Проверенная конфигурация

Система успешно протестирована на:

* FreePBX 16
* FreePBX 17
* Asterisk 18+
* Sangoma Linux 7
* MariaDB
* Node.js 16.20.2
* npm 8.19.4
* PM2

---

# Установка

## Клонирование проекта

```bash
git clone https://github.com/ravigodno/freepbx-cdr-new.git /opt/asterisk-cdr-panel

cd /opt/asterisk-cdr-panel
```

---

## Настройка файла окружения

Создайте рабочий файл настроек:

```bash
cp .env.example .env
```

Отредактируйте:

```bash
nano .env
```

Пример рабочей конфигурации:

```env
FREEPBX_DB_HOST="localhost"
FREEPBX_DB_PORT="3306"
FREEPBX_DB_NAME="asteriskcdrdb"
FREEPBX_DB_USER="cdrviewer"
FREEPBX_DB_PASSWORD="YOUR_PASSWORD"

RECORDINGS_PATH="/var/spool/asterisk/monitor"
RECORDINGS_URL_PREFIX=""

DEMO_MODE="false"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin"

OPERATOR_USERNAME="operator"
OPERATOR_PASSWORD="operator"

ASTERISK_AMI_HOST="127.0.0.1"
ASTERISK_AMI_PORT="5038"
ASTERISK_AMI_USER="999"
ASTERISK_AMI_PASSWORD="YOUR_AMI_PASSWORD"
ASTERISK_AMI_CONTEXT="from-internal"

PORT="3000"
```

---

# Настройка MariaDB

Войдите в MariaDB:

```bash
mysql -u root
```

Создайте пользователя только для чтения:

```sql
CREATE USER IF NOT EXISTS 'cdrviewer'@'localhost'
IDENTIFIED BY 'YOUR_PASSWORD';

GRANT SELECT ON asteriskcdrdb.* TO 'cdrviewer'@'localhost';
GRANT SELECT ON asterisk.* TO 'cdrviewer'@'localhost';

FLUSH PRIVILEGES;
```

Проверка подключения:

```bash
mysql -u cdrviewer -p asteriskcdrdb
```

---

# Настройка Asterisk AMI

Создайте пользователя AMI:

```bash
nano /etc/asterisk/manager_custom.conf
```

Пример:

```ini
[999]
secret = YOUR_AMI_PASSWORD

deny = 0.0.0.0/0.0.0.0

permit = 127.0.0.1/255.255.255.255
permit = 192.168.1.7/255.255.255.255

read = all
write = all
```

Примените настройки:

```bash
asterisk -rx "manager reload"
```

Проверка:

```bash
printf "Action: Login\r\nUsername: 999\r\nSecret: YOUR_AMI_PASSWORD\r\n\r\n" | nc 127.0.0.1 5038
```

Ожидаемый результат:

```text
Response: Success
Message: Authentication accepted
```

---

# Установка зависимостей

```bash
npm install --legacy-peer-deps
```

Проверенные версии:

```text
vite 4.5.14
tailwindcss 3.4.19
```

---

# Сборка проекта

```bash
npm run build
```

После успешной сборки должны появиться файлы:

```bash
dist/index.html
dist/assets/*.js
dist/assets/*.css
```

---

# Запуск через PM2

```bash
NODE_ENV=production pm2 start npm --name "asterisk-cdr-panel" -- start
```

Сохранение конфигурации:

```bash
pm2 save
```

Настройка автозапуска:

```bash
pm2 startup
```

После выполнения команды:

```bash
pm2 save
```

---

# Управление приложением

Статус:

```bash
pm2 status
```

Просмотр логов:

```bash
pm2 logs asterisk-cdr-panel
```

Перезапуск:

```bash
pm2 restart asterisk-cdr-panel --update-env
```

Остановка:

```bash
pm2 stop asterisk-cdr-panel
```

Удаление процесса:

```bash
pm2 delete asterisk-cdr-panel
```

---

# Обновление приложения

```bash
cd /opt/asterisk-cdr-panel

git pull

npm install --legacy-peer-deps

npm run build

pm2 restart asterisk-cdr-panel --update-env
```

---

# Логика обработки вызовов

## Очереди

Вместо нескольких строк CDR отображается один логический вызов:

```text
Куда звонил: Очередь 9990
DID: 841282 → пропустили: 100, 200
```

или

```text
Куда звонил: Очередь 9990
DID: 841282 → ответил: 200
```

---

## Группы вызова

```text
Куда звонил: Группа 9999
DID: 841282 → ответил: 200
```

---

## IVR

Если абонент сбросил вызов внутри IVR и не дошёл до оператора:

```text
IVR 1
Статус: Пропущен
```

FreePBX обычно сохраняет такие звонки как:

```text
dst=s
dcontext=ivr-1
```

Панель автоматически преобразует их в читаемый вид.

---

# KPI и статистика

## Обработанные

Обработанные = есть отзвон или вручную отмечен обработанным, даже если SLA превышен.

## Потерянные

Потерянные = пропущенные + SLA уже истёк + нет отзвона + не обработан вручную.

---

# Записи разговоров

Путь:

```env
RECORDINGS_PATH="/var/spool/asterisk/monitor"
```

Поддерживаются вложенные каталоги:

```text
/var/spool/asterisk/monitor/2026/06/05/
```

Для очередей и групп вызова запись разговоров должна быть включена в настройках FreePBX.

Если запись не включена:

```text
recordingfile = NULL
```

Кнопка воспроизведения отображаться не будет.

Проверка:

```bash
find /var/spool/asterisk/monitor -name "*.wav"
```

---

# Решение проблем

## Отображаются демо-данные

Проверьте:

```env
DEMO_MODE="false"
```

Очистите LocalStorage браузера.

---

## Не воспроизводятся записи

Проверьте:

```bash
find /var/spool/asterisk/monitor -name "*.wav"
```

Проверьте API:

```bash
curl -I http://127.0.0.1:3000/api/recordings/FILE.wav
```

---

## Ошибка подключения к MariaDB

```bash
mysql -u cdrviewer -p asteriskcdrdb
```

---

## Ошибка AMI Authentication failed

Проверьте:

```bash
asterisk -rx "manager show users"
```

---

# GitHub

Настройка Git:

```bash
git config --global credential.helper store
git config --global push.default simple

git config --global user.name "YOUR_NAME"
git config --global user.email "YOUR_EMAIL"
```

---

# Безопасность

Не храните в репозит��ри��:

```text
.env
node_modules/
dist/
data/
```

Они должны быть перечислены в `.gitignore`.

---

# Репозиторий проекта

https://github.com/ravigodno/freepbx-cdr-new

---

© 2026 Freepbx CDR-NEW
Грунин К.В. ИНН 9102057404
https://grunin.org
