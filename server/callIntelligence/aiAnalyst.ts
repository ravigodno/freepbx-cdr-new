import crypto from 'crypto';
import { sanitizeLogText } from '../logAnalysis/redaction.js';
import { buildCallIntelligenceDiagnosis, buildCallIntelligenceCore, type CallIntelligenceDeps, type IntelligenceInput } from './service.js';
import { buildCallIntelligenceInsights } from './insights.js';
import { buildCallIntelligenceReport, normalizeReportType, type ReportType } from './reports.js';

export interface CallIntelligenceContext {
  kind: 'call' | 'report';
  call?: Record<string, unknown>;
  diagnosis?: Record<string, unknown>;
  evidence: Array<{ source: string; time?: string | null; message: string }>;
  route: Array<{ type: string; label: string; confidence?: string }>;
  quality?: Record<string, unknown>;
  problems: Array<Record<string, unknown>>;
  insights?: Record<string, unknown>;
  recommendations: string[];
}

export interface AiAnalystResult {
  explanation: string;
  facts: Array<{ source: string; message: string }>;
  confidence: string;
  recommendations: string[];
  provider: string;
  model: string;
  cached: boolean;
  cacheAgeMs: number;
  generatedAt: string;
}

const TTL = 5 * 60_000, MAX = 100, VERSION = '1';
const cache = new Map<string, { created: number; value: AiAnalystResult }>();
const pending = new Map<string, Promise<AiAnalystResult>>();
const text = (value: unknown, max = 1000) => sanitizeLogText(value, max).trim();
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function anonymizeText(value: unknown): string {
  return text(value, 2000)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/\b[0-9a-f]{0,4}:[0-9a-f:]{2,}\b/gi, '[IP]')
    .replace(/\+?\d[\d() .-]{5,}\d/g, '[NUMBER]')
    .replace(/\b\d{2,6}\b/g, value => ['403','404','408','480','486','487','500','503','603'].includes(value) ? value : '[NUMBER]');
}

export function anonymizeCallIntelligenceContext<T>(value: T): T {
  if (Array.isArray(value)) return value.map(anonymizeCallIntelligenceContext) as T;
  if (!value || typeof value !== 'object') return (typeof value === 'string' ? anonymizeText(value) : value) as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/api.?key|password|passwd|secret|token|authorization|cookie|session/i.test(key)) continue;
    if (/caller|callee|number|extension|endpoint|ip|did|uniqueid|linkedid|call.?id|channel/i.test(key) && item != null) result[key] = `[${key.toUpperCase()}]`;
    else result[key] = anonymizeCallIntelligenceContext(item);
  }
  return result as T;
}

function settingsReady(settings: any) {
  const provider = text(settings?.provider || 'gemini', 40);
  const envKey = provider === 'openai' ? process.env.OPENAI_API_KEY : provider === 'gemini' ? process.env.GEMINI_API_KEY : provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : provider === 'anthropic' || provider === 'claude' ? process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY : '';
  const configured = Boolean(text(settings?.apiKey, 500) || envKey) && (provider !== 'custom' && provider !== 'openai_compatible' || Boolean(text(settings?.baseUrl, 500)));
  return { provider, configured };
}

function factsFrom(context: CallIntelligenceContext) {
  return context.evidence.slice(0, 12).map(row => ({ source: text(row.source, 40), message: anonymizeText(row.message).slice(0, 500) }));
}

function cacheGet(key: string) {
  const row = cache.get(key);
  if (!row || Date.now() - row.created > TTL) { if (row) cache.delete(key); return null; }
  cache.delete(key); cache.set(key, row);
  return { ...row.value, cached: true, cacheAgeMs: Date.now() - row.created };
}
function cacheSet(key: string, value: AiAnalystResult) {
  cache.set(key, { created: Date.now(), value });
  while (cache.size > MAX) cache.delete(cache.keys().next().value!);
}

