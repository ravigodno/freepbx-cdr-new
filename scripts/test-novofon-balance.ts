import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NovofonDataApiClient, NovofonProviderError, novofonV1Signature, safeNovofonMetadata } from '../server/balance/providers/novofon.js';
import { maskNovofonPhone, novofonAccountData, safeNovofonError } from '../server/balance/novofonService.js';
import { reconcileNovofonLeg } from '../server/balance/reconciliation/novofonCdrReconciliation.js';

type Call = { body: any; url: string; init: RequestInit };
const response = (payload: any, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => payload, text: async () => JSON.stringify(payload) }) as unknown as Response;
const config = (overrides: any = {}) => ({ enabled: true, authMode: 'login_password' as const, permanentToken: '', login: 'user@example.test', password: 'top-secret', apiV1Key: '', apiV1Secret: '', timeoutMs: 5000, ...overrides });

assert.equal(novofonV1Signature('/v1/info/balance/', { z: 9, alpha: 'a b' }, 'secret'), 'ZDUxMjI2ODkwYzFlODgyMmY4Y2I1ODI1YTYwMTMyNTBjYWQ0NzliZg==', 'API v1 signature must match the official Novofon client');

{
  const calls: any[] = [];
  const client = new (await import('../server/balance/providers/novofon.js')).NovofonBalanceApiClient(config({ apiV1Key: 'key', apiV1Secret: 'secret' }), { fetch: async (url, init = {}) => {
    calls.push({ url, init }); return response({ status: 'success', balance: 10, currency: 'RUB' });
  } });
  await client.getBalance();
  assert.match(calls[0].url, /\?format=json$/, 'API v1 request and signature must include format=json');
}

{
  const calls: Call[] = [];
  const client = new NovofonDataApiClient(config(), { fetch: async (url, init = {}) => {
    const body = JSON.parse(String(init.body)); calls.push({ url, init, body });
    return body.method === 'login.user' ? response({ jsonrpc: '2.0', id: body.id, result: { data: { access_token: 'session-token', expire_at: '2099-01-01 00:00:00' } } })
      : response({ jsonrpc: '2.0', id: body.id, result: { data: { app_id: 1 } } });
  } });
  await client.getAccount(); await client.getAccount();
  assert.equal(calls.filter(call => call.body.method === 'login.user').length, 1, 'one-hour session must be cached');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['id', 'jsonrpc', 'method', 'params']);
  assert.deepEqual(calls[0].body.params, { login: 'user@example.test', password: 'top-secret' }, 'login.user request must carry login credentials only to backend API');
  assert.equal(calls[1].body.params.access_token, 'session-token');
}

{
  let loginCount = 0; let accountCount = 0;
  const client = new NovofonDataApiClient(config(), { fetch: async (_url, init = {}) => {
    const body = JSON.parse(String(init.body));
    if (body.method === 'login.user') { loginCount += 1; return response({ result: { data: { access_token: `session-${loginCount}`, expire_at: '2099-01-01 00:00:00' } } }); }
    accountCount += 1;
    return accountCount === 1 ? response({ error: { data: { mnemonic: 'access_token_expired' } } }) : response({ result: { data: { app_id: 1 } } });
  } });
  await client.getAccount();
  assert.equal(loginCount, 2, 'expired access token must trigger exactly one relogin');
  assert.equal(accountCount, 2, 'request must be repeated exactly once');
}

{
  const calls: any[] = [];
  const client = new NovofonDataApiClient(config({ authMode: 'permanent_token', permanentToken: 'permanent-value' }), { fetch: async (_url, init = {}) => {
    const body = JSON.parse(String(init.body)); calls.push(body); return response({ result: { data: { app_id: 2 } } });
  } });
  await client.getAccount();
  assert.equal(calls.length, 1); assert.equal(calls[0].params.access_token, 'permanent-value'); assert.equal(calls[0].method, 'get.account');
}

for (const mnemonic of ['ip_not_whitelisted', 'forbidden', 'limit_exceeded']) {
  const client = new NovofonDataApiClient(config({ authMode: 'permanent_token', permanentToken: 'x' }), { fetch: async () => response({ error: { data: { mnemonic } } }) });
  await assert.rejects(() => client.getAccount(), (error: any) => error instanceof NovofonProviderError && error.code === mnemonic);
  assert.equal(safeNovofonError(new NovofonProviderError(mnemonic)).safeErrorCode, mnemonic);
}

