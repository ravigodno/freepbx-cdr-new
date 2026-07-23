import { AiPlatformError } from './errors.js';
import { parseJsonObject, redactAiPlatformValue } from './redaction.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
const json=(value:unknown,field:string)=>parseJsonObject(value||{},field);
export class AgentContextBuilder {
  constructor(private readonly store:AiPlatformStore){}
  async buildContext(tenantId:number,agentVersionId:number){
    const versions=await this.store.query(`SELECT v.id,v.agent_id,v.version_number,v.lifecycle_status,v.config_json,v.system_prompt,a.agent_key,a.name,a.agent_type,a.status agent_status FROM ai_agent_versions v JOIN ai_agents a ON a.id=v.agent_id WHERE v.id=? AND v.tenant_id=? AND a.tenant_id=? LIMIT 1`,[agentVersionId,tenantId,tenantId]);
    const version=versions[0];if(!version)throw new AiPlatformError('not_found',404,'Agent version not found');
    const config=json(version.config_json,'config_json'),behaviorId=Number(config.behaviorProfileId||0);
    const behavior=behaviorId?(await this.store.query('SELECT id,profile_key,name,language,response_style_json,emotion_model_json,voice_behavior_json,conversation_rules_json,transfer_policy_json,safety_policy_json,personality_schema_version,personality_profile_json FROM ai_behavior_profiles WHERE id=? AND tenant_id=? LIMIT 1',[behaviorId,tenantId]))[0]||null:null;
    const knowledge=await this.store.query(`SELECT s.id,s.source_key,s.name,s.type,s.status,v.id version_id,v.version_number,v.checksum FROM ai_knowledge_sources s JOIN ai_agent_knowledge ak ON ak.knowledge_source_id=s.id AND ak.tenant_id=s.tenant_id LEFT JOIN ai_knowledge_versions v ON v.source_id=s.id AND v.status='published' WHERE ak.agent_id=? AND ak.tenant_id=? AND ak.access_mode='read' ORDER BY s.id,v.version_number DESC`,[version.agent_id,tenantId]);
    const training=await this.store.query("SELECT id,version_number,checksum,status,published_at FROM ai_training_versions WHERE agent_id=? AND tenant_id=? AND status='published' ORDER BY version_number DESC LIMIT 1",[version.agent_id,tenantId]);
    const tools=await this.store.query(`SELECT t.id,t.tool_key,t.version,t.description,t.risk_level,at.enabled FROM ai_agent_tools at JOIN ai_tools t ON t.id=at.tool_id WHERE at.agent_version_id=? AND at.tenant_id=? AND t.risk_level='read'`,[agentVersionId,tenantId]);
    const behaviorView=behavior?{id:behavior.id,profile_key:behavior.profile_key,name:behavior.name,language:behavior.language,responseStyle:json(behavior.response_style_json,'response_style_json'),emotionModel:json(behavior.emotion_model_json,'emotion_model_json'),voiceBehavior:json(behavior.voice_behavior_json,'voice_behavior_json'),conversationRules:json(behavior.conversation_rules_json,'conversation_rules_json'),transferPolicy:json(behavior.transfer_policy_json,'transfer_policy_json'),safetyPolicy:json(behavior.safety_policy_json,'safety_policy_json'),personalitySchemaVersion:Number(behavior.personality_schema_version||1),personality:json(behavior.personality_profile_json||'{}','personality_profile_json')}:null;
    return redactAiPlatformValue({agent:{id:Number(version.agent_id),key:version.agent_key,name:version.name,type:version.agent_type,status:version.agent_status,systemPrompt:String(version.system_prompt||''),version:{id:Number(version.id),number:Number(version.version_number),status:version.lifecycle_status,config}},behavior:behaviorView,knowledge,training:training[0]||null,tools}).value;
  }
}
