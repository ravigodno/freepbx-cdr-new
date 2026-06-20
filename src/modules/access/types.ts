import { UserRole } from '../../types';
import { PermissionKey } from './permissions';

export type UserPermissions = Partial<Record<PermissionKey, boolean>>;

export interface AccessRole {
  id: string;
  name: string;
  system?: boolean;
  hidden?: boolean;
  permissions: UserPermissions;
}

export interface AccessUser {
  id: string;
  username: string;
  role: UserRole | string;
  extension?: string;
  disabled?: boolean;
  permissions?: UserPermissions;
}

export interface UserFormState {
  username: string;
  password: string;
  role: UserRole | string;
  extension: string;
  disabled: boolean;
  permissions?: UserPermissions;
}
