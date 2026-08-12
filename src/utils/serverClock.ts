let serverOffsetMs = 0;
let synchronized = false;
let pendingSync: Promise<number> | null = null;
let serverUtcOffsetMinutes = 0;

export function calculateServerClockOffset(
  serverTime: string | number,
  requestStartedAt: number,
  requestFinishedAt: number
): number {
  const serverTimeMs = typeof serverTime === 'number' ? serverTime : Date.parse(serverTime);
  if (!Number.isFinite(serverTimeMs)) throw new Error('Server returned an invalid time');
  if (!Number.isFinite(requestStartedAt) || !Number.isFinite(requestFinishedAt) || requestFinishedAt < requestStartedAt) {
    throw new Error('Invalid server clock synchronization interval');
  }
  return serverTimeMs - Math.round((requestStartedAt + requestFinishedAt) / 2);
}

export function getServerNow(): Date {
  return new Date(Date.now() + (synchronized ? serverOffsetMs : 0));
}

export function serverLocalDateTimeToBrowser(value: string): Date | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - serverUtcOffsetMinutes * 60000;
  return new Date(utcMs);
}

export function isServerClockSynchronized(): boolean {
  return synchronized;
}

export async function syncServerClock(token?: string): Promise<number> {
  if (pendingSync) return pendingSync;

  pendingSync = (async () => {
    const requestStartedAt = Date.now();
    const response = await fetch('/api/system/time', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false || !payload?.serverTime) {
      throw new Error(payload?.error || 'Server time is unavailable');
    }
    if (Number.isFinite(Number(payload.utcOffsetMinutes))) serverUtcOffsetMinutes = Number(payload.utcOffsetMinutes);

    const requestFinishedAt = Date.now();
    serverOffsetMs = calculateServerClockOffset(payload.serverTime, requestStartedAt, requestFinishedAt);
    synchronized = true;
    return serverOffsetMs;
  })().finally(() => {
    pendingSync = null;
  });

  return pendingSync;
}
