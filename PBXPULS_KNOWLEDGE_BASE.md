# PBXPULS_KNOWLEDGE_BASE

## Проверенные особенности

### FreePBX REST

-   /extensions -\> 404 на текущей системе.
-   /core/users -\> основной источник extension/name.
-   /userman/extensions -\> только username/usermanId.

### GraphQL

Использовать существующие запросы из: /opt/freepbx-api-dashboard

### Bulk Handler

Эталон структуры данных для Extensions.

### OAuth

client_credentials application/x-www-form-urlencoded

### Правила

-   Не использовать description как имя.
-   Не использовать id как extension.
-   Secrets всегда маскировать.

## Разработка

Перед добавлением новой логики: 1. Проверить существующий код. 2.
Проверить freepbx-api-dashboard. 3. Проверить
FREEPBX_API_REFERENCE_FULL.md.
# Remote phonebook gateway

- SIP phonebooks are generated from PBXPuls directory data, not from an invented
  FreePBX endpoint.
- Grandstream and Yealink profiles have different XML URLs and independent
  credentials.
- A shared profile must never include private contacts. A `personal_combined`
  profile may include only the selected owner's private contacts.
- Phonebook credentials must be copied when created or rotated; plaintext secrets
  are not stored.
- Production phonebook URLs require HTTPS because SIP phones use HTTP Basic
  authentication.
- For controlled LAN deployments PBXPuls provides a phonebook-only listener on
  port `3001`. It automatically allows directly connected IPv4 subnets and never
  exposes the UI or `/api`.
- If port `3001` is already occupied by an existing Apache/Nginx phonebook proxy,
  PBXPuls keeps running and leaves that listener in place.

# Notification center

- Modules emit channel-independent events; they must not call Telegram transports.
- Rules, transition state, immutable events and delivery outbox are separate SQL entities. Filtered, cooldown and duplicate outcomes remain visible in the delivery journal.
- Missed calls are evaluated only after the configured delay (15 minutes by default) and are suppressed when a later answered outbound CDR exists for the normalized external number. Producer cursors avoid restart duplicates and historical alert floods.
- Trunk problems require consecutive failed observations; recovery is emitted once after a successful observation.
- DB outage occurrence is retained in memory while SQL is unavailable and written after recovery, because an SQL outbox cannot be updated during the outage itself.
- Bot tokens are encrypted with an environment-derived installation key. APIs expose `hasToken`, never token fragments or plaintext.
- Telegram Chat ID is a signed integer and is not restricted to the `-100` group prefix.
- Package minutes, generic Asterisk/AMI health, disk and security events remain catalog-only until a reliable producer is explicitly connected.
