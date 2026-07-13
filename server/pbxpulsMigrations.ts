import fs from 'fs';
import path from 'path';
import mysql, { Connection } from 'mysql2/promise';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { buildLegacySettingsSeedRows } from './pbxpulsLegacySettings.js';
import { DIRECTORY_SQL_SCHEMA_STATEMENTS, seedLegacyDirectory } from './pbxpulsDirectorySeed.js';
import { getPBXPulsDbConfig, getPBXPulsDbConnectionOptions } from './pbxpulsDbConfig.js';
import { importLegacyMonitoringData } from './monitoringSqlStorage.js';

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

const AUTH_STORAGE_MODE_SETTING = [
  'auth.storage_mode',
  'legacy',
  'string',
  'auth',
  'Authentication source mode: legacy/sql/hybrid'
] as const;

const SETTINGS_STORAGE_MODE_SETTING = [
  'settings.storage_mode',
  'legacy',
  'string',
  'settings',
  'Controls PBXPuls settings runtime source: legacy, hybrid or sql'
] as const;

const SETTINGS_API_RUNTIME_SWITCH_SETTING = [
  'settings.api_runtime_switch',
  'false',
  'boolean',
  'settings',
  'Controls whether /api/settings uses PBXPuls hybrid runtime layer'
] as const;

const DIRECTORY_STORAGE_MODE_SETTING = [
  'directory.storage_mode',
  'legacy',
  'string',
  'directory',
  'Controls PBXPuls Directory runtime source: legacy or sql'
] as const;

const DIRECTORY_WRITE_MODE_SETTING = [
  'directory.write_mode',
  'legacy',
  'string',
  'directory',
  'Controls PBXPuls Directory write source: legacy or sql'
] as const;

const DIRECTORY_SQL_WRITE_TEST_ENABLED_SETTING = [
  'directory.sql_write_test_enabled',
  'false',
  'boolean',
  'directory',
  'Controls isolated PBXPuls Directory SQL write smoke test endpoint'
] as const;

const DIRECTORY_PRODUCTION_SQL_WRITE_UNLOCK_SETTING = [
  'directory.production_sql_write_unlock',
  'false',
  'boolean',
  'directory',
  'Controls temporary guarded unlock for PBXPuls Directory production SQL write mode'
] as const;

const DIRECTORY_SQL_SYNC_APPLY_ENABLED_SETTING = [
  'directory.sql_sync_apply_enabled',
  'false',
  'boolean',
  'directory',
  'Controls guarded apply for PBXPuls Directory SQL sync from legacy'
] as const;

const MONITORING_STORAGE_MODE_SETTING = [
  'monitoring.storage_mode', 'dual', 'string', 'monitoring',
  'Controls monitoring storage: legacy, dual or sql'
] as const;

