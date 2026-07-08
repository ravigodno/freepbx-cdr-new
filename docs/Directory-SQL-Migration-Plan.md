# Stage 9.1 Directory Inventory

This stage is an inventory only. It does not change runtime behavior, does not create SQL tables, and does not migrate data.

## Current Legacy Storage

Directory data is currently stored in `data/db.json`.

Active legacy keys:

- `directory`: main contact array.
- `contactSyncAccounts`: per-user external sync account records for Google, Yandex, Mail.ru, and file imports.
- `contactSyncMappings`: mapping between external contact IDs and PBXPuls directory contact IDs.
- `directoryColumnSettings`: global and per-user Directory table column preferences.

Directory-related settings in `data/db.json.settings`:

- `directoryImportEnabled`
- `googleImportEnabled`
- `fileImportEnabled`
- `yandexCarddavEnabled`
- `mailruCarddavEnabled`
- `directoryImportUrl`
- `directoryImportFormat`
- `directoryImportMode`
- `directoryImportSchedule`
- `directorySyncToken`
- `directorySyncAsteriskBlacklist`

Historical backup storage was also found in `data/db.json.bak-aipbxadmin-admin-brain`, but active runtime reads use `data/db.json`.

Current active `directory` data contains one contact. Observed field names are:

- `id`
- `name`
- `number`
- `phones`
- `type`
- `visibility`
- `ownerUserId`
- `company`
- `position`
- `department`
- `group`
- `email`
- `website`
- `inn`
- `kpp`
- `ogrn`
- `address`
- `internalExtension`
- `linkedExternalNumber`
- `responsibleUserId`
- `tags`
- `isSpam`
- `isBlacklisted`
- `comment`
- `createdAt`
- `updatedAt`

## Current API

Directory CRUD and list endpoints:

- `GET /api/directory`
- `GET /api/directory/:id`
- `POST /api/directory`
- `PUT /api/directory/:id`
- `DELETE /api/directory/:id`
- `POST /api/directory/:id/spam`
- `POST /api/directory/:id/blacklist`
- `POST /api/directory/normalize`

Column settings endpoints:

- `GET /api/directory/column-settings`
- `POST /api/directory/column-settings/me`
- `DELETE /api/directory/column-settings/me`
- `POST /api/directory/column-settings/global`
- `DELETE /api/directory/column-settings/global`

Import and sync endpoints:

- `GET /api/directory/import/settings`
- `PATCH /api/directory/import/settings`
- `POST /api/directory/import`
- `POST /api/directory/import/preview`
- `POST /api/directory/import-url/test`
- `POST /api/directory/sync-url`
- `GET /api/directory/sync-status`
- `GET /api/directory/sync/accounts`
- `PATCH /api/directory/sync/:provider/settings`
- `GET /api/directory/sync/google/connect`
- `GET /api/directory/sync/google/callback`
- `POST /api/directory/sync/:provider/diagnose`
- `POST /api/directory/sync/file/preview-import`
- `POST /api/directory/sync/file/import`
- `POST /api/directory/sync/google/preview-import`
- `POST /api/directory/sync/yandex/connect`
- `POST /api/directory/sync/mailru/connect`
- `POST /api/directory/sync/:provider/preview-import`
- `POST /api/directory/sync/:provider/import`
- `GET /api/directory/sync/:provider/disconnect-preview`
- `POST /api/directory/sync/:provider/disconnect`

Related call and integration endpoints:

- `GET /api/live/call-banner`
- `POST /api/click-to-call`
- `GET /api/calls`
- `GET /api/calls/:uniqueid/chronology`
- `POST /api/calls/:uniqueid/process`

Backend logic is concentrated in `server.ts`. Important helper functions include:

- `getDirectoryPhones`
- `normalizeDirectoryPhones`
- `normalizeDirectoryEntry`
- `getDirectoryUserId`
- `canReadDirectoryEntry`
- `canWriteDirectoryEntry`
- `applyDirectoryAccessAndFilters`
- `buildDirectoryPaginatedResponse`
- `prepareDirectoryEntryForSave`
- `directoryEntryMatchesNumber`
- `findDirectoryContactByNumber`
- `parseDirectoryPayload`
- `upsertDirectoryEntries`
- `syncDirectoryFromConfiguredUrl`
- `resolveLiveContact`

Phone normalization reuses the project-level `normalizePhoneNumber` and `onlyDigits` helpers.

## Current Frontend Usage

Main Directory UI state and forms are currently in `src/App.tsx`.

Directory API client:

- `src/modules/directory/services/directoryApi.ts`

Directory components:

