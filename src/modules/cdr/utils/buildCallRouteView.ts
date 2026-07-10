import { buildFollowMeStep } from '../tracers/followMeTracer';
import { buildAnnouncementStep } from '../tracers/announcementTracer';
import { buildTimeConditionStep } from '../tracers/timeConditionTracer';
import { buildQueueStep } from '../tracers/queueTracer';
import { RouteView } from '../types/callRoute';
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
  const rawDirection = routeAnalysis.direction || 'unknown';

  const firstDcontext = String(first.dcontext || '').toLowerCase();
  const firstChannel = String(first.channel || '').toLowerCase();
  const firstDstChannel = String(first.dstchannel || '').toLowerCase();

  const looksInbound =
    Boolean(first.did || routeAnalysis.did) ||
    firstDcontext.includes('from-trunk') ||
    firstDcontext.includes('from-pstn') ||
    firstDcontext.includes('from-did') ||
    firstChannel.includes('-in-') ||
    firstDstChannel.includes('/');

  const direction = rawDirection === 'unknown' && looksInbound ? 'inbound' : rawDirection;

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
  const inboundTrunkStep = steps.find((s: any) => s.type === 'inbound_trunk');
  const ivrRouteStep = steps.find((s: any) => s.type === 'ivr');
  const inboundRouteStep = steps.find((s: any) => s.type === 'inbound_route');
  const outboundRouteStep = steps.find((s: any) => s.type === 'outbound_route');
  const trunksStep = steps.find((s: any) => String(s.type || '').includes('trunk'));

  const groupMembers = ringGroupStep?.members || [];
  const routeDestinationSteps = steps
    .map((step: any) => [
      buildTimeConditionStep(step),
      buildAnnouncementStep(step),
      buildFollowMeStep(step),
    ])
    .flat()
    .filter(Boolean);

  const outboundSelectedTrunk = outboundRouteStep?.details?.trunks?.[0] || null;
  const outboundTrunkTitle = outboundSelectedTrunk?.name
    ? `${outboundSelectedTrunk.name}${outboundSelectedTrunk.outcid ? ` (${outboundSelectedTrunk.outcid})` : ''}`
    : (trunksStep?.title || 'Транк исходящего вызова');

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

  const directInboundExt =
    direction === 'inbound' &&
    String(first.dcontext || '').toLowerCase() === 'ext-local' &&
    /^\d{2,6}$/.test(String(first.dst || ''))
      ? String(first.dst)
      : '';


  const isInternalRoute =
    direction !== 'inbound' &&
    /^\d{2,6}$/.test(String(dialedNumber || '')) &&
    /^\d{2,6}$/.test(String(callerExt || ''));

  const routeSteps = direction === 'inbound'
    ? [
        {
          label: 'CALLER',
          title: `Звонок от ${externalNumber}`,
          pattern: '',
          destination: trunkNumber,
          number: externalNumber,
          members: [],
        },
        {
          label: 'TRUNK',
          title: inboundTrunkStep?.title || `Транк ${trunkNumber}`,
          pattern: '',
          destination: inboundTrunkStep?.destination || trunkNumber,
          number: inboundTrunkStep?.number || trunkNumber,
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
        ...(routeDestinationSteps as any[]),
        ...(ivrRouteStep ? [{
          label: 'IVR',
          title: ivrRouteStep.title || 'IVR меню',
          pattern: ivrRouteStep.pattern || '',
          destination: ivrRouteStep.destination || '',
          number: ivrRouteStep.number || '',
          members: [],
        }] : []),
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
    : (isInternalRoute
      ? [
          {
            label: 'EXTENSION',
            title: `Внутренний вызов от номера ${callerExt}`,
            pattern: '',
            destination: dialedNumber,
            number: callerExt,
            members: [],
          },
          {
            label: 'EXTENSION',
            title: `Вызов на внутренний номер ${dialedNumber}`,
            pattern: '',
            destination: dialedNumber,
            number: dialedNumber,
            members: [],
          },
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
          ...(direction === 'outbound' ? [{
            label: 'TRUNK',
            title: outboundTrunkTitle,
            pattern: outboundSelectedTrunk?.channelid || '',
            destination: dialedNumber,
            number: outboundSelectedTrunk?.outcid || outboundSelectedTrunk?.channelid || '',
            members: [],
          }] : []),
        ]);

  const blindTransferTarget = String(chronologyData?.blindTransferTargetExt || '').trim();
  if (chronologyData?.blindTransfer === true && blindTransferTarget) {
    routeSteps.push({
      label: 'BLIND TRANSFER',
      title: `Переведён на ${blindTransferTarget}`,
      pattern: '',
      destination: blindTransferTarget,
      number: blindTransferTarget,
      members: [],
    } as any);
  }

  const ivrStepForResult = routeSteps.find((step: any) => step.label === 'IVR' || step.type === 'ivr');

  const ivrOnlyNoDigit =
    direction === 'inbound' &&
    Boolean(ivrStepForResult) &&
    !String(ivrStepForResult?.details?.pressedDigit || '').trim() &&
    !routeSteps.some((step: any) => step.label === 'QUEUE' || step.label === 'RING GROUP' || step.label === 'EXTENSION');

  const resultText = direction === 'inbound'
    ? (ivrOnlyNoDigit
        ? `Абонент ${externalNumber} попал в IVR, но не выбрал пункт меню.`
        : (directInboundExt && !anyAnswered
            ? `Вызов на внутренний номер ${directInboundExt}. Абонент не ответил на вызов.`
            : (anyAnswered
                ? `Абонент ${externalNumber} дозвонился.${queueWaitText} Ответил внутренний номер ${answeredExt || directInboundExt || '—'}.`
                : `Абонент ${externalNumber} не дозвонился.${queueWaitText} Не ответили: ${missedMembers.length ? missedMembers.join(', ') : (queueMissedMembers.length ? queueMissedMembers.join(', ') : 'участники группы или очереди')}.`)))
    : (isInternalRoute
        ? (anyAnswered
            ? `Внутренний номер ${dialedNumber} ответил на вызов от ${callerExt}.`
            : `Внутренний номер ${dialedNumber} не ответил на вызов от ${callerExt}.`)
        : (anyAnswered
            ? `Номер ${dialedNumber} ответил на вызов с внутреннего номера ${callerExt}.`
            : `Номер ${dialedNumber} не ответил на вызов с внутреннего номера ${callerExt}.`));

  return {
    routeSteps,
    resultText,
    anyAnswered: ivrOnlyNoDigit ? false : anyAnswered,
  };
}