const MONITORING_RETENTION_DAYS_SETTING = [
  'monitoring.retention_days', '30', 'number', 'monitoring',
  'Monitoring SQL history retention period in days'
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
  },
  {
    key: '20260707_003_seed_users_roles_from_legacy',
    description: 'Seed users and roles from legacy data/db.json',
    statements: [],
    seed: seedLegacyUsersAndRoles
  },
  {
    key: '20260707_004_seed_auth_storage_mode',
    description: 'Seed auth storage mode setting',
    statements: [],
    seed: seedAuthStorageMode
  },
  {
    key: '20260708_005_seed_legacy_non_secret_settings',
    description: 'Seed non-secret legacy settings from data/db.json',
    statements: [],
    seed: seedLegacyNonSecretSettings
  },
  {
    key: '20260708_006_seed_settings_storage_mode',
    description: 'Seed settings storage mode setting',
    statements: [],
    seed: seedSettingsStorageMode
  },
  {
    key: '20260708_007_seed_settings_api_runtime_switch',
    description: 'Seed settings API runtime switch guard',
    statements: [],
    seed: seedSettingsApiRuntimeSwitch
  },
  {
    key: '20260708_009_seed_directory',
    description: 'Seed legacy Directory data from data/db.json',
    statements: DIRECTORY_SQL_SCHEMA_STATEMENTS,
    seed: seedLegacyDirectory
  },
  {
    key: '20260708_010_seed_directory_storage_mode',
    description: 'Seed Directory storage mode setting',
    statements: [],
    seed: seedDirectoryStorageMode
  },
  {
    key: '20260709_010_seed_directory_write_mode',
    description: 'Seed Directory write mode setting',
    statements: [],
    seed: seedDirectoryWriteMode
  },
  {
    key: '20260709_011_seed_directory_sql_write_test_enabled',
    description: 'Seed Directory SQL write test safety flag',
    statements: [],
    seed: seedDirectorySqlWriteTestEnabled
  },
  {
    key: '20260709_012_seed_directory_production_sql_write_unlock',
    description: 'Seed Directory production SQL write unlock safety flag',
    statements: [],
    seed: seedDirectoryProductionSqlWriteUnlock
  },
  {
    key: '20260709_013_seed_directory_sql_sync_apply_enabled',
    description: 'Seed Directory SQL sync apply safety flag',
    statements: [],
    seed: seedDirectorySqlSyncApplyEnabled
  },
  {
    key: '20260711_014_quality_cache_tables',
    description: 'Create PBXPuls quality cache tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS quality_current (
        ext VARCHAR(191) NOT NULL PRIMARY KEY, name VARCHAR(191) NULL,
        device_role VARCHAR(32) NOT NULL DEFAULT 'extension', type_label VARCHAR(100) NULL,
        tech VARCHAR(32) NULL, ip VARCHAR(191) NULL, port INT NULL, status VARCHAR(64) NULL,
        quality_status VARCHAR(64) NULL, latency_ms DECIMAL(10,2) NOT NULL DEFAULT 0,
        jitter_ms DECIMAL(10,2) NOT NULL DEFAULT 0, rtp_loss DECIMAL(10,4) NOT NULL DEFAULT 0,
        mos DECIMAL(5,2) NOT NULL DEFAULT 0, pjsip_status VARCHAR(64) NULL,
        monitor_mode VARCHAR(64) NULL, options_disabled TINYINT(1) NOT NULL DEFAULT 0,
        ping_ok TINYINT(1) NOT NULL DEFAULT 0, ping_ms DECIMAL(10,2) NOT NULL DEFAULT 0,
        operational_status VARCHAR(255) NULL, user_agent VARCHAR(255) NULL,
        manufacturer VARCHAR(100) NULL, model VARCHAR(191) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_quality_current_role (device_role), INDEX idx_quality_current_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS quality_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, ext VARCHAR(191) NOT NULL, name VARCHAR(191) NULL,
        status VARCHAR(64) NULL, quality_status VARCHAR(64) NULL,
        latency_ms DECIMAL(10,2) NOT NULL DEFAULT 0, jitter_ms DECIMAL(10,2) NOT NULL DEFAULT 0,
        rtp_loss DECIMAL(10,4) NOT NULL DEFAULT 0, mos DECIMAL(5,2) NOT NULL DEFAULT 0,
        sampled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_quality_history_ext_time (ext, sampled_at), INDEX idx_quality_history_time (sampled_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ]
  },
  {
    key: '20260711_015_monitoring_sql_storage',
    description: 'Create PBXPuls monitoring SQL storage',
    statements: [
      `CREATE TABLE IF NOT EXISTS monitoring_health_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, sampled_at DATETIME NOT NULL, boot_id VARCHAR(191) NOT NULL DEFAULT '',
        uptime_seconds DECIMAL(20,2) NULL, load1 DECIMAL(10,3) NULL, load5 DECIMAL(10,3) NULL, load15 DECIMAL(10,3) NULL,
        cpu_percent DECIMAL(10,2) NULL, memory_percent DECIMAL(10,2) NULL, swap_percent DECIMAL(10,2) NULL,
        disk_root_percent DECIMAL(10,2) NULL, internet_google_avg_ms DECIMAL(12,3) NULL,
        internet_google_loss DECIMAL(10,3) NULL, internet_yandex_avg_ms DECIMAL(12,3) NULL,
        internet_yandex_loss DECIMAL(10,3) NULL, network_iface VARCHAR(191) NULL,
        network_rx_kbps DECIMAL(20,3) NULL, network_tx_kbps DECIMAL(20,3) NULL,
        network_rx_bytes BIGINT NULL, network_tx_bytes BIGINT NULL,
        asterisk_active_channels INT NULL, asterisk_active_calls INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_monitoring_health_time_boot (sampled_at, boot_id), INDEX idx_monitoring_health_time (sampled_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS monitoring_quality_alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, alert_time DATETIME NOT NULL, ext VARCHAR(191) NOT NULL DEFAULT '',
        name VARCHAR(191) NULL, type VARCHAR(191) NOT NULL, severity VARCHAR(64) NULL, message TEXT NULL,
        value DECIMAL(20,4) NULL, threshold_value DECIMAL(20,4) NULL, raw_json LONGTEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_monitoring_quality_alert (alert_time, ext, type), INDEX idx_monitoring_quality_alert_time (alert_time),
        INDEX idx_monitoring_quality_alert_ext (ext)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS monitoring_devices_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, device_id VARCHAR(191) NOT NULL, sampled_at DATETIME NOT NULL,
        status VARCHAR(64) NULL, ip VARCHAR(191) NULL, port INT NULL, tech VARCHAR(32) NULL,
        user_agent VARCHAR(255) NULL, manufacturer VARCHAR(100) NULL, model VARCHAR(191) NULL, raw_json LONGTEXT NULL,
        UNIQUE KEY uniq_monitoring_device_history (device_id, sampled_at), INDEX idx_monitoring_device_history_time (sampled_at),
        INDEX idx_monitoring_device_history_device (device_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS monitoring_devices_alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, alert_time DATETIME NOT NULL, device_id VARCHAR(191) NOT NULL DEFAULT '',
        type VARCHAR(191) NOT NULL, severity VARCHAR(64) NULL, message TEXT NULL, raw_json LONGTEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_monitoring_device_alert (alert_time, device_id, type), INDEX idx_monitoring_device_alert_time (alert_time),
        INDEX idx_monitoring_device_alert_device (device_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS monitoring_devices_conflicts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, conflict_key VARCHAR(191) NOT NULL,
        first_seen_at DATETIME NULL, last_seen_at DATETIME NULL, status VARCHAR(64) NULL, raw_json LONGTEXT NULL,
        UNIQUE KEY uniq_monitoring_conflict_key (conflict_key), INDEX idx_monitoring_conflict_key (conflict_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS monitoring_devices_map (
        device_id VARCHAR(191) NOT NULL PRIMARY KEY, name VARCHAR(191) NULL, ip VARCHAR(191) NULL, port INT NULL,
        tech VARCHAR(32) NULL, manufacturer VARCHAR(100) NULL, model VARCHAR(191) NULL, user_agent VARCHAR(255) NULL,
        raw_json LONGTEXT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ],
    seed: async connection => {
      await ensureQualityHistoryUniqueKey(connection);
      await seedSetting(connection, MONITORING_STORAGE_MODE_SETTING);
      await importLegacyMonitoringData(connection);
    }
  },
  {
    key: '20260713_016_monitoring_retention_policy',
    description: 'Seed Monitoring SQL retention policy',
    statements: [],
    seed: async connection => {
      await seedSetting(connection, MONITORING_RETENTION_DAYS_SETTING);
    }
  }
];

async function ensureQualityHistoryUniqueKey(connection: Connection): Promise<void> {
  const [rows] = await connection.query("SHOW INDEX FROM quality_history WHERE Key_name = 'uniq_quality_history_ext_time'");
  if (Array.isArray(rows) && rows.length) return;
  await connection.query(`DELETE q1 FROM quality_history q1 INNER JOIN quality_history q2
    ON q1.ext = q2.ext AND q1.sampled_at = q2.sampled_at AND q1.id > q2.id`);
  await connection.query('ALTER TABLE quality_history ADD UNIQUE KEY uniq_quality_history_ext_time (ext, sampled_at)');
}

async function seedSetting(connection: Connection, row: readonly unknown[]): Promise<void> {
  await connection.execute(`INSERT IGNORE INTO settings
    (setting_key, setting_value, value_type, category, description) VALUES (?, ?, ?, ?, ?)`, row as any[]);
}

async function createPBXPulsConnection(): Promise<Connection> {
  if (!getPBXPulsDbConfig().configured) throw new Error('PBXPuls DB access denied / not configured');
  return mysql.createConnection(getPBXPulsDbConnectionOptions());
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

async function seedAuthStorageMode(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    AUTH_STORAGE_MODE_SETTING
  );
}

async function seedSettingsStorageMode(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    SETTINGS_STORAGE_MODE_SETTING
  );
}

async function seedSettingsApiRuntimeSwitch(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    SETTINGS_API_RUNTIME_SWITCH_SETTING
  );
}

async function seedDirectoryStorageMode(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    DIRECTORY_STORAGE_MODE_SETTING
  );
}

async function seedDirectoryWriteMode(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    DIRECTORY_WRITE_MODE_SETTING
  );
}

async function seedDirectorySqlWriteTestEnabled(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    DIRECTORY_SQL_WRITE_TEST_ENABLED_SETTING
  );
}

async function seedDirectoryProductionSqlWriteUnlock(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    DIRECTORY_PRODUCTION_SQL_WRITE_UNLOCK_SETTING
  );
}

async function seedDirectorySqlSyncApplyEnabled(connection: Connection): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO settings
      (setting_key, setting_value, value_type, category, is_secret, description)
     VALUES (?, ?, ?, ?, 0, ?)`,
    DIRECTORY_SQL_SYNC_APPLY_ENABLED_SETTING
  );
}