- `src/modules/directory/components/DirectoryTable.tsx`
- `src/modules/directory/components/DirectoryRow.tsx`
- `src/modules/directory/components/DirectoryContactCell.tsx`
- `src/modules/directory/components/DirectoryActionsCell.tsx`
- `src/modules/directory/components/DirectoryStatusIcon.tsx`

Directory form helpers:

- `src/modules/directory/utils/directoryFormHelpers.ts`

CDR caller/callee display dependencies:

- `src/modules/cdr/utils/CDRRowHelpers.ts`
- `src/modules/cdr/components/CDRCallerCell.tsx`
- `src/modules/cdr/components/CDRCalleeCell.tsx`

Access control references:

- `src/modules/access/components/AccessUsersTab.tsx`
- `src/modules/access/components/PermissionsMatrixTab.tsx`
- `src/modules/access/permissions.ts`
- `src/modules/access/roleMatrix.ts`

Current frontend forms support:

- display name
- primary phone
- additional phones
- contact category
- visibility
- organization/company
- position
- department
- group
- email
- website
- INN/KPP/OGRN
- address
- internal extension
- linked external number
- responsible user
- tags
- spam flag
- blacklist flag
- comment

## Contact Data Model

Current TypeScript model is `DirectoryEntry` in `src/types.ts`.

Legacy fields:

- `id`: contact ID.
- `name`: contact display name.
- `number`: primary phone or extension, kept for compatibility.
- `phones`: all phone values attached to the contact.
- `type`: business category, currently `internal`, `client`, `supplier`, or `government`.
- `visibility`: access category, currently `shared` or `private`.
- `ownerUserId`: owner for private contacts.
- `company`: organization name.
- `position`: job position.
- `department`: department.
- `group`: contact group.
- `email`: email address.
- `website`: website URL.
- `inn`: tax identifier.
- `kpp`: registration/tax field.
- `ogrn`: registration field.
- `address`: address.
- `internalExtension`: linked internal extension.
- `linkedExternalNumber`: linked external phone number.
- `responsibleUserId`: responsible PBXPuls user.
- `tags`: tag list.
- `isSpam`: spam flag.
- `isBlacklisted`: blacklist flag.
- `comment`: free-form note.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.

Import code also accepts aliases such as `phone`, `phone1`, `phone2`, `phone3`, `fio`, `fullname`, `contact`, `organization`, `org`, `job`, `title`, `notes`, and localized metadata aliases.

## Personal/Common Contact Rules

Future SQL model should map the current legacy visibility model to explicit contact ownership:

- `visibility: "shared"` becomes `contact_type: "common"`.
- `visibility: "private"` becomes `contact_type: "personal"`.

Common contacts:

- available to all users;
- show the real contact name to all users.

Personal contacts:

- owned by the user who added the personal contact;
- `owner_user_id` is the responsible owner for the personal contact;
- at this stage there is no separate `created_by` field;
- for personal contacts, creator and owner are treated as the same user.

Call display rules for number resolution:

- Common contact match: show the real contact name to everyone.
- Personal contact owned by the current user: show the real contact name to the owner.
- Personal contact owned by another user: do not show the contact full name. Show `Личный контакт другого сотрудника` and show the responsible owner user.

The current `GET /api/directory` path already filters private contacts by owner for non-superusers. However, live call banner resolution currently uses `resolveLiveContact(number, directory, settings)` without user context. Future SQL runtime should avoid using a global userless contact resolver for personal contact names.

## Future SQL Migration Plan

Proposed primary table:

```sql
directory_contacts (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT '',
  company VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  phone_normalized VARCHAR(32) NOT NULL DEFAULT '',
  phone2 VARCHAR(64) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  comment TEXT NULL,
  contact_type ENUM('common', 'personal') NOT NULL DEFAULT 'common',
  owner_user_id VARCHAR(64) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
)
```

Recommended indexes:

- `PRIMARY KEY (id)`
- `INDEX idx_directory_contacts_phone_normalized (phone_normalized)`
- `INDEX idx_directory_contacts_type_owner (contact_type, owner_user_id)`
- `INDEX idx_directory_contacts_updated_at (updated_at)`

The preliminary table above covers the minimal requested migration surface, but it does not cover all currently used Directory UI fields. Before write migration, either extend the SQL schema or add a controlled metadata strategy for:

- `phones` as a full multi-phone list;
- `type`;
- `position`;
- `department`;
- `group`;
- `website`;
- `inn`;
- `kpp`;
- `ogrn`;
- `address`;
- `internalExtension`;
- `linkedExternalNumber`;
- `responsibleUserId`;
- `tags`;
- `isSpam`;
- `isBlacklisted`.

