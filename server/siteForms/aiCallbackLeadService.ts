import crypto from 'node:crypto';
import { withPBXPulsTransaction } from '../pbxpulsDb.js';
import { ApplicationEncryptionService } from '../ai-platform/actions/applicationEncryption.js';
import { VoiceEncryptionService } from '../ai-platform/voice/voiceEncryption.js';
import { NotificationEventService } from '../notifications/eventService.js';
import { normalizeSiteFormPhone } from '../../shared/siteFormPhone.js';

// Site forms currently belong to the installation, not to individual AI tenants.
// Never expose another tenant's contacts through the installation-wide registry.
export const AI_LEAD_INTEGRATION_ID = 'pbxpuls-ai-callbacks-000000000001';
type Connection = { execute(sql: string, params?: any[]): Promise<any> };
type Transaction = <T>(work: (connection: Connection) => Promise<T>) => Promise<T>;

export class AiCallbackLeadService {
  constructor(
    private readonly transaction: Transaction = withPBXPulsTransaction,
    private readonly decryptPhone = (value: string) => new ApplicationEncryptionService().decrypt(value),
    private readonly decryptChannel = (value: string) => new VoiceEncryptionService().decrypt(value),
    private readonly notify = (leadId: number) => new NotificationEventService().emit({
      eventType: 'site_forms.lead_received', category: 'marketing', severity: 'info',
      title: 'Новая заявка от AI-сотрудника', message: `Создана заявка #${leadId}`,
      source: 'site_forms', entityType: 'site_form_lead', entityId: String(leadId),
      dedupeKey: `site-form-lead:${leadId}`, status: 'active', occurredAt: new Date(),
      metadata: { integrationId: AI_LEAD_INTEGRATION_ID, source: 'ai_employee' },
    }),
  ) {}

