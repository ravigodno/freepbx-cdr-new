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

## Stage 9.3 Directory Migration Preview

This stage adds a backend-only safe preview endpoint for the future Directory migration.

Endpoint:

- `GET /api/pbxpuls/directory-migration-preview`
- Auth: `requireAuth(['su', 'admin'])`
- Source: `data/db.json`
- Runtime impact: read-only
- SQL impact: none

The endpoint must not return contact names, phone numbers, comments, emails, custom field values, or other personal data. It returns only safe aggregate statistics and custom field keys.

### Current Safe Counts

Current `data/db.json.directory` inventory:

- total contacts: `1`
- common contacts: `1`
- personal contacts: `0`
- owners count: `0`
- personal contacts without owner: `0`
- total normalized phone entries: `1`
- contacts without phones: `0`
- duplicate normalized phone values: `0`
- custom fields count: `0`
- spam contacts: `0`
- blacklisted contacts: `0`

### Preview Response Shape

The preview response is intentionally aggregate-only:

```json
{
  "ok": true,
  "source": "data/db.json",
  "safe": true,
  "contacts": {
    "total": 1,
    "common": 1,
    "personal": 0
  },
  "owners": {
    "ownersCount": 0,
    "contactsWithoutOwner": 0
  },
  "phones": {
    "totalPhones": 1,
    "emptyPhones": 0,
    "duplicatePhones": 0
  },
  "customFields": {
    "count": 0,
    "valueCells": 0,
    "fields": []
  }
}
```

### Conversion Rules

Planned mapping from legacy JSON to SQL:

- `visibility: "shared"` maps to `directory_contacts.contact_type = "common"`.
- `visibility: "private"` maps to `directory_contacts.contact_type = "personal"`.
- `ownerUserId`, `ownerId`, or `userId` maps to `directory_contacts.owner_user_id` for personal contacts.
- `number` maps to `directory_contacts.phone`.
- normalized primary phone maps to `directory_contacts.phone_normalized`.
- `phone2` remains a compatibility field where possible.
- full `phones` array is preserved through `directory_contact_metadata`.
- `type` maps to the business category field.
- `isSpam` maps to `is_spam`.
- `isBlacklisted` maps to `is_blacklisted`.
- unknown legacy keys become custom metadata candidates without exposing values in the preview.

### Potential Issues

The preview reports these classes of migration issues:

- personal contacts without `ownerUserId`;
- contacts without usable phone values;
- invalid or missing `visibility`;
- invalid or missing Directory `type`;
- duplicate normalized phone values;
- unknown custom fields that need metadata/custom-field mapping.

Duplicate phone counts are counts of duplicated normalized phone values, not the values themselves.

### Security Rules

The preview must not return:

- contact names or full names;
- phone numbers or normalized phone values;
- email addresses;
- comments;
- company-specific notes;
- custom field values;
- tokens or secrets from Directory import/sync settings.

This keeps the endpoint safe for migration planning without leaking Directory personal data.

## Stage 9.4 Directory Data Mapping

This stage defines the Legacy Directory to PBXPuls SQL mapping rules. It is documentation-only: no SQL is executed, no data is written, and no runtime/API/frontend behavior changes.

### Contact Mapping

Legacy source: `data/db.json.directory[]`.

Target primary table: `directory_contacts`.

| Legacy `DirectoryEntry` field | Target SQL field | Rule |
| --- | --- | --- |
| `id` | `directory_contacts.id` | Preserve existing ID when present. Generate only in a later controlled migration if missing. |
| `name`, `fio`, `fullname`, `contact` | `name` | Use the first non-empty display-name candidate. Do not expose names in preview output. |
| `company`, `organization`, `org` | `company` | Use the first non-empty organization candidate. |
| `number`, first normalized `phones[]`, `phone`, `phone1` | `phone` | Store primary phone as the canonical display phone. |
| normalized primary phone | `phone_normalized` | Store the normalized lookup value. |
| `phone2`, remaining `phones[]` | `phone2` and metadata | Keep compatibility `phone2`; preserve full phone array in `directory_contact_metadata`. |
| `email` | `email` | Preserve value. Do not include in preview output. |
| `comment`, `notes` | `comment` | Preserve value. Do not include in preview output. |
| `visibility` | `contact_type` plus compatibility `visibility` | Convert to `common` or `personal`; retain legacy visibility during transition. |
| `ownerUserId`, `ownerId`, `userId` | `owner_user_id` | Required for personal contacts. |
| `type` | `type` | Preserve business category: `internal`, `client`, `supplier`, or `government`. |
| `isSpam`, `is_spam` | `is_spam` | Convert truthy values to `1`. |
| `isBlacklisted`, `is_blacklisted` | `is_blacklisted` | Convert truthy values to `1`. |
| `createdAt` | `created_at` | Preserve if parseable. |
| `updatedAt` | `updated_at` | Preserve if parseable. |

