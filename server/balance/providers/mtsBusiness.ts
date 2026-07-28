import crypto from 'node:crypto';
import fetch, { type RequestInit, type Response } from 'node-fetch';

const ALLOWED_HOSTNAME = 'api.mts.ru';
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const USER_AGENT = 'PBXPuls-Balance/5.6.38';
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type MtsBusinessLookupType = 'msisdn' | 'account';

export interface MtsBusinessProviderConfig {
  enabled: boolean;
  apiBase: string;
  consumerKey: string;
  consumerSecret: string;
  lookupType: MtsBusinessLookupType;
  msisdn: string;
  accountNo: string;
  timeoutMs: number;
  maxResponseBytes?: number;
}

export interface MtsBusinessBalanceResult {
  provider: 'mts_business';
  status: 'success';
  balance: number | null;
  currency: 'RUB' | null;
  creditLimit: number | null;
  accountNumber: string | null;
  msisdn: string | null;
  validUntil: string | null;
  measuredAt: string;
  rawHash: string;
}

export type MtsUsageEventType = 'network' | 'periodical' | 'one_time' | 'income' | 'outcome' | 'unknown';
export type MtsUsageDirection = 'incoming' | 'outgoing' | null;

export interface NormalizedUsageEvent {
  occurredAt: string;
  ratedAt: string | null;
  eventType: MtsUsageEventType;
  amount: number | null;
  discount: number | null;
  tax: number | null;
  productId: string | null;
  balanceAfter: number | null;
  billedUnits: number | null;
  billedUnitCode: string | null;
  actualUnits: number | null;
  actualUnitCode: string | null;
  direction: MtsUsageDirection;
  counterparty: string | null;
  networkServiceId: string | null;
  networkEvent: string | null;
  categoryId: string | null;
  label: string | null;
  chargePeriodStart: string | null;
  chargePeriodEnd: string | null;
  packageCounterBefore: number | null;
  packageCounterAfter: number | null;
  packageCounterUsed: number | null;
  rawHash: string;
  warnings: string[];
}

export interface NormalizedUsageResult {
  provider: 'mts_business';
  status: 'success';
  msisdn: string;
  startDateTime: string;
  endDateTime: string;
  events: NormalizedUsageEvent[];
  rawHash: string;
  fetchedAt: string;
}

export const MTS_BUSINESS_CAPABILITIES = Object.freeze({
  exactBalance: true,
  creditLimit: true,
  accountLookup: true,
  msisdnLookup: true,
  callStatistics: true,
  chargedCalls: true,
  payments: false
});

export class MtsBusinessProviderError extends Error {
  constructor(public readonly safeCode: string, public readonly transient = false) {
    super(safeCode);
    this.name = 'MtsBusinessProviderError';
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type TokenCache = { value: string; expiresAt: number } | null;

function positiveInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MtsBusinessProviderError('invalid_api_base');
  }
  if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOSTNAME || url.username || url.password || (url.port && url.port !== '443')) {
    throw new MtsBusinessProviderError('api_host_not_allowed');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function normalizeMtsMsisdn(value: unknown): string {
  const normalized = String(value ?? '').trim().replace(/^\+/, '').replace(/\D/g, '');
  if (!/^7\d{10}$/.test(normalized)) throw new MtsBusinessProviderError('invalid_msisdn');
  return normalized;
}

function normalizeAccountNumber(value: unknown): string {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(normalized)) throw new MtsBusinessProviderError('invalid_account_number');
  return normalized;
}

export function maskMtsIdentifier(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length <= 4) return '*'.repeat(text.length);
  const prefix = text.slice(0, 1);
  const suffix = text.slice(-3);
  return `${prefix}${'*'.repeat(Math.max(3, text.length - 4))}${suffix}`;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

