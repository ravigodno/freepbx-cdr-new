import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mysql, { ConnectionOptions } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const setup = process.argv.includes('--setup');
const requiredTables = [
  'schema_migrations', 'settings', 'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'tools', 'audit_log', 'system_events', 'directory_contacts', 'directory_contact_metadata',
  'directory_custom_fields', 'quality_current', 'quality_history', 'monitoring_health_history',
  'monitoring_quality_alerts', 'monitoring_devices_history', 'monitoring_devices_alerts',
  'monitoring_devices_conflicts', 'monitoring_devices_map', 'security_events', 'security_event_sources',
  'security_ip_whitelist', 'security_sip_registration_history', 'security_check_results', 'security_file_baselines',
  'security_file_changes', 'security_alert_rules', 'security_alert_history', 'security_scan_runs',
  'ai_tenants', 'ai_agents', 'ai_agent_versions', 'ai_provider_configs', 'ai_tools', 'ai_agent_tools',
  'ai_behavior_profiles', 'ai_audit_log', 'ai_tool_executions', 'ai_transfer_requests',
  'ai_action_definitions', 'ai_actions', 'ai_agent_actions', 'ai_callback_requests', 'ai_voice_sessions', 'ai_voice_route_bindings', 'ai_voice_media_sessions', 'ai_realtime_voice_sessions',
  'ai_extensions', 'ai_extension_previews'
  ,'ai_handoff_configs','ai_handoff_previews','ai_handoff_events'
];

function parseFreePBXConfig(): Record<string, string> {
  try {
    const source = fs.readFileSync('/etc/freepbx.conf', 'utf8');
    const values: Record<string, string> = {};
    for (const key of ['AMPDBHOST', 'AMPDBUSER', 'AMPDBPASS']) {
      const match = source.match(new RegExp(`(?:define\\(\\s*['"]${key}['"]\\s*,\\s*|\\$amp_conf\\[['"]${key}['"]\\]\\s*=\\s*)['"]([^'"]*)['"]`));
      if (match) values[key] = match[1];
    }
    return values;
  } catch {
    return {};
  }
}

function runtimeConfig(passwordOverride?: string) {
  const password = passwordOverride ?? process.env.PBXPULS_DB_PASSWORD ?? process.env.PBXPULS_DB_PASS ?? '';
  return {
    host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
    port: Number(process.env.PBXPULS_DB_PORT || 3306),
    database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
    user: process.env.PBXPULS_DB_USER || 'pbxpuls',
    password
  };
}

async function connect(options: ConnectionOptions) {
  return mysql.createConnection({ ...options, connectTimeout: 2500, dateStrings: true });
}

async function findAdminConnection() {
  const freepbx = parseFreePBXConfig();
  const candidates: Array<{ source: string; options: ConnectionOptions }> = [
    { source: 'root_socket', options: { user: 'root', socketPath: '/var/lib/mysql/mysql.sock' } },
    { source: 'root_socket', options: { user: 'root', socketPath: '/run/mysqld/mysqld.sock' } }
  ];
  if (freepbx.AMPDBUSER) candidates.push({
    source: 'freepbx',
    options: { host: freepbx.AMPDBHOST || '127.0.0.1', user: freepbx.AMPDBUSER, password: freepbx.AMPDBPASS || '' }
  });
  for (const candidate of candidates) {
    try {
      return { connection: await connect(candidate.options), source: candidate.source };
    } catch {}
  }
  return null;
}

