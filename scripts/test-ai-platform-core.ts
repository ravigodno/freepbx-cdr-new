import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { AgentLifecycleService } from '../server/ai-platform/agents/agentLifecycleService.js';
import { AiAuditService } from '../server/ai-platform/audit/aiAuditService.js';
import { featureGateAllowsExecution } from '../server/ai-platform/core/featureFlag.js';
import { redactAiPlatformText, redactAiPlatformValue } from '../server/ai-platform/core/redaction.js';
import { AIProviderRegistry } from '../server/ai-platform/providers/providerRegistry.js';
import { OpenAIHttpAdapter } from '../server/ai-platform/providers/httpAdapters.js';
import { LegacyProviderCompatibilityAdapter } from '../server/ai-platform/providers/compatibilityAdapter.js';
import { publicLegacyProviderConfig, readLegacyProviderConfig } from '../server/ai-platform/providers/legacyConfigReader.js';
import { getInstallationTenant } from '../server/ai-platform/tenants/tenantService.js';
import { getToolRegistry } from '../server/ai-platform/tools/toolRegistry.js';
import type { AiPlatformStore } from '../server/ai-platform/storage/aiPlatformStore.js';
import { registerAiPlatformRoutes } from '../server/ai-platform/api/router.js';

class MemoryStore implements AiPlatformStore {
  agents:any[]=[];versions:any[]=[];tools=[{id:7,tenant_id:null}];audits:any[]=[];nextAgent=1;nextVersion=1;
  async query(sql:string,params:any[]=[]):Promise<any>{
    if(sql.includes('FROM ai_tenants'))return params[0]==='installation'?[{id:1,tenant_key:'installation',name:'текущая установка PBXPuls',mode:'installation',status:'active'}]:[];
    if(sql.includes('(SELECT COUNT(*) FROM ai_agents'))return[{agents:this.agents.length,published:this.agents.filter(a=>a.current_version_id).length,tools:this.tools.length}];
    if(sql.startsWith('INSERT INTO ai_agents')){const id=this.nextAgent++;this.agents.push({id,tenant_id:params[0],agent_key:params[1],current_version_id:null,status:'draft'});return{insertId:id,affectedRows:1}}
    if(sql.startsWith('SELECT id FROM ai_agents'))return this.agents.filter(a=>a.id===params[0]&&a.tenant_id===params[1]);
    if(sql.includes('MAX(version_number)'))return[{next_version:Math.max(0,...this.versions.filter(v=>v.agent_id===params[0]).map(v=>v.version_number))+1}];
    if(sql.startsWith('INSERT INTO ai_agent_versions')){const id=this.nextVersion++;this.versions.push({id,tenant_id:params[0],agent_id:params[1],version_number:params[2],lifecycle_status:'draft',config_json:params[4],system_prompt:params[5]});return{insertId:id,affectedRows:1}}
    if(sql.includes('SELECT id FROM ai_tools')){const tenantId=params[params.length-1],ids=params.slice(0,-1);return this.tools.filter(t=>ids.includes(t.id)&&(t.tenant_id===null||t.tenant_id===tenantId))}
    if(sql.startsWith('SELECT id,tenant_id,tool_key'))return[];
    if(sql.startsWith('SELECT id,lifecycle_status,config_json'))return this.versions.filter(v=>v.id===params[0]&&v.agent_id===params[1]&&v.tenant_id===params[2]);
    if(sql.startsWith('SELECT lifecycle_status FROM ai_agent_versions'))return this.versions.filter(v=>v.id===params[0]&&v.agent_id===params[1]&&v.tenant_id===params[2]);
    if(sql.startsWith("UPDATE ai_agent_versions SET lifecycle_status='published'")){const v=this.versions.find(v=>v.id===params[1]);if(v&&v.lifecycle_status==='draft'){v.lifecycle_status='published';v.checksum=params[0]}return{affectedRows:v?1:0}}
    if(sql.startsWith('UPDATE ai_agent_versions SET config_json=')){const v=this.versions.find(v=>v.id===params[2]&&v.agent_id===params[3]&&v.tenant_id===params[4]&&v.lifecycle_status==='draft');if(v){v.config_json=params[0];v.system_prompt=params[1];v.checksum=null}return{affectedRows:v?1:0}}
    if(sql.startsWith('UPDATE ai_agents SET current_version_id=')){const a=this.agents.find(a=>a.id===params[1]&&a.tenant_id===params[2]);if(a){a.current_version_id=params[0];a.status='active'}return{affectedRows:a?1:0}}
    if(sql.startsWith("UPDATE ai_agent_versions SET lifecycle_status='archived'")){const v=this.versions.find(v=>v.id===params[0]&&v.tenant_id===params[1]);if(v)v.lifecycle_status='archived';return{affectedRows:v?1:0}}
    if(sql.startsWith('UPDATE ai_agents SET current_version_id=NULL')){const a=this.agents.find(a=>a.id===params[0]&&a.tenant_id===params[1]&&a.current_version_id===params[2]);if(a){a.current_version_id=null;a.status='draft'}return{affectedRows:a?1:0}}
    if(sql.startsWith('INSERT INTO ai_audit_log')){this.audits.push(params);return{insertId:this.audits.length,affectedRows:1}}
    return[];
  }
}

