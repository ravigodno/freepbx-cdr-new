# PBXPuls Architecture

## Project Overview

PBXPuls is a modern management, analytics, and administration platform for FreePBX.

The long-term goal is to become a complete enterprise-grade administration center for FreePBX that is faster, safer, and more convenient than the native FreePBX interface.

PBXPuls must remain:

- modular;
- extensible;
- production-ready;
- maintainable;
- safe for live PBX environments.

Maintainability is more important than short-term implementation speed.

---

## Technology Stack

### Backend

- Node.js
- Express
- TypeScript
- FreePBX REST API
- Asterisk AMI
- MariaDB only when REST cannot provide required data
- Local JSON storage for PBXPuls state, previews, templates, and logs

### Frontend

- React
- TypeScript
- Vite
- TailwindCSS
- Component-based architecture

### Runtime

- PM2
- Sangoma Linux / CentOS-like environment
- Node.js 16 compatibility must be preserved unless migration is explicitly planned

---

## Repository Structure

Recommended structure:

```text
/
├── server.ts
├── server-management.ts
├── src/
│   ├── App.tsx
│   ├── components/
│   ├── modules/
│   │   ├── access/
│   │   ├── balance/
│   │   ├── cdr/
│   │   ├── directory/
│   │   ├── management/
│   │   ├── monitoring/
│   │   └── reports/
│   ├── hooks/
│   ├── services/
│   ├── types.ts
│   └── utils/
├── data/
│   ├── db.json
│   ├── extension-templates.json
│   ├── management-change-log.json
│   └── management-previews.json
├── setup/
├── AGENTS.md
├── PBXPULS_ARCHITECTURE.md
└── ROADMAP.md
```

If new backend modules are introduced, they should follow this pattern:

```text
server/
├── api/
├── helpers/
├── services/
├── storage/
└── types/
```

Do not introduce a new structure without checking existing code first.

---

## Core Principles

- The project must remain modular.
- Never implement large monolithic files.
- Never implement huge functions.
- One function should have one responsibility.
- Reuse existing helpers whenever possible.
- Avoid duplicated logic.
- Never replace working functionality.
- Always extend existing functionality.
- Prefer small, testable functions.
- Prefer explicit names.
- Prefer readability over cleverness.

---

## Backend Architecture

The backend is responsible for:

- authentication;
- authorization;
- FreePBX REST API communication;
- Asterisk AMI communication;
- MariaDB fallback when necessary;
- local configuration storage;
- preview generation;
- apply execution;
- audit logging;
- masking secrets;
- protecting live PBX operations.

Business logic belongs in the backend.

The frontend must not implement PBX business rules.

---

## Frontend Architecture

The frontend is responsible for:

- visualization;
- forms;
- client-side validation;
- user interaction;
- calling backend API;
- presenting preview and result data.

The frontend should not contain PBX-specific mutation logic.

Large pages should be split into reusable components.

Prefer creating new components over expanding very large existing components.

---

## API Design

PBXPuls backend APIs should follow this naming style:

```text
/api/module/action
```

Examples:

```text
GET  /api/management/extensions
POST /api/management/extensions/create-preview
POST /api/management/extensions/create-apply
POST /api/management/extensions/update-preview
POST /api/management/extensions/update-apply
GET  /api/management/change-log
```

Rules:

- Preview endpoints must never modify FreePBX.
- Apply endpoints must require preview data or `previewId`.
- Apply endpoints must return per-item results.
- Apply endpoints must continue processing after an item-level error.
- Apply endpoints must never expose secrets.

---

## FreePBX Integration

Preferred integration order:

1. FreePBX REST API
2. Asterisk AMI
3. MariaDB fallback only when REST cannot provide the required information

Rules:

- Never invent REST endpoints.
- Never guess endpoint names.
- Reuse existing REST helpers.
- Reuse working implementation from `freepbx-api-dashboard` when available.
- Never duplicate OAuth logic.
- Never duplicate REST authentication logic.
- Never replace a working REST integration without proof.
- Do not introduce temporary workarounds if a proper REST solution exists.

---

## FreePBX REST API Rules

All FreePBX REST communication must go through common helper functions.

Do not scatter direct `fetch()` calls throughout the project.

Authentication must be centralized.

OAuth handling must exist in one place.

When implementing or modifying FreePBX REST functionality:

1. Search existing PBXPuls implementation.
2. Search existing helpers.
3. Search `freepbx-api-dashboard`.
4. Check project documentation.
5. Check verified raw API responses.
6. Implement only after confirming the correct endpoint.

---

## AMI Rules

AMI is used for live Asterisk interaction and diagnostics.

Rules:

