import { UserRole } from '../../types';
import { PermissionKey } from './permissions';

export const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  admin: [
    'view_calls',
    'view_directory',
    'view_reports',
    'listen_recordings',
    'make_calls',
    'edit_directory'
  ],
  manager: [
    'view_calls',
    'view_directory',
    'view_reports',
    'listen_recordings',
    'make_calls',
    'edit_directory'
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