const UTC_SECOND_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function normalizeUsagePeriod(startValue: string, endValue: string): { startDateTime: string; endDateTime: string } {
  const startDateTime = String(startValue || '').trim();
  const endDateTime = String(endValue || '').trim();
  if (!UTC_SECOND_FORMAT.test(startDateTime) || !UTC_SECOND_FORMAT.test(endDateTime)) {
    throw new MtsBusinessProviderError('invalid_usage_date_format');
  }
  const start = Date.parse(startDateTime);
  const end = Date.parse(endDateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new MtsBusinessProviderError('invalid_usage_period');
  if (start >= end) throw new MtsBusinessProviderError('invalid_usage_period_order');
  return { startDateTime, endDateTime };
}

function nullableText(value: unknown, maxLength = 500): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeUsageType(value: unknown): MtsUsageEventType {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['network', 'periodical', 'one_time', 'income', 'outcome'].includes(normalized)
    ? normalized as MtsUsageEventType
    : 'unknown';
}

function characteristicMap(event: any): Record<string, unknown> {
  const source = event?.Characteristics ?? event?.characteristics;
  if (Array.isArray(source)) {
    return Object.fromEntries(source
      .filter(item => item && typeof item === 'object' && item.name)
      .map(item => [String(item.name), item.value ?? item.amount ?? item.characteristicValue]));
  }
  return source && typeof source === 'object' ? source : {};
}

function counterValue(counter: any): number | null {
  return finiteNumber(counter?.value ?? counter?.amount ?? counter?.numberOfUnits ?? counter?.remainingValue);
}

function normalizeServiceCounters(event: any): {
  before: number | null;
  after: number | null;
  used: number | null;
  warnings: string[];
} {
  const counters = Array.isArray(event?.ServiceCounters)
    ? event.ServiceCounters
    : Array.isArray(event?.serviceCounters) ? event.serviceCounters : [];
  const before = counterValue(counters.find((item: any) => item?.validFor));
  const after = counterValue(counters.find((item: any) => !item?.validFor));
  if (before === null || after === null) return { before, after, used: null, warnings: [] };
  const used = before - after;
  return used < 0
    ? { before, after, used: null, warnings: ['package_counter_negative_delta'] }
    : { before, after, used, warnings: [] };
}

function usageEventArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ['billingStatement', 'events', 'items', 'usageEvents']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return payload && typeof payload === 'object' && payload.date ? [payload] : [];
}

export function parseMtsBusinessUsagePayload(payload: unknown, rawText: string): NormalizedUsageEvent[] {
  return usageEventArray(payload).flatMap((event: any) => {
    const occurredAt = isoOrNull(event?.date);
    if (!occurredAt) return [];
    const characteristics = characteristicMap(event);
    const counters = normalizeServiceCounters(event);
    const directionCode = String(characteristics.direction || '').trim().toUpperCase();
    const rawEvent = JSON.stringify(event);
    return [{
      occurredAt,
      ratedAt: isoOrNull(event?.ratingDate),
      eventType: normalizeUsageType(event?.type),
      amount: finiteNumber(event?.amount),
      discount: finiteNumber(event?.discount ?? event?.dicount),
      tax: finiteNumber(event?.tax),
      productId: nullableText(event?.productId, 100),
      balanceAfter: finiteNumber(characteristics.accountBalance),
      billedUnits: finiteNumber(characteristics.numberOfUnits),
      billedUnitCode: nullableText(characteristics.unitOfMeasureCode, 32),
      actualUnits: finiteNumber(characteristics.factUnits),
      actualUnitCode: nullableText(characteristics.factUnitsCode, 32),
      direction: directionCode === 'I' ? 'incoming' : directionCode === 'O' ? 'outgoing' : null,
      counterparty: nullableText(characteristics.calledMsisdn, 64),
      networkServiceId: nullableText(characteristics.networkServiceId, 100),
      networkEvent: nullableText(characteristics.networkEvent, 32)?.toLowerCase() || null,
      categoryId: nullableText(characteristics.categoryId, 100),
      label: nullableText(characteristics.label, 500),
      chargePeriodStart: isoOrNull(characteristics.chargePeriodStart),
      chargePeriodEnd: isoOrNull(characteristics.chargePeriodEnd),
      packageCounterBefore: counters.before,
      packageCounterAfter: counters.after,
      packageCounterUsed: counters.used,
      rawHash: crypto.createHash('sha256').update(rawEvent || rawText).digest('hex'),
      warnings: counters.warnings
    }];
  });
}

function findBalanceContainer(payload: any): any | null {
  const candidates = Array.isArray(payload) ? payload : [payload];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && Array.isArray(candidate.customerAccountBalance)) return candidate;
  }
  return null;
}

function findMsisdn(container: any): string | null {
  const relationships = Array.isArray(container?.productRelationship) ? container.productRelationship : [];
  for (const relationship of relationships) {
    const characteristics = relationship?.product?.productCharacteristic;
    if (!Array.isArray(characteristics)) continue;
    const match = characteristics.find((item: any) => String(item?.name || '').toUpperCase() === 'MSISDN');
    if (!match) continue;
    try {
      return normalizeMtsMsisdn(match.value);
    } catch {
      return null;
    }
  }
  return null;
}