Fields not represented as first-class columns must be preserved through `directory_contact_metadata` unless a later stage promotes them to `directory_contacts` columns.

### Visibility Mapping

Legacy shared/common/public contacts:

```text
visibility = shared/common/public/empty
  -> contact_type = common
  -> owner_user_id = NULL
```

Legacy personal/private contacts:

```text
visibility = private/personal/личный
  -> contact_type = personal
  -> owner_user_id = ownerUserId
```

Rules:

- `common` contacts are visible to all users.
- `personal` contacts are visible to their owner.
- Personal contacts without `ownerUserId` are not safe to migrate as personal rows until an owner resolution rule exists.
- No separate `created_by` field is introduced at this stage; for personal contacts, creator and owner are treated as the same user.

### Phone Normalization Rules

Phone normalization must be deterministic and must match the future lookup layer.

Planned normalization steps:

1. Trim leading and trailing spaces.
2. Remove spaces and formatting separators.
3. Remove parentheses.
4. Remove dashes and visual separators.
5. Keep only phone digits for `phone_normalized`.
6. Apply configured PBXPuls normalization behavior, including Russian `8` to `7` replacement when enabled.
7. Prefer international-format lookup values where enough digits are available.

Examples are intentionally omitted because this plan must not expose real customer phone numbers.

Migration storage:

- `directory_contacts.phone`: primary display/source phone.
- `directory_contacts.phone_normalized`: normalized lookup key.
- `directory_contacts.phone2`: compatibility secondary phone text where available.
- `directory_contact_metadata`: full legacy `phones[]` array and any additional phone fields.

### Custom Fields Mapping

Legacy additional fields are any `DirectoryEntry` keys not covered by the known core model.

Mapping:

```text
unknown legacy field key
  -> directory_custom_fields.field_key
  -> directory_custom_fields.field_name
  -> directory_contact_metadata.field_id
  -> directory_contact_metadata.value
```

Rules:

- Create one `directory_custom_fields` definition per distinct legacy field key in a later controlled migration.
- Store per-contact values in `directory_contact_metadata`.
- Do not include custom field values in preview responses.
- Preserve array/object values through `metadata_json` when they cannot be represented safely as text.
- Default custom field visibility should be conservative until reviewed. Prefer `private` for fields that may contain personal data.

Legacy fields currently expected to use metadata unless promoted:

- `phones`
- `position`
- `department`
- `group`
- `website`
- `inn`
- `kpp`
- `ogrn`
- `address`
- `internalExtension`
- `linkedExternalNumber`
- `responsibleUserId`
- `tags`

### Duplicate Handling

Duplicate detection should use `phone_normalized`, not raw formatted phone text.

Rules for identical normalized phones:

- Do not silently drop rows.
- Preserve every legacy contact record unless a later preview explicitly confirms a merge.
- Mark duplicate groups in migration diagnostics.
- Prefer deterministic primary row selection only for lookup conflict resolution.
- Preserve non-primary rows and their metadata.
- Store merge or conflict decisions in a future audit/migration report before any write migration.

Suggested conflict resolution order for future preview only:

1. Same `id`: treat as the same contact.
2. Same normalized phone and same owner/contact type: candidate for merge preview.
3. Same normalized phone but different owners: do not merge automatically.
4. Same normalized phone where one row is `common` and another is `personal`: do not merge automatically; owner-aware lookup rules must decide display behavior.

History preservation:

- Keep original legacy IDs in `directory_contacts.id` when possible.
- Store alternate source fields and multi-phone arrays in metadata.
- A later migration should record duplicate groups without exposing phone values.