interface LegacySettingsSeedStats {
  total: number;
  seeded: number;
  skippedSecrets: number;
  skippedExisting: number;
}

async function seedLegacyNonSecretSettings(connection: Connection): Promise<void> {
  const legacyPath = path.join(process.cwd(), 'data', 'db.json');
  const stats: LegacySettingsSeedStats = {
    total: 0,
    seeded: 0,
    skippedSecrets: 0,
    skippedExisting: 0
  };

  let legacyDb: any;
  try {
    if (!fs.existsSync(legacyPath)) {
      console.warn('[PBXPULS_DB] legacy settings seed skipped: data/db.json not found');
      return;
    }
    legacyDb = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  } catch (error: any) {
    console.warn('[PBXPULS_DB] legacy settings seed skipped:', sanitizeMigrationError(error));
    return;
  }

  const rows = buildLegacySettingsSeedRows(legacyDb);
  const safeRows = rows.filter(row => row.willSeed === true && row.is_secret !== true && row.value_type !== 'secret');
  stats.total = rows.length;
  stats.skippedSecrets = rows.length - safeRows.length;

  for (const row of safeRows) {
    stats.seeded += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO settings
        (setting_key, setting_value, value_type, category, is_secret, description)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [
        row.setting_key,
        row.setting_value,
        row.value_type,
        row.category,
        row.description
      ]
    );
  }

  stats.skippedExisting = safeRows.length - stats.seeded;
  console.log('[PBXPULS_DB] legacy non-secret settings seed applied:', stats);

  await writePBXPulsSystemEvent({
    event_type: 'legacy_settings_seeded',
    severity: 'info',
    source: 'pbxpuls_settings',
    message: 'Legacy non-secret settings seeded',
    details: stats
  });
}

