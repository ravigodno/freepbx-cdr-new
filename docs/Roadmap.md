# PBXPuls Roadmap

## Current State

Extensions is considered complete for the current Provisioning Center stage.

Completed foundation:

- Extensions loading and normalized display.
- Bulk Create preview/apply through FreePBX BMO.
- Bulk Update preview/apply through FreePBX BMO.
- Single edit through the shared update preview/apply flow.
- Recording updates through real BMO/AstDB fields.
- Shared Preview → Apply → Result workflow for Extensions.
- Initial Design System components.
- Initial Operation Framework vocabulary.

## Near-Term Roadmap

1. Refactor Operation Framework into a shared layer.
2. Departments.
3. Extension Templates.
4. Operator Templates.
5. Trunks.
6. Routes.
7. Dial Patterns.
8. Number Ranges.
9. DID.
10. Operator balances.
11. Trunk Doctor / diagnostics.
12. Final optimization and performance pass.

## 1. Shared Operation Framework

Goal: move operation models and UI primitives out of the Extensions-only implementation.

Expected work:

- shared OperationType and ActionStatus types;
- shared preview item model;
- reusable preview/result storage helpers;
- common validation patterns;
- common operation UI components;
- clear module registration pattern.

Outcome: new modules can reuse Preview → Apply → Result without rebuilding the workflow.

## 2. Departments

Goal: introduce organizational grouping for future provisioning.

Expected work:

- department model;
- extension ranges per department;
- manager/role mapping;
- links to templates;
- preview-based bulk assignment.

## 3. Extension Templates

Goal: formalize reusable extension defaults.

Expected work:

- template CRUD review;
- supported field whitelist;
- safe secret handling;
- mapping from template to BMO create/update payload.

## 4. Operator Templates

Goal: create reusable operator-specific provisioning templates.

Expected work:

- trunk defaults;
- route defaults;
- DID/range metadata;
- balance/account metadata when available;
- no unmasked credential display.

## 5. Trunks

Goal: convert Trunks into the same safe provisioning lifecycle.

Expected work:

- verify available FreePBX API/BMO path;
- separate templates from live apply;
- preview conflicts;
- apply with per-item results;
- link diagnostics to Trunk Doctor without mixing concerns.

## 6. Routes

Goal: manage outbound and inbound routing safely.

Expected work:

- outbound route preview/apply;
- inbound route preview/apply;
- route pattern conflict detection;
- trunk dependency checks;
- changelog entries.

## 7. Dial Patterns

Goal: provide controlled dial pattern management.

Expected work:

- pattern syntax validation;
- duplicate/overlap detection;
- reusable pattern templates;
- route impact preview.

## 8. Number Ranges

Goal: make numbering capacity useful for provisioning decisions.

Expected work:

- verified import/update path;
- range search improvements;
- range ownership metadata;
- integration with DID and route previews.

## 9. DID

Goal: manage DID mapping through the common operation lifecycle.

Expected work:

- DID import/validation;
- destination preview;
- duplicate assignment detection;
- safe apply once API/BMO path is verified.

## 10. Operator Balances

Goal: provide operator/account balance visibility and operational context.

Expected work:

- define provider model;
- integrate current BalanceCenter direction;
- separate read-only balance data from provisioning mutations.

## 11. Trunk Doctor / Diagnostics

Goal: add focused diagnostics for trunks and routes.

Expected work:

- registration checks;
- SIP/PJSIP status;
- route reachability hints;
- AMI/CLI diagnostics with safe read-only defaults;
- clear separation from apply workflows.

## 12. Optimization and Performance

Goal: prepare PBXPuls for larger PBX installations.

Expected work:

- split large frontend/backend files;
- improve lazy loading;
- reduce bundle size;
- optimize extension loading/merge;
- reduce duplicated UI logic;
- improve table rendering for large datasets.

## Long-Term Goals

- Enterprise-grade FreePBX administration center.
- Safe bulk provisioning across all major PBX objects.
- Consistent operation framework for every mutating action.
- Strong audit trail and changelog.
- Reusable templates for operators, departments and routes.
- Diagnostics that help operators find configuration issues quickly.
- Strict secret masking and production-safe defaults.
- No automatic live PBX reloads without explicit operator action.

