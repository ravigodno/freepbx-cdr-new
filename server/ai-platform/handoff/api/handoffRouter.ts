import type{Express}from"express";import type{HandoffConfigService}from"../handoffConfigService.js";
export function registerHandoffRoutes(app:Express,r:any,service:HandoffConfigService){const{authenticated,permit,wrap,getTenantId,actor,positiveInt}=r;
 app.get("/api/ai-platform/handoff/destinations",...authenticated,permit("view_ai_handoff"),wrap(async(_q:any,res:any)=>res.json({success:true,rows:await service.destinations()})));
 app.get("/api/ai-platform/handoff/config",...authenticated,permit("view_ai_handoff"),wrap(async(req:any,res:any)=>res.json({success:true,data:await service.forExtension(await getTenantId(),positiveInt(req.query.aiExtensionId,"AI Extension id"))})));
 app.post("/api/ai-platform/handoff/validate",...authenticated,permit("configure_ai_handoff"),wrap(async(req:any,res:any)=>res.json({success:true,data:await service.inspect(String(req.body?.type||""),String(req.body?.ref||""))})));
 app.post("/api/ai-platform/handoff/preview",...authenticated,permit("configure_ai_handoff"),wrap(async(req:any,res:any)=>res.status(201).json({success:true,data:await service.preview(await getTenantId(),req.body||{},actor(req))})));
 app.post("/api/ai-platform/handoff/apply",...authenticated,permit("publish_ai_handoff"),wrap(async(req:any,res:any)=>res.json({success:true,data:await service.apply(await getTenantId(),positiveInt(req.body?.previewId,"preview id"),req.body?.confirm===true,actor(req))})));
 app.get("/api/ai-platform/handoff/readiness",...authenticated,permit("test_ai_handoff"),wrap(async(req:any,res:any)=>{const row=await service.activeForAgent(await getTenantId(),positiveInt(req.query.agentId,"agent id"),positiveInt(req.query.versionId,"version id"));res.json({success:true,data:{ready:Boolean(row),automaticCall:false,status:row?.status||"not_configured"}})}));
 app.get("/api/ai-platform/handoff/history",...authenticated,permit("view_ai_handoff"),wrap(async(_q:any,res:any)=>res.json({success:true,rows:await service.history(await getTenantId())})));
}
