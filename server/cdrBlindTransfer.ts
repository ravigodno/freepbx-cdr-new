const normalizeBlindTransferTarget = (value: unknown): string => {
  const target = String(value || '').trim();
  return /^\d{2,20}$/.test(target) ? target : '';
};

const parseCelExtra = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getExplicitBlindTransferTarget = (event: any): string => {
  if (!event || typeof event !== 'object') return '';

  const eventName = String(event.eventName || event.event || event.eventtype || '').trim().toLowerCase();
  const transferType = String(event.transferType || event.type || '').trim().toLowerCase();
  const source = String(event.source || '').trim().toLowerCase();
  const hasBlindTransferEvidence = event.blindTransfer === true
    || eventName === 'blindtransfer'
    || transferType === 'blind'
    || transferType === 'blind_transfer'
    // Historical records with this source are written only after
    // runAmiBlindTransfer() reports a successful AMI action.
    || source === 'pbxpuls_live_transfer';

  if (!hasBlindTransferEvidence) return '';

  const extra = parseCelExtra(event.extra);
  return normalizeBlindTransferTarget(
    event.blindTransferTargetExt
      || event.targetExtension
      || extra.extension
      || extra.targetExtension
      || event.exten
  );
};
