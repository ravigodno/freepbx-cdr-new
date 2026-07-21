import { diagnoseCall, type DiagnosisConfidence, type DiagnosisProblem } from './diagnosis.js';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import type { CallIntelligenceDeps } from './service.js';

export type InsightPeriod = '1h' | '24h' | '7d' | '30d';
export type InsightTrend = 'rising' | 'falling' | 'stable' | 'new';
export type InsightSeverity = 'critical' | 'warning' | 'info';

export interface InsightObject { type: 'trunk' | 'queue' | 'endpoint' | 'extension' | 'channel' | 'ip' | 'unknown'; name: string }
export interface InsightExample { occurredAt: string | null; callId?: string | null; linkedid?: string | null; message: string }
export interface ProblemInsight {
  type: string;
  category: string;
  title: string;
  severity: InsightSeverity;
  count: number;
  previousCount: number;
  changePercent: number | null;
  period: InsightPeriod;
  firstSeen: string | null;
  lastSeen: string | null;
  affectedObjects: InsightObject[];
  examples: InsightExample[];
  trend: InsightTrend;
  confidence: DiagnosisConfidence;
  recommendations: Array<{ text: string; reason: string }>;
}

export interface InsightObservation {
  problem: DiagnosisProblem;
  count: number;
  occurredAt?: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  object?: InsightObject;
  linkedid?: string | null;
  callId?: string | null;
  previous?: boolean;
}

export interface ProblemInsightsResult {
  period: InsightPeriod;
  from: string;
  to: string;
  totalCalls: number;
  problemCalls: number;
  totalProblems: number;
  insights: ProblemInsight[];
  generatedAt: string;
  partial: boolean;
  unavailableSources: string[];
  profile: { durationMs: number; cacheHit: boolean; cacheAgeMs: number; ttlMs: number; responseBytes?: number };
}

const confidenceRank: Record<DiagnosisConfidence, number> = { low: 0, medium: 1, high: 2, confirmed: 3 };
const minDate = (values: Array<string | null | undefined>) => values.filter(Boolean).sort()[0] || null;
const maxDate = (values: Array<string | null | undefined>) => values.filter(Boolean).sort().at(-1) || null;
const insightSeverity = (value: string): InsightSeverity => value === 'critical' ? 'critical' : value === 'error' || value === 'warning' || value === 'notice' ? 'warning' : 'info';
const keyOf = (item: InsightObservation) => `${item.problem.code}|${item.object?.type || 'unknown'}|${item.object?.name || 'unknown'}`;
const trendOf = (count: number, previous: number): { trend: InsightTrend; changePercent: number | null } => {
  if (!previous) return { trend: count ? 'new' : 'stable', changePercent: count ? null : 0 };
  const changePercent = Math.round(((count - previous) / previous) * 100);
  return { trend: changePercent >= 20 ? 'rising' : changePercent <= -20 ? 'falling' : 'stable', changePercent };
};

export function findSimilarProblems(observations: InsightObservation[], type: string, object?: InsightObject) {
  return observations.filter(item => item.problem.code === type && (!object || (item.object?.type === object.type && item.object?.name === object.name)));
}

