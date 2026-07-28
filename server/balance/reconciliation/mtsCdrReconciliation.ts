export type ReconciliationConfidence = 'exact' | 'high' | 'medium' | 'unmatched';

export interface UsageCallForReconciliation {
  id: number;
  occurredAt: string;
  direction: 'incoming' | 'outgoing';
  caller: string | null;
  callee: string | null;
  actualUnits: number | null;
}

export interface CdrReconciliationResult {
  usageEventId: number;
  cdrUniqueid: string | null;
  cdrLinkedid: string | null;
  confidence: ReconciliationConfidence;
  matchedBy: string[];
  timeDifferenceSeconds: number | null;
  durationDifferenceSeconds: number | null;
  caller: string | null;
  callee: string | null;
}

type QueryCdr = (sql: string, params: any[]) => Promise<any[]>;

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const sqlDate = (value: string): string => new Date(value).toISOString().slice(0, 19).replace('T', ' ');

export async function reconcileMtsCall(
  event: UsageCallForReconciliation,
  queryCdr: QueryCdr
): Promise<CdrReconciliationResult> {
  const target = digits(event.direction === 'outgoing' ? event.callee : event.callee);
  if (!target || !Number.isFinite(Date.parse(event.occurredAt))) {
    return {
      usageEventId: event.id, cdrUniqueid: null, cdrLinkedid: null, confidence: 'unmatched',
      matchedBy: [], timeDifferenceSeconds: null, durationDifferenceSeconds: null,
      caller: event.caller, callee: event.callee
    };
  }
  const occurredMs = Date.parse(event.occurredAt);
  const from = sqlDate(new Date(occurredMs - 4 * 3600_000).toISOString());
  const to = sqlDate(new Date(occurredMs + 4 * 3600_000).toISOString());
  const numberColumn = event.direction === 'outgoing' ? 'dst' : 'did';
  let candidates = await queryCdr(
    `SELECT uniqueid,linkedid,calldate,src,dst,did,dcontext,duration,billsec
     FROM cdr
     WHERE calldate BETWEEN ? AND ?
       AND REPLACE(REPLACE(REPLACE(REPLACE(${numberColumn},'+',''),' ',''),'-',''),'(', '') LIKE ?
     ORDER BY ABS(TIMESTAMPDIFF(SECOND,calldate,?)) ASC LIMIT 20`,
    [from, to, `%${target.slice(-10)}`, sqlDate(event.occurredAt)]
  );
  if (event.direction === 'incoming' && candidates.length === 0) {
    candidates = await queryCdr(
      `SELECT uniqueid,linkedid,calldate,src,dst,did,dcontext,duration,billsec
       FROM cdr
       WHERE calldate BETWEEN ? AND ? AND dcontext<>'from-internal' AND src<>''
       ORDER BY calldate ASC LIMIT 500`,
      [from, to]
    );
  }
  const normalized = candidates.map(row => {
    const cdrMs = Date.parse(String(row.calldate).replace(' ', 'T') + 'Z');
    const timeDifferenceSeconds = Math.min(
      Math.abs(Math.round((cdrMs - occurredMs) / 1000)),
      Math.abs(Math.round((cdrMs - (occurredMs + 3 * 3600_000)) / 1000))
    );
    const cdrDuration = Number(row.billsec ?? row.duration);
    const durationDifferenceSeconds = event.actualUnits === null || !Number.isFinite(cdrDuration)
      ? null
      : Math.abs(Math.round(cdrDuration - event.actualUnits));
    return { row, timeDifferenceSeconds, durationDifferenceSeconds };
  }).sort((a, b) => {
    const durationA = a.durationDifferenceSeconds ?? 999999;
    const durationB = b.durationDifferenceSeconds ?? 999999;
    return a.timeDifferenceSeconds - b.timeDifferenceSeconds || durationA - durationB;
  });
  const best = normalized[0];
  if (!best) {
    return {
      usageEventId: event.id, cdrUniqueid: null, cdrLinkedid: null, confidence: 'unmatched',
      matchedBy: [], timeDifferenceSeconds: null, durationDifferenceSeconds: null,
      caller: event.caller, callee: event.callee
    };
  }
  const durationDifference = best.durationDifferenceSeconds;
  const confidence: ReconciliationConfidence =
    best.timeDifferenceSeconds <= 5 && durationDifference !== null && durationDifference <= 2 ? 'exact'
      : best.timeDifferenceSeconds <= 20 && (durationDifference === null || durationDifference <= 5) ? 'high'
        : best.timeDifferenceSeconds <= 120 && (durationDifference === null || durationDifference <= 30) ? 'medium'
          : 'unmatched';
  return {
    usageEventId: event.id,
    cdrUniqueid: confidence === 'unmatched' ? null : String(best.row.uniqueid || '') || null,
    cdrLinkedid: confidence === 'unmatched' ? null : String(best.row.linkedid || '') || null,
    confidence,
    matchedBy: confidence === 'unmatched' ? [] : [event.direction === 'outgoing' ? 'destination' : 'did', 'occurred_at', 'direction', ...(durationDifference === null ? [] : ['duration'])],
    timeDifferenceSeconds: best.timeDifferenceSeconds,
    durationDifferenceSeconds: durationDifference,
    caller: confidence !== 'unmatched' && event.direction === 'incoming' ? digits(best.row.src) || event.caller : event.caller,
    callee: event.callee
  };
}

export const reconcileMtsOutgoingCall = reconcileMtsCall;
