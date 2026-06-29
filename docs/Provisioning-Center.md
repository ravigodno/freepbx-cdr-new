# Provisioning Center

## Purpose

Provisioning Center is the Management / Управление area for safe PBX provisioning. It is implemented primarily in src/modules/management/ProvisioningCenter.tsx with backend routes in server-management.ts.

The current completed module is Extensions. Other sections exist as early surfaces or future targets and must follow the same operation model.

## Current Navigation

The Management screen currently includes tabs/areas for:

- Branch / office-style provisioning helper;
- Numbering capacity;
- Extensions;
- Trunks;
- Routes;
- DID;
- Templates;
- Changelog.

Extensions is the main finalized provisioning workflow. Trunks, Routes and DID have older/early preview/apply surfaces and should be refactored before being treated as complete modules.

## Extensions Workspace

The Extensions workspace uses a common operation area with these tabs:

- Массовое изменение / Bulk Update
- Массовое создание / Bulk Create
- Удаление / Delete Preview
- CSV / Импорт

Each operation is expected to follow the same layout:

1. Operation parameters.
2. Preview button.
3. Shared Preview area.
4. Apply button.
5. Result area.

There must not be separate preview tables inside individual operation tabs.

## Bulk Create

Bulk Create supports range/manual/CSV-oriented creation modes in the UI and calls backend preview/apply endpoints:

- POST /api/management/extensions/create-preview
- POST /api/management/extensions/create-apply

The backend checks conflicts against live extensions and creates supported extensions through FreePBX BMO Core addDevice/addUser.

Strict/fill-missing conflict behavior exists in the current backend preview logic.

## Bulk Update

Bulk Update calls:

- POST /api/management/extensions/update-preview
- POST /api/management/extensions/update-apply

The update workflow:

1. UI builds selectedExtensions and patchFields.
2. Backend loads live extensions.
3. Backend normalizes preview fields.
4. Backend builds applyPayload with only supported BMO fields.
5. Preview shows old/new/diff.
6. Apply reuses previewId and applies per item.

Recording is a special case: UI can show normalized Recording, but apply must send only real BMO/AstDB fields:

- recording_in_external
- recording_out_external
- recording_in_internal
- recording_out_internal
- recording_ondemand
- recording_priority

## Single Edit

Single extension edit reuses the same update-preview/update-apply backend flow with selectedExtensions containing one extension.

Single edit must not bypass preview. It should continue to use the shared Preview and Result areas.

## Delete Preview

Delete currently builds a frontend preview and requires explicit confirmation language. Backend deletion is not implemented yet.

Status: Future/TODO for actual FreePBX deletion apply.

Rules for future delete implementation:

- must use backend preview;
- must check dependencies and routing impact;
- must require explicit confirmation;
- must return per-item result;
- must not run fwconsole reload automatically.

## CSV / Import

CSV / Import is prepared as a separate workspace tab. Current CSV create flow is routed through the Bulk Create CSV mode.

Future import work should provide:

- CSV validation;
- field mapping;
- duplicate detection;
- preview before apply;
- row-level errors;
- exportable error report.

## Operation Framework

Current frontend model in ProvisioningCenter.tsx defines the initial operation vocabulary:

- OperationType: CREATE, UPDATE, DELETE, IMPORT, EXPORT
- ActionStatus: SUCCESS, WARNING, ERROR, SKIP, CONFLICT
- OperationPreviewItem: object, action, status, oldValue, newValue, message, diff

Current shared UI components include:

- OperationToolbar
- OperationSummary
- PreviewTable

This framework is still local/early and should be extracted into common frontend/backend modules before adding large new provisioning areas.

## Preview → Apply → Result Lifecycle

All provisioning operations must follow this lifecycle:

1. User fills operation parameters.
2. User clicks Preview.
3. Backend loads current PBX state and validates requested changes.
4. Backend stores preview and returns previewId.
5. UI displays shared summary and preview table.
6. User reviews changes and clicks Apply.
7. Backend applies only supported fields from stored preview payload.
8. Backend continues per item after item-level errors.
9. Backend writes changelog.
10. UI displays Result.
11. If reloadRequired is true, UI informs the user but does not run reload.

## Backend Endpoints Used by Extensions

Current core endpoints:

- GET /api/management/extensions
- GET /api/management/extensions/export-csv
- GET /api/management/extensions/rest-raw
- GET /api/management/extensions/ui-settings
- PUT /api/management/extensions/ui-settings
- POST /api/management/extensions/create-preview
- POST /api/management/extensions/create-apply
- POST /api/management/extensions/update-preview
- POST /api/management/extensions/update-apply
- GET /api/management/change-log

Additional extension/recording helper endpoints exist under /api/freepbx/extensions and should be kept consistent with the same whitelist and safety rules.

## Recommendations for Future Modules

Departments:

- define department object model first;
- link extension ranges, templates and managers;
- use PreviewTable for generated extensions, queues or groups.

Operator Templates:

- model operator-specific trunk defaults;
- separate template CRUD from live PBX apply;
- never store unmasked secrets in preview/result output.

Trunks:

- refactor old trunk screen into the Operation Framework;
- verify REST/BMO capabilities before apply;
- include registration/health diagnostics separately from provisioning.

Routes:

- split outbound routes and inbound routes if needed;
- preview pattern conflicts and trunk dependencies;
- reuse common summary and preview table.

Dial Patterns:

