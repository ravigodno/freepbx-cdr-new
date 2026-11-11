import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { resolveCallAnswerEvidence } from '../shared/callAnswerEvidence.js';

// Exercise the actual server helpers without starting listeners or production jobs.
const source = fs.readFileSync('server.ts', 'utf8');
const helper = (name: string) => {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `Missing server helper ${name}`);
  const end = source.indexOf('\n};', start);
  assert.ok(end > start);
  return source.slice(start, end + 4);
};
const compiled = transformSync([
  "const onlyDigits = value => String(value || '').replace(/\\D/g, '');",
  "const isInternalExt = value => /^\\d{2,5}$/.test(String(value || ''));",
  'const getCalleeInternalExt = call => isInternalExt(call.dst) ? call.dst : "";',
  'const getCallerInternalExt = call => isInternalExt(call.src) ? call.src : "";',
  helper('getDialedExtsFromLastData'),
  helper('getResponsibleExtension'),
  'return getResponsibleExtension;'
].join('\n'), { loader: 'ts', target: 'node16' }).code;
const responsible = new Function('resolveCallAnswerEvidence', compiled)(resolveCallAnswerEvidence) as (call: any) => string | null;

const group = { src: '79990000001', dst: '9000', dcontext: 'ext-group', lastapp: 'Dial',
  lastdata: 'SIP/203,300,HhtrQ(NO_ANSWER)', disposition: 'NO ANSWER', billsec: 0 };
assert.equal(responsible(group), '203', 'A single group CDR must belong to the dialled employee, not the group');
assert.equal(responsible({ ...group, lastdata: 'PJSIP/204&PJSIP/203,30' }), '204');
assert.equal(responsible({ ...group, lastdata: 'Local/205@from-internal/n,30' }), '205');
assert.equal(responsible({ ...group, answeredExts: ['204'] }), '204', 'Answer evidence retains priority');
assert.equal(responsible({ ...group, disposition: 'ANSWERED', billsec: 10, dstchannel: 'PJSIP/204-00000001' }), '204', 'An answered single-row CDR must use the answering channel, not the first Dial target');
assert.equal(responsible({ ...group, missedExts: ['205'] }), '205', 'Observed member legs retain priority');
assert.equal(responsible({ ...group, routeResponsibleExts: ['206'] }), '206', 'Resolved responsibility retains priority');
assert.equal(responsible({ ...group, lastdata: 'PJSIP/provider,300' }), '9000', 'Do not invent a member without historical evidence');
assert.equal(responsible({ ...group, dcontext: 'ext-local', dst: '207' }), '207', 'Direct calls retain their destination');
assert.equal(responsible({ ...group, dcontext: 'from-internal', src: '208', dst: '79990000002' }), '208');

const departments = new Map([['203', 'Офис'], ['9000', null]]);
const calls = Array.from({ length: 4 }, () => ({ ...group }));
const departmentLost = calls.filter(call => departments.get(responsible(call)!)).length;
assert.equal(departmentLost, calls.length, 'All four lost calls must appear in their employee department');
console.log('Group call responsibility: historical Dial targets, priority, fallback and department totals passed');
