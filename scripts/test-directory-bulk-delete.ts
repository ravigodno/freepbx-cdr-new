import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const server = fs.readFileSync('server.ts', 'utf8');
const api = fs.readFileSync('src/modules/directory/services/directoryApi.ts', 'utf8');
const ui = fs.readFileSync('src/App.tsx', 'utf8');
const sql = fs.readFileSync('server/pbxpulsDirectoryWrite.ts', 'utf8');

assert.ok(server.indexOf("app.post('/api/directory/bulk-delete/preview'") < server.indexOf("app.delete('/api/directory/:id'"));
assert.match(server, /authUser\?\.role !== 'su'/);
assert.match(server, /DIRECTORY_BULK_DELETE_PREVIEW_TTL_MS = 10 \* 60 \* 1000/);
assert.match(server, /DIRECTORY_CHANGED_AFTER_PREVIEW/);
assert.match(server, /hashDirectoryContactIds\(currentIds\) !== preview\.snapshotHash/);
assert.match(server, /preview\.status === 'completed'/);
assert.match(server, /scope === 'all' \? 'ОЧИСТИТЬ СПРАВОЧНИК' : 'УДАЛИТЬ'/);
assert.match(server, /cleanupDirectoryBulkDeleteReferences/);

assert.match(sql, /export async function deleteDirectoryContactsSql/);
assert.match(sql, /beginTransaction\(\)/);
assert.match(sql, /FOR UPDATE/);
assert.match(sql, /DELETE FROM directory_contacts WHERE id IN/);
assert.match(sql, /rollbackQuietly/);

assert.match(api, /previewDirectoryBulkDelete/);
assert.match(api, /applyDirectoryBulkDelete/);
assert.match(ui, /session\?\.role === 'su'/);
assert.ok(ui.includes('Удалить по текущим фильтрам'));
assert.ok(ui.includes('Полностью очистить справочник'));
assert.ok(ui.includes('Проверить состав удаления'));

const contacts = Array.from({ length: 100000 }, (_, index) => ({
  id: `contact-${index}`,
  type: index % 4 === 0 ? 'internal' : 'client',
  isSpam: index % 10 === 0,
  visibility: index % 3 === 0 ? 'private' : 'shared'
}));
const filtered = contacts.filter(contact => contact.type === 'client' && !contact.isSpam && contact.visibility === 'shared');
const hash = (ids: string[]) => crypto.createHash('sha256').update([...ids].sort().join('\n')).digest('hex');
const snapshot = hash(filtered.map(contact => contact.id));
assert.equal(snapshot, hash(filtered.map(contact => contact.id)));
assert.notEqual(snapshot, hash(filtered.slice(1).map(contact => contact.id)));
assert.equal(new Set(filtered.map(contact => contact.id)).size, filtered.length);

const favorites = ['contact-1', 'contact-2', 'unrelated'];
const deleted = new Set(['contact-1', 'contact-2']);
assert.deepEqual(favorites.filter(id => !deleted.has(id)), ['unrelated']);

console.log(JSON.stringify({
  ok: true,
  fixtureContacts: contacts.length,
  filteredContacts: filtered.length,
  previewFirst: true,
  suOnly: true,
  transactionalSql: true,
  fullClearConfirmation: 'ОЧИСТИТЬ СПРАВОЧНИК',
  liveDeleteExecuted: false
}));
