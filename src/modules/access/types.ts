import { UserRole } from '../../types';
import { PermissionKey } from './permissions';

export type UserPermissions = Partial<Record<PermissionKey, boolean>>;

export interface AccessUser {
  id: string;
  username: string;
  role: UserRole;
  extension?: string;
  disabled?: boolean;
  permissions?: UserPermissions;
}

export interface UserFormState {
  username: string;
  password: string;
  role: UserRole;
  extension: string;
  disabled: boolean;
  permissions?: UserPermissions;
}
