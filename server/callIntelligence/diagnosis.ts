export type DiagnosisStatus = 'no_problem' | 'problem_found' | 'insufficient_data';
export type DiagnosisConfidence = 'confirmed' | 'high' | 'medium' | 'low';
export type DiagnosisSeverity = 'critical' | 'error' | 'warning' | 'notice' | 'info';

export interface DiagnosisEvidence {
  source: 'cdr' | 'cel' | 'sip' | 'log' | 'quality' | 'security' | 'route';
  time?: string | null;
  message: string;
  field?: string;
  value?: string | number | null;
}

export interface DiagnosisProblem {
  type: 'sip' | 'asterisk' | 'registration' | 'quality' | 'queue' | 'security' | 'call';
  code: string;
  title: string;
  severity: DiagnosisSeverity;
  confidence: DiagnosisConfidence;
  evidence: DiagnosisEvidence[];
  recommendations: string[];
}

export interface CallDiagnosis {
  status: DiagnosisStatus;
  summary: string;
  problems: DiagnosisProblem[];
  evidence: DiagnosisEvidence[];
  confidence: DiagnosisConfidence;
  recommendations: string[];
  route: Array<{ type: string; label: string; confidence: DiagnosisConfidence }>;
  quality: { available: boolean; status: 'good' | 'problem' | 'insufficient_data'; reason: string | null };
  evaluatedAt: string;
  rulesVersion: string;
  profile?: { durationMs: number; cacheHit?: boolean; cacheAgeMs?: number; ttlMs?: number };
}

export interface DiagnosisInput {
  core?: any;
  sip?: any;
  logs?: any;
  quality?: any;
  security?: any;
}

const RULES_VERSION = '1';
const rank: Record<DiagnosisConfidence, number> = { low: 0, medium: 1, high: 2, confirmed: 3 };
const severityRank: Record<DiagnosisSeverity, number> = { info: 0, notice: 1, warning: 2, error: 3, critical: 4 };
const text = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => text(value).toUpperCase();
const numeric = (value: unknown): number | null => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const eventTime = (row: any) => row?.occurredAt || row?.timestamp || row?.eventtime || row?.calldate || row?.sampled_at || null;
const eventText = (row: any) => text(row?.message || row?.description || row?.title || row?.rawMessage || row?.statusText || row?.reason || row?.eventtype || row?.type);
const evidence = (source: DiagnosisEvidence['source'], row: any, message?: string, field?: string, value?: any): DiagnosisEvidence => ({ source, time: eventTime(row), message: message || eventText(row), field, value });

const sipRules: Record<number, { title: string; severity: DiagnosisSeverity; recommendation: string }> = {
  403: { title: 'SIP-сервер отклонил вызов: Forbidden', severity: 'error', recommendation: 'Проверить авторизацию, разрешения и настройки SIP-транка' },
  404: { title: 'SIP-направление не найдено', severity: 'error', recommendation: 'Проверить номер назначения и правила маршрутизации' },
  408: { title: 'Истёк таймаут ответа SIP', severity: 'error', recommendation: 'Проверить доступность удалённого SIP-сервера и сетевой маршрут' },
  480: { title: 'Абонент временно недоступен', severity: 'warning', recommendation: 'Проверить регистрацию endpoint и повторить вызов позднее' },
  486: { title: 'Абонент занят', severity: 'notice', recommendation: 'Проверить занятость абонента или настройки обработки Busy' },
  487: { title: 'Вызов отменён до ответа', severity: 'notice', recommendation: 'Проверить, кто отменил вызов, и длительность ожидания ответа' },
  500: { title: 'Удалённый SIP-сервер вернул внутреннюю ошибку', severity: 'error', recommendation: 'Проверить журнал и состояние удалённого SIP-сервера' },
  503: { title: 'Удалённый SIP-сервер или транк недоступен', severity: 'critical', recommendation: 'Проверить регистрацию и доступность SIP-транка' },
  603: { title: 'Вызов отклонён вызываемой стороной', severity: 'notice', recommendation: 'Проверить причину отклонения у вызываемой стороны' }
};