function appendEnv(config: ReturnType<typeof runtimeConfig>) {
  const envPath = path.join(process.cwd(), '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const additions = [
    ['PBXPULS_DB_HOST', config.host], ['PBXPULS_DB_PORT', String(config.port)],
    ['PBXPULS_DB_NAME', config.database], ['PBXPULS_DB_USER', config.user],
    ['PBXPULS_DB_PASSWORD', config.password]
  ].filter(([key]) => !new RegExp(`^${key}=`, 'm').test(existing));
  if (!additions.length) return;
  fs.appendFileSync(envPath, `${existing.endsWith('\n') || !existing ? '' : '\n'}${additions.map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
}

function printManualInstructions() {
  console.error('Automatic bootstrap is unavailable. Run as a MariaDB administrator:');
  console.error(`read -s PBXPULS_DB_PASSWORD
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS pbxpuls CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'pbxpuls'@'localhost' IDENTIFIED BY '$PBXPULS_DB_PASSWORD';
CREATE USER IF NOT EXISTS 'pbxpuls'@'127.0.0.1' IDENTIFIED BY '$PBXPULS_DB_PASSWORD';
GRANT ALL PRIVILEGES ON pbxpuls.* TO 'pbxpuls'@'localhost';
GRANT ALL PRIVILEGES ON pbxpuls.* TO 'pbxpuls'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL`);
  console.error('Then set PBXPULS_DB_PASSWORD to the same value in .env and run npm run pbxpuls:db:setup again.');
}

async function inspect() {
  const config = runtimeConfig();
  const result: any = {
    pbxpulsDbConfigured: Boolean(config.password), pbxpulsDbConnected: false,
    dbName: config.database, dbUser: config.user, passwordPresent: Boolean(config.password),
    migrationsOk: false, qualityCacheAvailable: false
  };
  if (!config.password) return result;
  try {
    const connection = await connect(config);
    const [rows] = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.database]);
    const [grantRows] = await connection.query('SHOW GRANTS FOR CURRENT_USER');
    const [aiSettingRows] = await connection.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN ('ai.platform_core_enabled','ai.write_tools_enabled','ai.voice_control_plane_enabled','ai.voice_media_transport_enabled','ai.voice_media_transport_mode','ai.realtime_voice_enabled','ai.realtime_voice_provider','ai.voice_live_test_enabled','ai.voice_live_transport','ai.voice_live_test_extension')");
    const [aiPermissionRows] = await connection.query(`SELECT p.permission_key,r.role_key FROM permissions p
      LEFT JOIN role_permissions rp ON rp.permission_id=p.id LEFT JOIN roles r ON r.id=rp.role_id
      WHERE p.permission_key IN ('view_ai_tool_executions','test_ai_tools','view_ai_transfer_requests','manage_ai_transfer_policies','test_ai_human_transfer','view_ai_actions','manage_ai_actions','execute_ai_low_risk_actions','view_ai_callback_requests','manage_ai_callback_requests','assign_ai_actions','view_ai_voice_status','view_ai_voice_sessions','manage_ai_voice_bindings','control_ai_voice_gateway','test_ai_voice_gateway','view_ai_voice_media_status','view_ai_voice_media_sessions','test_ai_voice_media','manage_ai_voice_media','view_ai_realtime_voice_status','view_ai_realtime_voice_sessions','test_ai_realtime_voice','manage_ai_realtime_voice','view_ai_voice_live_test','configure_ai_voice_live_test','enable_ai_voice_live_test','execute_ai_voice_live_test_checks')`);
    const [aiToolColumnRows] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_tool_executions'`, [config.database]);
    const [aiToolIndexRows] = await connection.query(`SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_tool_executions'`, [config.database]);
    const [aiToolForeignKeyRows] = await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='ai_tool_executions'`, [config.database]);
    const [aiTransferColumnRows] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_transfer_requests'`,[config.database]);
    const [aiTransferIndexRows] = await connection.query(`SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_transfer_requests'`,[config.database]);
    const [aiTransferForeignKeyRows] = await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='ai_transfer_requests'`,[config.database]);
    const [aiActionColumnRows]=await connection.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN('ai_actions','ai_callback_requests','ai_agent_actions','ai_action_definitions')`,[config.database]);
    const [aiActionIndexRows]=await connection.query(`SELECT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN('ai_actions','ai_callback_requests','ai_agent_actions')`,[config.database]);
    const [aiActionForeignKeyRows]=await connection.query(`SELECT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME IN('ai_actions','ai_callback_requests','ai_agent_actions','ai_action_definitions')`,[config.database]);
    const [aiVoiceColumnRows]=await connection.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN('ai_voice_sessions','ai_voice_route_bindings')`,[config.database]);
    const [aiVoiceIndexRows]=await connection.query(`SELECT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN('ai_voice_sessions','ai_voice_route_bindings')`,[config.database]);
    const [aiVoiceForeignKeyRows]=await connection.query(`SELECT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME IN('ai_voice_sessions','ai_voice_route_bindings')`,[config.database]);
    const [aiVoiceMediaColumnRows]=await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_voice_media_sessions'`,[config.database]);
    const [aiVoiceMediaIndexRows]=await connection.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_voice_media_sessions'`,[config.database]);
    const [aiVoiceMediaForeignKeyRows]=await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='ai_voice_media_sessions'`,[config.database]);
    const [aiRealtimeColumnRows]=await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_realtime_voice_sessions'`,[config.database]);
    const [aiRealtimeIndexRows]=await connection.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='ai_realtime_voice_sessions'`,[config.database]);
    const [aiRealtimeForeignKeyRows]=await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='ai_realtime_voice_sessions'`,[config.database]);
    await connection.end();
    const tables = new Set((rows as any[]).map(row => String(row.TABLE_NAME)));
    result.pbxpulsDbConnected = true;
    result.dbUserPresent = true;
    const grants = (grantRows as any[]).flatMap(row => Object.values(row).map(String)).join('\n').toUpperCase();
    result.privilegesOk = grants.includes('ALL PRIVILEGES') || ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'].every(privilege => grants.includes(privilege));
    result.missingTables = requiredTables.filter(table => !tables.has(table));
    result.migrationsOk = result.missingTables.length === 0;
    result.qualityCacheAvailable = tables.has('quality_current') && tables.has('quality_history');
    const aiSettings = new Map((aiSettingRows as any[]).map(row => [String(row.setting_key), String(row.setting_value)]));
    result.aiPlatformCoreEnabled = aiSettings.get('ai.platform_core_enabled') === 'true';
    result.aiWriteToolsEnabled = aiSettings.get('ai.write_tools_enabled') === 'true';
    result.aiVoiceControlPlaneEnabled = aiSettings.get('ai.voice_control_plane_enabled') === 'true';
    result.aiVoiceMediaTransportEnabled = aiSettings.get('ai.voice_media_transport_enabled') === 'true';
    result.aiRealtimeVoiceEnabled = aiSettings.get('ai.realtime_voice_enabled') === 'true';
    result.aiRealtimeVoiceProvider = aiSettings.get('ai.realtime_voice_provider') || null;
    result.aiVoiceLiveTestEnabled = aiSettings.get('ai.voice_live_test_enabled') === 'true';
    result.aiVoiceLiveTransport = aiSettings.get('ai.voice_live_transport') || null;
    result.aiVoiceLiveTestExtensionConfigured = Boolean(aiSettings.get('ai.voice_live_test_extension'));
    result.aiVoiceMediaTransportMode = aiSettings.get('ai.voice_media_transport_mode') || 'synthetic';
    const toolPermissionRows = aiPermissionRows as any[];
    result.aiToolPermissionsRestrictedToSuAdmin = ['view_ai_tool_executions','test_ai_tools'].every(permission =>
      toolPermissionRows.some(row => row.permission_key === permission)) && toolPermissionRows.every(row => ['su','admin'].includes(String(row.role_key)));
    result.aiTransferPermissionsRestrictedToSuAdmin = ['view_ai_transfer_requests','manage_ai_transfer_policies','test_ai_human_transfer'].every(permission =>
      toolPermissionRows.some(row => row.permission_key === permission)) && toolPermissionRows.filter(row => ['view_ai_transfer_requests','manage_ai_transfer_policies','test_ai_human_transfer'].includes(row.permission_key)).every(row => ['su','admin'].includes(String(row.role_key)));
    const actionPermissions=['view_ai_actions','manage_ai_actions','execute_ai_low_risk_actions','view_ai_callback_requests','manage_ai_callback_requests','assign_ai_actions'];
    result.aiActionPermissionsRestrictedToSuAdmin=actionPermissions.every(permission=>toolPermissionRows.some(row=>row.permission_key===permission))&&toolPermissionRows.filter(row=>actionPermissions.includes(row.permission_key)).every(row=>['su','admin'].includes(String(row.role_key)));
    const voicePermissions=['view_ai_voice_status','view_ai_voice_sessions','manage_ai_voice_bindings','control_ai_voice_gateway','test_ai_voice_gateway'];result.aiVoicePermissionsRestrictedToSuAdmin=voicePermissions.every(permission=>toolPermissionRows.some(row=>row.permission_key===permission))&&toolPermissionRows.filter(row=>voicePermissions.includes(row.permission_key)).every(row=>['su','admin'].includes(String(row.role_key)));
    const mediaPermissions=['view_ai_voice_media_status','view_ai_voice_media_sessions','test_ai_voice_media','manage_ai_voice_media'];result.aiVoiceMediaPermissionsRestrictedToSuAdmin=mediaPermissions.every(permission=>toolPermissionRows.some(row=>row.permission_key===permission))&&toolPermissionRows.filter(row=>mediaPermissions.includes(row.permission_key)).every(row=>['su','admin'].includes(String(row.role_key)));
    const realtimePermissions=['view_ai_realtime_voice_status','view_ai_realtime_voice_sessions','test_ai_realtime_voice','manage_ai_realtime_voice'];result.aiRealtimeVoicePermissionsRestrictedToSuAdmin=realtimePermissions.every(permission=>toolPermissionRows.some(row=>row.permission_key===permission))&&toolPermissionRows.filter(row=>realtimePermissions.includes(row.permission_key)).every(row=>['su','admin'].includes(String(row.role_key)));
    const livePermissions=['view_ai_voice_live_test','configure_ai_voice_live_test','enable_ai_voice_live_test','execute_ai_voice_live_test_checks'];result.aiVoiceLivePermissionsRestrictedToSuAdmin=livePermissions.every(permission=>toolPermissionRows.some(row=>row.permission_key===permission))&&toolPermissionRows.filter(row=>livePermissions.includes(row.permission_key)).every(row=>['su','admin'].includes(String(row.role_key)));
    const toolColumns = new Set((aiToolColumnRows as any[]).map(row => String(row.COLUMN_NAME)));
    result.aiToolExecutionsSchemaOk = ['tenant_id','trace_id','conversation_id','agent_id','agent_version_id','tool_id','tool_key','executor_key','status','risk_level','input_json','input_hash','output_json','error_code','duration_ms','actor_id','idempotency_key','completed_at'].every(column => toolColumns.has(column));
    const toolIndexes = new Set((aiToolIndexRows as any[]).map(row => String(row.INDEX_NAME)));
    result.aiToolExecutionsIndexesOk = ['idx_ai_tool_exec_tenant_time','idx_ai_tool_exec_tenant_status','idx_ai_tool_exec_conversation','idx_ai_tool_exec_trace','uniq_ai_tool_idempotency'].every(index => toolIndexes.has(index));
    result.aiToolExecutionsForeignKeysOk = (aiToolForeignKeyRows as any[]).length >= 5;
    const transferColumns=new Set((aiTransferColumnRows as any[]).map(row=>String(row.COLUMN_NAME)));result.aiTransferRequestsSchemaOk=['tenant_id','trace_id','conversation_id','voice_session_id','agent_id','agent_version_id','trigger_type','trigger_text_hash','destination_type','destination_value_safe','destination_ref','status','failure_code','fallback_action','pbx_action_ref','metadata_json'].every(column=>transferColumns.has(column));
    const transferIndexes=new Set((aiTransferIndexRows as any[]).map(row=>String(row.INDEX_NAME)));result.aiTransferRequestsIndexesOk=['idx_ai_transfer_tenant_time','idx_ai_transfer_tenant_status','idx_ai_transfer_conversation','idx_ai_transfer_trace','idx_ai_transfer_live'].every(index=>transferIndexes.has(index));
    result.aiTransferRequestsForeignKeysOk=(aiTransferForeignKeyRows as any[]).length>=4;
    const actionColumns=aiActionColumnRows as any[],hasColumns=(table:string,columns:string[])=>columns.every(column=>actionColumns.some(row=>row.TABLE_NAME===table&&row.COLUMN_NAME===column));
    result.aiActionsSchemaOk=hasColumns('ai_actions',['tenant_id','trace_id','conversation_id','agent_id','agent_version_id','action_key','status','risk_level','approval_mode','input_json','input_hash','idempotency_key','metadata_json'])&&hasColumns('ai_callback_requests',['tenant_id','conversation_id','transfer_request_id','phone_encrypted','phone_key_version','phone_hash','phone_masked','consent_status','created_by_action_id']);
    const actionIndexes=aiActionIndexRows as any[];result.aiActionsIndexesOk=['uniq_ai_actions_idempotency','idx_ai_actions_tenant_status','idx_ai_callback_phone','uniq_ai_agent_action'].every(index=>actionIndexes.some(row=>row.INDEX_NAME===index));
    result.aiActionsForeignKeysOk=(aiActionForeignKeyRows as any[]).length>=12;
    const voiceColumns=aiVoiceColumnRows as any[],hasVoiceColumns=(table:string,columns:string[])=>columns.every(column=>voiceColumns.some(row=>row.TABLE_NAME===table&&row.COLUMN_NAME===column));result.aiVoiceSchemaOk=hasVoiceColumns('ai_voice_sessions',['tenant_id','conversation_id','agent_id','agent_version_id','external_call_id_hash','ari_channel_id_encrypted','ari_channel_id_hash','state','media_state','provider_state','last_event_at'])&&hasVoiceColumns('ai_voice_route_bindings',['tenant_id','binding_key','match_type','match_value_hash','agent_id','agent_version_id','dry_run_only']);
    const voiceIndexes=aiVoiceIndexRows as any[];result.aiVoiceIndexesOk=['idx_ai_voice_session_tenant_state','idx_ai_voice_session_channel','idx_ai_voice_binding_match'].every(index=>voiceIndexes.some(row=>row.INDEX_NAME===index));result.aiVoiceForeignKeysOk=(aiVoiceForeignKeyRows as any[]).length>=8;
    const mediaColumns=new Set((aiVoiceMediaColumnRows as any[]).map(row=>String(row.COLUMN_NAME)));result.aiVoiceMediaSchemaOk=['tenant_id','voice_session_id','transport_mode','state','codec_in','codec_out','sample_rate_in','sample_rate_out','ingress_frames','egress_frames','dropped_frames','jitter_ms_avg','failure_code','metadata_json'].every(column=>mediaColumns.has(column));const mediaIndexes=new Set((aiVoiceMediaIndexRows as any[]).map(row=>String(row.INDEX_NAME)));result.aiVoiceMediaIndexesOk=['idx_ai_voice_media_tenant_state','idx_ai_voice_media_voice_session'].every(index=>mediaIndexes.has(index));result.aiVoiceMediaForeignKeysOk=(aiVoiceMediaForeignKeyRows as any[]).length>=2;
    const realtimeColumns=new Set((aiRealtimeColumnRows as any[]).map(row=>String(row.COLUMN_NAME)));result.aiRealtimeVoiceSchemaOk=['tenant_id','voice_session_id','media_session_id','provider_key','provider_session_id_hash','state','input_codec','output_codec','input_sample_rate','output_sample_rate','first_response_latency_ms','interruption_count','tool_call_count','metadata_json'].every(column=>realtimeColumns.has(column));const realtimeIndexes=new Set((aiRealtimeIndexRows as any[]).map(row=>String(row.INDEX_NAME)));result.aiRealtimeVoiceIndexesOk=['idx_ai_realtime_tenant_state','idx_ai_realtime_voice_session','idx_ai_realtime_media_session'].every(index=>realtimeIndexes.has(index));result.aiRealtimeVoiceForeignKeysOk=(aiRealtimeForeignKeyRows as any[]).length>=3;
  } catch (error: any) {
    result.reason = String(error?.message || error).replace(/(password|passwd)\s*[:=]\s*\S+/gi, '$1=********').slice(0, 300);
  }
  return result;
}

