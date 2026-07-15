export type CallRouteScenario =
  | 'incoming_queue'
  | 'incoming_ring_group'
  | 'incoming_ivr'
  | 'incoming_direct_extension'
  | 'internal'
  | 'internal_followme'
  | 'outgoing'
  | 'blind_transfer'
  | 'consult_transfer'
  | 'conference_from_call'
  | 'meeting_new'
  | 'unknown';

export type CallRouteDirection = 'incoming' | 'outgoing' | 'internal' | 'unknown';

export interface RejectedRouteCandidate {
  value: string;
  reason: string;
}

export interface CallRouteSummary {
  scenario: CallRouteScenario;
  direction: CallRouteDirection;
  externalCaller: string;
  trunk: string;
  inboundRoute: string;
  queue: string;
  ringGroup: string;
  ivr: string;
  answeredBy: string;
  internalCaller: string;
  internalDestination: string;
  followMeExternalTargets: string[];
  displayNumber: string;
  destinationLabel: string;
  rejectedCandidates: RejectedRouteCandidate[];
}

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const clean = (value: unknown): string => String(value ?? '').trim();
const isInternal = (value: unknown): boolean => /^\d{2,5}$/.test(digits(value));
const isExternal = (value: unknown): boolean => /^\d{7,15}$/.test(digits(value));

function unique(values: unknown[]): string[] {
  return Array.from(new Set(values.map(digits).filter(Boolean)));
}

function channelExtension(value: unknown): string {
  return String(value ?? '').match(/(?:SIP|PJSIP)\/(\d{2,5})-/i)?.[1]
    || String(value ?? '').match(/Local\/(\d{2,5})@/i)?.[1]
    || '';
}

function trunkFromChannel(value: unknown): string {
  const raw = String(value ?? '').match(/(?:SIP|PJSIP)\/([^/\s]+?)-in-[0-9a-f]+/i)?.[1] || '';
  return clean(raw);
}

function routeFragment(value: unknown): string {
  const text = clean(value);
  const suffix = text.match(/(?:^|\D)(\d{2,6})$/)?.[1] || '';
  return suffix && isInternal(suffix) ? suffix : '';
}

function pushRejected(target: RejectedRouteCandidate[], value: unknown, reason: string) {
  const normalized = clean(value);
  if (!normalized || target.some(item => item.value === normalized && item.reason === reason)) return;
  target.push({ value: normalized, reason });
}

function emptySummary(): CallRouteSummary {
  return {
    scenario: 'unknown', direction: 'unknown', externalCaller: '', trunk: '', inboundRoute: '',
    queue: '', ringGroup: '', ivr: '', answeredBy: '', internalCaller: '', internalDestination: '',
    followMeExternalTargets: [], displayNumber: '', destinationLabel: '', rejectedCandidates: []
  };
}

function finalizeIncoming(summary: CallRouteSummary): CallRouteSummary {
  if (summary.trunk) pushRejected(summary.rejectedCandidates, summary.trunk, 'trunk/did/route number, not caller');
  const fragment = routeFragment(summary.trunk);
  if (fragment && fragment !== summary.trunk) {
    pushRejected(summary.rejectedCandidates, fragment, 'trunk/route fragment, not caller');
  }
  if (summary.queue) pushRejected(summary.rejectedCandidates, summary.queue, 'queue number, not caller');
  if (summary.ringGroup) pushRejected(summary.rejectedCandidates, summary.ringGroup, 'ring group number, not caller');
  summary.direction = 'incoming';
  summary.internalCaller = '';
  summary.displayNumber = summary.externalCaller;
  return summary;
}

