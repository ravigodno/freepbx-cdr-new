import type { Express, Request, Response } from 'express';
import { once } from 'node:events';

type QueryCdr = (settings: any, isDemo: boolean, sql: string, params: any[]) => Promise<any[]>;
type Direction = 'incoming' | 'outgoing';

type Dependencies = {
  requireAuth: any;
  checkPermission: (req: Request, permission: string) => Promise<boolean>;
  readLocalDb: () => Promise<any>;
  queryCdr: QueryCdr;
  isDemoMode: (settings: any) => boolean;
  bulkLookup: (phones: string[], req: Request, localDb: any) => Promise<{ matches: Record<string, any>; lookupMs: number; sqlQueryCount: number }>;
  audit: (req: Request, details: Record<string, unknown>) => Promise<void>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_PHONE = /^(?:anonymous|unavailable|restricted|unknown|private|withheld)$/i;
const MAX_UNIQUE_NUMBERS = 20_000;

export function normalizeReportExternalPhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || INVALID_PHONE.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

export function escapeReportCsv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function parseFilters(query: Record<string, unknown>) {
  const now = new Date();
  const endDate = String(query.endDate || now.toISOString().slice(0, 10));
  const startDate = String(query.startDate || new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10));
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate) throw new Error('Некорректный период');
  const extensions = String(query.extensions || query.extension || '')
    .split(',').map(value => value.trim()).filter(value => /^\d{2,8}$/.test(value)).slice(0, 100);
  return {
    startDate, endDate,
    startTime: /^\d{2}:\d{2}$/.test(String(query.startTime)) ? String(query.startTime) : '00:00',
    endTime: /^\d{2}:\d{2}$/.test(String(query.endTime)) ? String(query.endTime) : '23:59',
    extensions,
    search: String(query.search || '').trim().slice(0, 80),
    status: ['all', 'answered', 'missed', 'busy', 'failed', 'no_answer'].includes(String(query.status)) ? String(query.status) : 'all',
    trunk: String(query.trunk || 'all').trim().slice(0, 120),
    queue: String(query.queue || 'all').trim().slice(0, 64)
  };
}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(',');
}

export function buildUniqueNumbersSql(direction: Direction, filters: ReturnType<typeof parseFilters>) {
  const params: any[] = [`${filters.startDate} ${filters.startTime}:00`, `${filters.endDate} ${filters.endTime}:59`];
  const conditions = ['calldate BETWEEN ? AND ?'];
  const incoming = direction === 'incoming';
  conditions.push(incoming
    ? `(did<>'' OR dcontext REGEXP 'from-(trunk|pstn)|ext-did' OR lastapp IN ('Queue','Ring Group'))`
    : `dcontext LIKE 'from-internal%'`);
  if (filters.extensions.length) {
    const list = placeholders(filters.extensions);
    conditions.push(incoming
      ? `(dst IN (${list}) OR channel REGEXP CONCAT('/(', REPLACE(?, ',', '|'), ')-'))`
      : `(src IN (${list}) OR channel REGEXP CONCAT('/(', REPLACE(?, ',', '|'), ')-'))`);
    params.push(...filters.extensions, filters.extensions.join(','));
  }
  if (filters.trunk !== 'all') {
    conditions.push('(channel LIKE ? OR dstchannel LIKE ?)');
    params.push(`%${filters.trunk}%`, `%${filters.trunk}%`);
  }
  if (filters.queue !== 'all') {
    conditions.push(`(lastapp='Queue' AND lastdata LIKE ?)`);
    params.push(`${filters.queue}%`);
  }
  const externalExpression = incoming
    ? `COALESCE(NULLIF(MAX(CASE WHEN did<>'' OR dcontext REGEXP 'from-(trunk|pstn)|ext-did' THEN cnum END),''),NULLIF(MAX(CASE WHEN did<>'' OR dcontext REGEXP 'from-(trunk|pstn)|ext-did' THEN src END),''))`
    : `NULLIF(MAX(CASE WHEN dcontext LIKE 'from-internal%' AND dst REGEXP '^[+]?[0-9 ()-]{7,24}$' THEN dst END),'')`;
  let having = 'external_number IS NOT NULL';
  if (filters.status === 'answered') having += ' AND answered=1';
  if (filters.status === 'missed' || filters.status === 'no_answer') having += ' AND answered=0';
  if (filters.status === 'busy') having += ` AND last_disposition='BUSY'`;
  if (filters.status === 'failed') having += ` AND last_disposition IN ('FAILED','CONGESTION','CHANUNAVAIL')`;
  const searchSql = filters.search ? 'WHERE external_number LIKE ?' : '';
  if (filters.search) params.push(`%${filters.search.replace(/[%_]/g, '\\$&')}%`);
  return {
    sql: `SELECT external_number,MIN(calldate) first_call_at,MAX(calldate) last_call_at,COUNT(*) calls_count,
      SUM(answered) answered_calls,SUM(1-answered) missed_calls,SUM(billsec) total_billsec,
      ROUND(AVG(billsec),2) average_billsec,MIN(first_disposition) first_disposition,MAX(last_disposition) last_disposition
    FROM (
      SELECT COALESCE(NULLIF(linkedid,''),uniqueid) logical_id,MIN(calldate) calldate,
        ${externalExpression} external_number,
        MAX(disposition='ANSWERED' AND billsec>0) answered,
        MAX(CASE WHEN disposition='ANSWERED' THEN billsec ELSE 0 END) billsec,
        SUBSTRING_INDEX(GROUP_CONCAT(disposition ORDER BY calldate ASC),',',1) first_disposition,
        SUBSTRING_INDEX(GROUP_CONCAT(disposition ORDER BY calldate DESC),',',1) last_disposition
      FROM cdr WHERE ${conditions.join(' AND ')}
      GROUP BY logical_id HAVING ${having}
    ) logical_calls ${searchSql}
    GROUP BY external_number ORDER BY last_call_at DESC LIMIT ${MAX_UNIQUE_NUMBERS}`,
    params
  };
}

