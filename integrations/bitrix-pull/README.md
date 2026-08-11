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
2. Open `/local/api/pbxpuls/setup.php` while signed in as a Bitrix
   administrator and generate an eight-digit pairing code.
3. In PBXPuls select "Add integration", choose 1C-Bitrix, enter the site URL
   and the pairing code. The code expires after 10 minutes and after 10 failed
   attempts.
4. Select the Bitrix site (`s1`, `s2`, ...), forms and whether phone-click
   tracking should be enabled.
5. PBXPuls receives a dedicated token, stores it encrypted and configures the
   read-only Pull API. The administrator password never leaves Bitrix.
6. When click tracking is enabled, the connector creates its event table and
   injects `tracker.js` only into the selected Bitrix site. The browser receives
   a public site key, never the Pull token.

`pbxpuls-pull-config.example.php` and `schema.sql` remain available for legacy
manual installation and diagnostics. New installations should use pairing.

The connector is read-only for Bitrix web-form results. Test it on a staging
site or a single selected form before enabling regular synchronization.