- validate pattern syntax;
- show generated route impact;
- detect overlaps/conflicts.

DID:

- validate number ownership/ranges;
- preview destination mapping;
- detect duplicate DID assignments.

Number Ranges:

- keep numbering capacity separate from PBX mutation;
- use it as lookup/enrichment for routes and DID.

## TODO Before Major Expansion

- Extract operation types and preview item types from ProvisioningCenter.tsx.
- Move operation UI components fully to src/components/ui.
- Convert older Trunks, Routes and DID sections to the shared lifecycle.
- Add backend shared preview storage helpers by operation type/module.
- Add consistent import/export abstractions.


## v5.1.0 Management Navigation

The Management tab now starts from Overview instead of opening Extensions directly. The internal navigation is a compact single-line header tab strip:

- Overview
- Extensions
- Departments
- Operator Templates
- Trunks
- Outbound Routes
- Inbound Routes
- Dial Patterns
- Number Ranges

Overview shows currently available object counts from already loaded frontend data and marks future modules as Coming Soon or Not Implemented. Future sections are separate React components and must be implemented through the shared Operation Framework and Design System.

Trunks, Routes, Departments and number-related modules are intentionally placeholders at this stage. No backend API is connected for these future sections in v5.1.0 foundation work.

## v5.1.0 UX Update

Management uses a compact horizontal top navigation with LocalStorage persistence for the selected section. The old left-side internal navigation was removed so wide workspaces such as Extensions can use the full page width.

User-facing Management strings must come from src/locales/ru.ts. New Management components must not hardcode labels, descriptions, status text or button captions directly in React components.

## Compact Header Standard

Management now uses the compact PBXPuls module header: Wrench icon, Управление title and all Management section tabs in one horizontal row. There is no separate subtitle row and no left-side navigation, so Extensions and other wide workspaces keep the full available page width.

The selected Management tab is persisted in LocalStorage. The tab strip must remain single-line and horizontally scrollable.

## Operator Templates Foundation

Operator Templates is now a full read-only Management section for v5.1.0. It displays shipped Git Templates from templates/operators/ through a temporary frontend adapter in src/modules/management/operatorTemplates/operatorTemplatesData.ts.

The adapter is not the source of truth. The source of truth remains templates/operators/ until a backend/template loader is implemented.

The section includes:

- template statistics;
- filters by operator, status, technology, region and country;
- table columns for operator, template, region, technology, status, FreePBX, Asterisk and actions;
- template details for settings, required user fields, number formats, diagnostics, notes, security and migration;
- local-only chan_sip to PJSIP migration preview.

The migration preview parses pasted key=value text only. It masks secret/password/token/clientSecret values and does not save data. It does not read real FreePBX trunks, call REST/BMO, create Trunks, register Trunks or run reload.

Git Templates differ from future Local Working Configs. Git Templates are anonymized and committed. Local Working Configs will be PBX-specific and must not be committed to Git.

## Trunk Lab Read-only Diagnostics

Trunk Lab is the v5.2.0 read-only diagnostics section in Management. It runs through `POST /api/management/trunks/preview` with `operationType: "trunk_lab_diagnostics"`, reads Asterisk CLI state through existing AMI command execution, and normalizes PJSIP/chan_sip Trunk status.

Read commands:

- PJSIP: pjsip show registrations, endpoints, contacts, auths and aors.
- chan_sip: sip show registry, peers, users and settings.

The Management preview response returns `success`, `previewId`, `type`, `operationType`, `items`, `counts`, `diagnostics`, `summary`, masked `raw`, `readOnly: true` and `reloadRequired: false`. The section displays summary cards, filters, a diagnostics table and a details panel with Registration, Endpoint/Peer, Contacts, Auth, Problems, Recommendations and masked raw snippets.

Trunk Lab does not create, update or delete Trunks. It does not apply Operator Templates, call BMO write paths, call FreePBX REST apply endpoints, run test calls or run fwconsole reload.

Operator Template matching is read-only and limited to simple name/operator hints.


Trunk Lab filters extension-looking SIP/PJSIP objects before creating diagnostics. Numeric SIP peers, numeric/numeric peers, numeric PJSIP endpoints, numeric AORs and numeric-auth endpoint patterns are excluded. AMI/CLI source failures are reported as source status, not fake diagnostics rows.


Trunk Lab v5.2.0 uses FreePBX DB `asterisk.trunks` as the primary read-only Trunk inventory and uses Asterisk CLI only as runtime enrichment. CLI-only peers/endpoints are not shown as Trunks unless they match a DB trunk record.


Trunk Lab v5.3.0 adds controlled testing operations through the same Management preview endpoint. Registration and Peer/Contact tests are read-only. Outbound call test requires explicit confirmation, may be billed by the operator, and uses current FreePBX Outbound Routes without changing configuration.

## FreePBX Extensions Provider Chain

Extensions inventory now uses a universal provider chain instead of relying on legacy REST/ajax endpoints.

Default Auto order:

1. BMO local provider.
2. FreePBX GraphQL API provider.
3. Database readonly provider.
4. Legacy REST fallback.

Legacy REST endpoints /userman/extensions and /core/users are kept only as the last fallback. On FreePBX 17, ajaxRequest declined responses are treated as provider warnings and must not break loading when GraphQL or another provider has returned extensions.

The Management Extensions screen displays the active provider returned by the backend: BMO local, GraphQL API, Database readonly or Legacy REST.
