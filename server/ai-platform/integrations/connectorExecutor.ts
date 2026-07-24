import crypto from 'node:crypto';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { IntegrationActionRegistry } from './integrationActionRegistry.js';
import { IntegrationCredentialStore } from './credentialStore.js';
import { createConnector } from './integrationConnectors.js';
import { safeErrorCode, sanitizeExternalValue } from './integrationSecurity.js';
import { redactAiPlatformValue } from '../core/redaction.js';

export interface IntegrationExecutionContext { tenantId:number;agentId:number|null;agentVersionId:number|null;conversationId:string|null;actorId:string|null;role:string;confirmed:boolean;idempotencyKey?:string|null;dryRun?:boolean }
export class ConnectorExecutor {
  private registry = new IntegrationActionRegistry();
  private credentials: IntegrationCredentialStore;
  constructor(private store:AiPlatformStore){this.credentials=new IntegrationCredentialStore(store)}
  async execute(context:IntegrationExecutionContext,integrationId:number,actionId:string,input:Record<string,unknown>){
    const action=this.registry.get(actionId);if(!action)throw new Error('ACTION_NOT_ALLOWED');
    const integration=(await this.store.query('SELECT * FROM ai_integrations WHERE id=? AND tenant_id=? LIMIT 1',[integrationId,context.tenantId]))[0];
    if(!integration||!integration.enabled||integration.status!=='active')throw new Error('INTEGRATION_DISABLED');
    const policy=context.agentId?(await this.store.query('SELECT * FROM ai_agent_integration_policies WHERE tenant_id=? AND agent_id=? AND integration_id=? AND enabled=1 LIMIT 1',[context.tenantId,context.agentId,integrationId]))[0]:null;
    if(context.agentId&&!policy)throw new Error('ACTION_NOT_ALLOWED');
    const allowed=policy?JSON.parse(policy.allowed_actions_json||'[]'):[actionId];
    if(!allowed.includes(actionId))throw new Error('ACTION_NOT_ALLOWED');
    if(!action.allowedRoles.includes(context.role)&&!['su','admin'].includes(context.role))throw new Error('ACTION_NOT_ALLOWED');
    if(action.confirmationPolicy==='required'&&!context.confirmed)throw new Error('CONFIRMATION_REQUIRED');
    const allowedFields=policy?JSON.parse(policy.allowed_fields_json||'[]'):[];
    if(allowedFields.length&&Object.keys(input).some(key=>!allowedFields.includes(key)))throw new Error('VALIDATION_FAILED');
    if(policy&&context.conversationId){const count=await this.store.query('SELECT COUNT(*) total FROM ai_integration_executions WHERE tenant_id=? AND conversation_id=? AND integration_id=?',[context.tenantId,context.conversationId,integrationId]);if(Number(count[0]?.total||0)>=Number(policy.max_calls_per_conversation||10))throw new Error('RATE_LIMITED')}
    const businessKey=String(input.businessKey||input.phone||input.id||'default').slice(0,100);
    const idempotencyKey=action.idempotencyPolicy==='none'?null:(context.idempotencyKey||`${context.conversationId||'test'}:${actionId}:${crypto.createHash('sha256').update(businessKey).digest('hex').slice(0,24)}`);
    if(idempotencyKey){const prior=(await this.store.query("SELECT id,status,result_json,external_object_id FROM ai_integration_executions WHERE tenant_id=? AND integration_id=? AND idempotency_key=? AND status='completed' LIMIT 1",[context.tenantId,integrationId,idempotencyKey]))[0];if(prior)return{id:Number(prior.id),duplicate:true,status:prior.status,data:JSON.parse(prior.result_json||'{}'),externalObjectId:prior.external_object_id}}
    const mapping=(await this.store.query('SELECT * FROM ai_integration_mappings WHERE tenant_id=? AND integration_id=? AND action_id=? AND enabled=1 LIMIT 1',[context.tenantId,integrationId,actionId]))[0]||{};
    const requestId=crypto.randomUUID(),safeInput=redactAiPlatformValue(input).value;
    const inserted:any=await this.store.query(`INSERT INTO ai_integration_executions(tenant_id,request_id,idempotency_key,integration_id,agent_id,agent_version_id,conversation_id,action_id,side_effect_level,confirmation_status,status,input_fields_json,input_masked_json,started_at)VALUES(?,?,?,?,?,?,?,?,?,?, 'running',?,?,NOW())`,[context.tenantId,requestId,idempotencyKey,integrationId,context.agentId,context.agentVersionId,context.conversationId,actionId,action.sideEffectLevel,context.confirmed?'confirmed':'not_required',JSON.stringify(Object.keys(input)),JSON.stringify(safeInput)]);
    const id=Number(inserted.insertId);
    if(context.dryRun&&action.sideEffectLevel!=='read_only'){await this.store.query("UPDATE ai_integration_executions SET status='previewed',completed_at=NOW(),result_json='{\"dryRun\":true}' WHERE id=? AND tenant_id=?",[id,context.tenantId]);return{id,status:'previewed',data:{dryRun:true,actionId},duplicate:false}}
    try{
      const credential=await this.credentials.get(context.tenantId,integrationId);
      const result=await createConnector(String(integration.provider_type)).execute(integration,{...mapping,request_mapping:JSON.parse(mapping.request_mapping_json||'{}'),responseMapping:JSON.parse(mapping.response_mapping_json||'{}')},credential,{requestId,actionId,input,idempotencyKey,dryRun:Boolean(context.dryRun)});
      const safe=sanitizeExternalValue(result.data);
      await this.store.query("UPDATE ai_integration_executions SET status='completed',result_json=?,external_object_id=?,latency_ms=?,completed_at=NOW() WHERE id=? AND tenant_id=?",[JSON.stringify(safe),result.externalObjectId||null,result.latencyMs,id,context.tenantId]);
      await this.audit(context,requestId,integrationId,actionId,action.sideEffectLevel,'completed',Object.keys(input),result.externalObjectId||null,result.latencyMs,null);
      return{id,status:result.status,data:safe,externalObjectId:result.externalObjectId||null,duplicate:false,latencyMs:result.latencyMs};
    }catch(error){const code=safeErrorCode(error);await this.store.query("UPDATE ai_integration_executions SET status='failed',error_code=?,completed_at=NOW() WHERE id=? AND tenant_id=?",[code,id,context.tenantId]);await this.audit(context,requestId,integrationId,actionId,action.sideEffectLevel,'failed',Object.keys(input),null,null,code);throw new Error(code)}
  }
  private async audit(context:IntegrationExecutionContext,traceId:string,integrationId:number,actionId:string,sideEffect:string,decision:string,inputFields:string[],externalObjectId:string|null,latencyMs:number|null,errorCode:string|null){await this.store.query(`INSERT INTO ai_audit_log(tenant_id,trace_id,actor_type,actor_id,event_type,entity_type,entity_id,decision,details_json)VALUES(?,?,'service',?,'integration_action_executed','integration',?,?,?)`,[context.tenantId,traceId,context.actorId?.slice(0,191)||null,String(integrationId),decision,JSON.stringify({agentId:context.agentId,conversationId:context.conversationId,actionId,sideEffect,inputFields,externalObjectId,latencyMs,errorCode,confirmed:context.confirmed})])}
}