### Invalid Data Handling

Contacts without phone:

- Keep as migration candidates if they have a name or useful metadata.
- Report in preview as `contact_without_phone`.
- Do not include them in phone lookup indexes until a phone exists.

Contacts without name:

- Preserve the row if it has a phone, owner, or metadata.
- Use an empty `name` or a generated placeholder only in a later controlled migration.
- Do not show generated placeholders in migration preview as personal data.

Personal contacts without owner:

- Report as `personal_contact_without_owner`.
- Do not migrate as visible personal contacts until an owner resolution rule exists.
- Safe fallback options for a later stage are quarantine, admin-only review, or converting to common only after explicit approval.

Invalid visibility:

- Report as `invalid_visibility`.
- Do not guess personal visibility from names, comments, or other personal fields.
- Defaulting to `common` is allowed only for missing/empty visibility that matches current legacy behavior.

Invalid type:

- Report as `invalid_contact_type`.
- Preserve raw type in metadata if it is not one of `internal`, `client`, `supplier`, or `government`.
- Use a controlled default such as `client` only after preview review.

### Safe Migration Preview Example

Example output without personal data:

```json
{
  "ok": true,
  "source": "data/db.json",
  "safe": true,
  "contacts": {
    "total": 1,
    "common": 1,
    "personal": 0
  },
  "owners": {
    "ownersCount": 0,
    "contactsWithoutOwner": 0
  },
  "phones": {
    "totalPhones": 1,
    "emptyPhones": 0,
    "duplicatePhones": 0
  },
  "customFields": {
    "count": 0,
    "valueCells": 0,
    "fields": []
  },
  "plannedMapping": {
    "sharedVisibilityToContactType": "common",
    "privateVisibilityToContactType": "personal",
    "ownerField": "owner_user_id",
    "customFieldsTarget": "directory_contact_metadata",
    "valuesReturned": false
  }
}
```

This example intentionally excludes names, phone values, comments, emails, and custom field values.

## Stage 9.5 Directory SQL Seed

This stage prepares an idempotent legacy Directory seed into the PBXPuls SQL model. It does not switch Directory runtime, does not change `/api/directory`, does not add SQL write-through, and does not remove `data/db.json`.

Migration key:

- `20260708_009_seed_directory`

Seed source:

- `data/db.json.directory`

Target tables:

- `directory_contacts`
- `directory_custom_fields`
- `directory_contact_metadata`

The migration uses `INSERT IGNORE` and must not overwrite existing SQL records.

### Seed Scope

`directory_contacts` receives core mapped fields:

- `id`
- `name`
- `company`
- `phone`
- `phone_normalized`
- `phone2`
- `email`
- `comment`
- `contact_type`
- `owner_user_id`
- `visibility`
- `type`
- `is_spam`
- `is_blacklisted`
- `created_at`
- `updated_at`

`directory_custom_fields` receives definitions only for additional legacy fields that are not part of the known Directory core model and are not sensitive by key name.

`directory_contact_metadata` receives:

- safe legacy detail fields that are not first-class contact columns;
- custom field values linked by `field_id`;
- structured values through `metadata_json` when needed.

Sensitive custom field keys are skipped. The seed must not log names, phone numbers, email addresses, comments, or custom field values.

### Seed Preview Endpoint

Endpoint:

- `GET /api/pbxpuls/directory-seed-preview`
- Auth: `requireAuth(['su', 'admin'])`
- Source: `data/db.json`
- SQL writes: none

The endpoint returns only aggregate counts:

```json
{
  "ok": true,
  "source": "data/db.json",
  "sqlAvailable": false,
  "contacts": {
    "legacyTotal": 1,
    "willAdd": 1,
    "skippedExisting": 0,
    "skippedInvalid": 0
  },
  "customFields": {
    "willAdd": 0,
    "skippedExisting": 0
  },
  "metadata": {
    "willAdd": 0,
    "skippedExisting": 0,
    "duplicateKeys": 0
  },
  "duplicates": {
    "normalizedPhones": 0
  },
  "safe": true,
  "valuesReturned": false
}
```