export function buildProblemInsights(input: {
  period: InsightPeriod;
  from: string;
  to: string;
  observations: InsightObservation[];
  totalCalls?: number;
  problemCalls?: number;
  partial?: boolean;
  unavailableSources?: string[];
}): ProblemInsightsResult {
  const started = Date.now(), current = input.observations.filter(item => !item.previous), previous = input.observations.filter(item => item.previous);
  const groups = new Map<string, InsightObservation[]>();
  for (const item of current) groups.set(keyOf(item), [...(groups.get(keyOf(item)) || []), item]);
  const insights = [...groups.entries()].map(([key, rows]) => {
    const exemplar = rows[0], count = rows.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0);
    const previousCount = previous.filter(row => keyOf(row) === key).reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0);
    const trend = trendOf(count, previousCount), bestConfidence = rows.reduce((best, row) => confidenceRank[row.problem.confidence] > confidenceRank[best] ? row.problem.confidence : best, 'low' as DiagnosisConfidence);
    const affectedObjects = [...new Map(rows.filter(row => row.object?.name).map(row => [`${row.object!.type}|${row.object!.name}`, row.object!])).values()].slice(0, 20);
    const examples = rows.slice().sort((a, b) => Date.parse(String(b.lastSeen || b.occurredAt || 0)) - Date.parse(String(a.lastSeen || a.occurredAt || 0))).slice(0, 5).map(row => ({ occurredAt: row.lastSeen || row.occurredAt || null, linkedid: row.linkedid, callId: row.callId, message: row.problem.evidence[0]?.message || row.problem.title }));
    const reason = `${exemplar.problem.title}: ${count} ${count === 1 ? 'случай' : 'случаев'} за выбранный период`;
    return { type: exemplar.problem.code, category: exemplar.problem.type, title: exemplar.problem.title, severity: insightSeverity(exemplar.problem.severity), count, previousCount, changePercent: trend.changePercent, period: input.period, firstSeen: minDate(rows.map(row => row.firstSeen || row.occurredAt)), lastSeen: maxDate(rows.map(row => row.lastSeen || row.occurredAt)), affectedObjects, examples, trend: trend.trend, confidence: bestConfidence, recommendations: [...new Set(rows.flatMap(row => row.problem.recommendations))].map(text => ({ text, reason })).slice(0, 5) } satisfies ProblemInsight;
  }).sort((a, b) => ({ critical: 3, warning: 2, info: 1 }[b.severity] - { critical: 3, warning: 2, info: 1 }[a.severity]) || b.count - a.count);
  const result: ProblemInsightsResult = { period: input.period, from: input.from, to: input.to, totalCalls: Number(input.totalCalls || 0), problemCalls: Number(input.problemCalls || 0), totalProblems: insights.reduce((sum, item) => sum + item.count, 0), insights, generatedAt: new Date().toISOString(), partial: Boolean(input.partial), unavailableSources: input.unavailableSources || [], profile: { durationMs: Date.now() - started, cacheHit: false, cacheAgeMs: 0, ttlMs: 60_000 } };
  result.profile.responseBytes = Buffer.byteLength(JSON.stringify(result));
  return result;
}

const objectFromCdr = (row: any): InsightObject => {
  const objectKey = String(row.object_key || '');
  if (objectKey.startsWith('queue:')) return { type: 'queue', name: objectKey.slice(6) || 'unknown' };
  if (objectKey.startsWith('channel:')) {
    const name = objectKey.slice(8) || 'unknown';
    return /^\d{2,6}$/.test(name) ? { type: 'endpoint', name } : { type: 'trunk', name };
  }
  const channel = String(row.dstchannel || row.channel || '');
  const endpoint = channel.match(/^(?:PJSIP|SIP)\/([^/-]+)/i)?.[1];
  if (endpoint && !/^\d{2,6}$/.test(endpoint)) return { type: 'trunk', name: endpoint };
  if (/queue/i.test(`${row.lastapp} ${row.dcontext}`)) return { type: 'queue', name: String(row.dst || 'unknown') };
  if (endpoint) return { type: 'endpoint', name: endpoint };
  if (row.dst) return { type: 'extension', name: String(row.dst) };
  return { type: 'channel', name: channel || 'unknown' };
};

export function observationsFromCdr(rows: any[], previous = false): InsightObservation[] {
  return rows.flatMap(row => {
    const diagnosis = diagnoseCall({ core: { cdr: [{ ...row, billsec: Number(row.max_billsec || row.billsec || 0) }], cel: [], graph: { nodes: [], edges: [] } } });
    return diagnosis.problems.map(problem => ({ problem, count: Number(row.problem_count || row.count || 1), firstSeen: row.first_seen || row.calldate, lastSeen: row.last_seen || row.calldate, object: objectFromCdr(row), linkedid: row.example_linkedid || row.linkedid, previous }));
  });
}

export function observationsFromLogs(rows: any[], previous = false): InsightObservation[] {
  return rows.flatMap(row => {
    const payload = { ...row, occurredAt: row.last_seen, message: row.message || row.title, statusCode: String(row.event_type || '').match(/sip[_-]?(\d{3})/i)?.[1] || String(row.message || '').match(/\b([4-6]\d\d)\b/)?.[1] };
    const diagnosis = diagnoseCall({ logs: { timeline: [payload] }, sip: /sip|pjsip/i.test(`${row.category} ${row.event_type} ${row.source_name}`) ? { events: [payload] } : undefined, core: { cdr: [], cel: [], graph: { nodes: [], edges: [] } } });
    const object: InsightObject = row.trunk ? { type: 'trunk', name: String(row.trunk) } : row.sip_peer ? { type: 'endpoint', name: String(row.sip_peer) } : row.extension_number ? { type: 'extension', name: String(row.extension_number) } : row.ip_address ? { type: 'ip', name: String(row.ip_address) } : /queue/i.test(`${row.event_type} ${row.message}`) ? { type: 'queue', name: String(row.service || 'unknown') } : { type: 'unknown', name: String(row.source_name || 'unknown') };
    return diagnosis.problems.map(problem => ({ problem, count: Number(row.problem_count || row.count || 1), firstSeen: row.first_seen, lastSeen: row.last_seen, object, linkedid: row.linkedid, callId: row.call_id, previous }));
  });
}

