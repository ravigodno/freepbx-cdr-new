export type MissedCallResolutionStatus = 'processed' | 'called_back' | 'repeated_inbound' | 'pending_callback' | 'not_called_back';

export type MissedCallResolution = {
  status: MissedCallResolutionStatus;
  deadline: number;
  deadlineExpired: boolean;
  isProcessed: boolean;
  isPending: boolean;
  isLost: boolean;
  reasonCategory: 'manual_or_auto_processed' | 'outbound_callback' | 'repeated_inbound' | 'within_callback_window' | 'callback_window_expired';
};

export function classifyMissedCallResolution(options: {
  missedMs: number;
  nowMs: number;
  callbackWindowMs: number;
  manuallyProcessed?: boolean;
  hasOutboundCallback?: boolean;
  hasRepeatedInbound?: boolean;
}): MissedCallResolution {
  const deadline = options.missedMs + Math.max(0, options.callbackWindowMs);
  const deadlineExpired = options.nowMs >= deadline;

  if (options.manuallyProcessed) {
    return { status: 'processed', deadline, deadlineExpired, isProcessed: true, isPending: false, isLost: false, reasonCategory: 'manual_or_auto_processed' };
  }
  if (options.hasOutboundCallback) {
    return { status: 'called_back', deadline, deadlineExpired, isProcessed: true, isPending: false, isLost: false, reasonCategory: 'outbound_callback' };
  }
  if (options.hasRepeatedInbound) {
    return { status: 'repeated_inbound', deadline, deadlineExpired, isProcessed: true, isPending: false, isLost: false, reasonCategory: 'repeated_inbound' };
  }
  if (!deadlineExpired) {
    return { status: 'pending_callback', deadline, deadlineExpired, isProcessed: false, isPending: true, isLost: false, reasonCategory: 'within_callback_window' };
  }
  return { status: 'not_called_back', deadline, deadlineExpired, isProcessed: false, isPending: false, isLost: true, reasonCategory: 'callback_window_expired' };
}
