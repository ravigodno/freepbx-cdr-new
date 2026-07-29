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
