import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import type { AiAuditService } from '../audit/aiAuditService.js';
import type { BusinessActionService } from '../actions/businessActionService.js';
import type { ToolExecutor } from '../tools/toolExecutor.js';
import type { ProviderExecutor } from './runtimeTypes.js';
import { AgentContextBuilder } from '../core/agentContextBuilder.js';
import { ApplicationEncryptionService } from '../actions/applicationEncryption.js';
import { redactAiPlatformValue } from '../core/redaction.js';
import { SkillRepository } from '../skills/skillRepository.js';
import { TOOL_SCHEMAS } from '../tools/toolSchemas.js';
import { projectToolResult } from './toolResultProjection.js';
import { AgentTaskRuntime, newAgentTaskState, callbackDraftHash, objectSchema, type AgentTaskState, type TaskTool, type TaskResult } from './agentTaskRuntime.js';
import { searchAgentKnowledge } from './agentKnowledgeSearch.js';
import { compilePersonalityInstructions } from '../agents/agentPersonalityProfile.js';

export const agentTasksEnabled=(config:any)=>config?.runtimePrompts?.agenticEnabled===true;
export const wireToolName=(key:string)=>key.replace(/\./g,'__');
export const canonicalToolName=(name:string)=>Object.keys(TOOL_SCHEMAS).find(key=>wireToolName(key)===name)||name;
export type AgentTaskRequest={tenantId:number;agentId:number;versionId:number;conversationId:number;
  channel:'sandbox'|'voice';actorId:string|null;permissions:readonly string[];traceId:string;text:string;
  callerPhone?:string;voiceSessionId?:number;signal?:AbortSignal;transferAllowed:boolean;
  transferPending?:boolean;cancelTransfer?:()=>Promise<TaskResult>;
  deferPresentation?:boolean;
  canAct?:()=>boolean;
  deliveredThrough?:number;
  transfer:(signal:AbortSignal)=>Promise<TaskResult>};

