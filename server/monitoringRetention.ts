import { queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { getPBXPulsSetting, upsertPBXPulsSetting } from './pbxpulsSettings.js';

export const DEFAULT_MONITORING_RETENTION_DAYS = 30;
export const DEFAULT_MONITORING_RETENTION_BATCH_SIZE = 5000;
export const MONITORING_RETENTION_DAYS_SETTING = 'monitoring.retention_days';
export const MONITORING_RETENTION_LAST_RUN_SETTING = 'monitoring.retention_last_run';

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BACKGROUND_START_DELAY_MS = 60 * 1000;

const RETENTION_TABLES = [
  { table: 'quality_history', timestampColumn: 'sampled_at' },
  { table: 'monitoring_health_history', timestampColumn: 'sampled_at' },
  { table: 'monitoring_quality_alerts', timestampColumn: 'alert_time' },
  { table: 'monitoring_devices_history', timestampColumn: 'sampled_at' },
  { table: 'monitoring_devices_alerts', timestampColumn: 'alert_time' },
  { table: 'monitoring_devices_conflicts', timestampColumn: 'last_seen_at' }
] as const;

export type MonitoringRetentionTable = typeof RETENTION_TABLES[number]['table'];

export interface MonitoringRetentionTableStatus {
  timestampColumn: string;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  rowsOlderThanRetention: number;
  error?: string;
}

export interface MonitoringRetentionRunSummary {
  completedAt: string;
  retentionDays: number;
  cutoff: string;
  batchSize: number;
  totalDeleted: number;
  deletedByTable: Record<string, number>;
}

export interface MonitoringRetentionStatus {
  retentionDays: number;
  cutoff: string | null;
  rowsOlderThanRetention: Record<string, number>;
  totalRowsOlderThanRetention: number;
  tables: Record<string, MonitoringRetentionTableStatus>;
  lastRetentionRun: MonitoringRetentionRunSummary | null;
  retentionReady: boolean;
  retentionBlockers: string[];
}

export interface MonitoringRetentionResult extends MonitoringRetentionStatus {
  dryRun: boolean;
  batchSize: number;
  deletedByTable: Record<string, number>;
  totalDeleted: number;
}

let retentionRunInProgress = false;
let backgroundRunnerStarted = false;
let lastBackgroundAttemptAt = 0;

function normalizeRetentionDays(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 3650
    ? parsed
    : DEFAULT_MONITORING_RETENTION_DAYS;
}

function normalizeBatchSize(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 10000
    ? parsed
    : DEFAULT_MONITORING_RETENTION_BATCH_SIZE;
}

function timestampText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace('T', ' ').slice(0, 19);
}

export async function getMonitoringRetentionDays(): Promise<number> {
  const value = await getPBXPulsSetting<unknown>(
    MONITORING_RETENTION_DAYS_SETTING,
    DEFAULT_MONITORING_RETENTION_DAYS
  );
  return normalizeRetentionDays(value);
}

async function getRetentionCutoff(retentionDays: number): Promise<string> {
  const days = normalizeRetentionDays(retentionDays);
  const rows = await queryPBXPulsDb(`SELECT DATE_SUB(NOW(), INTERVAL ${days} DAY) AS cutoff`);
  const cutoff = timestampText((rows[0] as any)?.cutoff);
  if (!cutoff) throw new Error('Monitoring retention cutoff could not be calculated');
  return cutoff;
}

async function readLastRetentionRun(): Promise<MonitoringRetentionRunSummary | null> {
  const value = await getPBXPulsSetting<unknown>(MONITORING_RETENTION_LAST_RUN_SETTING, null);
  if (!value || typeof value !== 'object') return null;
  const run = value as MonitoringRetentionRunSummary;
  return typeof run.completedAt === 'string' && Number.isFinite(Number(run.retentionDays)) ? run : null;
}

export async function getMonitoringRetentionStatus(): Promise<MonitoringRetentionStatus> {
  const retentionDays = await getMonitoringRetentionDays();
  const lastRetentionRun = await readLastRetentionRun();
  const rowsOlderThanRetention: Record<string, number> = {};
  const tables: Record<string, MonitoringRetentionTableStatus> = {};
  const retentionBlockers: string[] = [];
  let cutoff: string | null = null;

  try {
    cutoff = await getRetentionCutoff(retentionDays);
  } catch (error: any) {
    retentionBlockers.push(`retention_sql_unavailable:${sanitizePBXPulsDbError(error)}`);
  }

  for (const definition of RETENTION_TABLES) {
    if (!cutoff) {
      rowsOlderThanRetention[definition.table] = 0;
      tables[definition.table] = {
        timestampColumn: definition.timestampColumn,
        oldestTimestamp: null,
        newestTimestamp: null,
        rowsOlderThanRetention: 0,
        error: 'Monitoring retention cutoff unavailable'
      };
      continue;
    }

    try {
      const rows = await queryPBXPulsDb(
        `SELECT MIN(${definition.timestampColumn}) AS oldestTimestamp,
                MAX(${definition.timestampColumn}) AS newestTimestamp,
                SUM(CASE WHEN ${definition.timestampColumn} < ? THEN 1 ELSE 0 END) AS rowsOlderThanRetention
         FROM ${definition.table}`,
        [cutoff]
      );
      const row = (rows[0] || {}) as any;
      const older = Number(row.rowsOlderThanRetention || 0);
      rowsOlderThanRetention[definition.table] = older;
      tables[definition.table] = {
        timestampColumn: definition.timestampColumn,
        oldestTimestamp: timestampText(row.oldestTimestamp),
        newestTimestamp: timestampText(row.newestTimestamp),
        rowsOlderThanRetention: older
      };
    } catch (error: any) {
      const safeError = sanitizePBXPulsDbError(error);
      rowsOlderThanRetention[definition.table] = 0;
      tables[definition.table] = {
        timestampColumn: definition.timestampColumn,
        oldestTimestamp: null,
        newestTimestamp: null,
        rowsOlderThanRetention: 0,
        error: safeError
      };
      retentionBlockers.push(`retention_table_unavailable:${definition.table}:${safeError}`);
    }
  }

  return {
    retentionDays,
    cutoff,
    rowsOlderThanRetention,
    totalRowsOlderThanRetention: Object.values(rowsOlderThanRetention).reduce((sum, count) => sum + count, 0),
    tables,
    lastRetentionRun,
    retentionReady: retentionBlockers.length === 0,
    retentionBlockers
  };
}

