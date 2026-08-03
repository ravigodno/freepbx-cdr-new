import crypto from 'node:crypto';

export type NovofonAuthMode = 'permanent_token' | 'login_password';
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface NovofonProviderConfig {
  enabled: boolean;
  authMode: NovofonAuthMode;
  permanentToken: string;
  login: string;
  password: string;
  apiV1Key: string;
  apiV1Secret: string;
  timeoutMs: number;
}

export class NovofonProviderError extends Error {
  constructor(public readonly code: string, public readonly transient = false, public readonly metadata: Record<string, unknown> = {}) {
    super(code);
    this.name = 'NovofonProviderError';
  }
}

const DATA_API_URL = 'https://dataapi-jsonrpc.novofon.ru/v2.0';
const API_V1_URL = 'https://api.novofon.com';
const ALLOWED_HOSTS = new Set(['dataapi-jsonrpc.novofon.ru', 'api.novofon.com', 'app.novofon.ru', 'media.novofon.ru']);
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const SECRET_PATTERN = /(access[_-]?token|password|api[_-]?(?:key|secret)|authorization|login)/i;

export function novofonV1Signature(method: string, params: Record<string, string | number | boolean>, secret: string): string {
  const pairs = Object.keys(params).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
  const paramsString = pairs.join('&');
  const signingInput = `${method}${paramsString}${crypto.createHash('md5').update(paramsString).digest('hex')}`;
  return crypto.createHmac('sha1', secret).update(signingInput).digest('base64');
}

export function safeNovofonMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_PATTERN.test(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof item) || item === null) output[key] = item;
  }
  return output;
}

function normalizedError(payload: any): NovofonProviderError {
  const mnemonic = String(payload?.error?.data?.mnemonic || 'json_rpc_error').slice(0, 64);
  return new NovofonProviderError(mnemonic, ['internal_error'].includes(mnemonic), safeNovofonMetadata(payload?.error?.data?.metadata));
}

function ensureAllowed(url: string, expectedHost?: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || (expectedHost && parsed.hostname !== expectedHost)) {
    throw new NovofonProviderError('api_host_not_allowed');
  }
  return parsed;
}

export class NovofonDataApiClient {
  private session: { token: string; expiresAt: number } | null = null;
  private requestId = 0;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: NovofonProviderConfig, dependencies: { fetch?: FetchLike } = {}) {
    this.fetchImpl = dependencies.fetch || (fetch as unknown as FetchLike);
  }

  clearSession(): void { this.session = null; }

  private async post(body: object): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(60_000, this.config.timeoutMs || 15_000)));
    try {
      const response = await this.fetchImpl(ensureAllowed(DATA_API_URL, 'dataapi-jsonrpc.novofon.ru').toString(), {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      if (response.status >= 300 && response.status < 400) throw new NovofonProviderError('redirect_blocked');
      if (!response.ok) throw new NovofonProviderError(`data_api_http_${response.status}`, TRANSIENT_HTTP.has(response.status));
      const payload = await response.json().catch(() => { throw new NovofonProviderError('invalid_json'); });
      if (payload?.error) throw normalizedError(payload);
      return payload?.result || {};
    } catch (error: any) {
      if (error instanceof NovofonProviderError) throw error;
      if (error?.name === 'AbortError') throw new NovofonProviderError('timeout', true);
      throw new NovofonProviderError('network_error', true);
    } finally { clearTimeout(timer); }
  }

  private async login(force = false): Promise<string> {
    if (this.config.authMode === 'permanent_token') {
      if (!this.config.permanentToken) throw new NovofonProviderError('credentials_missing');
      return this.config.permanentToken;
    }
    if (!force && this.session && Date.now() < this.session.expiresAt - 60_000) return this.session.token;
    if (!this.config.login || !this.config.password) throw new NovofonProviderError('credentials_missing');
    const result = await this.post({ jsonrpc: '2.0', id: `login-${++this.requestId}`, method: 'login.user', params: { login: this.config.login, password: this.config.password } });
    const data = result?.data || result;
    const token = String(data?.access_token || '');
    if (!token) throw new NovofonProviderError('access_token_missing');
    const expireAt = Date.parse(String(data?.expire_at || ''));
    this.session = { token, expiresAt: Number.isFinite(expireAt) ? expireAt : Date.now() + 3_600_000 };
    return token;
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
      try {
        const accessToken = await this.login(authAttempt > 0);
        return await this.post({ jsonrpc: '2.0', id: `pbxpuls-${++this.requestId}`, method, params: { ...params, access_token: accessToken } });
      } catch (error) {
        const code = error instanceof NovofonProviderError ? error.code : 'request_failed';
        if (authAttempt === 0 && ['access_token_expired', 'access_token_invalid'].includes(code)) {
          if (this.config.authMode === 'login_password') this.clearSession();
          continue;
        }
        throw error;
      }
    }
    throw new NovofonProviderError('authentication_failed');
  }

  async getAccount(): Promise<any> { return this.call('get.account'); }

  async getReport(method: 'get.calls_report' | 'get.call_legs_report' | 'get.financial_call_legs_report', input: { from: string; to: string; offset: number; limit: number }): Promise<any> {
    return this.call(method, { date_from: input.from, date_till: input.to, offset: input.offset, limit: input.limit });
  }
}

export class NovofonBalanceApiClient {
  private readonly fetchImpl: FetchLike;
  constructor(private readonly config: NovofonProviderConfig, dependencies: { fetch?: FetchLike } = {}) {
    this.fetchImpl = dependencies.fetch || (fetch as unknown as FetchLike);
  }

  get configured(): boolean { return Boolean(this.config.apiV1Key && this.config.apiV1Secret); }

  async getBalance(): Promise<{ balance: number | null; currency: string | null; rawHash: string }> {
    if (!this.config.apiV1Key || !this.config.apiV1Secret) throw new NovofonProviderError('balance_api_not_configured');
    const method = '/v1/info/balance/';
    const signature = novofonV1Signature(method, {}, this.config.apiV1Secret);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(60_000, this.config.timeoutMs || 15_000)));
    try {
      const response = await this.fetchImpl(ensureAllowed(`${API_V1_URL}${method}`, 'api.novofon.com').toString(), {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `${this.config.apiV1Key}:${signature}`, Accept: 'application/json' }
      });
      if (response.status >= 300 && response.status < 400) throw new NovofonProviderError('redirect_blocked');
      if (!response.ok) throw new NovofonProviderError(`balance_api_http_${response.status}`, TRANSIENT_HTTP.has(response.status));
      const raw = await response.text();
      const payload = JSON.parse(raw);
      const data = payload?.data || payload;
      const balance = Number(data?.balance);
      return { balance: Number.isFinite(balance) ? balance : null, currency: String(data?.currency || data?.balance_currency || '') || null, rawHash: crypto.createHash('sha256').update(raw).digest('hex') };
    } catch (error: any) {
      if (error instanceof NovofonProviderError) throw error;
      if (error?.name === 'AbortError') throw new NovofonProviderError('timeout', true);
      throw new NovofonProviderError('network_error', true);
    } finally { clearTimeout(timer); }
  }
}

export function assertNovofonRecordingUrl(value: string): URL {
  const url = ensureAllowed(value);
  if (!['app.novofon.ru', 'media.novofon.ru'].includes(url.hostname)) throw new NovofonProviderError('recording_host_not_allowed');
  return url;
}
