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
  const answeredLegs = legs.filter(
    (l: any) =>
      String(l.disposition || '').toUpperCase() === 'ANSWERED' &&
      Number(l.billsec || 0) > 0
  );

  const answeredDialLeg = answeredLegs.find((leg: any) => {
    const dst = String(leg.dst || '').trim();
    return String(leg.lastapp || '').toUpperCase() === 'DIAL' && /^\d{2,6}$/.test(dst);
  });

  if (answeredDialLeg) return String(answeredDialLeg.dst).trim();

  const answered = answeredLegs.find((leg: any) =>
    extractExtFromChannel(leg.dstchannel || '') || extractExtFromChannel(leg.channel || '')
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

export function getQueueWaitSecondsFromLegs(
  legs: any[],
  answeredExt = getAnsweredExtFromLegs(legs)
): number {
  const answeredDialLeg = legs.find((leg: any) =>
    String(leg.disposition || '').toUpperCase() === 'ANSWERED' &&
    String(leg.lastapp || '').toUpperCase() === 'DIAL' &&
    String(leg.dst || '').trim() === String(answeredExt || '').trim() &&
    Number(leg.billsec || 0) > 0
  );

  if (answeredDialLeg) {
    return Math.max(0, Number(answeredDialLeg.duration || 0) - Number(answeredDialLeg.billsec || 0));
  }

  const queueLeg = legs.find((leg: any) =>
    String(leg.dcontext || '').toLowerCase() === 'ext-queues' ||
    String(leg.lastapp || '').toUpperCase() === 'QUEUE'
  );

  return Math.max(0, Number(queueLeg?.duration || 0));
}
