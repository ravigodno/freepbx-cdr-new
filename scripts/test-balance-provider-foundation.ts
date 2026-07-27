import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Response, type RequestInit } from 'node-fetch';
import {
  MtsBusinessProvider,
  MtsBusinessProviderError,
  parseMtsBusinessBalancePayload,
  type MtsBusinessProviderConfig
} from '../server/balance/providers/mtsBusiness.js';
import { safeMtsBusinessError } from '../server/balance/mtsBusinessService.js';

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
}

console.log('MTS Business balance provider foundation tests: OK');