export function buildCallRouteSummaryFromTimeline(data: any): CallRouteSummary {
  if (data?.phoneMeeting === true || data?.meeting) {
    return { ...emptySummary(), scenario: 'meeting_new', direction: 'internal', displayNumber: clean(data?.meeting?.initiatorExt) };
  }

  const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
  const routeAnalysis = data?.routeAnalysis || {};
  const steps = Array.isArray(routeAnalysis.steps) ? routeAnalysis.steps : [];
  const summary = emptySummary();
  const step = (type: string) => steps.find((item: any) => clean(item?.type).toLowerCase() === type);
  const queueStep = step('queue');
  const ringGroupStep = step('ring_group');
  const ivrStep = step('ivr');
  const inboundRouteStep = step('inbound_route');
  const trunkStep = step('inbound_trunk');
  const queueLeg = timeline.find((row: any) => clean(row?.dcontext).toLowerCase() === 'ext-queues' || clean(row?.lastapp).toLowerCase() === 'queue');
  const ringLeg = timeline.find((row: any) => clean(row?.dcontext).toLowerCase() === 'ext-group');
  const ivrLeg = timeline.find((row: any) => clean(row?.dcontext).toLowerCase().startsWith('ivr-'));
  const inbound = clean(routeAnalysis.direction).toLowerCase() === 'inbound'
    || Boolean(data?.externalCallerNumber || data?.inboundDid || trunkStep || inboundRouteStep || queueLeg || ringLeg || ivrLeg);

  if (inbound) {
    summary.externalCaller = digits(data?.externalCallerNumber)
      || unique(timeline.flatMap((row: any) => [row?.externalCallerNumber, row?.src, row?.cnum])).find(isExternal)
      || '';
    summary.trunk = clean(data?.trunkNumber || trunkStep?.number || data?.inboundDid || routeAnalysis.did || timeline.find((row: any) => row?.did)?.did);
    summary.inboundRoute = clean(inboundRouteStep?.number || inboundRouteStep?.pattern || 'ANY');
    summary.queue = digits(queueStep?.number || queueStep?.destination || queueLeg?.dst || (clean(queueLeg?.lastapp).toLowerCase() === 'queue' ? clean(queueLeg?.lastdata).split(',')[0] : ''));
    summary.ringGroup = digits(ringGroupStep?.number || ringGroupStep?.destination || ringLeg?.dst);
    summary.ivr = clean(ivrStep?.number || ivrStep?.destination || clean(ivrLeg?.dcontext).replace(/^ivr-/i, ''));
    summary.answeredBy = digits(routeAnalysis.answeredExt)
      || timeline.map((row: any) => channelExtension(row?.dstchannel)).find(Boolean)
      || '';
    if (summary.queue) {
      summary.scenario = 'incoming_queue';
      summary.destinationLabel = `Очередь ${summary.queue}`;
    } else if (summary.ringGroup) {
      summary.scenario = 'incoming_ring_group';
      summary.destinationLabel = `Группа ${summary.ringGroup}`;
    } else if (summary.ivr) {
      summary.scenario = 'incoming_ivr';
      summary.destinationLabel = `IVR ${summary.ivr}`;
    } else {
      summary.scenario = 'incoming_direct_extension';
      summary.internalDestination = digits(routeAnalysis.answeredExt || timeline.find((row: any) => clean(row?.dcontext).toLowerCase() === 'ext-local')?.dst);
      summary.destinationLabel = summary.internalDestination ? `Внутренний ${summary.internalDestination}` : 'Входящий маршрут';
    }
    return finalizeIncoming(summary);
  }

  const first = timeline[0] || {};
  summary.internalCaller = digits(first.src || first.cnum || channelExtension(first.channel));
  summary.internalDestination = digits(first.dst);
  summary.followMeExternalTargets = unique(timeline.flatMap((row: any) => [row?.lastdata, row?.dst]))
    .filter(isExternal);
  if (isInternal(summary.internalCaller) && isInternal(summary.internalDestination)) {
    summary.direction = 'internal';
    summary.scenario = summary.followMeExternalTargets.length ? 'internal_followme' : 'internal';
    summary.displayNumber = summary.internalDestination;
    summary.destinationLabel = `Внутренний ${summary.internalDestination}`;
  } else {
    summary.direction = 'outgoing';
    summary.scenario = 'outgoing';
    summary.displayNumber = unique([first.dst, ...timeline.map((row: any) => row?.dst)]).find(isExternal) || '';
    summary.destinationLabel = summary.displayNumber;
  }
  return summary;
}

