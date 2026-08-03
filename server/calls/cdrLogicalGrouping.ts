type CdrLeg = {
  uniqueid?: unknown;
  linkedid?: unknown;
  calldate?: unknown;
  src?: unknown;
  cnum?: unknown;
  clid?: unknown;
  did?: unknown;
  dcontext?: unknown;
  duration?: unknown;
  billsec?: unknown;
  disposition?: unknown;
};

function logicalId(row: CdrLeg): string {
  return String(row.linkedid || row.uniqueid || '').trim();
}

function rootSecond(id: string): string {
  return id.match(/^(\d{9,12})\.\d+$/)?.[1] || '';
}

function externalNumbers(rows: CdrLeg[]): Set<string> {
  const numbers = new Set<string>();
  const dids = new Set(rows.flatMap(row => String(row.did || '').match(/\d{7,15}/g) || []).map(number => (
    number.length === 11 && number.startsWith('8') ? `7${number.slice(1)}` : number
  )));
  for (const row of rows) {
    for (const value of [row.src, row.cnum, row.clid]) {
      for (const match of String(value || '').match(/\d{7,15}/g) || []) {
        const digits = match.length === 11 && match.startsWith('8') ? `7${match.slice(1)}` : match;
        if (!dids.has(digits)) numbers.add(digits);
      }
    }
  }
  return numbers;
}

function callWindow(rows: CdrLeg[]) {
  const points = rows.map(row => ({
    start: new Date(String(row.calldate || '').replace(' ', 'T')).getTime(),
    duration: Math.max(0, Number(row.duration || 0))
  })).filter(point => Number.isFinite(point.start));
  if (!points.length) return null;
  const start = Math.min(...points.map(point => point.start));
  const end = Math.max(...points.map(point => point.start + point.duration * 1000));
  return { start, end };
}

function isIncomingGroup(rows: CdrLeg[]): boolean {
  return rows.some(row => /from-trunk|from-pstn|sip-external|from-digital|from-outside|ext-queues|ext-group|ext-local/i.test(String(row.dcontext || '')))
    && !rows.every(row => String(row.dcontext || '').toLowerCase() === 'from-internal');
}

function hasAnsweredConversation(rows: CdrLeg[]): boolean {
  return rows.some(row => String(row.disposition || '').toUpperCase() === 'ANSWERED' && Number(row.billsec || 0) > 0);
}

function shouldMergeBrokenBranches(left: CdrLeg[], right: CdrLeg[]): boolean {
  const leftId = logicalId(left[0]);
  const rightId = logicalId(right[0]);
  if (!leftId || !rightId || leftId === rightId) return false;

  // This fallback is intentionally limited to independently rooted Asterisk
  // channels created in the same second. Valid linkedid chains remain primary.
  if (rootSecond(leftId) === '' || rootSecond(leftId) !== rootSecond(rightId)) return false;
  if (!isIncomingGroup(left) || !isIncomingGroup(right)) return false;
  if (hasAnsweredConversation(left) === hasAnsweredConversation(right)) return false;

  const leftNumbers = externalNumbers(left);
  const rightNumbers = externalNumbers(right);
  if (![...leftNumbers].some(number => rightNumbers.has(number))) return false;

  const leftWindow = callWindow(left);
  const rightWindow = callWindow(right);
  if (!leftWindow || !rightWindow) return false;
  return leftWindow.start <= rightWindow.end && rightWindow.start <= leftWindow.end;
}

export function groupCdrLegs(rows: CdrLeg[]): CdrLeg[][] {
  const groups = new Map<string, CdrLeg[]>();
  for (const row of rows) {
    const key = logicalId(row);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const merged = [...groups.values()];
  for (let leftIndex = 0; leftIndex < merged.length; leftIndex += 1) {
    for (let rightIndex = merged.length - 1; rightIndex > leftIndex; rightIndex -= 1) {
      if (!shouldMergeBrokenBranches(merged[leftIndex], merged[rightIndex])) continue;
      merged[leftIndex].push(...merged[rightIndex]);
      merged.splice(rightIndex, 1);
    }
  }
  return merged;
}
