import type{Express}from"express";
import type{AiExtensionService}from"../aiExtensionService.js";
import{AiPlatformError}from"../../core/errors.js";

export function registerAiExtensionRoutes(app:Express,r:any,service:AiExtensionService){
  const{authenticated,permit,wrap,getTenantId,actor,positiveInt}=r;
  app.get("/api/ai-platform/ai-extensions",...authenticated,permit("view_ai_extensions"),wrap(async(req:any,res:any)=>{
    const agentId=req.query.agentId?positiveInt(req.query.agentId,"agent id"):undefined;
    res.json({success:true,rows:await service.list(await getTenantId(),agentId)});
  }));
  app.get("/api/ai-platform/ai-extensions/suggest",...authenticated,permit("view_ai_extensions"),wrap(async(req:any,res:any)=>{
    res.json({success:true,data:await service.suggest(await getTenantId(),Number(req.query.start)||200,Number(req.query.end)||999)});
  }));
  app.post("/api/ai-platform/ai-extensions/validate",...authenticated,permit("create_ai_extensions"),wrap(async(req:any,res:any)=>{
    const data=await service.validate(await getTenantId(),req.body||{});
    res.json({success:true,data:{ready:data.ready,conflicts:data.conflicts,inspection:data.inspection,agent:{id:data.agent.id,name:data.agent.name,versionNumber:data.agent.version_number}}});
  }));
  app.post("/api/ai-platform/ai-extensions/preview",...authenticated,permit("create_ai_extensions"),wrap(async(req:any,res:any)=>{
    res.status(201).json({success:true,data:await service.previewCreate(await getTenantId(),req.body||{},actor(req))});
  }));
  app.post("/api/ai-platform/ai-extensions/apply",...authenticated,permit("publish_ai_extensions"),wrap(async(req:any,res:any)=>{
    if(req.body?.confirm!==true)throw new AiPlatformError("invalid_request",400,"Explicit confirmation is required");
    res.json({success:true,data:await service.apply(await getTenantId(),positiveInt(req.body?.previewId,"preview id"),true,actor(req))});
  }));
  app.get("/api/ai-platform/ai-extensions/:id",...authenticated,permit("view_ai_extensions"),wrap(async(req:any,res:any)=>{
    res.json({success:true,data:await service.get(await getTenantId(),positiveInt(req.params.id,"AI Extension id"))});
  }));
  app.get("/api/ai-platform/ai-extensions/:id/dependencies",...authenticated,permit("view_ai_extensions"),wrap(async(req:any,res:any)=>{
    res.json({success:true,data:await service.dependencies(await getTenantId(),positiveInt(req.params.id,"AI Extension id"))});
  }));
  app.get("/api/ai-platform/ai-extensions/:id/sync-status",...authenticated,permit("view_ai_extensions"),wrap(async(req:any,res:any)=>{
    const row=await service.get(await getTenantId(),positiveInt(req.params.id,"AI Extension id"));
    res.json({success:true,data:{id:Number(row.id),status:row.status,syncStatus:row.sync_status,syncErrorCode:row.sync_error_code,lastSyncedAt:row.last_synced_at}});
  }));
  app.get("/api/ai-platform/ai-extensions/:id/test-readiness",...authenticated,permit("view_ai_extensions"),wrap(async(req:any,res:any)=>{
    const row=await service.get(await getTenantId(),positiveInt(req.params.id,"AI Extension id"));
    const ready=row.status==="active"&&Boolean(row.enabled)&&row.sync_status==="synced";
    res.json({success:true,data:{ready,automaticCallPerformed:false,errors:ready?[]:["ai_extension_not_active"]}});
  }));
  app.post("/api/ai-platform/ai-extensions/:id/disable",...authenticated,permit("update_ai_extensions"),wrap(async(req:any,res:any)=>{
    if(req.body?.confirm!==true)throw new AiPlatformError("invalid_request",400,"Explicit confirmation is required");
    res.json({success:true,data:await service.disable(await getTenantId(),positiveInt(req.params.id,"AI Extension id"),actor(req))});
  }));
}
