import crypto from 'node:crypto';
import { assertDnsSafe, assertSafeUrl, safeJoin, sanitizeExternalValue } from './integrationSecurity.js';
import type { ConnectorRequest, ConnectorResult, IntegrationConnector } from './integrationTypes.js';

type FetchLike = typeof fetch;
const MAX_RESPONSE_BYTES = 262_144;

function jsonPath(value: unknown, path: string): unknown {
  if (!/^\$(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path)) throw new Error('VALIDATION_FAILED');
  return path.slice(2).split('.').filter(Boolean).reduce<any>((current, key) => current?.[key], value);
}
function template(value: unknown, input: Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value;
  const exact = /^\{\{input\.([A-Za-z_][A-Za-z0-9_]*)\}\}$/.exec(value);
  if (exact) return input[exact[1]];
  return value.replace(/\{\{input\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, key) => String(input[key] ?? ''));
}
function normalizeResponse(raw: unknown, mapping: any): Record<string, unknown> {
  const fields = mapping?.responseMapping || {};
  const result: Record<string, unknown> = {};
  const set=(target:string,value:unknown)=>{const keys=target.split('.');let cursor=result;for(const key of keys.slice(0,-1))cursor=(cursor[key]??={})as Record<string,unknown>;cursor[keys.at(-1)!]=value};
  for (const [target, source] of Object.entries(fields)) {
    const spec=typeof source==='string'?{path:source}:source as any;let value=spec.constant??jsonPath(raw,String(spec.path||'$'));
    if(spec.transform==='phone')value=String(value??'').replace(/[^\d+]/g,'').slice(0,20);
    if(spec.transform==='date')value=new Date(String(value)).toISOString();
    if(spec.enum&&Object.prototype.hasOwnProperty.call(spec.enum,String(value)))value=spec.enum[String(value)];
    set(target,value);
  }
  return sanitizeExternalValue(Object.keys(fields).length ? result : raw) as Record<string, unknown>;
}
function authHeaders(authType: string, credential: Record<string, string> | null): Record<string, string> {
  if (!credential || authType === 'none') return {};
  if (authType === 'api_key_header') return { [credential.headerName || 'X-API-Key']: credential.apiKey };
  if (authType === 'bearer') return { Authorization: `Bearer ${credential.token}` };
  if (authType === 'basic') return { Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString('base64')}` };
  if (authType === 'oauth2_client_credentials' || authType === 'oauth2_authorization_code') return { Authorization: `Bearer ${credential.accessToken}` };
  return {};
}

export class GenericRestConnector implements IntegrationConnector {
  constructor(private readonly fetcher: FetchLike = fetch) {}
  async execute(integration: any, mapping: any, credential: Record<string, string> | null, request: ConnectorRequest): Promise<ConnectorResult> {
    const started = Date.now();
    const url = new URL(safeJoin(integration.base_url, String(mapping.path_template || '/')));
    for (const [key, value] of Object.entries(mapping.request_mapping?.query || {})) url.searchParams.set(key, String(template(value, request.input) ?? ''));
    const allowed = JSON.parse(integration.allowed_hosts_json || '[]');
    assertSafeUrl(url.toString(), allowed, Boolean(integration.allow_private));
    await assertDnsSafe(url, Boolean(integration.allow_private));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(Number(mapping.timeout_ms || integration.timeout_ms || 8000), 30000));
    try {
      const bodyMap = mapping.request_mapping?.body || {};
      const body = Object.fromEntries(Object.entries(bodyMap).map(([key, value]) => [key, template(value, request.input)]));
      const response = await this.fetcher(url, {
        method: String(mapping.http_method || 'GET'),
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders(integration.auth_type, credential) },
        body: ['GET', 'HEAD'].includes(String(mapping.http_method || 'GET')) ? undefined : JSON.stringify(body)
      });
      if (response.status >= 300 && response.status < 400) throw new Error('REMOTE_UNAVAILABLE');
      if (response.status === 401 || response.status === 403) throw new Error('AUTH_FAILED');
      if (response.status === 404) throw new Error('REMOTE_NOT_FOUND');
      if (response.status === 409) throw new Error('REMOTE_CONFLICT');
      if (response.status === 429) throw new Error('RATE_LIMITED');
      if (!response.ok) throw new Error('REMOTE_UNAVAILABLE');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_RESPONSE_BYTES) throw new Error('RESPONSE_SCHEMA_INVALID');
      let raw: unknown;
      try { raw = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('RESPONSE_SCHEMA_INVALID'); }
      return { status: 'completed', data: normalizeResponse(raw, mapping), latencyMs: Date.now() - started };
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('TIMEOUT');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async health(integration: any, credential: Record<string, string> | null) {
    const result = await this.execute(integration, { path_template: integration.health_path || '/', http_method: 'GET', responseMapping: {} }, credential, { requestId: crypto.randomUUID(), actionId: 'health', input: {}, idempotencyKey: null, dryRun: false });
    return { status: result.status === 'completed' ? 'connected' : 'degraded', latencyMs: result.latencyMs };
  }
}

export class GenericWebhookConnector extends GenericRestConnector {
  async execute(integration: any, mapping: any, credential: Record<string, string> | null, request: ConnectorRequest): Promise<ConnectorResult> {
    const payload = { event: request.actionId, requestId: request.requestId, idempotencyKey: request.idempotencyKey, timestamp: new Date().toISOString(), data: request.input };
    const signingSecret = credential?.signingSecret;
    const signed = signingSecret ? crypto.createHmac('sha256', signingSecret).update(JSON.stringify(payload)).digest('hex') : null;
    return super.execute(integration, { ...mapping, http_method: 'POST', request_mapping: { body: { ...payload, signature: signed } } }, credential, request);
  }
}

export class MockCrmConnector implements IntegrationConnector {
  async execute(_integration: any, _mapping: any, _credential: Record<string, string> | null, request: ConnectorRequest): Promise<ConnectorResult> {
    const phone = String(request.input.phone || '');
    if (phone === 'timeout') throw new Error('TIMEOUT');
    if (phone === 'auth-error') throw new Error('AUTH_FAILED');
    if (phone === 'invalid-schema') throw new Error('RESPONSE_SCHEMA_INVALID');
    if (request.actionId === 'customer.lookup_by_phone') {
      if (phone !== '200') throw new Error('REMOTE_NOT_FOUND');
      return { status: 'completed', latencyMs: 1, data: sanitizeExternalValue({ customer: { id: 'mock-customer-200', name: 'Иван', phone: '200', status: 'active' }, activeOrder: { id: 'mock-order-1', status: 'processing' }, responsible: { name: 'Тестовый менеджер' } }) };
    }
    if (request.actionId === 'order.get_status') return { status: 'completed', latencyMs: 1, data: { orderId: String(request.input.orderId || ''), status: 'processing' } };
    if (['ticket.create', 'customer.add_note', 'call_result.save'].includes(request.actionId)) return { status: 'completed', latencyMs: 1, data: { accepted: true }, externalObjectId: `mock-${request.idempotencyKey?.slice(0, 12)}` };
    throw new Error('ACTION_NOT_ALLOWED');
  }
  async health() { return { status: 'connected', latencyMs: 1 }; }
}

export function createConnector(providerType: string, fetcher?: FetchLike): IntegrationConnector {
  if (providerType === 'mock_crm') return new MockCrmConnector();
  if (providerType === 'generic_rest') return new GenericRestConnector(fetcher);
  if (providerType === 'generic_webhook') return new GenericWebhookConnector(fetcher);
  throw new Error('INTEGRATION_DISABLED');
}
