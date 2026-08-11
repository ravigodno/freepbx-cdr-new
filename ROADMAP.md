# PBXPuls Roadmap

## v5.8.4 — Site lead reporting

Status: completed

- Added a dedicated site-leads tab to Reports.
- Added KPI cards, lead dynamics, funnel, status, source, site and form charts.
- Documented MariaDB as the only persistent store for PBXPuls runtime data.

## Persistent storage consolidation

Status: required

- Inventory every remaining mutable `data/*.json` reader and writer.
- Add PBXPuls-owned MariaDB schemas and idempotent migrations for each module.
- Migrate data with preview, source/destination counts, transactional apply and rollback protection.
- Switch both reads and writes to MariaDB only after production verification.
- Remove file-backed runtime persistence and protect database data during every deployment.

## v5.8.3 — Reliable Bitrix Pull and linked lead drill-down

Status: completed

- A malformed Bitrix form result no longer blocks later results from other forms.
- Invalid Pull responses are reported as synchronization errors instead of silent success.
- Clicking a site-lead SLA sticker shows both the lead and its linked call.

## Purpose

This roadmap defines the planned development direction for PBXPuls.

It helps keep feature work focused and prevents random implementation outside the current product stage.

---

## v5.0.7 — Management Foundation

Status: completed

Goals:

- FreePBX REST OAuth stabilization
- Node.js 16 `fetch` compatibility
- AMI diagnostics stabilization
- Raw REST API visibility
- Extensions management foundation
- Backend preview foundation for extension create/update
- Initial Extensions UI

---

## v5.0.8 — Extensions Management Completion

Status: planned

Goals:

- Correct extension loading through REST aggregation
- `/core/users` as primary identity source
- `/userman/extensions` as secondary enrichment source
- Proper display of extension names
- Full extensions table
- Search and filtering
- Multi-select
- Create preview
- Update preview
- UI for bulk creation
- UI for bulk update
- Disabled apply until final validation
- Changelog display

Expected outcome:

PBXPuls can safely load, inspect, and preview extension changes.

---

## v5.0.9 — Extensions Apply and Templates

Status: planned

Goals:

- Enable create apply
- Enable update apply
- Per-extension results
- Error continuation
- Reload-required flag
- Extension templates
- Template CRUD UI
- Change log for extension operations
- Safe secret masking

Expected outcome:

PBXPuls can safely create and update extensions in bulk.

---

## v5.0.10 — Management Workspace Architecture

Status: completed

Goals:

- Management workspace architecture
- Compact Management navigation
- Placeholder surfaces for future modules
- UI text centralization for Management

---

## v5.2.0 — Trunk Lab Read-only Diagnostics

Status: in progress

Goals:

- Git library of anonymized operator templates
- JSON Schema for chan_sip and PJSIP templates
- chan_sip to PJSIP mapping profile
- Management UI section for Operator Templates
- Read-only template viewer
- Local-only chan_sip to PJSIP migration preview
- Documentation for Git Templates and future Local Working Configs

Out of scope:

- real Trunk creation or updates
- FreePBX REST apply calls
- BMO calls
- test Trunks, registration or test calls
- fwconsole reload
- storing real passwords or customer data

---

## v5.2.0 — Trunk Lab Read-only Diagnostics

Status: planned

Goals:

- Read PJSIP registrations, endpoints, contacts, auths and aors
- Read chan_sip registry, peers, users and settings
- Parse Asterisk CLI output into normalized diagnostics
- Show read-only Trunk Lab UI
- Mask secrets in raw snippets

---

## v5.3.0 — Trunk Lab Testing

Status: planned

Goals:

- Test trunk registration planning
- Test outbound call planning
- Read-only diagnostics expansion
- No apply without preview

---

## v5.4.0 — Trunks Management

Status: planned

Goals:

- Outbound route preview/apply
- Dial pattern validation
- Trunk dependency checks
- Conflict detection

---

## v5.5.0 — Outbound Routes

Status: planned

Goals:

- DID mapping
- Destination preview
- Duplicate DID checks
- Change log

---

## v5.6.0 — Inbound Routes

Status: planned

Goals:

- Reusable Dial Pattern validation
- Number range ownership metadata
- Route impact preview
- Import/export preparation

---

## v5.7.0 — Dial Patterns and Number Ranges

Status: planned

Goals:

- Department model
- Extension ranges per department
- Manager/role mapping
- RBAC integration foundation

---

## v5.8.0 — Departments and RBAC Foundation

Status: planned

Goals:

- Department model
- Extension ranges per department
- Manager/role mapping
- RBAC integration foundation

---

## v5.9.0 — Management Dashboard

Status: planned

Goals:

- Management Dashboard based on real module data
- Cross-module health and provisioning metrics
- Final-stage overview after Operator Templates, Trunk Lab, Trunks, Routes, Dial Patterns and Departments provide stable data

---

## Development Rules

Each version should focus on one major feature area.

Do not mix unrelated features in the same release.

Each major feature must include:

- backend API
- frontend UI
- preview
- safe apply if applicable
- audit log
- build verification
- documentation update when required

---

## Current Focus

Current active focus:

```text
v5.1.0 — Operator Templates Foundation
```

Trunk Lab v5.2.0 is read-only diagnostics work. Do not create or modify Trunks, apply Operator Templates, call FreePBX write APIs, call BMO write paths, run test calls, or run fwconsole reload in this release.
# External SIP phonebooks

Current implementation:

- Grandstream and Yealink XML adapters;
- protected per-profile URLs;
- shared and owner-scoped combined directories;
- profile filters, entry limits, activation and credential rotation;
- administrator UI and adapter tests.
- built-in LAN-only phonebook listener with automatic connected-subnet access.

Before production rollout:

- verify XML against the exact deployed phone models and firmware;
- validate reverse-proxy HTTPS and HTTP Basic forwarding;
- perform a read-only download test, then a controlled single-device trial;
- document model-specific refresh intervals and limits.
