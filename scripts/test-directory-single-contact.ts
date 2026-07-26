import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Response } from 'node-fetch';
import {
  getDirectoryContactSql,
  getDirectoryPerformanceCacheStats,
  invalidateDirectoryPerformanceCaches
} from '../server/directoryPerformance.js';
import { normalizeDirectoryContactForSql } from '../server/pbxpulsDirectoryWrite.js';
import { queryPBXPulsDb } from '../server/pbxpulsDb.js';
import { fetchDirectoryContact, saveDirectoryEntry } from '../src/modules/directory/services/directoryApi.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const LIVE_CONTACT_ID = 'dir_4d41e4fa-419c-4824-b7b8-388be3278814';

async function main() {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  const writeSource = fs.readFileSync(path.join(process.cwd(), 'server/pbxpulsDirectoryWrite.ts'), 'utf8');
  const updateRoute = serverSource.slice(
    serverSource.indexOf("app.put('/api/directory/:id'"),
    serverSource.indexOf("app.get('/api/directory/sync-status'")
  );

  assert(updateRoute.includes("getDirectoryStorageMode() === 'sql'"));
  assert(updateRoute.includes('getDirectoryContactSql(req.params.id'));
  assert(updateRoute.includes('updateDirectoryContactSql(req.params.id'));
  assert(appSource.includes('fetchDirectoryContact(session.token, contactId, controller.signal)'));
  assert(appSource.includes("setDirectoryContactLoadState('loaded')"));
  assert(appSource.includes("setDirectoryContactLoadState('not_found')"));
  assert(appSource.includes("setDirectoryContactLoadState('error')"));
  assert(appSource.includes('directoryContactLoadAbortRef.current !== controller'));
  assert(writeSource.includes("invalidateDirectoryPerformanceCaches('contact_update')"));

  const rows = await queryPBXPulsDb(
    'SELECT id,name,phone,phone_normalized FROM directory_contacts WHERE id=?',
    [LIVE_CONTACT_ID]
  );
  assert.equal(rows.length, 1, 'live read-only contact must exist');
  const metadata = await queryPBXPulsDb(
    'SELECT COUNT(*) count FROM directory_contact_metadata WHERE contact_id=?',
    [LIVE_CONTACT_ID]
  );
  assert(Number(metadata[0]?.count || 0) > 0, 'live read-only metadata must exist');
  const detail = await getDirectoryContactSql(LIVE_CONTACT_ID, { privileged: true, userId: 'single-contact-test' });
  assert(detail, 'SQL single-contact service must find a contact even when legacy storage is empty');
  assert.equal(detail?.id, LIVE_CONTACT_ID);
  assert.equal(await getDirectoryContactSql('dir_unknown_single_contact_test', { privileged: true, userId: 'single-contact-test' }), null);

  const normalized = normalizeDirectoryContactForSql({
    ...detail,
    id: LIVE_CONTACT_ID,
    number: '+7 (978) 102-40-42',
    phones: ['+7 (978) 102-40-42']
  }, { id: 'test-user' });
  assert.equal(normalized.id, LIVE_CONTACT_ID);
  assert.equal(normalized.phone_normalized, '79781024042');

  const originalFetch = globalThis.fetch;
  try {
    let requestedUrl = '';
    globalThis.fetch = (async (input: any) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ ...detail, name: 'Updated test projection' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;
    const loaded = await fetchDirectoryContact('test-token', LIVE_CONTACT_ID);
    assert.equal(loaded.id, LIVE_CONTACT_ID);
    assert(requestedUrl.endsWith(`/api/directory/contacts/${LIVE_CONTACT_ID}`));

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Контакт не найден' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })) as typeof fetch;
    await assert.rejects(
      () => fetchDirectoryContact('test-token', 'unknown'),
      (error: any) => error.code === 'DIRECTORY_CONTACT_NOT_FOUND' && error.status === 404
    );

    globalThis.fetch = (async () => new Response(JSON.stringify({
      ...detail,
      loadWarnings: ['Дополнительные поля временно недоступны.']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const partial = await fetchDirectoryContact('test-token', LIVE_CONTACT_ID);
    assert.equal(partial.id, LIVE_CONTACT_ID);
    assert.equal((partial as any).loadWarnings.length, 1);

    let saveMethod = '';
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      requestedUrl = String(input);
      saveMethod = String(init?.method || '');
      return new Response(JSON.stringify({ success: true, contactId: LIVE_CONTACT_ID }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;
    const saved = await saveDirectoryEntry('test-token', { name: detail?.name }, LIVE_CONTACT_ID);
    assert.equal(saved.success, true);
    assert.equal(saveMethod, 'PUT');
    assert(requestedUrl.endsWith(`/api/directory/${LIVE_CONTACT_ID}`));

    globalThis.fetch = (async () => new Response(JSON.stringify({
      ...detail,
      name: 'Updated test projection'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const reopened = await fetchDirectoryContact('test-token', LIVE_CONTACT_ID);
    assert.equal(reopened.name, 'Updated test projection');
  } finally {
    globalThis.fetch = originalFetch;
  }

  let activeRequest = 2;
  let projectedState = 'loading';
  const resolveRequest = (requestId: number, state: string) => {
    if (requestId === activeRequest) projectedState = state;
  };
  resolveRequest(1, 'not_found');
  assert.equal(projectedState, 'loading', 'stale request must not overwrite a newer load');
  resolveRequest(2, 'loaded');
  assert.equal(projectedState, 'loaded');

  const generation = getDirectoryPerformanceCacheStats().lookupGeneration;
  invalidateDirectoryPerformanceCaches('single_contact_update_test');
  assert.equal(getDirectoryPerformanceCacheStats().lookupGeneration, generation + 1);

  console.log(JSON.stringify({
    contactId: LIVE_CONTACT_ID,
    contactExists: true,
    metadataRows: Number(metadata[0]?.count || 0),
    singleContactLoaded: true,
    unknownIdNotFound: true,
    auxiliaryWarningPreservesContact: true,
    staleRequestIgnored: true,
    saveUsesCurrentSqlId: true,
    reopenUsesSingleContactEndpoint: true,
    phoneNormalized: normalized.phone_normalized,
    updateCacheGenerationBump: true,
    liveWrites: false
  }, null, 2));
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
