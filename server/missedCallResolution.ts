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
}): MissedCallResolution {
  const deadline = options.missedMs + Math.max(0, options.callbackWindowMs);
  const deadlineExpired = options.nowMs >= deadline;
  const processedAt = options.processedAtMs !== null
    && options.processedAtMs !== undefined
    && Number.isFinite(Number(options.processedAtMs))
    ? Number(options.processedAtMs)
    : null;
  const callbackDelaySeconds = processedAt === null ? null : Math.max(0, Math.round((processedAt - options.missedMs) / 1000));

  if (processedAt !== null) {
    const isProcessedInSla = processedAt <= deadline;
    return {
      status: isProcessedInSla ? 'processed_in_sla' : 'processed_late',
      processingStatusLabel: 'Обработано',
      slaStatus: isProcessedInSla ? 'in_sla' : 'late',
      deadline,
      deadlineExpired,
      processedAt,
      callbackDelaySeconds,
      slaExceededSeconds: Math.max(0, Math.round((processedAt - deadline) / 1000)),
      isProcessed: true,
      isProcessedInSla,
      isProcessedLate: !isProcessedInSla,
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
    processedAt: null, callbackDelaySeconds: null, slaExceededSeconds: Math.max(0, Math.round((options.nowMs - deadline) / 1000)),
    isProcessed: false, isProcessedInSla: false, isProcessedLate: false, isPending: false, isLost: true,
    reasonCategory: 'no_callback_after_sla'
  };
}