assert.equal(maskNovofonPhone('+79781234567'), '+*******4567', 'phone numbers must be masked');
assert.deepEqual(novofonAccountData({ data: [{ app_id: 298276, timezone: 'Europe/Moscow' }] }), { app_id: 298276, timezone: 'Europe/Moscow' }, 'get.account array response must be normalized');
assert.deepEqual(safeNovofonMetadata({ access_token: 'secret', password: 'secret', total_items: 5, current_version_deprecated: false }), { total_items: 5, current_version_deprecated: false });

{
  const base = { calldate: '2026-08-03 10:00:00', src: '100', dst: '79781234567', did: '', dcontext: 'from-internal', duration: 60, billsec: 55, userfield: '' };
  const exact = await reconcileNovofonLeg({ occurredAt: '2026-08-03T10:00:00Z', direction: 'out', calling: '100', called: '+79781234567', duration: 55 }, async () => [{ ...base, uniqueid: 'one', linkedid: 'one' }]);
  assert.equal(exact.confidence, 'exact'); assert.equal(exact.uniqueid, 'one');
  const conflict = await reconcileNovofonLeg({ occurredAt: '2026-08-03T10:00:00Z', direction: 'out', calling: '100', called: '+79781234567', duration: 55 }, async () => [{ ...base, uniqueid: 'one', linkedid: 'one' }, { ...base, uniqueid: 'two', linkedid: 'two' }]);
  assert.equal(conflict.confidence, 'conflict'); assert.equal(conflict.uniqueid, null);
}

const providerSource = fs.readFileSync(new URL('../server/balance/providers/novofon.ts', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../server/balance/novofonService.ts', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../server/pbxpulsMigrations.ts', import.meta.url), 'utf8');
const routerSource = fs.readFileSync(new URL('../server/balance/router.ts', import.meta.url), 'utf8');
const mtsSource = fs.readFileSync(new URL('../server/balance/mtsBusinessService.ts', import.meta.url), 'utf8');

assert.match(serviceSource, /offset \+= rows\.length/); assert.match(serviceSource, /metadata\?\.total_items/); assert.match(serviceSource, /90 \* 86400_000/);
assert.match(serviceSource, /VALUES\(\?,\?,\?, 'network','call',\?,\?,\?,\?,\?,\?,\?,\?,'second'/, 'usage upsert must keep column and value counts aligned');
assert.match(serviceSource, /Math\.max\(24, settings\.overlapHours\)/); assert.match(serviceSource, /ON DUPLICATE KEY UPDATE/);
assert.match(serviceSource, /provider_session_id=financial\.provider_session_id/); assert.match(serviceSource, /provider_leg_id=financial\.provider_leg_id/);
assert.match(serviceSource, /orphan_financial_leg/); assert.match(serviceSource, /provider_event_type='cdr_leg'/);
assert.match(providerSource, /redirect: 'manual'/); assert.match(providerSource, /ALLOWED_HOSTS/); assert.match(providerSource, /setTimeout\(\(\) => controller\.abort/);
assert.match(providerSource, /from 'node-fetch'/, 'Node.js 16 runtime must use the shared fetch polyfill');
assert.doesNotMatch(migrationSource.slice(migrationSource.indexOf('20260803_074_novofon')), /\b(rows|row|rank|groups|system|window)\s+(?:VARCHAR|INT|BIGINT|LONGTEXT|DECIMAL)/i);
assert.match(migrationSource, /uniq_balance_provider_leg\(source_id,provider_session_id,provider_leg_id,provider_event_type\)/);
assert.match(routerSource, /view_calls/); assert.match(routerSource, /listen_recordings/); assert.match(routerSource, /manage_balance_providers/);
assert.match(mtsSource, /MTS_BUSINESS_SOURCE_ID/); assert.match(routerSource, /service\.start\(\)/, 'MTS Business runtime must remain enabled');
assert.doesNotMatch(fs.readFileSync(new URL('../src/modules/management/NovofonBalancePanel.tsx', import.meta.url), 'utf8'), /access_token[^A-Za-z].*\{[^}]*settings/i);

console.log('Novofon Balance tests passed: signature, JSON-RPC auth/cache/refresh, permanent token, safe errors, pagination/idempotency/linking, masking, migrations, RBAC, secrets, MTS regression.');
