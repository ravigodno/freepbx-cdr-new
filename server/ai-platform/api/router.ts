import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { AiPlatformError, toSafeAiPlatformError } from '../core/errors.js';
import { isAiPlatformCoreEnabled } from '../core/featureFlag.js';
import { parseJsonObject, redactAiPlatformValue } from '../core/redaction.js';
import { getInstallationTenant } from '../tenants/tenantService.js';
import { sqlAiPlatformStore, type AiPlatformStore } from '../storage/aiPlatformStore.js';
import { AiAuditService } from '../audit/aiAuditService.js';
import { AgentLifecycleService } from '../agents/agentLifecycleService.js';
import { getAIProviderRegistry } from '../providers/providerRegistry.js';
import { publicLegacyProviderConfig, readLegacyProviderConfig } from '../providers/legacyConfigReader.js';
import { getToolRegistry } from '../tools/toolRegistry.js';

type Checker=(req:Request,permission:string)=>Promise<boolean>;
export interface AiPlatformRouterDeps { requireAuth:any; checkPermission:Checker; readLegacyDb:()=>Promise<any>; store?:AiPlatformStore; isEnabled?:()=>Promise<boolean> }
const positiveInt=(value:unknown,name:string)=>{const n=Number(value);if(!Number.isInteger(n)||n<=0)throw new AiPlatformError('invalid_request',400,`Invalid ${name}`);return n};
const page=(req:Request)=>({limit:Math.max(1,Math.min(Number(req.query.limit)||50,100)),offset:Math.max(0,(Math.max(1,Number(req.query.page)||1)-1)*Math.max(1,Math.min(Number(req.query.limit)||50,100)))});
const actor=(req:Request)=>({traceId:String(req.header('x-trace-id')||crypto.randomUUID()).slice(0,64),actorType:'user' as const,actorId:String((req as any).user?.username||'authenticated').slice(0,191)});
const fail=(res:Response,error:unknown)=>{const safe=toSafeAiPlatformError(error);return res.status(safe.statusCode).json({success:false,error:safe.message,code:safe.code})};
const wrap=(handler:(req:Request,res:Response)=>Promise<any>)=>async(req:Request,res:Response)=>{try{await handler(req,res)}catch(error){fail(res,error)}};

