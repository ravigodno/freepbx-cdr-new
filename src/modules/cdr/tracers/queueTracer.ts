import type { RouteStep, RouteMember } from '../types/callRoute';

function normalize(value: any): string {
  return String(value || '').trim();
}

function getExtFromChannel(value: any): string {
  const m = String(value || '').match(/\/(\d{2,6})-/);
  return m?.[1] || '';
}

function getQueueNumberFromLeg(leg: any): string {
  const dcontext = normalize(leg?.dcontext).toLowerCase();
  const lastapp = normalize(leg?.lastapp).toLowerCase();

  if (lastapp === 'queue') {
    const fromLastData = normalize(leg?.lastdata).split(',')[0].replace(/\D/g, '');
    if (fromLastData) return fromLastData;
  }

  if (dcontext === 'ext-queues') {
    const fromDst = normalize(leg?.dst).replace(/\D/g, '');
    if (fromDst) return fromDst;
  }

  return '';
}

export function findQueueLeg(timeline: any[]): any | null {
  return (timeline || []).find((leg: any) => {
    const dcontext = normalize(leg?.dcontext).toLowerCase();
    const lastapp = normalize(leg?.lastapp).toLowerCase();

    return dcontext === 'ext-queues' || lastapp === 'queue';
  }) || null;
}

export function getQueueWaitSeconds(timeline: any[], answeredExt?: string): number {
  const answeredDialLeg = (timeline || []).find((leg: any) =>
    normalize(leg?.disposition).toUpperCase() === 'ANSWERED' &&
    normalize(leg?.lastapp).toUpperCase() === 'DIAL' &&
    normalize(leg?.dst) === normalize(answeredExt) &&
    Number(leg?.billsec || 0) > 0
  );

  if (answeredDialLeg) {
    return Math.max(0, Number(answeredDialLeg?.duration || 0) - Number(answeredDialLeg?.billsec || 0));
  }

  return Math.max(0, Number(findQueueLeg(timeline)?.duration || 0));
}

export function buildQueueStep(timeline: any[], answeredExt?: string): RouteStep | null {
  const queueLeg = findQueueLeg(timeline);

  if (!queueLeg) {
    return null;
  }

  const queueNumber = getQueueNumberFromLeg(queueLeg);
  const waitSeconds = getQueueWaitSeconds(timeline, answeredExt);

  const dialedMembers = (timeline || [])
    .filter((leg: any) =>
      String(leg?.dcontext || '').toLowerCase() === 'ext-local' &&
      String(leg?.lastapp || '').toLowerCase() === 'dial'
    )
    .map((leg: any) => String(leg?.dst || '').trim())
    .filter((ext: string) => /^\d{2,6}$/.test(ext))
    .filter((value: string, index: number, arr: string[]) => arr.indexOf(value) === index);

  const members: RouteMember[] = dialedMembers.map((extension: string) => ({
    extension,
    status: answeredExt && extension === answeredExt ? 'Ответил' : 'Не ответил',
  }));

  return {
    label: 'QUEUE',
    title: queueNumber ? `Очередь ${queueNumber}` : 'Очередь вызовов',
    number: queueNumber,
    pattern: waitSeconds ? `Ожидание: ${waitSeconds} сек.` : '',
    destination: queueNumber,
    members,
  };
}