export function parseMtsBusinessBalancePayload(payload: unknown, rawText: string, measuredAt = new Date().toISOString()): MtsBusinessBalanceResult {
  const container = findBalanceContainer(payload);
  const balanceEntry = Array.isArray(container?.customerAccountBalance) ? container.customerAccountBalance[0] : null;
  const remainedAmount = balanceEntry?.remainedAmount;
  const customerAccount = balanceEntry?.customerAccount;
  const unit = typeof remainedAmount?.unitOfMeasure === 'string' ? remainedAmount.unitOfMeasure.toUpperCase() : '';
  const accountNumber = String(container?.accountNo ?? customerAccount?.accountNo ?? '').trim() || null;
  const validUntil = isoOrNull(
    balanceEntry?.validUntil
      ?? balanceEntry?.validFor?.endDateTime
      ?? customerAccount?.validFor?.endDateTime
      ?? container?.validUntil
  );
  return {
    provider: 'mts_business',
    status: 'success',
    balance: finiteNumber(remainedAmount?.amount),
    currency: unit === 'RUB' ? 'RUB' : null,
    creditLimit: finiteNumber(customerAccount?.creditLimit),
    accountNumber,
    msisdn: findMsisdn(container),
    validUntil,
    measuredAt,
    rawHash: crypto.createHash('sha256').update(rawText).digest('hex')
  };
}

async function readLimitedJson(response: Response, maxBytes: number): Promise<{ payload: unknown; rawText: string }> {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    throw new MtsBusinessProviderError('invalid_content_type');
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new MtsBusinessProviderError('response_too_large');

  const chunks: Buffer[] = [];
  let total = 0;
  const body: any = response.body;
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throw new MtsBusinessProviderError('response_too_large');
      chunks.push(buffer);
    }
  } else {
    const text = await response.text();
    total = Buffer.byteLength(text);
    if (total > maxBytes) throw new MtsBusinessProviderError('response_too_large');
    chunks.push(Buffer.from(text));
  }
  const rawText = Buffer.concat(chunks).toString('utf8');
  try {
    return { payload: JSON.parse(rawText), rawText };
  } catch {
    throw new MtsBusinessProviderError('invalid_json');
  }
}

