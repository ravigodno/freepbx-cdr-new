import crypto from 'node:crypto';
import { queryPBXPulsDb, sanitizePBXPulsDbError } from '../pbxpulsDb.js';
import {
  MTS_BUSINESS_CAPABILITIES,
  MtsBusinessProvider,
  MtsBusinessProviderError,
  maskMtsIdentifier,
  type MtsBusinessBalanceResult,
  type MtsBusinessLookupType,
  type MtsBusinessProviderConfig
} from './providers/mtsBusiness.js';
import { MtsBusinessSettingsStore, type MtsBusinessManagedSettings } from './mtsBusinessSettings.js';
import { MtsPackagesService } from './mtsPackagesService.js';

export const MTS_BUSINESS_SOURCE_ID = 'mts_business';

function envBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function lookupType(value: unknown): MtsBusinessLookupType {
  return String(value || '').trim().toLowerCase() === 'account' ? 'account' : 'msisdn';
}

export function readMtsBusinessConfig(env: NodeJS.ProcessEnv = process.env): MtsBusinessProviderConfig & {
  syncIntervalMinutes: number;
  usageOverlapHours: number;
} {
  return {
    enabled: envBoolean(env.BALANCE_MTS_BUSINESS_ENABLED, false),
    apiBase: String(env.BALANCE_MTS_BUSINESS_API_BASE || 'https://api.mts.ru').trim(),
    consumerKey: String(env.BALANCE_MTS_BUSINESS_CONSUMER_KEY || ''),
    consumerSecret: String(env.BALANCE_MTS_BUSINESS_CONSUMER_SECRET || ''),
    lookupType: lookupType(env.BALANCE_MTS_BUSINESS_LOOKUP_TYPE),
    msisdn: String(env.BALANCE_MTS_BUSINESS_MSISDN || ''),
    accountNo: String(env.BALANCE_MTS_BUSINESS_ACCOUNT_NO || ''),
    timeoutMs: boundedInteger(env.BALANCE_MTS_BUSINESS_TIMEOUT_MS, 15000, 1000, 60000),
    syncIntervalMinutes: boundedInteger(env.BALANCE_MTS_BUSINESS_SYNC_INTERVAL_MINUTES, 30, 1, 1440),
    usageOverlapHours: boundedInteger(env.BALANCE_MTS_BUSINESS_USAGE_OVERLAP_HOURS, 24, 1, 168)
  };
}

export function safeMtsBusinessError(error: unknown): { safeErrorCode: string; safeMessage: string } {
  const code = error instanceof MtsBusinessProviderError ? error.safeCode : 'provider_error';
  const messages: Record<string, string> = {
    provider_disabled: 'Провайдер отключён',
    provider_not_configured: 'Проверьте серверные параметры MTS Business',
    credentials_missing: 'Серверные учётные данные не настроены',
    authentication_failed: 'МТС отклонил серверные учётные данные',
    authentication_expired: 'МТС повторно отклонил обновлённый токен',
    invalid_msisdn: 'Номер для проверки задан неверно',
    invalid_usage_date_format: 'Период детализации должен быть задан в UTC с точностью до секунды',
    invalid_usage_period: 'Период детализации задан неверно',
    invalid_usage_period_order: 'Начало периода должно быть раньше окончания',
    invalid_account_number: 'Лицевой счёт задан неверно',
    invalid_api_base: 'Адрес MTS Business API задан неверно',
    api_host_not_allowed: 'Хост API не разрешён политикой безопасности',
    redirect_blocked: 'Перенаправление API заблокировано',
    invalid_content_type: 'МТС вернул ответ неподдерживаемого типа',
    response_too_large: 'Ответ МТС превысил допустимый размер',
    invalid_json: 'МТС вернул некорректный JSON',
    token_missing: 'В ответе МТС отсутствует access token',
    timeout: 'Истекло время ожидания ответа МТС',
    network_error: 'Сетевое соединение с МТС недоступно'
  };
  return {
    safeErrorCode: code.slice(0, 64),
    safeMessage: messages[code] || (code.startsWith('token_http_') || code.startsWith('balance_http_') || code.startsWith('usage_http_')
      ? 'MTS Business API вернул ошибку'
      : 'Проверка MTS Business API не выполнена')
  };
}

function sqlDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function utcIsoFromSql(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const iso = text.includes('T') ? text : text.replace(' ', 'T');
  const parsed = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export interface MtsBusinessDiagnosticResult {
  enabled: boolean;
  configured: boolean;
  authenticationOk: boolean;
  requestOk: boolean;
  lookupType: MtsBusinessLookupType;
  balanceReceived: boolean;
  currencyReceived: boolean;
  safeErrorCode: string | null;
  safeMessage: string;
}

export interface MtsBusinessOverview {
  provider: 'mts_business';
  displayName: string;
  balance: number | null;
  currency: 'RUB' | null;
  creditLimit: number | null;
  accountNumber: string | null;
  purchasedPackageMinutes: number | null;
  remainingPackageMinutes: number | null;
  remainingPackagePercent: number | null;
  packageCalculationStatus: 'direct' | 'calculated' | 'unavailable';
  packageLabels: string[];
  linkedTrunks: string[];
  measuredAt: string | null;
  lastSuccessAt: string | null;
  status: {
    code: 'connected' | 'authorization_required' | 'api_error' | 'stale' | 'updating' | 'offline';
    label: string;
    reason: string | null;
  };
}

export interface MtsBusinessOverviewHistory {
  balance: Array<{ date: string; balance: number }>;
  minutes: Array<{ date: string; usedMinutes: number }>;
  periodDays: number;
}

export class MtsBusinessBalanceService {
  private provider: MtsBusinessProvider | null = null;
  private configFingerprint = '';
  private syncInProgress = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private managedConfig: ReturnType<typeof readMtsBusinessConfig> | null = null;
  private settingsSource: 'pbxpuls' | 'environment' = 'environment';
  private readonly settingsStore: MtsBusinessSettingsStore;
  private packageDiagnosticWritten = false;

  constructor(private readonly hashSecret: string) {
    this.settingsStore = new MtsBusinessSettingsStore(hashSecret);
  }

  private getProvider(): { provider: MtsBusinessProvider; config: ReturnType<typeof readMtsBusinessConfig> } {
    const config = this.managedConfig || readMtsBusinessConfig();
    const fingerprint = JSON.stringify({
      enabled: config.enabled,
      apiBase: config.apiBase,
      consumerKey: config.consumerKey,
      consumerSecret: config.consumerSecret,
      lookupType: config.lookupType,
      msisdn: config.msisdn,
      accountNo: config.accountNo,
      timeoutMs: config.timeoutMs
    });
    if (!this.provider || fingerprint !== this.configFingerprint) {
      this.provider = new MtsBusinessProvider(config);
      this.configFingerprint = fingerprint;
    }
    return { provider: this.provider, config };
  }

  getUsageProvider(): { provider: MtsBusinessProvider; config: ReturnType<typeof readMtsBusinessConfig> } {
    return this.getProvider();
  }

  async refreshSettings(): Promise<void> {
    const fallback = readMtsBusinessConfig();
    const loaded = await this.settingsStore.load(fallback);
    this.managedConfig = loaded.settings;
    this.settingsSource = loaded.source;
  }

  async getManagedSettings() {
    await this.refreshSettings();
    return this.settingsStore.safe(this.managedConfig!, this.settingsSource);
  }

  async saveManagedSettings(input: unknown) {
    await this.refreshSettings();
    await this.settingsStore.save(input, this.managedConfig as MtsBusinessManagedSettings);
    this.provider = null;
    this.configFingerprint = '';
    await this.refreshSettings();
    this.restartTimer();
    return this.settingsStore.safe(this.managedConfig!, this.settingsSource);
  }

  async syncSubscriberNumbers(): Promise<number> {
    await this.refreshSettings();
    const { provider, config } = this.getProvider();
    const accountNo = String(config.accountNo || '').trim();
    if (!accountNo) return 0;
    const numbers = await provider.fetchHierarchyNumbers(accountNo);
    await queryPBXPulsDb('DELETE FROM balance_source_numbers WHERE source_id=?', [MTS_BUSINESS_SOURCE_ID]);
    for (const number of numbers) {
      const msisdnHash = crypto.createHmac('sha256', this.hashSecret).update(number.msisdn).digest('hex');
      const effectiveAccount = number.accountNumber || accountNo;
      const accountHash = crypto.createHmac('sha256', this.hashSecret).update(effectiveAccount).digest('hex');
      await queryPBXPulsDb(
        `INSERT INTO balance_source_numbers
         (source_id,msisdn_number,msisdn_masked,msisdn_hash,account_number,account_number_masked,account_number_hash,last_seen_at)
         VALUES (?,?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE msisdn_number=VALUES(msisdn_number),msisdn_masked=VALUES(msisdn_masked),
          account_number=VALUES(account_number),account_number_masked=VALUES(account_number_masked),
          account_number_hash=VALUES(account_number_hash),last_seen_at=NOW()`,
        [MTS_BUSINESS_SOURCE_ID, number.msisdn, maskMtsIdentifier(number.msisdn), msisdnHash,
          effectiveAccount, maskMtsIdentifier(effectiveAccount), accountHash]
      );
    }
    return numbers.length;
  }

  async listSubscriberNumbers() {
    return queryPBXPulsDb(
      `SELECT msisdn_hash id,msisdn_number label,account_number_hash accountId,
              account_number accountLabel
       FROM balance_source_numbers WHERE source_id=? ORDER BY msisdn_masked`,
      [MTS_BUSINESS_SOURCE_ID]
    );
  }

  async diagnose(): Promise<MtsBusinessDiagnosticResult> {
    await this.refreshSettings();
    const { provider, config } = this.getProvider();
    const base: MtsBusinessDiagnosticResult = {
      enabled: provider.enabled,
      configured: provider.configured,
      authenticationOk: false,
      requestOk: false,
      lookupType: config.lookupType,
      balanceReceived: false,
      currencyReceived: false,
      safeErrorCode: null,
      safeMessage: 'Проверка не выполнена'
    };
    if (!provider.enabled) return { ...base, safeErrorCode: 'provider_disabled', safeMessage: 'Провайдер отключён' };
    if (!provider.configured) return { ...base, safeErrorCode: 'provider_not_configured', safeMessage: 'Проверьте серверные параметры MTS Business' };
    try {
      const result = await provider.fetchBalance();
      return {
        ...base,
        authenticationOk: true,
        requestOk: true,
        balanceReceived: result.balance !== null,
        currencyReceived: result.currency !== null,
        safeMessage: 'Подключение к MTS Business API работает'
      };
    } catch (error) {
      const safe = safeMtsBusinessError(error);
      return {
        ...base,
        authenticationOk: !['authentication_failed', 'authentication_expired', 'credentials_missing', 'token_missing'].includes(safe.safeErrorCode),
        safeErrorCode: safe.safeErrorCode,
        safeMessage: safe.safeMessage
      };
    }
  }

  private async persistSnapshot(result: MtsBusinessBalanceResult): Promise<void> {
    const { config } = this.getProvider();
    const accountMasked = maskMtsIdentifier(result.accountNumber);
    const msisdnMasked = maskMtsIdentifier(result.msisdn);
    const metadata = {
      provider: result.provider,
      capabilities: MTS_BUSINESS_CAPABILITIES,
      lookupType: config.lookupType,
      validUntil: result.validUntil
    };
    await queryPBXPulsDb(
      `INSERT INTO balance_snapshots
        (source_id,balance_amount,currency,credit_limit,account_number_masked,msisdn_masked,
         measured_at,provider_timestamp,source_type,raw_hash,metadata_json)
       VALUES (?,?,?,?,?,?,?,?, 'api',?,?)`,
      [
        MTS_BUSINESS_SOURCE_ID,
        result.balance,
        result.currency,
        result.creditLimit,
        accountMasked,
        msisdnMasked,
        sqlDate(result.measuredAt),
        null,
        result.rawHash,
        JSON.stringify(metadata)
      ]
    );
    await queryPBXPulsDb(
      `UPDATE balance_sources
       SET enabled=?,status='success',safe_error_code=NULL,last_attempt_at=NOW(),last_success_at=?,
           sync_interval_minutes=?,updated_at=NOW()
       WHERE id=?`,
      [
        config.enabled ? 1 : 0,
        sqlDate(result.measuredAt),
        config.syncIntervalMinutes,
        MTS_BUSINESS_SOURCE_ID
      ]
    );
  }

  async sync(): Promise<MtsBusinessBalanceResult> {
    if (this.syncInProgress) throw new MtsBusinessProviderError('sync_in_progress');
    this.syncInProgress = true;
    try {
      await this.refreshSettings();
      const { provider } = this.getProvider();
      const result = await provider.fetchBalance();
      await this.persistSnapshot(result);
      if (this.managedConfig?.lookupType === 'account' && this.managedConfig.accountNo) {
        await this.syncSubscriberNumbers().catch(() => undefined);
      }
      return result;
    } catch (error) {
      const safe = safeMtsBusinessError(error);
      try {
        await queryPBXPulsDb(
          `UPDATE balance_sources
           SET enabled=?,status='error',safe_error_code=?,last_attempt_at=NOW(),updated_at=NOW()
           WHERE id=?`,
          [(this.managedConfig || readMtsBusinessConfig()).enabled ? 1 : 0, safe.safeErrorCode, MTS_BUSINESS_SOURCE_ID]
        );
      } catch {}
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  async listSources(): Promise<any[]> {
    await this.refreshSettings();
    const config = this.managedConfig!;
    const rows = await queryPBXPulsDb(
      `SELECT s.id,s.provider,s.display_name,s.status,s.safe_error_code,s.last_attempt_at,s.last_success_at,
              s.sync_interval_minutes,
              p.balance_amount,p.currency,p.credit_limit,p.account_number_masked,p.msisdn_masked,
              p.measured_at,p.provider_timestamp,p.raw_hash
       FROM balance_sources s
       LEFT JOIN balance_snapshots p ON p.id=(
         SELECT latest.id FROM balance_snapshots latest
         WHERE latest.source_id=s.id ORDER BY latest.measured_at DESC,latest.id DESC LIMIT 1
       )
       WHERE s.id=?
       LIMIT 1`,
      [MTS_BUSINESS_SOURCE_ID]
    );
    const row = rows[0] || {};
    return [{
      id: MTS_BUSINESS_SOURCE_ID,
      provider: 'mts_business',
      displayName: row.display_name || 'МТС Бизнес',
      enabled: config.enabled,
      configured: Boolean(config.consumerKey && config.consumerSecret && (config.lookupType === 'account' ? config.accountNo : config.msisdn)),
      status: row.status || (config.enabled ? 'pending' : 'disabled'),
      safeErrorCode: row.safe_error_code || null,
      lookupType: config.lookupType,
      syncIntervalMinutes: config.syncIntervalMinutes,
      capabilities: MTS_BUSINESS_CAPABILITIES,
      balance: row.balance_amount == null ? null : Number(row.balance_amount),
      currency: row.currency || null,
      creditLimit: row.credit_limit == null ? null : Number(row.credit_limit),
      accountNumberMasked: row.account_number_masked || null,
      msisdnMasked: row.msisdn_masked || maskMtsIdentifier(config.msisdn),
      measuredAt: row.measured_at || null,
      providerTimestamp: row.provider_timestamp || null,
      lastAttemptAt: row.last_attempt_at || null,
      lastSuccessAt: row.last_success_at || null,
      rawHash: row.raw_hash || null
    }];
  }

  async getOverview(): Promise<MtsBusinessOverview> {
    await this.refreshSettings();
    const config = this.managedConfig!;
    const snapshots = await queryPBXPulsDb(
      `SELECT p.balance_amount,p.currency,p.credit_limit,p.measured_at,
              s.status,s.safe_error_code,s.last_success_at
       FROM balance_sources s
       LEFT JOIN balance_snapshots p ON p.id=(
         SELECT latest.id FROM balance_snapshots latest
         WHERE latest.source_id=s.id ORDER BY latest.measured_at DESC,latest.id DESC LIMIT 1
       )
       WHERE s.id=? LIMIT 1`,
      [MTS_BUSINESS_SOURCE_ID]
    );
    const packageView = await new MtsPackagesService(() => this.getUsageProvider()).get(MTS_BUSINESS_SOURCE_ID);
    const purchasedPackageMinutes = packageView.summary.totalUnits;
    const remainingPackageMinutes = packageView.summary.remainingUnits;
    if (purchasedPackageMinutes !== null && !this.packageDiagnosticWritten) {
      this.packageDiagnosticWritten = true;
      console.info('[BALANCE_MTS_BUSINESS] package remainder unavailable: no identified MTS service counter');
    }
    const row = snapshots[0] || {};
    const safeCode = String(row.safe_error_code || '');
    const lastSuccessAt = utcIsoFromSql(row.last_success_at);
    const lastSuccessMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
    const staleAfterMs = Math.max(config.syncIntervalMinutes * 2, 120) * 60_000;
    const stale = Number.isFinite(lastSuccessMs) && Date.now() - lastSuccessMs > staleAfterMs;
    let status: MtsBusinessOverview['status'];
    if (this.syncInProgress) status = { code: 'updating', label: 'Обновление', reason: null };
    else if (!config.enabled) status = { code: 'offline', label: 'Нет связи', reason: 'Источник отключён' };
    else if (!config.consumerKey || !config.consumerSecret) {
      status = { code: 'authorization_required', label: 'Требуется авторизация', reason: 'Не настроены учётные данные API' };
    } else if (row.status === 'error') {
      const authError = ['authentication_failed', 'authentication_expired', 'credentials_missing', 'token_missing'].includes(safeCode);
      status = {
        code: authError ? 'authorization_required' : safeCode === 'network_error' ? 'offline' : 'api_error',
        label: authError ? 'Требуется авторизация' : safeCode === 'network_error' ? 'Нет связи' : 'Ошибка API',
        reason: safeMtsBusinessError(new MtsBusinessProviderError(safeCode || 'provider_error')).safeMessage
      };
    } else if (stale || !row.last_success_at) {
      status = { code: 'stale', label: 'Данные устарели', reason: 'Последнее успешное обновление выполнено давно' };
    } else status = { code: 'connected', label: 'Подключено', reason: null };
    return {
      provider: 'mts_business',
      displayName: 'МТС Бизнес',
      balance: row.balance_amount == null ? null : Number(row.balance_amount),
      currency: row.currency === 'RUB' ? 'RUB' : null,
      creditLimit: row.credit_limit == null ? null : Number(row.credit_limit),
      accountNumber: String(config.accountNo || '').trim() || null,
      purchasedPackageMinutes,
      remainingPackageMinutes,
      remainingPackagePercent: purchasedPackageMinutes && remainingPackageMinutes !== null
        ? remainingPackageMinutes / purchasedPackageMinutes * 100 : null,
      packageCalculationStatus: remainingPackageMinutes === null ? 'unavailable' : 'direct',
      packageLabels: packageView.activePackages.map(item => item.packageName),
      linkedTrunks: [],
      measuredAt: utcIsoFromSql(row.measured_at),
      lastSuccessAt,
      status
    };
  }

  async getOverviewHistory(periodDays = 31): Promise<MtsBusinessOverviewHistory> {
    const safePeriodDays = Math.max(7, Math.min(370, Math.trunc(periodDays) || 31));
    const [snapshotRows, minuteRows] = await Promise.all([
      queryPBXPulsDb(
        `SELECT balance_amount balanceAmount,measured_at measuredAt
         FROM balance_snapshots
         WHERE source_id=? AND balance_amount IS NOT NULL
           AND measured_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY)
         ORDER BY measured_at,id`,
        [MTS_BUSINESS_SOURCE_ID, safePeriodDays]
      ),
      queryPBXPulsDb(
        `SELECT DATE(e.occurred_at) usageDate,SUM(e.package_counter_used)/60 usedMinutes
         FROM balance_usage_events e
         INNER JOIN balance_sources s ON s.source_pk=e.source_id
         WHERE s.id=? AND e.package_counter_id IS NOT NULL
           AND e.package_counter_used IS NOT NULL
           AND e.occurred_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY)
         GROUP BY DATE(e.occurred_at)
         ORDER BY usageDate`,
        [MTS_BUSINESS_SOURCE_ID, safePeriodDays]
      )
    ]);
    const dailyBalance = new Map<string, number>();
    for (const row of snapshotRows) {
      const date = String(row.measuredAt || '').slice(0, 10);
      const balance = Number(row.balanceAmount);
      if (date && Number.isFinite(balance)) dailyBalance.set(date, balance);
    }
    return {
      balance: [...dailyBalance.entries()].map(([date, balance]) => ({ date, balance })),
      minutes: minuteRows.map(row => ({
        date: String(row.usageDate || '').slice(0, 10),
        usedMinutes: Number(row.usedMinutes || 0)
      })).filter(row => row.date && Number.isFinite(row.usedMinutes)),
      periodDays: safePeriodDays
    };
  }

  start(): void {
    if (this.timer) return;
    const run = () => void this.sync().catch(error => {
      const safe = safeMtsBusinessError(error);
      if (safe.safeErrorCode !== 'provider_disabled') console.warn('[BALANCE_MTS_BUSINESS] sync failed:', safe.safeErrorCode);
    });
    const startupTimer = setTimeout(run, 15_000);
    startupTimer.unref?.();
    this.timer = setInterval(run, 30 * 60_000);
    this.timer.unref?.();
  }

  private restartTimer(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function sanitizeBalanceStorageError(error: unknown): string {
  return sanitizePBXPulsDbError(error).replace(/\b7\d{10}\b/g, value => maskMtsIdentifier(value) || '********');
}