function sipCode(row: any): number | null {
  for (const value of [row?.statusCode, row?.responseCode, row?.code, row?.status]) {
    const match = text(value).match(/\b([1-6]\d\d)\b/);
    if (match) return Number(match[1]);
  }
  const match = eventText(row).match(/\b([1-6]\d\d)\b/);
  return match ? Number(match[1]) : null;
}

function addProblem(target: DiagnosisProblem[], problem: DiagnosisProblem) {
  if (!target.some(item => item.code === problem.code && item.title === problem.title)) target.push(problem);
}

function inspectSip(rows: any[], problems: DiagnosisProblem[]) {
  for (const row of rows) {
    const code = sipCode(row), rule = code === null ? undefined : sipRules[code];
    if (!rule) continue;
    addProblem(problems, { type: 'sip', code: `sip_${code}`, title: rule.title, severity: rule.severity, confidence: 'confirmed', evidence: [evidence('sip', row, `${code} ${eventText(row) || 'SIP response'}`, 'statusCode', code)], recommendations: [rule.recommendation] });
  }
}

function inspectDisposition(core: any, problems: DiagnosisProblem[]) {
  const rows = core?.cdr || [];
  const rules: Record<string, { title: string; code: string; recommendation: string; severity: DiagnosisSeverity }> = {
    CHANUNAVAIL: { title: 'Канал назначения недоступен', code: 'channel_unavailable', recommendation: 'Проверить регистрацию endpoint или состояние транка', severity: 'error' },
    CONGESTION: { title: 'Сеть или транк сообщили о перегрузке', code: 'congestion', recommendation: 'Проверить доступность и пропускную способность транка', severity: 'error' },
    NOANSWER: { title: 'Нет ответа от вызываемой стороны', code: 'no_answer', recommendation: 'Проверить доступность абонента, timeout маршрута или операторов очереди', severity: 'warning' },
    BUSY: { title: 'Абонент занят', code: 'busy', recommendation: 'Проверить обработку состояния Busy и повторный набор', severity: 'notice' },
    FAILED: { title: 'Asterisk не смог установить соединение', code: 'call_failed', recommendation: 'Проверить маршрут, endpoint и связанные события Asterisk', severity: 'error' }
  };
  for (const row of rows) {
    const disposition = upper(row.disposition), rule = rules[disposition];
    if (!rule) continue;
    addProblem(problems, { type: 'asterisk', code: rule.code, title: rule.title, severity: rule.severity, confidence: 'confirmed', evidence: [evidence('cdr', row, `CDR disposition: ${disposition}`, 'disposition', disposition)], recommendations: [rule.recommendation] });
  }
  const combined = [...(core?.cel || []), ...(core?.timeline || [])];
  for (const row of combined) {
    const message = `${eventText(row)} ${text(row?.appdata)}`;
    const matched = Object.keys(rules).find(key => new RegExp(`\\b${key}\\b`, 'i').test(message));
    if (!matched || rows.some((item: any) => upper(item.disposition) === matched)) continue;
    const rule = rules[matched];
    addProblem(problems, { type: 'asterisk', code: rule.code, title: rule.title, severity: rule.severity, confidence: 'medium', evidence: [evidence('cel', row, message)], recommendations: [rule.recommendation] });
  }
}

