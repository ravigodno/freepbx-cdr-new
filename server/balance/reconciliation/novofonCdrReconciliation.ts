type QueryCdr = (sql: string, params: any[]) => Promise<any[]>;
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const sqlDate = (value: string) => new Date(value).toISOString().slice(0, 19).replace('T', ' ');

export interface NovofonLocalMatch {
  confidence: 'exact' | 'high' | 'conflict' | 'unmatched';
  uniqueid: string | null;
  linkedid: string | null;
  matchedBy: string[];
  timeDifferenceSeconds: number | null;
  durationDifferenceSeconds: number | null;
}

export async function reconcileNovofonLeg(input: { occurredAt: string; direction: string | null; calling: string | null; called: string | null; duration: number | null; extId?: string | null }, queryCdr: QueryCdr): Promise<NovofonLocalMatch> {
  const occurred = Date.parse(input.occurredAt); const target = digits(input.direction === 'out' ? input.called : input.calling);
  if (!Number.isFinite(occurred) || !target) return { confidence: 'unmatched', uniqueid: null, linkedid: null, matchedBy: [], timeDifferenceSeconds: null, durationDifferenceSeconds: null };
  const rows = await queryCdr(`SELECT uniqueid,linkedid,calldate,src,dst,did,dcontext,duration,billsec,userfield FROM cdr
    WHERE calldate BETWEEN ? AND ? AND (RIGHT(REPLACE(REPLACE(REPLACE(src,'+',''),' ',''),'-',''),10)=? OR RIGHT(REPLACE(REPLACE(REPLACE(dst,'+',''),' ',''),'-',''),10)=? OR uniqueid=? OR linkedid=? OR userfield=?)
    ORDER BY ABS(TIMESTAMPDIFF(SECOND,calldate,?)) LIMIT 20`,
    [sqlDate(new Date(occurred - 120_000).toISOString()), sqlDate(new Date(occurred + 120_000).toISOString()), target.slice(-10), target.slice(-10), input.extId || '', input.extId || '', input.extId || '', sqlDate(input.occurredAt)]);
  const scored = rows.map(row => { const cdrAt = Date.parse(`${String(row.calldate).replace(' ', 'T')}Z`); const time = Math.abs(Math.round((cdrAt - occurred) / 1000));
    const duration = input.duration == null ? null : Math.abs(Math.round(Number(row.billsec ?? row.duration) - input.duration)); const external = Boolean(input.extId && [row.uniqueid, row.linkedid, row.userfield].map(String).includes(input.extId));
    const directionOk = input.direction === 'out' ? String(row.dcontext) === 'from-internal' : String(row.dcontext) !== 'from-internal'; const score = (external ? 10000 : 0) + (directionOk ? 1000 : 0) + Math.max(0, 120 - time) + (duration == null ? 0 : Math.max(0, 60 - duration));
    return { row, time, duration, external, directionOk, score }; }).sort((a, b) => b.score - a.score);
  const best = scored[0]; if (!best) return { confidence: 'unmatched', uniqueid: null, linkedid: null, matchedBy: [], timeDifferenceSeconds: null, durationDifferenceSeconds: null };
  if (scored[1] && scored[1].score === best.score) return { confidence: 'conflict', uniqueid: null, linkedid: null, matchedBy: ['ambiguous_candidates'], timeDifferenceSeconds: best.time, durationDifferenceSeconds: best.duration };
  const confidence = best.external || (best.directionOk && best.time <= 5 && (best.duration == null || best.duration <= 2)) ? 'exact'
    : best.directionOk && best.time <= 30 && (best.duration == null || best.duration <= 10) ? 'high' : 'unmatched';
  return { confidence, uniqueid: confidence === 'unmatched' ? null : String(best.row.uniqueid || '') || null, linkedid: confidence === 'unmatched' ? null : String(best.row.linkedid || '') || null,
    matchedBy: confidence === 'unmatched' ? [] : [...(best.external ? ['external_id'] : ['normalized_number']), 'direction', 'occurred_at', ...(best.duration == null ? [] : ['duration'])], timeDifferenceSeconds: best.time, durationDifferenceSeconds: best.duration };
}
