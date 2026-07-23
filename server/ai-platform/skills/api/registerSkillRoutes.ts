import type { Express } from "express";
import type { SkillService } from "../skillService.js";
import type { StructuredSkillClassifier } from "../skillRouter.js";

export function registerSkillRoutes(app:Express,runtime:any,service:SkillService,classifier:StructuredSkillClassifier|null=null){
  const {authenticated,permit,enabled,wrap,getTenantId,actor,positiveInt}=runtime;
  app.get("/api/ai-platform/skills",...authenticated,permit("view_ai_skills"),enabled,wrap(async(_req:any,res:any)=>res.json({success:true,rows:await service.repository.list(await getTenantId())})));
  app.get("/api/ai-platform/skills/:id",...authenticated,permit("view_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.repository.get(await getTenantId(),positiveInt(req.params.id,"skill id"))})));
  app.post("/api/ai-platform/skills",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.status(201).json({success:true,data:await service.create(await getTenantId(),req.body,actor(req))})));
  app.put("/api/ai-platform/skills/:id",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.update(await getTenantId(),positiveInt(req.params.id,"skill id"),req.body,actor(req))})));
  app.post("/api/ai-platform/skills/:id/fields",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.addField(await getTenantId(),positiveInt(req.params.id,"skill id"),req.body,actor(req))})));
  app.post("/api/ai-platform/skills/:id/actions",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.addAction(await getTenantId(),positiveInt(req.params.id,"skill id"),req.body,actor(req))})));
  app.put("/api/ai-platform/skills/:id/templates/:key",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.setTemplate(await getTenantId(),positiveInt(req.params.id,"skill id"),String(req.params.key),String(req.body?.text||""),actor(req))})));
  app.post("/api/ai-platform/catalogs",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.status(201).json({success:true,data:await service.createCatalog(await getTenantId(),req.body,actor(req))})));
  app.post("/api/ai-platform/catalogs/:id/values",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>{await service.addCatalogValue(await getTenantId(),positiveInt(req.params.id,"catalog id"),req.body,actor(req));res.json({success:true})}));
  app.post("/api/ai-platform/skills/:id/validate",...authenticated,permit("view_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.validate(await getTenantId(),positiveInt(req.params.id,"skill id"))})));
  app.post("/api/ai-platform/skills/:id/preview",...authenticated,permit("view_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.validate(await getTenantId(),positiveInt(req.params.id,"skill id")),applied:false})));
  app.post("/api/ai-platform/skills/:id/recognition-preview",...authenticated,permit("view_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.recognitionPreview(await getTenantId(),positiveInt(req.params.id,"skill id"),String(req.body?.text||""),classifier),applied:false})));
  app.post("/api/ai-platform/skills/:id/publish",...authenticated,permit("publish_ai_skills"),enabled,wrap(async(req:any,res:any)=>res.json({success:true,data:await service.publish(await getTenantId(),positiveInt(req.params.id,"skill id"),actor(req))})));
  app.post("/api/ai-platform/skills/:id/archive",...authenticated,permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>{await service.archive(await getTenantId(),positiveInt(req.params.id,"skill id"),actor(req));res.json({success:true})}));
  app.put("/api/ai-platform/agents/:agentId/versions/:versionId/skills",...authenticated,permit("manage_ai_agents"),permit("manage_ai_skills"),enabled,wrap(async(req:any,res:any)=>{await service.assign(await getTenantId(),positiveInt(req.params.agentId,"agent id"),positiveInt(req.params.versionId,"version id"),positiveInt(req.body?.skillId,"skill id"),actor(req));res.json({success:true})}));
}
