import { AppSettings, UserRole } from '../../types';
import { roleHasPermission } from './roleMatrix';

export type PermissionKey =
  | 'view_calls'
  | 'view_directory'
  | 'view_reports'
  | 'listen_recordings'
  | 'make_calls'
  | 'edit_directory';

export type UserPermissions = Partial<Record<PermissionKey, boolean>>;

export interface PermissionSession {
  role: UserRole;
  permissions?: UserPermissions;
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

  if (session.role === 'custom') {
    return customRoleHasPermission(session, settings, perm);
  }

  return roleHasPermission(session.role, perm);
}
