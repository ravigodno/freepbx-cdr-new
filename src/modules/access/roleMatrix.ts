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
    'view_tcpdump',
    'view_sngrep',
    'view_cli',
    'view_sip_devices_map'
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
    'view_sip_devices_map'
  ],
  operator: [
    'view_calls',
    'view_directory',
    'listen_recordings',
    'make_calls'
  ],
  directory_only: [
    'view_directory'
  ],
  custom: []
};

export function roleHasPermission(role: UserRole, perm: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}
