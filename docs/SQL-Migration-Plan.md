# SQL Migration Plan

Date: 2026-07-07

This is a documentation-only plan for migrating PBXPuls internal state to the already planned PBXPuls SQL database. It does not create migrations, tables or runtime code.

## Boundary Rules

PBXPuls must keep database responsibilities separated:

- `asteriskcdrdb` remains the source for CDR, CEL and queue statistics.
- `asterisk` remains the source for FreePBX system/configuration data when REST/GraphQL cannot provide it.
- `pbxpuls` is for PBXPuls-owned internal data: settings, users, roles, tools, history, audit, saved filters, AI, call scripts, UI preferences and PBXPuls diagnostics.

Do not copy FreePBX configuration tables into `pbxpuls`. Store only PBXPuls metadata, normalized diagnostics, audit records and user/tool state.

## What Already Exists

Backend:

- `server.ts` has `queryPBXPulsDb(sql, params)` using `PBXPULS_DB_*`.
- `server.ts` has `isPBXPulsDbAvailable()`.
- `saveQualityCurrentToPBXPulsDb()` writes current quality snapshots to `quality_current`.

Environment variables:

- `PBXPULS_DB_HOST`
- `PBXPULS_DB_PORT`
- `PBXPULS_DB_USER`
- `PBXPULS_DB_PASS`
- `PBXPULS_DB_NAME`

Live database check:

- Database `pbxpuls` is reachable with user `pbxpuls`.
- Existing tables are `schema_migrations`, `monitor_settings`, `quality_current`.

Existing repository setup coverage:

- `setup/asterisk_cdr_schema.sql`, `setup/README.md` and `README.md` focus on `asteriskcdrdb`/CDR access.
- No repository migration file for the full PBXPuls internal schema was found during this pass.

## What Is Missing

- A central PBXPuls storage service that can read/write SQL with JSON fallback.
- A repository-owned migration registry for the PBXPuls internal schema.
- Installer/update script coverage for creating/upgrading the `pbxpuls` database and user on new installs.
- Tables for users, roles, permissions, audit, AI, directory, call scripts, saved filters, table views, test runs/results and module preferences.
- A compatibility policy for existing `schema_migrations` vs requested `schema_migrations`.
- A retention policy for logs, telemetry, status history and API logs.

## Tables Not To Duplicate

| Existing table | Do not duplicate as | Recommended handling |
| --- | --- | --- |
| `schema_migrations` | `schema_migrations` until naming decision | Prefer keeping existing table or adding a view/alias in a later migration. |
| `monitor_settings` | generic settings table without migration plan | Decide whether it remains monitoring-only or becomes a backing store for selected settings. |
| `quality_current` | another current quality snapshot table | Keep as current snapshot; add history tables around it. |

## Stage 2: Migration Core And Core Internal Tables

Stage 2 adds a backend migration module for the existing `pbxpuls` database:

- migration module: `server/pbxpulsMigrations.ts`;
- startup hook: `runPBXPulsMigrations()` is called during backend startup;
- migration registry: existing `schema_migrations`;
- migration key: `20260707_001_core_internal_tables`;
- description: `Create PBXPuls core internal tables`.

The migration core intentionally uses `schema_migrations` without a `pbxpuls_` prefix because the live `pbxpuls` database already has unprefixed tables: `schema_migrations`, `monitor_settings`, `quality_current`. New internal tables follow the same style to avoid mixed naming conventions.

If `schema_migrations` is absent on an older installation, the migration core creates it with `migration_key`, `description` and `applied_at`. If the table already exists with the older observed shape using `migration_name`, the core adapts to that column instead of altering or dropping the table.

Tables created by the first migration:

| Table | Purpose |
| --- | --- |
| `settings` | Future generic key/value store for PBXPuls system settings. |
| `users` | Future internal PBXPuls users. Not connected to auth in this stage. |
| `roles` | Future role catalog. |
| `permissions` | Future permission catalog. |
| `user_roles` | Future user-role links. |
| `role_permissions` | Future role-permission links. |
| `tools` | Internal registry of PBXPuls tools/modules. |
| `audit_log` | Future append-only audit log. |
| `system_events` | Future PBXPuls system events. |

