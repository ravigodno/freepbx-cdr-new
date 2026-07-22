import crypto from 'crypto';
import { AiPlatformError } from '../core/errors.js';
import { parseJsonObject } from '../core/redaction.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { insertId } from '../storage/aiPlatformStore.js';
import type { AiAuditService } from '../audit/aiAuditService.js';
import { AgentLifecycleService, type LifecycleActor } from './agentLifecycleService.js';
import { AgentConfigurationValidator } from './agentConfigurationValidator.js';

const safeKey=(value:unknown)=>{const key=String(value||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'_');if(!/^[a-z][a-z0-9_-]{2,99}$/.test(key))throw new AiPlatformError('invalid_request',400,'Invalid agent key');return key};
const safeName=(value:unknown)=>{const name=String(value||'').trim();if(!name||name.length>191)throw new AiPlatformError('invalid_request',400,'Invalid agent name');return name};

export class AgentBuilderService {
  private readonly lifecycle:AgentLifecycleService;
  private readonly validator:AgentConfigurationValidator;
  constructor(private readonly store:AiPlatformStore,private readonly audit:AiAuditService){this.lifecycle=new AgentLifecycleService(store,audit);this.validator=new AgentConfigurationValidator(store)}

  async createFromTemplate(tenantId:number,input:{templateId:number;agentKey:unknown;name:unknown;role?:unknown;behaviorProfileId?:number;permissionKeys?:unknown},actor:LifecycleActor){
    const templates=await this.store.query(`SELECT id,template_key,agent_type,default_prompt,default_behavior_profile_id,default_tools_json,default_permissions_json FROM ai_agent_templates WHERE id=? AND (tenant_id=? OR tenant_id IS NULL) AND status='active' LIMIT 1`,[input.templateId,tenantId]);
    const template=templates[0];if(!template)throw new AiPlatformError('not_found',404,'Agent template not found');
    const toolIds=(parseJsonObject(template.default_tools_json,'default_tools_json').toolIds as unknown[])||[];
    const defaultPermissions=(parseJsonObject(template.default_permissions_json,'default_permissions_json').permissionKeys as unknown[])||[];
    const config={templateId:Number(template.id),templateKey:String(template.template_key),role:String(input.role||template.agent_type),behaviorProfileId:Number(input.behaviorProfileId||template.default_behavior_profile_id||0),toolIds,permissionKeys:Array.isArray(input.permissionKeys)?input.permissionKeys:defaultPermissions,knowledgeSourceIds:[]};
    await this.validator.assertValid(tenantId,{templateId:Number(template.id),behaviorProfileId:config.behaviorProfileId,config,prompt:template.default_prompt});
    const created=await this.lifecycle.createAgentDraft(tenantId,{agentKey:safeKey(input.agentKey),name:safeName(input.name),agentType:String(template.agent_type),config,systemPrompt:String(template.default_prompt)},actor);
    await this.createPromptVersion(tenantId,created.version.id,String(template.default_prompt),'Created from template',actor.actorId);
    await this.linkTools(tenantId,created.version.id,toolIds.map(Number));
    await this.audit.append({tenantId,...actor,eventType:'template_used',entityType:'agent_template',entityId:String(template.id),decision:'used',details:{agentId:created.id}});
    await this.audit.append({tenantId,...actor,eventType:'agent_created_from_template',entityType:'agent',entityId:String(created.id),decision:'created',details:{templateId:template.id}});
    return created;
  }

  async cloneAgent(tenantId:number,sourceAgentId:number,input:{agentKey:unknown;name:unknown},actor:LifecycleActor){const rows=await this.store.query(`SELECT a.agent_type,v.config_json,v.system_prompt FROM ai_agents a JOIN ai_agent_versions v ON v.agent_id=a.id WHERE a.id=? AND a.tenant_id=? ORDER BY v.version_number DESC LIMIT 1`,[sourceAgentId,tenantId]);const row=rows[0];if(!row)throw new AiPlatformError('not_found',404,'Agent not found');const config=parseJsonObject(row.config_json,'config_json'),prompt=String(row.system_prompt||'');const created=await this.lifecycle.createAgentDraft(tenantId,{agentKey:safeKey(input.agentKey),name:safeName(input.name),agentType:row.agent_type,config,systemPrompt:prompt},actor);if(prompt.trim())await this.createPromptVersion(tenantId,created.version.id,prompt,'Cloned agent',actor.actorId);await this.linkTools(tenantId,created.version.id,Array.isArray(config.toolIds)?config.toolIds.map(Number):[]);await this.audit.append({tenantId,...actor,eventType:'agent_cloned',entityType:'agent',entityId:String(created.id),decision:'created',details:{sourceAgentId}});return created}
  async createDraftVersion(tenantId:number,agentId:number,input:{config:Record<string,unknown>;systemPrompt?:string;changeReason?:string},actor:LifecycleActor){const version=await this.lifecycle.createVersionDraft(tenantId,agentId,input,actor);if(String(input.systemPrompt||'').trim())await this.createPromptVersion(tenantId,version.id,String(input.systemPrompt),String(input.changeReason||'New agent draft version'),actor.actorId);return version}
  validateAgentConfiguration(tenantId:number,input:Parameters<AgentConfigurationValidator['validate']>[1]){return this.validator.validate(tenantId,input)}
  publishAgent(tenantId:number,agentId:number,versionId:number,actor:LifecycleActor){return this.lifecycle.publishVersion(tenantId,agentId,versionId,actor)}
  archiveAgent(tenantId:number,agentId:number,versionId:number,actor:LifecycleActor){return this.lifecycle.archiveVersion(tenantId,agentId,versionId,actor)}
  async createPromptVersion(tenantId:number,agentVersionId:number,prompt:string,reason:string,createdBy:string|null){if(!prompt.trim())throw new AiPlatformError('invalid_request',400,'Prompt is required');const rows=await this.store.query('SELECT COALESCE(MAX(version_number),0)+1 next_version FROM ai_agent_prompt_versions WHERE agent_version_id=?',[agentVersionId]);const version=Number(rows[0]?.next_version||1),checksum=crypto.createHash('sha256').update(prompt).digest('hex');const result:any=await this.store.query('INSERT INTO ai_agent_prompt_versions (tenant_id,agent_version_id,version_number,prompt_text,change_reason,checksum,created_by) VALUES (?,?,?,?,?,?,?)',[tenantId,agentVersionId,version,prompt,reason.slice(0,500),checksum,createdBy]);return {id:insertId(result),version,checksum}}
  private async linkTools(tenantId:number,versionId:number,toolIds:number[]){for(const toolId of toolIds)await this.store.query(`INSERT IGNORE INTO ai_agent_tools (tenant_id,agent_version_id,tool_id,enabled,config_json) VALUES (?,?,?,?,?)`,[tenantId,versionId,toolId,1,'{}'])}
}
