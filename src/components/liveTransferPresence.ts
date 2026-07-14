export type LiveTransferPresence = 'online' | 'offline' | 'busy' | 'unavailable' | 'ringing' | 'unknown';

const labels: Partial<Record<LiveTransferPresence, string>> = {
  online: 'Онлайн',
  offline: 'Офлайн',
  busy: 'Занят',
  unavailable: 'Недоступен',
  ringing: 'Звонит'
};

export function getLiveTransferPresenceLabel(status: LiveTransferPresence | null | undefined): string {
  return status ? labels[status] || '' : '';
}