export function observationsFromQuality(rows: any[], previous = false): InsightObservation[] {
  return rows.flatMap(row => {
    const diagnosis = diagnoseCall({ quality: { available: true, rows: [{ sampled_at: row.last_seen, rtp_loss: row.max_loss, jitter_ms: row.max_jitter, mos: row.min_mos }] }, core: { cdr: [], cel: [], graph: { nodes: [], edges: [] } } });
    return diagnosis.problems.filter(problem => problem.type === 'quality').map(problem => ({ problem, count: Number(row.problem_count || 1), firstSeen: row.first_seen, lastSeen: row.last_seen, object: { type: 'endpoint', name: String(row.ext) } as InsightObject, previous }));
  });
}

export function observationsFromSecurity(rows: any[], previous = false): InsightObservation[] {
  return rows.map(row => ({ problem: { type: 'security', code: /auth/i.test(`${row.category} ${row.title}`) ? 'security_auth_failures' : row.result === 'blocked' ? 'security_ip_blocked' : 'security_suspicious_event', title: row.result === 'blocked' ? 'IP заблокирован во время телефонной активности' : 'Повторяющиеся события безопасности телефонии', severity: Number(row.problem_count || 0) >= 10 ? 'critical' : 'warning', confidence: 'confirmed', evidence: [{ source: 'security', time: row.last_seen, message: String(row.title || row.category) }], recommendations: ['Проверить источник IP и связанные события в разделе «Безопасность»'] }, count: Number(row.problem_count || 1), firstSeen: row.first_seen, lastSeen: row.last_seen, object: { type: 'ip', name: String(row.source_ip || 'unknown') } as InsightObject, previous }));
}

const PERIOD_MS: Record<InsightPeriod, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
const CACHE_TTL = 60_000, CACHE_MAX = 32;
const insightsCache = new Map<string, { createdAt: number; value: ProblemInsightsResult }>();
const sqlDate = (value: Date) => value.toISOString().slice(0, 19).replace('T', ' ');
export function normalizeInsightPeriod(value: unknown): InsightPeriod { return ['1h', '24h', '7d', '30d'].includes(String(value)) ? String(value) as InsightPeriod : '24h'; }
function cacheGet(key: string) { const row = insightsCache.get(key); if (!row || Date.now() - row.createdAt > CACHE_TTL) { if (row) insightsCache.delete(key); return null; } insightsCache.delete(key); insightsCache.set(key, row); return { ...row.value, profile: { ...row.value.profile, cacheHit: true, cacheAgeMs: Date.now() - row.createdAt, ttlMs: CACHE_TTL } }; }
function cacheSet(key: string, value: ProblemInsightsResult) { insightsCache.set(key, { createdAt: Date.now(), value }); while (insightsCache.size > CACHE_MAX) insightsCache.delete(insightsCache.keys().next().value!); }

