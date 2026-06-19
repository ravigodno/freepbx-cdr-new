import { buildQueueStep } from '../tracers/queueTracer';
function getExtFromChannel(value: any): string {
  const m = String(value || '').match(/\/(\d{2,6})-/);
  return m?.[1] || '';
}

function getTrunkFromChannel(value: any): string {
  const m = String(value || '').match(/\/([^/-]+)-in-/);
  return m?.[1] || '';
}

export function buildCallRouteView(chronologyData: any): RouteView {
  const timeline = chronologyData?.timeline || [];
  const first = timeline[0] || {};
  const routeAnalysis = chronologyData?.routeAnalysis || {};
  const steps = routeAnalysis.steps || [];
  const direction = routeAnalysis.direction || 'unknown';

  const answeredLeg = timeline.find((t: any) =>
    String(t.disposition || '').toUpperCase() === 'ANSWERED' &&
    Number(t.billsec || 0) > 0
  );

  const anyAnswered = Boolean(answeredLeg);

  const externalNumber = first.src || first.cnum || '—';
  const dialedNumber = first.dst || steps?.[0]?.destination || '—';
  const callerExt = steps?.[0]?.number || getExtFromChannel(first.channel) || first.src || '—';
  const trunkNumber = first.did || routeAnalysis.did || getTrunkFromChannel(first.channel) || '—';

  const ringGroupStep = steps.find((s: any) => s.type === 'ring_group');
  const inboundRouteStep = steps.find((s: any) => s.type === 'inbound_route');
  const outboundRouteStep = steps.find((s: any) => s.type === 'outbound_route');
  const trunksStep = steps.find((s: any) => String(s.type || '').includes('trunk'));

  const groupMembers = ringGroupStep?.members || [];

  const answeredExt =
    routeAnalysis.answeredExt ||
    getExtFromChannel(answeredLeg?.dstchannel) ||
    getExtFromChannel(answeredLeg?.channel) ||
    '';

  const missedMembers = groupMembers
    .map((m: any) => String(m.extension || ''))
    .filter(Boolean)
    .filter((ext: string) => ext !== String(answeredExt));

  const queueStep = buildQueueStep(timeline, answeredExt);
  const queueMembers = queueStep?.members || [];
  const queueMissedMembers = queueMembers
    .map((m: any) => String(m.extension || ''))
    .filter(Boolean)
    .filter((ext: string) => ext !== String(answeredExt));

  const queueWaitLeg = timeline.find((t: any) =>
    String(t.dcontext || '').toLowerCase() === 'ext-queues' ||
    String(t.lastapp || '').toLowerCase() === 'queue'
  );
  const queueWaitSeconds = Number(queueWaitLeg?.duration || 0);
  const queueWaitText = queueWaitSeconds ? ` Ожидание в очереди: ${queueWaitSeconds} сек.` : '';


  const routeSteps = direction === 'inbound'
    ? [
        {
          label: 'CALLER',
          title: 'Абонент набирает номер',
          pattern: '',
          destination: trunkNumber,
          number: externalNumber,
          members: [],
        },
        {
          label: 'TRUNK',
          title: `Транк ${trunkNumber}`,
          pattern: '',
          destination: trunkNumber,
          number: trunkNumber,
          members: [],
        },
        {
          label: 'INBOUND ROUTE',
          title: inboundRouteStep?.title || 'Входящее правило',
          pattern: inboundRouteStep?.pattern || inboundRouteStep?.number || 'ANY',
          destination: inboundRouteStep?.destination || '',
          number: inboundRouteStep?.number || '',
          members: [],
        },
        ...(ringGroupStep ? [{
          label: 'RING GROUP',
          title: ringGroupStep.title || `Группа ${ringGroupStep.number}`,
          pattern: '',
          destination: ringGroupStep.destination || '',
          number: ringGroupStep.number || '',
          members: groupMembers,
        }] : []),
        ...(queueStep ? [queueStep] : []),
        ...(groupMembers.length ? [{
          label: 'MEMBERS',
          title: 'Участники группы',
          pattern: '',
          destination: '',
          number: '',
          members: groupMembers.map((m: any) => ({
            ...m,
            status: String(m.extension) === String(answeredExt) ? 'Ответил' : 'Не ответил',
          })),
        }] : []),
      ]
    : [
        {
          label: 'EXTENSION',
          title: `Исходящий вызов от внутреннего номера ${callerExt}`,
          pattern: '',
          destination: dialedNumber,
          number: callerExt,
          members: [],
        },
        {
          label: 'OUTBOUND ROUTE',
          title: outboundRouteStep?.title || 'Исходящее правило',
          pattern: outboundRouteStep?.pattern || '',
          destination: dialedNumber,
          number: outboundRouteStep?.number || '',
          members: [],
        },
        {
          label: 'TRUNKS',
          title: trunksStep?.title || 'Доступные транки FreePBX',
          pattern: '',
          destination: dialedNumber,
          number: trunksStep?.number || '',
          members: [],
        },
      ];

  const resultText = direction === 'inbound'
    ? (anyAnswered
        ? `Абонент ${externalNumber} дозвонился.${queueWaitText} Ответил внутренний номер ${answeredExt || '—'}.`
        : `Абонент ${externalNumber} не дозвонился.${queueWaitText} Не ответили: ${missedMembers.length ? missedMembers.join(', ') : (queueMissedMembers.length ? queueMissedMembers.join(', ') : 'участники группы или очереди')}.`)
    : (anyAnswered
        ? `Номер ${dialedNumber} ответил на вызов с внутреннего номера ${callerExt}.`
        : `Номер ${dialedNumber} не ответил на вызов с внутреннего номера ${callerExt}.`);

  return {
    routeSteps,
    resultText,
    anyAnswered,
  };
}
