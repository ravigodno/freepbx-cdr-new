import fs from 'fs';
import path from 'path';
import { isPBXPulsDbAvailable, queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';

export interface PBXPulsSqlUser {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  password_hash: string | null;
  is_active: boolean;
  is_system: boolean;
}

export interface PBXPulsSqlRole {
  id: number;
  role_key: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

export interface PBXPulsSqlPermission {
  permission_key: string;
  name: string;
  category: string | null;
}

export interface PBXPulsAuthSnapshot {
  user: PBXPulsSqlUser | null;
  roles: PBXPulsSqlRole[];
  permissions: PBXPulsSqlPermission[];
}

export interface PBXPulsLegacySqlUserComparison {
  username: string;
  legacyExists: boolean;
  sqlExists: boolean;
  rolesMatch: boolean;
  permissionsCountLegacy: number;
  permissionsCountSql: number;
  passwordHashPresentLegacy: boolean;
  passwordHashPresentSql: boolean;
}

interface PBXPulsSqlUserRow {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  password_hash: string | null;
  is_active: number | boolean;
  is_system: number | boolean;
}

interface PBXPulsSqlRoleRow {
  id: number;
  role_key: string;
  name: string;
  description: string | null;
  is_system: number | boolean;
}

interface PBXPulsSqlPermissionRow {
  permission_key: string;
  name: string;
  category: string | null;
}

const LEGACY_DB_PATH = path.join(process.cwd(), 'data', 'db.json');

export async function getPBXPulsUser(username: string): Promise<PBXPulsSqlUser | null> {
  const normalizedUsername = normalizeText(username, 100);
  if (!normalizedUsername) return null;

  try {
    if (!(await isPBXPulsDbAvailable())) return null;

    const rows = await queryPBXPulsDb(
      `SELECT id, username, display_name, email, password_hash, is_active, is_system
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [normalizedUsername]
    );
    const row = rows[0] as PBXPulsSqlUserRow | undefined;
    return row ? mapUserRow(row) : null;
  } catch (error: any) {
    warnAuthDbLayer('user read failed', error);
    return null;
  }
}

export async function getPBXPulsRoles(): Promise<PBXPulsSqlRole[]> {
  try {
    if (!(await isPBXPulsDbAvailable())) return [];

    const rows = await queryPBXPulsDb(
      `SELECT id, role_key, name, description, is_system
       FROM roles
       ORDER BY role_key ASC`,
      []
    );
    return (rows as PBXPulsSqlRoleRow[]).map(mapRoleRow);
  } catch (error: any) {
    warnAuthDbLayer('roles read failed', error);
    return [];
  }
}

export async function getPBXPulsUserRoles(userId: number): Promise<PBXPulsSqlRole[]> {
  const normalizedUserId = normalizeId(userId);
  if (normalizedUserId === null) return [];

  try {
    if (!(await isPBXPulsDbAvailable())) return [];

    const rows = await queryPBXPulsDb(
      `SELECT r.id, r.role_key, r.name, r.description, r.is_system
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.role_key ASC`,
      [normalizedUserId]
    );
    return (rows as PBXPulsSqlRoleRow[]).map(mapRoleRow);
  } catch (error: any) {
    warnAuthDbLayer('user roles read failed', error);
    return [];
  }
}

export async function getPBXPulsUserPermissions(userId: number): Promise<PBXPulsSqlPermission[]> {
  const normalizedUserId = normalizeId(userId);
  if (normalizedUserId === null) return [];

  try {
    if (!(await isPBXPulsDbAvailable())) return [];

    const rows = await queryPBXPulsDb(
      `SELECT DISTINCT p.permission_key, p.name, p.category
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ?
       ORDER BY p.permission_key ASC`,
      [normalizedUserId]
    );
    return (rows as PBXPulsSqlPermissionRow[]).map(mapPermissionRow);
  } catch (error: any) {
    warnAuthDbLayer('user permissions read failed', error);
    return [];
  }
}

export async function getPBXPulsAuthSnapshot(username: string): Promise<PBXPulsAuthSnapshot> {
  const user = await getPBXPulsUser(username);
  if (!user) {
    return {
      user: null,
      roles: [],
      permissions: []
    };
  }

  const [roles, permissions] = await Promise.all([
    getPBXPulsUserRoles(user.id),
    getPBXPulsUserPermissions(user.id)
  ]);

  return {
    user,
    roles,
    permissions
  };
}

export async function compareLegacyUserWithSql(username: string): Promise<PBXPulsLegacySqlUserComparison> {
  const normalizedUsername = normalizeText(username, 100);
  const legacyDb = readLegacyDb();
  const legacyUser = findLegacyUser(legacyDb, normalizedUsername);
  const snapshot = await getPBXPulsAuthSnapshot(normalizedUsername);
  const legacyPermissions = collectLegacyEffectivePermissions(legacyDb, legacyUser);
  const legacyRoleKey = normalizeText(legacyUser?.role, 100);
  const sqlRoleKeys = snapshot.roles.map((role) => role.role_key).sort();

  return {
    username: normalizedUsername,
    legacyExists: !!legacyUser,
    sqlExists: !!snapshot.user,
    rolesMatch: !!legacyRoleKey && sqlRoleKeys.length === 1 && sqlRoleKeys[0] === legacyRoleKey,
    permissionsCountLegacy: legacyPermissions.size,
    permissionsCountSql: snapshot.permissions.length,
    passwordHashPresentLegacy: typeof legacyUser?.passwordHash === 'string' && legacyUser.passwordHash.length > 0,
    passwordHashPresentSql: typeof snapshot.user?.password_hash === 'string' && snapshot.user.password_hash.length > 0
  };
}

function readLegacyDb(): any | null {
  try {
    if (!fs.existsSync(LEGACY_DB_PATH)) return null;
    return JSON.parse(fs.readFileSync(LEGACY_DB_PATH, 'utf8'));
  } catch (error: any) {
    console.warn('[PBXPULS_AUTH_DB] legacy db read failed:', sanitizePBXPulsDbError(error));
    return null;
  }
}

function findLegacyUser(legacyDb: any, username: string): any | null {
  const users = Array.isArray(legacyDb?.users) ? legacyDb.users : [];
  const normalizedUsername = String(username || '').toLowerCase();
  return users.find((user: any) => String(user?.username || '').toLowerCase() === normalizedUsername) || null;
}

function collectLegacyEffectivePermissions(legacyDb: any, legacyUser: any): Set<string> {
  const permissions = new Set<string>();
  if (!legacyUser) return permissions;

  const roles = Array.isArray(legacyDb?.roles) ? legacyDb.roles : [];
  const role = roles.find((item: any) => String(item?.id || '') === String(legacyUser.role || ''));
  collectEnabledPermissionKeys(role?.permissions, permissions);
  collectEnabledPermissionKeys(legacyUser.permissions, permissions);
  return permissions;
}

function collectEnabledPermissionKeys(source: any, target: Set<string>): void {
  if (!source || typeof source !== 'object') return;
  for (const [permissionKey, enabled] of Object.entries(source)) {
    if (enabled === true) {
      const normalizedKey = normalizeText(permissionKey, 191);
      if (normalizedKey) target.add(normalizedKey);
    }
  }
}

function mapUserRow(row: PBXPulsSqlUserRow): PBXPulsSqlUser {
  return {
    id: Number(row.id),
    username: String(row.username || ''),
    display_name: nullableText(row.display_name),
    email: nullableText(row.email),
    password_hash: nullableText(row.password_hash),
    is_active: normalizeBoolean(row.is_active),
    is_system: normalizeBoolean(row.is_system)
  };
}

function mapRoleRow(row: PBXPulsSqlRoleRow): PBXPulsSqlRole {
  return {
    id: Number(row.id),
    role_key: String(row.role_key || ''),
    name: String(row.name || ''),
    description: nullableText(row.description),
    is_system: normalizeBoolean(row.is_system)
  };
}

function mapPermissionRow(row: PBXPulsSqlPermissionRow): PBXPulsSqlPermission {
  return {
    permission_key: String(row.permission_key || ''),
    name: String(row.name || ''),
    category: nullableText(row.category)
  };
}

function normalizeId(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) return null;
  return numericValue;
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function nullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function warnAuthDbLayer(action: string, error: any): void {
  console.warn('[PBXPULS_AUTH_DB]', action, sanitizePBXPulsDbError(error));
}