async function loadWindow(deps: CallIntelligenceDeps, from: Date, to: Date, previous: boolean) {
  const params = [sqlDate(from), sqlDate(to)], unavailable: string[] = [], observations: InsightObservation[] = [];
  let totalCalls = 0, problemCalls = 0;
  const capture = async <T>(source: string, work: () => Promise<T>, fallback: T): Promise<T> => { try { return await work(); } catch { unavailable.push(source); return fallback; } };
  const [cdrRows, logRows, qualityRows, securityRows] = await Promise.all([
    capture('cdr', () => deps.queryCdr(`SELECT calldate,src,dst,dcontext,lastapp,channel,dstchannel,billsec,disposition,uniqueid,linkedid FROM cdr WHERE calldate BETWEEN ? AND ? ORDER BY calldate DESC LIMIT 10000`, params), []),
    capture('log_events', () => queryPBXPulsDb(`SELECT event_type,category,severity,trunk,extension_number,sip_peer,ip_address,source_name,service,title,MAX(message) message,COUNT(*) problem_count,MIN(occurred_at) first_seen,MAX(occurred_at) last_seen,MAX(linkedid) linkedid,MAX(call_id) call_id FROM log_events WHERE occurred_at BETWEEN ? AND ? AND event_type IN ('sip_403','sip_404','sip_408','sip_480','sip_486','sip_487','sip_500','sip_503','sip_603','sip_authentication_failed','sip_registration_timeout','sip_peer_unreachable','asterisk_error','asterisk_warning','queue_timeout','queue_abandon','queue_no_agents','fail2ban_ban','firewall_block') GROUP BY event_type,category,severity,trunk,extension_number,sip_peer,ip_address,source_name,service,title ORDER BY problem_count DESC LIMIT 500`, params), []),
    capture('quality_rtcp_history', () => queryPBXPulsDb(`SELECT ext,COUNT(*) problem_count,MIN(sampled_at) first_seen,MAX(sampled_at) last_seen,MAX(rtp_loss) max_loss,MAX(jitter_ms) max_jitter,MIN(mos) min_mos FROM quality_rtcp_history WHERE sampled_at BETWEEN ? AND ? AND ((rtp_loss IS NOT NULL AND rtp_loss>5) OR (jitter_ms IS NOT NULL AND jitter_ms>30) OR (mos IS NOT NULL AND mos<3.5)) GROUP BY ext LIMIT 500`, params), []),
    capture('security_events', () => queryPBXPulsDb(`SELECT category,source_ip,result,title,SUM(occurrence_count) problem_count,MIN(first_seen_at) first_seen,MAX(last_seen_at) last_seen FROM security_events WHERE last_seen_at BETWEEN ? AND ? AND (result IN ('blocked','failed') OR category REGEXP 'sip|auth') GROUP BY category,source_ip,result,title ORDER BY problem_count DESC LIMIT 500`, params), [])
  ]);
  const callId = (row: any) => String(row.linkedid || row.uniqueid || '');
  const problemRows = cdrRows.filter((row: any) => ['CHANUNAVAIL','CONGESTION','NOANSWER','BUSY','FAILED'].includes(String(row.disposition || '').toUpperCase()));
  totalCalls = new Set(cdrRows.map(callId).filter(Boolean)).size; problemCalls = new Set(problemRows.map(callId).filter(Boolean)).size;
  if (cdrRows.length >= 10000) unavailable.push('cdr_limit');
  observations.push(...observationsFromCdr(problemRows, previous), ...observationsFromLogs(logRows, previous), ...observationsFromQuality(qualityRows, previous), ...observationsFromSecurity(securityRows, previous));
  if (!previous && deps.getSipDialogs) {
    const live = deps.getSipDialogs();
    const rows = (live.events || []).filter((event: any) => { const time = Date.parse(String(event.timestamp || event.occurredAt || '')); return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime(); }).slice(-500).map((event: any) => ({ ...event, category: 'sip', event_type: event.requestMethod || event.statusCode || event.responseCode || 'sip_event', source_name: live.engine, message: event.statusText || event.summary || `${event.statusCode || event.responseCode || ''}`, first_seen: event.timestamp || event.occurredAt, last_seen: event.timestamp || event.occurredAt, problem_count: 1, call_id: event.callId, sip_peer: event.endpoint || event.trunk }));
    observations.push(...observationsFromLogs(rows, false));
  }
  return { observations, totalCalls, problemCalls, unavailable };
}

export async function buildCallIntelligenceInsights(deps: CallIntelligenceDeps, requestedPeriod: unknown): Promise<ProblemInsightsResult> {
  const period = normalizeInsightPeriod(requestedPeriod), key = `1|${period}`, hit = cacheGet(key); if (hit) return hit;
  const started = Date.now(), to = new Date(), from = new Date(to.getTime() - PERIOD_MS[period]), previousFrom = new Date(from.getTime() - PERIOD_MS[period]);
  const [current, previous] = await Promise.all([loadWindow(deps, from, to, false), loadWindow(deps, previousFrom, from, true)]);
  const result = buildProblemInsights({ period, from: from.toISOString(), to: to.toISOString(), observations: [...current.observations, ...previous.observations], totalCalls: current.totalCalls, problemCalls: current.problemCalls, partial: current.unavailable.length > 0 || previous.unavailable.length > 0, unavailableSources: [...new Set([...current.unavailable, ...previous.unavailable])] });
  result.profile = { ...result.profile, durationMs: Date.now() - started, cacheHit: false, cacheAgeMs: 0, ttlMs: CACHE_TTL, responseBytes: Buffer.byteLength(JSON.stringify(result)) };
  cacheSet(key, result); return result;
}
