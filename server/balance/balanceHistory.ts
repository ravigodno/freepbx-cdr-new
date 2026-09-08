import {queryPBXPulsDb} from '../pbxpulsDb.js';

export type BalanceHistorySeries = {
  sourceId: string;
  displayName: string;
  currency: string | null;
  points: Array<{date: string; balance: number | null}>;
};

// Rows are ordered by measured_at and id: the last real snapshot wins for a day.
export function buildBalanceHistory(rows: any[], days: number, now = new Date()): BalanceHistorySeries[] {
  const dates = Array.from({length: days}, (_, i) => {
    const date = new Date(now); date.setUTCDate(date.getUTCDate() - days + 1 + i);
    return date.toISOString().slice(0, 10);
  });
  const series = new Map<string, BalanceHistorySeries>();
  for (const row of rows) {
    const key = JSON.stringify([row.sourceId, row.currency || null]);
    if (!series.has(key)) series.set(key, {sourceId: row.sourceId, displayName: row.displayName,
      currency: row.currency || null, points: dates.map(date => ({date, balance: null}))});
    if (row.balanceAmount == null || row.balanceAmount === '') continue;
    const date = row.measuredAt instanceof Date ? row.measuredAt.toISOString().slice(0, 10) : String(row.measuredAt || '').slice(0, 10);
    const point = series.get(key)!.points.find(p => p.date === date);
    if (point && Number.isFinite(Number(row.balanceAmount))) point.balance = Number(row.balanceAmount);
  }
  return [...series.values()];
}

export async function getEnabledBalanceHistory(days: number, query = queryPBXPulsDb) {
  const rows = await query(`SELECT s.id sourceId,s.display_name displayName,
    p.balance_amount balanceAmount,p.currency,p.measured_at measuredAt
    FROM balance_sources s LEFT JOIN balance_snapshots p ON p.source_id=s.id
      AND p.balance_amount IS NOT NULL
      AND p.measured_at>=DATE_SUB(UTC_DATE(),INTERVAL ? DAY)
    WHERE s.enabled=1 ORDER BY s.id,p.measured_at,p.id`, [days - 1]);
  return buildBalanceHistory(rows, days);
}
