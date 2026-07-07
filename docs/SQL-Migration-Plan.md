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
