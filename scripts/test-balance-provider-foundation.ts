import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Response, type RequestInit } from 'node-fetch';
import {
  MtsBusinessProvider,
  MtsBusinessProviderError,
  parseMtsBusinessBalancePayload,
  parseMtsBusinessUsagePayload,
  type MtsBusinessProviderConfig
} from '../server/balance/providers/mtsBusiness.js';
import { safeMtsBusinessError } from '../server/balance/mtsBusinessService.js';
import { buildProviderEventKey, splitUsageRange } from '../server/balance/mtsUsageService.js';
import { reconcileMtsOutgoingCall } from '../server/balance/reconciliation/mtsCdrReconciliation.js';

const baseConfig: MtsBusinessProviderConfig = {
  enabled: true,
  apiBase: 'https://api.mts.ru',
  consumerKey: 'consumer-key-private',
  consumerSecret: 'consumer-secret-private',
  lookupType: 'msisdn',
  msisdn: '+79781234567',
  accountNo: '',
  timeoutMs: 15000
};

const balanceObject = {
  accountNo: '123456789012',
  customerAccountBalance: [{
    remainedAmount: { amount: -123.456789, unitOfMeasure: 'RUB' },
    customerAccount: { creditLimit: 5000 }
  }],
  productRelationship: [{
    product: { productCharacteristic: [{ name: 'MSISDN', value: '79781234567' }] }
  }]
};

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function tokenResponse(token: string) {
  return jsonResponse({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
}

{
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new MtsBusinessProvider(baseConfig, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith('/token') ? tokenResponse('cached-token') : jsonResponse(balanceObject);
    }
  });
  await provider.fetchBalance();
  await provider.fetchBalance();
  assert.equal(calls.filter(call => call.url.endsWith('/token')).length, 1, 'access token must be cached');
  assert.equal(calls.filter(call => call.url.includes('CheckBalanceByMSISDN')).length, 2);
  const balanceUrl = new URL(calls.find(call => call.url.includes('CheckBalanceByMSISDN'))!.url);
  assert.equal(balanceUrl.pathname, '/b2b/v1/Bills/CheckBalanceByMSISDN');
  assert.equal(balanceUrl.searchParams.get('characteristic.name'), 'MSISDN');
  assert.equal(balanceUrl.searchParams.get('characteristic.value'), '79781234567', 'MSISDN must be sent without plus');
  assert.equal(calls[0].init?.body, 'grant_type=client_credentials');
}

{
  const calls: Array<{ url: string; authorization: string }> = [];
  let tokenCount = 0;
  let balanceCount = 0;
  const provider = new MtsBusinessProvider(baseConfig, {
    fetch: async (url, init) => {
      calls.push({ url, authorization: String((init?.headers as any)?.Authorization || '') });
      if (url.endsWith('/token')) return tokenResponse(`token-${++tokenCount}`);
      balanceCount += 1;
      return balanceCount === 1 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse(balanceObject);
    }
  });
  const result = await provider.fetchBalance();
  assert.equal(result.status, 'success');
  assert.equal(tokenCount, 2, '401 must clear token cache and fetch one new token');
  assert.equal(balanceCount, 2, '401 balance request must be retried only once');
  assert(calls.some(call => call.authorization === 'Bearer token-1'));
  assert(calls.some(call => call.authorization === 'Bearer token-2'));
}

{
  const calls: string[] = [];
  const provider = new MtsBusinessProvider({
    ...baseConfig,
    lookupType: 'account',
    accountNo: 'ACC_123456',
    msisdn: ''
  }, {
    fetch: async url => {
      calls.push(url);
      return url.endsWith('/token') ? tokenResponse('account-token') : jsonResponse([balanceObject]);
    }
  });
  const result = await provider.fetchBalance();
  const requestUrl = new URL(calls.find(url => url.includes('CheckBalanceByAccount'))!);
  assert.equal(requestUrl.pathname, '/b2b/v1/Bills/CheckBalanceByAccount');
  assert.equal(requestUrl.searchParams.get('accountNo'), 'ACC_123456');
  assert.equal(result.balance, -123.456789);
  assert.equal(result.creditLimit, 5000);
  assert.equal(result.accountNumber, '123456789012');
  assert.equal(result.msisdn, '79781234567');
}

