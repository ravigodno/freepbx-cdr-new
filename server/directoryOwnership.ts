export type DirectoryUnknownResponsibleStrategy = 'clear' | 'skip' | 'map';

export interface DirectoryResponsibleUser {
  id?: string | number | null;
  username?: string | null;
  externalId?: string | null;
  disabled?: boolean | null;
  active?: boolean | null;
  tenantId?: string | number | null;
}

export interface DirectoryResponsibleResolution {
  status: 'empty' | 'active' | 'disabled' | 'unknown' | 'other_tenant';
  userId: string | null;
}

const text = (value: unknown): string => String(value ?? '').trim();

export function isDirectoryPrivilegedReader(authUser: any): boolean {
  return authUser?.role === 'su' || authUser?.role === 'admin';
}

export function canReadDirectoryContact(entry: any, authUser: any, currentUserId: string): boolean {
  if (String(entry?.visibility || '').toLowerCase() !== 'private') return true;
  if (isDirectoryPrivilegedReader(authUser)) return true;
  return !!text(entry?.ownerUserId) && text(entry.ownerUserId) === text(currentUserId);
}

export function resolveDirectoryResponsibleUser(
  rawIdentifier: unknown,
  users: DirectoryResponsibleUser[],
  tenantId?: string | number | null
): DirectoryResponsibleResolution {
  const identifier = text(rawIdentifier);
  if (!identifier) return { status: 'empty', userId: null };
  const normalized = identifier.toLowerCase();
  const user = users.find(item => [item.id, item.username, item.externalId]
    .map(value => text(value).toLowerCase())
    .filter(Boolean)
    .includes(normalized));
  if (!user) return { status: 'unknown', userId: null };
  if (tenantId != null && user.tenantId != null && text(user.tenantId) !== text(tenantId)) {
    return { status: 'other_tenant', userId: text(user.id) || null };
  }
  if (user.disabled === true || user.active === false) {
    return { status: 'disabled', userId: text(user.id) || null };
  }
  return { status: 'active', userId: text(user.id) || identifier };
}
