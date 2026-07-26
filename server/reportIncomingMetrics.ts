export type IncomingConversationMetrics = {
  answeredAverageWaitSeconds: number | null;
  answeredMedianWaitSeconds: number | null;
  averageTalkSeconds: number | null;
  totalTalkSeconds: number;
  waitCalculationSource: 'duration_minus_billsec';
};

export function calculateAnsweredIncomingMetrics(
  rows: any[],
  isIncoming: (row: any) => boolean,
  waitSeconds: (row: any) => number | null
): IncomingConversationMetrics {
  const answered = rows.filter(row =>
    isIncoming(row)
    && String(row?.disposition || '').toUpperCase() === 'ANSWERED'
    && Number(row?.billsec || 0) > 0
  );
  const waits = answered.map(waitSeconds).filter((value): value is number => value !== null && Number.isFinite(value)).map(value => Math.max(0, value)).sort((a, b) => a - b);
  const talk = answered.reduce((sum, row) => sum + Math.max(0, Number(row.billsec || 0)), 0);
  const middle = Math.floor(waits.length / 2);
  return {
    answeredAverageWaitSeconds: waits.length ? Math.round(waits.reduce((sum, value) => sum + value, 0) / waits.length) : null,
    answeredMedianWaitSeconds: waits.length ? (waits.length % 2 ? waits[middle] : (waits[middle - 1] + waits[middle]) / 2) : null,
    averageTalkSeconds: answered.length ? Math.round(talk / answered.length) : null,
    totalTalkSeconds: talk,
    waitCalculationSource: 'duration_minus_billsec'
  };
}
