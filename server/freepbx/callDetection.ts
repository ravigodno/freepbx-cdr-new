import { resolveCallAnswerEvidence } from '../../shared/callAnswerEvidence.js';
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
  return resolveCallAnswerEvidence(legs).answeredExt;
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
