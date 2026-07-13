export function normalizeLiveCallBannerPayload<T extends Record<string, any>>(payload: T | null | undefined): T | null {
  if (!payload || payload.active !== true) return null;

  const callerNumber = String(
    payload.externalCallerNumber ||
    payload.callerNumber ||
    payload.number ||
    payload.caller ||
    payload.cid ||
    payload.src ||
    ''
  ).trim();

  return {
    ...payload,
    callerNumber,
    number: callerNumber
  };
}

export function isLiveCallPopupVisible(payload: Record<string, any> | null | undefined): boolean {
  return normalizeLiveCallBannerPayload(payload) !== null;
}
