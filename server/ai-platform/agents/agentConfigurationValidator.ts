import { AiPlatformError } from '../core/errors.js';
import { parseJsonObject } from '../core/redaction.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { validatePersonalityProfile } from './agentPersonalityProfile.js';

export interface AgentValidationResult { valid:boolean; errors:string[] }
const FORBIDDEN_CONFIG_KEYS=new Set([
  'apikey','authorization','password','passwd','clientsecret','privatekey',
  'webhooksecret','connectionstring','credentials','providercredentials',
  'providercredentialreference',
]);
const SECRET_VALUE_PATTERNS=[
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/i,
  /\b(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/-]{8,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:api.?key|password|passwd|client.?secret|webhook.?secret|token)\s*[:=]\s*\S{6,}/i,
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/,
];
const normalizedKey=(key:string)=>key.replace(/[^a-z0-9]/gi,'').toLowerCase();
const safePath=(parts:string[])=>parts.map(part=>part.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,64)).join('.').slice(0,191);
const looksLikeSecretScalar=(value:unknown)=>{
  if(typeof value!=='string')return false;
  const text=value.trim();
  return SECRET_VALUE_PATTERNS.some(pattern=>pattern.test(text))||(/^[A-Za-z0-9._~+/-]{12,}$/.test(text)&&/[A-Z0-9._~+/-]/.test(text));
};

export function findAiConfigSecretField(value:unknown,path:string[]=[]):string|null{
  if(typeof value==='string')return SECRET_VALUE_PATTERNS.some(pattern=>pattern.test(value))?safePath(path.length?path:['config']):null;
  if(!value||typeof value!=='object')return null;
  if(Array.isArray(value)){
    for(let index=0;index<value.length;index++){
      const found=findAiConfigSecretField(value[index],[...path,String(index)]);
      if(found)return found;
    }
    return null;
  }
  for(const[key,child]of Object.entries(value as Record<string,unknown>)){
    const childPath=[...path,key],keyName=normalizedKey(key);
    if(FORBIDDEN_CONFIG_KEYS.has(keyName)||((keyName==='secret'||keyName==='token')&&looksLikeSecretScalar(child)))
      return safePath(childPath);
    const found=findAiConfigSecretField(child,childPath);
    if(found)return found;
  }
  return null;
}
export const containsAiConfigSecrets=(value:unknown):boolean=>findAiConfigSecretField(value)!==null;

export class AgentConfigurationValidator {
  constructor(private readonly store:AiPlatformStore) {}

  async validate(tenantId:number, input:{templateId?:number|null;behaviorProfileId?:number|null;config:unknown;prompt:unknown;requireChecksum?:boolean;checksum?:unknown}):Promise<AgentValidationResult>{
    const errors:string[]=[];
    let config:Record<string,unknown>={};
    try{config=parseJsonObject(input.config,'config')}catch{errors.push('invalid_config')}
    if(containsAiConfigSecrets(config))errors.push('secrets_not_allowed');
    errors.push(...validatePersonalityProfile(config.personality));
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