// All persisted business state stays encrypted in the existing MariaDB
// conversation record; no new file store or client-controlled capabilities.
export class AgentTaskService {
  private readonly busy=new Set<string>();
  constructor(private readonly store:AiPlatformStore,private readonly audit:AiAuditService,
    private readonly model:ProviderExecutor,private readonly toolExecutor:ToolExecutor|null,
    private readonly actions:BusinessActionService|null) {}
  async acknowledgePresentation(tenantId:number,conversationId:number,token:{turn:number;revision:string;hash:string}){
    const row=(await this.store.query('SELECT metadata_json,agent_id,agent_version_id FROM ai_conversations WHERE tenant_id=? AND id=?',[tenantId,conversationId]))[0];
    if(!row)return false;
    const raw=String(row.metadata_json||'{}'),meta=JSON.parse(raw),encryption=new ApplicationEncryptionService();
    if(!meta.agentTaskEncrypted)return false;
    const state:AgentTaskState=JSON.parse(encryption.decrypt(meta.agentTaskEncrypted)),p=state.pending;
    if(!p||p.status!=='pending'||!p.presentation||p.presentation.turn!==token.turn||p.revision!==token.revision||callbackDraftHash(p)!==token.hash)return false;
    p.presentation.delivered=true;p.presentedTurn=token.turn;
    meta.agentTaskEncrypted=encryption.encrypt(JSON.stringify(state)).ciphertext;
    const written:any=await this.store.query("UPDATE ai_conversations SET metadata_json=? WHERE tenant_id=? AND id=? AND BINARY COALESCE(metadata_json,'{}')=BINARY ?",[JSON.stringify(meta),tenantId,conversationId,raw]);
    return Number(written.affectedRows)===1;
  }
  async run(input:AgentTaskRequest) {
    const key=`${input.tenantId}:${input.conversationId}`;
    if(this.busy.has(key))throw new Error('conversation_busy');
    this.busy.add(key);
    try {
      const rows=await this.store.query('SELECT metadata_json,agent_id,agent_version_id FROM ai_conversations WHERE tenant_id=? AND id=?',[input.tenantId,input.conversationId]);
      if(!rows[0]||Number(rows[0].agent_id)!==input.agentId||Number(rows[0].agent_version_id)!==input.versionId)throw new Error('conversation_not_authorized');
      const ctx:any=await new AgentContextBuilder(this.store).buildContext(input.tenantId,input.versionId);
      const config=ctx.agent.version.config;
      if(!agentTasksEnabled(config))throw new Error('agentic_mode_not_enabled');
      const encryption=new ApplicationEncryptionService();
      const metadata=JSON.parse(String(rows[0].metadata_json||'{}'));
      let persistedCipher=metadata.agentTaskEncrypted?JSON.stringify(metadata.agentTaskEncrypted):'null';
      const state:AgentTaskState=metadata.agentTaskEncrypted?JSON.parse(encryption.decrypt(metadata.agentTaskEncrypted)):newAgentTaskState();
      const knowledgeScope=JSON.stringify(ctx.knowledge.map((s:any)=>[s.id,s.version_id,s.checksum,s.status]));
      if(state.knowledgeScope!==undefined&&state.knowledgeScope!==knowledgeScope){
        // Previously retrieved text must not survive removal/republication of
        // an assigned source. Keep action receipts and the actual client draft.
        state.history=[];state.notes=[];state.evidence=[];
      }
      state.knowledgeScope=knowledgeScope;
      if(state.pending?.status==='uncertain'){
        const p=state.pending;
        const receipt=(await this.store.query('SELECT status,output_json FROM ai_actions WHERE tenant_id=? AND idempotency_key=?',[input.tenantId,`agent-task:${input.conversationId}:${p.id}`]))[0];
        if(receipt?.status==='completed'){
          const data=JSON.parse(String(receipt.output_json||'{}'));
          p.status='completed';p.result={ok:true,status:'completed',data:{id:p.id,callbackRequestId:data.callbackRequestId,calendarScheduled:false}};
          if(!state.completed.some(x=>x.id===p.id))state.completed.push({...p});
        }
      }
      const persist=async()=>{
        const encrypted=encryption.encrypt(JSON.stringify(state));
        // The installed MariaDB predates JSON_EXTRACT/JSON_SET. Merge in JS,
        // then compare the entire original value byte-for-byte atomically.
        for(let attempt=0;attempt<2;attempt++){
          const current=(await this.store.query('SELECT metadata_json,agent_id,agent_version_id FROM ai_conversations WHERE tenant_id=? AND id=?',[input.tenantId,input.conversationId]))[0];
          if(!current||Number(current.agent_id)!==input.agentId||Number(current.agent_version_id)!==input.versionId)throw new Error('conversation_not_authorized');
          const raw=String(current.metadata_json||'{}'), merged=JSON.parse(raw);
          if((merged.agentTaskEncrypted?JSON.stringify(merged.agentTaskEncrypted):'null')!==persistedCipher)throw new Error('concurrent_task_revision');
          merged.agentTaskEncrypted=encrypted.ciphertext;
          const written:any=await this.store.query("UPDATE ai_conversations SET metadata_json=? WHERE tenant_id=? AND id=? AND BINARY COALESCE(metadata_json,'{}')=BINARY ?",[JSON.stringify(merged),input.tenantId,input.conversationId,raw]);
          if(Number(written.affectedRows)===1){persistedCipher=JSON.stringify(encrypted.ciphertext);return;}
        }
        throw new Error('concurrent_task_revision');
      };
      const assigned=await this.store.query(`SELECT t.id,t.tool_key,t.description,t.executor_key,at.config_json
        FROM ai_agent_tools at JOIN ai_tools t ON t.id=at.tool_id
        WHERE at.tenant_id=? AND at.agent_version_id=? AND at.enabled=1 AND t.enabled=1
          AND t.risk_level='read' AND (t.tenant_id=? OR t.tenant_id IS NULL)`,[input.tenantId,input.versionId,input.tenantId]);
      const owner=config.runtimePrompts?.ownerControlTest===true;
      const tools:TaskTool[]=[{key:'knowledge_search',description:owner?'Поиск только назначенных опубликованных источников. Для города укажи city в именительном падеже. tableSelection содержит полный подсчёт строк и уникальных адресов в доступных таблицах; nextOffset позволяет получить остальные строки. Обычные fragments без tableSelection НЕ полный список. Используй уже найденные актуальные сведения без повторного поиска.':'Поиск по назначенным опубликованным источникам знаний. Отсутствие совпадений не доказывает отсутствие услуги.',
        inputSchema:owner?{...objectSchema({query:{type:'string',minLength:2,maxLength:1000},city:{type:'string',maxLength:120},offset:{type:'integer',minimum:0}}),required:['query']}:objectSchema({query:{type:'string',minLength:2,maxLength:1000}}),execute:async a=>({ok:true,status:'completed',data:await searchAgentKnowledge(this.store,input.tenantId,input.agentId,a.query,owner?{city:a.city,offset:a.offset}:undefined)})}];
      for(const row of assigned) {
        let policy:any={};try{policy=JSON.parse(String(row.config_json||'{}'))}catch{}
        // External callers NEVER inherit PBX/admin data access. Existing
        // assignments default to authenticated sandbox; voice needs opt-in.
        const channels=Array.isArray(policy.allowedChannels)?policy.allowedChannels:['sandbox'];
        if(!channels.includes(input.channel)||!input.permissions.includes('execute_ai_read_tools')||!this.toolExecutor?.hasExecutor(row.executor_key)||!TOOL_SCHEMAS[row.tool_key])continue;
        tools.push({key:wireToolName(row.tool_key),description:row.description,inputSchema:TOOL_SCHEMAS[row.tool_key].input,execute:async (a,signal)=>{
          const r=await this.toolExecutor!.execute({tenantId:input.tenantId,traceId:input.traceId,installationId:'installation',actorId:input.channel==='voice'?null:input.actorId,
            actorType:input.channel==='voice'?'service':'user',agentId:input.agentId,agentVersionId:input.versionId,conversationId:input.conversationId,
            toolId:Number(row.id),toolKey:row.tool_key,permissions:input.permissions,locale:'ru',requestStartedAt:new Date().toISOString(),idempotencyKey:null},a,signal);
          return {ok:r.ok,status:'completed',data:projectToolResult(row.tool_key,r.data)};
        }});
      }
      const action=await this.store.query(`SELECT aa.id FROM ai_agent_actions aa JOIN ai_action_definitions d ON d.id=aa.action_definition_id
        WHERE aa.tenant_id=? AND aa.agent_version_id=? AND aa.enabled=1 AND d.enabled=1 AND d.action_key='business.create_callback_request'`,[input.tenantId,input.versionId]);
      const skills=await new SkillRepository(this.store).forAgentVersion(input.tenantId,input.versionId);
      const capabilities=skills.map(s=>({name:s.name,description:s.description,fields:s.fields.map(f=>({key:f.key,label:f.label,required:f.required,validation:f.validation})),
        actions:s.actions.map(a=>({key:a.actionKey,requiredFields:a.requiredFields})),businessRules:s.validationRules,completionPolicy:s.completionPolicy}));
      let requestNumber=0;
      const model:ProviderExecutor=async request=>{
        const started=performance.now(),number=++requestNumber;
        const phase=request.messages[0]?.content.startsWith('Проверь согласие')?'consent':request.messages[0]?.content.startsWith('Ответь только на содержательный')?'consultation':'decision_or_reply';
        let reason='completed';
        try{return await this.model({...request,tenantId:input.tenantId,providerKey:config.runtimePrompts?.agenticProvider||undefined,model:config.runtimePrompts?.agenticModel||undefined});}
        catch(error:any){reason=request.signal?.aborted?'caller_turn_cancelled':String(error?.code||error?.name||'decision_provider_failed');throw error;}
        finally{if(config.runtimePrompts?.ownerControlTest===true)await this.audit.append({tenantId:input.tenantId,traceId:input.traceId,actorType:'service',eventType:'tool_execution_completed',entityType:'agent_task',entityId:String(input.conversationId),decision:'model_request_diagnostic',details:{source:'decision_provider',phase,turn:state.turn,requestNumber:number,reason,requestMs:performance.now()-started,provider:config.runtimePrompts.agenticProvider,model:config.runtimePrompts.agenticModel,reasoningEffort:'not_explicitly_sent'}}).catch(()=>{});}
      };
      const output=await new AgentTaskRuntime(model).turn({...input,preserveUnanswered:owner,deferPresentation:input.channel==='voice'&&input.deferPresentation!==false,state,tools,skills:capabilities,
        instructions:`Имя: ${ctx.agent.name}. Роль: ${config.role||ctx.agent.type}.\n${ctx.agent.systemPrompt}\n${compilePersonalityInstructions(config.personality)}\nПрофиль поведения: ${JSON.stringify(ctx.behavior||{})}`,
        callbackAllowed:Boolean(this.actions&&action.length&&config.runtimePrompts?.leadCaptureEnabled===true&&input.permissions.includes('execute_ai_low_risk_actions')),
        persist,journal:async entry=>{await this.audit.append({tenantId:input.tenantId,traceId:input.traceId,actorType:input.channel==='voice'?'service':'user',actorId:input.actorId,
          eventType:'tool_execution_completed',entityType:'agent_task',entityId:String(input.conversationId),decision:entry.result.status,details:redactAiPlatformValue(entry).value});},
        saveCallback:async(draft,signal)=>{
          const r=await this.actions!.executeCallback({tenantId:input.tenantId,traceId:input.traceId,installationId:'installation',conversationId:input.conversationId,
            voiceSessionId:input.voiceSessionId||null,transferRequestId:null,agentId:input.agentId,agentVersionId:input.versionId,actorId:input.actorId,
            actorType:input.channel==='voice'?'service':'user',permissions:input.permissions,consentStatus:'granted',sourceChannel:input.channel,
            requestStartedAt:new Date().toISOString(),idempotencyKey:`agent-task:${input.conversationId}:${draft.id}`,signal} as any,
            {phone:draft.phone,reason:draft.reason,preferredTime:draft.preferredTime,priority:'normal'});
          return {ok:r.ok,status:r.ok?'completed':r.status==='failed'?'failed':'uncertain',data:{id:draft.id,callbackRequestId:r.callbackRequestId,calendarScheduled:false},errorCode:r.errorCode||undefined};
        },
      });
      return {...output,presentation:state.pending?.status==='pending'?state.pending.presentation:undefined};
    } finally {this.busy.delete(key);}
  }
}
