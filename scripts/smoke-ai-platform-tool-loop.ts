import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { runAsteriskCliCommand } from '../server/asteriskCli.js';
import { getDirectoryRuntimeSnapshot } from '../server/pbxpulsDirectoryRuntime.js';
import { AiAuditService } from '../server/ai-platform/audit/aiAuditService.js';
import { ConversationRuntime } from '../server/ai-platform/conversations/conversationRuntime.js';
import type { ProviderExecutor } from '../server/ai-platform/conversations/runtimeTypes.js';
import type { AiPlatformStore } from '../server/ai-platform/storage/aiPlatformStore.js';
import { ToolExecutor } from '../server/ai-platform/tools/toolExecutor.js';
import { createPBXReadExecutorRegistry } from '../server/ai-platform/tools/executors/pbxReadExecutors.js';
import { createPBXReadServices,type FixedDiagnostic } from '../server/services/pbxReadServices.js';

const legacy=JSON.parse(fs.readFileSync('data/db.json','utf8')),settings=legacy.settings||{};
const commands:Record<FixedDiagnostic,string>={channels:'core show channels concise',pjsip_contacts:'pjsip show contacts',pjsip_registrations:'pjsip show registrations outbound',pjsip_endpoints:'pjsip show endpoints',sip_peers:'sip show peers',sip_registry:'sip show registry'};
const query=async(sql:string,params:unknown[])=>{const connection=await mysql.createConnection({host:settings.dbHost,port:settings.dbPort,user:settings.dbUser,password:settings.dbPass,database:settings.dbName,connectTimeout:5000,dateStrings:true});try{const[rows]=await connection.execute(sql,params as any[]);return rows as any[]}finally{await connection.end()}};
const services=createPBXReadServices({runFixedDiagnostic:key=>runAsteriskCliCommand(commands[key],5000),queryCdr:query,readDirectory:async context=>(await getDirectoryRuntimeSnapshot({legacyDirectory:legacy.directory||[],settings,authUser:{username:context.actorId,role:'su'},dbUser:{username:context.actorId,role:'su'}})).contacts,readAuthoritativeExtensions:async()=>{try{return await query("SELECT id ext,description name,tech FROM asterisk.devices WHERE id REGEXP '^[0-9]{2,6}$'",[])}catch{return query("SELECT id ext,description name,tech FROM devices WHERE id REGEXP '^[0-9]{2,6}$'",[])}},readConfiguredTrunks:async()=>[]});

