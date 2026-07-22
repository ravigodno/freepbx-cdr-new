import { AiPlatformError } from '../core/errors.js';
import { parseJsonObject } from '../core/redaction.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { insertId } from '../storage/aiPlatformStore.js';
import type { AiAuditService } from '../audit/aiAuditService.js';
import type { LifecycleActor } from './agentLifecycleService.js';

export class AgentTemplateService {
  constructor(private readonly store:AiPlatformStore,private readonly audit:AiAuditService){}
  async create(tenantId:number,input:any,actor:LifecycleActor){const key=String(input.templateKey||'').trim();if(!/^[a-z][a-z0-9_-]{2,99}$/.test(key))throw new AiPlatformError('invalid_request',400,'Invalid template key');const result:any=await this.store.query(`INSERT INTO ai_agent_templates (tenant_id,template_key,name,description,agent_type,industry,default_prompt,default_behavior_profile_id,default_tools_json,default_permissions_json,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[tenantId,key,String(input.name||'').trim(),String(input.description||'').trim(),String(input.agentType||'').trim(),input.industry?String(input.industry):null,String(input.defaultPrompt||''),input.defaultBehaviorProfileId||null,JSON.stringify(parseJsonObject(input.defaultTools||{},'defaultTools')),JSON.stringify(parseJsonObject(input.defaultPermissions||{},'defaultPermissions')),'active']);const id=insertId(result);await this.audit.append({tenantId,...actor,eventType:'template_created',entityType:'agent_template',entityId:String(id),decision:'created',details:{templateKey:key}});return{id}}
  async update(tenantId:number,id:number,input:any){const rows=await this.store.query('SELECT tenant_id FROM ai_agent_templates WHERE id=? AND (tenant_id=? OR tenant_id IS NULL) LIMIT 1',[id,tenantId]);if(!rows.length)throw new AiPlatformError('not_found',404,'Agent template not found');if(rows[0].tenant_id===null)throw new AiPlatformError('conflict',409,'System templates are immutable');return this.store.query('UPDATE ai_agent_templates SET name=?,description=?,updated_at=NOW() WHERE id=? AND tenant_id=?',[String(input.name||'').trim(),String(input.description||'').trim(),id,tenantId])}
}