  async sync(tenantId: number, callbackId: number, signal?: AbortSignal) {
    if (tenantId !== 1) throw new Error('AI leads require installation tenant mapping');
    const check = () => { if (signal?.aborted) throw new Error('AI lead creation cancelled'); };
    check();
    let synthetic = false;
    const result = await this.transaction(async connection => {
      // Lock the authoritative request: retries use saved data, not new model arguments.
      const [requests] = await connection.execute(
        'SELECT * FROM ai_callback_requests WHERE tenant_id=? AND id=? FOR UPDATE', [tenantId, callbackId]);
      const request = requests[0];
      if (!request || request.consent_status !== 'granted') throw new Error('Confirmed AI request not found');
      if (request.source_channel !== 'voice') return null; // Sandbox must not create business leads.
      if (['cancelled', 'completed'].includes(request.status)) return null;
      // Trust only the persisted version, never model arguments or caller text.
      if (request.agent_version_id) {
        const [versions] = await connection.execute('SELECT config_json FROM ai_agent_versions WHERE tenant_id=? AND agent_id=? AND id=?',
          [tenantId,request.agent_id,request.agent_version_id]);
        if (!versions[0]) throw new Error('AI request version unavailable');
        synthetic = JSON.parse(String(versions[0].config_json || '{}')).runtimePrompts?.ownerControlTest === true;
        if (synthetic) {
          request.reason = String(request.reason).startsWith('[ТЕСТ] ') ? request.reason : `[ТЕСТ] ${request.reason}`;
          const metadata = JSON.parse(String(request.metadata_json || '{}'));
          await connection.execute('UPDATE ai_callback_requests SET reason=?,metadata_json=? WHERE tenant_id=? AND id=?',
            [request.reason,JSON.stringify({...metadata,ownerControlTest:true}),tenantId,callbackId]);
        }
      }
      check();
      const eventId = `ai-callback:${tenantId}:${callbackId}`;
      const [existing] = await connection.execute(
        'SELECT id FROM site_form_leads WHERE integration_id=? AND event_id=?', [AI_LEAD_INTEGRATION_ID, eventId]);
      if (existing[0]) return { leadId: Number(existing[0].id), created: false };
      // Internal source has no usable webhook credential. Existing assignment/SLA
      // settings remain editable through the ordinary integration settings.
      await connection.execute(`INSERT INTO site_form_integrations
        (id,name,provider,webhook_token_hash,is_enabled,allowed_ips_json,allowed_form_ids_json)
        VALUES(?,'AI-сотрудники','universal',?,0,'[]','[]') ON DUPLICATE KEY UPDATE id=VALUES(id)`,
        [AI_LEAD_INTEGRATION_ID, crypto.randomBytes(32).toString('hex')]);
      const [integrations] = await connection.execute('SELECT * FROM site_form_integrations WHERE id=?', [AI_LEAD_INTEGRATION_ID]);
      const integration = integrations[0];
      if (integration.deleted_at) throw new Error('AI lead source was deleted');
      const phone = this.decryptPhone(request.phone_encrypted);
      const normalizedPhone = normalizeSiteFormPhone(phone).normalized;
      let voice:any=null,channel='';
      if(request.voice_session_id){
        const [voices]=await connection.execute('SELECT ari_channel_id_encrypted,started_at FROM ai_voice_sessions WHERE tenant_id=? AND id=? AND agent_id=?',
          [tenantId,request.voice_session_id,request.agent_id]);
        voice=voices[0];
        if(!voice?.ari_channel_id_encrypted)throw new Error('AI call reference unavailable');
        channel=this.decryptChannel(voice.ari_channel_id_encrypted);
        synthetic=synthetic||/^(?:dima-eval-|eval-ai-)/u.test(channel);
      }
      const [agents] = await connection.execute('SELECT name FROM ai_agents WHERE tenant_id=? AND id=?', [tenantId, request.agent_id]);
      const agentName = String(agents[0]?.name || 'AI-сотрудник').slice(0,150);
      const raw = { source: 'ai_employee', callbackRequestId: callbackId, agentId: Number(request.agent_id),
        voiceSessionId: request.voice_session_id ? Number(request.voice_session_id) : null,
        rawFields: { MESSAGE: request.reason, AI_EMPLOYEE: agentName } };
      const [insert] = await connection.execute(`INSERT INTO site_form_leads
        (integration_id,event_id,external_form_id,form_code,form_name,customer_name,phone_raw,phone_normalized,
        comment,preferred_time,utm_source,status,priority,assigned_user_id,assigned_department_id,
        sla_deadline_at,sla_status,created_at,raw_payload_json,is_test)
        VALUES(?,?,'ai_employee','ai_employee',?,?,?,?,?,?,'ai_employee','new',?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE),?,NOW(),?,?)`,
        [AI_LEAD_INTEGRATION_ID,eventId,`AI-сотрудник · ${agentName}`,request.contact_name,phone,
          normalizedPhone,request.reason,request.preferred_time_text,request.priority,
          synthetic?null:integration.default_user_id,synthetic?null:integration.default_department_id,Number(integration.sla_minutes)||30,synthetic?'not_applicable':'pending',JSON.stringify(raw),synthetic?1:0]);
      const leadId = Number(insert.insertId);
      await connection.execute(`INSERT INTO site_form_lead_history
        (lead_id,event_type,new_value,actor_label,metadata_json) VALUES(?,'lead_received','new',?,?)`,
        [leadId,agentName,JSON.stringify({source:'ai_employee',callbackRequestId:callbackId,voiceSessionId:raw.voiceSessionId})]);
      if (request.voice_session_id) {
        // Asterisk's ARI channel ID is the uniqueid. Do not guess linkedid or claim
        // that the manager has already called: this link is just the originating call.
        await connection.execute(`INSERT INTO site_form_lead_calls
          (lead_id,uniqueid,linkedid,phone_normalized,call_direction,call_started_at,match_confidence)
          VALUES(?,?,?,?,'incoming',?,'confirmed')`,
          [leadId,channel,channel,normalizedPhone,voice.started_at]);
      }
      check();
      return { leadId, created: true };
    });
    if (result?.created && !synthetic) void this.notify(result.leadId).catch(() => undefined);
    return result;
  }
}
