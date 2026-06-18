export function extractExternalFromLastdata(lastdata: string): string {
  if (!lastdata) return '';

  const matches = lastdata.match(/\d{7,15}/g);

  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }

  const simpleMatch = lastdata.match(/\b\d{3,15}\b/);

  return simpleMatch ? simpleMatch[0] : '';
}

export function isDstBad(num: string, isOutgoing: boolean) {
  if (!num) return true;

  const d = num.trim();

  if (d === '' || d === 's' || d === 'h' || d === 't') {
    return true;
  }

  if (isOutgoing && d.length < 7) {
    return true;
  }

  return false;
}

export function renderClidName(clid: string, fallbackPhone: string): string {
  if (!clid) return fallbackPhone;

  const match = clid.match(/"([^"]+)"/);
  if (match) return match[1];

  return clid.split('<')[0].trim() || fallbackPhone;
}

export function isInternalExt(num: string): boolean {
  if (!num) return false;

  const digits = num.replace(/\D/g, '');

  return digits.length > 0 && digits.length <= 5 && /^\d+$/.test(num.trim());
}

export function getTrunkName(channelStr: string): string {
  if (!channelStr) return '';

  let clean = channelStr.includes('/') ? channelStr.split('/')[1] : channelStr;
  const lastDashIndex = clean.lastIndexOf('-');

  if (lastDashIndex !== -1) {
    const suffix = clean.substring(lastDashIndex + 1);

    if (/^[0-9a-fA-F]{3,}$/.test(suffix) || /^\d+$/.test(suffix)) {
      clean = clean.substring(0, lastDashIndex);
    }
  }

  return clean;
}

export function buildCdrRowViewModel(call: any, directory: any[]) {
  const dctx = call.dcontext || '';
  const ch = call.channel || '';
  const srcVal = (call.src || '').trim();
  const dstVal = (call.dst || '').trim();

  const isIncoming = (() => {
    if (isInternalExt(srcVal)) return false;

    const dctxLower = dctx.toLowerCase();
    const chLower = ch.toLowerCase();

    if (
      dctxLower.includes('from-trunk') ||
      dctxLower.includes('from-pstn') ||
      dctxLower.includes('sip-external') ||
      dctxLower.includes('from-digital') ||
      dctxLower.includes('from-outside') ||
      (call.did && call.did.length > 0)
    ) {
      return true;
    }

    const isIncomingRoute =
      dctxLower === 'ext-queues' ||
      dctxLower === 'ext-group' ||
      dctxLower === 'ext-local' ||
      dctxLower.startsWith('ivr-') ||
      dstVal === '600' ||
      isInternalExt(dstVal);

    const isTrunkChannel = chLower.includes('-in-') || chLower.includes('trunk');

    return isIncomingRoute || isTrunkChannel;
  })();

  const callDisp = (call.disposition || '').toUpperCase();

  const isMissed =
    (callDisp === 'NO ANSWER' || callDisp === 'BUSY' || callDisp === 'FAILED') &&
    (isIncoming || !call.dstchannel);

  const isOutgoing =
    dctx === 'from-internal' &&
    isInternalExt(srcVal) &&
    !isInternalExt(dstVal) &&
    dstVal.length >= 7;

  const getCallerNumber = () => {
    if (isIncoming) {
      if (srcVal && !isInternalExt(srcVal)) return srcVal;

      if (call.clid) {
        const match = call.clid.match(/<([^>]+)>/);
        if (match && match[1].trim()) return match[1].trim();
      }

      return srcVal;
    }

    if (call.cnum && call.cnum.trim()) return call.cnum.trim();
    if (call.src && call.src.trim()) return call.src.trim();

    if (call.channel) {
      const chExt = getTrunkName(call.channel);
      if (chExt) return chExt;
    }

    return '';
  };

  const displayedSrc = getCallerNumber() || call.src || 'Неизвестно';

  const getCalleeNumber = () => {
    if (isIncoming) {
      if (call.dstchannel) {
        const ext = getTrunkName(call.dstchannel);
        if (ext && isInternalExt(ext)) return ext;
        if (ext) return ext;
      }

      if (call.dst) return call.dst;
      if (call.did) return call.did;

      return '';
    }

    if (!isDstBad(dstVal, isOutgoing)) return dstVal;

    const parsed = extractExternalFromLastdata(call.lastdata || '');
    if (parsed) return parsed;

    return dstVal;
  };

  const displayedDst = getCalleeNumber() || call.dst || 'Неизвестно';

  const dMatch = directory.find(e => e.number.trim() === displayedSrc.trim());
  const isSrcInternal = isInternalExt(displayedSrc);

  let callerName = '';
  let callerType = isSrcInternal ? 'internal' : 'client';
  let isFound = false;

  if (dMatch) {
    callerName = dMatch.name;
    callerType = dMatch.type;
    isFound = true;
  } else if (isIncoming) {
    const clidName = renderClidName(call.clid, displayedSrc);

    if (clidName && clidName.trim() !== '' && clidName !== displayedSrc) {
      callerName = clidName;
    } else {
      callerName = isSrcInternal ? `Внутренний ${displayedSrc}` : 'Внешний клиент';
    }
  } else {
    callerName = isSrcInternal ? `Внутренний ${displayedSrc}` : 'Внешний клиент';
  }

  const dstContact = directory.find(e => e.number.trim() === displayedDst.trim());
  const isDstInternal = isInternalExt(displayedDst);

  let calleeName = '';
  let calleeType = isDstInternal ? 'internal' : 'client';
  let isFoundDst = false;

  if (dstContact) {
    calleeName = dstContact.name;
    calleeType = dstContact.type;
    isFoundDst = true;
  } else {
    calleeName = isDstInternal ? `Внутренний ${displayedDst}` : 'Внешний номер';
  }

  return {
    isIncoming,
    isMissed,
    isOutgoing,
    displayedSrc,
    displayedDst,
    callerName,
    callerType,
    isFound,
    calleeName,
    calleeType,
    isFoundDst,
    callDisp,
  };
}
