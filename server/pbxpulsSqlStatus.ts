import { Express, RequestHandler } from 'express';
import { isPBXPulsDbAvailable, queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { getPBXPulsSetting } from './pbxpulsSettings.js';

type AuthMiddlewareFactory = () => RequestHandler;

interface PBXPulsSqlStatusResponse {
  ok: boolean;
  dbAvailable: boolean;
  database: 'pbxpuls';
  storageMode: string | null;
  migrations: {
    table: 'schema_migrations';
    count: number | null;
    latest: string | null;
  };
  tables: {
    settings: number | null;
    tools: number | null;
    system_events: number | null;
    audit_log: number | null;
    users: number | null;
    roles: number | null;
  };
  tools: {
    total: number | null;
    enabled: number | null;
  };
  error?: string;
}

const PBXPULS_DATABASE_NAME = 'pbxpuls';
const MIGRATIONS_TABLE = 'schema_migrations';

const SQL_STATUS_TABLES = [
  'settings',
  'tools',
  'system_events',
  'audit_log',
  'users',
  'roles'
] as const;

type SqlStatusTable = typeof SQL_STATUS_TABLES[number];

export function registerPBXPulsSqlStatusRoutes(app: Express, requireAuth: AuthMiddlewareFactory): void {
  app.get('/api/pbxpuls/sql-status', requireAuth(), async (_req, res) => {
    const status = buildEmptyStatus();

    try {
      status.dbAvailable = await isPBXPulsDbAvailable();
      if (!status.dbAvailable) {
        status.error = await probePBXPulsDbError();
        return res.json(status);
      }

      status.storageMode = await readStorageMode();
      status.migrations = await readMigrationStatus();
      status.tables = await readTableCounts();
      status.tools = await readToolCounts();
      status.ok = true;

      return res.json(status);
    } catch (error: any) {
      const sanitizedError = sanitizePBXPulsDbError(error);
      console.warn('[PBXPULS_SQL_STATUS] endpoint failed:', sanitizedError);
      status.ok = false;
      status.error = sanitizedError;
      return res.json(status);
    }
  });
}

function buildEmptyStatus(): PBXPulsSqlStatusResponse {
  return {
    ok: false,
    dbAvailable: false,
    database: PBXPULS_DATABASE_NAME,
    storageMode: null,
    migrations: {
      table: MIGRATIONS_TABLE,
      count: null,
      latest: null
    },
    tables: {
      settings: null,
      tools: null,
      system_events: null,
      audit_log: null,
      users: null,
      roles: null
    },
    tools: {
      total: null,
      enabled: null
    }
  };
}

async function probePBXPulsDbError(): Promise<string> {
  try {
    await queryPBXPulsDb('SELECT 1 AS ok', []);
    return 'PBXPuls database is unavailable';
  } catch (error: any) {
    return sanitizePBXPulsDbError(error);
  }
}

async function readStorageMode(): Promise<string | null> {
  const value = await getPBXPulsSetting<string>('app.storage_mode', null);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function readMigrationStatus(): Promise<PBXPulsSqlStatusResponse['migrations']> {
  const count = await readTableCount(MIGRATIONS_TABLE);
  if (count === null) {
    return {
      table: MIGRATIONS_TABLE,
      count: null,
      latest: null
    };
  }

  return {
    table: MIGRATIONS_TABLE,
    count,
    latest: await readLatestMigration()
  };
}

async function readLatestMigration(): Promise<string | null> {
  try {
    const columns = await queryPBXPulsDb(`SHOW COLUMNS FROM ${MIGRATIONS_TABLE}`, []);
    const columnNames = new Set((columns as any[]).map((column) => String(column.Field || '')));
    const keyColumn = columnNames.has('migration_key')
      ? 'migration_key'
      : columnNames.has('migration_name')
        ? 'migration_name'
        : null;

    if (!keyColumn) return null;

    const orderColumn = columnNames.has('applied_at') ? 'applied_at DESC,' : '';
    const rows = await queryPBXPulsDb(
      `SELECT ${keyColumn} AS latest FROM ${MIGRATIONS_TABLE} ORDER BY ${orderColumn} ${keyColumn} DESC LIMIT 1`,
      []
    );
    const latest = rows[0]?.latest;
    return latest ? String(latest) : null;
  } catch (error: any) {
    if (!isMissingTableError(error)) {
      console.warn('[PBXPULS_SQL_STATUS] migration latest read failed:', sanitizePBXPulsDbError(error));
    }
    return null;
  }
}

async function readTableCounts(): Promise<PBXPulsSqlStatusResponse['tables']> {
  const counts = buildEmptyStatus().tables;

  for (const tableName of SQL_STATUS_TABLES) {
    counts[tableName] = await readTableCount(tableName);
  }

  return counts;
}

async function readToolCounts(): Promise<PBXPulsSqlStatusResponse['tools']> {
  return {
    total: await readTableCount('tools'),
    enabled: await readSingleCount('SELECT COUNT(*) AS count FROM tools WHERE is_enabled = 1', 'tools.enabled')
  };
}

async function readTableCount(tableName: SqlStatusTable | typeof MIGRATIONS_TABLE): Promise<number | null> {
  return readSingleCount(`SELECT COUNT(*) AS count FROM ${tableName}`, tableName);
}

async function readSingleCount(sql: string, label: string): Promise<number | null> {
  try {
    const rows = await queryPBXPulsDb(sql, []);
    const count = Number(rows[0]?.count);
    return Number.isFinite(count) ? count : null;
  } catch (error: any) {
    if (!isMissingTableError(error)) {
      console.warn('[PBXPULS_SQL_STATUS] count read failed:', {
        label,
        error: sanitizePBXPulsDbError(error)
      });
    }
    return null;
  }
}

function isMissingTableError(error: any): boolean {
  return error?.code === 'ER_NO_SUCH_TABLE' || /table .* doesn't exist/i.test(String(error?.message || ''));
}
