import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  },
  {
    key: '20260715_017_directory_own_contact_permission',
    description: 'Register permission for editing only owned Directory contacts',
    statements: [
      `INSERT IGNORE INTO permissions (permission_key, name, category)
       VALUES ('edit_own_directory_contacts', 'Edit owned Directory contacts', 'directory')`
    ]
  },
  {
    key: '20260717_018_security_monitoring_center',
    description: 'Create security monitoring storage, settings and permissions',
    statements: [
      `CREATE TABLE IF NOT EXISTS security_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, occurred_at DATETIME NOT NULL, received_at DATETIME NOT NULL,
        severity ENUM('info','low','medium','high','critical') NOT NULL, category VARCHAR(100) NOT NULL,
        source VARCHAR(100) NOT NULL, source_file VARCHAR(512) NULL, source_ip VARCHAR(64) NULL, source_port INT NULL,
        destination_ip VARCHAR(64) NULL, destination_port INT NULL, protocol VARCHAR(32) NULL, extension VARCHAR(64) NULL,
        username VARCHAR(191) NULL, jail VARCHAR(100) NULL, service VARCHAR(100) NULL, action VARCHAR(100) NULL,
        result ENUM('allowed','blocked','failed','success','unknown') NOT NULL DEFAULT 'unknown', title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL, fingerprint CHAR(64) NOT NULL, occurrence_count BIGINT NOT NULL DEFAULT 1,
        first_seen_at DATETIME NOT NULL, last_seen_at DATETIME NOT NULL, country_code CHAR(2) NULL,
        country_name VARCHAR(100) NULL, asn VARCHAR(64) NULL, organization VARCHAR(191) NULL,
        is_private_ip TINYINT(1) NOT NULL DEFAULT 0, raw_excerpt TEXT NULL, metadata_json LONGTEXT NULL,
        UNIQUE KEY uniq_security_event_fingerprint (fingerprint), INDEX idx_security_events_occurred (occurred_at),
        INDEX idx_security_events_last_seen (last_seen_at), INDEX idx_security_events_severity (severity),
        INDEX idx_security_events_category (category), INDEX idx_security_events_source_ip (source_ip),
        INDEX idx_security_events_extension (extension), INDEX idx_security_events_jail (jail), INDEX idx_security_events_result (result)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_event_sources (
        id INT AUTO_INCREMENT PRIMARY KEY, source_key VARCHAR(191) NOT NULL UNIQUE, source_type VARCHAR(100) NOT NULL,
        source_path VARCHAR(512) NULL, status VARCHAR(64) NOT NULL DEFAULT 'unknown', cursor_value VARCHAR(512) NULL,
        inode_value VARCHAR(100) NULL, last_size BIGINT NULL, last_mtime DATETIME NULL, last_success_at DATETIME NULL,
        last_error VARCHAR(500) NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_ip_whitelist (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, ip_address VARCHAR(64) NOT NULL UNIQUE, comment VARCHAR(255) NULL,
        created_by VARCHAR(191) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_security_whitelist_ip (ip_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_sip_registration_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, endpoint VARCHAR(64) NOT NULL, ip_address VARCHAR(64) NOT NULL,
        port INT NULL, transport VARCHAR(16) NULL, user_agent VARCHAR(255) NULL, first_seen_at DATETIME NOT NULL,
        last_seen_at DATETIME NOT NULL, seen_count BIGINT NOT NULL DEFAULT 1, is_private TINYINT(1) NOT NULL DEFAULT 0,
        is_trusted TINYINT(1) NOT NULL DEFAULT 0, metadata_json LONGTEXT NULL,
        UNIQUE KEY uniq_security_sip_endpoint_ip (endpoint,ip_address,port,transport),
        INDEX idx_security_sip_last_seen (last_seen_at), INDEX idx_security_sip_endpoint (endpoint), INDEX idx_security_sip_ip (ip_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_check_results (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, check_key VARCHAR(191) NOT NULL UNIQUE, check_group VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL, status ENUM('passed','warning','failed','unknown','not_applicable') NOT NULL,
        severity ENUM('info','low','medium','high','critical') NOT NULL, summary VARCHAR(1000) NOT NULL,
        details TEXT NULL, recommendation TEXT NULL, evidence_json LONGTEXT NULL, checked_at DATETIME NOT NULL,
        INDEX idx_security_checks_status (status), INDEX idx_security_checks_severity (severity), INDEX idx_security_checks_time (checked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_file_baselines (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, path VARCHAR(191) NOT NULL UNIQUE, sha256 CHAR(64) NULL, size_bytes BIGINT NULL,
        mtime DATETIME NULL, mode_value VARCHAR(16) NULL, owner_name VARCHAR(100) NULL, group_name VARCHAR(100) NULL,
        baseline_at DATETIME NOT NULL, metadata_json LONGTEXT NULL, INDEX idx_security_baseline_path (path(191))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_file_changes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, path VARCHAR(1000) NOT NULL, change_type VARCHAR(32) NOT NULL,
        severity ENUM('info','low','medium','high','critical') NOT NULL, previous_sha256 CHAR(64) NULL,
        current_sha256 CHAR(64) NULL, detected_at DATETIME NOT NULL, metadata_json LONGTEXT NULL,
        INDEX idx_security_file_changes_time (detected_at), INDEX idx_security_file_changes_severity (severity), INDEX idx_security_file_changes_path (path(191))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_alert_rules (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, rule_key VARCHAR(191) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1, severity ENUM('info','low','medium','high','critical') NOT NULL,
        threshold_value DECIMAL(20,4) NULL, cooldown_minutes INT NOT NULL DEFAULT 30, last_triggered_at DATETIME NULL,
        trigger_count BIGINT NOT NULL DEFAULT 0, config_json LONGTEXT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL, INDEX idx_security_alert_rules_severity (severity)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_alert_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, rule_key VARCHAR(191) NOT NULL, severity ENUM('info','low','medium','high','critical') NOT NULL,
        title VARCHAR(255) NOT NULL, details_json LONGTEXT NULL, triggered_at DATETIME NOT NULL,
        INDEX idx_security_alert_history_time (triggered_at), INDEX idx_security_alert_history_rule (rule_key), INDEX idx_security_alert_history_severity (severity)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS security_scan_runs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, scan_type VARCHAR(100) NOT NULL, status VARCHAR(32) NOT NULL,
        started_at DATETIME NOT NULL, completed_at DATETIME NULL, duration_ms BIGINT NULL, summary_json LONGTEXT NULL,
        error_text VARCHAR(500) NULL, INDEX idx_security_scan_type_status (scan_type,status), INDEX idx_security_scan_started (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('view_security','View security center','Open PBXPuls security monitoring center','security'),
        ('view_security_events','View security events','View normalized security events and external IPs','security'),
        ('view_firewall','View firewall','View Firewall rules and listening ports','security'),
        ('view_fail2ban','View Fail2Ban','View Fail2Ban jails and bans','security'),
        ('manage_fail2ban','Manage Fail2Ban','Manually ban and unban IP addresses','security'),
        ('manage_security_whitelist','Manage security whitelist','Manage PBXPuls security IP whitelist','security'),
        ('view_security_config_audit','View security config audit','View security checks and file changes','security'),
        ('manage_security_settings','Manage security settings','Manage security monitoring settings and alert rules','security'),
        ('export_security_report','Export security report','Export security monitoring reports','security')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.category='security' WHERE r.role_key IN ('su','admin')`,
      `INSERT IGNORE INTO settings (setting_key,setting_value,value_type,category,is_secret,description) VALUES
        ('security.enabled','1','boolean','security',0,'Enable security monitoring collector'),
        ('security.event_retention_days','30','number','security',0,'Security event retention days'),
        ('security.raw_excerpt_enabled','1','boolean','security',0,'Store masked raw excerpts'),
        ('security.raw_excerpt_max_length','2000','number','security',0,'Maximum masked raw excerpt length'),
        ('security.scan_interval_seconds','60','number','security',0,'Security scan interval'),
        ('security.log_poll_interval_seconds','15','number','security',0,'Security log polling interval'),
        ('security.file_integrity_enabled','0','boolean','security',0,'Enable file integrity monitoring'),
        ('security.file_integrity_interval_minutes','60','number','security',0,'File integrity interval'),
        ('security.geoip_enabled','1','boolean','security',0,'Use local GeoIP database when available'),
        ('security.sip_new_ip_detection_enabled','1','boolean','security',0,'Detect new SIP registration IPs'),
        ('security.notification_cooldown_minutes','30','number','security',0,'Security notification cooldown'),
        ('security.fail2ban_actions_enabled','0','boolean','security',0,'Guard manual Fail2Ban actions')`,
      `INSERT IGNORE INTO security_alert_rules (rule_key,name,severity,cooldown_minutes) VALUES
        ('firewall_disabled','Firewall выключен','critical',30),('fail2ban_stopped','Fail2Ban остановлен','high',30),
        ('critical_port_exposed','Критический порт','critical',30),('ami_exposed','AMI доступен извне','critical',30),
        ('mariadb_exposed','MariaDB доступна извне','critical',30),('sip_auth_burst','Массовые SIP auth failures','high',30),
        ('ssh_auth_burst','Массовые SSH auth failures','high',30),('asterisk_stopped','Asterisk остановлен','critical',10),
        ('disk_low','Критически заполнен диск','critical',30),('critical_file_changed','Изменён критический файл','critical',30)`
    ]
  },
  {
    key: '20260717_019_security_threat_source_sync',
    description: 'Normalize security timestamps and canonical event sources',
    statements: [
      `ALTER TABLE security_event_sources
        ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER status,
        ADD COLUMN collector_version VARCHAR(32) NULL AFTER active`,
      `UPDATE security_event_sources keep_row
       JOIN (SELECT source_type,source_path,MIN(id) keep_id,MAX(last_success_at) newest_success
             FROM security_event_sources GROUP BY source_type,source_path) grouped ON grouped.keep_id=keep_row.id
       LEFT JOIN security_event_sources newest ON newest.source_type=grouped.source_type AND newest.source_path=grouped.source_path
         AND newest.last_success_at=grouped.newest_success
       SET keep_row.status=COALESCE(newest.status,keep_row.status),keep_row.cursor_value=COALESCE(newest.cursor_value,keep_row.cursor_value),
         keep_row.inode_value=COALESCE(newest.inode_value,keep_row.inode_value),keep_row.last_size=COALESCE(newest.last_size,keep_row.last_size),
         keep_row.last_mtime=COALESCE(newest.last_mtime,keep_row.last_mtime),keep_row.last_success_at=COALESCE(newest.last_success_at,keep_row.last_success_at),
         keep_row.last_error=COALESCE(newest.last_error,keep_row.last_error),keep_row.collector_version='2',keep_row.active=1`,
      `DELETE duplicate_row FROM security_event_sources duplicate_row
       JOIN (SELECT source_type,source_path,MIN(id) keep_id FROM security_event_sources GROUP BY source_type,source_path) grouped
         ON grouped.source_type=duplicate_row.source_type AND grouped.source_path=duplicate_row.source_path
       WHERE duplicate_row.id<>grouped.keep_id`,
      `UPDATE security_event_sources SET source_key=CONCAT(source_type,':',source_path),collector_version='2',active=1`,
      `ALTER TABLE security_event_sources ADD UNIQUE KEY uniq_security_source_path (source_type(32),source_path(128))`,
      `CREATE TABLE IF NOT EXISTS security_event_source_stats (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,source_id INT NOT NULL,bucket_start DATETIME NOT NULL,
        lines_read BIGINT NOT NULL DEFAULT 0,events_parsed BIGINT NOT NULL DEFAULT 0,events_created BIGINT NOT NULL DEFAULT 0,
        events_updated BIGINT NOT NULL DEFAULT 0,last_event_at DATETIME NULL,
        UNIQUE KEY uniq_security_source_stats_bucket (source_id,bucket_start),INDEX idx_security_source_stats_time (bucket_start)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `UPDATE security_events SET
         occurred_at=TIMESTAMPADD(SECOND,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()),occurred_at),
         first_seen_at=TIMESTAMPADD(SECOND,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()),first_seen_at),
         last_seen_at=TIMESTAMPADD(SECOND,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()),last_seen_at)
      WHERE TIMESTAMPDIFF(MINUTE,occurred_at,received_at) BETWEEN 120 AND 360`
    ]
  },
  {
    key: '20260717_020_security_source_stats_null_time',
    description: 'Keep empty source activity timestamps nullable',
    statements: [
      `UPDATE security_event_source_stats SET last_event_at=NULL WHERE last_event_at='1970-01-01 00:00:00'`
    ]
  },
  {
    key: '20260720_021_log_analysis',
    description: 'Create centralized read-only log analysis storage and permission',
    statements: [
      `CREATE TABLE IF NOT EXISTS log_sources (
        id INT AUTO_INCREMENT PRIMARY KEY, source_key VARCHAR(191) NOT NULL UNIQUE, display_name VARCHAR(191) NOT NULL,
        category VARCHAR(64) NOT NULL, source_type ENUM('file','journald','database','pm2') NOT NULL,
        canonical_path VARCHAR(512) NULL, journal_unit VARCHAR(191) NULL, detected TINYINT(1) NOT NULL DEFAULT 0,
        readable TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, status VARCHAR(64) NOT NULL DEFAULT 'unknown',
        file_size BIGINT NULL, inode_value VARCHAR(100) NULL, modified_at DATETIME NULL, last_read_at DATETIME NULL,
        last_event_at DATETIME NULL, read_error VARCHAR(500) NULL, parser_key VARCHAR(100) NOT NULL,
        platform VARCHAR(64) NULL, collector_version VARCHAR(32) NOT NULL,
        UNIQUE KEY uniq_log_source_identity (source_type,canonical_path(128),journal_unit(64)), INDEX idx_log_sources_status (status,active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS log_cursors (
        source_key VARCHAR(191) PRIMARY KEY, inode_value VARCHAR(100) NULL, byte_offset BIGINT NOT NULL DEFAULT 0,
        file_size BIGINT NOT NULL DEFAULT 0, modified_at DATETIME NULL, journal_cursor VARCHAR(1000) NULL,
        last_line_hash CHAR(64) NULL, last_read_at DATETIME NULL, collector_version VARCHAR(32) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS log_event_groups (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, fingerprint CHAR(64) NOT NULL UNIQUE, source_key VARCHAR(191) NOT NULL,
        category VARCHAR(64) NOT NULL, severity ENUM('critical','error','warning','notice','info','debug') NOT NULL,
        event_type VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, last_message VARCHAR(2000) NOT NULL,
        occurrence_count BIGINT NOT NULL DEFAULT 1, first_seen_at DATETIME NOT NULL, last_seen_at DATETIME NOT NULL,
        affected_ips_json TEXT NULL, affected_extensions_json TEXT NULL, affected_trunks_json TEXT NULL,
        INDEX idx_log_groups_last_seen (last_seen_at), INDEX idx_log_groups_severity (severity), INDEX idx_log_groups_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS log_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, dedup_key CHAR(64) NOT NULL UNIQUE, occurred_at DATETIME NOT NULL, received_at DATETIME NOT NULL,
        source_key VARCHAR(191) NOT NULL, source_name VARCHAR(191) NOT NULL, category VARCHAR(64) NOT NULL,
        severity ENUM('critical','error','warning','notice','info','debug') NOT NULL, event_type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL, message VARCHAR(2000) NOT NULL, raw_message VARCHAR(4000) NULL, host VARCHAR(191) NULL,
        process_name VARCHAR(191) NULL, pid INT NULL, module_name VARCHAR(191) NULL, ip_address VARCHAR(64) NULL, port INT NULL,
        protocol VARCHAR(32) NULL, username VARCHAR(191) NULL, extension_number VARCHAR(64) NULL, sip_peer VARCHAR(191) NULL,
        trunk VARCHAR(191) NULL, channel VARCHAR(255) NULL, call_id VARCHAR(255) NULL, uniqueid VARCHAR(191) NULL,
        linkedid VARCHAR(191) NULL, http_method VARCHAR(16) NULL, http_path VARCHAR(1000) NULL, http_status INT NULL,
        service VARCHAR(191) NULL, jail VARCHAR(191) NULL, fingerprint CHAR(64) NOT NULL, parser_confidence DECIMAL(4,3) NOT NULL,
        tags_json TEXT NULL, recommendations_json TEXT NULL, correlation_id VARCHAR(100) NULL, correlation_type VARCHAR(100) NULL,
        correlation_confidence DECIMAL(4,3) NULL, context_before_json TEXT NULL, context_after_json TEXT NULL,
        INDEX idx_log_events_occurred (occurred_at), INDEX idx_log_events_severity (severity), INDEX idx_log_events_source (source_key),
        INDEX idx_log_events_type (event_type), INDEX idx_log_events_fingerprint (fingerprint), INDEX idx_log_events_ip (ip_address),
        INDEX idx_log_events_extension (extension_number), INDEX idx_log_events_linkedid (linkedid), INDEX idx_log_events_call_id (call_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS log_correlations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, correlation_key VARCHAR(191) NOT NULL UNIQUE, correlation_type VARCHAR(100) NOT NULL,
        confidence DECIMAL(4,3) NOT NULL, explanation VARCHAR(500) NOT NULL, event_ids_json TEXT NOT NULL,
        first_seen_at DATETIME NOT NULL, last_seen_at DATETIME NOT NULL, INDEX idx_log_correlations_last_seen (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('view_log_analysis','View log analysis','View centralized masked PBX and OS log analysis','monitoring')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key='view_log_analysis' WHERE r.role_key IN ('su','admin')`,
      `INSERT IGNORE INTO settings (setting_key,setting_value,value_type,category,is_secret,description) VALUES
        ('log_analysis.enabled','1','boolean','log_analysis',0,'Enable centralized log analysis'),
        ('log_analysis.poll_interval_seconds','5','number','log_analysis',0,'Active tab polling interval'),
        ('log_analysis.retention_days','30','number','log_analysis',0,'Normalized event retention'),
        ('log_analysis.group_retention_days','90','number','log_analysis',0,'Event group retention'),
        ('log_analysis.message_max_length','4000','number','log_analysis',0,'Maximum masked message length'),
        ('log_analysis.context_lines','5','number','log_analysis',0,'Context lines before and after'),
        ('log_analysis.correlation_enabled','1','boolean','log_analysis',0,'Enable explainable correlation'),
        ('log_analysis.grouping_enabled','1','boolean','log_analysis',0,'Enable event grouping'),
        ('log_analysis.max_history_days','7','number','log_analysis',0,'Maximum history range'),
        ('log_analysis.max_export_rows','5000','number','log_analysis',0,'Maximum masked export rows'),
        ('log_analysis.debug_visible','0','boolean','log_analysis',0,'Show debug events')`
    ]
  },
  {
    key: '20260721_022_log_source_audit',
    description: 'Extend centralized log source diagnostics and discovery metadata',
    statements: [
      `ALTER TABLE log_sources MODIFY source_type ENUM('file','directory','journald','database','pm2') NOT NULL`,
      `ALTER TABLE log_sources ADD COLUMN group_name VARCHAR(100) NULL AFTER category`,
      `ALTER TABLE log_sources ADD COLUMN supports_logrotate TINYINT(1) NOT NULL DEFAULT 0 AFTER active`,
      `ALTER TABLE log_sources ADD COLUMN sensitivity VARCHAR(32) NOT NULL DEFAULT 'normal' AFTER parser_key`,
      `ALTER TABLE log_sources ADD COLUMN supported_fields_json TEXT NULL AFTER sensitivity`,
      `ALTER TABLE log_sources ADD COLUMN rotated_paths_json TEXT NULL AFTER supported_fields_json`,
      `ALTER TABLE log_sources ADD COLUMN unavailable_reason VARCHAR(500) NULL AFTER read_error`,
      `ALTER TABLE log_events ADD COLUMN phone_number VARCHAR(64) NULL AFTER extension_number`,
      `ALTER TABLE log_events ADD COLUMN dialplan_context VARCHAR(191) NULL AFTER channel`,
      `ALTER TABLE log_events ADD COLUMN application_name VARCHAR(100) NULL AFTER dialplan_context`,
      `ALTER TABLE log_events ADD INDEX idx_log_events_phone (phone_number)`
    ]
  },
  {
    key: '20260721_023_monitoring_tab_permissions',
    description: 'Register and enforce independent permissions for every monitoring tab',
    statements: [
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('view_active_calls','View active calls','Open active Asterisk calls','monitoring'),
        ('view_tcpdump','View TCPDUMP','Open TCPDUMP and SIP-RTP diagnostics','monitoring'),
        ('view_sngrep','View SNGREP','Open SNGREP SIP diagnostics','monitoring'),
        ('view_cli','View command center','Open Asterisk and FreePBX command center','monitoring'),
        ('view_db_explorer','View DB Explorer','Open read-only PBXPuls DB Explorer','monitoring'),
        ('view_sip_devices_map','View IP SIP devices map','Open IP and SIP devices map','monitoring'),
        ('view_quality','View call quality','Open RTP and call quality monitoring','monitoring'),
        ('view_health','View PBX health','Open PBX and server health report','monitoring'),
        ('view_ai_pbx_admin','View AI PBX admin','Open AI PBX administrator','monitoring'),
        ('view_security','View security','Open security monitoring','monitoring'),
        ('view_log_analysis','View log analysis','Open log analysis and call trace','monitoring')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN
       ('view_active_calls','view_tcpdump','view_sngrep','view_cli','view_db_explorer','view_sip_devices_map','view_quality','view_health','view_ai_pbx_admin','view_security','view_log_analysis')
       WHERE r.role_key IN ('su','admin')`
    ],
    seed: seedLegacyMonitoringTabPermissions
  },
  {
    key: '20260721_024_quality_rtcp_history',
    description: 'Store measured RTP and RTCP quality history separately from legacy calculated telemetry',
    statements: [
      `CREATE TABLE IF NOT EXISTS quality_rtcp_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        ext VARCHAR(64) NOT NULL,
        name VARCHAR(191) NULL,
        status VARCHAR(64) NULL,
        quality_status VARCHAR(64) NULL,
        sip_rtt_ms DECIMAL(10,2) NULL,
        jitter_ms DECIMAL(10,2) NULL,
        rtp_loss DECIMAL(10,4) NULL,
        mos DECIMAL(5,2) NULL,
        sampled_at DATETIME NOT NULL,
        metrics_source ENUM('rtcp') NOT NULL DEFAULT 'rtcp',
        UNIQUE KEY uniq_quality_rtcp_ext_time (ext, sampled_at),
        INDEX idx_quality_rtcp_time (sampled_at),
        INDEX idx_quality_rtcp_ext_time (ext, sampled_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ]
  },
  {
    key: '20260721_025_call_intelligence_permission',
    description: 'Register independent read-only access to the Call Intelligence monitoring card',
    statements: [
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('view_call_intelligence','View Call Intelligence','Open the unified read-only call diagnostics card','monitoring')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key='view_call_intelligence'
       WHERE r.role_key IN ('su','admin')`
    ],
    seed: seedLegacyMonitoringTabPermissions
  },
  {
    key: '20260722_026_ai_platform_core_foundation',
    description: 'Create tenant-scoped PBXPuls AI Platform Core foundation',
    statements: [
      `CREATE TABLE IF NOT EXISTS ai_tenants (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_key VARCHAR(100) NOT NULL,
        name VARCHAR(191) NOT NULL,
        mode ENUM('installation','saas') NOT NULL DEFAULT 'installation',
        status ENUM('active','disabled') NOT NULL DEFAULT 'active',
        settings_json LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_tenants_key (tenant_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        agent_key VARCHAR(100) NOT NULL,
        name VARCHAR(191) NOT NULL,
        agent_type VARCHAR(100) NOT NULL,
        status ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
        current_version_id BIGINT NULL,
        created_by VARCHAR(191) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_agent_key (tenant_id,agent_key),
        INDEX idx_ai_agents_tenant_status (tenant_id,status),
        CONSTRAINT fk_ai_agents_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agent_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        agent_id BIGINT NOT NULL,
        version_number INT NOT NULL,
        lifecycle_status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
        config_json LONGTEXT NOT NULL,
        system_prompt LONGTEXT NOT NULL,
        checksum CHAR(64) NULL,
        created_by VARCHAR(191) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at DATETIME NULL,
        UNIQUE KEY uniq_ai_agent_version (agent_id,version_number),
        INDEX idx_ai_agent_versions_agent_status (agent_id,lifecycle_status),
        INDEX idx_ai_agent_versions_tenant (tenant_id),
        CONSTRAINT fk_ai_agent_versions_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_agent_versions_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_provider_configs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        provider_key VARCHAR(64) NOT NULL,
        purpose VARCHAR(100) NOT NULL,
        model VARCHAR(191) NOT NULL,
        base_url VARCHAR(500) NULL,
        secret_ref VARCHAR(255) NULL,
        encrypted_secret LONGTEXT NULL,
        key_version VARCHAR(64) NULL,
        options_json LONGTEXT NOT NULL,
        status ENUM('active','disabled','not_configured','error') NOT NULL DEFAULT 'not_configured',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_provider_purpose (tenant_id,provider_key,purpose),
        INDEX idx_ai_provider_tenant_status (tenant_id,status),
        CONSTRAINT fk_ai_provider_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_tools (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NULL,
        tool_key VARCHAR(100) NOT NULL,
        version INT NOT NULL,
        description VARCHAR(500) NOT NULL,
        risk_level ENUM('read','low_write','high_write','forbidden') NOT NULL,
        input_schema_json LONGTEXT NOT NULL,
        output_schema_json LONGTEXT NOT NULL,
        executor_key VARCHAR(191) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_tool (tenant_id,tool_key,version),
        INDEX idx_ai_tools_tenant_risk (tenant_id,risk_level,enabled),
        CONSTRAINT fk_ai_tools_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agent_tools (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        agent_version_id BIGINT NOT NULL,
        tool_id BIGINT NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        config_json LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ai_agent_tool (agent_version_id,tool_id),
        INDEX idx_ai_agent_tools_tenant (tenant_id),
        CONSTRAINT fk_ai_agent_tools_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_agent_tools_version FOREIGN KEY (agent_version_id) REFERENCES ai_agent_versions(id),
        CONSTRAINT fk_ai_agent_tools_tool FOREIGN KEY (tool_id) REFERENCES ai_tools(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_behavior_profiles (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        profile_key VARCHAR(100) NOT NULL,
        name VARCHAR(191) NOT NULL,
        language VARCHAR(20) NOT NULL,
        style_json LONGTEXT NOT NULL,
        voice_rules_json LONGTEXT NOT NULL,
        transfer_rules_json LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_behavior_profile (tenant_id,profile_key),
        CONSTRAINT fk_ai_behavior_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        trace_id VARCHAR(64) NOT NULL,
        actor_type ENUM('user','system','service') NOT NULL,
        actor_id VARCHAR(191) NULL,
        event_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100) NULL,
        decision VARCHAR(64) NOT NULL,
        details_json LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_audit_tenant_time (tenant_id,created_at),
        INDEX idx_ai_audit_trace (trace_id),
        INDEX idx_ai_audit_entity (tenant_id,entity_type,entity_id),
        CONSTRAINT fk_ai_audit_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO settings (setting_key,setting_value,value_type,category,is_secret,description)
       VALUES ('ai.platform_core_enabled','false','boolean','ai_platform',0,'Enable PBXPuls AI Platform Core APIs')`,
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('view_ai_platform','View AI Platform','View AI Platform status and agents','ai_platform'),
        ('manage_ai_agents','Manage AI agents','Create and version AI agents','ai_platform'),
        ('manage_ai_providers','Manage AI providers','Manage AI provider configuration','ai_platform'),
        ('view_ai_tools','View AI tools','View registered AI tools','ai_platform'),
        ('manage_ai_tools','Manage AI tools','Manage AI tool definitions','ai_platform'),
        ('view_ai_audit','View AI audit','View tenant-scoped AI audit log','ai_platform'),
        ('execute_ai_read_tools','Execute AI read tools','Execute allowed read-only AI tools','ai_platform'),
        ('approve_ai_actions','Approve AI actions','Approve guarded AI actions','ai_platform'),
        ('manage_ai_platform','Manage AI Platform','Manage AI Platform foundation','ai_platform')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN
       ('view_ai_platform','manage_ai_agents','manage_ai_providers','view_ai_tools','manage_ai_tools','view_ai_audit','execute_ai_read_tools','approve_ai_actions','manage_ai_platform')
       WHERE r.role_key IN ('su','admin')`
    ],
    seed: seedAiPlatformCoreFoundation
  },
  {
    key: '20260722_027_ai_agent_builder_behavior_foundation',
    description: 'Add AI Agent Builder and Human Behavior Engine foundation',
    statements: [
      `ALTER TABLE ai_behavior_profiles
        ADD COLUMN response_style_json LONGTEXT NULL,
        ADD COLUMN emotion_model_json LONGTEXT NULL,
        ADD COLUMN voice_behavior_json LONGTEXT NULL,
        ADD COLUMN conversation_rules_json LONGTEXT NULL,
        ADD COLUMN transfer_policy_json LONGTEXT NULL,
        ADD COLUMN safety_policy_json LONGTEXT NULL`,
      `CREATE TABLE IF NOT EXISTS ai_agent_templates (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NULL, template_key VARCHAR(100) NOT NULL,
        name VARCHAR(191) NOT NULL, description VARCHAR(500) NOT NULL, agent_type VARCHAR(100) NOT NULL,
        industry VARCHAR(100) NULL, default_prompt LONGTEXT NOT NULL, default_behavior_profile_id BIGINT NULL,
        default_tools_json LONGTEXT NOT NULL, default_permissions_json LONGTEXT NOT NULL,
        status ENUM('active','disabled','archived') NOT NULL DEFAULT 'active', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_agent_template (tenant_id,template_key), INDEX idx_ai_templates_tenant_status (tenant_id,status),
        CONSTRAINT fk_ai_templates_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_templates_behavior FOREIGN KEY (default_behavior_profile_id) REFERENCES ai_behavior_profiles(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agent_prompt_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_version_id BIGINT NOT NULL,
        version_number INT NOT NULL, prompt_text LONGTEXT NOT NULL, change_reason VARCHAR(500) NULL, checksum CHAR(64) NOT NULL,
        created_by VARCHAR(191) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ai_prompt_version (agent_version_id,version_number), INDEX idx_ai_prompt_tenant (tenant_id),
        CONSTRAINT fk_ai_prompt_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_prompt_agent_version FOREIGN KEY (agent_version_id) REFERENCES ai_agent_versions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_transfer_policies (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NULL, policy_key VARCHAR(100) NOT NULL, name VARCHAR(191) NOT NULL,
        rules_json LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ai_transfer_policy (tenant_id,policy_key), CONSTRAINT fk_ai_transfer_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_autonomy_policies (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NULL, policy_key VARCHAR(100) NOT NULL,
        level ENUM('SAFE','ASSISTED','AUTONOMOUS') NOT NULL, rules_json LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ai_autonomy_policy (tenant_id,policy_key), CONSTRAINT fk_ai_autonomy_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agent_test_sessions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id BIGINT NOT NULL, agent_version_id BIGINT NOT NULL,
        started_by VARCHAR(191) NULL, status ENUM('created','completed','failed','cancelled') NOT NULL DEFAULT 'created',
        transcript_json LONGTEXT NOT NULL, result_json LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_test_sessions_tenant_time (tenant_id,created_at),
        CONSTRAINT fk_ai_test_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_test_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id),
        CONSTRAINT fk_ai_test_version FOREIGN KEY (agent_version_id) REFERENCES ai_agent_versions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('create_ai_agents','Create AI agents','Create draft AI agents from templates','ai_platform'),
        ('clone_ai_agents','Clone AI agents','Clone tenant AI agent configurations','ai_platform'),
        ('publish_ai_agents','Publish AI agents','Publish validated immutable AI agent versions','ai_platform'),
        ('manage_ai_templates','Manage AI templates','Manage tenant AI agent templates','ai_platform'),
        ('manage_ai_behavior_profiles','Manage AI behavior profiles','Manage tenant behavior profiles','ai_platform'),
        ('manage_ai_policies','Manage AI policies','Manage transfer and autonomy policies','ai_platform'),
        ('run_ai_test_sessions','Run AI test sessions','Create non-runtime AI playground sessions','ai_platform')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN
       ('create_ai_agents','clone_ai_agents','publish_ai_agents','manage_ai_templates','manage_ai_behavior_profiles','manage_ai_policies','run_ai_test_sessions')
       WHERE r.role_key IN ('su','admin')`
    ],
    seed: seedAiAgentBuilderFoundation
  },
  {
    key: '20260722_028_ai_knowledge_training_foundation',
    description: 'Add tenant-scoped AI Knowledge and Training Engine foundations',
    statements: [
      `CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id BIGINT NULL,
        source_key VARCHAR(100) NOT NULL, name VARCHAR(191) NOT NULL,
        type ENUM('document','text','faq','url','manual') NOT NULL, description VARCHAR(1000) NULL,
        status ENUM('draft','processing','ready','published','archived') NOT NULL DEFAULT 'draft', metadata_json LONGTEXT NOT NULL,
        created_by VARCHAR(191) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL,
        UNIQUE KEY uniq_ai_knowledge_source (tenant_id,source_key), INDEX idx_ai_knowledge_tenant_agent_status (tenant_id,agent_id,status),
        CONSTRAINT fk_ai_knowledge_source_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_knowledge_source_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_knowledge_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, source_id BIGINT NOT NULL, version_number INT NOT NULL,
        content LONGTEXT NOT NULL, checksum CHAR(64) NOT NULL, status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
        created_by VARCHAR(191) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, published_at DATETIME NULL,
        UNIQUE KEY uniq_ai_knowledge_version (source_id,version_number), INDEX idx_ai_knowledge_versions_tenant_status (tenant_id,status),
        CONSTRAINT fk_ai_knowledge_version_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_knowledge_version_source FOREIGN KEY (source_id) REFERENCES ai_knowledge_sources(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, source_id BIGINT NOT NULL, version_id BIGINT NOT NULL,
        filename VARCHAR(255) NOT NULL, mime_type VARCHAR(191) NOT NULL, storage_path VARCHAR(1000) NULL, content_text LONGTEXT NOT NULL,
        metadata_json LONGTEXT NOT NULL, status ENUM('draft','ready','archived') NOT NULL DEFAULT 'draft', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_knowledge_documents_version (tenant_id,version_id),
        CONSTRAINT fk_ai_knowledge_document_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_knowledge_document_source FOREIGN KEY (source_id) REFERENCES ai_knowledge_sources(id),
        CONSTRAINT fk_ai_knowledge_document_version FOREIGN KEY (version_id) REFERENCES ai_knowledge_versions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, document_id BIGINT NOT NULL, chunk_index INT NOT NULL,
        content LONGTEXT NOT NULL, metadata_json LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ai_knowledge_chunk (document_id,chunk_index), INDEX idx_ai_knowledge_chunks_tenant (tenant_id),
        CONSTRAINT fk_ai_knowledge_chunk_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_knowledge_chunk_document FOREIGN KEY (document_id) REFERENCES ai_knowledge_documents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agent_knowledge (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id BIGINT NOT NULL, knowledge_source_id BIGINT NOT NULL,
        access_mode ENUM('read','disabled') NOT NULL DEFAULT 'disabled', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ai_agent_knowledge (agent_id,knowledge_source_id), INDEX idx_ai_agent_knowledge_tenant_access (tenant_id,access_mode),
        CONSTRAINT fk_ai_agent_knowledge_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_agent_knowledge_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id),
        CONSTRAINT fk_ai_agent_knowledge_source FOREIGN KEY (knowledge_source_id) REFERENCES ai_knowledge_sources(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_training_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id BIGINT NOT NULL,
        type ENUM('instruction','example','correction','faq_answer','conversation_example') NOT NULL,
        title VARCHAR(191) NOT NULL, input_text LONGTEXT NOT NULL, expected_output LONGTEXT NOT NULL, rule_json LONGTEXT NOT NULL,
        status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft', created_by VARCHAR(191) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_training_items_tenant_agent_status (tenant_id,agent_id,status),
        CONSTRAINT fk_ai_training_item_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_training_item_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_training_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id BIGINT NOT NULL, version_number INT NOT NULL,
        training_snapshot_json LONGTEXT NOT NULL, checksum CHAR(64) NOT NULL, status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, published_at DATETIME NULL,
        UNIQUE KEY uniq_ai_training_version (agent_id,version_number), INDEX idx_ai_training_versions_tenant_status (tenant_id,status),
        CONSTRAINT fk_ai_training_version_tenant FOREIGN KEY (tenant_id) REFERENCES ai_tenants(id),
        CONSTRAINT fk_ai_training_version_agent FOREIGN KEY (agent_id) REFERENCES ai_agents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO permissions (permission_key,name,description,category) VALUES
        ('manage_ai_knowledge','Manage AI knowledge','Create and version tenant AI knowledge','ai_platform'),
        ('view_ai_knowledge','View AI knowledge','View tenant AI knowledge references','ai_platform'),
        ('publish_ai_knowledge','Publish AI knowledge','Publish immutable AI knowledge versions','ai_platform'),
        ('manage_ai_training','Manage AI training','Create AI training items and snapshots','ai_platform'),
        ('view_ai_training','View AI training','View tenant AI training items','ai_platform'),
        ('publish_ai_training','Publish AI training','Publish immutable AI training snapshots','ai_platform'),
        ('view_ai_context_preview','View AI context preview','View safe AI agent context structure','ai_platform')`,
      `INSERT IGNORE INTO role_permissions (role_id,permission_id)
       SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN
       ('manage_ai_knowledge','view_ai_knowledge','publish_ai_knowledge','manage_ai_training','view_ai_training','publish_ai_training','view_ai_context_preview')
       WHERE r.role_key IN ('su','admin')`
    ],
    seed: seedAiKnowledgeTrainingFoundation
  },
  {
    key:'20260722_029_ai_receptionist_sandbox_runtime',description:'Add universal AI sandbox conversations',statements:[
      `CREATE TABLE IF NOT EXISTS ai_conversations (id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,channel ENUM('sandbox') NOT NULL,status ENUM('active','completed','failed','cancelled') NOT NULL,language VARCHAR(20) NOT NULL,started_by VARCHAR(191) NULL,started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,ended_at DATETIME NULL,summary LONGTEXT NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_conversations_tenant_status(tenant_id,status),FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),FOREIGN KEY(agent_id) REFERENCES ai_agents(id),FOREIGN KEY(agent_version_id) REFERENCES ai_agent_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_conversation_messages (id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,conversation_id BIGINT NOT NULL,sequence_no INT NOT NULL,role ENUM('system','user','assistant','tool') NOT NULL,content TEXT NOT NULL,content_json LONGTEXT NOT NULL,provider_message_id VARCHAR(191) NULL,token_json LONGTEXT NULL,latency_ms INT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uniq_ai_conv_message(conversation_id,sequence_no),INDEX idx_ai_conv_messages_tenant(tenant_id),FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id),CHECK(CHAR_LENGTH(content)<=8000)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `ALTER TABLE ai_agent_test_sessions ADD COLUMN conversation_id BIGINT NULL,ADD CONSTRAINT fk_ai_test_conversation FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id)`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category) VALUES('execute_ai_sandbox','Execute AI sandbox','Run text-only AI agent sandbox','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key='execute_ai_sandbox' WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['execute_ai_sandbox'])
  },
  {
    key:'20260722_030_ai_read_tool_runtime',description:'Add secure read-only AI tool execution history',statements:[
      `CREATE TABLE IF NOT EXISTS ai_tool_executions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,trace_id VARCHAR(64) NOT NULL,conversation_id BIGINT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,tool_id BIGINT NOT NULL,tool_key VARCHAR(100) NOT NULL,executor_key VARCHAR(191) NOT NULL,status ENUM('requested','denied','running','completed','failed','timed_out','cancelled') NOT NULL DEFAULT 'requested',risk_level ENUM('read','low_write','high_write','forbidden') NOT NULL,input_json LONGTEXT NOT NULL,input_hash CHAR(64) NOT NULL,output_json LONGTEXT NULL,error_code VARCHAR(100) NULL,duration_ms INT NULL,actor_id VARCHAR(191) NULL,idempotency_key VARCHAR(128) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at DATETIME NULL,INDEX idx_ai_tool_exec_tenant_time(tenant_id,created_at),INDEX idx_ai_tool_exec_tenant_status(tenant_id,status,created_at),INDEX idx_ai_tool_exec_conversation(conversation_id),INDEX idx_ai_tool_exec_trace(trace_id),UNIQUE KEY uniq_ai_tool_idempotency(tenant_id,idempotency_key),CONSTRAINT fk_ai_tool_exec_tenant FOREIGN KEY(tenant_id)REFERENCES ai_tenants(id),CONSTRAINT fk_ai_tool_exec_conversation FOREIGN KEY(conversation_id)REFERENCES ai_conversations(id),CONSTRAINT fk_ai_tool_exec_agent FOREIGN KEY(agent_id)REFERENCES ai_agents(id),CONSTRAINT fk_ai_tool_exec_version FOREIGN KEY(agent_version_id)REFERENCES ai_agent_versions(id),CONSTRAINT fk_ai_tool_exec_tool FOREIGN KEY(tool_id)REFERENCES ai_tools(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.write_tools_enabled','false','boolean','ai_platform',0,'Globally disable AI write tools')`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_tool_executions','View AI tool executions','View redacted tool execution history','ai_platform'),('test_ai_tools','Test AI tools','Test assigned read-only tools','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_tool_executions','test_ai_tools')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_tool_executions','test_ai_tools'])
  },
  {
    key:'20260722_031_ai_human_transfer_foundation',description:'Add deterministic AI human transfer request foundation',statements:[
      `CREATE TABLE IF NOT EXISTS ai_transfer_requests(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,trace_id VARCHAR(64) NOT NULL,conversation_id BIGINT NULL,voice_session_id BIGINT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,requested_by_type ENUM('user','system','service') NOT NULL,requested_by_id VARCHAR(191) NULL,trigger_type ENUM('explicit_human_request','policy_escalation','repeated_failure','urgent_request','admin_test') NOT NULL,trigger_text_hash CHAR(64) NULL,destination_type ENUM('extension','queue','ring_group','operator_role','fallback_number','voicemail','callback_request') NULL,destination_value_safe VARCHAR(191) NULL,destination_ref VARCHAR(191) NULL,status ENUM('requested','resolving','ready','executing','completed','failed','unavailable','cancelled','expired','dry_run_completed') NOT NULL DEFAULT 'requested',failure_code VARCHAR(100) NULL,fallback_action VARCHAR(100) NULL,pbx_action_ref VARCHAR(191) NULL,requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,started_at DATETIME NULL,completed_at DATETIME NULL,failed_at DATETIME NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_transfer_tenant_time(tenant_id,requested_at),INDEX idx_ai_transfer_tenant_status(tenant_id,status,requested_at),INDEX idx_ai_transfer_conversation(conversation_id),INDEX idx_ai_transfer_trace(trace_id),INDEX idx_ai_transfer_live(tenant_id,voice_session_id,agent_id,status),CONSTRAINT fk_ai_transfer_request_tenant FOREIGN KEY(tenant_id)REFERENCES ai_tenants(id),CONSTRAINT fk_ai_transfer_request_conversation FOREIGN KEY(conversation_id)REFERENCES ai_conversations(id),CONSTRAINT fk_ai_transfer_request_agent FOREIGN KEY(agent_id)REFERENCES ai_agents(id),CONSTRAINT fk_ai_transfer_request_version FOREIGN KEY(agent_version_id)REFERENCES ai_agent_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_transfer_requests','View AI transfer requests','View safe human transfer request history','ai_platform'),('manage_ai_transfer_policies','Manage AI transfer policies','Manage deterministic human transfer policies','ai_platform'),('test_ai_human_transfer','Test AI human transfer','Run explicitly confirmed controlled transfer tests','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_transfer_requests','manage_ai_transfer_policies','test_ai_human_transfer')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_transfer_requests','manage_ai_transfer_policies','test_ai_human_transfer'])
  },
  {
    key:'20260722_032_ai_callback_business_action',description:'Add low-risk AI callback business action foundation',statements:[
      `CREATE TABLE IF NOT EXISTS ai_action_definitions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NULL,action_key VARCHAR(100) NOT NULL,version INT NOT NULL,name VARCHAR(191) NOT NULL,description TEXT NOT NULL,risk_level ENUM('low','medium','high','forbidden') NOT NULL,input_schema_json LONGTEXT NOT NULL,output_schema_json LONGTEXT NOT NULL,executor_key VARCHAR(100) NOT NULL,default_approval_mode VARCHAR(64) NOT NULL,allowed_autonomy_json LONGTEXT NOT NULL,idempotent TINYINT(1) NOT NULL DEFAULT 1,timeout_ms INT NOT NULL DEFAULT 5000,enabled TINYINT(1) NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NULL,UNIQUE KEY uniq_ai_action_definition(tenant_id,action_key,version),INDEX idx_ai_action_def_key(action_key,version),CONSTRAINT fk_ai_action_def_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_actions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,trace_id VARCHAR(64) NOT NULL,conversation_id BIGINT NULL,voice_session_id BIGINT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,action_key VARCHAR(100) NOT NULL,action_version INT NOT NULL,status ENUM('requested','awaiting_confirmation','approved','denied','running','completed','failed','timed_out','cancelled','expired') NOT NULL DEFAULT 'requested',risk_level ENUM('low','medium','high','forbidden') NOT NULL,autonomy_decision VARCHAR(64) NOT NULL,approval_mode VARCHAR(64) NOT NULL,requested_by_type ENUM('user','system','service') NOT NULL,requested_by_id VARCHAR(191) NULL,input_json LONGTEXT NOT NULL,output_json LONGTEXT NULL,safe_summary VARCHAR(500) NULL,error_code VARCHAR(100) NULL,idempotency_key VARCHAR(128) NULL,input_hash CHAR(64) NOT NULL,requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,approved_at DATETIME NULL,started_at DATETIME NULL,completed_at DATETIME NULL,failed_at DATETIME NULL,expires_at DATETIME NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_actions_tenant_time(tenant_id,requested_at),INDEX idx_ai_actions_tenant_status(tenant_id,status,requested_at),INDEX idx_ai_actions_conversation(conversation_id),INDEX idx_ai_actions_idempotency(tenant_id,idempotency_key),INDEX idx_ai_actions_trace(trace_id),CONSTRAINT fk_ai_actions_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_actions_conversation FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id),CONSTRAINT fk_ai_actions_agent FOREIGN KEY(agent_id) REFERENCES ai_agents(id),CONSTRAINT fk_ai_actions_version FOREIGN KEY(agent_version_id) REFERENCES ai_agent_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_agent_actions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,action_definition_id BIGINT NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 1,config_json LONGTEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uniq_ai_agent_action(agent_version_id,action_definition_id),INDEX idx_ai_agent_actions_tenant(tenant_id,agent_version_id),CONSTRAINT fk_ai_agent_actions_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_agent_actions_version FOREIGN KEY(agent_version_id) REFERENCES ai_agent_versions(id),CONSTRAINT fk_ai_agent_actions_definition FOREIGN KEY(action_definition_id) REFERENCES ai_action_definitions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_callback_requests(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,conversation_id BIGINT NULL,voice_session_id BIGINT NULL,transfer_request_id BIGINT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,contact_name VARCHAR(191) NULL,phone_encrypted LONGTEXT NULL,phone_key_version VARCHAR(32) NULL,phone_hash CHAR(64) NOT NULL,phone_masked VARCHAR(32) NOT NULL,preferred_time_text VARCHAR(191) NULL,preferred_time_from DATETIME NULL,preferred_time_to DATETIME NULL,timezone VARCHAR(64) NULL,reason TEXT NOT NULL,status ENUM('new','acknowledged','assigned','in_progress','completed','cancelled','invalid') NOT NULL DEFAULT 'new',priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal',assigned_user_id BIGINT NULL,assigned_extension VARCHAR(32) NULL,source_channel VARCHAR(32) NOT NULL,consent_status ENUM('unknown','requested','granted','denied') NOT NULL,created_by_action_id BIGINT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,acknowledged_at DATETIME NULL,completed_at DATETIME NULL,cancelled_at DATETIME NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_callback_tenant_status(tenant_id,status,created_at),INDEX idx_ai_callback_conversation(conversation_id),INDEX idx_ai_callback_phone(tenant_id,phone_hash,status),CONSTRAINT fk_ai_callback_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_callback_conversation FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id),CONSTRAINT fk_ai_callback_transfer FOREIGN KEY(transfer_request_id) REFERENCES ai_transfer_requests(id),CONSTRAINT fk_ai_callback_agent FOREIGN KEY(agent_id) REFERENCES ai_agents(id),CONSTRAINT fk_ai_callback_version FOREIGN KEY(agent_version_id) REFERENCES ai_agent_versions(id),CONSTRAINT fk_ai_callback_action FOREIGN KEY(created_by_action_id) REFERENCES ai_actions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT INTO ai_action_definitions(tenant_id,action_key,version,name,description,risk_level,input_schema_json,output_schema_json,executor_key,default_approval_mode,allowed_autonomy_json,idempotent,timeout_ms,enabled) SELECT NULL,'business.create_callback_request',1,'Create callback request','Create a customer-consented callback request','low','{"type":"object"}','{"type":"object"}','create_callback_request','customer_consent','["SAFE","ASSISTED","AUTONOMOUS"]',1,5000,1 FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM ai_action_definitions WHERE tenant_id IS NULL AND action_key='business.create_callback_request' AND version=1)`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_actions','View AI actions','View safe business action history','ai_platform'),('manage_ai_actions','Manage AI actions','Manage AI business action lifecycle','ai_platform'),('execute_ai_low_risk_actions','Execute low-risk AI actions','Execute assigned low-risk AI business actions','ai_platform'),('view_ai_callback_requests','View callback requests','View masked AI callback requests','ai_platform'),('manage_ai_callback_requests','Manage callback requests','Acknowledge, complete and cancel callback requests','ai_platform'),('assign_ai_actions','Assign AI actions','Assign low-risk business actions to draft agent versions','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_actions','manage_ai_actions','execute_ai_low_risk_actions','view_ai_callback_requests','manage_ai_callback_requests','assign_ai_actions')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_actions','manage_ai_actions','execute_ai_low_risk_actions','view_ai_callback_requests','manage_ai_callback_requests','assign_ai_actions'])
  },
  {
    key:'20260722_033_ai_action_idempotency',description:'Enforce tenant-scoped AI business action idempotency',statements:[
      `ALTER TABLE ai_actions ADD UNIQUE KEY uniq_ai_actions_idempotency(tenant_id,idempotency_key)`
    ]
  },
  {
    key:'20260722_034_ai_voice_control_plane',description:'Add disabled-by-default AI voice gateway control plane',statements:[
      `ALTER TABLE ai_conversations MODIFY channel ENUM('sandbox','voice') NOT NULL`,
      `CREATE TABLE IF NOT EXISTS ai_voice_route_bindings(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,binding_key VARCHAR(100) NOT NULL,name VARCHAR(191) NOT NULL,status ENUM('active','disabled') NOT NULL DEFAULT 'disabled',match_type ENUM('did','extension','queue_entry','test_context') NOT NULL,match_value_hash CHAR(64) NULL,safe_match_label VARCHAR(191) NOT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,language VARCHAR(20) NOT NULL DEFAULT 'ru',priority INT NOT NULL DEFAULT 0,dry_run_only TINYINT(1) NOT NULL DEFAULT 1,created_by VARCHAR(191) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NULL,UNIQUE KEY uniq_ai_voice_binding(tenant_id,binding_key),INDEX idx_ai_voice_binding_match(tenant_id,status,match_type,match_value_hash,priority),CONSTRAINT fk_ai_voice_binding_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_voice_binding_agent FOREIGN KEY(agent_id) REFERENCES ai_agents(id),CONSTRAINT fk_ai_voice_binding_version FOREIGN KEY(agent_version_id) REFERENCES ai_agent_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_voice_sessions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,trace_id VARCHAR(64) NOT NULL,conversation_id BIGINT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,route_binding_id BIGINT NULL,external_call_id_hash CHAR(64) NOT NULL,ari_channel_id_encrypted LONGTEXT NULL,ari_channel_id_hash CHAR(64) NOT NULL,ari_bridge_id_encrypted LONGTEXT NULL,ari_bridge_id_hash CHAR(64) NULL,ari_key_version VARCHAR(32) NULL,direction ENUM('inbound','outbound','internal','unknown') NOT NULL,state ENUM('created','entering_stasis','active','waiting_for_media','transferring','callback_offered','ending','completed','failed','cancelled') NOT NULL,language VARCHAR(20) NOT NULL,caller_hash CHAR(64) NULL,caller_masked VARCHAR(32) NULL,called_hash CHAR(64) NULL,called_masked VARCHAR(32) NULL,codec VARCHAR(64) NULL,sample_rate INT NULL,transfer_state VARCHAR(64) NULL,media_state ENUM('not_configured','pending','connected','disconnected','failed') NOT NULL DEFAULT 'not_configured',provider_state ENUM('not_configured','pending','connected','disconnected','failed') NOT NULL DEFAULT 'not_configured',failure_code VARCHAR(100) NULL,started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,answered_at DATETIME NULL,ended_at DATETIME NULL,last_event_at DATETIME NOT NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_voice_session_tenant_state(tenant_id,state,last_event_at),INDEX idx_ai_voice_session_channel(tenant_id,ari_channel_id_hash,state),INDEX idx_ai_voice_session_conversation(conversation_id),INDEX idx_ai_voice_session_route(route_binding_id),CONSTRAINT fk_ai_voice_session_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_voice_session_conversation FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id),CONSTRAINT fk_ai_voice_session_agent FOREIGN KEY(agent_id) REFERENCES ai_agents(id),CONSTRAINT fk_ai_voice_session_version FOREIGN KEY(agent_version_id) REFERENCES ai_agent_versions(id),CONSTRAINT fk_ai_voice_session_binding FOREIGN KEY(route_binding_id) REFERENCES ai_voice_route_bindings(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_control_plane_enabled','false','boolean','ai_platform',0,'Enable passive AI Voice Gateway control plane')`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_voice_status','View AI voice status','View safe Voice Gateway status','ai_platform'),('view_ai_voice_sessions','View AI voice sessions','View safe trusted voice sessions','ai_platform'),('manage_ai_voice_bindings','Manage AI voice bindings','Manage dry-run-only voice route bindings','ai_platform'),('control_ai_voice_gateway','Control AI voice gateway','Explicitly start or stop passive ARI observer','ai_platform'),('test_ai_voice_gateway','Test AI voice gateway','Run synthetic voice control-plane tests','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_voice_status','view_ai_voice_sessions','manage_ai_voice_bindings','control_ai_voice_gateway','test_ai_voice_gateway')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_voice_status','view_ai_voice_sessions','manage_ai_voice_bindings','control_ai_voice_gateway','test_ai_voice_gateway'])
  },
  {
    key:'20260722_035_ai_voice_media_transport',description:'Add disabled-by-default synthetic AI voice media foundation',statements:[
      `CREATE TABLE IF NOT EXISTS ai_voice_media_sessions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,voice_session_id BIGINT NOT NULL,transport_mode ENUM('synthetic','external_media','audiosocket') NOT NULL,state ENUM('created','negotiating','ready','streaming','paused','draining','completed','failed','cancelled') NOT NULL,codec_in VARCHAR(32) NOT NULL,codec_out VARCHAR(32) NOT NULL,sample_rate_in INT NOT NULL,sample_rate_out INT NOT NULL,channels_in TINYINT UNSIGNED NOT NULL,channels_out TINYINT UNSIGNED NOT NULL,frame_duration_ms SMALLINT UNSIGNED NOT NULL,ingress_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,egress_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,ingress_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,egress_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,dropped_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,reordered_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,duplicate_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,jitter_ms_avg DECIMAL(10,3) NULL,jitter_ms_p95 DECIMAL(10,3) NULL,ingress_latency_ms_avg DECIMAL(10,3) NULL,egress_latency_ms_avg DECIMAL(10,3) NULL,first_audio_at DATETIME NULL,last_audio_at DATETIME NULL,started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,ended_at DATETIME NULL,failure_code VARCHAR(100) NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_voice_media_tenant_state(tenant_id,state,started_at),INDEX idx_ai_voice_media_voice_session(voice_session_id,state),CONSTRAINT fk_ai_voice_media_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_voice_media_voice_session FOREIGN KEY(voice_session_id) REFERENCES ai_voice_sessions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_media_transport_enabled','false','boolean','ai_platform',0,'Enable synthetic AI voice media transport tests'),('ai.voice_media_transport_mode','synthetic','string','ai_platform',0,'Selected AI voice media transport mode')`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_voice_media_status','View AI voice media status','View safe media transport status','ai_platform'),('view_ai_voice_media_sessions','View AI voice media sessions','View safe media session metrics','ai_platform'),('test_ai_voice_media','Test AI voice media','Run synthetic media tests without Asterisk','ai_platform'),('manage_ai_voice_media','Manage AI voice media','Manage disabled-by-default media settings','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_voice_media_status','view_ai_voice_media_sessions','test_ai_voice_media','manage_ai_voice_media')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_voice_media_status','view_ai_voice_media_sessions','test_ai_voice_media','manage_ai_voice_media'])
  },
  {
    key:'20260722_036_ai_realtime_voice_provider',description:'Add disabled-by-default realtime voice provider foundation',statements:[
      `CREATE TABLE IF NOT EXISTS ai_realtime_voice_sessions(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,voice_session_id BIGINT NOT NULL,media_session_id BIGINT NOT NULL,provider_key VARCHAR(100) NOT NULL,provider_session_id_hash CHAR(64) NULL,state ENUM('created','connecting','connected','configured','listening','responding','interrupted','closing','completed','failed','cancelled') NOT NULL,input_codec VARCHAR(32) NOT NULL,output_codec VARCHAR(32) NOT NULL,input_sample_rate INT NOT NULL,output_sample_rate INT NOT NULL,language VARCHAR(20) NOT NULL,voice_key_safe VARCHAR(100) NULL,server_vad_enabled TINYINT(1) NOT NULL DEFAULT 0,tools_enabled TINYINT(1) NOT NULL DEFAULT 0,connected_at DATETIME NULL,first_input_audio_at DATETIME NULL,first_output_audio_at DATETIME NULL,ended_at DATETIME NULL,input_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,output_frames BIGINT UNSIGNED NOT NULL DEFAULT 0,input_audio_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,output_audio_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,first_response_latency_ms INT UNSIGNED NULL,interruption_count INT UNSIGNED NOT NULL DEFAULT 0,tool_call_count INT UNSIGNED NOT NULL DEFAULT 0,failure_code VARCHAR(100) NULL,metadata_json LONGTEXT NOT NULL,INDEX idx_ai_realtime_tenant_state(tenant_id,state,id),INDEX idx_ai_realtime_voice_session(voice_session_id,state),INDEX idx_ai_realtime_media_session(media_session_id,state),CONSTRAINT fk_ai_realtime_tenant FOREIGN KEY(tenant_id) REFERENCES ai_tenants(id),CONSTRAINT fk_ai_realtime_voice_session FOREIGN KEY(voice_session_id) REFERENCES ai_voice_sessions(id),CONSTRAINT fk_ai_realtime_media_session FOREIGN KEY(media_session_id) REFERENCES ai_voice_media_sessions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.realtime_voice_enabled','false','boolean','ai_platform',0,'Enable synthetic realtime voice provider tests'),('ai.realtime_voice_provider','synthetic','string','ai_platform',0,'Selected realtime voice provider')`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_realtime_voice_status','View AI realtime voice status','View safe realtime voice provider status','ai_platform'),('view_ai_realtime_voice_sessions','View AI realtime voice sessions','View safe realtime voice session metrics','ai_platform'),('test_ai_realtime_voice','Test AI realtime voice','Run synthetic realtime voice tests','ai_platform'),('manage_ai_realtime_voice','Manage AI realtime voice','Manage disabled-by-default realtime voice settings','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_realtime_voice_status','view_ai_realtime_voice_sessions','test_ai_realtime_voice','manage_ai_realtime_voice')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_realtime_voice_status','view_ai_realtime_voice_sessions','test_ai_realtime_voice','manage_ai_realtime_voice'])
  },
  {
    key:'20260722_037_ai_controlled_live_voice',description:'Add disabled controlled internal live voice test foundation',statements:[
      `ALTER TABLE ai_voice_route_bindings MODIFY match_type ENUM('did','extension','queue_entry','test_context','controlled_test_extension') NOT NULL`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_live_test_enabled','false','boolean','ai_platform',0,'Enable one controlled internal live voice test'),('ai.voice_live_transport','audiosocket','string','ai_platform',0,'Controlled live voice transport'),('ai.voice_live_test_extension','','string','ai_platform',0,'Dedicated internal extension for controlled live voice test')`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_voice_live_test','View AI live voice test','View safe controlled live voice readiness','ai_platform'),('configure_ai_voice_live_test','Configure AI live voice test','Validate controlled live test configuration and preview dialplan','ai_platform'),('enable_ai_voice_live_test','Enable AI live voice test','Explicitly enable or disable controlled live voice test','ai_platform'),('execute_ai_voice_live_test_checks','Execute AI live voice checks','Run read-only controlled live voice readiness checks','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_voice_live_test','configure_ai_voice_live_test','enable_ai_voice_live_test','execute_ai_voice_live_test_checks')WHERE r.role_key IN('su','admin')`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_voice_live_test','configure_ai_voice_live_test','enable_ai_voice_live_test','execute_ai_voice_live_test_checks'])
  },
  {
    key:'20260722_038_ai_voice_agent_route_management',description:'Add production-safe voice agent routes and realtime transcripts',statements:[
      `ALTER TABLE ai_voice_route_bindings MODIFY match_type ENUM('did','extension','inbound_route','queue_entry','queue_overflow','after_hours','test_context','controlled_test_extension') NOT NULL`,
      `ALTER TABLE ai_voice_route_bindings ADD COLUMN route_mode ENUM('test','production') NOT NULL DEFAULT 'test',ADD COLUMN provider_key VARCHAR(100) NOT NULL DEFAULT 'openai_realtime',ADD COLUMN voice_key VARCHAR(100) NULL,ADD COLUMN allowed_callers_json LONGTEXT NULL,ADD COLUMN fallback_type ENUM('extension','queue','ring_group','receptionist','terminate_call') NULL,ADD COLUMN fallback_value_safe VARCHAR(191) NULL,ADD COLUMN fallback_value_hash CHAR(64) NULL,ADD COLUMN maximum_concurrent_calls INT UNSIGNED NOT NULL DEFAULT 1,ADD COLUMN effective_schedule_json LONGTEXT NULL,ADD COLUMN recording_enabled TINYINT(1) NOT NULL DEFAULT 1,ADD COLUMN expires_at DATETIME NULL,ADD COLUMN activation_state ENUM('draft','previewed','active','disabled','expired','conflict') NOT NULL DEFAULT 'draft',ADD COLUMN last_error_code VARCHAR(100) NULL`,
      `ALTER TABLE ai_voice_sessions ADD COLUMN recording_ref_safe VARCHAR(255) NULL`,
      `CREATE TABLE IF NOT EXISTS ai_voice_transcript_utterances(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,voice_session_id BIGINT NOT NULL,media_session_id BIGINT NULL,realtime_session_id BIGINT NULL,binding_id BIGINT NULL,agent_id BIGINT NOT NULL,agent_version_id BIGINT NOT NULL,speaker ENUM('caller','ai','human_agent','system') NOT NULL,sequence_no INT UNSIGNED NOT NULL,started_at DATETIME NOT NULL,ended_at DATETIME NULL,text_safe TEXT NULL,generated_text_safe TEXT NULL,spoken_text_safe TEXT NULL,is_final TINYINT(1) NOT NULL DEFAULT 0,interrupted TINYINT(1) NOT NULL DEFAULT 0,incomplete TINYINT(1) NOT NULL DEFAULT 0,confidence DECIMAL(8,6) NULL,provider_event_ref CHAR(16) NULL,marker_type VARCHAR(64) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NULL,UNIQUE KEY uniq_ai_voice_utterance(tenant_id,realtime_session_id,speaker,sequence_no),INDEX idx_ai_voice_transcript_session(tenant_id,voice_session_id,sequence_no),INDEX idx_ai_voice_transcript_retention(tenant_id,created_at),CONSTRAINT fk_ai_voice_transcript_tenant FOREIGN KEY(tenant_id)REFERENCES ai_tenants(id),CONSTRAINT fk_ai_voice_transcript_voice FOREIGN KEY(voice_session_id)REFERENCES ai_voice_sessions(id),CONSTRAINT fk_ai_voice_transcript_media FOREIGN KEY(media_session_id)REFERENCES ai_voice_media_sessions(id),CONSTRAINT fk_ai_voice_transcript_realtime FOREIGN KEY(realtime_session_id)REFERENCES ai_realtime_voice_sessions(id),CONSTRAINT fk_ai_voice_transcript_binding FOREIGN KEY(binding_id)REFERENCES ai_voice_route_bindings(id),CONSTRAINT fk_ai_voice_transcript_agent FOREIGN KEY(agent_id)REFERENCES ai_agents(id),CONSTRAINT fk_ai_voice_transcript_version FOREIGN KEY(agent_version_id)REFERENCES ai_agent_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS ai_voice_call_insights(id BIGINT AUTO_INCREMENT PRIMARY KEY,tenant_id BIGINT NOT NULL,voice_session_id BIGINT NOT NULL,summary_safe TEXT NULL,topic_safe VARCHAR(255) NULL,outcome_safe VARCHAR(255) NULL,customer_request_safe TEXT NULL,promised_actions_safe TEXT NULL,next_action_safe TEXT NULL,transferred TINYINT(1) NOT NULL DEFAULT 0,callback_requested TINYINT(1) NOT NULL DEFAULT 0,callback_confirmed TINYINT(1) NOT NULL DEFAULT 0,unresolved_issue TINYINT(1) NOT NULL DEFAULT 0,sentiment_safe VARCHAR(32) NULL,analysis_status ENUM('disabled','pending','completed','failed') NOT NULL DEFAULT 'disabled',failure_code VARCHAR(100) NULL,usage_json LONGTEXT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NULL,UNIQUE KEY uniq_ai_voice_insight(tenant_id,voice_session_id),CONSTRAINT fk_ai_voice_insight_tenant FOREIGN KEY(tenant_id)REFERENCES ai_tenants(id),CONSTRAINT fk_ai_voice_insight_voice FOREIGN KEY(voice_session_id)REFERENCES ai_voice_sessions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_gateway_auto_start','true','boolean','ai_platform',0,'Automatically restore Voice Gateway when voice flags are enabled'),('ai.voice_transcripts_save','true','boolean','ai_platform',0,'Store safe Realtime transcripts'),('ai.voice_transcripts_retention_days','30','number','ai_platform',0,'Realtime transcript retention in days; zero disables persistence'),('ai.voice_transcripts_live','true','boolean','ai_platform',0,'Enable live transcript SSE'),('ai.voice_transcripts_save_ai','true','boolean','ai_platform',0,'Store AI spoken transcripts'),('ai.voice_transcripts_save_partial','true','boolean','ai_platform',0,'Store incomplete partial transcripts'),('ai.voice_transcripts_post_call_summary','false','boolean','ai_platform',0,'Enable asynchronous post-call summary'),('ai.voice_transcripts_pii_redaction','true','boolean','ai_platform',0,'Redact transcript PII'),('ai.voice_transcripts_export','true','boolean','ai_platform',0,'Allow transcript export with permission'),('ai.voice_transcripts_store_generated','false','boolean','ai_platform',0,'Store generated text separately from spoken text')`,
      `INSERT IGNORE INTO permissions(permission_key,name,description,category)VALUES('view_ai_voice_agents','View AI voice agents','View voice agent routes and live diagnostics','ai_platform'),('manage_ai_voice_agents','Manage AI voice agents','Configure voice agent runtime properties','ai_platform'),('test_ai_voice_agents','Test AI voice agents','Create expiring controlled voice tests','ai_platform'),('manage_ai_voice_routes','Manage AI voice routes','Preview and explicitly activate voice routes','ai_platform'),('view_ai_voice_transcripts','View AI voice transcripts','View safe structured call transcripts','ai_platform'),('export_ai_voice_transcripts','Export AI voice transcripts','Export safe structured call transcripts','ai_platform')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_voice_agents','manage_ai_voice_agents','test_ai_voice_agents','manage_ai_voice_routes','view_ai_voice_transcripts','export_ai_voice_transcripts')WHERE r.role_key IN('su','admin')`,
      `INSERT IGNORE INTO role_permissions(role_id,permission_id)SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN('view_ai_voice_agents','test_ai_voice_agents','view_ai_voice_transcripts')WHERE r.role_key='manager'`
    ],seed:async()=>seedLegacyAiPlatformPermissions(['view_ai_voice_agents','manage_ai_voice_agents','test_ai_voice_agents','manage_ai_voice_routes','view_ai_voice_transcripts','export_ai_voice_transcripts'])
  },
  {
    key:'20260723_039_finalize_voice_call_history',description:'Finalize voice media limits, recordings, transcript aggregation and usage',statements:[
      `ALTER TABLE ai_voice_sessions ADD COLUMN completion_reason VARCHAR(64) NULL,ADD COLUMN recording_status ENUM('pending','available','unavailable','invalid') NOT NULL DEFAULT 'pending',ADD COLUMN recording_mime_type VARCHAR(64) NULL,ADD COLUMN recording_size_bytes BIGINT UNSIGNED NULL,ADD COLUMN recording_duration_ms BIGINT UNSIGNED NULL,ADD COLUMN cdr_billsec_seconds INT UNSIGNED NULL,ADD COLUMN cdr_duration_seconds INT UNSIGNED NULL,ADD COLUMN cdr_internal_ref CHAR(64) NULL`,
      `ALTER TABLE ai_voice_media_sessions ADD COLUMN max_call_duration_seconds INT UNSIGNED NULL,ADD COLUMN warning_threshold_seconds INT UNSIGNED NULL,ADD COLUMN completion_reason VARCHAR(64) NULL`,
      `ALTER TABLE ai_realtime_voice_sessions ADD COLUMN speech_end_to_first_audio_ms INT UNSIGNED NULL,ADD COLUMN commit_to_first_audio_ms INT UNSIGNED NULL,ADD COLUMN session_start_to_first_audio_ms INT UNSIGNED NULL`,
      `ALTER TABLE ai_voice_transcript_utterances ADD COLUMN provider_item_ref CHAR(16) NULL,ADD COLUMN provider_response_ref CHAR(16) NULL,ADD COLUMN current_partial_text_safe TEXT NULL,ADD COLUMN final_text_safe TEXT NULL,ADD COLUMN last_delta_at DATETIME NULL,ADD INDEX idx_ai_voice_transcript_item(tenant_id,realtime_session_id,speaker,provider_item_ref)`,
      `UPDATE ai_voice_transcript_utterances SET last_delta_at=COALESCE(ended_at,started_at),current_partial_text_safe=IF(is_final=0,text_safe,NULL),final_text_safe=IF(is_final=1,text_safe,NULL),ended_at=IF(is_final=0,COALESCE(updated_at,started_at),ended_at)`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_max_call_duration_seconds','1800','number','ai_platform',0,'Maximum voice call duration, clamped to 60..7200 seconds'),('ai.voice_duration_warning_seconds','60','number','ai_platform',0,'Warning lead time before graceful duration limit'),('ai.voice_pricing_snapshot_version','','string','ai_platform',0,'Versioned server-side voice pricing snapshot'),('ai.voice_pricing_currency','USD','string','ai_platform',0,'Voice pricing currency'),('ai.voice_pricing_rates_json','{}','json','ai_platform',0,'Versioned provider/model voice pricing rates per token')`
    ]
  },
  {
    key:'20260723_040_voice_continuity_barge_in',description:'Add adaptive voice playout and natural interruption settings',statements:[
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_playout_prebuffer_ms','80','number','ai_platform',0,'Initial adaptive voice playout buffer, clamped to 60..200 ms'),('ai.voice_vad_preroll_ms','240','number','ai_platform',0,'Bounded local VAD pre-roll for interruption detection')`
    ]
  },
  {
    key:'20260723_041_preserve_realtime_voice_playout',description:'Preserve response audio and align safe spoken transcripts',statements:[
      `ALTER TABLE ai_voice_transcript_utterances ADD COLUMN logical_key CHAR(64) NULL,ADD COLUMN content_index INT UNSIGNED NOT NULL DEFAULT 0,ADD COLUMN provider_audio_transcript_safe TEXT NULL,ADD COLUMN played_audio_ms BIGINT UNSIGNED NULL,ADD COLUMN generated_audio_ms BIGINT UNSIGNED NULL,ADD COLUMN transcript_accuracy ENUM('exact','approximate','unavailable') NOT NULL DEFAULT 'unavailable',ADD COLUMN interrupted_by_hangup TINYINT(1) NOT NULL DEFAULT 0,ADD UNIQUE KEY uniq_ai_voice_logical_utterance(tenant_id,realtime_session_id,logical_key)`,
      `INSERT IGNORE INTO settings(setting_key,setting_value,value_type,category,is_secret,description)VALUES('ai.voice_max_single_response_audio_seconds','60','number','ai_platform',0,'Maximum accepted audio per provider response, clamped to 5..180 seconds')`
    ]
  },
  {
    key:'20260723_042_voice_response_completion',description:'Track provider completion and controlled realtime retries',statements:[
      `ALTER TABLE ai_voice_transcript_utterances MODIFY transcript_accuracy ENUM('exact','approximate','unavailable','controlled_limit','provider_truncated') NOT NULL DEFAULT 'unavailable',ADD COLUMN provider_finish_reason VARCHAR(64) NULL,ADD COLUMN output_token_limit_hit TINYINT(1) NOT NULL DEFAULT 0,ADD COLUMN semantically_complete TINYINT(1) NULL,ADD COLUMN superseded_by_retry TINYINT(1) NOT NULL DEFAULT 0,ADD COLUMN retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0`
    ]
  }
];

async function seedAiKnowledgeTrainingFoundation(connection: Connection): Promise<void> {
  const [tenantRows]=await connection.query("SELECT id FROM ai_tenants WHERE tenant_key='installation' LIMIT 1");
  const tenantId=Number((tenantRows as any[])[0]?.id||0);if(!tenantId)throw new Error('AI installation tenant is required');
  await connection.execute(`INSERT INTO ai_knowledge_sources (tenant_id,agent_id,source_key,name,type,description,status,metadata_json,created_by)
    SELECT ?,NULL,'receptionist_basic_knowledge','Receptionist Basic Knowledge','manual','Системный пример структуры базовых знаний ресепшена','draft','{"systemTemplate":true}','system'
    FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ai_knowledge_sources WHERE tenant_id=? AND source_key='receptionist_basic_knowledge')`,[tenantId,tenantId]);
  const [sourceRows]=await connection.query("SELECT id FROM ai_knowledge_sources WHERE tenant_id=? AND source_key='receptionist_basic_knowledge' LIMIT 1",[tenantId]);
  const sourceId=Number((sourceRows as any[])[0]?.id||0),content='Базовый шаблон знаний AI Receptionist. Заполните актуальными данными компании перед публикацией.';
  const checksum=crypto.createHash('sha256').update(content).digest('hex');
  await connection.execute(`INSERT INTO ai_knowledge_versions (tenant_id,source_id,version_number,content,checksum,status,created_by)
    SELECT ?,?,1,?,?,'draft','system' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ai_knowledge_versions WHERE source_id=? AND version_number=1)`,[tenantId,sourceId,content,checksum,sourceId]);
  const [agentRows]=await connection.query("SELECT id FROM ai_agents WHERE tenant_id=? AND agent_key='receptionist_default' LIMIT 1",[tenantId]);
  const agentId=Number((agentRows as any[])[0]?.id||0);
  if(agentId)await connection.execute(`INSERT INTO ai_training_items (tenant_id,agent_id,type,title,input_text,expected_output,rule_json,status,created_by)
    SELECT ?,?,'instruction','human_transfer_priority_rule','Клиент просит соединить с человеком','Немедленно прекратить сценарий и инициировать передачу человеку','{"priority":"CRITICAL","execution":"future_voice_gateway"}','draft','system'
    FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ai_training_items WHERE tenant_id=? AND agent_id=? AND title='human_transfer_priority_rule')`,[tenantId,agentId,tenantId,agentId]);
  await seedLegacyAiPlatformPermissions(['manage_ai_knowledge','view_ai_knowledge','publish_ai_knowledge','manage_ai_training','view_ai_training','publish_ai_training','view_ai_context_preview']);
}

async function seedAiAgentBuilderFoundation(connection: Connection): Promise<void> {
  const [tenantRows] = await connection.query("SELECT id FROM ai_tenants WHERE tenant_key='installation' LIMIT 1");
  const tenantId=Number((tenantRows as any[])[0]?.id||0);if(!tenantId)throw new Error('AI installation tenant is required');
  await connection.execute(`UPDATE ai_behavior_profiles SET response_style_json=?,emotion_model_json=?,voice_behavior_json=?,conversation_rules_json=?,transfer_policy_json=?,safety_policy_json=? WHERE tenant_id=? AND profile_key='natural_receptionist_default'`,[
    JSON.stringify({responseStyle:'natural',verbosity:'short',professionalism:80,humorLevel:10}),JSON.stringify({emotionLevel:70,empathyLevel:80}),JSON.stringify({maxVoiceSeconds:8,allowInterrupt:true,voiceEnabled:false}),JSON.stringify({confirmationFrequency:35,maxSentences:3,multilingual:true}),JSON.stringify({policyKey:'human_first_transfer',priority:'CRITICAL'}),JSON.stringify({secretsAllowed:false,toolExecution:'disabled'}),tenantId]);
  const [behaviorRows]=await connection.query("SELECT id FROM ai_behavior_profiles WHERE tenant_id=? AND profile_key='natural_receptionist_default' LIMIT 1",[tenantId]);
  const behaviorId=Number((behaviorRows as any[])[0]?.id||0);
  const templates=[
    ['receptionist_default','AI Receptionist','Виртуальный администратор компании, принимающий обращения клиентов','receptionist','general','Вы — виртуальный администратор компании. Отвечайте естественно, кратко и профессионально. Просьба соединить с человеком имеет высший приоритет.'],
    ['pbx_admin_default','AI PBXPuls Administrator','Помощник администратора телефонии PBXPuls','telephony_admin','telephony','Вы — помощник администратора телефонии PBXPuls. Используйте только разрешённые безопасные данные и не выполняйте изменения.'],
    ['sales_manager_default','AI Sales Manager','AI менеджер первичных продаж','sales_manager','sales','Вы — менеджер первичных продаж. Общайтесь кратко, профессионально и уважайте просьбу клиента перейти к человеку.']
  ];
  for(const row of templates)await connection.execute(`INSERT INTO ai_agent_templates (tenant_id,template_key,name,description,agent_type,industry,default_prompt,default_behavior_profile_id,default_tools_json,default_permissions_json,status)
    SELECT NULL,?,?,?,?,?,?,?,'{"toolIds":[]}','{"permissionKeys":[]}','active' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ai_agent_templates WHERE tenant_id IS NULL AND template_key=?)`,[row[0],row[1],row[2],row[3],row[4],row[5],behaviorId,row[0]]);
  await connection.execute(`INSERT INTO ai_transfer_policies (tenant_id,policy_key,name,rules_json)
    SELECT NULL,'human_first_transfer','Human First Transfer',? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ai_transfer_policies WHERE tenant_id IS NULL AND policy_key='human_first_transfer')`,[JSON.stringify({priority:'CRITICAL',triggers:['хочу поговорить с человеком','соедините с оператором','позовите сотрудника','нужен живой человек','переключите'],actions:{stopGeneration:true,stopSales:true,askAdditionalQuestions:false,transferToHuman:true},execution:'voice_gateway_future'})]);
  await connection.execute(`INSERT INTO ai_autonomy_policies (tenant_id,policy_key,level,rules_json)
    SELECT NULL,'safe_default','SAFE',? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM ai_autonomy_policies WHERE tenant_id IS NULL AND policy_key='safe_default')`,[JSON.stringify({readAllowed:true,recommendationsAllowed:true,actionsRequireApproval:true,writeToolsEnabled:false})]);
  await seedLegacyAiPlatformPermissions(['create_ai_agents','clone_ai_agents','publish_ai_agents','manage_ai_templates','manage_ai_behavior_profiles','manage_ai_policies','run_ai_test_sessions']);
}

async function seedAiPlatformCoreFoundation(connection: Connection): Promise<void> {
  await ensureAiAgentCurrentVersionForeignKey(connection);
  await connection.execute(`INSERT IGNORE INTO ai_tenants (tenant_key,name,mode,status,settings_json)
    VALUES ('installation','текущая установка PBXPuls','installation','active','{}')`);
  const [tenantRows] = await connection.query("SELECT id FROM ai_tenants WHERE tenant_key='installation' LIMIT 1");
  const tenantId = Number((tenantRows as any[])[0]?.id || 0);
  if (!tenantId) throw new Error('AI Platform installation tenant seed failed');
  await connection.execute(`INSERT IGNORE INTO ai_behavior_profiles
    (tenant_id,profile_key,name,language,style_json,voice_rules_json,transfer_rules_json)
    VALUES (?,?,?,?,?,?,?)`, [tenantId,'natural_receptionist_default','Natural Receptionist Default','ru',
    JSON.stringify({responseLength:'short',naturalStyle:true}),JSON.stringify({bargeInSupported:true,multilingualEnabled:true,voiceEnabled:false}),JSON.stringify({humanTransferPriority:'highest'})]);
  const toolRows = [
    ['pbx.get_active_calls','Read active PBX calls'],['pbx.get_sip_registrations','Read SIP registrations'],['pbx.get_trunks_status','Read trunk status'],
    ['pbx.get_extensions_status','Read extension status'],['pbx.get_missed_calls','Read missed calls'],['pbx.get_call_statistics','Read call statistics'],
    ['directory.search_contacts','Search permitted directory contacts'],['calls.search_history','Search permitted call history']
  ];
  for (const [key,description] of toolRows) await connection.execute(`INSERT INTO ai_tools
    (tenant_id,tool_key,version,description,risk_level,input_schema_json,output_schema_json,executor_key,enabled)
    SELECT NULL,?,1,?,'read','{"type":"object","additionalProperties":false}','{"type":"object"}',?,1 FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM ai_tools WHERE tenant_id IS NULL AND tool_key=? AND version=1)`,[key,description,key,key]);
  await connection.execute(`INSERT IGNORE INTO ai_agents (tenant_id,agent_key,name,agent_type,status,current_version_id,created_by)
    VALUES (?,'receptionist_default','AI Receptionist','receptionist','draft',NULL,'system')`,[tenantId]);
  const [agentRows] = await connection.query("SELECT id FROM ai_agents WHERE tenant_id=? AND agent_key='receptionist_default' LIMIT 1",[tenantId]);
  const agentId = Number((agentRows as any[])[0]?.id || 0);
  const config = {language:'ru',multilingual:true,behaviorProfile:'natural_receptionist_default',autonomyLevel:'safe_autonomous',voiceEnabled:false,humanTransferPriority:'highest',toolIds:[]};
  await connection.execute(`INSERT IGNORE INTO ai_agent_versions
    (tenant_id,agent_id,version_number,lifecycle_status,config_json,system_prompt,checksum,created_by)
    VALUES (?,?,1,'draft',?,'',NULL,'system')`,[tenantId,agentId,JSON.stringify(config)]);
  await seedLegacyAiPlatformPermissions();
}

async function ensureAiAgentCurrentVersionForeignKey(connection: Connection): Promise<void> {
  const [rows] = await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='ai_agents' AND CONSTRAINT_NAME='fk_ai_agents_current_version' LIMIT 1`);
  if (Array.isArray(rows) && rows.length) return;
  await connection.query('ALTER TABLE ai_agents ADD CONSTRAINT fk_ai_agents_current_version FOREIGN KEY (current_version_id) REFERENCES ai_agent_versions(id)');
}

async function seedLegacyAiPlatformPermissions(additionalPermissions: string[] = []): Promise<void> {
  const legacyPath = path.join(process.cwd(), 'data', 'db.json');
  if (!fs.existsSync(legacyPath)) return;
  const db = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  if (!Array.isArray(db.roles)) return;
  const permissions = ['view_ai_platform','manage_ai_agents','manage_ai_providers','view_ai_tools','manage_ai_tools','view_ai_audit','execute_ai_read_tools','approve_ai_actions','manage_ai_platform',...additionalPermissions];
  let changed = false;
  for (const role of db.roles) {
    if (!['su','admin'].includes(String(role?.id || ''))) continue;
    role.permissions = role.permissions && typeof role.permissions === 'object' ? role.permissions : {};
    for (const permission of permissions) if (role.permissions[permission] !== true) { role.permissions[permission] = true; changed = true; }
  }
  if (!changed) return;
  const temporaryPath = `${legacyPath}.ai-platform-permissions.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(db,null,2), 'utf8');
  fs.renameSync(temporaryPath, legacyPath);
}

async function seedLegacyMonitoringTabPermissions(): Promise<void> {
  const legacyPath = path.join(process.cwd(), 'data', 'db.json');
  if (!fs.existsSync(legacyPath)) return;
  const db = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  if (!Array.isArray(db.roles)) return;
  const permissions = [
    'view_active_calls', 'view_tcpdump', 'view_sngrep', 'view_cli', 'view_db_explorer',
    'view_sip_devices_map', 'view_quality', 'view_health', 'view_ai_pbx_admin',
    'view_security', 'view_log_analysis', 'view_call_intelligence'
  ];
  let changed = false;
  for (const role of db.roles) {
    if (!['su', 'admin'].includes(String(role?.id || ''))) continue;
    role.permissions = role.permissions && typeof role.permissions === 'object' ? role.permissions : {};
    for (const permission of permissions) {
      if (role.permissions[permission] === true) continue;
      role.permissions[permission] = true;
      changed = true;
    }
  }
  if (!changed) return;
  const temporaryPath = `${legacyPath}.monitoring-permissions.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporaryPath, legacyPath);
}

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
    const appliedMigrationKeys = await readAppliedMigrationKeys(connection, columns);

    for (const migration of MIGRATIONS) {
      if (appliedMigrationKeys.has(migration.key)) {
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
      appliedMigrationKeys.add(migration.key);
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

async function readAppliedMigrationKeys(
  connection: Connection,
  columns: SchemaMigrationColumns
): Promise<Set<string>> {
  const [rows] = await connection.query(
    `SELECT ${columns.keyColumn} AS migration_key FROM schema_migrations`
  );
  return new Set((rows as any[]).map(row => String(row.migration_key || '')).filter(Boolean));
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
