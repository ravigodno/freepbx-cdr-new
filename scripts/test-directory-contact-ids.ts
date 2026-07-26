import assert from 'node:assert/strict';
import { createDirectoryContactId, createUniqueDirectoryContactId } from '../server/directoryContactIds.js';
import fs from 'node:fs';

const ids = new Set<string>();
for (let index = 0; index < 1_000_000; index++) ids.add(createDirectoryContactId());
assert.equal(ids.size, 1_000_000, 'one million generated IDs must be unique');

const parallel = await Promise.all(Array.from({ length: 20_000 }, async () => createDirectoryContactId()));
assert.equal(new Set(parallel).size, parallel.length, 'parallel generation must be unique');

let attempts = 0;
const retried = await createUniqueDirectoryContactId(
  async id => id === 'dir_collision',
  () => (++attempts < 3 ? 'dir_collision' : 'dir_after_retry'),
  4
);
assert.equal(retried, 'dir_after_retry');

const serverSource = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const urlSyncWriter = serverSource.match(/const writeDirectoryImportedEntries[\s\S]*?const fetchTextFromUrl/)?.[0] || '';
if (!urlSyncWriter.includes('const byPhone = new Map<string, any>()')) throw new Error('URL sync must index existing contacts by phone');
if (!urlSyncWriter.includes('const byEmail = new Map<string, any>()')) throw new Error('URL sync must index existing contacts by email');
if (!urlSyncWriter.includes('createUniqueDirectoryContactId')) throw new Error('URL sync must allocate collision-safe server IDs');
if (!urlSyncWriter.includes('const newEntry = { ...entry, id: contactId }')) throw new Error('URL sync must not trust source primary keys');
if (!urlSyncWriter.includes('listDirectoryContactsForSyncSql')) throw new Error('SQL URL sync must not use the 10000-row runtime snapshot');
if (!urlSyncWriter.includes('directorySyncEntriesEqual')) throw new Error('URL sync must skip unchanged contacts');
if (!urlSyncWriter.includes('duplicate?.importRowFingerprint === entry._sourceFingerprint')) throw new Error('URL sync must skip rows with unchanged import fingerprints');
if (!serverSource.includes('parseDirectoryImportRows(text)')) throw new Error('URL CSV sync must use the same parser and fingerprints as company import');
if (!urlSyncWriter.includes('let duplicate = (normalizedEmail ? byEmail.get(normalizedEmail) : null)')) throw new Error('URL sync must prefer stable email identity before a changed phone');
if (!urlSyncWriter.includes('phones: Array.from(new Set(entry.phones || []))')) throw new Error('URL sync must treat source phones as authoritative');
if (!urlSyncWriter.includes("phone2: entry.phones?.[1] || ''")) throw new Error('URL sync must clear a secondary phone missing from the source');
if (!urlSyncWriter.includes('SELECT id,phone_normalized AS phone,email,import_row_fingerprint')) throw new Error('URL sync must recheck SQL identity immediately before insert');
if (!urlSyncWriter.includes("if (mode === 'append')")) throw new Error('URL append mode must skip existing identities instead of creating duplicates');
if (!serverSource.includes('DIRECTORY_URL_SYNC_IN_PROGRESS')) throw new Error('URL sync must reject concurrent runs');
assert.equal(attempts, 3);
console.log(JSON.stringify({ generated: ids.size, parallel: parallel.length, collisions: 0, retryAttempts: attempts }));