export async function explainStructuredContext(deps: CallIntelligenceDeps, context: CallIntelligenceContext, keySeed: string): Promise<AiAnalystResult> {
  if (!deps.getAiSettings || !deps.completeAi) throw Object.assign(new Error('AI provider не подключён к Call Intelligence'), { statusCode: 503 });
  const settings = await deps.getAiSettings(), ready = settingsReady(settings);
  if (!ready.configured) throw Object.assign(new Error('AI provider не настроен. Настройте его в разделе AI-админ.'), { statusCode: 503 });
  const sanitized = anonymizeCallIntelligenceContext(context), key = `${VERSION}|${keySeed}|${hash(sanitized)}|${ready.provider}|${text(settings.model, 100)}`;
  const hit = cacheGet(key); if (hit) return hit;
  const existing = pending.get(key); if (existing) return existing;
  const task = (async () => {
    const raw = await deps.completeAi!({
      provider: ready.provider, model: text(settings.model, 100), temperature: Math.min(0.3, Math.max(0, Number(settings.temperature ?? 0.1))),
      apiKey: settings.apiKey, baseUrl: settings.baseUrl, responseType: 'json',
      systemPrompt: 'Ты объясняешь только переданный структурированный результат PBXPuls. Не ищи данные, не добавляй факты и причины. Отделяй подтверждённые факты от вывода, явно указывай уверенность. Если evidence недостаточно, так и напиши. Верни JSON только с полем explanation на русском языке.',
      messages: [{ role: 'user', text: JSON.stringify(sanitized) }]
    });
    let parsed: any; try { parsed = JSON.parse(String(raw).replace(/^```json\s*|\s*```$/g, '')); } catch { throw new Error('AI provider вернул ответ в неподдерживаемом формате'); }
    const explanation = anonymizeText(parsed?.explanation).slice(0, 4000);
    if (!explanation) throw new Error('AI provider вернул пустое объяснение');
    const result: AiAnalystResult = { explanation, facts: factsFrom(sanitized), confidence: text(context.diagnosis?.confidence || (context.problems.length ? 'high' : 'low'), 20), recommendations: context.recommendations.map(anonymizeText).filter(Boolean).slice(0, 12), provider: ready.provider, model: text(settings.model, 100), cached: false, cacheAgeMs: 0, generatedAt: new Date().toISOString() };
    cacheSet(key, result); return result;
  })().finally(() => pending.delete(key));
  pending.set(key, task); return task;
}

export async function explainCall(deps: CallIntelligenceDeps, input: IntelligenceInput) {
  const [core, diagnosis] = await Promise.all([buildCallIntelligenceCore(deps, input), buildCallIntelligenceDiagnosis(deps, input)]);
  const insights = await buildCallIntelligenceInsights(deps, '24h');
  const context: CallIntelligenceContext = {
    kind: 'call', call: { direction: core.summary?.direction, duration: core.summary?.duration, disposition: core.summary?.disposition, state: core.summary?.state },
    diagnosis: { status: diagnosis.status, summary: diagnosis.summary, confidence: diagnosis.confidence, rulesVersion: diagnosis.rulesVersion },
    evidence: diagnosis.evidence || [], route: diagnosis.route || [], quality: diagnosis.quality,
    problems: (diagnosis.problems || []).map(problem => ({ type: problem.type, code: problem.code, title: problem.title, severity: problem.severity, confidence: problem.confidence })),
    insights: { similarProblems: insights.insights.filter(item => diagnosis.problems.some(problem => problem.code === item.type)).reduce((sum, item) => sum + item.count, 0) },
    recommendations: diagnosis.recommendations || []
  };
  return explainStructuredContext(deps, context, `call:${text(core.summary?.id || input.query, 255)}:${diagnosis.rulesVersion}`);
}

export async function explainReport(deps: CallIntelligenceDeps, requested: unknown) {
  const type: ReportType = normalizeReportType(requested), report = await buildCallIntelligenceReport(deps, type);
  const context: CallIntelligenceContext = { kind: 'report', evidence: report.problems.slice(0, 10).map(item => ({ source: item.category, message: `${item.title}: ${item.count}` })), route: [], quality: report.quality, problems: report.problems.slice(0, 10), insights: { summary: report.summary, calls: report.calls, sla: report.sla, security: report.security }, recommendations: report.recommendations.map(item => item.text) };
  return explainStructuredContext(deps, context, `report:${type}:${report.generatedAt}`);
}
