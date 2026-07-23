import crypto from "crypto";
import type { AiPlatformStore } from "../storage/aiPlatformStore.js";
import type { AiAuditService } from "../audit/aiAuditService.js";
import { SkillRepository } from "./skillRepository.js";
import { SKILL_SCHEMA_VERSION, validateSkillSchema } from "./skillSchema.js";
import { SkillRouter, type StructuredSkillClassifier } from "./skillRouter.js";
import {
  applySkillRoutingDecision,
  createGenericTaskState,
  planGenericResponse,
  updateGenericTaskState,
} from "../voice/providers/genericConversationTaskState.js";

export type SkillActor = { traceId:string;actorType:"user";actorId:string };

export class SkillService {
  readonly repository:SkillRepository;
  constructor(private store:AiPlatformStore,private audit:AiAuditService){
    this.repository=new SkillRepository(store);
  }
  private async ensureDraft(tenantId:number,skillId:number){
    const rows=await this.store.query("SELECT status FROM ai_skills WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,skillId]);
    if(!rows[0])throw new Error("skill_not_found");
    if(rows[0].status!=="draft")throw new Error("published_skill_immutable");
  }
  async create(tenantId:number,input:any,actor:SkillActor){
    const key=String(input.skillKey||"").trim(),name=String(input.name||"").trim();
    if(!/^[a-z][a-z0-9_]{1,63}$/.test(key)||!name)throw new Error("invalid_skill");
    const versions=await this.store.query("SELECT COALESCE(MAX(version_number),0)+1 version_number FROM ai_skills WHERE tenant_id=? AND skill_key=?",[tenantId,key]);
    const result:any=await this.store.query(`INSERT INTO ai_skills(tenant_id,skill_key,schema_version,version_number,name,description,trigger_phrases_json,negative_trigger_phrases_json,intent_examples_json,activation_threshold,ambiguity_policy,validation_rules_json,escalation_policy_json,completion_policy_json,status,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)`,[tenantId,key,SKILL_SCHEMA_VERSION,Number(versions[0].version_number),name,String(input.description||""),JSON.stringify(input.triggerPhrases||[]),JSON.stringify(input.negativeTriggerPhrases||[]),JSON.stringify(input.intentExamples||[]),Number(input.activationThreshold??.72),input.ambiguityPolicy==="none"?"none":"clarify",JSON.stringify(input.validationRules||{}),JSON.stringify(input.escalationPolicy||{enabled:true}),JSON.stringify(input.completionPolicy||{}),actor.actorId]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_created",entityType:"ai_skill",entityId:String(result.insertId),decision:"created",details:{skillKey:key}});
    return this.repository.get(tenantId,Number(result.insertId));
  }
  async addField(tenantId:number,skillId:number,input:any,actor:SkillActor){
    await this.ensureDraft(tenantId,skillId);
    await this.store.query(`INSERT INTO ai_skill_fields(tenant_id,skill_id,field_key,label,field_type,required,extraction_hints_json,synonyms_json,enum_source,validation_json,confirmation_required,is_sensitive,display_order,ask_template)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[tenantId,skillId,input.key,input.label,input.type,Boolean(input.required),JSON.stringify(input.extractionHints||[]),JSON.stringify(input.synonyms||[]),input.enumSource||null,JSON.stringify(input.validation||{}),Boolean(input.confirmationRequired),Boolean(input.sensitive),Number(input.displayOrder||0),input.askTemplate||null]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_field_added",entityType:"ai_skill",entityId:String(skillId),decision:"updated",details:{fieldKey:String(input.key)}});
    return this.repository.get(tenantId,skillId);
  }
  async update(tenantId:number,skillId:number,input:any,actor:SkillActor){
    await this.ensureDraft(tenantId,skillId);
    await this.store.query(`UPDATE ai_skills SET name=COALESCE(?,name),description=COALESCE(?,description),trigger_phrases_json=COALESCE(?,trigger_phrases_json),negative_trigger_phrases_json=COALESCE(?,negative_trigger_phrases_json),intent_examples_json=COALESCE(?,intent_examples_json),activation_threshold=COALESCE(?,activation_threshold),ambiguity_policy=COALESCE(?,ambiguity_policy),validation_rules_json=COALESCE(?,validation_rules_json),escalation_policy_json=COALESCE(?,escalation_policy_json),completion_policy_json=COALESCE(?,completion_policy_json),updated_at=NOW() WHERE tenant_id=? AND id=?`,[
      input.name??null,input.description??null,input.triggerPhrases?JSON.stringify(input.triggerPhrases):null,input.negativeTriggerPhrases?JSON.stringify(input.negativeTriggerPhrases):null,input.intentExamples?JSON.stringify(input.intentExamples):null,input.activationThreshold??null,input.ambiguityPolicy??null,input.validationRules?JSON.stringify(input.validationRules):null,input.escalationPolicy?JSON.stringify(input.escalationPolicy):null,input.completionPolicy?JSON.stringify(input.completionPolicy):null,tenantId,skillId,
    ]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_updated",entityType:"ai_skill",entityId:String(skillId),decision:"updated",details:{}});
    return this.repository.get(tenantId,skillId);
  }
  async setTemplate(tenantId:number,skillId:number,key:string,text:string,actor:SkillActor){
    await this.ensureDraft(tenantId,skillId);
    await this.store.query("INSERT INTO ai_response_templates(tenant_id,skill_id,template_key,template_text)VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE template_text=VALUES(template_text),active=1",[tenantId,skillId,key,text]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_template_changed",entityType:"ai_skill",entityId:String(skillId),decision:"updated",details:{templateKey:key}});
    return this.repository.get(tenantId,skillId);
  }
  async createCatalog(tenantId:number,input:any,actor:SkillActor){
    const result:any=await this.store.query("INSERT INTO ai_entity_catalogs(tenant_id,catalog_key,name,entity_type,source)VALUES(?,?,?,?,?)",[tenantId,input.catalogKey,input.name,input.entityType,input.source||"ui"]);
    await this.audit.append({tenantId,...actor,eventType:"ai_entity_catalog_created",entityType:"ai_entity_catalog",entityId:String(result.insertId),decision:"created",details:{catalogKey:String(input.catalogKey)}});
    return {id:Number(result.insertId)};
  }
  async addAction(tenantId:number,skillId:number,input:any,actor:SkillActor){
    await this.ensureDraft(tenantId,skillId);
    await this.store.query(`INSERT INTO ai_skill_actions(tenant_id,skill_id,action_key,name,description,input_schema_json,required_fields_json,executor_key,permissions_json,timeout_ms,retry_policy_json,success_mapping_json,failure_mapping_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[tenantId,skillId,input.actionKey,input.name,String(input.description||""),JSON.stringify(input.inputSchema||{}),JSON.stringify(input.requiredFields||[]),input.executorKey||null,JSON.stringify(input.permissions||[]),Math.max(100,Math.min(Number(input.timeoutMs||10000),60000)),JSON.stringify(input.retryPolicy||{}),JSON.stringify(input.successMapping||{}),JSON.stringify(input.failureMapping||{})]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_action_added",entityType:"ai_skill",entityId:String(skillId),decision:"updated",details:{actionKey:String(input.actionKey)}});
    return this.repository.get(tenantId,skillId);
  }
  async addCatalogValue(tenantId:number,catalogId:number,input:any,actor:SkillActor){
    await this.store.query("INSERT INTO ai_entity_values(tenant_id,catalog_id,value_text,synonyms_json,display_order)VALUES(?,?,?,?,?)",[tenantId,catalogId,input.value,JSON.stringify(input.synonyms||[]),Number(input.displayOrder||0)]);
    await this.audit.append({tenantId,...actor,eventType:"ai_entity_value_added",entityType:"ai_entity_catalog",entityId:String(catalogId),decision:"updated",details:{}});
  }
  async validate(tenantId:number,skillId:number){
    const skill=await this.repository.get(tenantId,skillId);
    if(!skill)return{valid:false,errors:["skill_not_found"]};
    const errors=validateSkillSchema(skill);
    return{valid:errors.length===0,errors,skill};
  }
  async recognitionPreview(tenantId:number,skillId:number,text:string,classifier:StructuredSkillClassifier|null){
    const skill=await this.repository.get(tenantId,skillId);
    if(!skill)throw new Error("skill_not_found");
    const router=new SkillRouter(classifier),decision=await router.route([skill],text.slice(0,1000));
    const state=createGenericTaskState();
    applySkillRoutingDecision(state,[skill],decision);
    updateGenericTaskState(state,[skill],text);
    const plan=planGenericResponse(state,[skill]);
    return{
      selectedSkill:decision.skillId?skill.skillKey:null,
      confidence:decision.confidence,
      routing:decision,
      extractedFields:state.collectedFields,
      missingFields:state.missingFields,
      nextPlannerIntent:plan.intent,
    };
  }
  async publish(tenantId:number,skillId:number,actor:SkillActor){
    await this.ensureDraft(tenantId,skillId);
    const checked=await this.validate(tenantId,skillId);
    if(!checked.valid)throw new Error(`skill_validation_failed:${checked.errors.join(",")}`);
    const checksum=crypto.createHash("sha256").update(JSON.stringify(checked.skill)).digest("hex");
    await this.store.query("UPDATE ai_skills SET status='published',checksum=?,published_at=NOW(),updated_at=NOW() WHERE tenant_id=? AND id=?",[checksum,tenantId,skillId]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_published",entityType:"ai_skill",entityId:String(skillId),decision:"published",details:{checksum}});
    return this.repository.get(tenantId,skillId);
  }
  async archive(tenantId:number,skillId:number,actor:SkillActor){
    const used=await this.store.query("SELECT COUNT(*) total FROM ai_agent_skills a JOIN ai_agent_versions v ON v.id=a.agent_version_id AND v.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.skill_id=? AND v.lifecycle_status='published' AND a.enabled=1",[tenantId,skillId]);
    if(Number(used[0]?.total||0)>0)throw new Error("skill_used_by_published_version");
    await this.store.query("UPDATE ai_skills SET status='archived',updated_at=NOW() WHERE tenant_id=? AND id=?",[tenantId,skillId]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_archived",entityType:"ai_skill",entityId:String(skillId),decision:"archived",details:{}});
  }
  async assign(tenantId:number,agentId:number,versionId:number,skillId:number,actor:SkillActor){
    const rows=await this.store.query("SELECT lifecycle_status FROM ai_agent_versions WHERE tenant_id=? AND agent_id=? AND id=? LIMIT 1",[tenantId,agentId,versionId]);
    if(!rows[0])throw new Error("agent_version_not_found");
    if(rows[0].lifecycle_status!=="draft")throw new Error("published_agent_version_immutable");
    await this.store.query("INSERT INTO ai_agent_skills(tenant_id,agent_version_id,skill_id,priority,enabled)VALUES(?,?,?,?,1) ON DUPLICATE KEY UPDATE priority=VALUES(priority),enabled=1",[tenantId,versionId,skillId,100]);
    await this.audit.append({tenantId,...actor,eventType:"ai_skill_assigned",entityType:"agent_version",entityId:String(versionId),decision:"updated",details:{skillId}});
  }
}
