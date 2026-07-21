import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { buildCoreCallTrace, buildLogEnrichment, findCallTraceCandidates, maskTraceForReport, type CallTraceDeps } from '../logAnalysis/callTrace.js';
import { listLogEvents } from '../logAnalysis/storage.js';
import { diagnoseCall, type CallDiagnosis } from './diagnosis.js';

export interface CallIntelligenceDeps extends CallTraceDeps {
  getLiveChannels?: () => Promise<any[]>;
  getSipDialogs?: () => { dialogs: any[]; events: any[]; engine: string; session: any };
  getAiSettings?: () => Promise<any>;
  completeAi?: (params: {
    provider: string; model: string; temperature: number; systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; text: string }>;
    responseType?: 'json' | 'text'; apiKey?: string; baseUrl?: string;
  }) => Promise<string>;
}

export interface IntelligenceInput {
  query: string;
  queryType?: string;
  from?: string;
  to?: string;
  limit?: number;
  signal?: AbortSignal;
}

const DIAGNOSIS_TTL = 5 * 60_000, DIAGNOSIS_CACHE_MAX = 100;
const diagnosisCache = new Map<string, { createdAt: number; value: CallDiagnosis }>();
const diagnosisKey = (input: IntelligenceInput) => `1|${safeText(input.query, 255)}|${safeText(input.queryType || 'auto', 32)}|${safeText(input.from, 40)}|${safeText(input.to, 40)}`;
function diagnosisCacheGet(key: string) {
  const row = diagnosisCache.get(key);
  if (!row || Date.now() - row.createdAt > DIAGNOSIS_TTL) { if (row) diagnosisCache.delete(key); return null; }
  diagnosisCache.delete(key); diagnosisCache.set(key, row);
  return { ...row.value, profile: { ...row.value.profile, cacheHit: true, cacheAgeMs: Date.now() - row.createdAt, ttlMs: DIAGNOSIS_TTL } };
}
function diagnosisCacheSet(key: string, value: CallDiagnosis) {
  diagnosisCache.set(key, { createdAt: Date.now(), value });
  while (diagnosisCache.size > DIAGNOSIS_CACHE_MAX) diagnosisCache.delete(diagnosisCache.keys().next().value!);
}

const safeText = (value: unknown, max = 255) => String(value || '').trim().slice(0, max);
const channelEndpoint = (value: unknown) => String(value || '').match(/^(?:PJSIP|SIP)\/([^;/-]+(?:-[^;]+)?)-[0-9a-f]+/i)?.[1] || '';
const logicalId = (row: any) => safeText(row?.linkedid || row?.uniqueid, 191);

function buildSummary(trace: any, live: any[]) {
  const cdr = trace.cdr || [];
  const first = cdr[0];
  const answered = cdr.find((row: any) => String(row.disposition).toUpperCase() === 'ANSWERED' && Number(row.billsec) > 0);
  const last = cdr[cdr.length - 1];
  const liveRow = live[0];
  const startedAt = first?.calldate || liveRow?.startTime || liveRow?.StartTime || null;
  const duration = cdr.length ? Math.max(...cdr.map((row: any) => Number(row.duration) || 0)) : Number(liveRow?.duration || 0);
  return {
    id: trace.linkedid || logicalId(first) || safeText(liveRow?.linkedid || liveRow?.Linkedid || liveRow?.uniqueid || liveRow?.Uniqueid, 191),
    linkedid: trace.linkedid || logicalId(first) || null,
    uniqueid: first?.uniqueid || liveRow?.uniqueid || liveRow?.Uniqueid || null,
    state: cdr.length ? 'completed' : live.length ? 'live' : 'not_found',
    direction: trace.direction || 'unknown',
    directionLabel: trace.directionLabel || 'Неизвестно',
    caller: first?.cnum || first?.src || liveRow?.callerId || liveRow?.CallerIDNum || null,
    callee: answered?.dst || last?.dst || liveRow?.exten || liveRow?.Exten || null,
    did: cdr.find((row: any) => row.did)?.did || liveRow?.did || null,
    extension: cdr.find((row: any) => /^\d{2,6}$/.test(String(row.dst || '')))?.dst || null,
    trunk: cdr.map((row: any) => [channelEndpoint(row.channel), channelEndpoint(row.dstchannel)]).flat().find((value: string) => value && !/^\d{2,6}$/.test(value)) || liveRow?.trunk || null,
    queue: cdr.find((row: any) => /queue/i.test(`${row.lastapp} ${row.dcontext}`))?.dst || null,
    operator: answered && /^\d{2,6}$/.test(String(answered.dst || '')) ? answered.dst : null,
    startedAt,
    duration,
    billsec: cdr.length ? Math.max(...cdr.map((row: any) => Number(row.billsec) || 0)) : 0,
    disposition: answered ? 'ANSWERED' : last?.disposition || (live.length ? 'IN PROGRESS' : 'UNKNOWN'),
    recordingAvailable: cdr.some((row: any) => Boolean(row.recordingfile)),
    cdrCount: trace.cdrCount || 0,
    celCount: trace.celCount || 0
  };
}

async function findLive(deps: CallIntelligenceDeps, query: string) {
  if (!deps.getLiveChannels) return [];
  const rows = await deps.getLiveChannels().catch(() => []);
  return rows.filter((row: any) => [row.linkedid,row.Linkedid,row.uniqueid,row.Uniqueid,row.channel,row.Channel,row.callId,row.CallID]
    .some(value => safeText(value) === query));
}

