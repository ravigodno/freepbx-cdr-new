import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { NovofonBalanceApiClient, NovofonDataApiClient, NovofonProviderError, assertNovofonRecordingUrl } from './providers/novofon.js';
import { NovofonSettingsStore, type NovofonManagedSettings } from './novofonSettings.js';
import { reconcileNovofonLeg } from './reconciliation/novofonCdrReconciliation.js';

export const NOVOFON_SOURCE_ID = 'novofon';
type ReportType = 'call_session' | 'cdr_leg' | 'financial_leg';
const METHODS: Record<ReportType, 'get.calls_report' | 'get.call_legs_report' | 'get.financial_call_legs_report'> = {
  call_session: 'get.calls_report', cdr_leg: 'get.call_legs_report', financial_leg: 'get.financial_call_legs_report'
};
const sqlDate = (value: unknown) => {
  const text = String(value || '').trim().replace(' ', 'T');
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : null;
};
const number = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
const text = (value: unknown, max = 191) => value === null || value === undefined ? null : String(value).slice(0, max);
const phone = (value: unknown) => text(String(value || '').replace(/[^\d+]/g, ''), 64);
export const maskNovofonPhone = (value: unknown) => {
  const raw = String(value || ''); const digits = raw.replace(/\D/g, '');
  return digits ? `${raw.startsWith('+') ? '+' : ''}${'*'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-4)}` : null;
};
const hashPhone = (value: unknown, secret: string) => {
  const normalized = String(value || '').replace(/\D/g, '');
  return normalized ? crypto.createHmac('sha256', secret).update(normalized).digest('hex') : null;
};
const hashRow = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function safeNovofonError(error: unknown) {
  const code = error instanceof NovofonProviderError ? error.code : String((error as any)?.message || 'novofon_error').slice(0, 64);
  const labels: Record<string, string> = {
    ip_not_whitelisted: 'IP сервера отсутствует в белом списке Novofon', forbidden: 'Недостаточно прав пользователя Novofon',
    limit_exceeded: 'Достигнут лимит Novofon Data API', account_inactive: 'Аккаунт Novofon отключён',
    access_token_expired: 'Токен Novofon истёк', access_token_invalid: 'Токен Novofon недействителен', auth_error: 'Неверный логин или пароль Novofon',
    credentials_missing: 'Учётные данные Novofon не настроены', balance_api_not_configured: 'Текущий баланс не предоставлен API',
    financial_report_unavailable: 'Финансовый отчёт недоступен', timeout: 'Истекло время ожидания Novofon', network_error: 'Novofon API недоступен по сети'
  };
  return { safeErrorCode: code, safeMessage: labels[code] || (code.startsWith('balance_api_http_') ? 'Текущий баланс не предоставлен API' : 'Novofon API вернул ошибку') };
}

function reportRows(result: any): any[] {
  const data = result?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}
function reportMetadata(result: any): any { return result?.metadata || result?.data?.metadata || {}; }

export class NovofonService {
  private settings: NovofonManagedSettings | null = null;
  private dataClient: NovofonDataApiClient | null = null;
  private balanceClient: NovofonBalanceApiClient | null = null;
  private fingerprint = '';
  private syncing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly settingsStore: NovofonSettingsStore;

  constructor(private readonly hashSecret: string, private readonly queryCdr?: (sql: string, params: any[]) => Promise<any[]>) { this.settingsStore = new NovofonSettingsStore(hashSecret); }
  isSyncing() { return this.syncing; }

  private async clients() {
    this.settings = await this.settingsStore.load();
    const fingerprint = hashRow(this.settings);
    if (!this.dataClient || fingerprint !== this.fingerprint) {
      this.dataClient = new NovofonDataApiClient(this.settings);
      this.balanceClient = new NovofonBalanceApiClient(this.settings);
      this.fingerprint = fingerprint;
    }
    return { settings: this.settings, data: this.dataClient, balance: this.balanceClient! };
  }

  async getSettings() {
    const settings = await this.settingsStore.load();
    const rows = await queryPBXPulsDb("SELECT status,safe_error_code,last_attempt_at FROM balance_sources WHERE id='novofon' LIMIT 1");
    return this.settingsStore.safe(settings, rows[0]);
  }
  async saveSettings(input: unknown) { await this.settingsStore.save(input); this.dataClient = null; this.balanceClient = null; return this.getSettings(); }

