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

## Installation

1. Copy the archive's `local/` directory into the Bitrix document root. Merge
   it with the existing `local/` directory; do not replace that directory.
2. Copy `pbxpuls-pull-config.example.php` to
   `local/php_interface/pbxpuls-pull-config.php`.
3. Generate a random token and write only its lowercase SHA-256 hash to
   `tokenHash`. Enter the original token once in PBXPuls.
4. Set `siteHost`, `siteSuffix` and, when needed, `allowedFormIds`.
5. If phone-click collection is required, apply `schema.sql` to the Bitrix
   database and include `PbxpulsClickCollector.php` from the site bootstrap.
6. In PBXPuls select "Connect 1C-Bitrix Pull API" and use the public HTTPS URL
   `/local/api/pbxpuls/leads.php`.

The connector is read-only for Bitrix web-form results. Test it on a staging
site or a single selected form before enabling regular synchronization.