If SQL tables are missing or SQL is unavailable, the endpoint still returns legacy-derived counts and reports `sqlAvailable: false`.

### Audit

After a successful seed migration, the migration writes a safe system event:

```json
{
  "event_type": "directory_seed_completed",
  "details": {
    "contactsCount": 1,
    "customFieldsCount": 0,
    "metadataCount": 0,
    "skippedCount": 0
  }
}
```

Audit details must not include:

- contact names;
- phone numbers;
- email addresses;
- comments;
- custom field values.

### Runtime Safety

Stage 9.5 does not change read or write behavior for the Directory module.

The application continues to use legacy `data/db.json` for existing Directory APIs until a later controlled runtime switch stage is designed, previewed, and explicitly enabled.

## Stage 9.6 Directory SQL Readiness

This stage adds a read-only readiness check for comparing legacy Directory data with the SQL Directory seed result.

Endpoint:

- `GET /api/pbxpuls/directory-readiness`
- Auth: `requireAuth(['su', 'admin'])`
- Source: `data/db.json`
- SQL tables checked: `directory_contacts`, `directory_custom_fields`, `directory_contact_metadata`
- Runtime impact: none
- SQL writes: none

The endpoint returns only safe aggregate data. It must not return contact names, phone values, email addresses, comments, custom field values, or raw metadata values.

### Checks

The readiness report compares:

- legacy contact count against `directory_contacts`;
- matched contact IDs without returning the IDs;
- common contact count and SQL `contact_type = common`;
- personal contact count and SQL `contact_type = personal`;
- personal owner mapping through `owner_user_id`;
- normalized phone coverage without returning phone values;
- custom field key coverage in `directory_custom_fields`;
- metadata row coverage in `directory_contact_metadata`;
- invalid legacy rows skipped by the seed mapping.

Example safe response:

```json
{
  "ok": true,
  "ready": true,
  "contacts": {
    "legacy": 1,
    "sql": 1,
    "matched": 1
  },
  "common": {
    "legacy": 1,
    "sqlMatched": 1,
    "matched": true
  },
  "personal": {
    "legacy": 0,
    "sqlMatched": 0,
    "matched": true
  },
  "owners": {
    "legacy": 0,
    "matchedCount": 0,
    "matched": true
  },
  "phones": {
    "legacy": 1,
    "matchedCount": 1,
    "matched": true
  },
  "customFields": {
    "legacy": 0,
    "sql": 0,
    "matchedCount": 0,
    "matched": true
  },
  "issues": []
}
```

### Readiness Criteria

Directory SQL readiness is `ready: true` only when:

- SQL is available;
- all expected legacy contacts are present in `directory_contacts`;
- SQL contact count matches the seedable legacy contact count;
- common and personal counts match;
- every personal contact has the expected `owner_user_id`;
- every expected normalized phone is present for the matching contact;
- custom field definitions match;
- metadata rows match;
- no invalid legacy contacts were skipped.

### Conditions For Future SQL Runtime Switch

A later controlled Directory SQL runtime switch may be considered only when:

- `/api/pbxpuls/directory-readiness` returns `ready: true`;
- `/api/pbxpuls/directory-seed-preview` reports no unexpected additions or duplicates;
- owner-aware lookup rules are implemented for caller cards, CDR lookup, and live call banners;
- personal contact names are protected for non-owners;
- rollback to `data/db.json` remains available;
- no SQL write-through is enabled without a separate preview/audit/rollback stage.

Stage 9.6 does not enable SQL runtime and does not change existing Directory APIs.

## Stage 9.7 Directory Runtime Switch

This stage adds a guarded backend controller for the future Directory SQL runtime switch.

Setting:

- `directory.storage_mode`
- Allowed values: `legacy`, `sql`
- Default: `legacy`

Endpoints:

- `GET /api/pbxpuls/directory-storage-mode`
- Auth: `requireAuth(['su', 'admin'])`
- Returns: `mode`, `readiness`, `sqlAvailable`, `runtimeSource`

- `POST /api/pbxpuls/directory-storage-mode`
- Auth: `requireAuth(['su'])`
- Body: `{ "mode": "legacy" | "sql" }`

Rules:

