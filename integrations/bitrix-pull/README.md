# PBXPuls Bitrix Pull Connector

Read-only connector for standard 1C-Bitrix web-form results. It does not modify
forms, results, mail delivery or CRM integrations.

Deployment files:

- `local/api/pbxpuls/leads.php` — public HTTPS endpoint;
- `local/php_interface/lib/PbxpulsPullApi.php` — isolated query/response logic;
- `pbxpuls-pull-config.example.php` — installation-specific token hash and site scope.

The production installer must generate a random token, store only its SHA-256
hash on the site and store the plaintext token encrypted in PBXPuls. Never put
the plaintext token in the repository or application logs.
