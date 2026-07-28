export type ReconciliationConfidence = 'exact' | 'high' | 'medium' | 'unmatched';

export interface UsageCallForReconciliation {
  id: number;
  occurredAt: string;
  counterparty: string | null;
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
}

type QueryCdr = (sql: string, params: any[]) => Promise<any[]>;

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const sqlDate = (value: string): string => new Date(value).toISOString().slice(0, 19).replace('T', ' ');

export async function reconcileMtsOutgoingCall(
  event: UsageCallForReconciliation,
  queryCdr: QueryCdr
): Promise<CdrReconciliationResult> {
  const destination = digits(event.counterparty);
  if (!destination || !Number.isFinite(Date.parse(event.occurredAt))) {
    return {
      usageEventId: event.id, cdrUniqueid: null, cdrLinkedid: null, confidence: 'unmatched',
      matchedBy: [], timeDifferenceSeconds: null, durationDifferenceSeconds: null
    };
  }
  const occurredMs = Date.parse(event.occurredAt);
  const from = sqlDate(new Date(occurredMs - 120_000).toISOString());
  const to = sqlDate(new Date(occurredMs + 120_000).toISOString());
  const candidates = await queryCdr(
    `SELECT uniqueid,linkedid,calldate,dst,dcontext,duration,billsec
     FROM cdr
     WHERE calldate BETWEEN ? AND ? AND dcontext='from-internal'
       AND REPLACE(REPLACE(REPLACE(REPLACE(dst,'+',''),' ',''),'-',''),'(', '') LIKE ?
     ORDER BY ABS(TIMESTAMPDIFF(SECOND,calldate,?)) ASC LIMIT 20`,
    [from, to, `%${destination.slice(-10)}`, sqlDate(event.occurredAt)]
  );
  const normalized = candidates.map(row => {
    const timeDifferenceSeconds = Math.abs(Math.round((Date.parse(String(row.calldate).replace(' ', 'T') + 'Z') - occurredMs) / 1000));
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
      matchedBy: [], timeDifferenceSeconds: null, durationDifferenceSeconds: null
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
    matchedBy: confidence === 'unmatched' ? [] : ['destination', 'occurred_at', 'direction', ...(durationDifference === null ? [] : ['duration'])],
    timeDifferenceSeconds: best.timeDifferenceSeconds,
    durationDifferenceSeconds: durationDifference
  };
}