- `legacy` is always allowed.
- `sql` is allowed only when `/api/pbxpuls/directory-readiness` returns `ready: true`.
- If SQL readiness is not clean, the endpoint returns `409 Conflict` with safe error code `directory_sql_readiness_failed`.
- Successful changes write `directory_storage_mode_changed` to `system_events` with safe details only: `previousMode`, `newMode`, `actor`.
- Audit details must not include contacts, phone numbers, comments, custom field values, customer data or raw Directory payloads.

Runtime impact:

- Stage 9.7 does not enable SQL runtime.
- Existing Directory UI and APIs continue to use `data/db.json`.
- Imports, Click2Call, CDR, Bitrix24 and SQL write-through are unchanged.
- `runtimeSource` remains `data/db.json` until a later explicit runtime integration stage.

## Stage 9.8.1 Directory SQL Read Runtime

This stage adds a backend-only SQL read runtime layer for Directory.

Runtime switch behavior:

- The default `directory.storage_mode` remains `legacy`.
- SQL runtime is not enabled automatically.
- Existing write operations remain legacy-only.
- Imports and sync flows continue to write `data/db.json`.
- Frontend code and Directory UI are unchanged.

Helper:

- `server/pbxpulsDirectoryRuntime.ts`
- `getDirectoryStorageMode()`
- `getDirectoryContactByPhone()`
- `searchDirectoryContacts()`

Read behavior:

- When `directory.storage_mode = legacy`, Directory reads use the existing `data/db.json` path.
- When `directory.storage_mode = sql`, Directory reads use `directory_contacts` and `directory_contact_metadata`.
- SQL rows are mapped back to the existing `DirectoryEntry` shape so existing filters, caller display logic and CDR lookup logic can remain compatible.
- If SQL read fails, the runtime falls back to `data/db.json` and reports the effective source accordingly.

Read paths covered:

- Directory list/detail reads.
- Contact lookup by phone.
- Live call banner caller card resolution.
- CDR lookup name/type enrichment.
- Read-only call statistics and reports that depend on Directory owner/contact mapping.

Diagnostic endpoint:

- `GET /api/pbxpuls/directory-runtime-effective`
- Auth: `requireAuth(['su', 'admin'])`
- Returns: `configuredMode`, `effectiveSource`, `sqlAvailable`, `readiness`, `writeMode`
- `writeMode` is always `legacy` in this stage.

Audit:

- When the SQL read layer is actually used, PBXPuls writes `directory_sql_read_used` to `system_events`.
- Details are safe and limited to `{ "source": "pbxpuls_sql" }`.
- Audit details must not include contacts, phone numbers, names, comments, custom field values, customer data or raw Directory payloads.

Stage 9.8.1 does not add SQL write-through and does not change import, create, update, delete, spam or blacklist write behavior.

## Stage 9.9.1 Directory SQL Write Layer Foundation

This stage prepares a SQL write service for Directory, but does not switch production writes to SQL.

Helper:

- `server/pbxpulsDirectoryWrite.ts`
- `createDirectoryContactSql(input, actor)`
- `updateDirectoryContactSql(id, input, actor)`
- `deleteDirectoryContactSql(id, actor)`
- `upsertDirectoryContactMetadataSql(contactId, metadata, actor)`
- `validateDirectoryContactInput(input)`
- `normalizeDirectoryContactForSql(input)`

Runtime behavior:

- Existing Directory write endpoints remain legacy-only.
- `POST /api/directory`, `PUT /api/directory/:id`, `DELETE /api/directory/:id`, spam, blacklist, import and sync write paths still write `data/db.json`.
- No frontend behavior changes are introduced.
- No SQL write-through is connected to current runtime endpoints.

Setting:

- `directory.write_mode`
- Allowed future values: `legacy`, `sql`
- Default: `legacy`
- Seed migration: `20260709_010_seed_directory_write_mode`

Ownership rules:

- Common contacts use `contact_type = common` and `owner_user_id = NULL`.
- Personal contacts use `contact_type = personal`.
- For personal contacts, `owner_user_id` is the user who added the contact.
- At this stage, creator and owner are treated as the same user for personal contacts.

Custom fields and metadata:

