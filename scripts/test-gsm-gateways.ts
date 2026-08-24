import assert from 'node:assert/strict';
import { detectOpenVoxBoardCount, parseOpenVoxGsm, parseOpenVoxPortIdentities, parseOpenVoxRoutes, parseOpenVoxSipEndpoints, parseOpenVoxSmsHistory, parseOpenVoxUssdResponse, signalLevel } from '../server/gsmGateways/openvoxClient.js';

const gsm=parseOpenVoxGsm(JSON.stringify({1:[{signal:'25',ber:'0',operator:'25060',register:'Registered (Home network)',state:'READY',pdd:'2',acd:'60',asr:'50',remain_time:'No Limit'}]}),1);
assert.equal(gsm[0].id,'gsm-1.1');assert.equal(gsm[0].ready,true);assert.equal(gsm[0].signalLevel,'excellent');assert.equal(signalLevel(-1),'offline');assert.equal(signalLevel(19),'good');
const sip=parseOpenVoxSipEndpoints(`<div>SIP Information</div><table><tr><th>Endpoint</th></tr><tr><td>sip-main</td><td>user1</td><td>192.168.1.2</td><td>server</td><td>OK (12 ms)</td></tr><tr><td>sip-down</td><td>user2</td><td>192.168.1.2</td><td>client</td><td>UNREACHABLE</td></tr></table>`);
assert.equal(sip.length,2);assert.equal(sip[0].reachable,true);assert.equal(sip[0].latencyMs,12);assert.equal(sip[1].reachable,false);
assert.equal(detectOpenVoxBoardCount(`<tr id='gsm_1_4'></tr><tr id='gsm_2_1'></tr>`,1),2);
const system=`<span>gsm-1.1(79780000001)</span><div>Routing Information</div><table><tr><th>x</th></tr><tr><td>in-79780000001</td><td>gsm-1.1(79780000001)</td><td>sip-79780000001</td><td></td></tr></table>`;
assert.equal(parseOpenVoxPortIdentities(system)['gsm-1.1'],'79780000001');assert.equal(parseOpenVoxRoutes(system).length,1);
const inbox=`Total Records: 2<table><tr><th>x</th></tr><tr><td></td><td>gsm-1.1</td><td>MTC</td><td>2026/08/24 10:00:00</td><td>Balance 10</td></tr></table><span title="total pages: 1">`;
assert.deepEqual(parseOpenVoxSmsHistory(inbox,'inbox'),{total:2,totalPages:1,items:[{port:'gsm-1.1',phoneNumber:'MTC',time:'2026/08/24 10:00:00',status:null,message:'Balance 10'}]});
assert.equal(parseOpenVoxUssdResponse('{"message":"*100#","report":[{"response":"Баланс 123,45 руб."}]}'),'Баланс 123,45 руб.');
assert.equal(parseOpenVoxUssdResponse('{"message":"*100#","result":"sending"}'),'');
console.log(JSON.stringify({ok:true,gsmParser:true,sipParser:true}));
