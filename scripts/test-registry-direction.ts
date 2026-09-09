import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { buildCdrRowViewModel } from '../src/modules/cdr/utils/CDRRowHelpers.js';

// Exercise the actual KPI predicates without starting the server or connecting
// to the PBX. Keep this harness limited to their pure dependency closure.
const source = readFileSync('server.ts', 'utf8');
const names = ['onlyDigits', 'isInternalExt', 'isExternalNumber', 'getChannelInternalExt', 'getCallerInternalExt', 'getCalleeInternalExt', 'hasInboundTrunkSignal', 'isIncomingRouteContext', 'isIncoming', 'isOutgoing', 'isInternal'];
const predicates = names.map(name => {
  const start = source.indexOf(`const ${name} =`);
  assert(start >= 0, `Missing predicate ${name}`);
  const end = source.indexOf('\n};', start);
  assert(end > start);
  return source.slice(start, end + 3);
}).join('\n');
const classify = runInNewContext(transformSync(`${predicates}\n(c:any) => isIncoming(c) ? 'incoming' : isOutgoing(c) ? 'outgoing' : isInternal(c) ? 'internal' : 'unknown'`, { loader: 'ts' }).code);

const inboundLocal = {
  src: '+79111111111', cnum: '+79111111111', clid: '"Caller" <+79111111111>',
  dst: '15', channel: 'Local/15@from-internal-00000000;2', dstchannel: 'PJSIP/15-00000011',
  dcontext: 'ext-local', did: '', disposition: 'ANSWERED'
};
for (const dcontext of ['ext-local', 'ext-queues', 'ext-group', 'ivr-1', 'from-trunk']) {
  for (const disposition of ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED']) {
    const call = { ...inboundLocal, dcontext, disposition };
    const registryDirection = classify(call);
    assert.equal(registryDirection, 'incoming', `${dcontext}/${disposition}`);
    const view = buildCdrRowViewModel({ ...call, registryDirection }, []);
    assert.equal(view.registryIconKind, disposition === 'ANSWERED' ? 'incoming' : 'missed');
  }
}
for (const extension of ['11', '12', '15']) {
  for (const channel of [`PJSIP/${extension}-00000001`, `Local/${extension}@from-internal-00000001;1`]) {
    const outbound = { src: '74950000000', cnum: extension, channel, dst: '+79111111111', dcontext: 'from-internal' };
    assert.equal(classify(outbound), 'outgoing');
    assert.equal(classify({ ...outbound, src: extension, dst: '20', dcontext: 'ext-local' }), 'internal');
    assert.equal(classify({ ...outbound, cnum: '', dst: '20', registryOutboundEvidence: true }), 'outgoing');
  }
}
assert.equal(classify({ src: 's', dst: 's', dcontext: 'service' }), 'unknown');
console.log('Registry KPI direction: incoming Local delivery, outgoing CallerID, internal and unknown fixtures passed');
