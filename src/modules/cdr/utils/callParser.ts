export function extractExternalFromLastdata(lastdata: string): string {
  if (!lastdata) return '';

  const matches = lastdata.match(/\d{7,15}/g);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }

  const simpleMatch = lastdata.match(/\b\d{3,15}\b/);
  return simpleMatch ? simpleMatch[0] : '';
}

export function isDstBad(num: string): boolean {
  if (!num) return true;

  const d = num.trim();

  if (d === '' || d === 's' || d === 'h' || d === 't') {
    return true;
  }

  return false;
}
