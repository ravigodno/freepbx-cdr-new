import { useState } from 'react';
import { CallEntry } from '../../types';

export function useCalls() {
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);

  return {
    calls,
    setCalls,
    totalCalls,
    setTotalCalls,
    isLoadingCalls,
    setIsLoadingCalls,
    callsError,
    setCallsError
  };
}
