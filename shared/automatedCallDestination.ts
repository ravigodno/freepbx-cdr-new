/** FreePBX announcement destinations use both dialplan and config notation. */
export function announcementId(value: unknown): string {
  return String(value || '').trim().match(/^app-announcement[-,](\d+)(?:,|$)/i)?.[1] || '';
}

export function greetingTitle(id: string, description?: unknown): string {
  const name = String(description || '').trim();
  return name ? `Приветствие: ${name}` : id ? `Приветствие №${id}` : 'Приветствие';
}

export function isIvrLeg(row: any): boolean {
  const context = String(row?.dcontext || '').toLowerCase();
  return context.startsWith('ivr-') || (!announcementId(context) && String(row?.lastapp || '').toLowerCase() === 'background');
}

/** A technical answer for playback is not a conversation. Keep real dial legs. */
export function normalizeAutomatedAnswer<T extends Record<string, any>>(row: T): T {
  const context = String(row.dcontext || '').toLowerCase();
  const automated = Boolean(announcementId(context)) || context.startsWith('ivr-');
  const displayRow = context.startsWith('ivr-') && /^(?:s)?$/i.test(String(row.dst || '').trim()) && !String(row.dstchannel || '').trim()
    ? { ...row, dst: `IVR ${context.slice(4)}` } : row;
  const externalCaller = [row.src, row.cnum].some(value => String(value || '').replace(/\D/g, '').length >= 7);
  // Aggregated calls already resolved their legs; their dstchannel is deliberately cleared.
  const connected = String(row.dstchannel || '').trim() || Array.isArray(row.answeredExts) || row.logicalCall || row.phoneMeeting;
  if (!automated || !externalCaller || connected || String(row.disposition || '').toUpperCase() !== 'ANSWERED') return displayRow;
  return { ...displayRow, rawDisposition: row.rawDisposition || row.disposition, rawBillsec: row.rawBillsec ?? row.billsec,
    disposition: 'NO ANSWER', billsec: 0 };
}
