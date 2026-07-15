export function hasFullDirectoryEditPermission(authUser: any): boolean {
  return authUser?.role === 'su' || authUser?.permissions?.edit_directory === true;
}

export function hasOwnDirectoryEditPermission(authUser: any): boolean {
  return authUser?.permissions?.edit_own_directory_contacts === true;
}

export function canEditDirectoryContactByOwner(entry: any, authUser: any, currentUserId: string): boolean {
  if (hasFullDirectoryEditPermission(authUser)) return true;
  if (!hasOwnDirectoryEditPermission(authUser)) return false;
  return String(entry?.visibility || '') === 'private'
    && !!String(entry?.ownerUserId || '')
    && String(entry.ownerUserId) === String(currentUserId || '');
}
