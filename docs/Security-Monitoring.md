# PBXPuls Security Monitoring

## Возможности

Security Center — read-only центр мониторинга сервера PBXPuls, FreePBX и Asterisk. Первый вертикальный срез показывает состояние Firewall, Fail2Ban, listening sockets, systemd-служб, базовые проверки конфигурации, нормализованные события журналов, SIP-сводку, SQL whitelist, правила уведомлений и состояние collector.

Модуль не изменяет Asterisk, FreePBX, Firewall или Fail2Ban автоматически. Ручные Fail2Ban API защищены отдельным разрешением, подтверждением и серверной настройкой `security.fail2ban_actions_enabled`, которая по умолчанию выключена.

## Архитектура

- `server/security/executor.ts` — ограниченный `execFile` executor без shell-интерполяции.
- `server/security/parsers.ts` — парсеры `ss`, iptables, nftables, Fail2Ban и журналов.
- `server/security/collectors.ts` — read-only OS collectors и независимые проверки.
- `server/security/storage.ts` — SQL storage, fingerprint aggregation и retention.
- `server/security/service.ts` — TTL cache, lock и фоновый collector.
- `server/security/router.ts` — API с RBAC и структурированными ошибками.
- `SecurityTab.tsx` — интерфейс раздела «Мониторинг → Безопасность».

## Источники данных

Поддерживаются локальные `ss`, nftables, iptables, firewalld, ufw, Fail2Ban, systemd и стандартные журналы Debian/RHEL: `auth.log`, `secure`, `fail2ban.log`, Asterisk security/full, Nginx и Apache. Источники обнаруживаются, отсутствие файла или команды не ломает модуль.

GeoIP архитектурно предусмотрен, но IP никогда не отправляются внешним сервисам. Без локальной MaxMind-базы возвращается `not_available`.

## SQL

Используется только база `pbxpuls`: `security_events`, `security_event_sources`, `security_ip_whitelist`, `security_sip_registration_history`, `security_check_results`, `security_file_baselines`, `security_file_changes`, `security_alert_rules`, `security_alert_history`, `security_scan_runs`.

События агрегируются по SHA-256 fingerprint. Хранятся счетчик, первое и последнее появление. Retention по умолчанию — 30 дней, удаление выполняется ограниченными пакетами.

## Настройки

Настройки имеют префикс `security.`. Безопасные defaults создаются миграцией. `security.fail2ban_actions_enabled=false` нельзя включить через Security UI первой версии. File integrity также выключен до явного включения.

## Права

`view_security`, `view_security_events`, `view_firewall`, `view_fail2ban`, `manage_fail2ban`, `manage_security_whitelist`, `view_security_config_audit`, `manage_security_settings`, `export_security_report`. Полный набор получает `su` и `admin`; остальные роли автоматически не расширяются.

## API

Реализованы `/api/security/status`, `/overview`, `/events`, `/events/:id`, `/firewall/status`, `/firewall/rules`, `/ports`, `/fail2ban/status`, `/fail2ban/jails`, `/fail2ban/jails/:jail`, guarded `/fail2ban/ban`, `/fail2ban/unban`, whitelist CRUD, `/sip/summary`, `/sip/registrations`, `/checks`, `/checks/run`, `/services`, `/file-changes`, `/alerts`, `/alerts/:id`, `/settings`.

## Безопасность данных

Токены, Authorization, cookies, passwords, SIP secrets, API keys и private keys маскируются. `.env` не читается collector и его содержимое не возвращается. Raw excerpt ограничен настройкой. Пользователь не может передать команду или путь в executor.

## Требования ОС и диагностика

Модуль рассчитан на Debian 12 и RHEL/CentOS-подобные системы. Для полного результата процессу нужны read-only права на выбранные журналы и команды Firewall/Fail2Ban status. При нехватке прав возвращаются `unknown`, `not_available` или `permission_denied`.

`GET /api/security/status` показывает collector, последние успешные задачи, ошибки, OS, инструменты, Firewall и feature flags.

## Почему PBXPuls не изменяет Firewall автоматически

Ошибка в Firewall на рабочей АТС может оборвать SIP/RTP, AMI, SSH и web-доступ. Разные дистрибутивы одновременно используют FreePBX Firewall, nftables, iptables, firewalld или ufw, поэтому автоматическое исправление небезопасно. PBXPuls только собирает evidence, оценивает риск и дает рекомендацию. Решение об изменении правил остается у администратора.

## Ограничения первого вертикального среза

Нет внешнего сканирования, онлайн-GeoIP, автоматического Firewall remediation, редактирования Fail2Ban config, автоматического ban, masked config diff, полноценной international-call anomaly модели и Telegram/email/webhook отправки. File integrity таблицы и UI подготовлены, но collector выключен по умолчанию.
