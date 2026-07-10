export type ReportHourBucket = { key: string; label: string; sortKey: number };

export function formatReportHourBucket(date: Date): ReportHourBucket {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const year = String(date.getFullYear());
  const hourStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
  return {
    key: `${year}-${month}-${day} ${hour}:00`,
    label: `${day}.${month} ${hour}:00`,
    sortKey: hourStart.getTime()
  };
}

export function buildReportHourlyTimeline(startDate: string, endDate: string): ReportHourBucket[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const result: ReportHourBucket[] = [];
  const current = new Date(start);
  let safety = 0;
  while (current <= end && safety < 50000) {
    result.push(formatReportHourBucket(current));
    current.setHours(current.getHours() + 1);
    safety++;
  }
  return result;
}
