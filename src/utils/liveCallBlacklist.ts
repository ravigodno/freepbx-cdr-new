export type LiveCallBlacklistCandidate = {
  active?: boolean;
  direction?: string;
  callerNumber?: string;
  externalCallerNumber?: string;
  sourceNumber?: string;
};

export function normalizeLiveBlacklistNumber(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function getLiveCallBlacklistNumber(call: LiveCallBlacklistCandidate | null | undefined): string {
  if (!call?.active || call.direction !== 'incoming') return '';
  const number = normalizeLiveBlacklistNumber(call.externalCallerNumber || call.callerNumber || call.sourceNumber);
  return number.length >= 7 && number.length <= 20 ? number : '';
}

export function canBlacklistLiveIncomingCall(call: LiveCallBlacklistCandidate | null | undefined): boolean {
  return Boolean(getLiveCallBlacklistNumber(call));
}
