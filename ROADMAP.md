# PBXPuls Roadmap

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

## v5.1.0 — Operator Templates Foundation

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

## v5.2.0 — Trunk Lab Testing

Status: planned

Goals:

- Trunk diagnostics planning
- Registration and media checks design
- Safe read-only diagnostic workflow
- No automatic live PBX mutation

---

## v5.3.0 — Trunks Management

Status: planned

Goals:

- Load trunks
- View trunk configuration
- Create/update previews
- Apply only after verified API/BMO path
- Change log

---

## v5.4.0 — Outbound Routes

Status: planned

Goals:

- Outbound route preview/apply
- Dial pattern validation
- Trunk dependency checks
- Conflict detection

---

## v5.5.0 — Inbound Routes

Status: planned

Goals:

- DID mapping
- Destination preview
- Duplicate DID checks
- Change log

---

## v5.6.0 — Dial Patterns and Number Ranges

Status: planned

Goals:

- Reusable Dial Pattern validation
- Number range ownership metadata
- Route impact preview
- Import/export preparation

---

## v5.7.0 — Departments and RBAC Foundation

Status: planned

Goals:

- Department model
- Extension ranges per department
- Manager/role mapping
- RBAC integration foundation

---

## v5.8.0 — Management Dashboard

Status: planned

Goals:

- Management Dashboard based on real module data
- Cross-module health and provisioning metrics
- Final-stage overview after Operator Templates, Trunks, Routes, Dial Patterns and Departments provide stable data

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

Operator Templates v5.1.0 is read-only foundation work. Do not create real Trunks, call FreePBX apply APIs, call BMO, run test calls, or run fwconsole reload in this release.