The first migration does not add foreign keys. This keeps the schema safer for older MariaDB/FreePBX installations and avoids startup failures caused by FK incompatibilities or partially migrated data. Unique keys and indexes are still created for lookup and deduplication. For the same MariaDB compatibility reason, tables keep `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, while `updated_at` is created as nullable `DATETIME` in this first migration instead of using a second automatic `TIMESTAMP ON UPDATE` column.

The `tools` table is seeded with a baseline module list through `INSERT IGNORE`. This seed does not change UI behavior: the frontend does not read `tools` from SQL yet, and no API contracts are changed.

If the `pbxpuls` database is unavailable, startup logs a sanitized warning and continues. This preserves compatibility with older installations and keeps `data/db.json`, localStorage and existing APIs as the active runtime storage.

The next intended phase is dual-read/fallback for `settings`: keep existing JSON/env behavior, add SQL read-through behind a feature flag, and only then consider write-through.

## Draft Schema Groups

This is a draft target map, not an executable migration.

### Core Schema

| Table | Purpose | Notes |
| --- | --- | --- |
| `schema_migrations` or `schema_migrations` | Applied PBXPuls schema migrations | Existing live DB uses `schema_migrations`; avoid duplicate registries. |
| `settings` | Global/module settings | May absorb or complement `monitor_settings`. Store secrets encrypted/masked as appropriate. |
| `tools` | Module/tool registry and feature flags | Store metadata, not arbitrary payloads unless typed. |

### Access

| Table | Purpose |
| --- | --- |
| `users` | PBXPuls users and auth metadata. |
| `roles` | Role definitions. |
| `user_roles` | User-role assignments. |
| `permissions` | Permission catalog and role grants. |

### Preferences And Views

| Table | Purpose |
| --- | --- |
| `user_preferences` | Theme, sidebar, active tabs, operator extension, UI preferences. |
| `saved_filters` | Saved filters, SQL templates, report filters. |
| `table_views` | Column visibility, table layouts, directory views. |

### Audit And Events

| Table | Purpose |
| --- | --- |
| `audit_log` | Append-only management actions, preview/apply decisions, auth/admin events. |
| `system_events` | Health, quality alerts, device conflicts, DTMF/system events. |
| `api_logs` | Optional API request logs with retention and secret masking. |

### Tests And Diagnostics

| Table | Purpose |
| --- | --- |
| `test_runs` | Trunk Lab, diagnostics and validation run metadata. |
| `test_results` | Masked test outputs and normalized results. |
| `trunk_status_history` | PBXPuls-observed trunk status history. |
| `extension_status_history` | PBXPuls-observed extension/device status history. |

`quality_current` should remain the current snapshot table. History tables should be append-only with retention.

### Directory

| Table | Purpose |
| --- | --- |
| `directory_contacts` | PBXPuls directory contacts. |
| `directory_groups` | First-class directory groups when needed. |
| `directory_imports` | Import jobs, source metadata, sync outcomes. |

### Call Scripts

| Table | Purpose |
| --- | --- |
| `call_scripts` | Script metadata and versions. |
| `call_script_steps` | Script steps and structured content. |

Run history can initially use `test_runs`/`test_results` or a later dedicated script run schema if reporting requires it.

### AI

| Table | Purpose |
| --- | --- |
| `ai_providers` | Provider settings, base URL, model defaults, masked/encrypted keys. |
| `ai_agents` | Agent definitions and capability scopes. |
| `ai_prompts` | System prompts and prompt versions. |
| `ai_sessions` | AI chat/session metadata. |
| `ai_messages` | AI/user messages, capability plans, tool results and final answers. |
| `ai_voice_routes` | AI assistant voice/route rules. |
| `ai_knowledge_base` | Knowledge sources and normalized text metadata. |

## Stage 3.1: Backend Settings Service

Stage 3.1 adds a backend-only settings service for the existing `settings` table:

- service module: `server/pbxpulsSettings.ts`;
- DB helper module: `server/pbxpulsDb.ts`;
- supported value types: `string`, `number`, `boolean`, `json`, `secret`;
- helper functions: `getPBXPulsSetting`, `getPBXPulsSettingsByCategory`, `setPBXPulsSetting`, `upsertPBXPulsSetting`, `parseSettingValue`, `serializeSettingValue`.

This stage does not connect the service to runtime application settings, frontend code, endpoints, authentication or startup behavior. It does not seed data and does not migrate existing values from `data/db.json`, `.env`, localStorage or sessionStorage.

If the PBXPuls database or `settings` table is unavailable, reads return the provided fallback value and writes return `false`. JSON parse failures produce a warning without logging the stored value. The `secret` value type is treated as a plain string placeholder for now; no encryption is implemented in this stage and no real secrets are migrated.

The next phase can use this service behind a feature flag for dual-read/fallback of selected settings while preserving existing JSON/env behavior.

## Stage 3.2: Core Settings Seed

Stage 3.2 adds migration `20260707_002_seed_core_settings` with description `Seed core PBXPuls settings`. It seeds only non-secret baseline rows into the existing `settings` table.

Seeded settings:

| setting_key | value | value_type | category |
| --- | --- | --- | --- |
| `app.name` | `PBXPuls` | `string` | `app` |
| `app.storage_mode` | `hybrid` | `string` | `app` |
| `settings.sql_enabled` | `true` | `boolean` | `system` |
| `settings.fallback_enabled` | `true` | `boolean` | `system` |
| `tools.registry_source` | `sql_seeded` | `string` | `tools` |
| `audit.enabled` | `true` | `boolean` | `audit` |
| `system.events_enabled` | `true` | `boolean` | `system` |

The seed uses `INSERT IGNORE`, so existing settings are not overwritten. It does not migrate values from `data/db.json`, `.env`, localStorage or sessionStorage, and it does not store secrets. Runtime UI/API behavior remains unchanged; these rows prepare later dual-read/fallback work.

## Stage 4.1: Audit and System Events Service

Stage 4.1 adds a backend-only helper service for future writes to `audit_log` and `system_events`:

- service module: `server/pbxpulsEvents.ts`;
- audit helper: `writePBXPulsAuditLog(options)`;
- system event helper: `writePBXPulsSystemEvent(options)`.

The service serializes `details` as JSON for objects, stores strings as strings, and stores `NULL` for missing details. It masks sensitive fields named `password`, `pass`, `token`, `secret`, `apiKey`, `api_key` and `authorization` before writing or warning. Supported system event severities are `debug`, `info`, `warning`, `error` and `critical`; invalid severities fall back to `warning`.

This stage does not connect the helpers to existing API handlers, startup flows, authentication, UI or frontend code. It intentionally avoids mass logging and does not migrate existing audit/change-log data. Write failures are non-fatal and only produce sanitized warnings.

## Stage 4.2: Migration System Events

Stage 4.2 connects the migration core to `writePBXPulsSystemEvent()` for a small set of important migration lifecycle events only. It does not add audit logging for user actions and does not enable mass logging.

Migration events written to `system_events` when the PBXPuls database and table are available:

| event_type | severity | source |
| --- | --- | --- |
| `migration_started` | `info` | `pbxpuls_migrations` |
| `migration_applied` | `info` | `pbxpuls_migrations` |
| `migration_skipped_db_unavailable` | `warning` | `pbxpuls_migrations` |
| `migration_failed` | `error` | `pbxpuls_migrations` |

Event details include `migration_key`, `description` and a sanitized `error` string when relevant. The event writer is non-fatal: if writing to `system_events` fails, migration execution continues or fails according to the original migration result, not because of event logging.


## Stage 5.1: Tools Registry Service

Stage 5.1 adds a backend-only helper service for the existing `tools` table:

- service module: `server/pbxpulsTools.ts`;
- registry helpers: `getPBXPulsTools`, `getPBXPulsTool`, `isPBXPulsToolEnabled`, `setPBXPulsToolEnabled`, `upsertPBXPulsTool`.

The `tools` table becomes the source for a future PBXPuls module/tool registry. It stores tool metadata and enable flags for later dual-read module registry work, but the frontend does not use it in this stage. Existing UI navigation, API contracts, authorization and legacy module sources remain unchanged.

The service reads through the shared `queryPBXPulsDb()` and `isPBXPulsDbAvailable()` helpers. If the PBXPuls database or `tools` table is unavailable, list reads return an empty array, single reads return `null`, enabled checks return their fallback value and writes return `false`. Tool keys are validated as non-empty strings with the `tools.tool_key` length limit; boolean flags are normalized to `0`/`1`, and sort order is normalized to an integer.

`setPBXPulsToolEnabled()` updates existing rows only and does not create missing tools. `upsertPBXPulsTool()` can safely add a new tool and only updates existing values when the corresponding option is explicitly provided. This prevents seed/default metadata from being overwritten accidentally.

The next stage will introduce dual-read behavior for the module registry: keep current hardcoded/legacy module sources as the active runtime source, then read SQL `tools` as an additional source behind a compatibility switch before any frontend or navigation behavior changes.

## Stage 5.2: SQL Core Diagnostic Endpoint

Stage 5.2 adds a backend-only read-only diagnostic endpoint for the PBXPuls SQL core:

- endpoint: `GET /api/pbxpuls/sql-status`;
- route module: `server/pbxpulsSqlStatus.ts`;
- shared helpers: `isPBXPulsDbAvailable()`, `queryPBXPulsDb()` and `getPBXPulsSetting()`.

The endpoint reports PBXPuls SQL availability, storage mode, migration registry status, core table row counts and tools registry counts. It performs only `SELECT` and `SHOW COLUMNS` reads. It does not run migrations, seed data, change settings, write audit/events rows, touch FreePBX databases, or modify frontend/navigation behavior.

If the PBXPuls database is unavailable, the endpoint returns `ok: false`, `dbAvailable: false` and a sanitized error string. If an individual table is absent, only that table count is returned as `null`; the rest of the diagnostic response continues. Error logging is limited to sanitized backend warnings and never includes passwords, tokens, connection strings or secret values.

## Stage 6.1: Legacy Users/Roles SQL Seed

Stage 6.1 adds migration `20260707_003_seed_users_roles_from_legacy` with description `Seed users and roles from legacy data/db.json`.

The migration reads the current legacy `data/db.json` users and roles and seeds SQL preparation tables only:

- `roles` from legacy role ids/names;
- `users` from legacy usernames, optional display/email fields and existing `passwordHash` values;
- `user_roles` from each legacy user role assignment;
- `permissions` from role and user permission keys;
- `role_permissions` from enabled role permissions.

The seed is additive and uses `INSERT IGNORE` so existing SQL users, roles, permissions and links are not overwritten. Password hashes are copied as hashes only and are never logged. Missing or invalid `data/db.json` produces a sanitized warning and does not stop server startup.

This stage does not change runtime authentication, login, `requireAuth()`, users/roles APIs, frontend code or UI behavior. Runtime auth continues to read `data/db.json`; SQL users and roles are a prepared compatibility layer for later phases.

## Stage 6.2: SQL User/Roles Read Layer

Stage 6.2 adds a backend-only read layer for SQL users, roles and permissions:

- helper module: `server/pbxpulsAuthDb.ts`;
- user lookup: `getPBXPulsUser(username)`;
- role reads: `getPBXPulsRoles()`, `getPBXPulsUserRoles(userId)`;
- permission reads: `getPBXPulsUserPermissions(userId)`;
- full SQL snapshot: `getPBXPulsAuthSnapshot(username)`;
- legacy comparison helper: `compareLegacyUserWithSql(username)`.

The helper uses only `isPBXPulsDbAvailable()` and `queryPBXPulsDb()` with read-only SQL. SQL errors, missing tables or unavailable DB return `null`/empty values and sanitized warnings without password hashes, tokens or secrets.

Runtime authentication still uses legacy `data/db.json`. This layer is intentionally not connected to `/api/auth/login`, `requireAuth()`, permissions runtime, frontend code or public APIs. Its purpose is to verify SQL migration readiness before any future dual-read comparison stage.

## Stage 6.3: Auth Compare Diagnostic Endpoint

Stage 6.3 adds a backend-only read-only diagnostic endpoint for comparing legacy JSON auth data with the SQL auth preparation layer:

- endpoint: `GET /api/pbxpuls/auth-compare/:username`;
- protection: existing `requireAuth(['su', 'admin'])` middleware;
- implementation source: `compareLegacyUserWithSql(username)`.

The endpoint returns only safe comparison fields: existence flags, role match status, permission counts and password-hash presence booleans. It never returns `password_hash`, plaintext passwords, tokens, secrets or raw user records, and it does not write data.

Runtime authentication remains unchanged. Login still reads `data/db.json`, `requireAuth()` is unchanged, permissions runtime is unchanged, and no frontend/UI code is connected to this diagnostic endpoint.

## Stage 6.4: Dual Auth Read Mode Preparation

Stage 6.4 adds migration `20260707_004_seed_auth_storage_mode` with description `Seed auth storage mode setting`. The migration seeds `auth.storage_mode` as `legacy` through `INSERT IGNORE`, so existing deployments are not overwritten and legacy JSON remains the default authentication source.

The SQL auth helper now exposes `getAuthStorageMode()` and `getPBXPulsAuthCandidate(username)` for future dual-read preparation. Allowed modes are `legacy`, `sql` and `hybrid`; missing SQL, missing settings or unknown values fall back to `legacy`. In `hybrid` mode the helper can compare legacy and SQL auth records and write a sanitized `auth_compare_mismatch` system event without password hashes or secrets.

A read-only diagnostic endpoint `GET /api/pbxpuls/auth-mode` reports the current mode, SQL availability and the fixed runtime source `data/db.json`. Login is not switched to SQL, `requireAuth()` is unchanged, token shape is unchanged, and SQL auth remains diagnostic-only. A later stage may add hybrid comparison during login, still without authorizing from SQL.

## Stage 6.5: Hybrid Auth Comparison on Login

Stage 6.5 adds a non-blocking post-login comparison hook after successful legacy authentication. The login source remains `data/db.json`; SQL users, roles and permissions are not used to authorize the user, and token structure remains unchanged.

When `auth.storage_mode=legacy`, the hook does nothing. When `auth.storage_mode=hybrid`, it compares the successful legacy user with SQL through `compareLegacyUserWithSql(username)`. Mismatches are written to `system_events` as `auth_compare_mismatch` with only safe fields: username, existence flags, role match, permission counts and password-hash presence booleans. Password hashes, plaintext passwords, tokens and secrets are never included.

When `auth.storage_mode=sql`, runtime login still does not authorize from SQL. PBXPuls writes `auth_sql_mode_not_enabled` as a warning to make the requested mode visible while preserving legacy login behavior. SQL/settings/event errors are caught, legacy login continues, and comparison failures write `auth_compare_failed` when possible.

## Stage 6.6: Auth Migration Readiness Report

Stage 6.6 adds a backend-only read-only readiness endpoint for validating whether legacy JSON auth data is fully mirrored in SQL before any future auth runtime change.

- endpoint: `GET /api/pbxpuls/auth-readiness`;
- protection: existing `requireAuth(['su', 'admin'])` middleware;
- source of legacy users: `data/db.json`;
- SQL comparison source: `compareLegacyUserWithSql(username)` plus a read-only SQL users list.

The report checks each legacy user for SQL presence, role match, permission count match and password-hash presence parity. It also reports SQL users missing from legacy. Issues contain only safe fields such as type and username; password hashes, plaintext passwords, tokens and secrets are never returned.

The report recommends `hybrid` only as the next diagnostic mode. Runtime authentication remains legacy-only: login still reads `data/db.json`, `requireAuth()` is unchanged, token shape is unchanged, and SQL auth is not used to admit users.

## Stage 6.8: SQL Auth Runtime Behind Setting

Stage 6.8 adds SQL authentication runtime support behind the existing `auth.storage_mode` setting. The default remains `legacy`, so existing deployments continue to authenticate from `data/db.json` unless the setting is explicitly changed later.

Runtime behavior by mode:

- `legacy`: login reads `data/db.json` and SQL auth is not used.
- `hybrid`: login still reads `data/db.json`; after successful legacy login PBXPuls runs the existing legacy/SQL comparison diagnostics.
- `sql`: login first attempts SQL users/roles/permissions authentication. If SQL auth cannot authenticate the user for any reason, PBXPuls falls back to legacy `data/db.json` authentication so SQL errors cannot lock out all users.

SQL auth success creates the same token shape and response shape as legacy login. The frontend/UI, `requireAuth()`, token structure and existing API contracts are unchanged. Password hashes, plaintext passwords, tokens and secrets are not written to logs, system events or API responses. SQL-mode runtime events record only safe metadata for SQL success, fallback-to-legacy and complete login failure.

`data/db.json` remains in place as the legacy fallback source and is not removed by this stage.

## Stage 7.1: Secure Auth Mode Management API

Stage 7.1 adds a backend-only secure management endpoint for changing `auth.storage_mode` through the API.

- endpoint: `POST /api/pbxpuls/auth-mode`;
- protection: `requireAuth(['su'])`;
- allowed values: `legacy`, `hybrid`, `sql`;
- storage helper: PBXPuls settings service with `auth.storage_mode` as a string auth setting.

Changing to `sql` is guarded by the same readiness report used by `GET /api/pbxpuls/auth-readiness`. If readiness is not true, PBXPuls does not change the setting, returns `409 Conflict` with safe issues, and writes `auth_mode_change_blocked` to `system_events`.

Successful changes write `auth_mode_changed` to `system_events` with safe details only: previous mode, new mode and actor username. UI/frontend are unchanged in this stage, token shape is unchanged, `requireAuth()` is unchanged, and runtime login behavior remains controlled only by the setting.

## Stage 7.3: Migration Status Diagnostic Endpoint

Stage 7.3 adds a backend-only read-only migration status endpoint for checking PBXPuls SQL migration progress without changing runtime behavior.

- endpoint: `GET /api/pbxpuls/migration-status`;
- protection: `requireAuth(['su', 'admin'])`;
- data sources: `schema_migrations`, `settings`, `users`, `roles` and `permissions` in the `pbxpuls` database;
- no migrations, writes, table creation or data changes are performed.

The endpoint reports applied migration count, latest migration, auth mode, SQL availability and whether auth users/roles/permissions are present in SQL. Non-auth storage domains remain marked as `legacy` until later migration stages. UI/frontend, login, `requireAuth()` and SQL auth runtime are unchanged.

## Stage 8.1: Legacy Settings Migration Preview

Stage 8.1 adds a backend-only preparation layer for inspecting legacy runtime settings before any SQL seed is executed.

- helper module: `server/pbxpulsLegacySettings.ts`;
- endpoint: `GET /api/pbxpuls/settings-migration-preview`;
- protection: `requireAuth(['su', 'admin'])`;
- source: read-only `data/db.json`;
- target prepared for later stages: existing SQL `settings` table.

The preview flattens legacy settings domains into future `settings.setting_key` candidates, classifies each candidate as `string`, `number`, `boolean`, `json` or `secret`, assigns a category and reports whether a row is safe to seed later. It covers current runtime settings, module visibility, directory settings, contact sync state, calltracking configuration, marketing integration settings and AI settings/configuration records that still live in `data/db.json`.

This stage is preview-only. It does not write to SQL, does not overwrite existing SQL settings, does not switch `/api/settings` to SQL, does not change frontend/UI behavior and does not change runtime settings reads. Runtime settings continue to come from `data/db.json`.

Secrets are not migrated automatically in this stage. Keys containing password, pass, token, secret, apiKey, api_key, authorization, clientSecret, refreshToken or accessToken are classified as `secret`, marked `willSeed=false` and omitted from preview values. The next stage can safely seed only non-secret settings after the preview output has been reviewed.

## Stage 8.2: Safe Non-Secret Legacy Settings Seed

Stage 8.2 adds migration `20260708_005_seed_legacy_non_secret_settings` with description `Seed non-secret legacy settings from data/db.json`.

The migration reads legacy `data/db.json`, reuses `buildLegacySettingsSeedRows(localDb)` and inserts only rows where `willSeed=true`, `is_secret=false` and `value_type` is not `secret`. Values are stored in the existing SQL `settings` table as scalar strings or JSON text in `LONGTEXT`; MariaDB JSON columns are not introduced.

The seed uses `INSERT IGNORE`, so existing SQL settings are not overwritten. Secret keys are skipped entirely and no secret values are inserted, logged, returned by diagnostics or written to system events. Missing or invalid `data/db.json` produces a sanitized warning and does not stop server startup.

After a successful seed pass, PBXPuls writes a safe `legacy_settings_seeded` system event from `pbxpuls_settings` with counts only: `total`, `seeded`, `skippedSecrets` and `skippedExisting`.

Runtime settings remain legacy-only in this stage: `/api/settings` still reads `data/db.json`, SQL settings are not used as runtime source, `auth.storage_mode` remains `legacy`, authentication and `requireAuth()` are unchanged, and no frontend/UI behavior is changed. The next stage should add settings compare/readiness diagnostics before any read-through or runtime switch is considered.

## Stage 8.3: Settings SQL Readiness / Compare

Stage 8.3 adds a backend-only read-only readiness endpoint for checking whether non-secret legacy settings match their SQL seed rows before any runtime read-through is enabled.

- endpoint: `GET /api/pbxpuls/settings-readiness`;
- protection: `requireAuth(['su', 'admin'])`;
- source: legacy `data/db.json` plus read-only SQL `settings` rows;
- no writes, migrations, frontend changes or runtime source changes are performed.

The endpoint rebuilds legacy seed rows with `buildLegacySettingsSeedRows(localDb)`, compares only `willSeed=true` and non-secret rows, and verifies SQL key presence, `value_type` parity and serialized value parity. Secret rows are counted as skipped and their values are never read from SQL, returned in responses, logged or written to system events. Issues contain only safe metadata such as issue type, setting key and value types.

Runtime settings remain legacy-only: `/api/settings` still reads `data/db.json`, `settingsMigration.runtimeSource` remains `data/db.json`, `sqlRuntimeEnabled` remains `false`, authentication remains controlled by `auth.storage_mode=legacy`, and `requireAuth()` is unchanged. The next stage can add a settings hybrid read layer after readiness is clean.

## Stage 8.4: Settings Hybrid Read Layer

Stage 8.4 adds migration `20260708_006_seed_settings_storage_mode` and seeds `settings.storage_mode=legacy` with `INSERT IGNORE`, so existing deployments are not overwritten.

A backend-only settings runtime helper now supports `legacy`, `hybrid` and guarded `sql` read modes. The default remains `legacy`, and `/api/settings` is not switched in this stage. The helper can build a legacy snapshot from `data/db.json`, a SQL non-secret snapshot from seeded SQL settings, and a hybrid snapshot that overlays SQL non-secret settings on top of legacy while keeping secret values from legacy.

Secret settings remain protected and are not written to SQL or returned by diagnostic responses. If `settings.storage_mode=sql` is requested before secret migration exists, the runtime helper safely falls back to the hybrid snapshot and reports `fallbackReason=sql_settings_runtime_requires_secret_migration`.

A read-only diagnostic endpoint `GET /api/pbxpuls/settings-runtime-preview` reports only safe metadata such as selected mode, effective source, overlay count and protected secret count. Runtime settings remain legacy for the application, auth stays controlled by `auth.storage_mode=legacy`, and `requireAuth()` is unchanged. The next stage should add a controlled settings storage mode API.

## Stage 8.5: Controlled Settings Storage Mode API

Stage 8.5 adds a protected backend API for controlled changes to the `settings.storage_mode` setting used by the settings read-layer preview.

- endpoint: `GET /api/pbxpuls/settings-storage-mode` reports the current mode, effective source, allowed modes and blocked modes;
- endpoint: `POST /api/pbxpuls/settings-storage-mode` allows `legacy` and `hybrid` changes for `su` users;
- `hybrid` can be enabled only when `GET /api/pbxpuls/settings-readiness` is ready;
- `sql` mode is blocked with `sql_settings_runtime_requires_secret_migration` until protected secret migration exists.

Successful mode changes write safe `settings_storage_mode_changed` system events with mode names, actor and `settingsRuntimeEndpointSwitched=false`. Blocked `sql` attempts write safe `settings_storage_mode_change_blocked` events with the requested mode, actor and block reason. Secret values are never written to SQL, logs, system events or responses.

This stage does not switch `/api/settings`. The production settings endpoint still reads `data/db.json`, `auth.storage_mode` remains separate, authentication is unchanged and `requireAuth()` is unchanged. The storage mode API controls only the backend settings read-layer preview introduced in Stage 8.4.

The next stage should run a controlled hybrid smoke-test. Only after that should a separate stage consider switching `/api/settings` to the hybrid runtime source.

## Stage 8.7.1: Settings Runtime Effective Diagnostics

Stage 8.7.1 adds a backend-only diagnostic endpoint that shows the difference between the configured settings storage mode, the effective read-layer source and the actual runtime source used by `/api/settings`.

- endpoint: `GET /api/pbxpuls/settings-runtime-effective`;
- protection: `requireAuth(['su', 'admin'])`;
- reports `configuredMode` from `settings.storage_mode` and `effectiveReadLayerSource` from the hybrid read-layer helper;
- reports `settingsApiRuntimeSource=data/db.json` and `settingsApiSwitched=false` because the production `/api/settings` endpoint is still legacy.

This endpoint is a diagnostic guard before any future controlled settings API switch. It returns only safe metadata: readiness counts, protected secret count, SQL overlay/readiness counts and block reason for SQL runtime. It does not return actual settings values, does not return secret values, does not write to SQL, does not write to `data/db.json` and does not change `settings.storage_mode`.

The existing migration status and runtime preview endpoints now also expose that effective diagnostics are available and that `/api/settings` still uses `data/db.json`. The next stage should add the controlled settings API switch guard.

## Stage 8.7.2: Controlled Settings API Switch Guard

Stage 8.7.2 adds the future switch guard for the production settings endpoint without changing the endpoint itself.

A new migration `20260708_007_seed_settings_api_runtime_switch` seeds `settings.api_runtime_switch=false` with `INSERT IGNORE`, so existing deployments are not overwritten. The flag is stored as a boolean setting in the `settings` category and controls only whether a future stage may allow `/api/settings` to use the PBXPuls hybrid runtime layer.

A helper `isSettingsApiRuntimeSwitchEnabled()` reads the flag with a default of `false`. A protected diagnostic endpoint `GET /api/pbxpuls/settings-api-switch-status` reports whether the switch is enabled, the current `settingsApiRuntimeSource=data/db.json`, hybrid availability, legacy secret source and whether readiness would allow a future switch. If readiness is not clean, the guard reports `safeToEnable=false` with `reason=settings_readiness_failed`.

This stage does not modify `/api/settings` and does not add read-through logic to that route. The production settings endpoint remains legacy-only, secrets remain in legacy storage, auth and frontend behavior are unchanged, and no settings values or secret values are returned by diagnostics. The next stage, only after separate approval, should implement the controlled settings API switch.

## Stage 8.7.3: Controlled Settings API Runtime Switch

Stage 8.7.3 connects the guarded settings runtime layer to the production read endpoint without changing settings writes.

When `settings.api_runtime_switch=true` and settings readiness is clean, `GET /api/settings` reads from the PBXPuls hybrid runtime snapshot. The hybrid snapshot overlays non-secret SQL settings on top of legacy `data/db.json` settings while secrets remain sourced from legacy storage. If the switch is disabled, readiness fails, SQL diagnostics fail or the runtime helper throws, `GET /api/settings` falls back to the existing `data/db.json` response shape.

Diagnostics now report the effective `settingsApiRuntimeSource` as either `data/db.json` or `pbxpuls_hybrid`, plus whether the settings API is switched. The switch-status endpoint also reports readiness metadata, protected secret count and SQL overlay count without returning settings values or secrets.

This stage does not modify `POST /api/settings`, does not add SQL write-through, does not migrate secrets, does not change auth and does not change FreePBX/PBX state.

## Stage 8.7.4: Settings Runtime Hybrid Audit Events

Stage 8.7.4 adds safe audit events for the actual runtime source used by `GET /api/settings`.

When the guarded switch is enabled and `/api/settings` really uses the PBXPuls hybrid runtime source, PBXPuls writes `settings_runtime_hybrid_used` to `system_events` with safe metadata only: `source=pbxpuls_hybrid` and `switchEnabled=true`. When the switch is enabled but the hybrid source is not used, PBXPuls writes `settings_runtime_fallback` with only a safe reason such as `readiness_failed`, `sql_unavailable` or `runtime_error`.

Runtime audit events are throttled by an in-process cooldown so identical events are not written on every request. The diagnostic endpoint `GET /api/pbxpuls/settings-runtime-events` is protected with `requireAuth(['su', 'admin'])` and returns only recent event metadata; it does not return event `details`.

This stage does not change `/api/settings` response behavior, does not enable `settings.api_runtime_switch`, does not add SQL write-through, does not migrate secrets and does not write setting values, API keys, passwords or tokens to logs, SQL event details or diagnostic responses. The audit prepares operators for a later controlled switch by making the effective runtime source observable without changing the runtime itself.

## Migration Order

1. Inventory and documentation only.
2. Add a PBXPuls SQL storage abstraction with feature flag and fallback, but do not change API contracts.
3. Add schema migrations for non-risky additive tables.
4. Add read-through/write-through for `settings`, users/roles and audit logs.
5. Backfill `data/db.json` to SQL in an idempotent command or startup migration guarded by `schema_migrations`.
6. Migrate AI PBX Admin settings/sessions/messages because its data is self-contained and already backend-owned.
7. Migrate directory contacts and table views.
8. Migrate Trunk Lab/test runs and quality/status history.
9. Migrate call scripts, templates, saved filters and user preferences.
10. After several releases, consider JSON cleanup only with explicit backup/export and rollback instructions.

## First Data To Move

P0:

- Global `settings` that are PBXPuls-owned, excluding live `.env` overrides.
- Users, roles and permissions.
- Management audit log.
- AI PBX Admin settings, sessions, messages and knowledge.
- Directory contacts and directory/table view settings.
- Quality/status history around existing `quality_current`.

P1:

- Trunk Lab runs/results.
- Call scripts and script versions.
- Contact import/sync state.
- Extension templates and numbering capacity metadata.

## Data To Keep As Is For Now

- `localStorage.asterisk_cdr_session` and token fallbacks.
- Pre-login UI preferences until authenticated preference APIs exist.
- Browser calltracking attribution storage in `public/calltracking.js`.
- Generated JSON exports and downloaded snapshots.
- Demo-only in-memory CDR data.
- Direct `asteriskcdrdb` and `asterisk` read paths.

## Fallback Policy

Every migration phase must preserve current behavior:

1. Try SQL only when the target table exists and the feature flag is enabled.
2. If SQL is unavailable, read from existing JSON/localStorage path.
3. During transition, write to old storage and SQL, or write SQL first then old storage as compatibility backup.
4. Never remove existing JSON keys or localStorage/sessionStorage keys in the same phase that introduces SQL.
5. Return the same API response shapes as today.

Recommended compatibility switches for later implementation:

- `PBXPULS_SQL_STORAGE_ENABLED=false` by default for the first code phase.
- `PBXPULS_SQL_WRITE_THROUGH_ENABLED=false` until schema and backfill are verified.
- `PBXPULS_SQL_READ_PRIMARY=false` until rollback has been tested.

## Old Installation Compatibility

Older installations may have:

- no `PBXPULS_DB_*` variables;
- no `pbxpuls` database;
- no `schema_migrations`;
- existing `data/db.json` as the only state store.

Migration code should:

- use default `PBXPULS_DB_*` values already present in `server.ts`;
- test availability with `isPBXPulsDbAvailable()`;
- skip SQL reads/writes cleanly if unavailable;
- not block server startup when the PBXPuls DB is absent during the compatibility phase;
- log sanitized availability messages without passwords or tokens.

## Installer Compatibility

Installer/update scripts should eventually:

1. Create database `pbxpuls` if missing.
2. Create or update MySQL user `pbxpuls`.
3. Grant only required privileges on `pbxpuls.*`.
4. Never grant PBXPuls internal user write access to `asteriskcdrdb` or `asterisk`.
5. Apply idempotent migrations through the existing `schema_migrations` table or the chosen compatible migration table.
6. Preserve existing `data/db.json` and create a backup before any backfill.

This step intentionally does not add those scripts or SQL migrations.

## Security Requirements

- Do not log DB passwords, API keys, OAuth tokens, JWTs, SIP/PJSIP secrets or raw `.env`.
- Encrypt or otherwise protect provider keys and external contact credentials before moving them to SQL.
- Mask secrets in audit logs, test results and AI tool results.
- Add retention policies for `api_logs`, status history and telemetry.
- Treat SQL console history and command history as sensitive; migrate only with opt-in or strict access control.

## Rollback Model

Until the migration is fully complete:

- `data/db.json` remains the rollback source.
- localStorage/sessionStorage remains valid.
- SQL migrations must be additive.
- A failed SQL read must fall back to the old storage.
- A rollback should be able to disable SQL storage flags and restart without data loss.

For source rollback to the known point:

```bash
git checkout v5.6.0
```

For a running installation, also keep a backup of `data/` and the `pbxpuls` database before applying future schema migrations.
