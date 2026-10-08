import { announcementId, greetingTitle } from '../../shared/automatedCallDestination.js';

export async function loadGreetingDescriptions(rows: any[], query: (sql: string, params: any[]) => Promise<any[]>): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map(row => announcementId(row.dcontext || row.destination)).filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const names = await query(`SELECT announcement_id, description FROM asterisk.announcement WHERE announcement_id IN (${ids.map(() => '?').join(',')})`, ids);
    return new Map(names.map(row => [String(row.announcement_id), String(row.description || '')]));
  } catch { return new Map(); } // Deleted/unavailable configuration retains the historical ID.
}

export async function enrichGreetingDestinations(rows: any[], query: (sql: string, params: any[]) => Promise<any[]>) {
  const names = await loadGreetingDescriptions(rows, query);
  for (const row of rows) {
    const id = announcementId(row.dcontext);
    if (id && /^(?:s|h|t|i)?$/i.test(String(row.dst || '').trim()) && !row.answeredExts?.length) {
      row.greetingId = id;
      row.greetingTitle = greetingTitle(id, names.get(id));
    }
  }
}
