type AnsweredCall = {
  uniqueid?: unknown;
  calldate?: unknown;
  src?: unknown;
  dst?: unknown;
  disposition?: unknown;
  billsec?: unknown;
};

export type AnsweredContactLookup<T extends AnsweredCall> = Map<string, T[]>;

function callTime(call: AnsweredCall): number {
  return new Date(String(call.calldate || '').replace(' ', 'T')).getTime();
}

export function buildAnsweredContactLookup<T extends AnsweredCall>(calls: T[]): AnsweredContactLookup<T> {
  const lookup: AnsweredContactLookup<T> = new Map();
  for (const call of calls) {
    if (String(call.disposition || '').toUpperCase() !== 'ANSWERED' || Number(call.billsec || 0) <= 0) continue;
    const keys = new Set([String(call.src || ''), String(call.dst || '')].filter(Boolean));
    for (const key of keys) {
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key)!.push(call);
    }
  }
  lookup.forEach(items => items.sort((a, b) => callTime(a) - callTime(b)));
  return lookup;
}

export function findFirstAnsweredContactAfter<T extends AnsweredCall>(lookup: AnsweredContactLookup<T>, number: string, afterMs: number): T | null {
  const calls = lookup.get(number) || [];
  let low = 0;
  let high = calls.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (callTime(calls[middle]) <= afterMs) low = middle + 1;
    else high = middle;
  }
  return calls[low] || null;
}
