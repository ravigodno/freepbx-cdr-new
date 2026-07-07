import mysql, { Connection } from 'mysql2/promise';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';

interface Migration {
  key: string;
  description: string;
  statements: string[];
  seed?: (connection: Connection) => Promise<void>;
}

interface SchemaMigrationColumns {
  keyColumn: 'migration_key' | 'migration_name';
  hasDescription: boolean;
  hasAppliedAt: boolean;
}

const CORE_TOOLS = [
  ['dashboard', 'Dashboard', 'Main PBXPuls dashboard', 'core', 10],
  ['cdr', 'CDR', 'Call detail records view', 'cdr', 20],
  ['missed_calls', 'Missed Calls', 'Missed calls workflow', 'cdr', 30],
  ['live_sessions', 'Live Sessions', 'Live call sessions', 'monitoring', 40],
  ['click2call', 'Click2Call', 'Click-to-call tools', 'telephony', 50],
  ['extensions', 'Extensions', 'Extension management', 'management', 60],
  ['trunks', 'Trunks', 'Trunk management', 'management', 70],
  ['trunk_lab', 'Trunk Lab', 'Read-only trunk diagnostics', 'management', 80],
  ['provisioning', 'Provisioning', 'Provisioning workspace', 'management', 90],
  ['directory', 'Directory', 'PBXPuls directory', 'directory', 100],
  ['call_scripts', 'Call Scripts', 'Operator call scripts', 'scripts', 110],
  ['ai_pbx_admin', 'AI PBX Admin', 'AI administrator for PBX diagnostics', 'ai', 120],
  ['ai_auto_answer', 'AI Auto Answer', 'AI auto-answer tools', 'ai', 130],
  ['calltracking', 'Calltracking', 'Calltracking and attribution', 'marketing', 140],
  ['settings', 'Settings', 'PBXPuls settings', 'system', 150],
  ['logs', 'Logs', 'Logs and audit surfaces', 'system', 160]
] as const;

const CORE_SETTINGS = [
  ['app.name', 'PBXPuls', 'string', 'app', 'Application name'],
  ['app.storage_mode', 'hybrid', 'string', 'app', 'Current storage mode: legacy/json/sql/hybrid'],
  ['settings.sql_enabled', '1', 'boolean', 'system', 'SQL settings layer enabled'],
  ['settings.fallback_enabled', '1', 'boolean', 'system', 'Legacy fallback enabled when SQL setting is missing'],
  ['tools.registry_source', 'sql_seeded', 'string', 'tools', 'Tools registry seed source'],
  ['audit.enabled', '1', 'boolean', 'audit', 'Audit logging enabled'],
  ['system.events_enabled', '1', 'boolean', 'system', 'System events logging enabled']
] as const;