- Custom field values are stored through `directory_contact_metadata`.
- Existing `directory_custom_fields.field_key` definitions can be used by metadata writes.
- New custom field definitions are not created automatically by this foundation layer.
- Unknown metadata keys are skipped with warnings instead of being promoted silently.

Audit safety:

- SQL write helper audit events are limited to counts and IDs:
  - `directory_sql_contact_created`
  - `directory_sql_contact_updated`
  - `directory_sql_contact_deleted`
- Event details are safe and limited to `contactId`, `contactType`, `actor`, and `metadataCount`.
- Audit details must not include names, phone numbers, email addresses, comments, metadata values, raw contact payloads, tokens or secrets.

Diagnostic endpoint:

- `GET /api/pbxpuls/directory-write-readiness`
- Auth: `requireAuth(['su', 'admin'])`
- Reports SQL availability, helper availability, current write mode, supported operations and the next controlled switch step.

`GET /api/pbxpuls/directory-runtime-effective` also reports:

- `writeMode`
- `writeLayerAvailable`
- `directoryWriteMode`

Stage 9.9.1 keeps `directory.write_mode = legacy` and leaves `directory.storage_mode` unchanged. The next step is `controlled_directory_sql_write_switch`, where any production write switch must be gated, audited and reversible.

## Stage 9.9.2 Controlled Directory SQL Write Switch Design

This stage adds the controlled Directory write-mode controller and status endpoints for a future SQL write switch.

Controller:

- `server/pbxpulsDirectoryWriteMode.ts`
- `getDirectoryWriteMode()`
- `getDirectoryWriteModeStatus()`
- `canEnableDirectorySqlWrite()`
- `setDirectoryWriteMode(mode, actor)`

Endpoints:

- `GET /api/pbxpuls/directory-write-mode`
- Auth: `requireAuth(['su', 'admin'])`
- Returns the current `directory.write_mode`, allowed modes, SQL enable decision, write layer availability, and safe readiness booleans.

- `POST /api/pbxpuls/directory-write-mode`
- Auth: `requireAuth(['su'])`
- Body: `{ "mode": "legacy" | "sql" }`

Switch behavior:

- `legacy` is always allowed and writes `directory.write_mode = legacy`.
- `sql` is intentionally blocked in this stage, even if Directory SQL read readiness is clean.
- The current block reason is `directory_sql_write_runtime_not_connected`.
- Existing Directory write endpoints are still legacy-only.
- `POST /api/directory`, `PUT /api/directory/:id`, `DELETE /api/directory/:id`, import, sync, spam and blacklist write paths are not connected to the SQL write helper.
- No frontend changes are introduced.
- No SQL contact write tests are performed by this stage.

Diagnostics:

- `GET /api/pbxpuls/directory-write-readiness` now reports:
  - `controlledSwitchAvailable`
  - `canEnableSqlWrite`
  - `blockReason`
- `GET /api/pbxpuls/directory-runtime-effective` now reports:
  - `writeSwitchControllerAvailable`
  - `existingDirectoryEndpointsSwitched`

Audit:

- `directory_write_mode_changed`
- `directory_write_mode_blocked`

Audit details are safe and limited to:

```json
{
  "from": "legacy",
  "to": "legacy",
  "actor": "su",
  "reason": null
}
```

Audit details must not include names, phone numbers, email addresses, comments, metadata values, raw contact payloads, tokens or secrets.

Stage 9.9.2 is preparation only. The next stage should be guarded endpoint wiring or a SQL write preview flow before any production write path can use SQL.

## Stage 9.9.3 Directory SQL Write Preview / Dry-run

This stage adds a safe preview-only layer for future Directory SQL writes.

Helper:

- `server/pbxpulsDirectoryWritePreview.ts`
- `previewCreateDirectoryContactSql(input, actor)`
- `previewUpdateDirectoryContactSql(id, input, actor)`
- `previewDeleteDirectoryContactSql(id, actor)`

Endpoint:

- `POST /api/pbxpuls/directory-write-preview`
- Auth: `requireAuth(['su', 'admin'])`
- Body: `{ "operation": "create" | "update" | "delete", "id": "...", "input": {} }`

Preview behavior:

