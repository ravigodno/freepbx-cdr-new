import { UserRole } from '../../types';

export interface AccessUser {
  id: string;
  username: string;
  role: UserRole;
  extension?: string;
  disabled?: boolean;
}

export interface UserFormState {
  username: string;
  password: string;
  role: UserRole;
  extension: string;
  disabled: boolean;
}