export class MtsBusinessProvider {
  private tokenCache: TokenCache = null;
  private readonly fetchImpl: FetchLike;
  private readonly apiBase: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(private readonly config: MtsBusinessProviderConfig, dependencies: { fetch?: FetchLike } = {}) {
    this.fetchImpl = dependencies.fetch || (fetch as unknown as FetchLike);
    this.apiBase = normalizeBaseUrl(config.apiBase);
    this.timeoutMs = positiveInteger(config.timeoutMs, 15000, 1000, 60000);
    this.maxResponseBytes = positiveInteger(config.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 1024, 5 * 1024 * 1024);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get configured(): boolean {
    const lookupConfigured = this.config.lookupType === 'account'
      ? Boolean(String(this.config.accountNo || '').trim())
      : Boolean(String(this.config.msisdn || '').trim());
    return Boolean(this.config.consumerKey && this.config.consumerSecret && lookupConfigured);
  }

  get lookupType(): MtsBusinessLookupType {
    return this.config.lookupType;
  }

  clearTokenCache(): void {
    this.tokenCache = null;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== ALLOWED_HOSTNAME) {
      throw new MtsBusinessProviderError('api_host_not_allowed');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(target.toString(), {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          ...(init.headers || {})
        }
      });
      if (response.status >= 300 && response.status < 400) throw new MtsBusinessProviderError('redirect_blocked');
      return response;
    } catch (error: any) {
      if (error instanceof MtsBusinessProviderError) throw error;
      if (error?.name === 'AbortError') throw new MtsBusinessProviderError('timeout');
      throw new MtsBusinessProviderError('network_error', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenCache && Date.now() < this.tokenCache.expiresAt) return this.tokenCache.value;
    if (!this.config.consumerKey || !this.config.consumerSecret) throw new MtsBusinessProviderError('credentials_missing');
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64');
    const response = await this.request(`${this.apiBase}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!response.ok) {
      throw new MtsBusinessProviderError(
        response.status === 401 || response.status === 403 ? 'authentication_failed' : `token_http_${response.status}`,
        TRANSIENT_STATUSES.has(response.status)
      );
    }
    const { payload } = await readLimitedJson(response, this.maxResponseBytes);
    const token = String((payload as any)?.access_token || '');
    const expiresIn = positiveInteger((payload as any)?.expires_in, 3600, 60, 86400);
    if (!token) throw new MtsBusinessProviderError('token_missing');
    this.tokenCache = { value: token, expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000 };
    return token;
  }

  private buildBalanceUrl(): string {
    if (this.config.lookupType === 'account') {
      const url = new URL('/b2b/v1/Bills/CheckBalanceByAccount', `${this.apiBase}/`);
      url.searchParams.set('accountNo', normalizeAccountNumber(this.config.accountNo));
      return url.toString();
    }
    const url = new URL('/b2b/v1/Bills/CheckBalanceByMSISDN', `${this.apiBase}/`);
    url.searchParams.set('characteristic.name', 'MSISDN');
    url.searchParams.set('characteristic.value', normalizeMtsMsisdn(this.config.msisdn));
    return url.toString();
  }

  async fetchBalance(): Promise<MtsBusinessBalanceResult> {
    if (!this.enabled) throw new MtsBusinessProviderError('provider_disabled');
    if (!this.configured) throw new MtsBusinessProviderError('provider_not_configured');
    let forceTokenRefresh = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const token = await this.getAccessToken(forceTokenRefresh);
        const response = await this.request(this.buildBalanceUrl(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.status === 401) {
          this.clearTokenCache();
          if (attempt === 0) {
            forceTokenRefresh = true;
            continue;
          }
          throw new MtsBusinessProviderError('authentication_expired');
        }
        if (!response.ok) {
          throw new MtsBusinessProviderError(`balance_http_${response.status}`, TRANSIENT_STATUSES.has(response.status));
        }
        const { payload, rawText } = await readLimitedJson(response, this.maxResponseBytes);
        return parseMtsBusinessBalancePayload(payload, rawText);
      } catch (error: any) {
        const normalized = error instanceof MtsBusinessProviderError
          ? error
          : new MtsBusinessProviderError('request_failed');
        if (attempt === 0 && normalized.transient) continue;
        throw normalized;
      }
    }
    throw new MtsBusinessProviderError('request_failed');
  }

  async fetchUsageDetails(input: {
    msisdn: string;
    startDateTime: string;
    endDateTime: string;
  }): Promise<NormalizedUsageResult> {
    if (!this.enabled) throw new MtsBusinessProviderError('provider_disabled');
    if (!this.config.consumerKey || !this.config.consumerSecret) throw new MtsBusinessProviderError('provider_not_configured');
    const msisdn = normalizeMtsMsisdn(input.msisdn);
    const period = normalizeUsagePeriod(input.startDateTime, input.endDateTime);
    const url = new URL('/b2b/v1/Bills/BillingStatementByMSISDN', `${this.apiBase}/`);
    url.searchParams.set('msisdn', msisdn);
    url.searchParams.set('startDateTime', period.startDateTime);
    url.searchParams.set('endDateTime', period.endDateTime);
    let forceTokenRefresh = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const token = await this.getAccessToken(forceTokenRefresh);
        const response = await this.request(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.status === 401) {
          this.clearTokenCache();
          if (attempt === 0) {
            forceTokenRefresh = true;
            continue;
          }
          throw new MtsBusinessProviderError('authentication_expired');
        }
        if (!response.ok) {
          throw new MtsBusinessProviderError(`usage_http_${response.status}`, TRANSIENT_STATUSES.has(response.status));
        }
        const { payload, rawText } = await readLimitedJson(response, this.maxResponseBytes);
        return {
          provider: 'mts_business',
          status: 'success',
          msisdn,
          ...period,
          events: parseMtsBusinessUsagePayload(payload, rawText),
          rawHash: crypto.createHash('sha256').update(rawText).digest('hex'),
          fetchedAt: new Date().toISOString()
        };
      } catch (error: any) {
        const normalized = error instanceof MtsBusinessProviderError
          ? error
          : new MtsBusinessProviderError('request_failed');
        if (attempt === 0 && normalized.transient) continue;
        throw normalized;
      }
    }
    throw new MtsBusinessProviderError('request_failed');
  }
}