- AMI connection management must be centralized.
- Avoid duplicated listeners.
- Reconnect logic must use backoff.
- Test endpoints must use independent short-lived AMI connections.
- Never expose AMI secrets.
- Never create uncontrolled reconnect loops.

---

## MariaDB Rules

MariaDB is a fallback, not the default source.

Use MariaDB only when:

- REST cannot provide required data;
- AMI cannot provide required data;
- historical CDR data is required;
- FreePBX configuration data is unavailable through REST.

When using MariaDB:

- prefer read-only queries;
- never write to FreePBX tables without explicit instruction;
- document why REST was not enough;
- isolate SQL logic in backend helpers.

---

## Local Storage

PBXPuls may use local JSON files for internal state:

```text
data/db.json
data/extension-templates.json
data/management-change-log.json
data/management-previews.json
```

Rules:

- Do not store secrets in plain text.
- Mask secrets in logs and previews.
- Preview storage is temporary.
- Changelog must never contain raw passwords or tokens.
- Local cache must not be treated as source of truth when live PBX data is required.

---

## Modules

PBXPuls consists of independent modules.

Current modules:

- Dashboard
- CDR
- Balance
- Directory
- Management
- Analytics
- Settings
- Monitoring
- Reports

Future modules:

- Extensions Management
- Trunks Management
- Routes Management
- Queues Management
- Ring Groups
- IVR
- Time Conditions
- Phone Provisioning
- AI Assistant

Each module should be self-contained.

Shared logic should live in reusable helpers or services.

---

## Management Module

The Management module is intended to become a complete FreePBX administration interface.

Every managed entity should eventually support:

- Load
- Search
- Filter
- Preview
- Create
- Update
- Delete
- Import
- Export
- Templates
- Audit Log
- Rollback when possible

Supported entities:

- Extensions
- Trunks
- Outbound Routes
- Inbound Routes
- Queues
- Ring Groups
- IVR
- Time Conditions

All write operations must support Preview before Apply.

---

## Extensions Management

Extensions Management should support:

- loading real FreePBX extensions;
- correct aggregation of REST sources;
- search and filtering;
- selection of multiple extensions;
- mass creation;
- mass update;
- templates;
- preview;
- apply;
- changelog;
- safe handling of secrets.

Expected REST source strategy:

- `/core/users` is the primary source for real extension identity and names.
- `/userman/extensions` may be used as a secondary enrichment source.
- `description` from `/userman/extensions` must not be used as the extension display name.
- Additional technical data should come from verified REST endpoints or existing helper implementations.

---

## Preview First

Every dangerous operation must support:

```text
Preview
↓
Review
↓
Apply
```

No direct destructive action may bypass preview.

Preview must show:

- target object;
- action;
- old values;
- new values;
- conflict status;
- error status;
- masked secrets.

Apply must show:

- success count;
- failure count;
- skipped count;
- per-item result;
- whether FreePBX reload is required.

---

## Templates

Templates should be reusable profiles.

Template examples:

- Office
- Call Center
- Sales
- Support
- Warehouse
- Yealink
- Grandstream

Templates may include:

- technology;
- context;
- voicemail;
- recording;
- call waiting;
- outbound CID;
- emergency CID;
- email pattern;
- codec policy;
- transport policy;
- advanced raw parameters.

Templates must never store secrets in plain text unless explicitly designed with secure handling.

---

## Audit Log

Every apply operation must write an audit entry.

Audit entries should include:

- timestamp;
- operation;
- affected objects;
- result summary;
- success count;
- failure count;
- skipped count;
- user if available;
- masked details.

Audit logs must not contain secrets.

---

## Security

Never expose:

- passwords;
- SIP secrets;
- PJSIP secrets;
- OAuth tokens;
- JWT tokens;
- API keys.

Always mask sensitive values in:

- logs;
- raw API output;
- preview output;
- changelog entries;
- UI responses.

---

## Build Policy

Every implementation must end with:

```bash
npm run build
```

Build errors must be fixed.

The final response should include:

- build status;
- changed files;
- `git diff --stat`;
- remaining risks;
- next recommended step.

Do not create commits unless explicitly requested.

---

## Naming Conventions

### Components

```text
ComponentName.tsx
```

### Backend helpers

```text
feature-helper.ts
feature-service.ts
feature-types.ts
```

### API paths

```text
/api/module/action
```

Examples:

```text
/api/management/extensions
/api/management/extensions/create-preview
/api/management/extensions/create-apply
/api/management/extensions/update-preview
/api/management/extensions/update-apply
```

---

## Long-term Goal

PBXPuls should become a complete enterprise management platform for FreePBX that exceeds the capabilities of the native FreePBX interface while remaining modular, maintainable, safe, and production-ready.