  async diagnose() {
    const { settings, data, balance } = await this.clients();
    const result: any = { dataApiConnected: false, balanceApiConnected: false, account: null, balance: null, diagnostics: [], lastSuccessfulSync: null };
    if (!settings.enabled) result.diagnostics.push({ code: 'provider_disabled', status: 'warning', message: 'Провайдер отключён' });
    try {
      const accountResult = await data.getAccount(); const account = accountResult?.data || accountResult;
      result.dataApiConnected = true;
      result.account = { appId: account?.app_id ?? null, name: text(account?.name || account?.account_name), timezone: text(account?.timezone, 64) };
      result.diagnostics.push({ code: 'data_api_connected', status: 'success', message: 'Data API подключён' });
      const now = new Date(); const hourAgo = new Date(now.getTime() - 3600_000);
      try {
        await data.getReport('get.financial_call_legs_report', { from: hourAgo.toISOString().slice(0, 19).replace('T', ' '), to: now.toISOString().slice(0, 19).replace('T', ' '), offset: 0, limit: 1 });
        result.diagnostics.push({ code: 'financial_report_connected', status: 'success', message: 'Финансовый отчёт доступен' });
      } catch (error) {
        const safe = safeNovofonError(error); result.diagnostics.push({ code: 'financial_report_unavailable', status: 'warning', message: safe.safeMessage === 'Novofon API вернул ошибку' ? 'Финансовый отчёт недоступен' : safe.safeMessage });
      }
    } catch (error) { const safe = safeNovofonError(error); result.diagnostics.push({ code: safe.safeErrorCode, status: 'error', message: safe.safeMessage }); }
    if (balance.configured) {
      try { result.balance = await balance.getBalance(); result.balanceApiConnected = true; result.diagnostics.push({ code: 'balance_api_connected', status: 'success', message: 'API v1 баланса подключён' }); }
      catch (error) { const safe = safeNovofonError(error); result.diagnostics.push({ code: safe.safeErrorCode, status: 'warning', message: safe.safeMessage }); }
    } else result.diagnostics.push({ code: 'balance_api_not_configured', status: 'info', message: 'Текущий баланс не предоставлен API' });
    const rows = await queryPBXPulsDb("SELECT last_success_at FROM balance_sources WHERE id='novofon' LIMIT 1");
    result.lastSuccessfulSync = rows[0]?.last_success_at || null;
    await queryPBXPulsDb("UPDATE balance_sources SET last_attempt_at=NOW(),status=?,safe_error_code=?,updated_at=NOW() WHERE id='novofon'",
      [result.dataApiConnected ? 'success' : 'error', result.dataApiConnected ? null : result.diagnostics.find((x: any) => x.status === 'error')?.code || 'diagnose_failed']);
    return result;
  }

  async syncBalance() {
    const { balance } = await this.clients();
    try {
      const result = await balance.getBalance();
      await queryPBXPulsDb(`INSERT INTO balance_snapshots(source_id,balance_amount,currency,credit_limit,account_number_masked,msisdn_masked,measured_at,provider_timestamp,source_type,raw_hash,metadata_json)
        VALUES('novofon',?,?,NULL,NULL,NULL,NOW(),NULL,'api',?,'{}')`, [result.balance, result.currency, result.rawHash]);
      await queryPBXPulsDb("UPDATE balance_sources SET status='success',safe_error_code=NULL,last_attempt_at=NOW(),last_success_at=NOW(),updated_at=NOW() WHERE id='novofon'");
      return result;
    } catch (error) {
      const safe = safeNovofonError(error);
      await queryPBXPulsDb("UPDATE balance_sources SET last_attempt_at=NOW(),safe_error_code=?,updated_at=NOW() WHERE id='novofon'", [safe.safeErrorCode]);
      throw error;
    }
  }

  private async sourcePk(): Promise<number> {
    const rows = await queryPBXPulsDb("SELECT source_pk FROM balance_sources WHERE id='novofon' LIMIT 1");
    const id = Number(rows[0]?.source_pk || 0); if (!id) throw new NovofonProviderError('balance_source_not_found'); return id;
  }

