import assert from 'node:assert/strict';
import { AiAuditService } from '../server/ai-platform/audit/aiAuditService.js';
import type { AiPlatformStore } from '../server/ai-platform/storage/aiPlatformStore.js';
import { ReadOnlyExecutorRegistry } from '../server/ai-platform/tools/executors/readOnlyExecutors.js';
import { ToolExecutor } from '../server/ai-platform/tools/toolExecutor.js';
import type { ToolExecutionContext } from '../server/ai-platform/tools/toolExecutionContext.js';
import { InMemoryToolRateLimiter } from '../server/ai-platform/tools/toolRateLimiter.js';
import { validateToolInput } from '../server/ai-platform/tools/toolInputValidator.js';
import { validateToolOutput } from '../server/ai-platform/tools/toolOutputValidator.js';
import { TOOL_SCHEMAS } from '../server/ai-platform/tools/toolSchemas.js';
import { createPBXReadServices, maskIp, maskPhone, maskSipContact, safeExtension } from '../server/services/pbxReadServices.js';

interface ExecutionRow { id:number;tenant_id:number;agent_version_id:number;tool_id:number;tool_key:string;status:string;input_json:string;input_hash:string;output_json:string|null;error_code:string|null;duration_ms:number|null;idempotency_key:string|null }
class MemoryToolStore implements AiPlatformStore {
  tool:any={id:7,tool_key:'pbx.get_active_calls',executor_key:'pbx.get_active_calls',risk_level:'read',enabled:1};
  assigned=true;assignmentEnabled=1;executions:ExecutionRow[]=[];audits:any[][]=[];transitions:string[]=[];
  async query(sql:string,params:any[]=[]):Promise<any>{
    if(sql.includes('FROM ai_tools')&&!sql.includes('ai_agent_tools'))return this.tool&&Number(params[0])===this.tool.id?[this.tool]:[];
    if(sql.includes('FROM ai_agent_tools'))return this.assigned?[{enabled:this.assignmentEnabled}]:[];
    if(sql.includes('FROM ai_tool_executions WHERE tenant_id=? AND idempotency_key=?'))return this.executions.filter(row=>row.tenant_id===params[0]&&row.idempotency_key===params[1]);
    if(sql.startsWith('INSERT INTO ai_tool_executions')){const id=this.executions.length+1;this.executions.push({id,tenant_id:params[0],agent_version_id:params[4],tool_id:params[5],tool_key:params[6],status:params[8],input_json:params[10],input_hash:params[11],output_json:null,error_code:null,duration_ms:null,idempotency_key:params[13]});this.transitions.push('requested');return{insertId:id,affectedRows:1}}
    if(sql.includes("SET status='running'")){const row=this.executions.find(item=>item.id===params[0]&&item.status==='requested');if(row){row.status='running';this.transitions.push('running')}return{affectedRows:row?1:0}}
    if(sql.includes('SET status=?,output_json=')){const row=this.executions.find(item=>item.id===params[4]&&['requested','running'].includes(item.status));if(row){row.status=params[0];row.output_json=params[1];row.error_code=params[2];row.duration_ms=params[3];this.transitions.push(params[0])}return{affectedRows:row?1:0}}
    if(sql.startsWith('INSERT INTO ai_audit_log')){this.audits.push(params);return{insertId:this.audits.length,affectedRows:1}}
    return[];
  }
}
const validOutput={items:[]};
const context=(overrides:Partial<ToolExecutionContext>={}):ToolExecutionContext=>({traceId:'trace-1',tenantId:1,installationId:'installation',actorId:'su',actorType:'user',agentId:2,agentVersionId:3,conversationId:null,toolId:7,toolKey:'pbx.get_active_calls',permissions:['execute_ai_read_tools'],locale:'ru',requestStartedAt:new Date().toISOString(),idempotencyKey:null,...overrides});
const harness=(options:{enabled?:boolean;executor?:any;risk?:string;assigned?:boolean;toolEnabled?:number;executorKey?:string;limits?:any;timeoutMs?:number}={})=>{
  const store=new MemoryToolStore();store.tool.risk_level=options.risk||'read';store.tool.enabled=options.toolEnabled??1;store.tool.executor_key=options.executorKey||store.tool.tool_key;store.assigned=options.assigned??true;
  const registry=new ReadOnlyExecutorRegistry();if(options.executorKey!=='missing')registry.register(store.tool.executor_key,options.executor|| (async()=>validOutput));
  const audit=new AiAuditService(store);const limiter=new InMemoryToolRateLimiter(options.limits||{userPerMinute:10,tenantPerMinute:30,conversationConcurrency:2});
  const executor=new ToolExecutor(store,audit,registry,{isCoreEnabled:async()=>options.enabled??true,areWriteToolsEnabled:async()=>false,timeoutMs:options.timeoutMs||100,limiter});
  return{store,audit,executor};
};
const rejected=async(promise:Promise<any>,code:string)=>assert.rejects(()=>promise,(error:any)=>error.code===code);

