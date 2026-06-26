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
