# PBXPuls Architecture

## Purpose

PBXPuls is an internal administration, analytics, and provisioning platform for FreePBX. The project combines CDR analytics, monitoring tools, directory management, access control, click-to-call, and the Management / Provisioning Center.

The product goal is to provide a safer and more ergonomic administration layer over FreePBX. PBXPuls must not bypass FreePBX safety rules, expose secrets, or perform live PBX changes without an explicit preview/apply flow.

## Technology Stack

Frontend:

- React 19
- TypeScript
- Vite
- TailwindCSS
- lucide-react icons
- Recharts and supporting UI libraries

Backend:

- Node.js
- Express
- TypeScript bundled with esbuild
- node-fetch v2 for Node 16 compatibility
- mysql2 for MariaDB/CDR access
- local JSON storage for PBXPuls data
- FreePBX REST, GraphQL, BMO bridge, AMI, and limited ARI-related configuration fields

Runtime:

- PM2-compatible Node service
- production PBX environment
- build output in dist/

## Repository Structure

Current high-level structure:

~~~text
/
├── server.ts
├── server-management.ts
├── src/
│   ├── App.tsx
│   ├── types.ts
│   ├── components/
│   │   ├── common/
│   │   ├── monitoring/
│   │   ├── reports/
│   │   └── ui/
│   └── modules/
│       ├── access/
│       └── management/
├── setup/
├── docs/
├── README.md
├── AGENTS.md
├── PBXPULS_ARCHITECTURE.md
├── PBXPULS_UI_GUIDELINES.md
├── PBXPULS_KNOWLEDGE_BASE.md
├── FREEPBX_API_REFERENCE_FULL.md
└── ROADMAP.md
~~~

The codebase currently still contains substantial logic in large files, especially server.ts and src/App.tsx. New work should move toward smaller module files, but existing working behavior must be preserved.

## Frontend Architecture

The frontend entry point is src/App.tsx. It owns the main shell, navigation, authentication state, tabs, and many legacy screens.

Important frontend areas:

- src/modules/access: permissions, roles, access users, role matrix.
- src/modules/management/ProvisioningCenter.tsx: Management / Provisioning Center UI.
- src/modules/management/BalanceCenter.tsx: operator/balance-related screen.
- src/components/monitoring: monitoring and diagnostics tabs.
- src/components/reports: reports UI.
- src/components/ui/DesignSystem.tsx: beginning of shared UI primitives.

The frontend is responsible for forms, tables, client-side interaction, preview display, and calling backend APIs. PBX mutation rules must remain in the backend.

## Backend Architecture

server.ts is the primary Express server. It contains:

- authentication and authorization routes;
- settings routes;
- user and role management;
- directory routes;
- CDR and reports queries;
- recordings access;
- click-to-call through AMI;
- live session and diagnostics routes;
- monitoring and network tools;
- registration of management routes through registerManagementRoutes(app, requireAuth).

server-management.ts contains Management / Provisioning Center logic. It contains:

- local management storage helpers;
- extension template and trunk template routes;
- numbering capacity routes;
- FreePBX REST/OAuth helpers;
- FreePBX GraphQL helpers;
- BMO bridge helpers;
- normalized extension loading and merge logic;
- Extensions preview/apply endpoints;
- early trunk, route, DID, rollback and changelog endpoints.

The backend owns FreePBX business logic, preview generation, apply execution, permission checks, and audit/change logging.

## FreePBX Integration

PBXPuls integrates with FreePBX through several mechanisms. The current verified priority is:

1. FreePBX BMO bridge for supported extension create/update operations.
2. FreePBX REST API where endpoints are verified.
3. FreePBX GraphQL for enrichment when verified queries exist.
4. AMI for Asterisk operational commands, click-to-call, DTMF/listener and diagnostics.
5. MariaDB read-only queries for CDR and diagnostics where REST is not suitable.

MariaDB write access is disabled by architecture directive in management code. fwconsole reload is not executed automatically.

## REST API

Verified REST behavior from FREEPBX_API_REFERENCE_FULL.md:

- REST base is configured through settings.
- OAuth uses client_credentials and application/x-www-form-urlencoded.
- GET /core/users is verified and is the primary source for extension identity and display names.
- GET /userman/extensions is verified only for username/usermanId enrichment.
- GET /extensions returns 404 on the current PBX and must not be used.

REST calls must use centralized helpers. New code must not scatter direct FreePBX fetch calls across modules.

## BMO Bridge

The current Extensions implementation uses PHP scripts executed from Node to bootstrap FreePBX and access BMO objects.

Current BMO responsibilities:

- load rich extension/user/device data;
- create extensions through Core BMO addDevice/addUser;
- update whitelisted user fields through Core BMO;
- update call waiting through Callwaiting BMO when available;
- update recording using real BMO/AstDB fields only.

The apply whitelist for extension update is intentionally narrow. UI-only normalized fields such as recording may be shown in preview but must not be sent to BMO update.

## AMI / ARI

AMI is used in server.ts for:

- click-to-call Originate;
- test AMI connection;
- command execution for selected diagnostics;
- DTMF listener events;
- live sessions and channel snapshots.

AMI credentials are loaded from settings/environment and must not be logged. Test connections should be short-lived. Long-running listeners must avoid uncontrolled reconnect loops.

ARI is present in project settings/types as configuration surface, but no complete ARI module is currently documented in the inspected code. Future ARI work should be treated as TODO and must follow the same centralized connection and secret-masking rules.

## Main Modules

Current modules:

- Dashboard/CDR: CDR table, call chronology, reports, stats.
- Directory: phone directory, import/sync, blacklist-related actions.
- Monitoring: active calls, CLI tools, DB explorer, network tools, packet capture helpers.
- Access: roles, permissions, access users.
- Management / Provisioning Center: Extensions, templates, numbering capacity, early trunks/routes/DID surfaces.
- Balance Center: operator/balance-related management screen.
- Settings: PBXPuls settings, DB/AMI/FreePBX API tests.

## Component Interaction

Typical flow:

1. User works in React UI.
2. UI calls PBXPuls backend endpoint with JWT Authorization header.
3. Backend checks authentication and permissions.
4. Preview endpoint loads current PBX state and builds per-object preview.
5. UI displays Summary and PreviewTable.
6. User confirms Apply.
7. Apply endpoint executes only supported changes, records per-item result, writes changelog, and returns reloadRequired when FreePBX reload is needed.
8. UI displays Result and never runs fwconsole reload automatically.

## Future / TODO

- Split server.ts and server-management.ts into smaller backend modules.
- Move Operation Framework into a shared frontend/backend model.
- Centralize all reusable UI primitives under src/components/ui.
- Document and implement future Trunks, Routes, Departments, DID and Dial Patterns with the same preview/apply lifecycle.
- Add formal ARI module only after verified requirements exist.

## Operator Templates Architecture

Operator Templates introduces a Git-backed template library under templates/operators/. These files are shipped with PBXPuls and are the source of truth for generic operator settings.

The frontend module lives in src/modules/management/operatorTemplates/. Until a backend/template loader exists, operatorTemplatesData.ts mirrors template metadata only for display.

Git Templates are anonymized and may include SIP/PJSIP defaults, public server names, codecs, DTMF, NAT hints, number formats and diagnostics notes. They must never include secrets, tokens, personal customer logins, contract numbers or private customer data.

Local Working Configs are planned separately. They may contain installation-specific values and must remain outside Git.

The v5.1.0 migration preview is a pure frontend parser for pasted chan_sip key=value text. It does not read live PBX trunks and does not perform FreePBX mutations. Trunk Lab, test Trunks and live diagnostics are future modules.
