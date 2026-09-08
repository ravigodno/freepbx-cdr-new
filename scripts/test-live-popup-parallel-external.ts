import assert from 'node:assert/strict';
import { detectLiveCallDirection } from '../server/liveCallDirection.js';
import {
  groupLiveChannelsForOperator,
  preserveLiveCallCandidate,
  synchronizeIncomingCallerIdentity
} from '../server/liveCallGroups.js';

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
    Linkedid: '1784215731.76', Uniqueid: '1784215731.76', Channel: 'PJSIP/79885090300-00000010',
    CallerIDNum: '74994907209', ConnectedLineNum: '9999', Exten: '9999', Context: 'dial-with-exten',
    Application: 'Dial', ApplicationData: 'SIP/100&PJSIP/200,20'
  },
  {
    Linkedid: '1784215733.78', Uniqueid: '1784215733.78', Channel: 'PJSIP/200-00000014',
    CallerIDNum: '200', ConnectedLineNum: '', Exten: '9999', Context: 'from-internal',
    ChannelStateDesc: 'Ringing'
  }
];

const groups = groupLiveChannelsForOperator(channels, '200');
assert.deepEqual(new Set(groups.map(group => group[0].Linkedid)), new Set(['1784215711.70', '1784215731.76']));
const externalGroup = groups.find(group => group[0].Linkedid === '1784215731.76')!;
assert.equal(externalGroup.length, 2);

const externalDirection = detectLiveCallDirection(externalGroup, '200');
assert.equal(externalDirection.direction, 'incoming');

const raw: {active:boolean;linkedid?:string;displayNumber?:string;direction?:string;displayName?:string} = { active: true, linkedid: '1784215731.76', displayNumber: '74994907209', direction: 'incoming' };
assert.deepEqual(preserveLiveCallCandidate(raw, { active: false }), raw);
assert.deepEqual(preserveLiveCallCandidate(raw, null), raw);
assert.equal(preserveLiveCallCandidate(raw, { active: true, displayName: 'Клиент' }).displayNumber, '74994907209');

const corrected = synchronizeIncomingCallerIdentity({
  active: true,
  direction: 'incoming',
  externalCallerNumber: '79788101210',
  callerNumber: '15',
  sourceNumber: '15',
  displayNumber: '79788101210',
  displayName: 'Тукалова София',
  callerDisplayName: 'Случайный участник группы',
  callerCompany: 'Старая компания', callerPosition: '',
  did: '79885090300',
  trunkNumber: '79885090300'
}, number => ({
  name: number === '79788101210' ? 'Внешний клиент' : '',
  company: 'Клиентская компания',
  position: 'Директор',
  fields: { source: 'directory' }
}));
assert.equal(corrected.callerNumber, '79788101210');
assert.equal(corrected.callerDisplayName, 'Внешний клиент');
assert.equal(corrected.callerCompany, 'Клиентская компания');
assert.equal(corrected.callerPosition, 'Директор');

console.log('parallel external live popup: ok');
