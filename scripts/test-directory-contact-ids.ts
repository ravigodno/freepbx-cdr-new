import assert from 'node:assert/strict';
import { createDirectoryContactId, createUniqueDirectoryContactId } from '../server/directoryContactIds.js';

const ids = new Set<string>();
for (let index = 0; index < 1_000_000; index++) ids.add(createDirectoryContactId());
assert.equal(ids.size, 1_000_000, 'one million generated IDs must be unique');

const parallel = await Promise.all(Array.from({ length: 20_000 }, async () => createDirectoryContactId()));
assert.equal(new Set(parallel).size, parallel.length, 'parallel generation must be unique');

let attempts = 0;
const retried = await createUniqueDirectoryContactId(
  async id => id === 'dir_collision',
  () => (++attempts < 3 ? 'dir_collision' : 'dir_after_retry'),
  4
);
assert.equal(retried, 'dir_after_retry');
assert.equal(attempts, 3);
console.log(JSON.stringify({ generated: ids.size, parallel: parallel.length, collisions: 0, retryAttempts: attempts }));
