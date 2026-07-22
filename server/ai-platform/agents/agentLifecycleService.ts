import crypto from 'crypto';
import { AiPlatformError } from '../core/errors.js';
import { parseJsonObject } from '../core/redaction.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { insertId } from '../storage/aiPlatformStore.js';
import type { AiAuditService } from '../audit/aiAuditService.js';

export interface LifecycleActor { traceId: string; actorType: 'user'|'system'|'service'; actorId: string|null }
export interface AgentDraftInput { agentKey: string; name: string; agentType: string; config: Record<string,unknown>; systemPrompt?: string }

const safeKey = (value: unknown) => {
  const key = String(value || '').trim();
  if (!/^[a-z][a-z0-9_-]{2,99}$/.test(key)) throw new AiPlatformError('invalid_request', 400, 'Invalid agent key');
  return key;
};
const safeText = (value: unknown, field: string, max = 191) => {
  const text = String(value || '').trim(); if (!text || text.length > max) throw new AiPlatformError('invalid_request', 400, `Invalid ${field}`); return text;
};
const checksum = (config: Record<string,unknown>, prompt: string) => crypto.createHash('sha256').update(JSON.stringify(config)).update('\n').update(prompt).digest('hex');

export class AgentLifecycleService {
  constructor(private readonly store: AiPlatformStore, private readonly audit: AiAuditService) {}

  async createAgentDraft(tenantId: number, input: AgentDraftInput, actor: LifecycleActor) {
    const config = parseJsonObject(input.config, 'config');
    const unknown = await this.findUnknownToolIds(tenantId, config);
    if (unknown.length) throw new AiPlatformError('invalid_request',400,'Agent config references unknown tools');
    const result: any = await this.store.query('INSERT INTO ai_agents (tenant_id,agent_key,name,agent_type,status,created_by) VALUES (?,?,?,?,?,?)',
      [tenantId, safeKey(input.agentKey), safeText(input.name,'name'), safeKey(input.agentType), 'draft', actor.actorId]);
    const agentId = insertId(result);
    const version = await this.createVersionDraft(tenantId, agentId, { config, systemPrompt: String(input.systemPrompt || '') }, actor);
    await this.audit.append({ tenantId, ...actor, eventType:'agent_created', entityType:'agent', entityId:String(agentId), decision:'created', details:{agentKey:input.agentKey} });
    return { id: agentId, version };
  }

  async createVersionDraft(tenantId: number, agentId: number, input: {config:Record<string,unknown>;systemPrompt?:string}, actor: LifecycleActor) {
    const agents = await this.store.query('SELECT id FROM ai_agents WHERE id=? AND tenant_id=? LIMIT 1',[agentId,tenantId]);
    if (!agents.length) throw new AiPlatformError('not_found',404,'Agent not found');
    const config = parseJsonObject(input.config,'config');
    const unknown = await this.findUnknownToolIds(tenantId, config);
    if (unknown.length) throw new AiPlatformError('invalid_request',400,'Agent config references unknown tools');
    const numbers = await this.store.query('SELECT COALESCE(MAX(version_number),0)+1 next_version FROM ai_agent_versions WHERE agent_id=?',[agentId]);
    const version = Number(numbers[0]?.next_version || 1);
    const result:any = await this.store.query(`INSERT INTO ai_agent_versions (tenant_id,agent_id,version_number,lifecycle_status,config_json,system_prompt,checksum,created_by)
      VALUES (?,?,?,?,?,?,NULL,?)`,[tenantId,agentId,version,'draft',JSON.stringify(config),String(input.systemPrompt||''),actor.actorId]);
    const id=insertId(result);
    await this.audit.append({tenantId,...actor,eventType:'agent_version_created',entityType:'agent_version',entityId:String(id),decision:'created',details:{agentId,version}});
    return {id,version,status:'draft'};
  }