Suggested migration stages:

1. Keep this inventory as the baseline and do not alter runtime behavior.
2. Add a guarded SQL schema proposal in a later stage, without enabling runtime reads.
3. Backfill from `data/db.json.directory` idempotently.
4. Add read-only diagnostics comparing JSON and SQL counts, normalized phone coverage, and required field parity.
5. Add a guarded Directory SQL read layer for list and number lookup.
6. Add owner-aware number lookup rules before using SQL for caller cards or live banners.
7. Add write-through only after preview, audit, rollback, and parity checks exist.
8. Migrate auxiliary data separately: sync accounts, sync mappings, column settings, and import settings.

Known migration risks:

- Backend and frontend phone matching are not fully identical today; SQL migration should standardize `phone_normalized`.
- Personal contact names can leak if a userless lookup is used for live calls or CDR caller cards.
- Import and sync flows mutate Directory data and need transactional SQL behavior before write migration.
- Current `phones` array cannot be represented losslessly by only `phone` and `phone2`.
- External sync credentials and tokens must not be included in contact SQL migration.

## Stage 9.2 Directory SQL Schema

This stage defines the future Directory SQL schema only. The schema is not executed, not registered in the runtime migration runner, and does not seed or migrate contact data.

Design artifact:

- `migrations/20260708_008_directory_schema_design.sql`

Runtime note:

- `server/pbxpulsMigrations.ts` is the active migration runner.
- The Stage 9.2 SQL file is intentionally not wired into `server/pbxpulsMigrations.ts`.
- A later stage must explicitly review, register, and gate the migration before execution.

### Primary Table

Future primary table: `directory_contacts`.

Core fields:

- `id`: stable PBXPuls contact ID.
- `name`: contact display name.
- `company`: organization/company.
- `phone`: primary phone value, equivalent to legacy `number`.
- `phone_normalized`: normalized primary phone for lookup.
- `phone2`: compatibility field for secondary phone text.
- `email`: email address.
- `comment`: free-form note.
- `contact_type`: SQL contact ownership model, `common` or `personal`.
- `owner_user_id`: owner for personal contacts.
- `created_at`: contact creation timestamp.
- `updated_at`: contact update timestamp.

Compatibility and current model fields:

- `visibility`: retained during migration for compatibility with existing `shared` and `private` values.
- `type`: current business category, such as `client`, `supplier`, `government`, or `internal`.
- `is_spam`: legacy `isSpam`.
- `is_blacklisted`: legacy `isBlacklisted`.

### Additional Fields Strategy

The current Directory model contains fields that are used by the UI and import/sync logic but are not part of the minimum core table. To avoid data loss, Stage 9.2 uses a dedicated metadata table instead of storing all extra fields only in a JSON column.

Future metadata table: `directory_contact_metadata`.

Recommended metadata fields:

- `contact_id`: parent `directory_contacts.id`.
- `metadata_key`: legacy or extension field name.
- `metadata_value`: string value.
- `metadata_json`: structured value for arrays and objects.
- `created_at`
- `updated_at`

Fields expected to use metadata unless promoted to first-class columns later:

- `phones` full array.
- `position`.
- `department`.
- `group`.
- `website`.
- `inn`.
- `kpp`.
- `ogrn`.
- `address`.
- `internalExtension`.
- `linkedExternalNumber`.
- `responsibleUserId`.
- `tags`.
- provider/import-specific custom fields.

This approach keeps the initial contact table compact while preserving all existing data. It also allows later promotion of frequently queried metadata fields to columns without losing compatibility.

### Indexes

Required indexes for `directory_contacts`:

- `idx_directory_contacts_phone_normalized` on `phone_normalized`.
- `idx_directory_contacts_owner_user_id` on `owner_user_id`.
- `idx_directory_contacts_contact_type` on `contact_type`.
- `idx_directory_contacts_company` on `company`.
- `idx_directory_contacts_name` on `name`.
- `idx_directory_contacts_type_owner` on `contact_type, owner_user_id`.

Recommended indexes for `directory_contact_metadata`:

- `idx_directory_contact_metadata_contact_id` on `contact_id`.
- `idx_directory_contact_metadata_key` on `metadata_key`.
- `uniq_directory_contact_metadata_key` on `contact_id, metadata_key`.

### Contact Visibility Rules

SQL `contact_type` replaces the future runtime meaning of legacy `visibility`:

- `contact_type = 'common'`: available to all users.
- `contact_type = 'personal'`: available to `owner_user_id`.

For a personal contact:

