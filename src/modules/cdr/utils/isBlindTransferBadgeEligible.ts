export function isBlindTransferBadgeEligible(call: any): boolean {
  if (!call || typeof call !== 'object') return false;

  const eventName = String(call.eventName || call.event || '').trim().toLowerCase();
  const transferType = String(call.transferType || '').trim().toLowerCase();
  const timeline = Array.isArray(call.timeline) ? call.timeline : [];
  const hasBlindTransferStep = timeline.some((step: any) => {
    const stepType = String(step?.type || step?.eventType || step?.actionType || '').trim().toLowerCase();
    const stepEvent = String(step?.eventName || step?.event || '').trim().toLowerCase();
    return stepType === 'blind_transfer' || stepEvent === 'blindtransfer';
  });

  return call.blindTransfer === true
    || Boolean(call.blindTransferTargetExt)
    || eventName === 'blindtransfer'
    || transferType === 'blind'
    || transferType === 'blind_transfer'
    || hasBlindTransferStep;
}