function inspectLogs(logs: any, problems: DiagnosisProblem[]) {
  const rows = [...(logs?.timeline || []), ...(logs?.logEvents || [])];
  for (const row of rows) {
    const message = eventText(row);
    if (/endpoint|peer|trunk/i.test(message) && /unreachable|unavailable|not registered|registration.*failed/i.test(message)) {
      addProblem(problems, { type: 'registration', code: 'endpoint_unreachable', title: 'SIP endpoint или транк недоступен', severity: 'error', confidence: row?.confidence === 'exact' || row?.confidence === 'high' ? 'high' : 'medium', evidence: [evidence('log', row, message)], recommendations: ['Проверить регистрацию устройства или SIP-транка'] });
    }
    if (/rejected|forbidden|timeout/i.test(message) && !/rtp/i.test(message)) {
      addProblem(problems, { type: 'asterisk', code: 'asterisk_rejected_or_timeout', title: /timeout/i.test(message) ? 'Asterisk зафиксировал таймаут' : 'Asterisk зафиксировал отклонение вызова', severity: 'error', confidence: 'medium', evidence: [evidence('log', row, message)], recommendations: ['Проверить связанный endpoint, транк и маршрут вызова'] });
    }
  }
}

function inspectQuality(quality: any, problems: DiagnosisProblem[]) {
  const rows = quality?.rows || [];
  if (!quality?.available || !rows.length) return { available: false, status: 'insufficient_data' as const, reason: quality?.reason || 'rtcp_unavailable' };
  let issue = false;
  for (const row of rows) {
    const loss = numeric(row.rtp_loss ?? row.rtpLossPercent), jitter = numeric(row.jitter_ms ?? row.jitterMs), mos = numeric(row.mos);
    if (loss !== null && loss > 5) {
      issue = true;
      addProblem(problems, { type: 'quality', code: loss > 15 ? 'rtp_loss_critical' : 'rtp_loss', title: `Потери RTP ${loss}%`, severity: loss > 15 ? 'critical' : 'warning', confidence: 'confirmed', evidence: [evidence('quality', row, `RTCP packet loss: ${loss}%`, 'rtpLossPercent', loss)], recommendations: ['Проверить сеть между PBX и endpoint'] });
    }
    if (jitter !== null && jitter > 30) {
      issue = true;
      addProblem(problems, { type: 'quality', code: 'rtp_jitter', title: `Высокий RTP jitter: ${jitter} мс`, severity: 'warning', confidence: 'confirmed', evidence: [evidence('quality', row, `RTCP jitter: ${jitter} мс`, 'jitterMs', jitter)], recommendations: ['Проверить задержку, очереди пакетов и перегрузку сети'] });
    }
    if (mos !== null && mos < 3.5) {
      issue = true;
      addProblem(problems, { type: 'quality', code: 'low_mos', title: `Низкая оценка MOS: ${mos}`, severity: 'warning', confidence: 'confirmed', evidence: [evidence('quality', row, `RTCP MOS: ${mos}`, 'mos', mos)], recommendations: ['Проверить RTP-потери, jitter и используемый codec'] });
    }
  }
  return { available: true, status: issue ? 'problem' as const : 'good' as const, reason: null };
}

function inspectQueue(core: any, logs: any, problems: DiagnosisProblem[]) {
  const queueRows = (core?.cdr || []).filter((row: any) => /queue/i.test(`${row.lastapp} ${row.dcontext}`));
  const queueEvents = [...(core?.cel || []), ...(logs?.timeline || [])].filter((row: any) => /ABANDON|EXITWITHTIMEOUT|RINGNOANSWER|queue.*timeout/i.test(`${eventText(row)} ${text(row?.eventtype)} ${text(row?.appdata)}`));
  for (const row of queueEvents) addProblem(problems, { type: 'queue', code: /ABANDON/i.test(eventText(row)) ? 'queue_abandon' : 'queue_timeout', title: /ABANDON/i.test(eventText(row)) ? 'Звонящий покинул очередь до ответа' : 'Истёк таймаут ожидания в очереди', severity: 'warning', confidence: 'high', evidence: [evidence(row?.source ? 'log' : 'cel', row)], recommendations: ['Проверить SLA очереди и доступность операторов'] });
  const bridged = (core?.cel || []).some((row: any) => /BRIDGE_ENTER/i.test(text(row.eventtype))) || (core?.cdr || []).some((row: any) => upper(row.disposition) === 'ANSWERED' && Number(row.billsec) > 0);
  const ringing = (core?.cel || []).some((row: any) => /RING/i.test(text(row.eventtype))) || queueRows.some((row: any) => Number(row.duration) > 0);
  if (queueRows.length && ringing && !bridged && !queueEvents.length) addProblem(problems, { type: 'queue', code: 'queue_unanswered', title: 'Клиент ожидал ответа в очереди, соединение не произошло', severity: 'warning', confidence: 'medium', evidence: [evidence('cdr', queueRows[0], `Queue ${text(queueRows[0].dst)}; bridge отсутствует`)], recommendations: ['Проверить очередь и доступность операторов'] });
}

