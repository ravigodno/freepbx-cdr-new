import assert from 'node:assert/strict';
import { canEditDirectoryContactByOwner } from '../server/directoryContactAccess.js';

const ownOnly = { role: 'operator', permissions: { edit_own_directory_contacts: true } };
const full = { role: 'manager', permissions: { edit_directory: true } };
const none = { role: 'operator', permissions: {} };

assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, ownOnly, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, ownOnly, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared', ownerUserId: null }, ownOnly, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, full, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'shared' }, full, 'u1'), true);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u1' }, none, 'u1'), false);
assert.equal(canEditDirectoryContactByOwner({ visibility: 'private', ownerUserId: 'u2' }, { role: 'su' }, 'u1'), true);

console.log('directory own-contact permission tests: OK');
