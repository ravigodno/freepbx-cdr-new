export type FreepbxRouteTraceStep = {
  type: string;
  title: string;
  label: string;
  number?: string;
  destination?: string;
  pattern?: string;
  error?: string;
  details?: any;
  members?: any[];
};

export type FreepbxRouteTraceResult = {
  did: string;
  direction: 'inbound' | 'outbound' | 'internal' | 'unknown';
  steps: FreepbxRouteTraceStep[];
};

export function extractExtFromChannel(channel: string): string {
  const match = String(channel || '').match(/\/(\d{2,6})-/);
  return match?.[1] || '';
}

export function detectCallDirection(first: any): 'inbound' | 'outbound' | 'internal' | 'unknown' {
  const dcontext = String(first?.dcontext || '');
  const src = String(first?.src || '');
  const dst = String(first?.dst || '');

  if (
    dcontext.includes('from-trunk') ||
    dcontext.includes('from-pstn') ||
    dcontext.includes('from-digital') ||
    dcontext.includes('from-outside') ||
    first?.did
  ) {
    return 'inbound';
  }

  if (dcontext === 'from-internal' && /^\d{2,6}$/.test(extractExtFromChannel(first?.channel || ''))) {
    return 'outbound';
  }

  if (/^\d{2,6}$/.test(src) && /^\d{2,6}$/.test(dst)) {
    return 'internal';
  }

  return 'unknown';
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
