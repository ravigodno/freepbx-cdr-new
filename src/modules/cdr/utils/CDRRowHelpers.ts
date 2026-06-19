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

export function normalizePhoneForCompare(num: string): string {
  const digits = String(num || '').replace(/\D/g, '');

  if (!digits) return '';

  // Внутренние номера не нормализуем в федеральный формат.
  if (digits.length > 0 && digits.length <= 5) return digits;

  // 8XXXXXXXXXX и 7XXXXXXXXXX считаем одним номером.
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return '7' + digits.slice(1);
  }

  // 10-значные российские номера приводим к 7XXXXXXXXXX.
  if (digits.length === 10) {
    return '7' + digits;
  }

  return digits;
}

export function getDirectoryPhones(entry: any): string[] {
  const values: string[] = [];

  const push = (v: any) => {
    if (v === null || v === undefined) return;

    if (Array.isArray(v)) {
      v.forEach(push);
      return;
    }

    if (typeof v === 'object') {
      Object.values(v).forEach(push);
      return;
    }

    const str = String(v || '').trim();
    if (str) values.push(str);
  };

  push(entry?.number);
  push(entry?.phone);
  push(entry?.phones);
  push(entry?.phoneNumbers);
  push(entry?.mobile);
  push(entry?.workPhone);

  return Array.from(new Set(values));
}

export function directoryEntryMatchesNumber(entry: any, num: string): boolean {
  const target = normalizePhoneForCompare(num);
  if (!target) return false;

  return getDirectoryPhones(entry).some(phone => normalizePhoneForCompare(phone) === target);
}

export function isMultiNumberValue(num: string): boolean {
  const value = String(num || '').trim();
  if (!value) return false;

  // 100, 200 / 100;200 / 100 200 — это список, а не один номер.
  const chunks = value.split(/[,.؛;\s]+/).map(v => v.trim()).filter(Boolean);
  return chunks.length > 1 && chunks.every(v => /^\d{2,6}$/.test(v));
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

function extractInternalExtFromChannel(channelStr: string): string {
  if (!channelStr) return '';

  const raw = String(channelStr || '');

  const localMatch = raw.match(/Local\/(\d{2,6})@/i);
  if (localMatch?.[1]) return localMatch[1];

  const sipMatch = raw.match(/(?:SIP|PJSIP|IAX2)\/(\d{2,6})-/i);
  if (sipMatch?.[1]) return sipMatch[1];

  return '';
}

export function buildCdrRowViewModel(call: any, directory: any[], relatedLegs: any[] = []) {
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
      const explicitAnsweredExts = Array.isArray(call.answeredExts)
        ? call.answeredExts.map((v: any) => String(v).trim()).filter(Boolean)
        : [];
      const explicitMissedExts = Array.isArray(call.missedExts)
        ? call.missedExts.map((v: any) => String(v).trim()).filter(Boolean)
        : [];

      if (explicitAnsweredExts.length) {
        return explicitAnsweredExts.join(', ');
      }

      if (explicitMissedExts.length) {
        return explicitMissedExts.join(', ');
      }

      const didText = String(call.did || '');

      const answeredMatch = didText.match(/ответил:\s*([0-9,\s]+)/i);
      if (answeredMatch?.[1]?.trim()) {
        return answeredMatch[1].trim();
      }

      const missedMatch = didText.match(/не ответили:\s*([0-9,\s]+)/i);
      if (missedMatch?.[1]?.trim()) {
        return missedMatch[1].trim();
      }

      const dstChannelExt = extractInternalExtFromChannel(call.dstchannel || '');
      if (dstChannelExt) return dstChannelExt;

      if (dctx.toLowerCase() === 'ext-local' && isInternalExt(dstVal)) return dstVal;

      if (dctx.toLowerCase() === 'ext-queues' && dstVal) return dstVal;
      if (dctx.toLowerCase() === 'ext-group' && dstVal) return dstVal;

      if (call.dst) return call.dst;
      if (call.did) return String(call.did).split('→')[0].trim();

      return '';
    }

    // Исходящий: номер, который набирал внутренний абонент.
    if (isOutgoing && dstVal) return dstVal;

    // Внутренний: внутренний номер назначения.
    if (!isDstBad(dstVal, isOutgoing)) return dstVal;

    const parsed = extractExternalFromLastdata(call.lastdata || '');
    if (parsed) return parsed;

    return dstVal;
  };

  const displayedDst = getCalleeNumber() || call.dst || 'Неизвестно';

  const dMatch = directory.find(e => directoryEntryMatchesNumber(e, displayedSrc));
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

  const isMultiInternalDst = displayedDst.split(',').map(v => v.trim()).filter(Boolean).every(isInternalExt);
  const dstContact = isMultiNumberValue(displayedDst)
    ? null
    : directory.find(e => directoryEntryMatchesNumber(e, displayedDst));
  const isDstInternal = isInternalExt(displayedDst) || isMultiInternalDst;

  let calleeName = '';
  let calleeType = isDstInternal ? 'internal' : 'client';
  let isFoundDst = false;

  if (dstContact) {
    calleeName = dstContact.name;
    calleeType = dstContact.type;
    isFoundDst = true;
  } else {
    calleeName = displayedDst.includes(',')
      ? 'Внутренние номера'
      : (isDstInternal ? `Внутренний ${displayedDst}` : 'Внешний номер');
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