  async publishVersion(tenantId:number,agentId:number,versionId:number,actor:LifecycleActor){
    const rows=await this.store.query('SELECT id,lifecycle_status,config_json,system_prompt FROM ai_agent_versions WHERE id=? AND agent_id=? AND tenant_id=? LIMIT 1',[versionId,agentId,tenantId]);
    const row=rows[0]; if(!row)throw new AiPlatformError('not_found',404,'Agent version not found');
    if(row.lifecycle_status!=='draft')throw new AiPlatformError('conflict',409,'Only draft versions can be published');
    const config=parseJsonObject(row.config_json,'config_json'); const unknown=await this.findUnknownToolIds(tenantId,config);
    if(unknown.length)throw new AiPlatformError('invalid_request',400,'Agent config references unknown tools');
    const digest=checksum(config,String(row.system_prompt||''));
    await this.store.query(`UPDATE ai_agent_versions SET lifecycle_status='published',checksum=?,published_at=NOW() WHERE id=? AND lifecycle_status='draft'`,[digest,versionId]);
    await this.store.query(`UPDATE ai_agents SET current_version_id=?,status='active',updated_at=NOW() WHERE id=? AND tenant_id=?`,[versionId,agentId,tenantId]);
    await this.audit.append({tenantId,...actor,eventType:'agent_version_published',entityType:'agent_version',entityId:String(versionId),decision:'published',details:{agentId,checksum:digest}});
    return {id:versionId,status:'published',checksum:digest};
  }

  async updateVersionDraft(tenantId:number,agentId:number,versionId:number,input:{config:Record<string,unknown>;systemPrompt?:string}){
    const rows=await this.store.query('SELECT lifecycle_status FROM ai_agent_versions WHERE id=? AND agent_id=? AND tenant_id=? LIMIT 1',[versionId,agentId,tenantId]);
    if(!rows.length)throw new AiPlatformError('not_found',404,'Agent version not found');
    if(rows[0].lifecycle_status!=='draft')throw new AiPlatformError('conflict',409,'Published and archived versions are immutable');
    const config=parseJsonObject(input.config,'config');const unknown=await this.findUnknownToolIds(tenantId,config);
    if(unknown.length)throw new AiPlatformError('invalid_request',400,'Agent config references unknown tools');
    await this.store.query(`UPDATE ai_agent_versions SET config_json=?,system_prompt=?,checksum=NULL
      WHERE id=? AND agent_id=? AND tenant_id=? AND lifecycle_status='draft'`,[JSON.stringify(config),String(input.systemPrompt||''),versionId,agentId,tenantId]);
    return{id:versionId,status:'draft'};
  }

  async archiveVersion(tenantId:number,agentId:number,versionId:number,actor:LifecycleActor){
    const rows=await this.store.query('SELECT lifecycle_status FROM ai_agent_versions WHERE id=? AND agent_id=? AND tenant_id=? LIMIT 1',[versionId,agentId,tenantId]);
    if(!rows.length)throw new AiPlatformError('not_found',404,'Agent version not found');
    if(rows[0].lifecycle_status==='archived')return {id:versionId,status:'archived'};
    await this.store.query(`UPDATE ai_agent_versions SET lifecycle_status='archived' WHERE id=? AND tenant_id=?`,[versionId,tenantId]);
    await this.store.query('UPDATE ai_agents SET current_version_id=NULL,status=\'draft\',updated_at=NOW() WHERE id=? AND tenant_id=? AND current_version_id=?',[agentId,tenantId,versionId]);
    await this.audit.append({tenantId,...actor,eventType:'agent_version_archived',entityType:'agent_version',entityId:String(versionId),decision:'archived',details:{agentId}});
    return {id:versionId,status:'archived'};
  }

  async getCurrentPublishedVersion(tenantId:number,agentId:number){
    const rows=await this.store.query(`SELECT v.* FROM ai_agents a JOIN ai_agent_versions v ON v.id=a.current_version_id
      WHERE a.id=? AND a.tenant_id=? AND v.lifecycle_status='published' LIMIT 1`,[agentId,tenantId]); return rows[0]||null;
  }

  private async findUnknownToolIds(tenantId:number,config:Record<string,unknown>):Promise<number[]>{
    const ids=Array.isArray(config.toolIds)?config.toolIds.map(Number).filter(Number.isInteger):[]; if(!ids.length)return[];
    const rows=await this.store.query(`SELECT id FROM ai_tools WHERE id IN (${ids.map(()=>'?').join(',')}) AND (tenant_id=? OR tenant_id IS NULL)`,[...ids,tenantId]);
    const known=new Set(rows.map(row=>Number(row.id))); return ids.filter(id=>!known.has(id));
  }
}