- `create` requires contact input and performs normalize plus validation.
- `update` requires contact id and input, then performs normalize plus validation.
- `delete` requires contact id only and validates only the target id shape.
- The endpoint always returns `dryRun: true`.
- The endpoint never writes to `directory_contacts`, `directory_contact_metadata`, or `data/db.json`.
- The endpoint never calls SQL write helpers such as `createDirectoryContactSql`, `updateDirectoryContactSql`, `deleteDirectoryContactSql`, or `upsertDirectoryContactMetadataSql`.

Response safety:

- Preview responses include only safe diagnostic fields such as validation status, booleans for normalized shape, metadata key count, current write mode, and `wouldWriteSql: false`.
- Preview responses must not return names, phone numbers, email addresses, comments, metadata values, raw input, or raw normalized payloads.

Audit:

- Every valid preview operation writes `directory_write_preview_checked`.
- Audit details are limited to operation, actor, `dryRun`, validation result, and reason.
- Audit details must not include names, phone numbers, email addresses, comments, metadata values, raw payloads, tokens or secrets.

Diagnostics:

- `GET /api/pbxpuls/directory-write-readiness` now reports `writePreviewAvailable: true`.
- `GET /api/pbxpuls/directory-runtime-effective` now reports `writePreviewAvailable: true`.

Stage 9.9.3 keeps SQL write mode intentionally blocked. Existing Directory write endpoints remain legacy-only. The next stage should be guarded endpoint wiring or a runtime-switch guarded write path, with preview and rollback still required before production SQL writes.

## Stage 9.9.5 Guarded Directory Write Endpoint Wiring Design

This stage adds a guarded write endpoint router for the existing Directory create, update and delete endpoints.

Helper:

- `server/pbxpulsDirectoryWriteRouter.ts`
- `getDirectoryWriteRuntimeDecision(operation, actor)`
- `shouldUseLegacyDirectoryWrite(operation, actor)`
- `shouldUseSqlDirectoryWrite(operation, actor)`
- `assertDirectorySqlWriteAllowed(operation, actor)`

Endpoint wiring:

- `POST /api/directory`
- `PUT /api/directory/:id`
- `DELETE /api/directory/:id`

Behavior:

- When `directory.write_mode = legacy`, the existing legacy branch continues to run and writes `data/db.json` exactly as before.
- When `directory.write_mode = sql`, the SQL branch is intentionally blocked in this stage.
- The SQL branch returns a safe conflict response with reason `directory_sql_write_runtime_not_connected`.
- The SQL branch does not write to SQL.
- The SQL branch does not write to `data/db.json`.
- `directory.write_mode = sql` is still blocked by the write-mode controller, so the SQL branch is not reachable in normal runtime.

Unchanged paths:

- Directory import write paths are unchanged.
- Directory sync write paths are unchanged.
- Spam and blacklist write paths are unchanged.
- Directory read endpoints are unchanged.
- Frontend code is unchanged.
- CDR, FreePBX and Asterisk logic are unchanged.

Diagnostics:

- `GET /api/pbxpuls/directory-write-readiness` now reports:
  - `writeEndpointRouterAvailable`
  - `existingDirectoryEndpointsSwitched`
  - `sqlWriteBranchBlocked`
- `GET /api/pbxpuls/directory-runtime-effective` now reports:
  - `writeEndpointRouterAvailable`
  - `sqlWriteBranchBlocked`
- `GET /api/pbxpuls/directory-write-router-status` reports the current route decision for create, update and delete.

Audit:

- `directory_write_endpoint_sql_blocked` is written only if the blocked SQL branch is reached.
- Audit details are safe and limited to operation, actor, mode and reason.
- Audit details must not include names, phone numbers, email addresses, comments, metadata values, raw payloads, tokens or secrets.

Stage 9.9.5 is wiring design only. SQL writes remain disabled. The next stage should be controlled SQL branch enablement only after a separate decision, preview and rollback plan.

## Stage 9.9.8 SQL Write Isolated Test Endpoint Design

This stage adds an isolated, guarded endpoint for a future one-contact Directory SQL write smoke test.

Helper:

- `server/pbxpulsDirectorySqlWriteTest.ts`
- `getDirectorySqlWriteTestStatus()`
- `canRunDirectorySqlWriteTest()`
- `assertDirectorySqlWriteTestAllowed()`
- `validateSqlWriteTestPayload(input)`
- `buildSqlWriteTestPayload(input)`

