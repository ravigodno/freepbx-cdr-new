function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function isInternalCandidate(value: unknown): boolean {
  const normalized = digits(value);
  return normalized.length >= 2 && normalized.length <= 5;
}

function extensionFromChannel(value: unknown): string {
  const channel = String(value ?? '');
  const sip = channel.match(/(?:SIP|PJSIP|IAX2)\/([0-9]{2,5})-/i);
  if (sip?.[1]) return sip[1];
  return channel.match(/Local\/([0-9]{2,5})@/i)?.[1] || '';
}

function hasInboundEvidence(row: any): boolean {
  const context = String(row?.dcontext ?? '').toLowerCase();
  const channel = String(row?.channel ?? '').toLowerCase();
  const did = digits(row?.did);
  return context.includes('from-trunk')
    || context.includes('from-pstn')
    || context.includes('from-did')
    || channel.includes('-in-')
    || did.length >= 7;
}

export function resolveCdrCallerExtension(rows: any[]): string {
  const ordered = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!ordered.length || ordered.some(hasInboundEvidence)) return '';

  for (const row of ordered) {
    const explicit = String(row?.callerExtension ?? '').trim();
    if (explicit) return explicit;
    if (!String(row?.dcontext ?? '').toLowerCase().startsWith('from-internal')) continue;
    if (isInternalCandidate(row?.src)) return digits(row.src);
    if (isInternalCandidate(row?.cnum)) return digits(row.cnum);
    const channelExtension = extensionFromChannel(row?.channel);
    if (channelExtension) return channelExtension;
    const clidExtension = String(row?.clid ?? '').match(/<([0-9]{2,5})>/)?.[1] || '';
    if (isInternalCandidate(clidExtension)) return clidExtension;
  }
  return '';
}