- `owner_user_id` is the owner of the contact.
- The owner is the user who added the personal contact.
- No separate `created_by` field is introduced in this stage.
- A later runtime stage must validate that personal contacts always have `owner_user_id`.

Call lookup rules:

- Common contact: show the real contact name to every user.
- Personal contact owned by the current user: show the real contact name.
- Personal contact owned by another user: do not reveal `name`, company, email, phones, comment, or metadata. Show only that a personal contact exists and include the responsible owner user.

The lookup layer must be owner-aware before any SQL-backed caller card, CDR lookup, or live call banner uses this table.

## Stage 9.2.1 Directory Custom Fields Designer

This stage extends the Directory SQL design with user-defined custom columns. It is design/documentation only: no SQL is executed, no tables are created, and the migration skeleton remains disconnected from runtime migrations.

### Custom Field Definitions

Future table: `directory_custom_fields`.

Purpose:

- allow PBXPuls users to create their own Directory columns;
- describe field type, label, visibility, search behavior, card display, and caller popup display;
- keep contact-specific values in `directory_contact_metadata`.

Proposed fields:

- `id`: stable field ID.
- `field_key`: machine key, unique per entity type, for example `pet_name`.
- `field_name`: human-readable label.
- `field_type`: value type.
- `entity_type`: target entity, initially `directory_contact`.
- `is_required`: whether the field is required by UI/API validation.
- `is_visible`: whether the field is visible in Directory UI by default.
- `visibility`: field visibility policy, `common`, `personal`, or `private`.
- `sort_order`: display ordering.
- `show_in_card`: whether to display in contact cards.
- `show_in_search`: whether to include in search indexing/filtering.
- `show_in_caller_popup`: whether to display in caller popup/caller card.
- `created_by`: user who created the field definition.
- `created_at`: creation timestamp.
- `updated_at`: update timestamp.

Supported `field_type` values:

- `string`
- `text`
- `number`
- `date`
- `boolean`
- `select`
- `phone`
- `email`

Example custom fields:

- Veterinary clinic: `pet_name`, `pet_type`, `pet_breed`.
- Auto service: `car_model`, `vin`, `plate_number`.
- Medical office: `birth_date`, `policy_number`.

### Custom Field Values

Future table: `directory_contact_metadata`.

Stage 9.2 originally described this as a generic key/value metadata table. Stage 9.2.1 refines it as the value table for custom fields and preserved legacy details.

Core value fields:

- `contact_id`: parent contact ID.
- `field_id`: custom field definition ID from `directory_custom_fields.id`.
- `value`: stored field value.

Compatibility fields may remain in the skeleton for migration from legacy JSON:

- `metadata_key`: legacy field key before a custom field definition exists.
- `metadata_value`: text value for legacy/simple fields.
- `metadata_json`: structured value for arrays and objects, such as `phones` and `tags`.

Future runtime should prefer `field_id` when the value belongs to a designed custom field. Legacy metadata rows can use `metadata_key` until promoted to custom field definitions.

### Custom Field Visibility

Supported field visibility values:

- `common`: visible to all users who can see the contact.
- `personal`: available only for the owner of a personal contact.
- `private`: visible only to the owner/user who created or owns the private field context.

Rules:

- Common fields are available to all users when the contact itself is visible.
- Personal fields are available only to the owner of a personal contact.
- Private fields are available only to the owner and must not be exposed in caller cards, search results, API responses, or audit details for other users.
- Caller popup rendering must enforce both contact visibility and field visibility before showing a custom field value.

### Custom Field Indexes

Recommended indexes for `directory_custom_fields`:

- `uniq_directory_custom_fields_key` on `entity_type, field_key`.
- `idx_directory_custom_fields_entity` on `entity_type`.
- `idx_directory_custom_fields_visibility` on `visibility`.
- `idx_directory_custom_fields_sort_order` on `sort_order`.

Recommended indexes for custom values:

- `idx_directory_contact_metadata_contact_id` on `contact_id`.
- `idx_directory_contact_metadata_field_id` on `field_id`.
- `idx_directory_contact_metadata_key` on `metadata_key`.
- `uniq_directory_contact_metadata_field` on `contact_id, field_id`.

### Proposed SQL Skeleton

The design SQL is stored in `migrations/20260708_008_directory_schema_design.sql`.

Summary:

```sql
CREATE TABLE IF NOT EXISTS directory_contacts (...);
CREATE TABLE IF NOT EXISTS directory_custom_fields (...);
CREATE TABLE IF NOT EXISTS directory_contact_metadata (...);
```

This file is a migration skeleton only. It must not be executed automatically in Stage 9.2 or Stage 9.2.1.