const store=new MemoryStore(),audit=new AiAuditService(store),service=new AgentLifecycleService(store,audit);
const actor={traceId:'trace-test',actorType:'user' as const,actorId:'su'};
const tenant=await getInstallationTenant(store);assert.equal(tenant.tenantKey,'installation');
await assert.rejects(()=>getInstallationTenant({query:async()=>[]}));
const created=await service.createAgentDraft(tenant.id,{agentKey:'test_agent',name:'Test Agent',agentType:'custom',config:{toolIds:[7]}},actor);
assert.equal(store.agents[0].tenant_id,tenant.id);assert.equal(created.version.version,1);assert.equal(store.versions[0].lifecycle_status,'draft');
const version2=await service.createVersionDraft(tenant.id,created.id,{config:{toolIds:[]}},actor);assert.equal(version2.version,2);
await service.updateVersionDraft(tenant.id,created.id,created.version.id,{config:{toolIds:[7]},systemPrompt:'updated draft'});assert.equal(store.versions[0].system_prompt,'updated draft');
const published=await service.publishVersion(tenant.id,created.id,version2.id,actor);assert.equal(published.status,'published');assert.match(published.checksum,/^[a-f0-9]{64}$/);
await assert.rejects(()=>service.updateVersionDraft(tenant.id,created.id,version2.id,{config:{toolIds:[]}}),(error:any)=>error.code==='conflict');
await assert.rejects(()=>service.publishVersion(tenant.id,created.id,version2.id,actor),(error:any)=>error.code==='conflict');
await assert.rejects(()=>service.createVersionDraft(tenant.id,created.id,{config:{toolIds:[999]}},actor),(error:any)=>error.code==='invalid_request');

const registry=new AIProviderRegistry();registry.register(new OpenAIHttpAdapter());registry.register(new OpenAIHttpAdapter('openai_compatible',true));
for(const key of ['gemini','anthropic','deepseek'])registry.register(new LegacyProviderCompatibilityAdapter(key,async()=>''));
assert.deepEqual(registry.list().map(x=>x.key),['openai','openai_compatible','gemini','anthropic','deepseek']);
assert.equal(registry.get('openai').getCapabilities().realtimeVoice,false);assert.throws(()=>registry.get('unknown'),(error:any)=>error.code==='provider_unknown');