{
  const raw = JSON.stringify(balanceObject);
  const parsed = parseMtsBusinessBalancePayload(balanceObject, raw, '2026-07-27T06:00:00.000Z');
  assert.equal(parsed.balance, -123.456789, 'negative balance must remain negative');
  assert.equal(parsed.creditLimit, 5000, 'credit limit must stay separate from balance');
  assert.equal(parsed.currency, 'RUB');
  assert.equal(parsed.measuredAt, '2026-07-27T06:00:00.000Z');
  assert.match(parsed.rawHash, /^[a-f0-9]{64}$/);

  const missingCurrency = parseMtsBusinessBalancePayload({
    customerAccountBalance: [{ remainedAmount: { amount: 12.5 }, customerAccount: { creditLimit: 100 } }]
  }, '{}');
  assert.equal(missingCurrency.currency, null);

  const incomplete = parseMtsBusinessBalancePayload({ customerAccountBalance: [{}] }, '{}');
  assert.equal(incomplete.balance, null, 'incomplete response must not become zero');
  assert.equal(incomplete.creditLimit, null);
}

{
  const provider = new MtsBusinessProvider(baseConfig, {
    fetch: async url => url.endsWith('/token')
      ? tokenResponse('redirect-token')
      : new Response('', { status: 302, headers: { location: 'https://example.com/leak' } })
  });
  await assert.rejects(
    provider.fetchBalance(),
    (error: any) => error instanceof MtsBusinessProviderError && error.safeCode === 'redirect_blocked'
  );

}

