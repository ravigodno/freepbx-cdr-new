type LiveBannerDirection = 'incoming' | 'outgoing' | 'internal';

const cleanLiveValue = (value: unknown): string => String(value ?? '').trim();
const liveDigits = (value: unknown): string => cleanLiveValue(value).replace(/\D/g, '');
const isExternalLiveNumber = (value: unknown): boolean => liveDigits(value).length >= 7;
const isInternalLiveNumber = (value: unknown): boolean => {
  const digits = liveDigits(value);
  return digits.length >= 2 && digits.length <= 5;
};

function firstLiveValue(values: unknown[], predicate: (value: string) => boolean = Boolean): string {
  return values.map(cleanLiveValue).find(value => Boolean(value) && predicate(value)) || '';
}

export function buildLiveCallBannerDisplay(call: Record<string, any>) {
  if (call.phoneMeeting === true) {
    const participants = Array.isArray(call.phoneMeetingParticipants) ? call.phoneMeetingParticipants.map(cleanLiveValue).filter(Boolean) : [];
    const initiator = cleanLiveValue(call.phoneMeetingInitiator);
    return {
      direction: 'internal' as const,
      callerNumber: initiator,
      destinationNumber: participants.join(', '),
      displayNumber: participants.join(', '),
      displayName: 'Телефонное совещание',
      subtitle: `Инициатор: внутренний ${initiator || 'не определён'} · Приглашены: ${participants.join(', ') || '—'}`,
      number: participants.join(', ')
    };
  }
  const direction: LiveBannerDirection = call.direction === 'incoming' || call.direction === 'outgoing' || call.direction === 'internal'
    ? call.direction
    : 'internal';
  const technicalNumbers = new Set([
    liveDigits(call.did),
    liveDigits(call.trunkNumber)
  ].filter(Boolean));

  const internalCaller = firstLiveValue([
    call.internalCaller,
    call.sourceNumber,
    call.callerNumber,
    call.callerId,
    call.caller
  ], isInternalLiveNumber);

  const incomingCaller = firstLiveValue([
    call.externalCallerNumber,
    call.sourceNumber,
    call.callerNumber,
    call.callerId,
    call.number,
    call.displayNumber
  ], value => isExternalLiveNumber(value) && !technicalNumbers.has(liveDigits(value)));

  const outgoingDestination = firstLiveValue([
    call.dialedNumber,
    call.destinationNumber,
    call.targetNumber,
    call.number,
    call.displayNumber
  ], value => isExternalLiveNumber(value) && liveDigits(value) !== liveDigits(internalCaller) && !technicalNumbers.has(liveDigits(value)));

  const internalDestination = firstLiveValue([
    call.destinationNumber,
    call.targetNumber,
    call.number,
    call.displayNumber
  ], value => isInternalLiveNumber(value) && liveDigits(value) !== liveDigits(internalCaller));

  const displayNumber = direction === 'incoming'
    ? incomingCaller
    : direction === 'outgoing'
      ? outgoingDestination
      : internalDestination;
  const callerNumber = direction === 'incoming' ? incomingCaller : internalCaller;
  const destinationNumber = direction === 'incoming'
    ? firstLiveValue([call.destinationNumber, call.targetNumber, call.internalNumber], isInternalLiveNumber)
    : displayNumber;
  const rawDisplayName = firstLiveValue([call.displayName, call.contactName, call.name]);
  const displayName = /^неизвестный номер$/i.test(rawDisplayName) ? '' : rawDisplayName;
  const internalSubtitle = callerNumber ? `От внутреннего ${callerNumber}` : 'Внутренний звонок';
  const routeSubtitle = firstLiveValue([call.subtitle, call.destinationLabel]);
  const subtitle = direction === 'internal'
    ? (displayName && displayNumber ? `${displayNumber} · ${internalSubtitle}` : internalSubtitle)
    : (routeSubtitle || (displayName && displayNumber ? displayNumber : ''));

  return {
    direction,
    callerNumber,
    destinationNumber,
    displayNumber,
    displayName,
    subtitle,
    number: displayNumber
  };
}

export function normalizeLiveCallBannerPayload<T extends Record<string, any>>(payload: T | null | undefined): T | null {
  if (!payload || payload.active !== true) return null;
  return { ...payload, ...buildLiveCallBannerDisplay(payload) };
}

export function isLiveCallPopupVisible(payload: Record<string, any> | null | undefined): boolean {
  return normalizeLiveCallBannerPayload(payload) !== null;
}

export function getLiveCallPopupTitle(direction: unknown, phoneMeeting = false): string {
  if (phoneMeeting) return 'Телефонное совещание';
  if (direction === 'incoming') return 'Входящий звонок';
  if (direction === 'outgoing') return 'Исходящий звонок';
  return 'Внутренний звонок';
}

export function rankLiveCallBanners<T extends Record<string, any>>(calls: T[]): T[] {
  const score = (call: T): number => {
    if (call.connected === true) return 400;
    if (call.ringing === true && call.direction === 'incoming') return 300;
    if (call.ringing === true) return 200;
    if (call.direction === 'incoming') return 100;
    return 0;
  };

  return calls
    .map((call, index) => ({ call, index }))
    .sort((left, right) => {
      const priority = score(right.call) - score(left.call);
      if (priority !== 0) return priority;
      const duration = Number(right.call.durationSec || 0) - Number(left.call.durationSec || 0);
      return duration !== 0 ? duration : left.index - right.index;
    })
    .map(item => item.call);
}
