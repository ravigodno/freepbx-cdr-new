import assert from 'node:assert/strict';
import { rankLiveCallBanners } from '../src/utils/liveCallBanner.js';

const active = { linkedid: 'active', direction: 'incoming', connected: true, durationSec: 45 };
const waiting = { linkedid: 'waiting', direction: 'incoming', ringing: true, durationSec: 8 };
const outgoing = { linkedid: 'outgoing', direction: 'outgoing', ringing: true, durationSec: 12 };

assert.deepEqual(
  rankLiveCallBanners([waiting, active, outgoing]).map(call => call.linkedid),
  ['active', 'waiting', 'outgoing'],
  'Соединённый разговор должен оставаться основным при новом входящем звонке'
);

assert.deepEqual(
  rankLiveCallBanners([{ ...active, linkedid: 'newer', durationSec: 10 }, active]).map(call => call.linkedid),
  ['active', 'newer'],
  'Из двух соединённых разговоров основным должен оставаться более длительный'
);

assert.deepEqual(
  rankLiveCallBanners([outgoing, waiting]).map(call => call.linkedid),
  ['waiting', 'outgoing'],
  'Ожидающий входящий должен иметь приоритет над звонящим исходящим'
);

console.log('live popup priority: ok');