export async function getCallIntelligenceCandidates(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  return findCallTraceCandidates(deps, input as any);
}

export async function buildCallIntelligenceCore(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const started = Date.now();
  const trace = await buildCoreCallTrace(deps, { ...input, mode: 'core' } as any);
  const live = trace.cdrCount ? [] : await findLive(deps, safeText(input.query, 255));
  const summary = buildSummary(trace, live);
  const recordings = (trace.cdr || []).filter((row: any) => row.recordingfile).map((row: any) => ({
    uniqueid: row.uniqueid,
    channel: row.channel,
    filename: String(row.recordingfile).split(/[\\/]/).pop(),
    recordedAt: row.calldate,
    duration: Number(row.billsec || row.duration || 0)
  }));
  return maskTraceForReport({
    mode: summary.state === 'live' ? 'live' : 'core', summary, timeline: trace.timeline, graph: trace.graph,
    cdr: trace.cdr, cel: trace.cel, recordings, diagnosis: trace.summary, window: trace.window,
    cache: trace.cache, profile: { ...trace.profile, intelligenceMs: Date.now() - started }, partial: true
  });
}

export async function buildCallIntelligenceLogs(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const enrichment = await buildLogEnrichment(deps, { ...input, mode: 'logs', includeRaw: false } as any);
  return maskTraceForReport(enrichment);
}

export async function buildCallIntelligenceSip(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const query = safeText(input.query, 255).toLowerCase();
  const capture = deps.getSipDialogs?.() || { dialogs: [], events: [], engine: 'PBXPuls SIP parser', session: null };
  const dialogs = capture.dialogs.filter((dialog: any) => [dialog.callId,dialog.from,dialog.to,dialog.requestUri]
    .some(value => String(value || '').toLowerCase().includes(query)));
  const callIds = new Set(dialogs.map((dialog: any) => String(dialog.callId)));
  const events = capture.events.filter((event: any) => callIds.has(String(event.callId))).map(({ raw: _raw, ...event }: any) => event);
  return maskTraceForReport({ engine: capture.engine, session: capture.session, dialogs, events, available: dialogs.length > 0 });
}

export async function buildCallIntelligenceQuality(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const core = await buildCoreCallTrace(deps, { ...input, mode: 'core' } as any);
  const endpoints = [...new Set((core.cdr || []).flatMap((row: any) => [channelEndpoint(row.channel),channelEndpoint(row.dstchannel),row.src,row.dst])
    .map(String).filter(value => /^\d{2,6}$/.test(value) || /^[A-Za-z][A-Za-z0-9_.-]{1,63}$/.test(value)))].slice(0, 20);
  if (!endpoints.length || !core.window) return { available: false, reason: 'rtcp_unavailable', source: 'RTCP', rows: [] };
  const placeholders = endpoints.map(() => '?').join(',');
  const rows = await queryPBXPulsDb(`SELECT ext,jitter_ms,rtp_loss,mos,sip_rtt_ms,sampled_at FROM quality_rtcp_history
    WHERE ext IN (${placeholders}) AND sampled_at BETWEEN ? AND ? ORDER BY sampled_at ASC LIMIT 500`,
    [...endpoints, core.window.from.slice(0,19).replace('T',' '), core.window.to.slice(0,19).replace('T',' ')]).catch(() => []);
  return { available: rows.length > 0, reason: rows.length ? null : 'rtcp_unavailable', source: 'RTCP', rows };
}

export async function buildCallIntelligenceSecurity(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const core = await buildCoreCallTrace(deps, { ...input, mode: 'core' } as any);
  if (!core.window) return { rows: [], total: 0 };
  const result = await listLogEvents({ from: core.window.from, to: core.window.to, grouped: 'false', page: 1, pageSize: 100 });
  const identifiers = new Set((core.cdr || []).flatMap((row: any) => [row.src,row.dst,row.cnum,row.did,channelEndpoint(row.channel),channelEndpoint(row.dstchannel)]).map(safeText).filter(Boolean));
  const rows = result.rows.filter((row: any) => {
    const security = ['security','fail2ban'].includes(String(row.category)) || /auth|ban|firewall|security/i.test(`${row.eventType} ${row.sourceName}`);
    const related = [row.extension,row.phone,row.sipPeer,row.trunk].some((value: any) => identifiers.has(safeText(value)))
      || [...identifiers].some(value => value.length >= 3 && String(row.message || '').includes(value));
    return security && related;
  });
  return maskTraceForReport({ rows, total: rows.length });
}

export async function buildCallIntelligenceDiagnosis(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const key = diagnosisKey(input), hit = diagnosisCacheGet(key);
  if (hit) return hit;
  const started = Date.now();
  const core = await buildCallIntelligenceCore(deps, input);
  const [sip, quality, security] = await Promise.all([
    buildCallIntelligenceSip(deps, input),
    buildCallIntelligenceQuality(deps, input),
    buildCallIntelligenceSecurity(deps, input)
  ]);
  const value = diagnoseCall({ core, sip, quality, security });
  value.profile = { ...value.profile, durationMs: Date.now() - started, cacheHit: false, cacheAgeMs: 0, ttlMs: DIAGNOSIS_TTL };
  diagnosisCacheSet(key, value);
  return value;
}
