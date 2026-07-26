import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import {
  buildDirectoryPhoneSearchPlan,
  bulkLookupDirectoryPhonesSql,
  getDirectoryPerformanceCacheStats,
  invalidateDirectoryPerformanceCaches,
  listDirectoryContactsSql,
  lookupDirectoryPhoneSql,
  normalizeDirectoryLookupPhone,
} from '../server/directoryPerformance.js';
import { queryPBXPulsDb } from '../server/pbxpulsDb.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const internalAccess = { privileged: true, userId: 'performance-test', internal: true };
const percentile = (values: number[], fraction: number) =>
  values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))];

async function timed<T>(runs: number, fn: () => Promise<T>) {
  const times: number[] = [];
  let value!: T;
  for (let index = 0; index < runs; index++) {
    const started = performance.now();
    value = await fn();
    times.push(Number((performance.now() - started).toFixed(2)));
  }
  return { value, p50: percentile(times, 0.5), p95: percentile(times, 0.95), max: Math.max(...times) };
}

async function main() {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  const apiSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  const directoryApiSource = fs.readFileSync(path.join(process.cwd(), 'src/modules/directory/services/directoryApi.ts'), 'utf8');
  const importSource = fs.readFileSync(path.join(process.cwd(), 'server/directoryImportJobs.ts'), 'utf8');
  const lookupBody = appSource.match(/const loadDirectoryLookup = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
  assert(!lookupBody.includes('fetchDirectoryAll'), 'initial lookup must not request all=true');
  assert(apiSource.includes("app.get('/api/directory/contacts'"), 'paginated endpoint is missing');
  assert(apiSource.includes("app.get('/api/directory',"), 'compatibility endpoint is missing');
  assert(apiSource.includes('search: req.query.q || req.query.search'), 'backend must preserve q/search compatibility');
  assert(directoryApiSource.includes("'/api/directory/contacts'"), 'frontend must use the SQL list endpoint');
  assert(directoryApiSource.includes('params.set(key, String(value))'), 'query parameters must be URL encoded');
  assert(appSource.includes('directoryListAbortRef.current !== controller'), 'stale directory requests must not replace newer results');
  assert.equal((apiSource.match(/await enrichCallsWithDirectoryBulk\(calls, localDb, req\)/g) || []).length >= 2, true);
  assert(importSource.includes("invalidateDirectoryPerformanceCaches('import_completed')"));
  assert(importSource.includes("invalidateDirectoryPerformanceCaches('import_rollback')"));

  const countRows = await queryPBXPulsDb('SELECT COUNT(*) count FROM directory_contacts');
  const actualCount = Number(countRows[0]?.count || 0);
  assert.equal(actualCount, 100000, 'read-only benchmark expects the current 100000-contact database');

  const rssBeforePage = process.memoryUsage().rss;
  invalidateDirectoryPerformanceCaches('test_start');
  await listDirectoryContactsSql({ page: 1, pageSize: 50 }, internalAccess);
  const firstPage = await timed(30, () => listDirectoryContactsSql({ page: 1, pageSize: 50 }, internalAccess));
  const rssPageDeltaBytes = Math.max(0, process.memoryUsage().rss - rssBeforePage);
  assert.equal(firstPage.value.items.length, 50);
  assert.equal(firstPage.value.totalCount, 100000);
  assert.equal(firstPage.value.totalPages, 2000);
  assert(firstPage.value.metrics.sql_query_count <= 3);
  const pageResponseBytes = Buffer.byteLength(JSON.stringify(firstPage.value));
  assert(pageResponseBytes < 250_000, `page response is unexpectedly large: ${pageResponseBytes}`);

  const page100 = await listDirectoryContactsSql({ page: 1, pageSize: 100 }, internalAccess);
  assert.equal(page100.items.length, 100);
  assert.equal(page100.metrics.sql_query_count, firstPage.value.metrics.sql_query_count);
  const cappedPage = await listDirectoryContactsSql({ page: 1, pageSize: 501 }, internalAccess);
  assert.equal(cappedPage.pageSize, 500);
  assert.equal(cappedPage.items.length, 500);
  const samplePhones = (await queryPBXPulsDb(
    `SELECT phone FROM directory_contacts WHERE phone_normalized<>'' ORDER BY id LIMIT 100`
  )).map(row => row.phone);
  assert(samplePhones.length > 0);

  const normalizedA = normalizeDirectoryLookupPhone('+7 978 123-45-67');
  const normalizedB = normalizeDirectoryLookupPhone('8 (978) 123-45-67');
  assert.equal(normalizedA.canonical, normalizedB.canonical);
  assert.equal(buildDirectoryPhoneSearchPlan('7978')?.mode, 'prefix');
  assert.equal(buildDirectoryPhoneSearchPlan('24042')?.mode, 'prefix_suffix');
  assert.equal(buildDirectoryPhoneSearchPlan(samplePhones[0])?.mode, 'exact');

  for (const query of ['7978', '+7978', '978']) {
    const result = await listDirectoryContactsSql({ page: 1, pageSize: 50, search: query }, internalAccess);
    assert.equal(result.totalCount, 100000, `${query} must match all current fixture contacts`);
    assert.equal(result.items.length, 50);
  }

  const sampleDigits = normalizeDirectoryLookupPhone(samplePhones[0]).canonical;
  const exactQueries = [
    samplePhones[0],
    sampleDigits,
    sampleDigits.slice(-10),
    `+${sampleDigits.slice(0, 1)} (${sampleDigits.slice(1, 4)}) ${sampleDigits.slice(4, 7)}-${sampleDigits.slice(7, 9)}-${sampleDigits.slice(9)}`
  ];
  for (const query of exactQueries) {
    const result = await listDirectoryContactsSql({ page: 1, pageSize: 50, search: query }, internalAccess);
    assert.equal(result.totalCount, 1, `${query} must use exact normalized phone search`);
    assert.equal(result.items.length, 1);
  }

  const suffix = sampleDigits.slice(-5);
  const suffixExpected = Number((await queryPBXPulsDb(
    'SELECT COUNT(*) count FROM directory_contacts WHERE phone_normalized LIKE ?',
    [`%${suffix}`]
  ))[0]?.count || 0);
  const suffixResult = await listDirectoryContactsSql({ page: 1, pageSize: 50, search: suffix }, internalAccess);
  assert.equal(suffixResult.totalCount, suffixExpected);
  assert.equal(suffixResult.items.length, Math.min(50, suffixExpected));

  const sharedPhonePrefix = await listDirectoryContactsSql(
    { page: 1, pageSize: 50, search: '7978', visibility: 'shared' },
    { privileged: true, userId: 'admin' }
  );
  assert.equal(sharedPhonePrefix.totalCount, 100000);

  invalidateDirectoryPerformanceCaches('lookup_test');
  const exact = await timed(30, async () => {
    invalidateDirectoryPerformanceCaches('uncached_lookup_sample');
    return lookupDirectoryPhoneSql(samplePhones[0], internalAccess);
  });
  assert(exact.value.matched);
  const cached = await lookupDirectoryPhoneSql(samplePhones[0], internalAccess);
  assert.equal(cached.cache, 'hit');
  const generationBefore = getDirectoryPerformanceCacheStats().lookupGeneration;
  invalidateDirectoryPerformanceCaches('generation_test');
  assert.equal(getDirectoryPerformanceCacheStats().lookupGeneration, generationBefore + 1);

  const bulk = await timed(30, () => bulkLookupDirectoryPhonesSql(samplePhones, internalAccess, 100));
  assert.equal(bulk.value.sqlQueryCount, 1);
  assert.equal(bulk.value.requested, 100);

  const explain = await queryPBXPulsDb(
    `EXPLAIN SELECT id FROM directory_contacts WHERE phone_normalized=? LIMIT 1`,
    [normalizeDirectoryLookupPhone(samplePhones[0]).canonical]
  );
  assert(String(explain[0]?.key || '').includes('phone_normalized'), 'exact lookup must use phone_normalized index');

  const searchSeed = String(firstPage.value.items[0]?.name || '').trim().slice(0, 3);
  if (searchSeed.length >= 2) {
    const searched = await listDirectoryContactsSql({ page: 1, pageSize: 25, search: searchSeed, sortBy: 'name', sortDirection: 'asc' }, internalAccess);
    assert(searched.items.length <= 25);
    assert(searched.totalCount >= searched.items.length);
  }
  const companySeed = String(firstPage.value.items[0]?.company || '').trim().slice(0, 3);
  if (companySeed.length >= 2) {
    const searched = await listDirectoryContactsSql({ page: 1, pageSize: 25, search: companySeed }, internalAccess);
    assert(searched.items.length <= 25);
    assert(searched.totalCount >= searched.items.length);
  }
  const shared = await listDirectoryContactsSql({ page: 1, pageSize: 25, visibility: 'shared' }, internalAccess);
  assert(shared.items.length <= 25);

  console.log(JSON.stringify({
    contacts: actualCount,
    firstPage: { pageSize: 50, totalCount: firstPage.value.totalCount, totalPages: firstPage.value.totalPages, p50Ms: firstPage.p50, p95Ms: firstPage.p95, maxMs: firstPage.max, responseBytes: pageResponseBytes, rssDeltaBytes: rssPageDeltaBytes, sqlQueries: firstPage.value.metrics.sql_query_count },
    phoneLookup: { p50Ms: exact.p50, p95Ms: exact.p95, maxMs: exact.max, indexedBy: explain[0]?.key || null },
    bulkLookup100: { p50Ms: bulk.p50, p95Ms: bulk.p95, maxMs: bulk.max, sqlQueries: bulk.value.sqlQueryCount, matched: bulk.value.matched },
    cache: getDirectoryPerformanceCacheStats(),
    automaticAllRequest: false,
    cdrBulkEnrichment: true,
  }, null, 2));
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
