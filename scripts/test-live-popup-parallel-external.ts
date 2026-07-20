import assert from 'node:assert/strict';
import { detectLiveCallDirection } from '../server/liveCallDirection.js';
import { groupLiveChannelsForOperator, preserveLiveCallCandidate } from '../server/liveCallGroups.js';

const channels = [
  {
    Linkedid: '1784215711.70', Uniqueid: '1784215711.70', Channel: 'PJSIP/200-00000013',
    CallerIDNum: '200', ConnectedLineNum: '100', Exten: '100', Context: 'macro-dial',
    ChannelStateDesc: 'Up', BridgeId: 'bridge-active'
  },
  {
    Linkedid: '1784215711.70', Uniqueid: '1784215718.75', Channel: 'SIP/100-0000000f',
    CallerIDNum: '100', ConnectedLineNum: '200', Exten: 's', Context: 'macro-dial-one',
    ChannelStateDesc: 'Up', BridgeId: 'bridge-active'
  },
  {
    Linkedid: '1784215731.76', Uniqueid: '1784215731.76', Channel: 'SIP/841282-in-00000010',
    CallerIDNum: '74994907209', ConnectedLineNum: '9999', Exten: '9999', Context: 'ext-group',
    Application: 'Dial', ApplicationData: 'SIP/100&PJSIP/200,20'
  },
  {
    Linkedid: '1784215731.76', Uniqueid: '1784215733.78', Channel: 'PJSIP/200-00000014',
    CallerIDNum: '74994907209', ConnectedLineNum: '200', Exten: 's', Context: 'from-internal',
    ChannelStateDesc: 'Ringing'
  }
];

const groups = groupLiveChannelsForOperator(channels, '200');
assert.deepEqual(groups.map(group => group[0].Linkedid), ['1784215711.70', '1784215731.76']);

const externalDirection = detectLiveCallDirection(groups[1], '200');
assert.equal(externalDirection.direction, 'incoming');

const raw = { active: true, linkedid: '1784215731.76', displayNumber: '74994907209', direction: 'incoming' };
assert.deepEqual(preserveLiveCallCandidate(raw, { active: false }), raw);
assert.deepEqual(preserveLiveCallCandidate(raw, null), raw);
assert.equal(preserveLiveCallCandidate(raw, { active: true, displayName: 'Клиент' }).displayNumber, '74994907209');

console.log('parallel external live popup: ok');
