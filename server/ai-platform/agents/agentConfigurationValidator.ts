import { AiPlatformError } from '../core/errors.js';
import { parseJsonObject } from '../core/redaction.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';

export interface AgentValidationResult { valid:boolean; errors:string[] }
export const containsAiConfigSecrets=(value:unknown):boolean=>Boolean(value&&typeof value==='object'&&Object.entries(value as Record<string,unknown>).some(([key,child])=>/(?:api.?key|authorization|password|secret|token|credential|ami|ari|sip)/i.test(key)||containsAiConfigSecrets(child)));

export class AgentConfigurationValidator {
  constructor(private readonly store:AiPlatformStore) {}

  async validate(tenantId:number, input:{templateId?:number|null;behaviorProfileId?:number|null;config:unknown;prompt:unknown;requireChecksum?:boolean;checksum?:unknown}):Promise<AgentValidationResult>{
    const errors:string[]=[];
    let config:Record<string,unknown>={};
    try{config=parseJsonObject(input.config,'config')}catch{errors.push('invalid_config')}
    if(containsAiConfigSecrets(config))errors.push('secrets_not_allowed');
    if(!String(input.prompt||'').trim())errors.push('prompt_required');
    if(input.requireChecksum&&!String(input.checksum||'').trim())errors.push('checksum_required');
    if(input.templateId){const rows=await this.store.query('SELECT id FROM ai_agent_templates WHERE id=? AND (tenant_id=? OR tenant_id IS NULL) AND status=? LIMIT 1',[input.templateId,tenantId,'active']);if(!rows.length)errors.push('template_not_found')}
    const behaviorId=Number(input.behaviorProfileId||config.behaviorProfileId||0);
    if(!behaviorId)errors.push('behavior_required');
    else {const rows=await this.store.query('SELECT id FROM ai_behavior_profiles WHERE id=? AND tenant_id=? LIMIT 1',[behaviorId,tenantId]);if(!rows.length)errors.push('behavior_not_found')}
    const permissionKeys=Array.isArray(config.permissionKeys)?config.permissionKeys.map(String):[];
    if(permissionKeys.length){const marks=permissionKeys.map(()=>'?').join(',');const rows=await this.store.query(`SELECT permission_key FROM permissions WHERE permission_key IN (${marks})`,permissionKeys);const known=new Set(rows.map(row=>String(row.permission_key)));if(permissionKeys.some(key=>!known.has(key)))errors.push('permission_not_found')}
    const toolIds=Array.isArray(config.toolIds)?config.toolIds.map(Number).filter(Number.isInteger):[];
    if(toolIds.length){const marks=toolIds.map(()=>'?').join(',');const rows=await this.store.query(`SELECT id,risk_level FROM ai_tools WHERE id IN (${marks}) AND (tenant_id=? OR tenant_id IS NULL)`,[...toolIds,tenantId]);const known=new Set(rows.map(row=>Number(row.id)));if(toolIds.some(id=>!known.has(id)))errors.push('tool_not_found');if(rows.some(row=>row.risk_level==='forbidden'||row.risk_level==='low_write'||row.risk_level==='high_write'))errors.push('tool_not_allowed')}
    return {valid:errors.length===0,errors:[...new Set(errors)]};
  }

  async assertValid(tenantId:number,input:Parameters<AgentConfigurationValidator['validate']>[1]){const result=await this.validate(tenantId,input);if(!result.valid)throw new AiPlatformError('invalid_request',400,`Invalid agent configuration: ${result.errors.join(', ')}`);return result}
}
