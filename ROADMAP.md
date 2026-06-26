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

## v5.1.0 — Trunks Management

Status: planned

Goals:

- Load trunks
- View trunk configuration
- Create trunk preview
- Update trunk preview
- Apply trunk changes
- Trunk templates by operator
- SIP/PJSIP trunk profiles
- Change log

---

## v5.1.1 — Routes Management

Status: planned

Goals:

- Outbound routes
- Inbound routes
- DID mapping
- Route patterns
- Preview/apply
- Conflict detection
- Change log

---

## v5.2.0 — Queues and Ring Groups

Status: planned

Goals:

- Load queues
- Load ring groups
- Manage members
- Bulk member updates
- Department-based templates
- Preview/apply
- Change log

---

## v5.3.0 — IVR and Time Conditions

Status: planned

Goals:

- IVR list
- IVR preview/update
- Time groups
- Time conditions
- Holiday schedules
- Preview/apply
- Change log

---

## v5.4.0 — Diagnostics and Provisioning Health

Status: planned

Goals:

- PBX connection health
- MariaDB health
- AMI health
- ARI health
- REST health
- OAuth status
- FreePBX version detection
- Asterisk version detection
- Module availability
- REST endpoint compatibility matrix

---

## v5.5.0 — Organization Builder

Status: future

Goals:

- Create departments
- Assign extension ranges
- Create queues
- Create ring groups
- Assign templates
- Department managers
- Access control integration
- Full preview/apply

---

## v5.6.0 — Import/Export Center

Status: future

Goals:

- Excel import
- CSV import
- Export extensions
- Export trunks
- Export routes
- Validation before import
- Preview before apply
- Error reports

---

## v5.7.0 — Rollback and Snapshots

Status: future

Goals:

- Snapshot before apply
- Compare snapshot with current PBX
- Rollback eligible changes
- Change diff viewer
- Operation history

---

## v5.8.0 — AI Assistant

Status: future

Goals:

- AI-guided diagnostics
- AI-generated previews
- Natural language PBX provisioning
- Safe approval workflow
- No direct apply without confirmation

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
v5.0.8 — Extensions Management Completion
```

Do not start Trunks, Routes, Queues, or IVR until Extensions Management reaches a stable working state.