const tools=[
  {id:1,tool_key:'pbx.get_active_calls',description:'Active calls',executor_key:'pbx.get_active_calls'},
  {id:2,tool_key:'pbx.get_extensions_status',description:'Extension states',executor_key:'pbx.get_extensions_status'},
  {id:3,tool_key:'pbx.get_call_statistics',description:'Call statistics',executor_key:'pbx.get_call_statistics'},
  {id:4,tool_key:'directory.search_contacts',description:'Directory search',executor_key:'directory.search_contacts'}
];
class SmokeStore implements AiPlatformStore{
  messages:any[][]=[];executions:any[]=[];
  async query(sql:string,params:any[]=[]):Promise<any>{
    if(sql.includes('FROM ai_agent_test_sessions s JOIN'))return[{id:1,agent_id:2,agent_version_id:3,conversation_id:4,started_by:'smoke-su',status:'active',lifecycle_status:'draft',system_prompt:'Answer from safe read-only observations.'}];
    if(sql.includes('FROM ai_agent_versions v JOIN ai_agents'))return[{id:3,agent_id:2,version_number:1,lifecycle_status:'draft',config_json:'{}',agent_key:'smoke',name:'Sandbox Agent',agent_type:'custom',agent_status:'draft'}];
    if(sql.includes('FROM ai_knowledge_sources')||sql.includes('FROM ai_agent_knowledge')||sql.includes('FROM ai_training_versions'))return[];
    if(sql.includes('FROM ai_agent_tools')&&sql.includes('executor_key'))return tools;
    if(sql.includes('FROM ai_agent_tools')&&sql.includes('at.enabled'))return[{enabled:1}];
    if(sql.includes('FROM ai_agent_tools'))return tools.map(x=>({...x,version:1,risk_level:'read',enabled:1}));
    if(sql.includes('FROM ai_tools')&&!sql.includes('ai_agent_tools')){const found=tools.find(x=>x.id===Number(params[0]));return found?[{...found,risk_level:'read',enabled:1}]:[]}
    if(sql.includes('MAX(sequence_no)'))return[{next_no:this.messages.length+1}];
    if(sql.startsWith('INSERT INTO ai_conversation_messages')){this.messages.push(params);return{insertId:this.messages.length}}
    if(sql.startsWith('INSERT INTO ai_audit_log'))return{insertId:1};
    if(sql.startsWith('INSERT INTO ai_tool_executions')){const row={id:this.executions.length+1,tenant_id:params[0],trace_id:params[1],conversation_id:params[2],agent_version_id:params[4],tool_id:params[5],tool_key:params[6],status:params[8],input_hash:params[11],output_json:null,error_code:null,duration_ms:null,idempotency_key:params[13]};this.executions.push(row);return{insertId:row.id}}
    if(sql.includes("SET status='running'")){const row=this.executions.find(x=>x.id===params[0]);if(row)row.status='running';return{affectedRows:row?1:0}}
    if(sql.includes('SET status=?,output_json=')){const row=this.executions.find(x=>x.id===params[4]);if(row){row.status=params[0];row.output_json=params[1];row.error_code=params[2];row.duration_ms=params[3]}return{affectedRows:row?1:0}}
    if(sql.includes('FROM ai_tool_executions'))return this.executions.slice(-1);
    if(sql.includes('FROM ai_conversation_messages')&&sql.includes("role IN"))return this.messages.filter(x=>['user','assistant'].includes(x[3])).map(x=>({role:x[3],content:x[4]}));
    return[];
  }
}
const store=new SmokeStore(),audit=new AiAuditService(store),executor=new ToolExecutor(store,audit,createPBXReadExecutorRegistry(services),{isCoreEnabled:async()=>true,areWriteToolsEnabled:async()=>false,timeoutMs:8000});
const planner:ProviderExecutor=Object.assign(async(input:any)=>{if(input.responseFormat==='json'){const prompt=String(input.messages[0]?.content||'');if(prompt.includes('Already collected results'))return provider('{"decision":"respond","toolKey":null,"arguments":{},"reasonCode":"enough_data"}');const message=String(input.messages.at(-1)?.content||'').toLowerCase();if(message.includes('активн'))return provider('{"decision":"tool","toolKey":"pbx.get_active_calls","arguments":{},"reasonCode":"current_calls"}');if(message.includes('внутренн'))return provider('{"decision":"tool","toolKey":"pbx.get_extensions_status","arguments":{"limit":10},"reasonCode":"extension_state"}');if(message.includes('сколько звонков'))return provider('{"decision":"tool","toolKey":"pbx.get_call_statistics","arguments":{"period":"today"},"reasonCode":"today_stats"}');if(message.includes('контакт'))return provider('{"decision":"tool","toolKey":"directory.search_contacts","arguments":{"query":"","limit":10},"reasonCode":"directory_search"}');return provider('{"decision":"respond","toolKey":null,"arguments":{},"reasonCode":"no_tool"}')}return provider('Готово: показаны доступные безопасные данные.')},{getCapabilities:()=>({text:true,streaming:false,nativeTools:false,realtimeVoice:false,structuredOutput:true,structuredToolRequest:true})});
function provider(content:string){return{content,provider:'controlled-smoke',model:'deterministic',finishReason:'stop',usage:{inputTokens:null,outputTokens:null,totalTokens:null},latencyMs:0,providerRequestId:null}}
const runtime=new ConversationRuntime(store,audit,planner,executor),actor={traceId:'controlled-smoke',actorId:'smoke-su',permissions:['execute_ai_read_tools']};
for(const message of ['Есть ли сейчас активные звонки?','Покажи состояние внутренних номеров','Сколько звонков было сегодня?','Найди контакт по имени','Соедините меня с человеком']){const result=await runtime.message(1,1,message,actor);console.log(JSON.stringify({message,source:result.finalResponseSource,transferRequired:result.transferRequired,tools:result.toolsExecuted,denied:result.toolsDenied,steps:result.toolLoopCount,safeSummaries:result.toolResultsSummary.map(x=>x.safeSummary)}))}