export function buildCallRouteSummaryFromLivePayload(data: any): CallRouteSummary {
  if (data?.phoneMeeting === true) {
    return { ...emptySummary(), scenario: 'meeting_new', direction: 'internal', displayNumber: clean(data.phoneMeetingInitiator) };
  }
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const direction = clean(data?.direction).toLowerCase();
  const summary = emptySummary();
  const contexts = rows.map((row: any) => clean(row?.Context ?? row?.context ?? row?.dcontext).toLowerCase());
  const values = (row: any) => [row?.CallerIDNum, row?.callerId, row?.cid_num, row?.src, row?.ConnectedLineNum, row?.Exten, row?.exten, row?.dst];
  const candidates = unique(rows.flatMap(values));
  const queueRow = rows.find((row: any, index: number) => contexts[index] === 'ext-queues' || clean(row?.Application ?? row?.lastapp).toLowerCase() === 'queue');
  const ringRow = rows.find((_row: any, index: number) => contexts[index] === 'ext-group');
  const ivrRow = rows.find((_row: any, index: number) => contexts[index].startsWith('ivr-'));
  const incoming = direction === 'incoming' || Boolean(queueRow || ringRow || ivrRow || rows.some((row: any, index: number) => contexts[index].includes('from-trunk') || /-in-[0-9a-f]+/i.test(clean(row?.Channel ?? row?.channel))));

  if (incoming) {
    summary.trunk = clean(data?.trunk || data?.did || rows.map((row: any) => trunkFromChannel(row?.Channel ?? row?.channel)).find(Boolean));
    summary.queue = digits(data?.queue || queueRow?.Exten || queueRow?.exten || queueRow?.dst || clean(queueRow?.ApplicationData ?? queueRow?.lastdata).split(',')[0]);
    summary.ringGroup = digits(data?.ringGroup || ringRow?.Exten || ringRow?.exten || ringRow?.dst);
    summary.externalCaller = digits(data?.externalCaller)
      || candidates.find(value => isExternal(value)
        && value !== digits(summary.trunk)
        && value !== digits(data?.did)
        && value !== summary.queue
        && value !== summary.ringGroup)
      || '';
    summary.inboundRoute = clean(data?.inboundRoute || 'ANY');
    summary.ivr = clean(data?.ivr || (ivrRow ? contexts[rows.indexOf(ivrRow)].replace(/^ivr-/, '') : ''));
    summary.answeredBy = digits(data?.answeredBy)
      || rows.map((row: any) => channelExtension(row?.Channel ?? row?.channel)).find(ext => ext && ext !== summary.queue && ext !== summary.ringGroup)
      || '';
    if (summary.queue) {
      summary.scenario = 'incoming_queue';
      summary.destinationLabel = `Очередь ${summary.queue}`;
    } else if (summary.ringGroup) {
      summary.scenario = 'incoming_ring_group';
      summary.destinationLabel = `Группа ${summary.ringGroup}`;
    } else if (summary.ivr) {
      summary.scenario = 'incoming_ivr';
      summary.destinationLabel = `IVR ${summary.ivr}`;
    } else {
      summary.scenario = 'incoming_direct_extension';
      summary.internalDestination = digits(data?.destinationNumber || data?.answeredBy);
      summary.destinationLabel = summary.internalDestination ? `Внутренний ${summary.internalDestination}` : 'Входящий маршрут';
    }
    return finalizeIncoming(summary);
  }

  summary.internalCaller = digits(data?.internalCaller);
  summary.internalDestination = digits(data?.destinationNumber);
  summary.followMeExternalTargets = unique(data?.followMeExternalTargets || []);
  if (direction === 'outgoing') {
    summary.scenario = 'outgoing'; summary.direction = 'outgoing';
    summary.displayNumber = digits(data?.displayNumber || data?.destinationNumber);
  } else {
    summary.scenario = summary.followMeExternalTargets.length ? 'internal_followme' : 'internal';
    summary.direction = 'internal'; summary.displayNumber = summary.internalDestination;
  }
  summary.destinationLabel = summary.displayNumber;
  return summary;
}

export function mapRouteSummaryToLivePopup(summary: CallRouteSummary, current: Record<string, any> = {}) {
  if (summary.scenario === 'meeting_new') return current;
  const incomingSubtitle = summary.destinationLabel
    ? `${summary.destinationLabel}${summary.answeredBy ? ` / ответил ${summary.answeredBy}` : ''}`
    : '';
  return {
    scenario: summary.scenario,
    direction: summary.direction,
    externalCallerNumber: summary.externalCaller,
    internalCaller: summary.internalCaller,
    callerNumber: summary.direction === 'incoming' ? summary.externalCaller : summary.internalCaller,
    sourceNumber: summary.direction === 'incoming' ? summary.externalCaller : summary.internalCaller,
    destinationNumber: summary.direction === 'incoming' ? (summary.answeredBy || summary.queue || summary.ringGroup || summary.internalDestination) : summary.displayNumber,
    displayNumber: summary.displayNumber,
    number: summary.displayNumber,
    trunkNumber: summary.trunk,
    queue: summary.queue,
    answeredBy: summary.answeredBy,
    destinationLabel: summary.destinationLabel,
    followMeExternalTargets: summary.followMeExternalTargets,
    subtitle: summary.direction === 'incoming' ? incomingSubtitle : current.subtitle,
    rejectedCandidates: summary.rejectedCandidates
  };
}

export function rejectNonParticipantCandidates(summary: CallRouteSummary): RejectedRouteCandidate[] {
  return [...summary.rejectedCandidates];
}
