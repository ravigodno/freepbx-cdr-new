# Monitoring SQL Cutover Checklist

This checklist prepares, but does not perform, the `dual` to `sql` cutover.

## Automated readiness

Run:

```bash
npm run pbxpuls:db:check
npm run pbxpuls:monitoring:sync
npm run pbxpuls:monitoring:check
npm run build
```

`pbxpuls:monitoring:sync` performs a transactional, idempotent catch-up of legacy devices history, alerts, conflicts and map data. It does not change `monitoring.storage_mode` and does not modify or delete the JSON source files. A repeated run must report all unchanged rows as `skipped`.

`pbxpuls:monitoring:check` must report:

- `mode` is `dual` or `sql`;
- `sqlAvailable` is `true`;
- `directLegacyReadsRemaining` is empty;
- every SQL history/current table covers the corresponding legacy JSON count and latest timestamp (with a ten-minute collector tolerance);
- `monitoringSqlCutoverReady` is `true`;
- `blockers` is empty.

## Manual review before changing mode

1. Compare representative API responses in `dual` mode for health history, quality cache/history/alerts, devices map/history/alerts/conflicts and device details.
2. Exercise Devices Map ping, traceroute and snapshot and confirm the response uses effective Monitoring storage.
3. Confirm recent SQL `maxTimestamp` values continue to advance for health and quality collectors.
4. Confirm `GET /api/pbxpuls/monitoring-storage-status` reports `cutoverReady=true` and no failed last SQL write.
5. Record the current JSON file sizes and timestamps for rollback reference. Do not delete or archive them during cutover.
6. Change `monitoring.storage_mode` only through the guarded API and only after explicit operator approval.
7. After changing mode, repeat the API comparisons and confirm monitoring JSON modification times no longer advance.

## Rollback conditions

Return to `dual` if SQL becomes unavailable, an endpoint uses `legacy-fallback`, recent SQL timestamps stop advancing, row coverage regresses, or a Monitoring API response becomes incomplete.

Archiving or deleting legacy JSON is a separate later task after an observation window in stable `sql` mode.