Endpoints:

- `GET /api/pbxpuls/directory-sql-write-test-status`
- `POST /api/pbxpuls/directory-sql-write-test`
- Auth: `requireAuth(['su'])`

Safety flag:

- `directory.sql_write_test_enabled`
- Default value: `false`
- Seed migration: `20260709_011_seed_directory_sql_write_test_enabled`

Behavior:

- The isolated SQL write test endpoint is available but blocked while `directory.sql_write_test_enabled = false`.
- The blocked response uses reason `directory_sql_write_test_disabled`.
- Production Directory endpoints remain legacy.
- `directory.write_mode = sql` remains blocked by the write-mode controller.
- `directory.storage_mode` remains `legacy`.
- SQL writes are not performed in this stage.
- No contacts are created, updated or deleted in this stage.
- The endpoint is intended only for the next controlled smoke-test stage.

Runtime requirements before a future isolated SQL write smoke:

- `directory.sql_write_test_enabled = true`
- SQL database is available.
- SQL write layer is available.
- `directory.write_mode = legacy`
- `directory.storage_mode = legacy`

The production modes must remain legacy during the isolated test so the smoke test cannot affect production Directory read or write behavior.

Diagnostics:

- `GET /api/pbxpuls/directory-write-readiness` now reports:
  - `sqlWriteTestEndpointAvailable`
  - `sqlWriteTestEnabled`
  - `canRunSqlWriteTest`
  - `sqlWriteTestBlockReason`
- `GET /api/pbxpuls/directory-runtime-effective` now reports:
  - `sqlWriteTestEndpointAvailable`
  - `sqlWriteTestEnabled`
  - `canRunSqlWriteTest`
  - `sqlWriteTestBlockReason`
  - `productionWriteEndpointsUseSql`

Audit:

- Blocked POST attempts write `directory_sql_write_test_blocked`.
- Audit details are safe and limited to actor, reason and `sqlWritePerformed: false`.
- Audit details must not include names, phone numbers, email addresses, comments, metadata values, raw payloads, tokens or secrets.

The next stage should be a runtime-check of the blocked SQL write test endpoint. A separate later stage can run a controlled one-contact isolated SQL write smoke only after explicitly enabling the safety flag.

## Stage 9.9.11 Directory SQL Isolated Smoke Documentation and Diagnostics Hardening

Stage 9.9.10 completed the first controlled isolated SQL write smoke for Directory.

Smoke result:

- The isolated endpoint created one artificial SQL contact.
- The isolated endpoint updated only that test contact.
- The isolated endpoint deleted only that test contact.
- Cleanup was verified with read-only SQL checks.
- `directory_contacts` had zero rows for the test id after cleanup.
- `directory_contact_metadata` had zero rows for the test id after cleanup.

Production state after the smoke:

- Directory reads remain `data/db.json`.
- Directory writes remain `data/db.json`.
- `directory.storage_mode = legacy`.
- `directory.write_mode = legacy`.
- `directory.sql_write_test_enabled = false`.
- `directory.write_mode = sql` remains blocked.
- Production SQL write is not unlocked.

Diagnostics:

- `GET /api/pbxpuls/directory-runtime-effective` now reports:
  - `isolatedSqlWriteSmokeAvailable: true`
  - `lastKnownIsolatedSqlWriteSmoke: "passed_manual_stage_9_9_10"`
  - `productionWriteEndpointsUseSql: false`
  - `existingDirectoryEndpointsSwitched: false`
  - `sqlWriteBranchBlocked: true`
- `GET /api/pbxpuls/directory-write-readiness` now reports:
  - `isolatedSqlWriteSmokePassed: true`
  - `isolatedSqlWriteSmokeStage: "9.9.10"`
  - `productionSqlWriteReady: false`
  - `productionSqlWriteBlockReason: "production_sql_write_not_unlocked"`

These fields are diagnostic status only. They do not run SQL writes, do not inspect contact data, and do not return personal data.

The next stage should design a controlled production SQL write unlock, still guarded and still separate from enabling `directory.write_mode = sql` in production.