const headers = [
  'phone','phoneNormalized','direction','callsCount','firstCallAt','lastCallAt','answeredCalls','missedCalls',
  'totalBillsec','averageBillsec','contactFound','contactId','fullName','organization','position','email',
  'contactType','visibility','responsibleUser','department','group','tags','isSpam','firstDisposition',
  'lastDisposition','lastCallStatus','sourceReport'
];

async function writeLine(res: Response, values: unknown[]) {
  if (!res.write(`${values.map(escapeReportCsv).join(';')}\r\n`)) await once(res, 'drain');
}

export function registerUniqueNumberExportRoutes(app: Express, deps: Dependencies) {
  app.get('/api/reports/unique-numbers.csv', deps.requireAuth(), async (req: Request, res: Response) => {
    if (!(await deps.checkPermission(req, 'view_reports'))) return res.status(403).json({ error: 'Access denied: view_reports permission required' });
    const direction: Direction = req.query.direction === 'outgoing' ? 'outgoing' : 'incoming';
    let filters: ReturnType<typeof parseFilters>;
    try { filters = parseFilters(req.query as any); } catch (error: any) { return res.status(400).json({ error: error.message }); }
    try {
      const localDb = await deps.readLocalDb();
      if (deps.isDemoMode(localDb.settings)) return res.status(503).json({ error: 'Экспорт требует доступной CDR АТС' });
      const plan = buildUniqueNumbersSql(direction, filters);
      const rawRows = await deps.queryCdr(localDb.settings, false, plan.sql, plan.params);
      const rows = rawRows.map(row => ({ ...row, phone_normalized: normalizeReportExternalPhone(row.external_number) }))
        .filter(row => row.phone_normalized);
      const merged = new Map<string, any>();
      for (const row of rows) {
        const current = merged.get(row.phone_normalized);
        if (!current) merged.set(row.phone_normalized, row);
        else {
          current.calls_count += Number(row.calls_count || 0);
          current.answered_calls += Number(row.answered_calls || 0);
          current.missed_calls += Number(row.missed_calls || 0);
          current.total_billsec += Number(row.total_billsec || 0);
          current.first_call_at = String(current.first_call_at) < String(row.first_call_at) ? current.first_call_at : row.first_call_at;
          current.last_call_at = String(current.last_call_at) > String(row.last_call_at) ? current.last_call_at : row.last_call_at;
          current.average_billsec = current.calls_count ? current.total_billsec / current.calls_count : 0;
        }
      }
      const uniqueRows = [...merged.values()];
      if (!uniqueRows.length) return res.status(404).json({ error: 'По текущим фильтрам внешние номера не найдены' });
      const lookup = await deps.bulkLookup(uniqueRows.map(row => row.phone_normalized), req, localDb);
      const responsibleUsers = new Map((localDb.users || []).map((user: any) => [
        String(user.id || user.username || ''),
        String(user.name || user.fullName || user.username || user.id || '')
      ]));
      const filename = `pbxpuls_${direction}_unique_numbers_${filters.startDate}_${filters.endDate}.csv`;
      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.write('\uFEFF');
      await writeLine(res, headers);
      for (const row of uniqueRows) {
        const contact = lookup.matches[row.phone_normalized] || null;
        await writeLine(res, [
          row.external_number,row.phone_normalized,direction,Number(row.calls_count || 0),row.first_call_at,row.last_call_at,
          Number(row.answered_calls || 0),Number(row.missed_calls || 0),Number(row.total_billsec || 0),
          Number(row.average_billsec || 0).toFixed(2),Boolean(contact),contact?.id,contact?.name,contact?.company,
          contact?.position,contact?.email,contact?.type,contact?.visibility,responsibleUsers.get(String(contact?.responsibleUserId || '')) || contact?.responsibleUserId,
          contact?.department,contact?.group,Array.isArray(contact?.tags) ? contact.tags.join(', ') : '',Boolean(contact?.isSpam),
          row.first_disposition,row.last_disposition,row.last_disposition,`${direction}_report`
        ]);
      }
      res.end();
      await deps.audit(req, { direction, uniqueNumbers: uniqueRows.length, filters: { ...filters, search: filters.search ? 'present' : 'empty' }, directoryLookupQueries: lookup.sqlQueryCount });
    } catch (error: any) {
      if (!res.headersSent) return res.status(503).json({ error: 'Не удалось подготовить экспорт уникальных номеров' });
      res.destroy(error);
    }
  });
}