interface LegacySeedStats {
  users: number;
  roles: number;
  permissions: number;
  userRoles: number;
  rolePermissions: number;
}

async function seedLegacyUsersAndRoles(connection: Connection): Promise<void> {
  const legacyPath = path.join(process.cwd(), 'data', 'db.json');
  const stats: LegacySeedStats = {
    users: 0,
    roles: 0,
    permissions: 0,
    userRoles: 0,
    rolePermissions: 0
  };

  let legacyDb: any;
  try {
    if (!fs.existsSync(legacyPath)) {
      console.warn('[PBXPULS_DB] legacy users/roles seed skipped: data/db.json not found');
      return;
    }
    legacyDb = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  } catch (error: any) {
    console.warn('[PBXPULS_DB] legacy users/roles seed skipped:', sanitizeMigrationError(error));
    return;
  }

  const legacyUsers = Array.isArray(legacyDb?.users) ? legacyDb.users : [];
  const legacyRoles = Array.isArray(legacyDb?.roles) ? legacyDb.roles : [];

  if (!legacyUsers.length && !legacyRoles.length) {
    console.warn('[PBXPULS_DB] legacy users/roles seed skipped: no legacy users or roles found');
    return;
  }

  const roleIdsByKey = new Map<string, number>();
  const permissionIdsByKey = new Map<string, number>();

  for (const role of legacyRoles) {
    const roleKey = normalizeLegacyKey(role?.id || role?.role || role?.key || role?.name, 100);
    if (!roleKey) continue;

    stats.roles += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO roles (role_key, name, description, is_system)
       VALUES (?, ?, ?, 1)`,
      [
        roleKey,
        normalizeLegacyText(role?.name, roleKey, 191),
        normalizeLegacyNullableText(role?.description, 255)
      ]
    );
  }

  for (const row of await selectRows(connection, 'SELECT id, role_key FROM roles')) {
    roleIdsByKey.set(String(row.role_key), Number(row.id));
  }

  const permissionKeys = collectLegacyPermissionKeys(legacyRoles, legacyUsers);
  for (const permissionKey of permissionKeys) {
    stats.permissions += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO permissions (permission_key, name, category)
       VALUES (?, ?, ?)`,
      [permissionKey, permissionKey, getPermissionCategory(permissionKey)]
    );
  }

  for (const row of await selectRows(connection, 'SELECT id, permission_key FROM permissions')) {
    permissionIdsByKey.set(String(row.permission_key), Number(row.id));
  }

  for (const user of legacyUsers) {
    const username = normalizeLegacyKey(user?.username, 100);
    if (!username) continue;

    stats.users += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO users (username, display_name, email, password_hash, is_active, is_system)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        username,
        normalizeLegacyNullableText(user?.displayName || user?.display_name || user?.name || username, 191),
        normalizeLegacyNullableText(user?.email, 191),
        typeof user?.passwordHash === 'string' ? user.passwordHash.slice(0, 255) : null,
        user?.disabled ? 0 : 1
      ]
    );
  }

  const userIdsByUsername = new Map<string, number>();
  for (const row of await selectRows(connection, 'SELECT id, username FROM users')) {
    userIdsByUsername.set(String(row.username).toLowerCase(), Number(row.id));
  }

  for (const user of legacyUsers) {
    const username = normalizeLegacyKey(user?.username, 100);
    const roleKey = normalizeLegacyKey(user?.role, 100);
    const userId = userIdsByUsername.get(username.toLowerCase());
    const roleId = roleIdsByKey.get(roleKey);
    if (!userId || !roleId) continue;

    stats.userRoles += await executeInsertIgnore(connection,
      'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleId]
    );
  }

  for (const role of legacyRoles) {
    const roleKey = normalizeLegacyKey(role?.id || role?.role || role?.key || role?.name, 100);
    const roleId = roleIdsByKey.get(roleKey);
    if (!roleId) continue;

    const permissions = role?.permissions && typeof role.permissions === 'object' ? role.permissions : {};
    for (const [permissionKey, enabled] of Object.entries(permissions)) {
      if (enabled !== true) continue;
      const normalizedPermissionKey = normalizeLegacyKey(permissionKey, 191);
      const permissionId = permissionIdsByKey.get(normalizedPermissionKey);
      if (!permissionId) continue;

      stats.rolePermissions += await executeInsertIgnore(connection,
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleId, permissionId]
      );
    }
  }

  console.log('[PBXPULS_DB] legacy users/roles seed applied:', stats);
}

