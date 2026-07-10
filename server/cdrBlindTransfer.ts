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

const getChannelEndpoint = (value: unknown): string => {
  const match = String(value || '').match(/(?:PJSIP|SIP)\/(\d{2,20})(?:[-@]|$)/i);
  return normalizeBlindTransferTarget(match?.[1]);
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

export type BlindTransferCelEvidence = {
  event: any;
  target: string;
};

export const findBlindTransferTargetFromCel = (inputRows: any[]): BlindTransferCelEvidence | null => {
  const rows = Array.isArray(inputRows) ? inputRows : [];
  let result: BlindTransferCelEvidence | null = null;

  rows.forEach((event, index) => {
    if (String(event?.eventtype || '').trim().toUpperCase() !== 'BLINDTRANSFER') return;

    const explicitTarget = getExplicitBlindTransferTarget(event);
    if (explicitTarget) {
      result = { event, target: explicitTarget };
      return;
    }

    const transferExtra = parseCelExtra(event?.extra);
    const transferBridgeId = String(transferExtra?.bridge_id || '').trim();
    const excludedParticipants = new Set([
      normalizeBlindTransferTarget(event?.cid_num),
      getChannelEndpoint(event?.channame),
      getChannelEndpoint(transferExtra?.transferee_channel_name)
    ].filter(Boolean));

    if (transferBridgeId) {
      for (let nextIndex = index + 1; nextIndex < rows.length; nextIndex++) {
        const next = rows[nextIndex];
        const eventType = String(next?.eventtype || '').trim().toUpperCase();
        if (eventType === 'BLINDTRANSFER') break;
        if (eventType !== 'BRIDGE_EXIT') continue;

        const nextExtra = parseCelExtra(next?.extra);
        if (String(nextExtra?.bridge_id || '').trim() !== transferBridgeId) continue;

        const sameBridgeTarget = normalizeBlindTransferTarget(next?.exten);
        if (sameBridgeTarget && !excludedParticipants.has(sameBridgeTarget)) {
          result = { event, target: sameBridgeTarget };
          return;
        }
      }
    }

    for (let nextIndex = index + 1; nextIndex < rows.length; nextIndex++) {
      const next = rows[nextIndex];
      const eventType = String(next?.eventtype || '').trim().toUpperCase();
      if (eventType === 'BLINDTRANSFER') break;
      if (!['CHAN_START', 'ANSWER', 'BRIDGE_ENTER', 'BRIDGE_EXIT'].includes(eventType)) continue;

      const extenTarget = normalizeBlindTransferTarget(next?.exten);
      if (extenTarget && !excludedParticipants.has(extenTarget)) {
        result = { event, target: extenTarget };
        return;
      }

      const channelTarget = getChannelEndpoint(next?.channame);
      if (channelTarget && !excludedParticipants.has(channelTarget)) {
        result = { event, target: channelTarget };
        return;
      }

      const cidTarget = normalizeBlindTransferTarget(next?.cid_num);
      if (
        cidTarget
        && !excludedParticipants.has(cidTarget)
        && ['CHAN_START', 'ANSWER'].includes(eventType)
        && cidTarget === channelTarget
      ) {
        result = { event, target: cidTarget };
        return;
      }
    }
  });

  return result;
};
