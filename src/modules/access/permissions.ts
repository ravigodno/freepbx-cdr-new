import { AppSettings, UserRole } from '../../types';

export type PermissionKey =
  | 'view_calls'
  | 'view_directory'
  | 'view_reports'
  | 'listen_recordings'
  | 'make_calls'
  | 'edit_directory';

export interface PermissionSession {
  role: UserRole;
}

export function hasUserPermission(
  session: PermissionSession | null | undefined,
  settings: Partial<AppSettings> | null | undefined,
  perm: PermissionKey
): boolean {
  if (!session) return false;

  if (session.role === 'admin') return true;

  if (session.role === 'directory_only') {
    return perm === 'view_directory';
  }

  if (session.role === 'custom') {
    const pSettings = settings || {};

    if (perm === 'view_calls') return pSettings.customCanViewCalls !== false;
    if (perm === 'view_directory') return pSettings.customCanViewDirectory !== false;
    if (perm === 'view_reports') return !!pSettings.customCanViewReports;
    if (perm === 'listen_recordings') return pSettings.customCanListenRecordings !== false;
    if (perm === 'make_calls') return pSettings.customCanMakeCalls !== false;
    if (perm === 'edit_directory') return !!pSettings.customCanEditDirectory;

    return false;
  }

  if (session.role === 'manager') {
    return true;
  }

  if (session.role === 'operator') {
    if (perm === 'view_reports') return false;
    if (perm === 'edit_directory') return false;
    return true;
  }

  return false;
}
