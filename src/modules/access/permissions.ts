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
  | 'export_excel'
  | 'view_monitoring'
  | 'view_active_calls'
  | 'view_quality'
  | 'view_tcpdump'
  | 'view_sngrep'
  | 'view_cli'
  | 'view_sip_devices_map'
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
  | 'manage_ai_pbx_admin';

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
  view_sip_devices_map: 'monitoring',

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
