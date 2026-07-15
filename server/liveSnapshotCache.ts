export interface LiveSnapshotCacheOptions<T> {
  ttlMs: number;
  staleTtlMs: number;
  load: () => Promise<T>;
  now?: () => number;
}

export function createLiveSnapshotCache<T>(options: LiveSnapshotCacheOptions<T>) {
  const now = options.now || Date.now;
  let cached: { value: T; fetchedAt: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      const currentTime = now();
      if (cached && currentTime - cached.fetchedAt < options.ttlMs) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;

      inFlight = options.load()
        .then(value => {
          cached = { value, fetchedAt: now() };
          return value;
        })
        .catch(error => {
          if (cached && now() - cached.fetchedAt < options.staleTtlMs) return cached.value;
          throw error;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    clear() {
      cached = null;
      inFlight = null;
    }
  };
}