const secret='sk-test-secret-value',redacted=redactAiPlatformText(`apiKey=${secret} Bearer abcdefghij user@example.com 192.168.1.5 +7 999 123-45-67 /opt/private/file`);
for(const forbidden of [secret,'abcdefghij','user@example.com','192.168.1.5','999 123','/opt/private'])assert.equal(redacted.includes(forbidden),false);
await audit.append({tenantId:1,...actor,eventType:'provider_config_updated',entityType:'provider',decision:'test',details:{apiKey:secret,nested:{password:'bad'},phone:'+79991234567'}});
assert.equal(JSON.stringify(store.audits).includes(secret),false);assert.equal(JSON.stringify(redactAiPlatformValue({authorization:'Bearer hidden'}).value).includes('hidden'),false);
assert.equal(featureGateAllowsExecution(false),false);assert.equal(featureGateAllowsExecution(true),true);
assert.equal(getToolRegistry().list().length,8);assert.equal(getToolRegistry().list().every(t=>t.riskLevel==='read'&&t.executorStatus==='unavailable'),true);
const legacyPublic=publicLegacyProviderConfig(readLegacyProviderConfig({ai_pbx_settings:{provider:'openai',model:'model',apiKey:secret,baseUrl:'https://example.invalid'}}));
assert.equal(JSON.stringify(legacyPublic).includes(secret),false);assert.equal(legacyPublic.secretConfigured,true);

const migration=fs.readFileSync('server/pbxpulsMigrations.ts','utf8'),router=fs.readFileSync('server/ai-platform/api/router.ts','utf8'),legacy=fs.readFileSync('server/aiPbxAdmin.ts','utf8');
for(const table of ['ai_tenants','ai_agents','ai_agent_versions','ai_provider_configs','ai_tools','ai_agent_tools','ai_behavior_profiles','ai_audit_log'])assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(migration,/ai\.platform_core_enabled','false'/);assert.match(migration,/WHERE r\.role_key IN \('su','admin'\)/);assert.match(migration,/receptionist_default/);assert.match(migration,/lifecycle_status[^\n]+draft/);
assert.match(router,/permit\('view_ai_audit'\)/);assert.match(router,/feature_flag_blocked/);assert.match(router,/writeToolsEnabled:false/);assert.doesNotMatch(router,/encrypted_secret[^\n]+SELECT/i);
assert.match(legacy,/registerAiPbxAdminRoutes/);assert.match(legacy,/\/api\/ai-pbx-admin\/sessions/);

const request=async(server:http.Server,path:string)=>new Promise<{status:number;body:any}>((resolve,reject)=>{const address=server.address() as any;
  http.get({host:'127.0.0.1',port:address.port,path},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode||0,body:JSON.parse(body)}))}).on('error',reject)});
const makeServer=async(enabled:boolean,allowed=true)=>{const app=express();app.use(express.json());registerAiPlatformRoutes(app,{requireAuth:()=>((req:any,_res:any,next:any)=>{req.user={username:'tester'};next()}),
  checkPermission:async()=>allowed,readLegacyDb:async()=>({ai_pbx_settings:{provider:'openai',apiKey:secret}}),store,isEnabled:async()=>enabled});
  return new Promise<http.Server>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})};
const offServer=await makeServer(false);assert.equal((await request(offServer,'/api/ai-platform/status')).body.enabled,false);assert.equal((await request(offServer,'/api/ai-platform/agents')).status,503);offServer.close();
const onServer=await makeServer(true);const onStatus=await request(onServer,'/api/ai-platform/status');assert.equal(onStatus.body.enabled,true);assert.equal(JSON.stringify(onStatus.body).includes(secret),false);
const providersResponse=await request(onServer,'/api/ai-platform/providers');assert.equal(JSON.stringify(providersResponse.body).includes(secret),false);
const toolsResponse=await request(onServer,'/api/ai-platform/tools');assert.equal(toolsResponse.body.writeToolsEnabled,false);onServer.close();
const deniedServer=await makeServer(true,false);assert.equal((await request(deniedServer,'/api/ai-platform/status')).status,403);deniedServer.close();
console.log('AI Platform Core tests: OK');
