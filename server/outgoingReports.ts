import type { Express, Request, Response } from 'express';

type QueryCdr = (settings: any, isDemo: boolean, sql: string, params: any[]) => Promise<any[]>;
type Dependencies = {
  requireAuth: any;
  checkPermission: (req: Request, permission: string) => Promise<boolean>;
  readLocalDb: () => Promise<any>;
  queryCdr: QueryCdr;
  isDemoMode: (settings: any) => boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GROUPS = new Set(['hour', 'day', 'week', 'month', 'weekday', 'year']);
const RESULTS = new Set(['all', 'answered', 'no_answer', 'busy', 'failed', 'congestion', 'other']);

export type OutgoingFilters = {
  startDate: string; endDate: string; group: string; extensions: string[];
  trunk: string; result: string; search: string; page: number; pageSize: number; emptySelection: boolean;
};

export function parseOutgoingFilters(query: Record<string, unknown>, now = new Date()): OutgoingFilters {
  const today = now.toISOString().slice(0, 10);
  const fallback = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const startDate = String(query.startDate || fallback);
  const endDate = String(query.endDate || today);
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) throw new Error('Некорректный период');
  const days = Math.floor((Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000);
  if (days < 0) throw new Error('Дата начала позже даты окончания');
  if (days > 366) throw new Error('Максимальный период отчёта — 366 дней');
  const extensions = String(query.extensions || query.extension || '').split(',').map(v => v.trim()).filter(v => /^\d{2,8}$/.test(v)).slice(0, 50);
  const group = GROUPS.has(String(query.group)) ? String(query.group) : 'day';
  const result = RESULTS.has(String(query.result)) ? String(query.result) : 'all';
  return {
    startDate, endDate, group, extensions,
    trunk: String(query.trunk || 'all').trim().slice(0, 120), result,
    search: String(query.search || '').trim().slice(0, 80),
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(100, Math.max(10, Number(query.pageSize) || 25)),
    emptySelection: query.emptySelection === 'true'
  };
}

function placeholders(values: string[]) { return values.map(() => '?').join(','); }
function endpointExpression(column: string) {
  return `SUBSTRING_INDEX(SUBSTRING_INDEX(${column}, '/', -1), '-', 1)`;
}

export function buildOutgoingAttemptsSql(filters: OutgoingFilters, internal: string[]) {
  if (!internal.length) throw new Error('Не удалось определить внутренние номера АТС');
  const inList = placeholders(internal);
  const channelExt = endpointExpression('channel');
  const sql = `
    SELECT call_id, MIN(calldate) AS calldate,
      MAX(internal_extension) AS internal_extension,
      MAX(external_number) AS external_number,
      MAX(normalized_external_number) AS normalized_external_number,
      MAX(trunk) AS trunk,
      CASE WHEN MAX(is_answered)=1 THEN 'answered'
           WHEN MAX(is_busy)=1 THEN 'busy'
           WHEN MAX(is_congestion)=1 THEN 'congestion'
           WHEN MAX(is_failed)=1 THEN 'failed'
           WHEN MAX(is_no_answer)=1 THEN 'no_answer' ELSE 'other' END AS result,
      MAX(is_answered) AS answered,
      MAX(CASE WHEN is_answered=1 THEN billsec ELSE 0 END) AS billsec,
      MAX(CASE WHEN is_answered=1 THEN GREATEST(duration-billsec,0) ELSE NULL END) AS wait_seconds,
      MAX(recordingfile) AS recordingfile,
      MIN(uniqueid) AS technical_id
    FROM (
      SELECT COALESCE(NULLIF(linkedid,''), uniqueid) AS call_id, calldate, uniqueid, recordingfile,
        CASE WHEN dcontext LIKE 'from-internal%' AND dst REGEXP '^[+]?[0-9]{6,20}$' AND ${channelExt} IN (${inList})
             THEN ${channelExt} ELSE NULL END AS internal_extension,
        CASE WHEN dcontext LIKE 'from-internal%' AND dst REGEXP '^[+]?[0-9]{6,20}$' AND ${channelExt} IN (${inList})
             THEN dst ELSE NULL END AS external_number,
        CASE WHEN dcontext LIKE 'from-internal%' AND dst REGEXP '^[+]?[0-9]{6,20}$' AND ${channelExt} IN (${inList})
             THEN CASE WHEN REPLACE(dst,'+','') REGEXP '^8[0-9]{10}$' THEN CONCAT('7',SUBSTRING(REPLACE(dst,'+',''),2)) ELSE REPLACE(dst,'+','') END
             ELSE NULL END AS normalized_external_number,
        CASE WHEN dcontext LIKE 'from-internal%' AND dstchannel<>''
             THEN SUBSTRING_INDEX(dstchannel, '-', 1) ELSE NULL END AS trunk,
        CASE WHEN disposition='ANSWERED' AND billsec>0 THEN 1 ELSE 0 END AS is_answered,
        disposition='BUSY' AS is_busy, disposition='CONGESTION' AS is_congestion,
        disposition='FAILED' AS is_failed, disposition='NO ANSWER' AS is_no_answer,
        duration, billsec
      FROM cdr WHERE calldate BETWEEN ? AND ?
    ) legs
    GROUP BY call_id
    HAVING internal_extension IS NOT NULL AND external_number IS NOT NULL`;
  // SQL placeholders encounter the date range last in text.
  return { sql, params: [...internal, ...internal, ...internal, filters.startDate + ' 00:00:00', filters.endDate + ' 23:59:59'] };
}

function scopedSql(base: string, filters: OutgoingFilters, params: any[]) {
  let sql = `SELECT * FROM (${base}) attempts WHERE 1=1`;
  const out = [...params];
  if (filters.emptySelection) sql += ' AND 1=0';
  if (filters.extensions.length) { sql += ` AND internal_extension IN (${placeholders(filters.extensions)})`; out.push(...filters.extensions); }
  if (filters.trunk !== 'all') { sql += ' AND trunk=?'; out.push(filters.trunk); }
  if (filters.result !== 'all') { sql += ' AND result=?'; out.push(filters.result); }
  if (filters.search) { sql += ' AND (internal_extension LIKE ? OR external_number LIKE ?)'; out.push(`%${filters.search}%`, `%${filters.search}%`); }
  return { sql, params: out };
}

function num(v: any) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
function normalizeRow(row: any) {
  return {
    callId: row.call_id, calldate: row.calldate, internalExtension: row.internal_extension,
    externalNumber: row.external_number, trunk: row.trunk || 'Не определён', result: row.result,
    answered: Boolean(num(row.answered)), billsec: num(row.billsec), waitSeconds: row.wait_seconds == null ? null : num(row.wait_seconds),
    recordingAvailable: Boolean(row.recordingfile), technicalId: row.technical_id
  };
}

export function registerOutgoingReportRoutes(app: Express, deps: Dependencies) {
  app.get('/api/reports/outgoing', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'view_reports'))) return res.status(403).json({ error: 'Access denied: view_reports permission required' });
    let filters: OutgoingFilters;
    try { filters = parseOutgoingFilters(req.query as any); } catch (error: any) { return res.status(400).json({ error: error.message }); }
    try {
      const db = await deps.readLocalDb();
      if (deps.isDemoMode(db.settings)) return res.status(503).json({ error: 'Исходящий отчёт требует доступной CDR АТС' });
      const extensionRows = await deps.queryCdr(db.settings, false, `SELECT id AS extension, description AS name FROM asterisk.devices WHERE tech IN ('sip','pjsip') UNION SELECT extension, name FROM asterisk.users`, []);
      const extensionMap = new Map<string, string>();
      extensionRows.forEach((row: any) => { const ext=String(row.extension||'').trim(); if (/^\d{2,8}$/.test(ext) && !extensionMap.has(ext)) extensionMap.set(ext, String(row.name||ext)); });
      const built = buildOutgoingAttemptsSql(filters, [...extensionMap.keys()]);
      const scoped = scopedSql(built.sql, filters, built.params);
      const groupExpr: Record<string,string> = { hour: `DATE_FORMAT(calldate,'%Y-%m-%d %H:00')`, day: `DATE(calldate)`, week: `DATE_FORMAT(calldate,'%x-W%v')`, month: `DATE_FORMAT(calldate,'%Y-%m-01')`, weekday: `WEEKDAY(calldate)`, year: `DATE_FORMAT(calldate,'%Y-01-01')` };
      const median = `(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(GROUP_CONCAT(wait_seconds ORDER BY wait_seconds), ',', FLOOR((COUNT(wait_seconds)+1)/2)), ',', -1) AS DECIMAL(12,2)) + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(GROUP_CONCAT(wait_seconds ORDER BY wait_seconds), ',', FLOOR((COUNT(wait_seconds)+2)/2)), ',', -1) AS DECIMAL(12,2))) / 2`;
      const [summaryRows, timeline, results, heatmap, extensions, trunks, waitBuckets, durationBuckets, totalRows, detailRows, waits] = await Promise.all([
        deps.queryCdr(db.settings,false,`SELECT COUNT(*) total,COUNT(DISTINCT normalized_external_number) unique_numbers,SUM(answered) answered,SUM(1-answered) missed,AVG(CASE WHEN answered=1 THEN wait_seconds END) avg_wait,AVG(CASE WHEN answered=1 THEN billsec END) avg_talk,SUM(billsec) talk_total FROM (${scoped.sql}) s`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT ${groupExpr[filters.group]} bucket,COUNT(*) attempts,SUM(answered) answered,SUM(1-answered) unanswered,ROUND(100*SUM(answered)/COUNT(*),1) answer_rate,AVG(CASE WHEN answered=1 THEN wait_seconds END) avg_wait,${median} median_wait FROM (${scoped.sql}) s GROUP BY bucket ORDER BY MIN(calldate)`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT result,COUNT(*) count FROM (${scoped.sql}) s GROUP BY result`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT WEEKDAY(calldate) weekday,HOUR(calldate) hour,COUNT(*) attempts,SUM(answered) answered,AVG(CASE WHEN answered=1 THEN wait_seconds END) avg_wait,AVG(CASE WHEN answered=1 THEN billsec END) avg_talk FROM (${scoped.sql}) s GROUP BY weekday,hour`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT internal_extension,COUNT(*) attempts,SUM(answered) answered,ROUND(100*SUM(answered)/COUNT(*),1) answer_rate FROM (${scoped.sql}) s GROUP BY internal_extension ORDER BY attempts DESC`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT COALESCE(trunk,'Не определён') trunk,COUNT(*) attempts,SUM(answered) answered,ROUND(100*SUM(answered)/COUNT(*),1) answer_rate,AVG(CASE WHEN answered=1 THEN wait_seconds END) avg_wait,AVG(CASE WHEN answered=1 THEN billsec END) avg_talk,SUM(result IN ('failed','congestion')) technical_errors FROM (${scoped.sql}) s GROUP BY trunk ORDER BY attempts DESC`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT CASE WHEN wait_seconds<=5 THEN '≤5' WHEN wait_seconds<=10 THEN '6–10' WHEN wait_seconds<=15 THEN '11–15' WHEN wait_seconds<=20 THEN '16–20' WHEN wait_seconds<=30 THEN '21–30' ELSE '>30' END bucket,COUNT(*) count FROM (${scoped.sql}) s WHERE answered=1 GROUP BY bucket`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT CASE WHEN billsec<10 THEN '<10' WHEN billsec<30 THEN '10–30' WHEN billsec<60 THEN '30–60' WHEN billsec<180 THEN '1–3 мин' WHEN billsec<300 THEN '3–5 мин' WHEN billsec<600 THEN '5–10 мин' ELSE '>10 мин' END bucket,COUNT(*) count FROM (${scoped.sql}) s WHERE answered=1 GROUP BY bucket`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT COUNT(*) total FROM (${scoped.sql}) s`,scoped.params),
        deps.queryCdr(db.settings,false,`SELECT s.*,p.attempts_for_number FROM (${scoped.sql}) s JOIN (SELECT normalized_external_number,COUNT(*) attempts_for_number FROM (${scoped.sql}) x GROUP BY normalized_external_number) p USING(normalized_external_number) ORDER BY calldate DESC LIMIT ? OFFSET ?`,[...scoped.params,...scoped.params,filters.pageSize,(filters.page-1)*filters.pageSize]),
        deps.queryCdr(db.settings,false,`SELECT wait_seconds FROM (${scoped.sql}) s WHERE answered=1 AND wait_seconds IS NOT NULL ORDER BY wait_seconds`,scoped.params)
      ]);
      const summary=summaryRows[0]||{}; const total=num(summary.total); const sortedWaits=waits.map((r:any)=>num(r.wait_seconds));
      const mid=Math.floor(sortedWaits.length/2); const medianWait=sortedWaits.length ? (sortedWaits.length%2 ? sortedWaits[mid] : (sortedWaits[mid-1]+sortedWaits[mid])/2) : null;
      const retryRows = await deps.queryCdr(db.settings,false,`SELECT normalized_external_number,GROUP_CONCAT(answered ORDER BY calldate SEPARATOR ',') outcomes FROM (${scoped.sql}) s GROUP BY normalized_external_number`,scoped.params);
      const retryBuckets: Record<string,{numbers:number;answered:number;attempts:number}>={first:{numbers:0,answered:0,attempts:0},second:{numbers:0,answered:0,attempts:0},third:{numbers:0,answered:0,attempts:0},fourth:{numbers:0,answered:0,attempts:0},fifthPlus:{numbers:0,answered:0,attempts:0},never:{numbers:0,answered:0,attempts:0}};
      retryRows.forEach((r:any)=>{ const a=String(r.outcomes||'').split(',').map(Number); const first=a.indexOf(1); const key=first<0?'never':first===0?'first':first===1?'second':first===2?'third':first===3?'fourth':'fifthPlus'; retryBuckets[key].numbers++; a.forEach((v:number,i:number)=>{const k=i===0?'first':i===1?'second':i===2?'third':i===3?'fourth':'fifthPlus'; retryBuckets[k].attempts++; if(v) retryBuckets[k].answered++;}); });
      res.json({ appliedFilters:filters, metadata:{timezone:'PBX database local time',waitTimeSource:'duration_minus_billsec',limitations:['CDR does not contain answer/end timestamps','ANSWERED may include voicemail or an answering machine','retry sequences are limited to the selected period']},
        options:{extensions:[...extensionMap].map(([extension,name])=>({extension,name})),trunks:trunks.map((r:any)=>r.trunk)},
        kpis:{totalAttempts:total,uniqueNumbers:num(summary.unique_numbers),answered:num(summary.answered),unanswered:num(summary.missed),answerRate:total?100*num(summary.answered)/total:0,averageWaitSeconds:summary.avg_wait==null?null:num(summary.avg_wait),medianWaitSeconds:medianWait,averageTalkSeconds:summary.avg_talk==null?null:num(summary.avg_talk),totalTalkSeconds:num(summary.talk_total),firstAttemptRate:retryRows.length?100*retryBuckets.first.answered/retryRows.length:0},
        timeline,results,heatmap,extensions:extensions.map((r:any)=>({...r,name:extensionMap.get(String(r.internal_extension))||r.internal_extension})),trunks,waitBuckets,durationBuckets,retries:retryBuckets,
        details:{page:filters.page,pageSize:filters.pageSize,total:num(totalRows[0]?.total),rows:detailRows.map((r:any)=>({...normalizeRow(r),user:extensionMap.get(String(r.internal_extension))||null,attemptsForNumber:num(r.attempts_for_number)}))}
      });
    } catch (error:any) { console.error('[OUTGOING_REPORT]',error.message); res.status(503).json({error:'База CDR недоступна или отчёт не может быть построен'}); }
  });
}
