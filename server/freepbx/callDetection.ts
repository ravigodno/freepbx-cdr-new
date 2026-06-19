import type { CallDirection } from './types';
import { extractExtFromChannel } from './utils';

export function detectCallDirection(
  first: any
): CallDirection {
  const dcontext = String(first?.dcontext || '');

  if (dcontext === 'from-internal') {
    return 'outbound';
  }

  if (
    dcontext.includes('from-trunk') ||
    dcontext.includes('ext-group') ||
    dcontext.includes('ext-queues') ||
    dcontext.includes('ivr')
  ) {
    return 'inbound';
  }

  const src = String(first?.src || '');
  const dst = String(first?.dst || '');

  if (/^\d{2,6}$/.test(src) && /^\d{2,6}$/.test(dst)) {
    return 'internal';
  }

  return 'unknown';
}

export function getAnsweredExtFromLegs(
  legs: any[]
): string {
  const answered = legs.find(
    (l: any) =>
      String(l.disposition || '').toUpperCase() === 'ANSWERED' &&
      Number(l.billsec || 0) > 0
  );

  if (!answered) return '';

  const dstChannelExt = extractExtFromChannel(
    answered.dstchannel || ''
  );

  if (dstChannelExt) return dstChannelExt;

  return extractExtFromChannel(
    answered.channel || ''
  );
}
