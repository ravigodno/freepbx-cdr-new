import assert from 'node:assert/strict';
import { getAnsweredExtFromLegs, getQueueWaitSecondsFromLegs } from '../server/freepbx/callDetection.js';
import { buildCallRouteView } from '../src/modules/cdr/utils/buildCallRouteView.js';

const timeline = [
  {
    uniqueid: '1786531897.5735',
    calldate: '2026-08-12 13:51:37',
    src: '79787737895',
    dst: '9000',
    dcontext: 'ext-queues',
    lastapp: 'Queue',
    lastdata: '9000,t,,,60,,,,,',
    duration: 24,
    billsec: 24,
    disposition: 'ANSWERED',
  },
  {
    uniqueid: '1786531898.5739',
    calldate: '2026-08-12 13:51:38',
    src: '79787737895',
    dst: '200',
    dcontext: 'ext-local',
    lastapp: 'Dial',
    duration: 3,
    billsec: 0,
    disposition: 'NO ANSWER',
  },
  {
    uniqueid: '1786531898.5737',
    calldate: '2026-08-12 13:51:38',
    src: '79787737895',
    dst: '201',
    dcontext: 'ext-local',
    channel: 'PJSIP/201-00000001',
    dstchannel: 'PJSIP/201-00000002',
    lastapp: 'Dial',
    duration: 23,
    billsec: 20,
    disposition: 'ANSWERED',
  },
];

assert.equal(getAnsweredExtFromLegs(timeline), '201');
assert.equal(getQueueWaitSecondsFromLegs(timeline), 3);

const route = buildCallRouteView({
  timeline,
  externalCallerNumber: '79787737895',
  routeAnalysis: {
    direction: 'inbound',
    answeredExt: getAnsweredExtFromLegs(timeline),
    steps: [{ type: 'inbound_route', title: 'Входящее правило: ANY', destination: 'ext-queues,9000,1' }],
  },
});

const queue = route.routeSteps.find((step) => step.label === 'QUEUE');
assert.equal(queue?.pattern, 'Ожидание: 3 сек.');
assert.equal(queue?.members?.find((member) => member.extension === '200')?.status, 'Не ответил');
assert.equal(queue?.members?.find((member) => member.extension === '201')?.status, 'Ответил');
assert.match(route.resultText, /Ответил внутренний номер 201/);

console.log('Queue route result tests passed');
