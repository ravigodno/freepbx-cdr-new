import crypto from "node:crypto";
import type{AiPlatformStore}from"../storage/aiPlatformStore.js";
import type{AiAuditService}from"../audit/aiAuditService.js";
import{AiPlatformError}from"../core/errors.js";
import{voiceHash}from"../voice/voiceEncryption.js";
import{AI_EXTENSION_CONTEXT,AI_EXTENSION_OBJECT_TYPE,fallbackDialplanTarget,normalizeAiExtension,type AiExtensionFallbackType}from"./aiExtensionTypes.js";
import{FreePbxAiExtensionAdapter}from"./freePbxAiExtensionAdapter.js";
import{assertAiExtensionTransition,verifyLoadedAiExtensionDialplan}from"./aiExtensionStateMachine.js";

const safeName=(value:unknown)=>String(value||"AI Extension").replace(/[<>]/g,"").trim().slice(0,191);
const inputHash=(value:unknown)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safeDestination=(value:string)=>value?`${"*".repeat(Math.max(2,value.length-2))}${value.slice(-2)}`:null;
const managedExisting=(inspection:any,destination:string)=>inspection.miscApplication?.some((row:any)=>String(row.dest)===destination)
  && inspection.customDestination?.some((row:any)=>String(row.target)===destination);

