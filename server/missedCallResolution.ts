export type MissedCallResolutionStatus = 'processed_in_sla' | 'processed_late' | 'pending_callback' | 'not_called_back';

export type MissedCallSlaStatus = 'in_sla' | 'late' | 'pending' | 'lost';

export type MissedCallResolution = {
  status: MissedCallResolutionStatus;
  processingStatusLabel: 'Обработано' | 'Ожидает обработки' | 'Потерян';
  slaStatus: MissedCallSlaStatus;
  deadline: number;
  deadlineExpired: boolean;
  processedAt: number | null;
  callbackDelaySeconds: number | null;
  slaExceededSeconds: number;
  isProcessed: boolean;
  isProcessedInSla: boolean;
  isProcessedLate: boolean;
  isPending: boolean;
  isLost: boolean;
  reasonCategory: 'processed_within_sla' | 'processed_after_sla' | 'within_callback_window' | 'no_callback_after_sla';
};

export function classifyMissedCallResolution(options: {
  missedMs: number;
  nowMs: number;
  callbackWindowMs: number;
  processedAtMs?: number | null;
  deadlineMs?: number;
  elapsedMs?: (start: number, end: number) => number;
}): MissedCallResolution {
  const deadline = options.deadlineMs ?? (options.missedMs + Math.max(0, options.callbackWindowMs));
  const elapsed = options.elapsedMs || ((start: number, end: number) => Math.max(0, end - start));
  const deadlineExpired = options.nowMs >= deadline;
  const processedAt = options.processedAtMs !== null
    && options.processedAtMs !== undefined
    && Number.isFinite(Number(options.processedAtMs))
    ? Number(options.processedAtMs)
    : null;
  const callbackDelaySeconds = processedAt === null ? null : Math.round(elapsed(options.missedMs, processedAt) / 1000);

  if (processedAt !== null) {
    const isProcessedInSla = Number.isFinite(deadline) && processedAt <= deadline;
    const unknown = !Number.isFinite(deadline);
    return {
      status: isProcessedInSla || unknown ? 'processed_in_sla' : 'processed_late',
      processingStatusLabel: 'Обработано',
      slaStatus: unknown ? 'pending' : isProcessedInSla ? 'in_sla' : 'late',
      deadline,
      deadlineExpired,
      processedAt,
      callbackDelaySeconds,
      slaExceededSeconds: Math.round(elapsed(deadline, processedAt) / 1000),
      isProcessed: true,
      isProcessedInSla,
      isProcessedLate: !unknown && !isProcessedInSla,
      isPending: false,
      isLost: false,
      reasonCategory: isProcessedInSla ? 'processed_within_sla' : 'processed_after_sla'
    };
  }

  if (!deadlineExpired) {
    return {
      status: 'pending_callback', processingStatusLabel: 'Ожидает обработки', slaStatus: 'pending', deadline, deadlineExpired,
      processedAt: null, callbackDelaySeconds: null, slaExceededSeconds: 0,
      isProcessed: false, isProcessedInSla: false, isProcessedLate: false, isPending: true, isLost: false,
      reasonCategory: 'within_callback_window'
    };
  }

  return {
    status: 'not_called_back', processingStatusLabel: 'Потерян', slaStatus: 'lost', deadline, deadlineExpired,
    processedAt: null, callbackDelaySeconds: null, slaExceededSeconds: Math.round(elapsed(deadline, options.nowMs) / 1000),
    isProcessed: false, isProcessedInSla: false, isProcessedLate: false, isPending: false, isLost: true,
    reasonCategory: 'no_callback_after_sla'
  };
}
