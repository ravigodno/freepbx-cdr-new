export function extractExtFromChannel(channel: string): string {
  const match = String(channel || '').match(/\/(\d{2,6})-/);
  return match?.[1] || '';
}

export function getRealCallerExtFromCall(first: any): string {
  return String(
    extractExtFromChannel(first?.channel || '') ||
    first?.cnum ||
    first?.src ||
    ''
  );
}

export function isOutboundCall(first: any): boolean {
  return String(first?.dcontext || '') === 'from-internal' && Boolean(first?.dst);
}

export function extractDialedExtsFromLastdata(lastdata: string): string[] {
  const firstPart = String(lastdata || '').split(',')[0] || '';
  return Array.from(new Set(
    firstPart
      .split('&')
      .map((part) => {
        const m = part.match(/\/(\d{2,6})(?:-|$)/);
        return m?.[1] || '';
      })
      .filter(Boolean)
  ));
}