async function deleteTableInBatches(
  table: MonitoringRetentionTable,
  timestampColumn: string,
  cutoff: string,
  batchSize: number
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const rows = await queryPBXPulsDb(
      `SELECT id FROM ${table}
       WHERE ${timestampColumn} < ?
       ORDER BY ${timestampColumn} ASC, id ASC
       LIMIT ${batchSize}`,
      [cutoff]
    );
    const ids = rows.map((row: any) => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) break;

    const placeholders = ids.map(() => '?').join(',');
    const result = await queryPBXPulsDb(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids) as any;
    const deleted = Number(result?.affectedRows || 0);
    totalDeleted += deleted;
    if (deleted === 0 || ids.length < batchSize) break;
  }

  return totalDeleted;
}

export async function runMonitoringRetention(options: {
  dryRun?: boolean;
  batchSize?: number;
} = {}): Promise<MonitoringRetentionResult> {
  const dryRun = options.dryRun !== false;
  const batchSize = normalizeBatchSize(options.batchSize);
  const before = await getMonitoringRetentionStatus();
  const deletedByTable = Object.fromEntries(RETENTION_TABLES.map(item => [item.table, 0]));

  if (dryRun) {
    return { ...before, dryRun: true, batchSize, deletedByTable, totalDeleted: 0 };
  }
  if (!before.retentionReady || !before.cutoff) {
    throw new Error(`Monitoring retention is not ready: ${before.retentionBlockers.join(', ') || 'cutoff unavailable'}`);
  }
  if (retentionRunInProgress) throw new Error('Monitoring retention run is already in progress');

  retentionRunInProgress = true;
  try {
    for (const definition of RETENTION_TABLES) {
      deletedByTable[definition.table] = await deleteTableInBatches(
        definition.table,
        definition.timestampColumn,
        before.cutoff,
        batchSize
      );
    }

    const totalDeleted = Object.values(deletedByTable).reduce((sum, count) => sum + count, 0);
    const completedAt = new Date().toISOString();
    const summary: MonitoringRetentionRunSummary = {
      completedAt,
      retentionDays: before.retentionDays,
      cutoff: before.cutoff,
      batchSize,
      totalDeleted,
      deletedByTable
    };
    const lastRunSaved = await upsertPBXPulsSetting(MONITORING_RETENTION_LAST_RUN_SETTING, summary, {
      valueType: 'json',
      category: 'monitoring',
      description: 'Last completed Monitoring SQL retention run'
    });
    if (!lastRunSaved) throw new Error('Monitoring retention completed, but last run status could not be saved');
    console.log('[MONITORING_RETENTION] completed', summary);

    const after = await getMonitoringRetentionStatus();
    return { ...after, dryRun: false, batchSize, deletedByTable, totalDeleted };
  } finally {
    retentionRunInProgress = false;
  }
}

async function runBackgroundRetentionIfDue(): Promise<void> {
  if (retentionRunInProgress) return;
  if (lastBackgroundAttemptAt > 0 && Date.now() - lastBackgroundAttemptAt < DAY_MS) return;
  try {
    const status = await getMonitoringRetentionStatus();
    const lastRunAt = status.lastRetentionRun?.completedAt
      ? new Date(status.lastRetentionRun.completedAt).getTime()
      : 0;
    if (Number.isFinite(lastRunAt) && lastRunAt > 0 && Date.now() - lastRunAt < DAY_MS) return;
    lastBackgroundAttemptAt = Date.now();
    await runMonitoringRetention({ dryRun: false });
  } catch (error: any) {
    console.warn('[MONITORING_RETENTION] background run failed:', sanitizePBXPulsDbError(error));
  }
}

export function startMonitoringRetentionRunner(): void {
  if (backgroundRunnerStarted) return;
  backgroundRunnerStarted = true;
  const startupTimer = setTimeout(() => void runBackgroundRetentionIfDue(), BACKGROUND_START_DELAY_MS);
  const interval = setInterval(() => void runBackgroundRetentionIfDue(), BACKGROUND_CHECK_INTERVAL_MS);
  startupTimer.unref?.();
  interval.unref?.();
}
