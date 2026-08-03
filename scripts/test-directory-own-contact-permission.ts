import assert from 'node:assert/strict';
import {
  assignManualDirectoryResponsibleUser,
  canEditDirectoryContactByOwner,
  isOwnDirectoryEditRestricted,
  restrictDirectoryContactInputToOwner
} from '../server/directoryContactAccess.js';
import { loadDirectorySingleContact } from '../server/directorySingleContact.js';

const ownOnly = { role: 'operator', permissions: { edit_own_directory_contacts: true } };
const full = { role: 'manager', permissions: { edit_directory: true } };
const fullAndOwn = { role: 'manager', permissions: { edit_directory: true, edit_own_directory_contacts: true } };
const none = { role: 'operator', permissions: {} };

assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, ownOnly, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, ownOnly, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared', ownerUserId: null }, ownOnly, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, full, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared' }, full, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, fullAndOwn, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, fullAndOwn, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared' }, fullAndOwn, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, none, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, { role: 'su' }, 'u1'), true);
assert.equal(isOwnDirectoryEditRestricted(ownOnly), true);
assert.equal(isOwnDirectoryEditRestricted(fullAndOwn), false);
assert.equal(isOwnDirectoryEditRestricted(full), false);
assert.equal(isOwnDirectoryEditRestricted({ role: 'su', permissions: { edit_own_directory_contacts: true } }), false);
assert.deepEqual(
  restrictDirectoryContactInputToOwner({ name: 'Owned', visibility: 'shared', ownerUserId: 'u2', responsibleUserId: '' }, fullAndOwn, 'u1'),
  { name: 'Owned', visibility: 'shared', ownerUserId: 'u2', responsibleUserId: '' }
);
assert.deepEqual(
  restrictDirectoryContactInputToOwner({ name: 'Shared', visibility: 'shared' }, full, 'u1'),
  { name: 'Shared', visibility: 'shared' }
);
assert.deepEqual(assignManualDirectoryResponsibleUser({ name: 'Manual' }, 'u0'), { name: 'Manual', responsibleUserId: 'u0' });
assert.deepEqual(assignManualDirectoryResponsibleUser({ name: 'Assigned', responsibleUserId: 'u2' }, 'u0'), { name: 'Assigned', responsibleUserId: 'u2' });

const legacyContact = { id: 'legacy-1', visibility: 'shared' };
assert.equal(await loadDirectorySingleContact({
  mode: 'legacy', id: 'legacy-1', legacyContacts: [legacyContact], loadSql: async () => null, canReadLegacy: () => true
}), legacyContact);
assert.equal(await loadDirectorySingleContact({
  mode: 'legacy', id: 'legacy-1', legacyContacts: [legacyContact], loadSql: async () => legacyContact, canReadLegacy: () => false
}), null);
const sqlContact = { id: 'sql-1', visibility: 'shared' };
assert.equal(await loadDirectorySingleContact({
  mode: 'sql', id: 'sql-1', legacyContacts: [], loadSql: async () => sqlContact, canReadLegacy: () => false
}), sqlContact);

console.log('directory own-contact permission tests: OK');
