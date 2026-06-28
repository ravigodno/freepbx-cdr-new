# PBXPuls Development Guidelines

## Purpose

This document is the internal development standard for PBXPuls. It exists to keep future modules consistent, safe and maintainable.

PBXPuls is a production project. Preserve existing behavior unless the task explicitly requires changing it.

## General Rules

- Read existing project documentation before non-trivial work.
- Search for existing helpers/components before adding new code.
- Extend working implementation instead of replacing it.
- Keep changes scoped to the requested task.
- Do not perform unrelated refactors.
- Do not commit or push unless explicitly requested.

## Safety Rules

Never run automatically:

- fwconsole reload
- fwconsole restart
- service restarts
- database writes
- FreePBX write operations
- bulk create/update/delete operations
- git reset/checkout/clean destructive commands

Live PBX mutation requires explicit preview, review and apply.

## Preview Before Apply

Every dangerous operation must support:

1. Preview
2. Review
3. Apply
4. Result

This applies to:

- extension create/update/delete;
- trunk changes;
- route changes;
- DID changes;
- dial pattern changes;
- department provisioning;
- CSV import;
- MAC assignment;
- any future FreePBX write operation.

Preview endpoints must not modify FreePBX.

Apply endpoints should use a stored previewId or equivalent preview payload and must return per-item results.

## Permissions and Confirmation

Dangerous PBX writes must require proper permissions. The current management code checks dangerous_pbx_write and bulk_extensions for extension write operations.

Destructive operations must require explicit user confirmation in the UI.

Delete operations require special care:

- dependency checks;
- affected routes/devices/users display;
- explicit confirmation phrase;
- per-item failure handling.

## Backend Rules

The backend owns PBX business logic.

Backend responsibilities:

- authentication and authorization;
- FreePBX API/BMO/GraphQL/AMI integration;
- preview generation;
- apply execution;
- whitelist enforcement;
- secret masking;
- changelog/audit records;
- per-item error handling.

Do not move PBX mutation rules into React components.

Do not duplicate FreePBX REST OAuth logic.

Do not invent REST endpoints. Use only documented, verified or already implemented endpoints.

## Frontend Rules

The frontend owns:

- forms;
- validation hints;
- user interaction;
- preview display;
- result display;
- calling backend endpoints.

Frontend must use shared Design System primitives for new work:

- PrimaryButton
- SecondaryButton
- DangerButton
- Card
- Section
- Toolbar
- PageHeader
- StatusBadge
- OperationSummary
- PreviewTable

Primary actions must use bg-blue-600.

## Operation Framework Rules

All new mass-operation modules must use the shared operation vocabulary:

- CREATE
- UPDATE
- DELETE
- IMPORT
- EXPORT

Statuses:

- SUCCESS
- WARNING
- ERROR
- SKIP
- CONFLICT

Preview item shape:

- object
- action
- status
- old
- new
- message
- diff when useful

Do not create a new preview table per module. Extend the shared PreviewTable if the common structure needs improvement.

## FreePBX Integration Rules

Preferred order:

1. Verified BMO/REST implementation already in PBXPuls.
2. Verified FreePBX REST API endpoint.
3. Verified GraphQL query.
4. AMI for operational/diagnostic actions.
5. MariaDB read-only fallback when API cannot provide required data.

Never use /extensions on the current FreePBX because it is verified as 404.

For Extensions identity:

- /core/users is the primary source.
- /userman/extensions is only enrichment for username/usermanId.
- userman description must not become displayName.

## BMO Rules

BMO apply payloads must be whitelisted.

UI-normalized display fields must not be blindly sent to BMO. Example: recording is a UI/preview field; extension recording apply must use real fields only:

- recording_in_external
- recording_out_external
- recording_in_internal
- recording_out_internal
- recording_ondemand
- recording_priority

## AMI Rules

- Centralize AMI connection behavior.
- Do not log AMI passwords or secrets.
- Test endpoints should use short-lived connections.
- Long-running listeners need controlled reconnect behavior.
- Commands that modify PBX state require explicit approval.

## Secrets and Logs

Never expose:

- passwords;
- SIP/PJSIP secrets;
- OAuth tokens;
- JWT tokens;
- API keys;
- AMI credentials.

Mask sensitive values in:

- logs;
- preview payloads;
- result payloads;
- raw debug output;
- changelog entries.

## Code Organization

When adding new functionality:

- prefer small reusable functions;
- keep one responsibility per function;
- reuse existing helpers;
- avoid duplicated logic between modules;
- avoid expanding large files when a new component/service is practical;
- keep backend business logic separate from frontend rendering.

Large existing files should be changed minimally unless a refactor task explicitly targets them.

## Verification

For code changes:

- run npm run lint;
- run npm run build;
- fix errors;
- show git diff --stat;
- summarize changed files.

For documentation-only changes:

- build is not required unless code/config changed;
- show created/changed documents;
- run git status --short;
- run git diff --stat.

## Commit Policy

Do not commit, tag or push unless explicitly requested.

Commit message format when requested:

- fix(scope): message
- feat(scope): message
- refactor(scope): message
- docs(scope): message


## UI Text and Localization Standard

User-facing text must not be hardcoded in new React components. Use src/locales/ru.ts for labels, descriptions, statuses, button captions and module text. Russian is the active UI language.

Do not translate professional terms and platform names such as Extension, SIP, PJSIP, Trunk, Outbound Route, Inbound Route, Dial Pattern, Number Range, REST, API, CSV, Preview, Apply, Reset, Result, Reload, BMO, FreePBX, Asterisk, GraphQL, JSON, UUID, LocalStorage, WebSocket, AMI and ARI.

Large modules must follow the PBXPuls module template: compact Header, Toolbar, Filters, Workspace and Preview → Apply → Result for mutating operations.

## Operator Templates Rules

Operator Git Templates live in templates/operators/ and must not contain secrets or personal/customer-specific data.

Forbidden fields and values include passwords, SIP secrets, tokens, client secrets, contract numbers, personal data and private customer IP addresses. Use placeholders such as passwordPlaceholder or secretPlaceholder.

Migration preview code must mask secret/password/token/clientSecret fields and must not save pasted values.

Operator Templates v5.1.0 is read-only. Do not create Trunks, call FreePBX REST apply endpoints, call BMO, register Trunks, run test calls or run fwconsole reload from this module.

Local Working Configs are future local PBX-specific files and must not be committed to Git.

## Trunk Lab Rules

Trunk Lab v5.2.0 is read-only and must run through the Management operation endpoint `POST /api/management/trunks/preview` with `operationType: "trunk_lab_diagnostics"`. It may execute only safe Asterisk CLI read commands through AMI.

Allowed command families for this module:

- pjsip show registrations/endpoints/contacts/auths/aors;
- sip show registry/peers/users/settings.

Forbidden in Trunk Lab v5.2.0:

- creating, updating or deleting Trunks;
- applying Operator Templates;
- FreePBX REST write calls;
- BMO write calls;
- fwconsole reload;
- test calls;
- route or Extension mutations;
- storing passwords or Local Working Configs.

Backend responses must mask secret/password/passwd/token/client_secret/auth_password before the frontend receives raw snippets.


Trunk Lab filters extension-looking SIP/PJSIP objects before creating diagnostics. Numeric SIP peers, numeric/numeric peers, numeric PJSIP endpoints, numeric AORs and numeric-auth endpoint patterns are excluded. AMI/CLI source failures are reported as source status, not fake diagnostics rows.
