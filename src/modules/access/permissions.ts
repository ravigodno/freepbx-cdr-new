import { AppSettings, UserRole } from '../../types';
import { roleHasPermission } from './roleMatrix';

export type PermissionKey =
  | 'view_calls'
  | 'own_calls_only'
  | 'view_directory'
  | 'view_reports'
  | 'view_marketing'
  | 'manage_marketing'
  | 'manage_calltracking'
  | 'manage_yandex_metrika'
  | 'manage_yandex_direct'
  | 'listen_recordings'
  | 'make_calls'
  | 'show_call_modal'
  | 'edit_directory'
  | 'edit_own_directory_contacts'
  | 'export_excel'
  | 'view_monitoring'
  | 'view_active_calls'
  | 'view_quality'
  | 'view_tcpdump'
  | 'view_sngrep'
  | 'view_cli'
  | 'view_db_explorer'
  | 'view_health'
  | 'view_sip_devices_map'
  | 'view_security'
  | 'view_log_analysis'
  | 'view_call_intelligence'
  | 'view_security_events'
  | 'view_firewall'
  | 'view_fail2ban'
  | 'manage_fail2ban'
  | 'manage_security_whitelist'
  | 'view_security_config_audit'
  | 'manage_security_settings'
  | 'export_security_report'
  | 'view_settings'
  | 'manage_users'
  | 'manage_roles'
  | 'manage_directory_import'
  | 'directory_import_contacts'
  | 'directory_manage_import_settings'
  | 'manage_blacklist'
  | 'delete_records'
  | 'process_calls'
  | 'view_management'
  | 'dangerous_pbx_write'
  | 'bulk_extensions'
  | 'manage_trunks'
  | 'manage_outbound_routes'
  | 'manage_numbering_capacity'
  | 'view_balance'
  | 'view_balance_analytics'
  | 'manage_balance_sources'
  | 'view_balance_alerts'
  | 'manage_balance_providers'
  | 'view_scripts'
  | 'manage_scripts'
  | 'view_ai_assistant'
  | 'manage_ai_assistant'
  | 'view_ai_pbx_admin'
  | 'manage_ai_pbx_admin'
  | 'view_ai_platform'
  | 'manage_ai_agents'
  | 'manage_ai_providers'
  | 'view_ai_tools'
  | 'manage_ai_tools'
  | 'view_ai_audit'
  | 'execute_ai_read_tools'
  | 'approve_ai_actions'
  | 'manage_ai_platform'
  | 'create_ai_agents'
  | 'clone_ai_agents'
  | 'publish_ai_agents'
  | 'view_ai_agents'
  | 'edit_ai_agents'
  | 'view_ai_telephony'
  | 'configure_ai_telephony'
  | 'ai_platform_expert_mode'
  | 'manage_ai_templates'
  | 'manage_ai_behavior_profiles'
  | 'manage_ai_policies'
  | 'run_ai_test_sessions'
  | 'manage_ai_knowledge'
  | 'view_ai_knowledge'
  | 'publish_ai_knowledge'
  | 'manage_ai_training'
  | 'view_ai_training'
  | 'publish_ai_training'
  | 'view_ai_context_preview'
  | 'execute_ai_sandbox'
  | 'view_ai_tool_executions'
  | 'test_ai_tools'
  | 'view_ai_transfer_requests'
  | 'manage_ai_transfer_policies'
  | 'test_ai_human_transfer'
  | 'view_ai_actions'
  | 'manage_ai_actions'
  | 'execute_ai_low_risk_actions'
  | 'view_ai_callback_requests'
  | 'manage_ai_callback_requests'
  | 'assign_ai_actions'
  | 'view_ai_voice_status'
  | 'view_ai_voice_sessions'
  | 'manage_ai_voice_bindings'
  | 'control_ai_voice_gateway'
  | 'test_ai_voice_gateway'
  | 'view_ai_voice_media_status'
  | 'view_ai_voice_media_sessions'
  | 'test_ai_voice_media'
  | 'manage_ai_voice_media'
  | 'view_ai_realtime_voice_status'
  | 'view_ai_realtime_voice_sessions'
  | 'test_ai_realtime_voice'
  | 'manage_ai_realtime_voice'
  | 'view_ai_voice_live_test'
  | 'configure_ai_voice_live_test'
  | 'enable_ai_voice_live_test'
  | 'execute_ai_voice_live_test_checks'
  | 'view_ai_voice_agents'
  | 'manage_ai_voice_agents'
  | 'test_ai_voice_agents'
  | 'manage_ai_voice_routes'
  | 'view_ai_voice_transcripts'
  | 'export_ai_voice_transcripts'
  | 'view_ai_voice_profiles'
  | 'manage_ai_voice_profiles'
  | 'view_ai_voice_catalog'
  | 'generate_ai_voice_preview'
  | 'view_ai_extensions'
  | 'create_ai_extensions'
  | 'update_ai_extensions'
  | 'publish_ai_extensions'
  | 'delete_ai_extensions'
  | 'view_ai_handoff'
  | 'configure_ai_handoff'
  | 'test_ai_handoff'
  | 'publish_ai_handoff';

