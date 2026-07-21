import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCallIntelligenceCore, buildCallIntelligenceSip } from '../server/callIntelligence/service.js';

const cdr=[
  {calldate:'2026-07-21 12:00:00',clid:'"100" <100>',src:'100',dst:'200',dcontext:'from-internal',channel:'SIP/100-00000001',dstchannel:'PJSIP/200-00000002',lastapp:'Dial',lastdata:'PJSIP/200',duration:40,billsec:35,disposition:'ANSWERED',uniqueid:'1784615534.30',linkedid:'1784615534.30',recordingfile:'internal-100-200.wav'},
  {calldate:'2026-07-21 12:00:01',clid:'"100" <100>',src:'100',dst:'200',dcontext:'from-internal',channel:'Local/200@from-internal-0001;1',dstchannel:'PJSIP/200-00000002',lastapp:'Dial',lastdata:'PJSIP/200',duration:39,billsec:35,disposition:'ANSWERED',uniqueid:'1784615534.31',linkedid:'1784615534.30',recordingfile:''}
];
const cel=[
  {id:1,eventtype:'CHAN_START',eventtime:'2026-07-21 12:00:00',cid_num:'100',exten:'200',context:'from-internal',channame:'SIP/100-00000001',uniqueid:'1784615534.30',linkedid:'1784615534.30'},
  {id:2,eventtype:'ANSWER',eventtime:'2026-07-21 12:00:05',cid_num:'200',exten:'200',context:'from-internal',channame:'PJSIP/200-00000002',uniqueid:'1784615534.31',linkedid:'1784615534.30'},
  {id:3,eventtype:'HANGUP',eventtime:'2026-07-21 12:00:40',cid_num:'100',exten:'200',context:'from-internal',channame:'SIP/100-00000001',uniqueid:'1784615534.30',linkedid:'1784615534.30'}
];
const deps:any={
  queryCdr:async(sql:string)=>/FROM cel/i.test(sql)?cel:/FROM cdr/i.test(sql)?cdr:[],
  getLiveChannels:async()=>[],
  getSipDialogs:()=>({engine:'PBXPuls SIP parser',session:{status:'completed'},dialogs:[{callId:'call@example',from:'100',to:'200'}],events:[{id:'sip-1',callId:'call@example',requestMethod:'INVITE',raw:'Authorization: secret'}]})
};

const core=await buildCallIntelligenceCore(deps,{query:'1784615534.30',queryType:'linkedid',from:'2026-07-21T00:00:00Z',to:'2026-07-22T00:00:00Z'});
assert.equal(core.summary.id,'1784615534.30');
assert.equal(core.summary.state,'completed');
assert.equal(core.summary.disposition,'ANSWERED');
assert.equal(core.summary.cdrCount,2);
assert.equal(core.summary.celCount,3);
assert.equal(core.recordings[0].filename,'internal-100-200.wav');
assert(core.timeline.length>=7);
assert(core.graph.nodes.length>=2);
const sip=await buildCallIntelligenceSip(deps,{query:'call@example'});
assert.equal(sip.engine,'PBXPuls SIP parser');
assert.equal(sip.dialogs.length,1);
assert(!JSON.stringify(sip).includes('Authorization: secret'));

const router=fs.readFileSync('server/callIntelligence/router.ts','utf8');
const ui=fs.readFileSync('src/modules/monitoring/tabs/monitoring/CallIntelligencePanel.tsx','utf8');
const migrations=fs.readFileSync('server/pbxpulsMigrations.ts','utf8');
assert(router.includes("check(req, 'view_call_intelligence')"));
for(const endpoint of ['candidates','core','logs','sip','quality','security','export','diagnosis'])assert(router.includes(`/call-intelligence/${endpoint}`));
assert(migrations.includes('20260721_025_call_intelligence_permission'));
assert(ui.includes('AbortController'));
assert(ui.includes('PBXPuls SIP parser'));
assert(ui.includes('RTCP отсутствует'));
assert(!ui.includes('Math.random'));
console.log('Call Intelligence tests: OK');
