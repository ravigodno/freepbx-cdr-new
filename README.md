# FreePBX CDR Panel

Панель контроля пропущенных вызовов, обработки обращений клиентов, Click-to-Call через Asterisk AMI и прослушивания записей разговоров для FreePBX / Asterisk.

---

# Возможности системы

* Контроль пропущенных вызовов.
* Автоматическое определение успешного перезвона клиенту.
* SLA-контроль времени реакции операторов.
* Статистика KPI отдела продаж.
* Прослушивание записей разговоров.
* Click-To-Call через Asterisk AMI.
* Телефонный справочник клиентов и сотрудников.
* Назначение ответственных за обработку пропущенных вызовов.
* Комментарии к звонкам.
* Разделение ролей Администратор / Оператор.

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

Проверка:

```bash
npm list vite
npm list | grep tailwind
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

Проверка CSS:

```bash
ls -lh dist/assets/*.css
```

Размер CSS обычно составляет около 30 КБ.

---

# Запуск через PM2

Запуск:

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

Выполните команду, которую предложит PM2.

После этого:

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
pm2 restart asterisk-cdr-panel
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

# Записи разговоров

Путь к записям:

```env
RECORDINGS_PATH="/var/spool/asterisk/monitor"
```

Приложение автоматически ищет записи во вложенных каталогах вида:

```text
/var/spool/asterisk/monitor/2026/06/05/
```

Проверка существования файла:

```bash
find /var/spool/asterisk/monitor -name "*.wav"
```

Проверка формата записи:

```bash
file ИМЯ_ФАЙЛА.wav
```

Ожидаемый результат:

```text
RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono 8000 Hz
```

API воспроизведения:

```text
/api/recordings/<filename>
```

Проверка:

```bash
curl -I "http://127.0.0.1:3000/api/recordings/FILE.wav"
```

Ожидаемый результат:

```text
HTTP/1.1 200 OK
Content-Type: audio/wav
```

---

# Решение проблем

## Вместо реальных звонков отображаются демо-данные

Проверьте:

```env
DEMO_MODE="false"
```

Также убедитесь, что в разделе настроек панели сохранены реальные параметры подключения к MariaDB.

При необходимости очистите LocalStorage браузера.

---

## Не воспроизводятся записи разговоров

Проверьте наличие файла:

```bash
find /var/spool/asterisk/monitor -name "ИМЯ_ФАЙЛА.wav"
```

Проверьте API:

```bash
curl -I http://127.0.0.1:3000/api/recordings/ИМЯ_ФАЙЛА.wav
```

---

## Ошибка подключения к MariaDB

Проверьте подключение:

```bash
mysql -u cdrviewer -p asteriskcdrdb
```

Проверьте права:

```sql
SHOW GRANTS FOR 'cdrviewer'@'localhost';
```

---

## Ошибка AMI Authentication failed

Проверьте:

```bash
asterisk -rx "manager show users"
```

Убедитесь, что пользователь существует и пароль совпадает с указанным в настройках панели.

---

# GitHub

Настройка Git:

```bash
git config --global credential.helper store
git config --global push.default simple

git config --global user.name "Konstantin Grunin"
git config --global user.email "ravigodno@gmail.com"
```

---

# Безопасность

Не храните в репозитории:

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