export class AiExtensionService{
  constructor(private store:AiPlatformStore,private audit:AiAuditService,private freepbx=new FreePbxAiExtensionAdapter()){}
  async list(tenantId:number,agentId?:number){
    const params:any[]=[tenantId];let where="e.tenant_id=?";
    if(agentId){where+=" AND e.agent_id=?";params.push(agentId)}
    return this.store.query(`SELECT e.id,e.extension,e.display_name displayName,e.agent_id agentId,e.published_agent_version_id publishedAgentVersionId,
      v.version_number publishedVersion,e.provider,e.status,e.enabled,e.freepbx_object_type freepbxObjectType,e.dialplan_context dialplanContext,
      e.dialplan_destination dialplanDestination,e.fallback_type fallbackType,e.fallback_value_safe fallbackValueSafe,
      e.maximum_concurrent_calls maximumConcurrentCalls,e.last_synced_at lastSyncedAt,e.sync_status syncStatus,e.sync_error_code syncErrorCode,
      e.created_at createdAt,e.updated_at updatedAt FROM ai_extensions e
      JOIN ai_agent_versions v ON v.id=e.published_agent_version_id AND v.tenant_id=e.tenant_id
      WHERE ${where} ORDER BY e.extension`,params);
  }
  async get(tenantId:number,id:number){
    const row=(await this.store.query("SELECT * FROM ai_extensions WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,id]))[0];
    if(!row)throw new AiPlatformError("not_found",404,"AI Extension not found");
    return row;
  }
  async suggest(tenantId:number,start=200,end=999){
    const lower=Math.max(10,Math.min(start,99999999)),upper=Math.max(lower,Math.min(end,99999999));
    for(let candidate=lower;candidate<=upper;candidate++){
      const extension=String(candidate),own=(await this.store.query("SELECT id FROM ai_extensions WHERE tenant_id=? AND extension=? AND status NOT IN('archived') LIMIT 1",[tenantId,extension]))[0];
      if(own)continue;
      const inspection=await this.freepbx.inspect(extension);
      if(!inspection.conflicts.length&&!inspection.managedBlockPresent&&!inspection.legacyRoutePresent)return{extension};
    }
    throw new AiPlatformError("conflict",409,"Свободный внутренний номер не найден");
  }
  private normalize(input:any){
    let extension:string;try{extension=normalizeAiExtension(input.extension)}catch{throw new AiPlatformError("invalid_request",400,"Внутренний номер должен содержать 2–8 цифр")}
    const fallbackType=String(input.fallbackType||"terminate_call") as AiExtensionFallbackType;
    if(!["extension","ring_group","queue","external","terminate_call"].includes(fallbackType))throw new AiPlatformError("invalid_request",400,"Invalid fallback type");
    const fallbackValue=String(input.fallbackValue||"").replace(/\D/g,"");
    if(fallbackType!=="terminate_call"&&!fallbackValue)throw new AiPlatformError("invalid_request",400,"Fallback destination is required");
    if(fallbackValue===extension)throw new AiPlatformError("conflict",409,"Fallback cannot point to the same AI Extension");
    let fallbackTarget:string;try{fallbackTarget=fallbackDialplanTarget(fallbackType,fallbackValue)}catch{throw new AiPlatformError("invalid_request",400,"Invalid fallback destination")}
    return{extension,displayName:safeName(input.displayName),agentId:Number(input.agentId),fallbackType,fallbackValue,fallbackTarget,maximumConcurrentCalls:Math.max(1,Math.min(Number(input.maximumConcurrentCalls)||1,100))};
  }
  async validate(tenantId:number,input:any,ignoreId?:number){
    const value=this.normalize(input),inspection=await this.freepbx.inspect(value.extension);
    const own=(await this.store.query("SELECT id,display_name,status FROM ai_extensions WHERE tenant_id=? AND extension=? AND status NOT IN('archived') LIMIT 1",[tenantId,value.extension]))[0];
    const destination=`${AI_EXTENSION_CONTEXT},${value.extension},1`;
    const existingManaged=managedExisting(inspection,destination);
    const conflicts=inspection.conflicts.filter(item=>!existingManaged||!["misc_application","feature_code"].includes(item.type));
    if(own&&Number(own.id)!==Number(ignoreId||0))conflicts.push({type:"ai_extension",name:String(own.display_name)});
    if(inspection.legacyRoutePresent&&value.extension!=="205")conflicts.push({type:"dialplan",name:"existing custom route"});
    const agent=(await this.store.query(`SELECT a.id,a.name,a.status,a.current_version_id,v.version_number,v.lifecycle_status,v.config_json
      FROM ai_agents a JOIN ai_agent_versions v ON v.id=a.current_version_id AND v.tenant_id=a.tenant_id
      WHERE a.tenant_id=? AND a.id=? LIMIT 1`,[tenantId,value.agentId]))[0];
    if(!agent)throw new AiPlatformError("not_found",404,"AI agent not found");
    if(agent.lifecycle_status!=="published")conflicts.push({type:"agent",name:"published version required"});
    const reverse=(value.fallbackValue?await this.store.query("SELECT id FROM ai_extensions WHERE tenant_id=? AND extension=? AND fallback_value_hash=? AND status IN('preview_ready','active') LIMIT 1",[tenantId,value.fallbackValue,voiceHash(tenantId,value.extension)]):[])[0];
    if(reverse)conflicts.push({type:"fallback",name:"cyclic fallback"});
    let provider="openai_realtime";try{provider=String(JSON.parse(agent.config_json||"{}").voiceProfile?.provider||provider)}catch{}
    return{value,inspection,agent:{...agent,provider,config_json:undefined},conflicts,ready:conflicts.length===0};
  }
  async previewCreate(tenantId:number,input:any,actor:any){
    const key=String(input.idempotencyKey||"").trim();
    if(!/^[A-Za-z0-9_.:-]{8,100}$/.test(key))throw new AiPlatformError("invalid_request",400,"Valid idempotencyKey is required");
    const existing=(await this.store.query("SELECT id,preview_json,status FROM ai_extension_previews WHERE tenant_id=? AND idempotency_key=? LIMIT 1",[tenantId,key]))[0];
    if(existing)return{previewId:Number(existing.id),...JSON.parse(existing.preview_json),idempotent:true};
    const candidate=this.normalize(input);
    const reusable=(await this.store.query("SELECT id,route_binding_id,status,enabled FROM ai_extensions WHERE tenant_id=? AND agent_id=? AND extension=? AND status IN('active','preview_ready','disabled','conflict','sync_failed') LIMIT 1",[tenantId,candidate.agentId,candidate.extension]))[0];
    const checked=await this.validate(tenantId,input,reusable?.id),v=checked.value,destination=`${AI_EXTENSION_CONTEXT},${v.extension},1`;
    let binding=(await this.store.query("SELECT id,status,match_type,agent_version_id FROM ai_voice_route_bindings WHERE tenant_id=? AND agent_id=? AND match_value_hash=? AND match_type IN('controlled_test_extension','ai_extension') LIMIT 1",[tenantId,v.agentId,voiceHash(tenantId,v.extension)]))[0];
    if(!binding){
      const created:any=await this.store.query(`INSERT INTO ai_voice_route_bindings(tenant_id,binding_key,name,status,match_type,match_value_hash,safe_match_label,agent_id,agent_version_id,language,priority,dry_run_only,created_by)
        VALUES(?,?,?,'disabled','ai_extension',?,?,?,?,'ru',100,0,?)`,[tenantId,`ai_extension_${v.extension}`,v.displayName,voiceHash(tenantId,v.extension),v.extension,v.agentId,checked.agent.current_version_id,actor.actorId]);
      binding={id:Number(created.insertId),status:"disabled",match_type:"ai_extension",agent_version_id:Number(checked.agent.current_version_id)};
    }
    let extensionId:number;
    if(reusable){
      extensionId=Number(reusable.id);
      if(String(reusable.status)!=="active"){
        await this.store.query(`UPDATE ai_extensions SET display_name=?,published_agent_version_id=?,route_binding_id=?,provider=?,status=?,enabled=0,dialplan_destination=?,fallback_type=?,fallback_value_safe=?,fallback_value_hash=?,maximum_concurrent_calls=?,sync_status='previewed',sync_error_code=NULL,updated_at=NOW() WHERE tenant_id=? AND id=?`,[v.displayName,checked.agent.current_version_id,binding.id,String(checked.agent.provider||"openai_realtime"),checked.ready?"preview_ready":"conflict",destination,v.fallbackType,safeDestination(v.fallbackValue),v.fallbackValue?voiceHash(tenantId,v.fallbackValue):null,v.maximumConcurrentCalls,tenantId,extensionId]);
      }
    }else{
      const result:any=await this.store.query(`INSERT INTO ai_extensions(tenant_id,extension,extension_hash,display_name,agent_id,published_agent_version_id,route_binding_id,provider,status,enabled,freepbx_object_type,dialplan_context,dialplan_destination,fallback_type,fallback_value_safe,fallback_value_hash,maximum_concurrent_calls,created_by,sync_status)
        VALUES(?,?,?,?,?,?,?,?,? ,0,?,?,?,?,?,?,?,?, 'previewed')`,[tenantId,v.extension,voiceHash(tenantId,v.extension),v.displayName,v.agentId,checked.agent.current_version_id,binding.id,String(checked.agent.provider||"openai_realtime"),checked.ready?"preview_ready":"conflict",AI_EXTENSION_OBJECT_TYPE,AI_EXTENSION_CONTEXT,destination,v.fallbackType,safeDestination(v.fallbackValue),v.fallbackValue?voiceHash(tenantId,v.fallbackValue):null,v.maximumConcurrentCalls,actor.actorId]);
      extensionId=Number(result.insertId);
    }
    const activeUpdate=String(reusable?.status)==="active";
    const preview={ready:checked.ready,errors:checked.conflicts,applied:false,productionAffected:false,dialplanAffected:true,automaticCall:false,activeExtensionPreservedDuringPreview:activeUpdate,freepbxObjectsReused:managedExisting(checked.inspection,destination),freepbxObject:{type:AI_EXTENSION_OBJECT_TYPE,miscApplication:{extension:v.extension,name:`${v.displayName} — PBXPuls`,destination},customDestination:{name:`AI: ${v.displayName} (${v.extension})`,target:destination},sipEndpointCreated:false},agent:{id:v.agentId,versionId:Number(checked.agent.current_version_id),versionNumber:Number(checked.agent.version_number)},bindingBefore:{id:Number(binding.id),status:String(binding.status),matchType:String(binding.match_type),agentVersionId:Number(binding.agent_version_id)},fallback:{type:v.fallbackType,value:v.fallbackValue||null,target:v.fallbackTarget},dialplan:{context:AI_EXTENSION_CONTEXT,extension:v.extension,priority:1,legacyRoutePresent:checked.inspection.legacyRoutePresent,file:checked.inspection.dialplanFile,planned:checked.inspection.plannedDialplan,diff:{removeLegacyBlock:true,replaceManagedBlock:true,preserveOtherCustomContexts:true}},verificationPlan:[`${v.extension}@pbxpuls-ai`,`${v.extension}@app-miscapps`,`${v.extension}@from-internal`,"pbxpuls-ai-voice-test absent",`agent ${v.agentId} / version ${Number(checked.agent.version_number)}`,"binding switch after verification success"],rollbackPlan:{onError:activeUpdate?"keep_active":"sync_failed",enabled:activeUpdate,lastSyncedAt:activeUpdate?"preserve":null,binding:binding.match_type,freepbxObjects:"preserve",productionRoutes:"unchanged"},dependencies:checked.inspection.dependencies};
    const previewResult:any=await this.store.query("INSERT INTO ai_extension_previews(tenant_id,ai_extension_id,operation,idempotency_key,input_hash,preview_json,status,created_by,expires_at)VALUES(?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))",[tenantId,extensionId,reusable?"update":"create",key,inputHash(input),JSON.stringify(preview),checked.ready?"ready":"blocked",actor.actorId]);
    await this.audit.append({tenantId,...actor,eventType:"ai_extension_preview_created" as any,entityType:"ai_extension",entityId:String(extensionId),decision:checked.ready?"ready":"blocked",details:{extension:v.extension,agentId:v.agentId,productionAffected:false,dialplanAffected:true,conflicts:checked.conflicts}});
    return{previewId:Number(previewResult.insertId),extensionId,...preview};
  }
  async apply(tenantId:number,previewId:number,confirm:boolean,actor:any){
    if(confirm!==true)throw new AiPlatformError("invalid_request",400,"Explicit confirmation is required");
    const previewRow=(await this.store.query("SELECT * FROM ai_extension_previews WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,previewId]))[0];
    if(!previewRow)throw new AiPlatformError("not_found",404,"AI Extension preview not found");
    if(previewRow.status==="applied")return{...JSON.parse(previewRow.preview_json),applied:true,idempotent:true};
    if(previewRow.status!=="ready"||new Date(previewRow.expires_at).getTime()<=Date.now())throw new AiPlatformError("conflict",409,"Preview is not ready or expired");
    const extension=await this.get(tenantId,Number(previewRow.ai_extension_id)),preview=JSON.parse(previewRow.preview_json);
    const preserveActive=preview.activeExtensionPreservedDuringPreview===true&&String(extension.status)==="active"&&Number(extension.enabled)===1;
    try{
      assertAiExtensionTransition(String(extension.status) as any,"applying");
      await this.store.query("UPDATE ai_extensions SET status='applying',enabled=?,sync_status='applying',sync_error_code=NULL,updated_at=NOW() WHERE tenant_id=? AND id=?",[preserveActive?1:0,tenantId,extension.id]);
      const applied=await this.freepbx.apply(String(extension.extension),String(extension.display_name),String(preview.fallback.target));
      await this.store.query("UPDATE ai_extensions SET status='verifying',sync_status='verifying',updated_at=NOW() WHERE tenant_id=? AND id=?",[tenantId,extension.id]);
      await this.freepbx.reload();
      const dialplan=await this.freepbx.dialplan(String(extension.extension));
      const verification=verifyLoadedAiExtensionDialplan(String(extension.extension),dialplan);
      if(!verification.contextLoaded)throw new Error("DIALPLAN_CONTEXT_NOT_LOADED");
      if(!verification.miscLoaded)throw new Error("MISC_APPLICATION_NOT_LOADED");
      if(!verification.internalUsesManaged)throw new Error("LEGACY_ROUTE_STILL_ACTIVE");
      await this.store.query("UPDATE ai_voice_route_bindings SET status='active',match_type='ai_extension',agent_version_id=?,updated_at=NOW() WHERE tenant_id=? AND id=?",[extension.published_agent_version_id,tenantId,extension.route_binding_id]);
      await this.store.query("UPDATE ai_extensions SET status='active',enabled=1,freepbx_miscapp_id=?,freepbx_custom_destination_id=?,last_synced_at=NOW(),sync_status='synced',sync_error_code=NULL,updated_at=NOW() WHERE tenant_id=? AND id=?",[applied.miscApplicationId,applied.customDestinationId,tenantId,extension.id]);
      await this.store.query("UPDATE ai_extension_previews SET status='applied',applied_at=NOW() WHERE tenant_id=? AND id=?",[tenantId,previewId]);
      await this.audit.append({tenantId,...actor,eventType:"ai_extension_applied" as any,entityType:"ai_extension",entityId:String(extension.id),decision:"active",details:{extension:extension.extension,freepbxObjectType:AI_EXTENSION_OBJECT_TYPE,productionAffected:false,dialplanAffected:true}});
      return{...preview,applied:true,verified:true,productionAffected:false};
    }catch(error:any){
      const code=String(error?.message||"SYNC_FAILED").replace(/[^a-z0-9_.-]/gi,"_").slice(0,64);
      const previous=preview.bindingBefore;
      if(previous&&extension.route_binding_id)await this.store.query("UPDATE ai_voice_route_bindings SET status=?,match_type=?,agent_version_id=?,updated_at=NOW() WHERE tenant_id=? AND id=?",[previous.status,previous.matchType,previous.agentVersionId,tenantId,extension.route_binding_id]);
      if(preserveActive){
        await this.store.query("UPDATE ai_extensions SET status='active',enabled=1,sync_status='failed',sync_error_code=?,updated_at=NOW() WHERE tenant_id=? AND id=?",[code,tenantId,extension.id]);
      }else{
        await this.store.query("UPDATE ai_extensions SET status='sync_failed',enabled=0,last_synced_at=NULL,sync_status='failed',sync_error_code=?,updated_at=NOW() WHERE tenant_id=? AND id=?",[code,tenantId,extension.id]);
      }
      throw new AiPlatformError("conflict",409,"FreePBX AI Extension apply failed");
    }
  }
  async dependencies(tenantId:number,id:number){
    const row=await this.get(tenantId,id),inspection=await this.freepbx.inspect(String(row.extension));
    return{extension:String(row.extension),dependencies:inspection.dependencies,canArchive:inspection.dependencies.length===0};
  }
  async disable(tenantId:number,id:number,actor:any){
    const dependencies=await this.dependencies(tenantId,id);
    await this.store.query("UPDATE ai_extensions SET status='disabled',enabled=0,updated_at=NOW() WHERE tenant_id=? AND id=?",[tenantId,id]);
    const row=await this.get(tenantId,id);if(row.route_binding_id)await this.store.query("UPDATE ai_voice_route_bindings SET status='disabled',updated_at=NOW() WHERE tenant_id=? AND id=?",[tenantId,row.route_binding_id]);
    await this.audit.append({tenantId,...actor,eventType:"ai_extension_disabled" as any,entityType:"ai_extension",entityId:String(id),decision:"disabled",details:{dependencyCount:dependencies.dependencies.length}});
    return{id,status:"disabled",dependencies:dependencies.dependencies,historyPreserved:true};
  }
}