async function main() {
  let status = await inspect();
  if (!setup) {
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = status.qualityCacheAvailable ? 0 : 1;
    return;
  }

  let config = runtimeConfig();
  if (!status.pbxpulsDbConnected) {
    const admin = await findAdminConnection();
    if (!admin) {
      console.log(JSON.stringify(status, null, 2));
      printManualInstructions();
      process.exitCode = 1;
      return;
    }
    if (!config.password) config = runtimeConfig(crypto.randomBytes(24).toString('base64url'));
    if (!/^[A-Za-z0-9_$-]+$/.test(config.database) || !/^[A-Za-z0-9_$.-]+$/.test(config.user)) {
      throw new Error('PBXPuls DB name or user contains unsupported characters');
    }
    const db = config.database;
    const user = config.user;
    try {
      await admin.connection.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      for (const host of ['localhost', '127.0.0.1']) {
        await admin.connection.query(`CREATE USER IF NOT EXISTS '${user}'@'${host}' IDENTIFIED BY ${admin.connection.escape(config.password)}`);
        await admin.connection.query(`GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${user}'@'${host}'`);
      }
      await admin.connection.query('FLUSH PRIVILEGES');
      appendEnv(config);
      process.env.PBXPULS_DB_PASSWORD = config.password;
      console.error(`PBXPuls DB bootstrap completed via ${admin.source}; password was written to .env and was not printed.`);
    } catch (error: any) {
      console.error(`PBXPuls DB bootstrap failed via ${admin.source}: ${String(error?.message || error).slice(0, 300)}`);
      printManualInstructions();
      process.exitCode = 1;
      return;
    } finally {
      await admin.connection.end();
    }
  }

  const { runPBXPulsMigrations } = await import('../server/pbxpulsMigrations.js');
  await runPBXPulsMigrations();
  status = await inspect();
  console.log(JSON.stringify(status, null, 2));
  process.exitCode = status.qualityCacheAvailable ? 0 : 1;
}

main().then(() => {
  process.exit(process.exitCode || 0);
}).catch(error => {
  console.error(String(error?.message || error).slice(0, 500));
  process.exit(1);
});
