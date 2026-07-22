import assert from 'node:assert/strict';
import 'dotenv/config';
import { AgentBuilderService } from '../server/ai-platform/agents/agentBuilderService.js';
import { AgentLifecycleService } from '../server/ai-platform/agents/agentLifecycleService.js';
import { buildReceptionistLiveConfig, RECEPTIONIST_SYSTEM_PROMPT as PROMPT } from '../server/ai-platform/agents/receptionistLiveReadiness.js';
import { AiAuditService } from '../server/ai-platform/audit/aiAuditService.js';
import { sqlAiPlatformStore as store } from '../server/ai-platform/storage/aiPlatformStore.js';

const one = async (sql: string, params: unknown[], code: string) => {
  const row = (await store.query(sql, params))[0];
  if (!row) throw new Error(code);
  return row;
};

async function run() {
  if (!process.argv.includes('--apply')) throw new Error('Explicit --apply is required');
  const flagBefore = await one("SELECT setting_value FROM settings WHERE setting_key='ai.platform_core_enabled'", [], 'core_flag_missing');
  if (String(flagBefore.setting_value) !== 'false') throw new Error('core_flag_must_remain_false');
  const tenant = await one("SELECT id FROM ai_tenants WHERE tenant_key='installation' AND status='active'", [], 'installation_tenant_missing');
  const agent = await one("SELECT id FROM ai_agents WHERE tenant_id=? AND agent_key='receptionist_default'", [tenant.id], 'receptionist_missing');
  const template = await one("SELECT id FROM ai_agent_templates WHERE template_key='receptionist_default' AND status='active' AND (tenant_id=? OR tenant_id IS NULL)", [tenant.id], 'template_missing');
  const behavior = await one("SELECT id FROM ai_behavior_profiles WHERE tenant_id=? AND profile_key='natural_receptionist_default'", [tenant.id], 'behavior_missing');
  const transfer = await one("SELECT id FROM ai_transfer_policies WHERE policy_key='human_first_transfer' AND (tenant_id=? OR tenant_id IS NULL)", [tenant.id], 'transfer_policy_missing');
  const autonomy = await one("SELECT id FROM ai_autonomy_policies WHERE policy_key='safe_default' AND (tenant_id=? OR tenant_id IS NULL)", [tenant.id], 'autonomy_policy_missing');
  const tools = await store.query("SELECT id,tool_key,risk_level FROM ai_tools WHERE enabled=1 AND risk_level='read' AND (tenant_id=? OR tenant_id IS NULL) ORDER BY id", [tenant.id]);
  const expectedTools = ['pbx.get_active_calls','pbx.get_sip_registrations','pbx.get_trunks_status','pbx.get_extensions_status','pbx.get_missed_calls','pbx.get_call_statistics','directory.search_contacts','calls.search_history'];
  assert.deepEqual(tools.map(row => String(row.tool_key)).sort(), [...expectedTools].sort());
  const action = await one("SELECT id FROM ai_action_definitions WHERE action_key='business.create_callback_request' AND enabled=1 AND risk_level='low' AND (tenant_id=? OR tenant_id IS NULL)", [tenant.id], 'callback_action_missing');
  const config = buildReceptionistLiveConfig({ templateId:Number(template.id), behaviorProfileId:Number(behavior.id), transferPolicyId:Number(transfer.id), autonomyPolicyId:Number(autonomy.id), toolIds:tools.map(row=>Number(row.id)), actionDefinitionId:Number(action.id) });
  const audit = new AiAuditService(store), builder = new AgentBuilderService(store, audit), actor = { traceId:`receptionist-readiness-${Date.now()}`, actorType:'system' as const, actorId:'stage-7e' };
  const existing = await store.query("SELECT id,config_json,system_prompt,lifecycle_status FROM ai_agent_versions WHERE tenant_id=? AND agent_id=? ORDER BY version_number DESC", [tenant.id, agent.id]);
  let version = existing.find(row => row.system_prompt === PROMPT && row.config_json === JSON.stringify(config));
  if (!version) version = await builder.createDraftVersion(Number(tenant.id), Number(agent.id), { config, systemPrompt:PROMPT, changeReason:'Stage 7E controlled live voice readiness' }, actor);
  const versionId = Number(version.id);
  const lifecycleStatus = String(version.lifecycle_status || version.status || 'draft');
  if (lifecycleStatus === 'draft') {
    const validation = await builder.validateAgentConfiguration(Number(tenant.id), { templateId:Number(template.id), behaviorProfileId:Number(behavior.id), config, prompt:PROMPT });
    assert.deepEqual(validation, { valid:true, errors:[] });
    await store.query('UPDATE ai_agent_tools SET enabled=0 WHERE tenant_id=? AND agent_version_id=?', [tenant.id, versionId]);
    for (const tool of tools) await store.query("INSERT INTO ai_agent_tools(tenant_id,agent_version_id,tool_id,enabled,config_json) VALUES(?,?,?,1,'{}') ON DUPLICATE KEY UPDATE enabled=1", [tenant.id, versionId, tool.id]);
    await store.query('UPDATE ai_agent_actions SET enabled=0 WHERE tenant_id=? AND agent_version_id=?', [tenant.id, versionId]);
    await store.query("INSERT INTO ai_agent_actions(tenant_id,agent_version_id,action_definition_id,enabled,config_json) VALUES(?,?,?,1,'{}') ON DUPLICATE KEY UPDATE enabled=1", [tenant.id, versionId, action.id]);
    await audit.append({ tenantId:Number(tenant.id), ...actor, eventType:'tool_assignment_changed', entityType:'agent_version', entityId:String(versionId), decision:'updated', details:{toolCount:tools.length} });
    await audit.append({ tenantId:Number(tenant.id), ...actor, eventType:'action_assignment_changed', entityType:'agent_version', entityId:String(versionId), decision:'updated', details:{actionCount:1} });
    await builder.publishAgent(Number(tenant.id), Number(agent.id), versionId, actor);
  }
  const published = await one("SELECT v.id,v.lifecycle_status,v.checksum,v.config_json,a.current_version_id FROM ai_agent_versions v JOIN ai_agents a ON a.id=v.agent_id AND a.tenant_id=v.tenant_id WHERE v.tenant_id=? AND v.agent_id=? AND v.id=?", [tenant.id, agent.id, versionId], 'published_version_missing');
  assert.equal(published.lifecycle_status, 'published'); assert.equal(Number(published.current_version_id), versionId); assert.match(String(published.checksum), /^[a-f0-9]{64}$/);
  const savedConfig = JSON.parse(String(published.config_json)); assert.equal(savedConfig.voiceEnabled, true); assert.equal(savedConfig.voice.provider, 'synthetic'); assert.equal(savedConfig.voice.mode, 'speech_to_speech');
  assert.equal(Number((await store.query('SELECT COUNT(*) total FROM ai_agent_tools WHERE tenant_id=? AND agent_version_id=? AND enabled=1', [tenant.id, versionId]))[0].total), 8);
  assert.equal(Number((await store.query('SELECT COUNT(*) total FROM ai_agent_actions WHERE tenant_id=? AND agent_version_id=? AND enabled=1', [tenant.id, versionId]))[0].total), 1);
  await assert.rejects(() => new AgentLifecycleService(store, audit).updateVersionDraft(Number(tenant.id), Number(agent.id), versionId, { config, systemPrompt:PROMPT }), (error:any) => error.code === 'conflict');
  const flagAfter = await one("SELECT setting_value FROM settings WHERE setting_key='ai.platform_core_enabled'", [], 'core_flag_missing'); assert.equal(String(flagAfter.setting_value), 'false');
  console.log(JSON.stringify({agentId:Number(agent.id),publishedVersionId:versionId,tools:8,actions:1,coreEnabled:false}));
  process.exit(0);
}

run().catch(error => { console.error(error instanceof Error ? error.message : 'readiness_failed'); process.exit(1); });
