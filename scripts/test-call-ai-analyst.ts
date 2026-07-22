import assert from 'node:assert/strict';
import express from 'express';
import fetch from 'node-fetch';
import { explainStructuredContext, resetAiAnalystRuntimeForTests, type CallIntelligenceContext } from '../server/callIntelligence/aiAnalyst.js';
import { registerCallIntelligenceRoutes } from '../server/callIntelligence/router.js';

const context:CallIntelligenceContext={kind:'call',call:{direction:'outbound',caller:'100',callee:'+79991234567',ip:'192.168.1.7',linkedid:'1784615534.30'},diagnosis:{status:'problem_found',summary:'SIP 503',confidence:'confirmed'},evidence:[{source:'sip',message:'503 Service Unavailable from 192.168.1.7'}],route:[{type:'trunk',label:'MTS'}],quality:{available:false},problems:[{code:'sip_503',confidence:'confirmed'}],insights:{similarProblems:24},recommendations:['Проверить транк']};
const valid=JSON.stringify({explanation:'Подтверждён SIP 503. Транк недоступен.',facts:[{text:'Транк вернул SIP 503',sourceType:'sip',evidenceIndexes:[0],confidence:'confirmed'}],confidence:'confirmed',recommendations:[{text:'Проверить транк',basedOn:[0],confidence:'confirmed',isActionRequired:true}],limitations:[]});
let calls=0,payload='';const deps:any={getAiSettings:async()=>({provider:'openai',model:'test',apiKey:'test-key'}),completeAi:async(p:any)=>{calls++;payload=p.messages[0].text;return valid}};
resetAiAnalystRuntimeForTests();const meta:any={userId:'tester',operation:'call',targetId:'real-call'};
const first=await explainStructuredContext(deps,context,'call:key',meta),second=await explainStructuredContext(deps,context,'call:key',meta);
assert.equal(calls,1);assert.equal(first.modelMeta.cached,false);assert.equal(second.modelMeta.cached,true);assert.equal(first.facts[0].evidenceIndexes[0],0);assert.equal(first.confidence,'confirmed');
for(const secret of ['192.168.1.7','79991234567','1784615534.30','test-key'])assert(!payload.includes(secret));

const app=express();app.use(express.json());const auth=()=>((req:any,res:any,next:any)=>req.headers.authorization?next():res.status(401).json({error:'Unauthorized'})),check=async(req:any,p:string)=>String(req.headers['x-test-permissions']||'').split(',').includes(p);
registerCallIntelligenceRoutes(app,auth,check,{queryCdr:async()=>[],getAiSettings:deps.getAiSettings,completeAi:deps.completeAi,getSipDialogs:()=>({dialogs:[],events:[],engine:'PBXPuls SIP parser',session:null})} as any);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port,url=`http://127.0.0.1:${port}/api/monitoring/call-intelligence/ai/status`;
assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{authorization:'x','x-test-permissions':'view_call_intelligence'}})).status,403);assert.equal((await fetch(url,{headers:{authorization:'x','x-test-permissions':'view_call_intelligence,view_ai_pbx_admin'}})).status,200);await new Promise<void>(r=>server.close(()=>r()));
console.log('Call AI Analyst tests: OK');