export type UserPermissions = Partial<Record<PermissionKey, boolean>>;

export interface PermissionSession {
  role: UserRole;
  permissions?: UserPermissions;
}

type OptionalModuleKey = 'marketing' | 'monitoring' | 'management' | 'balance' | 'scripts' | 'ai_assistant' | 'ai_pbx_admin';

const PERMISSION_MODULE_MAP: Partial<Record<PermissionKey, OptionalModuleKey>> = {
  view_marketing: 'marketing',
  manage_marketing: 'marketing',
  manage_calltracking: 'marketing',
  manage_yandex_metrika: 'marketing',
  manage_yandex_direct: 'marketing',

  view_monitoring: 'monitoring',
  view_active_calls: 'monitoring',
  view_quality: 'monitoring',
  view_tcpdump: 'monitoring',
  view_sngrep: 'monitoring',
  view_cli: 'monitoring',
  view_db_explorer: 'monitoring',
  view_health: 'monitoring',
  view_sip_devices_map: 'monitoring',
  view_security: 'monitoring',
  view_log_analysis: 'monitoring',
  view_call_intelligence: 'monitoring',
  view_security_events: 'monitoring',
  view_firewall: 'monitoring',
  view_fail2ban: 'monitoring',
  manage_fail2ban: 'monitoring',
  manage_security_whitelist: 'monitoring',
  view_security_config_audit: 'monitoring',
  manage_security_settings: 'monitoring',
  export_security_report: 'monitoring',

  view_management: 'management',
  dangerous_pbx_write: 'management',
  bulk_extensions: 'management',
  manage_trunks: 'management',
  manage_outbound_routes: 'management',
  manage_numbering_capacity: 'management',

  view_balance: 'balance',
  view_balance_analytics: 'balance',
  manage_balance_sources: 'balance',
  view_balance_alerts: 'balance',
  manage_balance_providers: 'balance',

  view_scripts: 'scripts',
  manage_scripts: 'scripts',

  view_ai_assistant: 'ai_assistant',
  manage_ai_assistant: 'ai_assistant',

  view_ai_pbx_admin: 'ai_pbx_admin',
  manage_ai_pbx_admin: 'ai_pbx_admin'
};

function isPermissionAllowedByModuleVisibility(
  session: PermissionSession,
  settings: Partial<AppSettings> | null | undefined,
  perm: PermissionKey
): boolean {
  if (session.role === 'su') return true;

  const moduleKey = PERMISSION_MODULE_MAP[perm];
  if (!moduleKey) return true;

  const moduleVisibility = (settings as any)?.moduleVisibility || {};
  return moduleVisibility[moduleKey] !== false;
}

function customRoleHasPermission(
  session: PermissionSession,
  settings: Partial<AppSettings> | null | undefined,
  perm: PermissionKey
): boolean {
  if (session.permissions && Object.prototype.hasOwnProperty.call(session.permissions, perm)) {
    return session.permissions[perm] === true;
  }

  const pSettings = settings || {};

  if (perm === 'view_calls') return pSettings.customCanViewCalls !== false;
  if (perm === 'view_directory') return pSettings.customCanViewDirectory !== false;
  if (perm === 'view_reports') return !!pSettings.customCanViewReports;
  if (perm === 'listen_recordings') return pSettings.customCanListenRecordings !== false;
  if (perm === 'make_calls') return pSettings.customCanMakeCalls !== false;
  if (perm === 'edit_directory') return !!pSettings.customCanEditDirectory;

  return false;
}

export function hasUserPermission(
  session: PermissionSession | null | undefined,
  settings: Partial<AppSettings> | null | undefined,
  perm: PermissionKey
): boolean {
  if (!session) return false;

  if (session.role === 'su') return true;

  if (!isPermissionAllowedByModuleVisibility(session, settings, perm)) return false;

  if (session.permissions && Object.prototype.hasOwnProperty.call(session.permissions, perm)) {
    return session.permissions[perm] === true;
  }

  if (session.role === 'custom') {
    return customRoleHasPermission(session, settings, perm);
  }

  return roleHasPermission(session.role as UserRole, perm);
}
