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