  private async requestPage(type: ReportType, from: string, to: string, offset: number, limit: number): Promise<any> {
    const { data } = await this.clients();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await data.getReport(METHODS[type], { from, to, offset, limit }); }
      catch (error) {
        if (!(error instanceof NovofonProviderError) || !error.transient || attempt === 2) throw error;
        await wait(250 * 2 ** attempt);
      }
    }
  }

  private normalized(type: ReportType, row: any, sourceId: number, batchId: string) {
    const sessionId = text(type === 'call_session' ? row.id : row.call_session_id, 64) || '';
    const legId = text(type === 'call_session' ? '' : row.leg_id ?? row.id, 64) || '';
    const calling = phone(row.calling_phone_number || (row.direction === 'out' ? row.virtual_phone_number : row.contact_phone_number));
    const called = phone(row.called_phone_number || (row.direction === 'out' ? row.contact_phone_number : row.virtual_phone_number));
    const employee = text(row.employee_full_name || row.last_answered_employee_full_name || row.first_answered_employee_full_name, 191);
    const recording = text(row.full_record_file_link, 1000);
    const safeRecording = recording && (() => { try { return assertNovofonRecordingUrl(recording).toString(); } catch { return null; } })();
    const metadata = {
      finishTime: sqlDate(row.finish_time), finishReason: text(row.finish_reason, 100), finishReasonDescription: text(row.finish_reason_description, 500),
      isLost: row.is_lost === true, virtualPhoneNumber: phone(row.virtual_phone_number), waitDuration: number(row.wait_duration), talkDuration: number(row.talk_duration),
      cleanTalkDuration: number(row.clean_talk_duration), employees: Array.isArray(row.employees) ? row.employees.map((x: any) => ({ id: x?.employee_id ?? null, fullName: text(x?.employee_full_name), answered: x?.is_answered === true, talked: x?.is_talked === true })).slice(0, 100) : [],
      firstAnsweredEmployee: text(row.first_answered_employee_full_name), lastAnsweredEmployee: text(row.last_answered_employee_full_name), scenarioId: text(row.scenario_id, 100), scenarioName: text(row.scenario_name),
      communicationId: text(row.communication_id, 100), extId: text(row.ext_id, 191), connectTime: sqlDate(row.connect_time), isTransferred: row.is_transfered === true,
      isOperator: row.is_operator === true, employeeId: text(row.employee_id, 100), employeeFullName: employee, employeePhoneNumber: phone(row.employee_phone_number),
      releaseCauseCode: text(row.release_cause_code, 100), releaseCauseDescription: text(row.release_cause_description, 500), isFailed: row.is_failed === true, isTalked: row.is_talked === true,
      directionType: text(row.direction_type, 100), callRecords: Array.isArray(row.call_records) ? row.call_records.slice(0, 100).map(String) : [], wavCallRecords: Array.isArray(row.wav_call_records) ? row.wav_call_records.slice(0, 100).map(String) : [], recordingUrl: safeRecording
    };
    return { sourceId, key: hashRow(['novofon', sessionId, legId, type]), sessionId, legId, occurredAt: sqlDate(row.start_time) || new Date().toISOString().slice(0, 19).replace('T', ' '),
      direction: row.direction === 'in' ? 'in' : row.direction === 'out' ? 'out' : null, calling, called, employee,
      actualDuration: number(row.duration ?? row.total_duration ?? row.talk_duration), chargeableDuration: number(row.chargeable_duration), costPerMinute: number(row.cost_per_minute),
      chargedAmount: number(row.total_charge), bonusAmount: number(row.bonuses_charge), source: text(row.source, 100), rawHash: hashRow(row), batchId, metadata };
  }

  private async store(type: ReportType, normalized: ReturnType<NovofonService['normalized']>) {
    const status = type === 'financial_leg' ? 'orphan_financial_leg' : 'linked_provider_data';
    await queryPBXPulsDb(`INSERT INTO balance_usage_events(source_id,provider_event_key,occurred_at,event_type,network_event,direction,counterparty_masked,counterparty_hash,counterparty_number,
      caller_number,callee_number,amount,billed_units,billed_unit_code,actual_units,actual_unit_code,label,raw_hash,metadata_json,provider_external_id,provider_session_id,provider_leg_id,
      provider_event_type,provider_source,sync_batch_id,sync_status,currency,actual_duration_seconds,chargeable_duration_seconds,cost_per_minute,charged_amount,bonus_amount)
      VALUES(?,?,?, 'network','call',?,?,?,?,?,?,?,?,?,'second',?,'second',?,?,?, ?,?,?,?,?,?,?, 'RUB',?,?,?,?,?)
      ON DUPLICATE KEY UPDATE occurred_at=VALUES(occurred_at),direction=VALUES(direction),caller_number=VALUES(caller_number),callee_number=VALUES(callee_number),
      amount=VALUES(amount),billed_units=VALUES(billed_units),actual_units=VALUES(actual_units),raw_hash=VALUES(raw_hash),metadata_json=VALUES(metadata_json),provider_source=VALUES(provider_source),
      sync_batch_id=VALUES(sync_batch_id),sync_status=VALUES(sync_status),actual_duration_seconds=VALUES(actual_duration_seconds),chargeable_duration_seconds=VALUES(chargeable_duration_seconds),
      cost_per_minute=VALUES(cost_per_minute),charged_amount=VALUES(charged_amount),bonus_amount=VALUES(bonus_amount)`,
      [normalized.sourceId, normalized.key, normalized.occurredAt, normalized.direction, maskNovofonPhone(normalized.called || normalized.calling), hashPhone(normalized.called || normalized.calling, this.hashSecret),
        normalized.called || normalized.calling, normalized.calling, normalized.called, normalized.chargedAmount, normalized.chargeableDuration, normalized.actualDuration,
        type === 'financial_leg' ? 'Финансовое плечо Novofon' : type === 'cdr_leg' ? 'CDR-плечо Novofon' : 'Сессия Novofon', normalized.rawHash, JSON.stringify(normalized.metadata),
        type === 'call_session' ? normalized.sessionId : normalized.legId, normalized.sessionId, normalized.legId, type, normalized.source, normalized.batchId, status,
        normalized.actualDuration, normalized.chargeableDuration, normalized.costPerMinute, normalized.chargedAmount, normalized.bonusAmount]);
    if (type === 'financial_leg') {
      await queryPBXPulsDb(`UPDATE balance_usage_events financial JOIN balance_usage_events cdr ON cdr.source_id=financial.source_id AND cdr.provider_session_id=financial.provider_session_id
        AND cdr.provider_leg_id=financial.provider_leg_id AND cdr.provider_event_type='cdr_leg' SET financial.sync_status='linked_provider_data'
        WHERE financial.source_id=? AND financial.provider_session_id=? AND financial.provider_leg_id=? AND financial.provider_event_type='financial_leg'`,
        [normalized.sourceId, normalized.sessionId, normalized.legId]);
    } else if (type === 'cdr_leg') {
      await queryPBXPulsDb(`UPDATE balance_usage_events SET sync_status='linked_provider_data' WHERE source_id=? AND provider_session_id=? AND provider_leg_id=? AND provider_event_type='financial_leg'`,
        [normalized.sourceId, normalized.sessionId, normalized.legId]);
      if (this.queryCdr) {
        const eventRows = await queryPBXPulsDb('SELECT id FROM balance_usage_events WHERE source_id=? AND provider_event_key=? LIMIT 1', [normalized.sourceId, normalized.key]);
        const eventId = Number(eventRows[0]?.id || 0);
        if (eventId) {
          const match = await reconcileNovofonLeg({ occurredAt: `${normalized.occurredAt.replace(' ', 'T')}Z`, direction: normalized.direction, calling: normalized.calling, called: normalized.called,
            duration: normalized.actualDuration, extId: text(normalized.metadata.extId) }, this.queryCdr);
          await queryPBXPulsDb(`INSERT INTO balance_usage_cdr_matches(usage_event_id,cdr_uniqueid,cdr_linkedid,confidence,matched_by_json,time_difference_seconds,duration_difference_seconds,caller_number,callee_number)
            VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cdr_uniqueid=VALUES(cdr_uniqueid),cdr_linkedid=VALUES(cdr_linkedid),confidence=VALUES(confidence),matched_by_json=VALUES(matched_by_json),
            time_difference_seconds=VALUES(time_difference_seconds),duration_difference_seconds=VALUES(duration_difference_seconds),caller_number=VALUES(caller_number),callee_number=VALUES(callee_number)`,
            [eventId, match.uniqueid, match.linkedid, match.confidence, JSON.stringify(match.matchedBy), match.timeDifferenceSeconds, match.durationDifferenceSeconds, normalized.calling, normalized.called]);
        }
      }
    }
  }

  async syncUsage(input: { from?: string; to?: string } = {}) {
    if (this.syncing) throw new NovofonProviderError('usage_sync_in_progress');
    this.syncing = true; const batchId = crypto.randomUUID();
    try {
      const { settings } = await this.clients(); if (!settings.enabled) throw new NovofonProviderError('provider_disabled');
      const sourceId = await this.sourcePk(); const toDate = input.to ? new Date(input.to) : new Date();
      if (!Number.isFinite(toDate.getTime())) throw new NovofonProviderError('invalid_sync_period');
      const counters: Record<string, number> = { call_session: 0, cdr_leg: 0, financial_leg: 0 };
      await queryPBXPulsDb(`INSERT INTO balance_sync_batches(batch_id,source_id,status,started_at) VALUES(?,?,'running',NOW())`, [batchId, sourceId]);
      for (const type of Object.keys(METHODS) as ReportType[]) {
        const cursorRows = await queryPBXPulsDb('SELECT cursor_at FROM balance_sync_cursors WHERE source_id=? AND report_type=? LIMIT 1', [sourceId, type]);
        const defaultFrom = new Date(toDate.getTime() - settings.initialLoadDays * 86400_000);
        const cursor = cursorRows[0]?.cursor_at ? new Date(`${String(cursorRows[0].cursor_at).replace(' ', 'T')}Z`) : defaultFrom;
        const requestedFrom = input.from ? new Date(input.from) : new Date(cursor.getTime() - Math.max(24, settings.overlapHours) * 3600_000);
        if (!Number.isFinite(requestedFrom.getTime()) || requestedFrom >= toDate) throw new NovofonProviderError('invalid_sync_period');
        for (let windowStart = requestedFrom.getTime(); windowStart < toDate.getTime(); windowStart += 90 * 86400_000) {
          const windowEnd = Math.min(toDate.getTime(), windowStart + 90 * 86400_000);
          let offset = 0; const limit = 500;
          while (true) {
            let result: any;
            try { result = await this.requestPage(type, new Date(windowStart).toISOString().slice(0, 19).replace('T', ' '), new Date(windowEnd).toISOString().slice(0, 19).replace('T', ' '), offset, limit); }
            catch (error) {
              if (type === 'financial_leg' && error instanceof NovofonProviderError && ['forbidden', 'method_component_disabled', 'method_not_found'].includes(error.code)) break;
              throw error;
            }
            const rows = reportRows(result); for (const row of rows) { await this.store(type, this.normalized(type, row, sourceId, batchId)); counters[type] += 1; }
            const metadata = reportMetadata(result); const total = Number(metadata?.total_items ?? offset + rows.length);
            const limits = metadata?.limits || {}; const minuteRemaining = Number(limits?.minute?.remaining ?? limits?.minute_remaining);
            const dailyRemaining = Number(limits?.day?.remaining ?? limits?.daily_remaining);
            if ((Number.isFinite(minuteRemaining) && minuteRemaining <= 1) || (Number.isFinite(dailyRemaining) && dailyRemaining <= 1)) {
              throw new NovofonProviderError('limit_exceeded', false, { minuteRemaining, dailyRemaining });
            }
            offset += rows.length; if (!rows.length || offset >= total || rows.length < limit) break;
          }
        }
        await queryPBXPulsDb(`INSERT INTO balance_sync_cursors(source_id,report_type,cursor_at,updated_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE cursor_at=VALUES(cursor_at),updated_at=NOW()`,
          [sourceId, type, toDate.toISOString().slice(0, 19).replace('T', ' ')]);
      }
      await queryPBXPulsDb("UPDATE balance_sources SET usage_last_sync_at=NOW(),usage_last_error_code=NULL,last_success_at=NOW(),status='success',safe_error_code=NULL,updated_at=NOW() WHERE source_pk=?", [sourceId]);
      await queryPBXPulsDb("UPDATE balance_sync_batches SET status='success',finished_at=NOW(),counters_json=? WHERE batch_id=?", [JSON.stringify(counters), batchId]);
      return { batchId, counters };
    } catch (error) {
      const safe = safeNovofonError(error); await queryPBXPulsDb("UPDATE balance_sync_batches SET status='error',finished_at=NOW(),safe_error_code=? WHERE batch_id=?", [safe.safeErrorCode, batchId]).catch(() => undefined);
      await queryPBXPulsDb("UPDATE balance_sources SET usage_last_sync_at=NOW(),usage_last_error_code=?,safe_error_code=?,status='error',updated_at=NOW() WHERE id='novofon'", [safe.safeErrorCode, safe.safeErrorCode]).catch(() => undefined);
      throw error;
    } finally { this.syncing = false; }
  }

  async summary() {
    const managedSettings = await this.settingsStore.load();
    const rows = await queryPBXPulsDb(`SELECT p.balance_amount,p.currency,p.measured_at,s.last_success_at,s.status,s.safe_error_code,s.usage_last_sync_at,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND DATE(e.occurred_at)=UTC_DATE() THEN COALESCE(e.charged_amount,0) ELSE 0 END) spend_today,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND e.occurred_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') THEN COALESCE(e.charged_amount,0) ELSE 0 END) spend_month,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND DATE(e.occurred_at)=UTC_DATE() THEN COALESCE(e.actual_duration_seconds,0) ELSE 0 END) actual_today,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND e.occurred_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') THEN COALESCE(e.actual_duration_seconds,0) ELSE 0 END) actual_month,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND DATE(e.occurred_at)=UTC_DATE() THEN COALESCE(e.chargeable_duration_seconds,0) ELSE 0 END) charged_today,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND e.occurred_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') THEN COALESCE(e.chargeable_duration_seconds,0) ELSE 0 END) charged_month,
      SUM(CASE WHEN e.provider_event_type='financial_leg' THEN COALESCE(e.bonus_amount,0) ELSE 0 END) bonuses,
      SUM(CASE WHEN e.provider_event_type='financial_leg' AND e.sync_status='orphan_financial_leg' THEN 1 ELSE 0 END) orphans
      FROM balance_sources s LEFT JOIN balance_snapshots p ON p.id=(SELECT x.id FROM balance_snapshots x WHERE x.source_id='novofon' ORDER BY x.measured_at DESC,x.id DESC LIMIT 1)
      LEFT JOIN balance_usage_events e ON e.source_id=s.source_pk WHERE s.id='novofon' GROUP BY s.source_pk,p.id`);
    const row = rows[0] || {}; const chargedMonth = Number(row.charged_month || 0); const spendMonth = Number(row.spend_month || 0);
    let packageView: any = null;
    if (managedSettings.packageSettings?.name && managedSettings.packageSettings.periodStart && managedSettings.packageSettings.periodEnd) {
      const directions = managedSettings.packageSettings.directions || []; const directionSql = directions.length ? ` AND e.direction IN(${directions.map(() => '?').join(',')})` : '';
      const usageRows = await queryPBXPulsDb(`SELECT SUM(COALESCE(e.chargeable_duration_seconds,0))/60 used_minutes FROM balance_usage_events e JOIN balance_sources s ON s.source_pk=e.source_id
        WHERE s.id='novofon' AND e.provider_event_type='financial_leg' AND e.occurred_at>=? AND e.occurred_at<DATE_ADD(?,INTERVAL 1 DAY)${directionSql}`,
        [managedSettings.packageSettings.periodStart, managedSettings.packageSettings.periodEnd, ...directions]);
      const used = Number(usageRows[0]?.used_minutes || 0); const purchased = managedSettings.packageSettings.purchasedMinutes;
      packageView = { name: managedSettings.packageSettings.name, purchasedMinutes: purchased, usedMinutes: used, remainingMinutes: Math.max(0, purchased - used),
        usageLabel: 'Расчётный расход PBXPuls', remainingLabel: 'Расчётный остаток PBXPuls', disclaimer: 'Официальный остаток оператором не предоставлен' };
    }
    return { provider: 'novofon', displayName: 'Novofon', balance: number(row.balance_amount), currency: row.currency || null, balanceStatus: row.balance_amount == null ? 'Текущий баланс не предоставлен API' : 'available',
      spendToday: Number(row.spend_today || 0), spendMonth, actualMinutesToday: Number(row.actual_today || 0) / 60, actualMinutesMonth: Number(row.actual_month || 0) / 60,
      chargeableMinutesToday: Number(row.charged_today || 0) / 60, chargeableMinutesMonth: chargedMonth / 60, bonusesPaid: Number(row.bonuses || 0),
      averageChargeableMinuteCost: chargedMonth > 0 ? spendMonth / (chargedMonth / 60) : null, lastSyncAt: row.usage_last_sync_at || row.last_success_at || null,
      orphanFinancialLegs: Number(row.orphans || 0), apiState: { status: row.status || 'disabled', safeErrorCode: row.safe_error_code || null }, package: packageView };
  }

  async source() {
    const [settings, summary] = await Promise.all([this.getSettings(), this.summary()]);
    return { id: NOVOFON_SOURCE_ID, provider: 'novofon', displayName: 'Novofon', enabled: settings.enabled, configured: settings.configured,
      status: settings.connectionStatus, safeErrorCode: settings.safeErrorCode, syncIntervalMinutes: settings.syncIntervalMinutes,
      balance: summary.balance, currency: summary.currency, measuredAt: null, lastSuccessAt: summary.lastSyncAt,
      capabilities: { balance: settings.apiV1Configured, usage: true, recordings: true, financialLegs: true } };
  }

  async usage(query: any, allowFullNumbers: boolean) {
    const conditions = ["s.id='novofon'", "e.provider_event_type='financial_leg'"]; const params: any[] = [];
    for (const [field, column] of [['from', 'e.occurred_at>=?'], ['to', 'e.occurred_at<=?']] as const) if (query[field]) { conditions.push(column); params.push(sqlDate(query[field])); }
    if (query.direction) { conditions.push('e.direction=?'); params.push(query.direction); }
    if (query.state) { conditions.push('e.sync_status=?'); params.push(query.state); }
    if (query.charged === 'yes') conditions.push('e.charged_amount IS NOT NULL AND e.charged_amount<>0');
    if (query.charged === 'no') conditions.push('(e.charged_amount IS NULL OR e.charged_amount=0)');
    if (query.number) { conditions.push('(e.caller_number LIKE ? OR e.callee_number LIKE ?)'); params.push(`%${String(query.number).replace(/\D/g, '')}%`, `%${String(query.number).replace(/\D/g, '')}%`); }
    if (query.employee) { conditions.push("EXISTS(SELECT 1 FROM balance_usage_events ec WHERE ec.source_id=e.source_id AND ec.provider_session_id=e.provider_session_id AND ec.provider_leg_id=e.provider_leg_id AND ec.provider_event_type='cdr_leg' AND ec.metadata_json LIKE ?)"); params.push(`%${String(query.employee).slice(0, 100)}%`); }
    if (query.recording === 'yes') conditions.push("EXISTS(SELECT 1 FROM balance_usage_events er WHERE er.source_id=e.source_id AND er.provider_session_id=e.provider_session_id AND er.provider_event_type='call_session' AND er.metadata_json LIKE '%\"recordingUrl\":\"https:%')");
    if (query.recording === 'no') conditions.push("NOT EXISTS(SELECT 1 FROM balance_usage_events er WHERE er.source_id=e.source_id AND er.provider_session_id=e.provider_session_id AND er.provider_event_type='call_session' AND er.metadata_json LIKE '%\"recordingUrl\":\"https:%')");
    const limit = Math.max(1, Math.min(200, Number(query.limit || 50))); const offset = Math.max(0, Number(query.offset || 0));
    const rows = await queryPBXPulsDb(`SELECT e.id,e.occurred_at,e.direction,e.caller_number,e.callee_number,e.actual_duration_seconds,e.chargeable_duration_seconds,e.cost_per_minute,
      e.charged_amount,e.bonus_amount,e.currency,e.provider_session_id,e.provider_leg_id,e.sync_status,e.metadata_json,
      cdr.metadata_json cdr_metadata_json,session.metadata_json session_metadata_json FROM balance_usage_events e JOIN balance_sources s ON s.source_pk=e.source_id
      LEFT JOIN balance_usage_events cdr ON cdr.source_id=e.source_id AND cdr.provider_session_id=e.provider_session_id AND cdr.provider_leg_id=e.provider_leg_id AND cdr.provider_event_type='cdr_leg'
      LEFT JOIN balance_usage_events session ON session.source_id=e.source_id AND session.provider_session_id=e.provider_session_id AND session.provider_event_type='call_session'
      WHERE ${conditions.join(' AND ')} ORDER BY e.occurred_at DESC,e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const counts = await queryPBXPulsDb(`SELECT COUNT(*) total FROM balance_usage_events e JOIN balance_sources s ON s.source_pk=e.source_id WHERE ${conditions.join(' AND ')}`, params);
    return { total: Number(counts[0]?.total || 0), items: rows.map((row: any) => { let metadata: any = {}, cdrMetadata: any = {}, sessionMetadata: any = {};
      try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {} try { cdrMetadata = JSON.parse(row.cdr_metadata_json || '{}'); } catch {} try { sessionMetadata = JSON.parse(row.session_metadata_json || '{}'); } catch {}
      metadata = { ...sessionMetadata, ...cdrMetadata, ...metadata, recordingUrl: sessionMetadata.recordingUrl || cdrMetadata.recordingUrl || metadata.recordingUrl };
      return { id: Number(row.id), occurredAt: row.occurred_at, direction: row.direction, from: allowFullNumbers ? row.caller_number : maskNovofonPhone(row.caller_number), to: allowFullNumbers ? row.callee_number : maskNovofonPhone(row.callee_number),
        virtualNumber: allowFullNumbers ? metadata.virtualPhoneNumber : maskNovofonPhone(metadata.virtualPhoneNumber), employee: metadata.employeeFullName || null,
        state: metadata.finishReason || null, actualDurationSeconds: number(row.actual_duration_seconds), chargeableDurationSeconds: number(row.chargeable_duration_seconds),
        costPerMinute: number(row.cost_per_minute), chargedAmount: number(row.charged_amount), bonusAmount: number(row.bonus_amount), currency: row.currency,
        callSessionId: row.provider_session_id, legId: row.provider_leg_id, hasRecording: Boolean(metadata.recordingUrl), linkStatus: row.sync_status }; }) };
  }

  async recordingUrl(eventId: number): Promise<string> {
    const rows = await queryPBXPulsDb(`SELECT e.metadata_json FROM balance_usage_events e JOIN balance_sources s ON s.source_pk=e.source_id WHERE s.id='novofon' AND e.id=? LIMIT 1`, [eventId]);
    let metadata: any = {}; try { metadata = JSON.parse(rows[0]?.metadata_json || '{}'); } catch {}
    if (!metadata.recordingUrl) throw new NovofonProviderError('recording_not_found');
    return assertNovofonRecordingUrl(String(metadata.recordingUrl)).toString();
  }

  start() {
    if (this.timer) return;
    const run = async () => { const settings = await this.settingsStore.load(); if (!settings.enabled) return; const rows = await queryPBXPulsDb("SELECT usage_last_sync_at FROM balance_sources WHERE id='novofon' LIMIT 1");
      const last = rows[0]?.usage_last_sync_at ? Date.parse(`${String(rows[0].usage_last_sync_at).replace(' ', 'T')}Z`) : 0;
      if (!this.syncing && Date.now() - last >= settings.syncIntervalMinutes * 60_000) {
        await this.syncUsage().catch(error => console.warn('[BALANCE_NOVOFON] sync failed:', safeNovofonError(error).safeErrorCode));
        if (settings.apiV1Key && settings.apiV1Secret) await this.syncBalance().catch(error => console.warn('[BALANCE_NOVOFON] balance unavailable:', safeNovofonError(error).safeErrorCode));
      } };
    const startup = setTimeout(() => void run(), 20_000); startup.unref?.(); this.timer = setInterval(() => void run(), 60_000); this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