function inspectSecurity(security: any, problems: DiagnosisProblem[]) {
  const rows = security?.rows || [];
  if (!rows.length) return;
  const selected = rows.slice(0, 5);
  addProblem(problems, { type: 'security', code: 'related_security_events', title: `Во время звонка найдены связанные события безопасности: ${rows.length}`, severity: 'warning', confidence: 'medium', evidence: selected.map((row: any) => evidence('security', row)), recommendations: ['Проверить IP и связанные события в разделе «Безопасность»'] });
}

function buildRoute(core: any) {
  const nodes = core?.graph?.nodes || [], edges = core?.graph?.edges || [];
  if (nodes.length) return nodes.slice(0, 30).map((node: any) => ({ type: node.type || 'channel', label: text(node.label || node.id), confidence: 'high' as DiagnosisConfidence }));
  return (core?.cdr || []).flatMap((row: any) => [row.src && { type: 'source', label: text(row.src), confidence: 'confirmed' as const }, row.dst && { type: /queue/i.test(`${row.lastapp} ${row.dcontext}`) ? 'queue' : 'destination', label: text(row.dst), confidence: 'confirmed' as const }]).filter(Boolean).slice(0, 30);
}

export function diagnoseCall(input: DiagnosisInput): CallDiagnosis {
  const started = Date.now(), core = input.core || {}, problems: DiagnosisProblem[] = [];
  inspectDisposition(core, problems);
  inspectSip([...(input.sip?.events || []), ...(core?.sipEvents || [])], problems);
  inspectLogs(input.logs, problems);
  const quality = inspectQuality(input.quality, problems);
  inspectQueue(core, input.logs, problems);
  inspectSecurity(input.security, problems);
  problems.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || rank[b.confidence] - rank[a.confidence]);
  const answered = (core?.cdr || []).some((row: any) => upper(row.disposition) === 'ANSWERED' && Number(row.billsec) > 0);
  const hasData = Boolean((core?.cdr || []).length || (core?.cel || []).length || (input.sip?.events || []).length);
  const status: DiagnosisStatus = problems.length ? 'problem_found' : hasData ? 'no_problem' : 'insufficient_data';
  const confidence: DiagnosisConfidence = problems.length ? problems.reduce((best, item) => rank[item.confidence] > rank[best] ? item.confidence : best, 'low' as DiagnosisConfidence) : answered ? 'confirmed' : hasData ? 'medium' : 'low';
  const summary = problems.length ? problems[0].title : !hasData ? 'Недостаточно данных для диагностики звонка' : answered ? 'Звонок успешно установлен и завершён; подтверждённых проблем не обнаружено' : 'Подтверждённых проблем не обнаружено, но соединение не подтверждено';
  const allEvidence = problems.flatMap(problem => problem.evidence).slice(0, 50);
  return { status, summary, problems, evidence: allEvidence, confidence, recommendations: [...new Set(problems.flatMap(problem => problem.recommendations))].slice(0, 20), route: buildRoute(core), quality, evaluatedAt: new Date().toISOString(), rulesVersion: RULES_VERSION, profile: { durationMs: Date.now() - started } };
}