{
  const provider = new MtsBusinessProvider(baseConfig, {
    fetch: async () => {
      const error: any = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
  });
  await assert.rejects(
    provider.fetchBalance(),
    (error: any) => error instanceof MtsBusinessProviderError && error.safeCode === 'timeout'
  );
  assert.deepEqual(safeMtsBusinessError(new MtsBusinessProviderError('timeout')), {
    safeErrorCode: 'timeout',
    safeMessage: 'Истекло время ожидания ответа МТС'
  });
}

{
  const calls: string[] = [];
  const provider = new MtsBusinessProvider(baseConfig, {
    fetch: async url => {
      calls.push(url);
      return url.endsWith('/token') ? tokenResponse('usage-token') : jsonResponse([]);
    }
  });
  await provider.fetchUsageDetails({
    msisdn: '+79781234567',
    startDateTime: '2026-07-01T00:00:00Z',
    endDateTime: '2026-07-01T23:59:59Z'
  });
  const request = new URL(calls.find(url => url.includes('BillingStatementByMSISDN'))!);
  assert.equal(request.pathname, '/b2b/v1/Bills/BillingStatementByMSISDN');
  assert.equal(request.searchParams.get('msisdn'), '79781234567');
  assert.equal(request.searchParams.get('startDateTime'), '2026-07-01T00:00:00Z');
  assert.equal(request.searchParams.get('endDateTime'), '2026-07-01T23:59:59Z');
  await assert.rejects(
    provider.fetchUsageDetails({ msisdn: '79781234567', startDateTime: '2026-07-01', endDateTime: '2026-07-02T00:00:00Z' }),
    (error: any) => error.safeCode === 'invalid_usage_date_format'
  );
  calls.length = 0;
  await provider.fetchUsageDetailsByAccount({
    accountNo: '123456789012',
    startDateTime: '2026-07-01T00:00:00Z',
    endDateTime: '2026-07-01T23:59:59Z'
  });
  const accountRequest = new URL(calls.find(url => url.includes('BillingStatementByAccount'))!);
  assert.equal(accountRequest.pathname, '/b2b/v1/Bills/BillingStatementByAccount');
  assert.equal(accountRequest.searchParams.get('account'), '123456789012');
  assert.equal(accountRequest.searchParams.get('startDateTime'), '2026-07-01T00:00:00Z');
  assert.equal(accountRequest.searchParams.get('endDateTime'), '2026-07-01T23:59:59Z');
  const monthChunks = splitUsageRange('2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z');
  assert.equal(monthChunks.length, 31, 'monthly account usage must be split into daily requests');
  assert.deepEqual(monthChunks[0], {
    startDateTime: '2026-07-01T00:00:00Z',
    endDateTime: '2026-07-02T00:00:00Z'
  });
}

{
  const baseEvent = {
    date: '2026-07-01T10:00:00Z',
    ratingDate: '2026-07-01T10:01:00Z',
    type: 'network',
    amount: 0,
    discount: 1.25,
    tax: 0.2,
    productId: 'product-1',
    Characteristics: {
      accountBalance: 120,
      numberOfUnits: 60,
      unitOfMeasureCode: 'SEC',
      factUnits: 52,
      factUnitsCode: 'SEC',
      direction: 'O',
      calledMsisdn: '79780000001',
      networkServiceId: 'voice',
      networkEvent: 'call',
      categoryId: 'calls',
      label: 'Исходящий звонок'
    },
    ServiceCounters: [{ value: 1000, validFor: { startDateTime: '2026-07-01T00:00:00Z' } }, { value: 948 }]
  };
  const [call] = parseMtsBusinessUsagePayload([baseEvent], JSON.stringify([baseEvent]));
  assert.equal(call.eventType, 'network');
  assert.equal(call.networkEvent, 'call');
  assert.equal(call.direction, 'outgoing');
  assert.equal(call.amount, 0, 'zero amount is valid');
  assert.equal(call.packageCounterBefore, 1000);
  assert.equal(call.packageCounterAfter, 948);
  assert.equal(call.packageCounterUsed, 52);
  assert.equal(call.balanceAfter, 120, 'account balance is parsed separately');
  const [accountCall] = parseMtsBusinessUsagePayload({
    Usages: [{
      ...baseEvent,
      msisdn: '79781234567',
      ServiceCounters: undefined,
      Characteristics: {
        ...baseEvent.Characteristics,
        factUnitsCode: undefined,
        factUnitCode: 'SECOND',
        ServiceCounters: [{ value: 1000, validFor: '2026-07-01T00:00:00Z' }, { value: 948 }]
      }
    }]
  }, '{}');
  assert.equal(accountCall.msisdn, '79781234567');
  assert.equal(accountCall.actualUnitCode, 'SECOND');
  assert.equal(accountCall.packageCounterUsed, 52);

  const variants = [
    ['sms', { ...baseEvent, Characteristics: { ...baseEvent.Characteristics, networkEvent: 'sms', direction: 'I' } }],
    ['data', { ...baseEvent, Characteristics: { ...baseEvent.Characteristics, networkEvent: 'data' } }],
    ['periodical', { ...baseEvent, type: 'periodical' }],
    ['one_time', { ...baseEvent, type: 'one_time' }],
    ['income', { ...baseEvent, type: 'income' }],
    ['outcome', { ...baseEvent, type: 'outcome' }],
    ['unknown', { ...baseEvent, type: 'something-new' }]
  ] as const;
  for (const [expected, source] of variants) {
    const parsed = parseMtsBusinessUsagePayload([source], '{}')[0];
    if (expected === 'sms' || expected === 'data') assert.equal(parsed.networkEvent, expected);
    else assert.equal(parsed.eventType, expected);
  }
  assert.equal(parseMtsBusinessUsagePayload([variants[0][1]], '{}')[0].direction, 'incoming');
  const lowerCase = parseMtsBusinessUsagePayload([{
    ...baseEvent, amount: undefined, discount: undefined, dicount: 2.5,
    Characteristics: undefined, characteristics: { ...baseEvent.Characteristics, direction: '?' },
    ServiceCounters: undefined
  }], '{}')[0];
  assert.equal(lowerCase.amount, null);
  assert.equal(lowerCase.discount, 2.5);
  assert.equal(lowerCase.direction, null);
  assert.equal(lowerCase.packageCounterUsed, null);
  const negativeCounter = parseMtsBusinessUsagePayload([{
    ...baseEvent, ServiceCounters: [{ value: 10, validFor: {} }, { value: 20 }]
  }], '{}')[0];
  assert.equal(negativeCounter.packageCounterUsed, null);
  assert.deepEqual(negativeCounter.warnings, ['package_counter_negative_delta']);
  assert.equal(buildProviderEventKey(1, '79781234567', call), buildProviderEventKey(1, '79781234567', call), 'same range must deduplicate');
}

{
  let cdrQueries = 0;
  const match = await reconcileMtsOutgoingCall({
    id: 7, occurredAt: '2026-07-01T10:00:00Z', direction: 'outgoing',
    caller: '79781234567', callee: '79780000001', actualUnits: 52
  }, async () => {
    cdrQueries += 1;
    return [{ uniqueid: 'u1', linkedid: 'l1', calldate: '2026-07-01 10:00:02', dst: '79780000001', billsec: 52 }];
  });
  assert.equal(cdrQueries, 1);
  assert.equal(match.confidence, 'exact');
  const reconciliationSource = fs.readFileSync('server/balance/reconciliation/mtsCdrReconciliation.ts', 'utf8');
  assert(!/\b(?:UPDATE|INSERT|DELETE)\s+(?:INTO\s+)?cdr\b/i.test(reconciliationSource), 'reconciliation must not modify CDR');
}

{
  const frontend = fs.readFileSync('src/modules/management/BalanceCenter.tsx', 'utf8');
  for (const secretName of ['BALANCE_MTS_BUSINESS_CONSUMER_KEY', 'BALANCE_MTS_BUSINESS_CONSUMER_SECRET', 'access_token']) {
    assert(!frontend.includes(secretName), `frontend must not contain ${secretName}`);
  }
  const router = fs.readFileSync('server/balance/router.ts', 'utf8');
  assert(!router.includes('consumerSecret'));
  assert(!router.includes('consumerKey'));
  assert(!router.includes('access_token'));
  const service = fs.readFileSync('server/balance/mtsBusinessService.ts', 'utf8');
  assert(!/config_json[^\\n]*(consumer|secret|token)/i.test(service), 'secrets must not be stored in balance_sources.config_json');
  const serializedSafeData = JSON.stringify({
    ...safeMtsBusinessError(new MtsBusinessProviderError('authentication_failed')),
    diagnostic: { enabled: true, configured: true }
  });
  assert(!serializedSafeData.includes(baseConfig.consumerSecret));
  assert(!serializedSafeData.includes(baseConfig.consumerKey));
  const usageFrontend = fs.readFileSync('src/modules/management/MtsUsageDetails.tsx', 'utf8');
  assert(!/INITIAL_|mock|demo/i.test(usageFrontend), 'MTS usage UI must not contain demo details');
  assert(!/\b7\d{10}\b/.test(usageFrontend), 'frontend must not contain full phone numbers');
  const usageService = fs.readFileSync('server/balance/mtsUsageService.ts', 'utf8');
  assert(usageService.includes("event_type<>'income'"), 'income must not be included in total charges');
  assert(!/SUM\([^\n]*balance_after/i.test(usageService), 'accountBalance must not be treated as expense');
  assert(usageService.includes('ON DUPLICATE KEY UPDATE'), 'repeat sync must use idempotent upsert');
  assert(!usageService.includes('access_token'));
  const settingsStore = fs.readFileSync('server/balance/mtsBusinessSettings.ts', 'utf8');
  assert(settingsStore.includes('aes-256-gcm'), 'managed credentials must be encrypted');
  assert(settingsStore.includes('consumerKeyConfigured'));
  assert(settingsStore.includes('consumerSecretConfigured'));
  assert(!/config_json[^\\n]*(consumerKey|consumerSecret)/.test(settingsStore), 'credentials must not be stored in config_json');
}

console.log('MTS Business balance provider foundation tests: OK');
