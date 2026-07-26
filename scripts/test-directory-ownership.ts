import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyDirectoryResponsibleOptionsForTest,
  buildDirectoryResponsiblePreview,
  parseDirectoryImportRowsForTest
} from '../server/directoryImportJobs.js';
import {
  canReadDirectoryContact,
  resolveDirectoryResponsibleUser
} from '../server/directoryOwnership.js';

const viewer = { role: 'operator' };
assert.equal(canReadDirectoryContact({ visibility: 'shared' }, viewer, 'u1'), true);
assert.equal(canReadDirectoryContact({ visibility: 'shared', responsibleUserId: 'u47' }, viewer, 'u1'), true);
assert.equal(canReadDirectoryContact({ visibility: 'private', ownerUserId: 'u1' }, viewer, 'u1'), true);
assert.equal(canReadDirectoryContact({ visibility: 'private', ownerUserId: 'u1' }, viewer, 'u2'), false);
assert.equal(canReadDirectoryContact({ visibility: 'private', ownerUserId: 'u1' }, { role: 'admin' }, 'u2'), true);
assert.equal(canReadDirectoryContact({ visibility: 'private', ownerUserId: 'u1' }, { role: 'su' }, 'u2'), true);

const users = [
  { id: 'u1', username: 'admin', disabled: false, tenantId: 't1' },
  { id: 'u2', username: 'operator', disabled: true, tenantId: 't1' },
  { id: 'u3', username: 'foreign', disabled: false, tenantId: 't2' }
];
assert.equal(resolveDirectoryResponsibleUser('', users).status, 'empty');
assert.equal(resolveDirectoryResponsibleUser('u1', users, 't1').status, 'active');
assert.equal(resolveDirectoryResponsibleUser('u2', users, 't1').status, 'disabled');
assert.equal(resolveDirectoryResponsibleUser('u3', users, 't1').status, 'other_tenant');
assert.equal(resolveDirectoryResponsibleUser('u47', users, 't1').status, 'unknown');

const parsed = parseDirectoryImportRowsForTest([
  'fullName,phone,visibility,responsibleUserId',
  'Shared A,100,shared,u47',
  'Shared B,101,shared,u1',
  'Private A,102,private,u2',
  'No owner,103,shared,'
].join('\n'));
const preview = buildDirectoryResponsiblePreview(parsed, users, {
  unknownResponsibleStrategy: 'clear',
  responsibleUserMappings: {},
  corporateImport: true
});
assert.equal(preview.sharedContacts, 3);
assert.equal(preview.privateContacts, 1);
assert.equal(preview.withResponsible, 3);
assert.equal(preview.withoutResponsible, 1);
assert.equal(preview.unknownResponsibleRows, 2);

const corporate = applyDirectoryResponsibleOptionsForTest(parsed, users, {
  unknownResponsibleStrategy: 'clear',
  responsibleUserMappings: {},
  corporateImport: true
});
assert.equal(corporate.errors.length, 0);
assert.ok(corporate.rows.every(row => row.visibility === 'shared'));
assert.ok(corporate.rows.every(row => row.ownerUserId === null));
assert.ok(corporate.rows.every(row => row.responsibleUserId === ''));

const skipped = applyDirectoryResponsibleOptionsForTest(parseDirectoryImportRowsForTest([
  'fullName,phone,visibility,responsibleUserId',
  'Unknown,100,shared,u47',
  'Known,101,shared,u1'
].join('\n')), users, {
  unknownResponsibleStrategy: 'skip',
  responsibleUserMappings: {},
  corporateImport: true
});
assert.equal(skipped.rows.length, 1);
assert.equal(skipped.errors[0]?.code, 'RESPONSIBLE_SKIPPED');

const importSource = fs.readFileSync(new URL('../server/directoryImportJobs.ts', import.meta.url), 'utf8');
assert.match(importSource, /DELETE FROM directory_contacts WHERE import_job_id=\?/);
assert.doesNotMatch(importSource, /DELETE FROM directory_contacts WHERE responsible/);
console.log('directory ownership tests: OK');
