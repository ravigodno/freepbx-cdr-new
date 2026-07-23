import type { AiPlatformStore } from "../storage/aiPlatformStore.js";
import type {
  EntityCatalogSchema,
  SkillActionSchema,
  SkillFieldSchema,
  SkillSchema,
} from "./skillSchema.js";

const json = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value || "")) as T; } catch { return fallback; }
};

export class SkillRepository {
  constructor(private store: AiPlatformStore) {}

  async list(tenantId:number) {
    return this.store.query(
      `SELECT id,skill_key,name,description,schema_version,version_number,status,created_at,updated_at,published_at
       FROM ai_skills WHERE tenant_id=? ORDER BY skill_key,version_number DESC`,
      [tenantId],
    );
  }

  async get(tenantId:number,id:number):Promise<SkillSchema|null> {
    const skill=(await this.store.query(
      `SELECT * FROM ai_skills WHERE tenant_id=? AND id=? LIMIT 1`,
      [tenantId,id],
    ))[0];
    if(!skill)return null;
    const fields=await this.store.query(
      `SELECT * FROM ai_skill_fields WHERE tenant_id=? AND skill_id=? ORDER BY display_order,id`,
      [tenantId,id],
    );
    const templates=await this.store.query(
      `SELECT template_key,template_text FROM ai_response_templates WHERE tenant_id=? AND skill_id=? AND active=1`,
      [tenantId,id],
    );
    const actions=await this.store.query(
      `SELECT * FROM ai_skill_actions WHERE tenant_id=? AND skill_id=? AND active=1 ORDER BY id`,
      [tenantId,id],
    );
    const catalogs=await this.store.query(
      `SELECT DISTINCT c.* FROM ai_entity_catalogs c JOIN ai_skill_fields f ON f.enum_source=c.catalog_key AND f.tenant_id=c.tenant_id WHERE f.tenant_id=? AND f.skill_id=? AND c.active=1`,
      [tenantId,id],
    );
    const catalogViews:EntityCatalogSchema[]=[];
    for(const catalog of catalogs){
      const values=await this.store.query(
        `SELECT value_text,synonyms_json FROM ai_entity_values WHERE tenant_id=? AND catalog_id=? AND active=1 ORDER BY display_order,id`,
        [tenantId,catalog.id],
      );
      catalogViews.push({
        catalogKey:String(catalog.catalog_key),
        name:String(catalog.name),
        entityType:String(catalog.entity_type),
        values:values.map((row:any)=>({
          value:String(row.value_text),
          synonyms:json<string[]>(row.synonyms_json,[]),
        })),
      });
    }
    return {
      id:Number(skill.id),
      schemaVersion:Number(skill.schema_version),
      skillKey:String(skill.skill_key),
      name:String(skill.name),
      description:String(skill.description||""),
      intentExamples:json<string[]>(skill.intent_examples_json,[]),
      fields:fields.map((row:any):SkillFieldSchema=>({
        key:String(row.field_key),
        label:String(row.label),
        type:row.field_type,
        required:Boolean(row.required),
        extractionHints:json<string[]>(row.extraction_hints_json,[]),
        synonyms:json<string[]>(row.synonyms_json,[]),
        enumSource:row.enum_source?String(row.enum_source):null,
        validation:json<Record<string,unknown>>(row.validation_json,{}),
        confirmationRequired:Boolean(row.confirmation_required),
        sensitive:Boolean(row.is_sensitive),
        displayOrder:Number(row.display_order),
        askTemplate:row.ask_template?String(row.ask_template):null,
      })),
      actions:actions.map((row:any):SkillActionSchema=>({
        id:Number(row.id),
        actionKey:String(row.action_key),
        name:String(row.name),
        requiredFields:json<string[]>(row.required_fields_json,[]),
        executorKey:row.executor_key?String(row.executor_key):null,
        permissions:json<string[]>(row.permissions_json,[]),
        timeoutMs:Number(row.timeout_ms),
        retryPolicy:json(row.retry_policy_json,{}),
        successMapping:json(row.success_mapping_json,{}),
        failureMapping:json(row.failure_mapping_json,{}),
      })),
      responseTemplates:Object.fromEntries(
        templates.map((row:any)=>[row.template_key,row.template_text]),
      ),
      validationRules:json(skill.validation_rules_json,{}),
      escalationPolicy:json(skill.escalation_policy_json,{}),
      completionPolicy:json(skill.completion_policy_json,{}),
      catalogs:catalogViews,
      status:skill.status,
    };
  }

  async forAgentVersion(tenantId:number,agentVersionId:number) {
    const rows=await this.store.query(
      `SELECT s.id FROM ai_agent_skills a JOIN ai_skills s ON s.id=a.skill_id AND s.tenant_id=a.tenant_id
       WHERE a.tenant_id=? AND a.agent_version_id=? AND a.enabled=1 AND s.status='published'
       ORDER BY a.priority,s.id`,
      [tenantId,agentVersionId],
    );
    const result:SkillSchema[]=[];
    for(const row of rows){
      const skill=await this.get(tenantId,Number(row.id));
      if(skill)result.push(skill);
    }
    return result;
  }
}
