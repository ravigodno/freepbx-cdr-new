# Инструкция по установке и настройке приложения (Asterisk CDR Panel)

Данная директория содержит вспомогательные файлы-шаблоны и конфигурационные примеры для быстрого развертывания панели пропущенных вызовов в связке с АТС Asterisk / FreePBX.

## Состав файлов для развертывания:

1. **`asterisk_cdr_schema.sql`** — Традиционная схема таблицы CDR в базе данных Asterisk. Используйте её, если вы разворачиваете чистую базу данных с нуля (например, для тестирования или интеграции с кастомным Asterisk без FreePBX).
2. **`manager_custom.conf`** — Шаблон для конфигурации Asterisk Manager Interface (`manager.conf`), необходимый для работы функции звонка в один клик (Click-To-Call).
3. **`nginx_pbl.conf`** — Пример конфигурации веб-сервера Nginx для проксирования Node.js бэкенда и раздачи записей разговоров напрямую с диска АТС.

---

## Пошаговый план внедрения для Системного Администратора:

### Шаг 1: Конфигурация СУБД Asterisk (MySQL/MariaDB)

Для работы приложения требуется безопасный доступ на чтение (SELECT) к таблице с логами звонков. 

Выполните команды в консоли MySQL на сервере АТС:
```sql
-- Подключение к консоли СУБД
mysql -u root -p

-- Создание пользователя с паролем
CREATE USER 'asterisk_cdr_ro'@'%' IDENTIFIED BY 'your_secure_password_here';

-- Предоставление прав на чтение таблицы логов CDR базы данных asteriskcdrdb
GRANT SELECT ON asteriskcdrdb.cdr TO 'asterisk_cdr_ro'@'%';

-- Применение изменений
FLUSH PRIVILEGES;
EXIT;
```

*Примечание:* Обязательно замените `'%'` на конкретный локальный IP-адрес хоста, на котором будет запущено приложение панели пропущенных вызовов, для максимальной безопасности.

---

### Шаг 2: Настройка Asterisk AMI (Click-To-Call)

Для инициации обратного звонка из интерфейса (Click-To-Call) приложение подключается к Asterisk Manager Interface.

1. Откройте файл конфигурации `/etc/asterisk/manager.conf` или `/etc/asterisk/manager_custom.conf`.
2. Добавьте в конец файла блок из прилагаемого шаблона `manager_custom.conf`:
   ```ini
   [clicktocall]
   secret = your_secure_ami_password_here
   deny = 0.0.0.0/0.0.0.0
   permit = 127.0.0.1/255.255.255.255 ; Укажите здесь IP сервера панели, если они на разных хостах
   read = system,call,user
   write = system,call,originate
   ```
3. Перезагрузите модуль менеджмента в консоли Asterisk:
   ```bash
   asterisk -rx "manager reload"
   ```

---

### Шаг 3: Настройка прослушивания записей (Nginx)

Для проигрывания аудиозаписей звонков в браузере настройте Nginx на раздачу папки файлов мониторинга (по умолчанию `/var/spool/asterisk/monitor/`).

Скопируйте директивы из файла `nginx_pbl.conf` в конфигурационный файл вашего Nginx. Например, в `/etc/nginx/sites-available/asterisk-cdr-panel`:

```nginx
server {
    listen 80;
    server_name cdr-panel.yourdomain.local;

    # Проксирование запросов к API и веб-интерфейсу Node.js приложения
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Прямая раздача записей операторов
    location /asterisk-monitor/ {
        alias /var/spool/asterisk/monitor/;
        autoindex off;
        
        # Добавление CORS заголовков для безопасной раздачи аудио в браузер
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        
        # Разрешено скачивание и воспроизведение только из локальной сети
        allow 192.168.0.0/16;
        allow 10.0.0.0/8;
        deny all;
    }
}
```

Не забудьте перезапустить Nginx:
```bash
nginx -t && systemctl restart nginx
```

---

### Шаг 4: Запуск приложения на сервере через PM2

Приложение разработано для промышленной эксплуатации с использованием Node.js-сервера в связке с диспетчером процессов PM2.

```bash
# Перейдите в каталог приложения
cd /opt/asterisk-cdr-panel

# Скопируйте и заполните переменные окружения
cp .env.example .env

# Установите зависимости
npm install

# Скомпилируйте приложение
npm run build

# Запустите процесс в фоне через PM2
npm install -g pm2
NODE_ENV=production pm2 start dist/server.cjs --name "asterisk-cdr"

# Настройте автозапуск приложения при ребуте операционной системы
pm2 save
pm2 startup
```

Панель успешно настроена и готова к приему звонков из БД в режиме реального времени!
