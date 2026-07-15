export function hasFullDirectoryEditPermission(authUser: any): boolean {
  return authUser?.role === 'su' || authUser?.permissions?.edit_directory === true;
}

export function hasOwnDirectoryEditPermission(authUser: any): boolean {
  return authUser?.permissions?.edit_own_directory_contacts === true;
}

export function isOwnDirectoryEditRestricted(authUser: any): boolean {
  return authUser?.role !== 'su' && hasOwnDirectoryEditPermission(authUser);
}

export function restrictDirectoryContactInputToOwner(input: any, authUser: any, currentUserId: string): any {
  if (!isOwnDirectoryEditRestricted(authUser)) return input;
  return {
    ...input,
    visibility: 'private',
    contact_type: 'personal',
    ownerUserId: currentUserId,
    responsibleUserId: currentUserId
  };
}

export function canEditDirectoryContactByOwner(entry: any, authUser: any, currentUserId: string): boolean {
  if (authUser?.role === 'su') return true;
  if (isOwnDirectoryEditRestricted(authUser)) {
    return String(entry?.visibility || '') === 'private'
      && !!String(entry?.ownerUserId || '')
      && String(entry.ownerUserId) === String(currentUserId || '');
  }
  return hasFullDirectoryEditPermission(authUser);
}
