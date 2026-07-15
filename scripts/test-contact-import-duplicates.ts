import assert from 'node:assert/strict';
import { findContactImportDuplicate, getContactImportDuplicateWarning } from '../server/contactImportDuplicate.js';

const normalize = (value: any) => value;
const existing = [
  { name: 'Общий', number: '+7 (999) 111-22-33', email: 'shared@example.test', visibility: 'shared' },
  { name: 'Личный', number: '200', visibility: 'private', ownerUserId: 'user-1' },
  { name: 'Чужой', number: '300', visibility: 'private', ownerUserId: 'user-2' },
  { name: 'Иван Иванов', company: 'Компания', number: '400', visibility: 'shared' }
];

assert.equal(findContactImportDuplicate({ number: '79991112233' }, existing, 'user-1', normalize)?.reason, 'phone');
assert.equal(findContactImportDuplicate({ email: ' SHARED@example.test ' }, existing, 'user-1', normalize)?.reason, 'email');
assert.equal(findContactImportDuplicate({ name: 'иван иванов', company: 'КОМПАНИЯ' }, existing, 'user-1', normalize)?.reason, 'name_organization');
assert.equal(findContactImportDuplicate({ number: '200' }, existing, 'user-1', normalize)?.reason, 'phone');
assert.equal(findContactImportDuplicate({ number: '300' }, existing, 'user-1', normalize), null);
assert.equal(findContactImportDuplicate({ name: 'Иван Иванов', company: '' }, existing, 'user-1', normalize), null);
assert.match(getContactImportDuplicateWarning('phone'), /телефон/);

console.log('contact import duplicate tests: OK');
