import assert from 'node:assert/strict';
import { createLiveSnapshotCache } from '../server/liveSnapshotCache.js';

let now = 1000;
let loads = 0;
let fail = false;
let release: (() => void) | null = null;
const cache = createLiveSnapshotCache({
  ttlMs: 2000,
  staleTtlMs: 15000,
  now: () => now,
  load: async () => {
    loads += 1;
    await new Promise<void>(resolve => { release = resolve; });
    if (fail) throw new Error('AMI timeout');
    return [`snapshot-${loads}`];
  }
});

const first = cache.get();
const concurrent = cache.get();
assert.equal(loads, 1, 'concurrent callers must share one AMI request');
release?.();
assert.deepEqual(await first, ['snapshot-1']);
assert.deepEqual(await concurrent, ['snapshot-1']);

now += 1500;
assert.deepEqual(await cache.get(), ['snapshot-1']);
assert.equal(loads, 1, 'fresh snapshot must not reconnect to AMI');

now += 1000;
fail = true;
const stale = cache.get();
release?.();
assert.deepEqual(await stale, ['snapshot-1'], 'brief AMI failure must return last successful snapshot');
assert.equal(loads, 2);

console.log('Live snapshot cache fixtures passed');
