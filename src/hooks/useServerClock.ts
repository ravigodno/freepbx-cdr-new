import { useEffect, useState } from 'react';
import { syncServerClock } from '../utils/serverClock';

const SERVER_CLOCK_RESYNC_MS = 5 * 60 * 1000;

export function useServerClock(token?: string): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const synchronize = () => {
      syncServerClock(token)
        .then(() => {
          if (active) setRevision(value => value + 1);
        })
        .catch(() => {});
    };

    synchronize();
    const interval = window.setInterval(synchronize, SERVER_CLOCK_RESYNC_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  return revision;
}
