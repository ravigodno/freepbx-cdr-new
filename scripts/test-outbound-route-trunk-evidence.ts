import assert from 'node:assert/strict';
import {
  analyzeOutboundRoute,
  extractOutboundTrunkChannelId,
  freepbxDialPatternMatches
} from '../server/freepbx/outboundTracer.js';

assert.equal(freepbxDialPatternMatches('+79788101210', '+7', '978[178]XXXXXX'), true);
assert.equal(freepbxDialPatternMatches('+79785101210', '+7', '978[178]XXXXXX'), false);
assert.equal(freepbxDialPatternMatches('73', '', '7[1-5]'), true);
assert.equal(freepbxDialPatternMatches('79', '', '7[1-5]'), false);

const realLeg = {
  linkedid: '1786543771.47',
  dstchannel: 'PJSIP/79885090300-00000024',
  lastdata: 'PJSIP/89788101210@79885090300,300,Tb(func-apply-sipheaders^s^1,(9))'
};
assert.equal(extractOutboundTrunkChannelId([realLeg]), '79885090300');

const rows = [
  { route_id: 1, route_name: 'mts', match_pattern_prefix: '+7', match_pattern_pass: '978[178]XXXXXX', prepend_digits: '8', trunk_id: 9, seq: 0, trunk_name: '79885090300', trunk_tech: 'pjsip', trunk_channelid: '79885090300', trunk_outcid: '79885090300', trunk_disabled: 'off' },
  { route_id: 1, route_name: 'mts', match_pattern_prefix: '+7', match_pattern_pass: '978[178]XXXXXX', prepend_digits: '8', trunk_id: 1, seq: 2, trunk_name: '79780159233', trunk_tech: 'pjsip', trunk_channelid: '79780159233', trunk_outcid: '79780159233', trunk_disabled: 'off' },
  { route_id: 7, route_name: 'novofon', match_pattern_prefix: '+7', match_pattern_pass: 'X.', prepend_digits: '7', trunk_id: 10, seq: 0, trunk_name: '74994907209', trunk_tech: 'pjsip', trunk_channelid: '74994907209', trunk_outcid: '74994907209', trunk_disabled: 'off' }
];
const steps = await analyzeOutboundRoute({
  settings: {},
  dialedNumber: '+79788101210',
  actualTrunkChannelId: extractOutboundTrunkChannelId([realLeg]),
  queryFreePBXCDR: async () => rows
});
assert.match(steps[0].title, /mts/i);
assert.equal(steps[0].details.trunks[0].channelid, '79885090300');
assert.notEqual(steps[0].details.trunks[0].channelid, '74994907209');

console.log('Outbound route trunk evidence fixtures passed');
