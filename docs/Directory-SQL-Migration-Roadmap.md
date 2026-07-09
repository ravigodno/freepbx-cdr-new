# Directory SQL Migration Roadmap

## Current Baseline

- Production Directory reads use legacy `data/db.json`.
- Production Directory writes use legacy `data/db.json`.
- `directory.storage_mode = legacy`.
- `directory.write_mode = legacy`.
- `directory.sql_write_test_enabled = false`.
- SQL schema, read layer, write foundation and diagnostics are ready.
- Isolated SQL write smoke passed in Stage 9.9.10.
- Production SQL write is not enabled or unlocked.

## Completed

- Directory SQL schema and seed layer.
- Directory SQL read runtime layer.
- Directory SQL write helper foundation.
- Controlled write mode controller.
- SQL write dry-run preview endpoint.
- Guarded write router for existing Directory write endpoints.
- Legacy write regression smoke.
- Isolated SQL write test endpoint.
- One-contact isolated SQL write smoke: create, update, delete, cleanup.
- Diagnostics hardening after isolated smoke.

## Not Done Yet

- Production `/api/directory` SQL write.
- Production SQL read/write cutover.
- Legacy vs SQL consistency checks.
- Directory import, sync, spam and blacklist path migration.
- Rollback hardening for production SQL mode.
- Final cleanup and long-term legacy fallback policy.

## Milestone 10.1 Controlled SQL Write Unlock Design

- Define exact conditions for temporarily allowing `directory.write_mode = sql`.
- Keep production Directory read/write on legacy during the design step.
- Preserve `directory.storage_mode = legacy`.
- Keep SQL write branch guarded until the unlock is explicitly enabled.
- Add diagnostics that explain why production SQL write is or is not unlockable.

## Milestone 10.2 Production-Shaped SQL Write Smoke

- Temporarily allow SQL write only for one artificial test contact through `/api/directory`.
- Run create, update and delete through the production-shaped path.
- Verify no real contacts are affected.
- Roll back to legacy immediately after the smoke.
- Confirm `productionWriteEndpointsUseSql = false` after rollback.

## Milestone 10.3 Legacy vs SQL Consistency Check

- Compare legacy and SQL contact counts.
- Compare primary fields required by Directory lookup.
- Compare metadata and custom fields.
- Verify search and lookup behavior against expected results.
- Report differences without exposing personal data.

## Milestone 10.4 Controlled SQL Read Switch

- Temporarily enable `directory.storage_mode = sql`.
- Verify Directory UI reads, search and lookup behavior.
- Verify live-call lookup safety where applicable.
- Roll back to `directory.storage_mode = legacy`.
- Keep production writes legacy during this milestone.

## Milestone 10.5 Controlled SQL Write Switch

- Temporarily enable `directory.write_mode = sql` under explicit guard.
- Verify production create, update and delete workflows.
- Verify metadata/custom field handling.
- Verify rollback to legacy write mode.
- Keep a documented rollback plan before any broader use.

## Milestone 10.6 Production Cutover and Cleanup

- Make SQL the primary Directory storage only after read/write checks pass.
- Keep legacy fallback available.
- Update diagnostics and migration documentation.
- Do not delete `data/db.json` immediately.
- Define a separate retention and cleanup policy for legacy data.

## Guardrails

- Do not use `asteriskcdrdb` or `asterisk` for PBXPuls internal data.
- Do not enable SQL production mode without a separate milestone.
- Do not use real contacts in smoke tests.
- Delete every test contact created by a smoke test.
- Start every milestone from a clean git working tree.
- Run `npm run build` before every commit.
- Use PM2 restart only in a separate runtime-check stage or with explicit permission.
