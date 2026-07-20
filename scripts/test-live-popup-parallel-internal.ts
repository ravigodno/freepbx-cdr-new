import assert from 'node:assert/strict';
import { detectLiveCallDirection, selectLiveInternalCounterparty } from '../server/liveCallDirection.js';
import { groupLiveChannelsForOperator } from '../server/liveCallGroups.js';

const channels = [
  {
    Linkedid: '1784214529.48', Uniqueid: '1784214529.48', Channel: 'PJSIP/200-0000000c',
    CallerIDNum: '200', ConnectedLineNum: '100', Exten: '100', Context: 'macro-dial',
    ChannelStateDesc: 'Up', BridgeId: 'bridge-active'
  },
  {
    Linkedid: '1784214529.48', Uniqueid: '1784214536.53', Channel: 'SIP/100-0000000c',
    CallerIDNum: '100', ConnectedLineNum: '200', Exten: 's', Context: 'macro-dial-one',
    ChannelStateDesc: 'Up', BridgeId: 'bridge-active'
  },
  {
    Linkedid: '1784214552.54', Uniqueid: '1784214552.54', Channel: 'PJSIP/299-0000000d',
    CallerIDNum: '299', ConnectedLineNum: '200', Exten: '200', Context: 'ext-local',
    Application: 'Dial', ApplicationData: 'PJSIP/200/sip:200@192.168.1.222:5060'
  },
  {
    Linkedid: '1784214552.54', Uniqueid: '1784214552.55', Channel: 'PJSIP/200-0000000e',
    CallerIDNum: '299', ConnectedLineNum: '200', Exten: 's', Context: 'from-internal',
    ChannelStateDesc: 'Ringing'
  }
];

const groups = groupLiveChannelsForOperator(channels, '200');
assert.deepEqual(groups.map(group => group[0].Linkedid), ['1784214529.48', '1784214552.54']);

const waitingDirection = detectLiveCallDirection(groups[1], '200');
assert.equal(waitingDirection.direction, 'internal');
assert.equal(waitingDirection.internalCaller, '299');
assert.equal(waitingDirection.destinationNumber, '200');
assert.equal(selectLiveInternalCounterparty(waitingDirection, '200'), '299');

console.log('parallel internal live popup: ok');
