# PBXPuls Agent Instructions

## Purpose

This file defines how AI coding agents must work inside the PBXPuls repository.

PBXPuls is a production project. The agent must protect existing functionality, avoid unnecessary rewrites, and follow the project architecture.

Before implementing any feature, the agent must read `PBXPULS_ARCHITECTURE.md` completely and use it as the primary design reference.

---

## General Rules

- This is a production project.
- Always preserve existing functionality unless explicitly instructed otherwise.
- Never replace working functionality with a new implementation unless explicitly requested.
- New functionality must either extend existing functionality or be implemented as a separate module/function.
- Always prefer extending over replacing.
- Never redesign a subsystem unless explicitly requested.
- Improve existing architecture incrementally.
- Do not create commits, tags, or pushes unless explicitly requested.

---

## Required Workflow

For every development task, follow this order:

1. Read `PBXPULS_ARCHITECTURE.md`.
2. Study the existing implementation.
3. Search for existing helpers, APIs, components, and prior implementations.
4. Produce a short implementation plan.
5. Implement the minimum required change.
6. Run `npm run build`.
7. Fix build errors.
8. Show `git diff --stat`.
9. Summarize changed files.
10. Stop.

Never skip verification.

---

## Research Phase

For all read-only operations, proceed automatically without asking for confirmation when the tool policy allows it.

Read-only operations include:

- reading files
- searching files
- `grep`
- `rg`
- `find`
- `ls`
- `tree`
- `cat`
- `sed -n`
- `awk`
- `head`
- `tail`
- `git status`
- `git diff`
- `git log`
- `git show`
- `npm list`
- inspecting project structure
- inspecting REST API responses
- inspecting configuration
- inspecting `package.json`
- inspecting source code
- inspecting TypeScript types
- inspecting React components

Continue read-only investigation automatically until enough information has been collected.

Do not interrupt research to ask permission.

---

## Write Operations

Ask for confirmation before operations that modify project or system state, including:

- editing source files
- deleting files
- renaming files
- `git add`
- `git commit`
- `git push`
- `git tag`
- `git reset`
- `git checkout`
- `git clean`
- `npm install`
- `pm2 restart`
- `systemctl`
- `fwconsole reload`
- database schema changes
- changing FreePBX configuration
- modifying a live PBX
- running destructive commands

---

## Existing Implementation First

Before implementing new functionality:

1. Search for an existing implementation.
2. Search existing helper functions.
3. Search related modules.
4. Search the `freepbx-api-dashboard` project when working with FreePBX REST API.
5. Reuse or extend existing code whenever possible.
6. Create a new implementation only if no suitable implementation exists.

Do not duplicate logic that already exists.

---

## Architecture Rules

- Prefer modular code.
- One function should have one responsibility.
- Reuse existing helpers whenever possible.
- Avoid duplicated logic.
- Never create huge monolithic functions.
- Prefer small reusable modules.
- Keep business logic in backend.
- Keep frontend focused on UI, forms, validation, and API calls.

---

## Large Files

When modifying files larger than 1000 lines:

- Never rewrite the whole file.
- Modify only the minimum required code.
- Keep existing formatting.
- Keep existing comments.
- Keep `git diff` as small as possible.
- Never replace an entire component when only part of it needs changes.

---

## User Interface

- Never replace existing UI unless explicitly instructed.
- Always extend existing UI.
- If a new screen or feature is required, create a new component whenever practical.
- Preserve existing components.
- Preserve existing behavior.
- Preserve existing styling.
- Never remove controls, buttons, dialogs, or pages unless explicitly instructed.
- When refactoring UI, keep backward compatibility and minimize visual changes.

---

## Feature Completion

When implementing a requested feature:

- Do not stop after completing only one small subtask.
- Continue until the requested feature is complete.
- Backend and frontend must be consistent.
- Build must succeed.
- Obvious TODOs must be resolved.
- Stop only if destructive actions require confirmation, required information is unavailable, the implementation would affect the live PBX, or the user explicitly requests to stop.

---

## FreePBX Rules

When working with FreePBX:

- Never invent REST endpoints.
- Never guess endpoint names.
- Use only documented, existing, or previously verified endpoints.
- Never replace a working REST implementation without proof.
- Prefer extending existing PBXPuls architecture.
- Reuse existing API helpers.
- Do not implement temporary workarounds when the correct REST solution exists.
- Use MariaDB only when REST cannot provide the required information.
- Do not change live PBX configuration without explicit confirmation.

---

## FreePBX REST API

All FreePBX REST communication must go through common helper functions.

Rules:

- Never scatter direct `fetch()` calls across the project.
- Authentication must be centralized.
- OAuth handling must exist in one place.
- Reuse existing FreePBX REST helper methods.
- When working with FreePBX REST API, check:
  1. existing PBXPuls code;
  2. existing helper functions;
  3. the `freepbx-api-dashboard` project;
  4. project documentation;
  5. verified raw API responses.

---

## AMI Rules

- AMI connection management must be centralized.
- Avoid duplicated AMI listeners.
- Reconnect logic must be controlled and logged.
- Do not create reconnect loops without backoff.
- Secrets must never be logged.
- Test endpoints must use independent short-lived AMI connections, not long-running listeners.

---

## Preview First

Every dangerous operation must support:

1. Preview
2. Review
3. Apply

No direct destructive action may bypass preview.

This applies to:

- extension creation
- extension update
- trunk changes
- route changes
- queue changes
- ring group changes
- IVR changes
- any FreePBX write operation

---

## Security

Never print or expose:

- passwords
- secrets
- API keys
- OAuth tokens
- JWT tokens
- SIP/PJSIP secrets

Always mask sensitive values in:

- logs
- API responses
- preview results
- changelog entries
- debug output
- raw API dumps

---

## Build Policy

After every completed implementation:

1. Run `npm run build`.
2. Fix build errors.
3. Show `git diff --stat`.
4. Summarize changed files.

Do not create commits unless explicitly requested.

---

## Commit Policy

Only commit when explicitly requested.

Commit messages should be concise and in English.

Recommended format:

- `fix(scope): message`
- `feat(scope): message`
- `refactor(scope): message`
- `docs(scope): message`

Examples:

- `fix(management): normalize FreePBX extensions`
- `feat(management): add extensions bulk preview`
- `refactor(api): centralize FreePBX REST helpers`

---

## Live PBX Safety

Never run without explicit confirmation:

- `fwconsole reload`
- `fwconsole restart`
- `asterisk -rx` commands that modify state
- FreePBX write API requests
- bulk create/update/delete operations
- database writes
- service restarts affecting production

Read-only diagnostic commands are allowed during research when permitted by the tool policy.

---

## Final Response Format

At the end of every task, provide:

- what changed;
- files changed;
- build status;
- known risks;
- next recommended step.

Keep the response concise and actionable.


## Required Project Documentation

Before implementing any non-trivial feature, ALWAYS read:

1. PBXPULS_ARCHITECTURE.md
2. ROADMAP.md
3. FREEPBX_API_REFERENCE_FULL.md
4. PBXPULS_UI_GUIDELINES.md
5. PBXPULS_KNOWLEDGE_BASE.md

These documents define the architecture, UI conventions, verified FreePBX API behavior and accumulated project knowledge.

Do not start implementation until these documents have been reviewed.
