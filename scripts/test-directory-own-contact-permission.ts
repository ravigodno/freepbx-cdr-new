import assert from 'node:assert/strict';
import {
  canEditDirectoryContactByOwner,
  isOwnDirectoryEditRestricted,
  restrictDirectoryContactInputToOwner
} from '../server/directoryContactAccess.js';

const ownOnly = { role: 'operator', permissions: { edit_own_directory_contacts: true } };
const full = { role: 'manager', permissions: { edit_directory: true } };
const fullWithOwnOnlyRestriction = { role: 'manager', permissions: { edit_directory: true, edit_own_directory_contacts: true } };
const none = { role: 'operator', permissions: {} };

assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, ownOnly, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, ownOnly, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared', ownerUserId: null }, ownOnly, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, full, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared' }, full, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, fullWithOwnOnlyRestriction, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, fullWithOwnOnlyRestriction, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared' }, fullWithOwnOnlyRestriction, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, none, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, { role: 'su' }, 'u1'), true);
assert.equal(isOwnDirectoryEditRestricted(ownOnly), true);
assert.equal(isOwnDirectoryEditRestricted(fullWithOwnOnlyRestriction), true);
assert.equal(isOwnDirectoryEditRestricted(full), false);
assert.equal(isOwnDirectoryEditRestricted({ role: 'su', permissions: { edit_own_directory_contacts: true } }), false);
assert.deepEqual(
  restrictDirectoryContactInputToOwner({ name: 'Owned', visibility: 'shared', ownerUserId: 'u2', responsibleUserId: '' }, fullWithOwnOnlyRestriction, 'u1'),
  { name: 'Owned', visibility: 'private', contact_type: 'personal', ownerUserId: 'u1', responsibleUserId: 'u1' }
);
assert.deepEqual(
  restrictDirectoryContactInputToOwner({ name: 'Shared', visibility: 'shared' }, full, 'u1'),
  { name: 'Shared', visibility: 'shared' }
);

console.log('directory own-contact permission tests: OK');