export function registerAiPlatformRoutes(app:Express,deps:AiPlatformRouterDeps):void{
  const store=deps.store||sqlAiPlatformStore,audit=new AiAuditService(store),lifecycle=new AgentLifecycleService(store,audit);
  const readEnabled=deps.isEnabled||isAiPlatformCoreEnabled;
  const authenticated=[deps.requireAuth()];
  const permit=(permission:string)=>async(req:Request,res:Response,next:NextFunction)=>{
    if(await deps.checkPermission(req,permission))return next();
    try{const tenant=await getInstallationTenant(store);await audit.append({tenantId:tenant.id,...actor(req),eventType:'permission_denied',entityType:'api',entityId:req.path,decision:'denied',details:{permission}})}catch{}
    return res.status(403).json({success:false,error:'Access denied: insufficient permissions',code:'permission_denied'});
  };
  const enabled=async(req:Request,res:Response,next:NextFunction)=>{
    if(await readEnabled())return next();
    try{const tenant=await getInstallationTenant(store);await audit.append({tenantId:tenant.id,...actor(req),eventType:'feature_flag_blocked',entityType:'api',entityId:req.path,decision:'blocked',details:{flag:'ai.platform_core_enabled'}})}catch{}
    return res.status(503).json({success:false,error:'AI Platform Core is disabled',code:'feature_disabled'});
  };

  app.get('/api/ai-platform/status',...authenticated,permit('view_ai_platform'),wrap(async(_req,res)=>{
    const coreEnabled=await readEnabled();let tenant:any=null,counts={agents:0,published:0,tools:0};
    try{tenant=await getInstallationTenant(store);const rows=await store.query(`SELECT
      (SELECT COUNT(*) FROM ai_agents WHERE tenant_id=?) agents,
      (SELECT COUNT(*) FROM ai_agents WHERE tenant_id=? AND current_version_id IS NOT NULL) published,
      (SELECT COUNT(*) FROM ai_tools WHERE tenant_id=? OR tenant_id IS NULL) tools`,[tenant.id,tenant.id,tenant.id]);counts={agents:Number(rows[0]?.agents||0),published:Number(rows[0]?.published||0),tools:Number(rows[0]?.tools||0)}}catch{}
    const providers=getAIProviderRegistry().list();res.json({success:true,enabled:coreEnabled,tenantMode:'installation',installationTenantReady:Boolean(tenant),
      providers:providers.map(item=>item.key),providerCapabilities:providers,agentsCount:counts.agents,publishedAgentsCount:counts.published,toolsCount:counts.tools,
      writeToolsEnabled:false,voiceGatewayReady:false,realtimeVoiceReady:false});
  }));

  app.get('/api/ai-platform/agents',...authenticated,permit('view_ai_platform'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store),p=page(req);
    const rows=await store.query(`SELECT a.id,a.agent_key,a.name,a.agent_type,a.status,a.current_version_id,a.created_at,a.updated_at,
      v.version_number current_version_number,v.lifecycle_status current_version_status FROM ai_agents a LEFT JOIN ai_agent_versions v ON v.id=a.current_version_id
      WHERE a.tenant_id=? ORDER BY a.id DESC LIMIT ? OFFSET ?`,[tenant.id,p.limit,p.offset]);res.json({success:true,rows,page:Math.floor(p.offset/p.limit)+1,limit:p.limit});}));
  app.post('/api/ai-platform/agents',...authenticated,permit('manage_ai_agents'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store);
    const created=await lifecycle.createAgentDraft(tenant.id,{agentKey:req.body?.agentKey,name:req.body?.name,agentType:req.body?.agentType,config:parseJsonObject(req.body?.config||{},'config'),systemPrompt:String(req.body?.systemPrompt||'')},actor(req));res.status(201).json({success:true,data:created});}));
  app.get('/api/ai-platform/agents/:id',...authenticated,permit('view_ai_platform'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store),id=positiveInt(req.params.id,'agent id');
    const rows=await store.query('SELECT id,agent_key,name,agent_type,status,current_version_id,created_by,created_at,updated_at FROM ai_agents WHERE id=? AND tenant_id=? LIMIT 1',[id,tenant.id]);if(!rows.length)throw new AiPlatformError('not_found',404,'Agent not found');res.json({success:true,data:rows[0]});}));
  app.get('/api/ai-platform/agents/:id/versions',...authenticated,permit('view_ai_platform'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store),id=positiveInt(req.params.id,'agent id'),p=page(req);
    const rows=await store.query('SELECT id,version_number,lifecycle_status,config_json,system_prompt,checksum,created_by,created_at,published_at FROM ai_agent_versions WHERE tenant_id=? AND agent_id=? ORDER BY version_number DESC LIMIT ? OFFSET ?',[tenant.id,id,p.limit,p.offset]);res.json({success:true,rows:rows.map(row=>({...row,config:parseJsonObject(row.config_json,'config_json'),config_json:undefined})),page:Math.floor(p.offset/p.limit)+1,limit:p.limit});}));
  app.post('/api/ai-platform/agents/:id/versions',...authenticated,permit('manage_ai_agents'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store),id=positiveInt(req.params.id,'agent id');const data=await lifecycle.createVersionDraft(tenant.id,id,{config:parseJsonObject(req.body?.config||{},'config'),systemPrompt:String(req.body?.systemPrompt||'')},actor(req));res.status(201).json({success:true,data});}));
  app.post('/api/ai-platform/agents/:id/versions/:versionId/publish',...authenticated,permit('manage_ai_agents'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store);res.json({success:true,data:await lifecycle.publishVersion(tenant.id,positiveInt(req.params.id,'agent id'),positiveInt(req.params.versionId,'version id'),actor(req))});}));
  app.post('/api/ai-platform/agents/:id/versions/:versionId/archive',...authenticated,permit('manage_ai_agents'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store);res.json({success:true,data:await lifecycle.archiveVersion(tenant.id,positiveInt(req.params.id,'agent id'),positiveInt(req.params.versionId,'version id'),actor(req))});}));

  app.get('/api/ai-platform/providers',...authenticated,permit('view_ai_platform'),enabled,wrap(async(_req,res)=>{const tenant=await getInstallationTenant(store),legacy=publicLegacyProviderConfig(readLegacyProviderConfig(await deps.readLegacyDb()));
    const rows=await store.query(`SELECT id,provider_key,purpose,model,status,created_at,updated_at,
      CASE WHEN base_url IS NOT NULL AND base_url<>'' THEN 1 ELSE 0 END base_url_configured,
      CASE WHEN secret_ref IS NOT NULL OR encrypted_secret IS NOT NULL THEN 1 ELSE 0 END secret_configured FROM ai_provider_configs WHERE tenant_id=? ORDER BY provider_key,purpose`,[tenant.id]);
    res.json({success:true,rows,legacyCompatibility:legacy});}));
  app.get('/api/ai-platform/providers/capabilities',...authenticated,permit('view_ai_platform'),enabled,wrap(async(_req,res)=>res.json({success:true,rows:getAIProviderRegistry().list()})));
  app.get('/api/ai-platform/tools',...authenticated,permit('view_ai_tools'),enabled,wrap(async(_req,res)=>{const tenant=await getInstallationTenant(store);
    const rows=await store.query('SELECT id,tenant_id,tool_key,version,description,risk_level,input_schema_json,output_schema_json,executor_key,enabled,created_at,updated_at FROM ai_tools WHERE tenant_id=? OR tenant_id IS NULL ORDER BY tool_key,version',[tenant.id]);
    const runtime=new Map(getToolRegistry().list().map(item=>[`${item.key}@${item.version}`,item.executorStatus]));res.json({success:true,writeToolsEnabled:false,rows:rows.map(row=>({...row,executorStatus:runtime.get(`${row.tool_key}@${row.version}`)||'disabled'}))});}));
  app.get('/api/ai-platform/audit',...authenticated,permit('view_ai_audit'),enabled,wrap(async(req,res)=>{const tenant=await getInstallationTenant(store),p=page(req);
    const rows=await store.query('SELECT id,trace_id,actor_type,actor_id,event_type,entity_type,entity_id,decision,details_json,created_at FROM ai_audit_log WHERE tenant_id=? ORDER BY id DESC LIMIT ? OFFSET ?',[tenant.id,p.limit,p.offset]);
    res.json({success:true,rows:rows.map(row=>({...row,details:redactAiPlatformValue(parseJsonObject(row.details_json,'details_json')).value,details_json:undefined})),page:Math.floor(p.offset/p.limit)+1,limit:p.limit});}));
}
