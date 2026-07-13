export function normalizeLiveCallBannerPayload<T extends Record<string, any>>(payload: T | null | undefined): T | null {
  if (!payload || payload.active !== true) return null;

  const direction = payload.direction === 'incoming' || payload.direction === 'outgoing' || payload.direction === 'internal'
    ? payload.direction
    : 'internal';
  const callerNumber = String(direction === 'incoming'
    ? (payload.externalCallerNumber || payload.callerNumber || payload.number || payload.caller || payload.cid || payload.src || '')
    : (payload.internalCaller || payload.callerNumber || payload.operatorExt || payload.caller || payload.cid || payload.src || '')
  ).trim();
  const destinationNumber = String(direction === 'incoming'
    ? (payload.destinationNumber || payload.operatorExt || '')
    : (payload.destinationNumber || payload.number || payload.dst || '')
  ).trim();
  const number = direction === 'incoming' ? callerNumber : destinationNumber;

  return {
    ...payload,
    direction,
    callerNumber,
    destinationNumber,
    number
  };
}

export function isLiveCallPopupVisible(payload: Record<string, any> | null | undefined): boolean {
  return normalizeLiveCallBannerPayload(payload) !== null;
}

export function getLiveCallPopupTitle(direction: unknown): string {
  if (direction === 'incoming') return 'Входящий звонок';
  if (direction === 'outgoing') return 'Исходящий звонок';
  return 'Внутренний звонок';
}
