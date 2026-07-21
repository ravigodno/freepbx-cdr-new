import { UserRole } from '../../types';
import { PermissionKey } from './permissions';

export const ROLE_PERMISSIONS: Partial<Record<UserRole, PermissionKey[]>> = {
  su: [],
  admin: [
    'view_calls',
    'view_directory',
    'view_reports',
    'listen_recordings',
    'make_calls',
    'edit_directory',
    'view_monitoring',
    'view_active_calls',
    'view_quality',
    'view_tcpdump',
    'view_sngrep',
    'view_cli',
    'view_db_explorer',
    'view_health',
    'view_sip_devices_map',
    'view_security',
    'view_log_analysis',
    'view_security_events',
    'view_firewall',
    'view_fail2ban',
    'manage_fail2ban',
    'manage_security_whitelist',
    'view_security_config_audit',
    'manage_security_settings',
    'export_security_report',
    'view_balance_alerts',
    'view_scripts',
    'manage_scripts',
    'view_ai_assistant',
    'manage_ai_assistant',
    'view_ai_pbx_admin',
    'manage_ai_pbx_admin'
  ],
  manager: [
    'view_calls',
    'view_directory',
    'view_reports',
    'listen_recordings',
    'make_calls',
    'edit_directory',
    'view_monitoring',
    'view_active_calls',
    'view_quality',
    'view_sip_devices_map',
    'view_scripts',
    'manage_scripts',
    'view_ai_assistant',
    'manage_ai_assistant',
    'view_ai_pbx_admin',
    'manage_ai_pbx_admin'
  ],
  operator: [
    'view_calls',
    'view_directory',
    'listen_recordings',
    'make_calls',
    'view_scripts',
    'view_ai_assistant'
  ],
  directory_only: [
    'view_directory'
  ],
  custom: []
};

export function roleHasPermission(role: UserRole, perm: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}
