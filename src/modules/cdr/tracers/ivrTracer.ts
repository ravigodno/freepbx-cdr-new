import type { RouteStep } from '../types/callRoute';

function normalize(value: any): string {
  return String(value || '').trim();
}

function getIvrIdFromLeg(leg: any): string {
  const dcontext = normalize(leg?.dcontext);

  if (dcontext.startsWith('ivr-')) {
    return dcontext.replace('ivr-', '');
  }

  return '';
}

export function findIvrLeg(timeline: any[]): any | null {
  return (timeline || []).find((leg: any) => {
    const dcontext = normalize(leg?.dcontext).toLowerCase();
    const lastapp = normalize(leg?.lastapp).toLowerCase();

    return dcontext.startsWith('ivr-') || lastapp === 'background';
  }) || null;
}

export function buildIvrStep(timeline: any[]): RouteStep | null {
  const ivrLeg = findIvrLeg(timeline);

  if (!ivrLeg) {
    return null;
  }

  const ivrId = getIvrIdFromLeg(ivrLeg);
  const pressedDigit = normalize(ivrLeg?.dst) && normalize(ivrLeg?.dst) !== 's'
    ? normalize(ivrLeg?.dst)
    : '';

  return {
    label: 'IVR',
    title: ivrId ? `IVR меню ${ivrId}` : 'IVR меню',
    number: ivrId,
    pattern: pressedDigit ? `Нажата цифра: ${pressedDigit}` : '',
    destination: normalize(ivrLeg?.dcontext),
    members: [],
  };
}