{
  const {store,executor}=harness();const result=await executor.execute(context(),{});assert.equal(result.ok,true);assert.deepEqual(store.transitions,['requested','running','completed']);
  assert.ok(store.audits.some(row=>row[4]==='tool_execution_requested'));assert.ok(store.audits.some(row=>row[4]==='tool_execution_completed'));
}
for(const test of [
  {options:{enabled:false},code:'feature_disabled',error:'feature_disabled'},
  {options:{toolEnabled:0},code:'permission_denied',error:'permission_denied'},
  {options:{assigned:false},code:'permission_denied',error:'tool_not_assigned'},
  {options:{executorKey:'missing'},code:'invalid_request',error:'unknown_executor'}
]){const {store,executor}=harness(test.options);await rejected(executor.execute(context(),{}),test.code);assert.equal(store.executions[0].status,'denied');assert.equal(store.executions[0].error_code,test.error)}
{
  const {store,executor}=harness();await rejected(executor.execute(context({permissions:[]}),{}),'permission_denied');assert.equal(store.executions[0].status,'denied');
}
for(const risk of ['low_write','high_write','forbidden']){const {store,executor}=harness({risk});await rejected(executor.execute(context(),{}),'permission_denied');assert.equal(store.executions[0].error_code,'write_tools_disabled')}
{
  const {store,executor}=harness();store.tool={...store.tool,tool_key:'pbx.get_extensions_status',executor_key:'pbx.get_extensions_status'};const registry=(executor as any).executors as ReadOnlyExecutorRegistry;registry.register('pbx.get_extensions_status',async()=>validOutput);
  await rejected(executor.execute(context({toolKey:'pbx.get_extensions_status'}),{limit:0}),'invalid_request');assert.equal(store.executions[0].error_code,'invalid_tool_input');assert.ok(store.audits.some(row=>row[4]==='invalid_tool_input'));
}
{
  const {store,executor}=harness({executor:async()=>({items:[{direction:'inbound'}]})});await rejected(executor.execute(context(),{}),'internal_error');assert.equal(store.executions[0].status,'failed');assert.equal(store.executions[0].error_code,'invalid_tool_output');
}
{
  const {store,executor}=harness({executor:async()=>{throw new Error('raw secret');}});await rejected(executor.execute(context(),{}),'internal_error');assert.equal(store.executions[0].status,'failed');assert.equal(store.executions[0].error_code,'tool_failed');assert.notEqual(store.executions[0].status,'running');
}
{
  const {store,executor}=harness({executor:async()=>new Promise(()=>undefined),timeoutMs:10});await rejected(executor.execute(context(),{}),'internal_error');assert.equal(store.executions[0].status,'timed_out');
}
{
  const {store,executor}=harness({executor:async(_input:any,signal:AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled'))))});const controller=new AbortController();const promise=executor.execute(context(),{},controller.signal);setTimeout(()=>controller.abort(),5);await rejected(promise,'conflict');assert.equal(store.executions[0].status,'cancelled');assert.ok(store.audits.some(row=>row[4]==='tool_execution_cancelled'));
}
{
  let calls=0;const {store,executor}=harness({executor:async()=>{calls++;return validOutput}});const ctx=context({idempotencyKey:'same-key'});const first=await executor.execute(ctx,{}),second=await executor.execute(ctx,{});assert.equal(calls,1);assert.equal(second.replayed,true);assert.equal(first.id,second.id);assert.equal(store.executions.length,1);
  store.tool={...store.tool,id:8};await rejected(executor.execute({...ctx,toolId:8},{}),'conflict');store.tool={...store.tool,id:7};
  await rejected(executor.execute(ctx,{different:true}),'conflict');
  store.executions[0].status='failed';await rejected(executor.execute(ctx,{}),'conflict');
  await rejected(executor.execute(context({idempotencyKey:'invalid key with spaces'}),{}),'invalid_request');
}
{
  const {store,executor}=harness({limits:{userPerMinute:1,tenantPerMinute:30,conversationConcurrency:2}});await executor.execute(context(),{});await rejected(executor.execute(context(),{}),'conflict');assert.equal(store.executions[1].status,'denied');assert.equal(store.executions[1].error_code,'rate_limited');
}
{
  const {store,executor}=harness({limits:{userPerMinute:10,tenantPerMinute:1,conversationConcurrency:2}});await executor.execute(context({actorId:'one'}),{});await rejected(executor.execute(context({actorId:'two'}),{}),'conflict');assert.equal(store.executions[1].error_code,'rate_limited');
}
{
  let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);const {store,executor}=harness({executor:async()=>{await wait;return validOutput},limits:{userPerMinute:10,tenantPerMinute:30,conversationConcurrency:1}});const first=executor.execute(context({conversationId:9}),{});await new Promise(resolve=>setTimeout(resolve,0));await rejected(executor.execute(context({conversationId:9,actorId:'other'}),{}),'conflict');assert.equal(store.executions[1].error_code,'concurrency_limited');release();await first;
}
{
  const store=new MemoryToolStore(),audit=new AiAuditService(store);await audit.append({tenantId:1,traceId:'trace',actorType:'user',actorId:'su',eventType:'tool_loop_limit_reached',entityType:'tool_execution',decision:'blocked',details:{apiKey:'secret-value',input:{phone:'+79991234567'}}});assert.ok(store.audits.some(row=>row[4]==='tool_loop_limit_reached'));assert.equal(JSON.stringify(store.audits).includes('secret-value'),false);
}

const complex={type:'object',additionalProperties:false,required:['nested'],properties:{nested:{type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',minItems:1,maxItems:2,items:{type:'object',additionalProperties:false,required:['name','score','enabled'],properties:{name:{type:'string',minLength:2,maxLength:5},score:{type:'number',minimum:0,maximum:10},enabled:{type:'boolean'}}}}}}}};
validateToolInput(complex,{nested:{items:[{name:'safe',score:5,enabled:true}]}});assert.throws(()=>validateToolInput(complex,{nested:{items:[{name:'x',score:11,enabled:'yes'}]}}),(error:any)=>error.message.includes('$.nested.items[0].name'));

assert.equal(maskPhone('+74951234567'),'+74***67');assert.equal(maskIp('192.168.10.20'),'192.168.x.x');assert.equal(maskSipContact('sip:100@192.168.10.20:5060'),'sip:***@192.168.x.x:5060');assert.equal(safeExtension('101'),'101');assert.equal(safeExtension('10.0.0.1'),'');
const queries:Array<{sql:string;params:unknown[]}>=[];const services=createPBXReadServices({runFixedDiagnostic:async command=>({success:true,message:command==='sip_registry'?'trunk Registered':''}),parseChannels:()=>[],parsePjsip:()=>new Map(),parseSipPeers:()=>new Map(),queryCdr:async(sql,params)=>{queries.push({sql,params});return /COUNT/.test(sql)?[{total:0,answered:0,missed:0,avgDuration:0}]:[]},readDirectory:async()=>[],readAuthoritativeExtensions:async()=>[]});
const outputs:Record<string,any>={
  'pbx.get_active_calls':await services.activeCalls({}),'pbx.get_sip_registrations':await services.sipRegistrations({}),'pbx.get_trunks_status':await services.trunksStatus({}),
  'pbx.get_extensions_status':await services.extensionsStatus({limit:5}),'pbx.get_missed_calls':await services.missedCalls({periodHours:24,limit:5}),
  'pbx.get_call_statistics':await services.callStatistics({period:'today'}),'directory.search_contacts':await services.searchContacts({query:'test',limit:5}),
  'calls.search_history':await services.searchHistory({limit:5})};
for(const[key,output]of Object.entries(outputs))validateToolOutput(TOOL_SCHEMAS[key].output,output);
console.log('AI Platform Tools tests: OK');