const MIGRATIONS: Migration[] = [
  {
    key: '20260707_001_core_internal_tables',
    description: 'Create PBXPuls core internal tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(191) NOT NULL UNIQUE,
        setting_value LONGTEXT NULL,
        value_type ENUM('string','number','boolean','json','secret') NOT NULL DEFAULT 'string',
        category VARCHAR(100) NULL,
        is_secret TINYINT(1) NOT NULL DEFAULT 0,
        description VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(191) NULL,
        email VARCHAR(191) NULL,
        password_hash VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        last_login_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_key VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(191) NOT NULL,
        description VARCHAR(255) NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        permission_key VARCHAR(191) NOT NULL UNIQUE,
        name VARCHAR(191) NOT NULL,
        description VARCHAR(255) NULL,
        category VARCHAR(100) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_role (user_id, role_id),
        INDEX idx_user_roles_user_id (user_id),
        INDEX idx_user_roles_role_id (role_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS role_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_id INT NOT NULL,
        permission_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_role_permission (role_id, permission_id),
        INDEX idx_role_permissions_role_id (role_id),
        INDEX idx_role_permissions_permission_id (permission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS tools (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tool_key VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(191) NOT NULL,
        description VARCHAR(255) NULL,
        category VARCHAR(100) NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        is_system TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 100,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        actor_user_id INT NULL,
        actor_label VARCHAR(191) NULL,
        action VARCHAR(191) NOT NULL,
        entity_type VARCHAR(100) NULL,
        entity_id VARCHAR(100) NULL,
        details LONGTEXT NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_log_created_at (created_at),
        INDEX idx_audit_log_action (action),
        INDEX idx_audit_log_entity (entity_type, entity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS system_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        severity ENUM('debug','info','warning','error','critical') NOT NULL DEFAULT 'info',
        source VARCHAR(100) NULL,
        message VARCHAR(255) NOT NULL,
        details LONGTEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_system_events_created_at (created_at),
        INDEX idx_system_events_type (event_type),
        INDEX idx_system_events_severity (severity)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ],
    seed: seedCoreTools
  },
  {
    key: '20260707_002_seed_core_settings',
    description: 'Seed core PBXPuls settings',
    statements: [],
    seed: seedCoreSettings
  }
];

async function createPBXPulsConnection(): Promise<Connection> {
  return mysql.createConnection({
    host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
    port: Number(process.env.PBXPULS_DB_PORT || 3306),
    user: process.env.PBXPULS_DB_USER || 'pbxpuls',
    password: process.env.PBXPULS_DB_PASS || '',
    database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
    connectTimeout: 5000,
    dateStrings: true
  });
}

export async function runPBXPulsMigrations(): Promise<void> {
  let connection: Connection | null = null;
  let activeMigration: Migration | null = null;

  try {
    connection = await createPBXPulsConnection();
    const columns = await ensureSchemaMigrationsTable(connection);

    for (const migration of MIGRATIONS) {
      const alreadyApplied = await hasMigration(connection, columns, migration.key);
      if (alreadyApplied) {
        console.log('[PBXPULS_DB] migration already applied:', migration.key);
        continue;
      }

      activeMigration = migration;
      console.log('[PBXPULS_DB] applying migration:', migration.key);
      await writeMigrationSystemEvent('migration_started', 'info', 'PBXPuls migration started', migration);
      for (const statement of migration.statements) {
        await connection.query(statement);
      }
      if (migration.seed) {
        await migration.seed(connection);
      }
      await markMigrationApplied(connection, columns, migration.key, migration.description);
      await writeMigrationSystemEvent('migration_applied', 'info', 'PBXPuls migration applied', migration);
      console.log('[PBXPULS_DB] migration applied:', migration.key);
      activeMigration = null;
    }
  } catch (error: any) {
    const safeError = sanitizeMigrationError(error);
    if (!connection) {
      await writeMigrationSystemEvent('migration_skipped_db_unavailable', 'warning', 'PBXPuls migrations skipped: database unavailable', activeMigration, safeError);
      console.warn('[PBXPULS_DB] migrations skipped:', safeError);
    } else {
      await writeMigrationSystemEvent('migration_failed', 'error', 'PBXPuls migration failed', activeMigration, safeError);
      console.warn('[PBXPULS_DB] migration failed:', safeError);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function writeMigrationSystemEvent(
  eventType: 'migration_started' | 'migration_applied' | 'migration_skipped_db_unavailable' | 'migration_failed',
  severity: 'info' | 'warning' | 'error',
  message: string,
  migration?: Migration | null,
  error?: string
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: eventType,
    severity,
    source: 'pbxpuls_migrations',
    message,
    details: {
      migration_key: migration?.key || null,
      description: migration?.description || null,
      error: error || null
    }
  });
}

async function ensureSchemaMigrationsTable(connection: Connection): Promise<SchemaMigrationColumns> {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    migration_key VARCHAR(191) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [rows] = await connection.query('SHOW COLUMNS FROM schema_migrations');
  const fields = new Set((rows as any[]).map(row => String(row.Field || '')));
  const keyColumn = fields.has('migration_key') ? 'migration_key' : 'migration_name';

  if (!fields.has(keyColumn)) {
    throw new Error('schema_migrations table has no migration_key or migration_name column');
  }

  return {
    keyColumn,
    hasDescription: fields.has('description'),
    hasAppliedAt: fields.has('applied_at')
  };
}

async function hasMigration(connection: Connection, columns: SchemaMigrationColumns, migrationKey: string): Promise<boolean> {
  const [rows] = await connection.execute(
    `SELECT 1 AS ok FROM schema_migrations WHERE ${columns.keyColumn} = ? LIMIT 1`,
    [migrationKey]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function markMigrationApplied(
  connection: Connection,
  columns: SchemaMigrationColumns,
  migrationKey: string,
  description: string
): Promise<void> {
  const names = [columns.keyColumn];
  const placeholders = ['?'];
  const values: any[] = [migrationKey];

  if (columns.hasDescription) {
    names.push('description');
    placeholders.push('?');
    values.push(description);
  }

  if (columns.hasAppliedAt) {
    names.push('applied_at');
    placeholders.push('NOW()');
  }

  await connection.execute(
    `INSERT IGNORE INTO schema_migrations (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  );
}

async function seedCoreTools(connection: Connection): Promise<void> {
  const sql = `INSERT IGNORE INTO tools
    (tool_key, name, description, category, is_enabled, is_system, sort_order)
    VALUES (?, ?, ?, ?, 1, 1, ?)`;

  for (const tool of CORE_TOOLS) {
    await connection.execute(sql, tool);
  }
}

async function seedCoreSettings(connection: Connection): Promise<void> {
  const sql = `INSERT IGNORE INTO settings
    (setting_key, setting_value, value_type, category, is_secret, description)
    VALUES (?, ?, ?, ?, 0, ?)`;

  for (const setting of CORE_SETTINGS) {
    await connection.execute(sql, setting);
  }
}

function sanitizeMigrationError(error: any): string {
  const message = String(error?.message || error || 'unknown error');
  return message
    .replace(/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s;,)]+/gi, '$1=********')
    .replace(/mysql:\/\/[^@\s]+@/gi, 'mysql://********@')
    .slice(0, 500);
}
