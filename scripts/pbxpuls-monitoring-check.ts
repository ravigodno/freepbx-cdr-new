import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const files = [
  'quality-history.json', 'quality-alerts.json', 'health-history.json', 'devices-history.json',
  'devices-alerts.json', 'devices-conflicts.json', 'devices-map.json'
];
const tables: Array<[string, string]> = [
  ['quality_current', 'updated_at'], ['quality_history', 'sampled_at'],
  ['monitoring_health_history', 'sampled_at'], ['monitoring_quality_alerts', 'alert_time'],
  ['monitoring_devices_history', 'sampled_at'], ['monitoring_devices_alerts', 'alert_time'],
  ['monitoring_devices_conflicts', 'last_seen_at'], ['monitoring_devices_map', 'updated_at']
];
const coverage: Array<[string, string]> = [
  ['quality-history.json', 'quality_history'], ['quality-alerts.json', 'monitoring_quality_alerts'],
  ['health-history.json', 'monitoring_health_history'], ['devices-history.json', 'monitoring_devices_history'],
  ['devices-alerts.json', 'monitoring_devices_alerts'], ['devices-conflicts.json', 'monitoring_devices_conflicts'],
  ['devices-map.json', 'monitoring_devices_map']
];

function timestampRange(items: any[]) {
  const timestamps = items
    .map(item => item?.timestamp || item?.time || item?.detectedAt || item?.lastSeenAt || item?.lastContact || item?.regTime)
    .map(value => new Date(String(value || '')).getTime())
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    minTimestamp: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
    maxTimestamp: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : null
  };
}

function storedTimestampMs(value: unknown): number | null {
  const parsed = new Date(String(value || '').replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function sqlTimestampMs(table: string, value: unknown): number | null {
  const normalized = String(value || '').replace(' ', 'T');
  const parsed = new Date(table === 'monitoring_devices_map' ? normalized : `${normalized}Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function inspectLegacyFiles() {
  return Object.fromEntries(files.map(file => {
    const full = path.join(process.cwd(), 'data', file);
    let items: any[] = [];
    try {
      const value = JSON.parse(fs.readFileSync(full, 'utf8') || '[]');
      if (Array.isArray(value)) items = value;
    } catch {}
    return [file, { found: fs.existsSync(full), count: items.length, ...timestampRange(items) }];
  }));
}

function findDirectLegacyReads(): string[] {
  const source = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  const pattern = /fs\.readFileSync\(\s*(DEVICES_MAP_FILE|DEVICES_HISTORY_FILE|DEVICES_ALERTS_FILE|DEVICES_CONFLICTS_FILE)/g;
  const findings: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const line = source.slice(0, match.index).split('\n').length;
    const routePrefix = source.slice(0, match.index);
    const routes = Array.from(routePrefix.matchAll(/app\.(?:get|post|put|patch|delete)\(['"]([^'"]+)['"]/g));
    const route = routes.length ? routes[routes.length - 1][1] : 'module-scope';
    findings.push(`${route}:${match[1]}:${line}`);
  }
  return findings;
}

async function main() {
  const config = {
    host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
    port: Number(process.env.PBXPULS_DB_PORT || 3306),
    database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
    user: process.env.PBXPULS_DB_USER || 'pbxpuls',
    password: process.env.PBXPULS_DB_PASSWORD || process.env.PBXPULS_DB_PASS || '',
    connectTimeout: 3000,
    dateStrings: true
  };
  const legacyFiles = inspectLegacyFiles();
  const directLegacyReadsRemaining = findDirectLegacyReads();
  const sqlTables: Record<string, any> = {};
  const blockers: string[] = [];
  let sqlAvailable = true;
  const connection = await mysql.createConnection(config);
  const [modeRows] = await connection.execute("SELECT setting_value FROM settings WHERE setting_key='monitoring.storage_mode' LIMIT 1");
  const mode = String((modeRows as any[])[0]?.setting_value || '');

  for (const [table, column] of tables) {
    try {
      const [rows] = await connection.query(`SELECT COUNT(*) count, MIN(${column}) minTimestamp, MAX(${column}) maxTimestamp FROM ${table}`);
      sqlTables[table] = (rows as any[])[0];
    } catch (error: any) {
      sqlAvailable = false;
      sqlTables[table] = { error: String(error?.message || error).slice(0, 200) };
    }
  }
  await connection.end();

  const { getMonitoringRetentionStatus } = await import('../server/monitoringRetention.js');
  const retention = await getMonitoringRetentionStatus();

  if (!sqlAvailable) blockers.push('monitoring_sql_unavailable');
  if (mode !== 'dual' && mode !== 'sql') blockers.push(`monitoring_storage_mode_not_cutover_candidate:${mode || 'unset'}`);
  blockers.push(...directLegacyReadsRemaining.map(item => `direct_legacy_read:${item}`));
  for (const [file, table] of coverage) {
    const legacyCount = Number((legacyFiles as any)[file]?.count || 0);
    const sqlCount = Number(sqlTables[table]?.count || 0);
    if (legacyCount > sqlCount) blockers.push(`sql_count_below_legacy:${table}`);
    const legacyMax = storedTimestampMs((legacyFiles as any)[file]?.maxTimestamp);
    const sqlMax = sqlTimestampMs(table, sqlTables[table]?.maxTimestamp);
    if (legacyMax !== null && (sqlMax === null || sqlMax + 10 * 60 * 1000 < legacyMax)) {
      blockers.push(`sql_timestamp_behind_legacy:${table}`);
    }
  }
  if (Number((legacyFiles as any)['devices-map.json']?.count || 0) > 0 && Number(sqlTables.quality_current?.count || 0) === 0) {
    blockers.push('quality_current_is_empty');
  }

  const monitoringSqlCutoverReady = blockers.length === 0;
  console.log(JSON.stringify({
    mode,
    sqlAvailable,
    directLegacyReadsRemaining,
    directLegacyReadCount: directLegacyReadsRemaining.length,
    legacyFiles,
    sqlTables,
    monitoringSqlCutoverReady,
    blockers,
    retentionDays: retention.retentionDays,
    retentionTables: retention.tables,
    rowsOlderThanRetention: retention.rowsOlderThanRetention,
    totalRowsOlderThanRetention: retention.totalRowsOlderThanRetention,
    lastRetentionRun: retention.lastRetentionRun,
    retentionReady: retention.retentionReady,
    retentionBlockers: retention.retentionBlockers
  }, null, 2));
  process.exitCode = sqlAvailable && retention.retentionReady ? 0 : 1;
}

main().catch(error => {
  console.error(String(error?.message || error).replace(/(password|passwd)\s*[:=]\s*\S+/gi, '$1=********'));
  process.exitCode = 1;
});