async function executeInsertIgnore(connection: Connection, sql: string, params: any[]): Promise<number> {
  const [result] = await connection.execute(sql, params);
  return Number((result as any)?.affectedRows || 0);
}

async function selectRows(connection: Connection, sql: string): Promise<any[]> {
  const [rows] = await connection.query(sql);
  return Array.isArray(rows) ? rows as any[] : [];
}

function collectLegacyPermissionKeys(roles: any[], users: any[]): string[] {
  const keys = new Set<string>();
  for (const source of [...roles, ...users]) {
    const permissions = source?.permissions && typeof source.permissions === 'object' ? source.permissions : {};
    for (const key of Object.keys(permissions)) {
      const normalizedKey = normalizeLegacyKey(key, 191);
      if (normalizedKey) keys.add(normalizedKey);
    }
  }
  return Array.from(keys).sort();
}

function getPermissionCategory(permissionKey: string): string | null {
  const dotIndex = permissionKey.indexOf('.');
  if (dotIndex <= 0) return null;
  return permissionKey.slice(0, dotIndex).slice(0, 100);
}

function normalizeLegacyKey(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeLegacyText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim() || fallback;
  return text.slice(0, maxLength);
}

function normalizeLegacyNullableText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function sanitizeMigrationError(error: any): string {
  const message = String(error?.message || error || 'unknown error');
  return message
    .replace(/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s;,)]+/gi, '$1=********')
    .replace(/mysql:\/\/[^@\s]+@/gi, 'mysql://********@')
    .slice(0, 500);
}
