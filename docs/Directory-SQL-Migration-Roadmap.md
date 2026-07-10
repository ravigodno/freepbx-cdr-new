# Directory SQL Migration Roadmap

## Current Baseline

- Production Directory reads use SQL on the test PBX.
- Production Directory writes use SQL on the test PBX.
- `directory.storage_mode = sql`.
- `directory.write_mode = sql`.
- `directory.production_sql_write_unlock = true`.
- `directory.sql_write_test_enabled = false`.
- `directory.sql_sync_apply_enabled = false`.
- `effectiveSource = pbxpuls_sql`.
- `productionWriteEndpointsUseSql = true`.
- `directoryWriteRouterReadyForSql = true`.
- Permanent SQL cutover and PM2 restart persistence have been verified on the test PBX.

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
- Production Directory write endpoint SQL branch wiring.
- Controlled legacy to SQL sync.
- SQL read/storage smoke.
- Full controlled SQL read/write smoke through production `/api/directory` endpoints.
- Permanent test PBX SQL cutover.
- PM2 restart persistence check after cutover.
- Rollback procedure documented.

## Not Done Yet

- Package release notes and release artifact.
- Roll out the same Directory SQL cutover procedure to a second test PBX.
- Define long-term legacy fallback retention and cleanup policy.
- Continue hardening Directory import, sync, spam, and blacklist paths under SQL mode.

## Milestone 10.1 Controlled SQL Write Unlock Design

- Define exact conditions for temporarily allowing `directory.write_mode = sql`.
- Keep production Directory read/write on legacy during the design step.
- Preserve `directory.storage_mode = legacy`.
- Keep SQL write branch guarded until the unlock is explicitly enabled.
- Add diagnostics that explain why production SQL write is or is not unlockable.
- Add `directory.production_sql_write_unlock = false` as the explicit production SQL write unlock flag.
- Keep `directory.write_mode = sql` blocked while the unlock flag is false.
- Report `production_sql_write_not_unlocked` as the current block reason.

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

## Milestone 10.4 Guarded SQL Branch Router Decision

- Replace the router's permanent SQL branch block with controlled readiness.
- Keep `useLegacy=true` while `directory.write_mode = legacy`.
- Return a blocked SQL decision with the current readiness reason when `directory.write_mode = sql` but readiness is incomplete.
- Return `useSql=true` only when `directory.write_mode = sql` and production SQL write readiness is complete.
- Do not run production `/api/directory` writes in this milestone.
- Use the next milestone for runtime-checking router readiness states before a one-contact production-shaped smoke.

## Milestone 10.5.1 Production Directory Write SQL Branch Wiring

- Wire `POST /api/directory`, `PUT /api/directory/:id` and `DELETE /api/directory/:id` to SQL helpers.
- Make the SQL branch reachable only when the guarded router decision reports `useSql=true` and `blocked=false`.
- Preserve legacy write behavior when the router decision reports `useLegacy=true`.
- Keep production mode legacy by default.
- Do not execute the production-shaped SQL write smoke in the wiring milestone.
- Use the next runtime-check milestone for the one-contact `/api/directory` SQL write smoke.

## Milestone 10.5 Controlled SQL Read Switch

- Temporarily enable `directory.storage_mode = sql`.
- Verify Directory UI reads, search and lookup behavior.
- Verify live-call lookup safety where applicable.
- Roll back to `directory.storage_mode = legacy`.
- Keep production writes legacy during this milestone.

## Milestone 10.6 Controlled SQL Write Switch

- Temporarily enable `directory.write_mode = sql` under explicit guard.
- Verify production create, update and delete workflows.
- Verify metadata/custom field handling.
- Verify rollback to legacy write mode.
- Keep a documented rollback plan before any broader use.

## Milestone 10.7 Production Cutover and Cleanup

- Make SQL the primary Directory storage only after read/write checks pass.
- Run the controlled Directory SQL sync from legacy first if readiness reports stale SQL seed rows.
- Keep `directory.sql_sync_apply_enabled` disabled except during a separate controlled sync apply stage.
- Keep legacy fallback available.
- Update diagnostics and migration documentation.
- Do not delete `data/db.json` immediately.
- Define a separate retention and cleanup policy for legacy data.

## Milestone 10.9 Permanent Test PBX Cutover

- SQL read complete.
- SQL write complete.
- Controlled legacy to SQL sync complete.
- Permanent SQL cutover complete on the test PBX.
- Production `/api/directory` create/delete smoke passed in persistent SQL mode.
- PM2 restart persistence verified after cutover.
- Current next step: package release and prepare rollout to a second test PBX.

## Rollback Directory To Legacy

Use this rollback order if SQL Directory mode must be disabled:

1. `POST /api/pbxpuls/directory-write-mode` with body `{"mode":"legacy"}`
2. Set `directory.production_sql_write_unlock = false`
3. `POST /api/pbxpuls/directory-storage-mode` with body `{"mode":"legacy"}`

Expected rollback state:

- `directory.storage_mode = legacy`
- `directory.write_mode = legacy`
- `productionSqlWriteUnlock = false`
- `effectiveSource = data/db.json`
- `productionWriteEndpointsUseSql = false`

## Guardrails

- Do not use `asteriskcdrdb` or `asterisk` for PBXPuls internal data.
- Do not enable SQL production mode without a separate milestone.
- Do not use real contacts in smoke tests.
- Delete every test contact created by a smoke test.
- Start every milestone from a clean git working tree.
- Run `npm run build` before every commit.
- Use PM2 restart only in a separate runtime-check stage or with explicit permission.
