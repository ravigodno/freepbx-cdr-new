import {
  MtsAutoSecretaryProvider,
  MtsAutoSecretaryProviderError,
  type MtsAutoSecretaryCall,
  type MtsAutoSecretaryDirection
} from './providers/mtsAutoSecretary.js';
import { MtsAutoSecretarySettingsStore } from './mtsAutoSecretarySettings.js';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import {
  matchMtsAutoSecretaryCalls,
  normalizeCallNumber,
  type MtsBusinessCallCandidate
} from './reconciliation/mtsAutoSecretaryMatching.js';

export function safeMtsAutoSecretaryError(error: unknown): { safeErrorCode: string; safeMessage: string } {
  const code = error instanceof MtsAutoSecretaryProviderError
    ? error.safeCode : String((error as any)?.message || 'provider_error').slice(0, 64);
  const messages: Record<string, string> = {
    provider_disabled: 'Источник отключён',
    provider_not_configured: 'Укажите API-ключ и универсальный номер',
    invalid_phone: 'Универсальный номер должен содержать 10 цифр',
    profiles_required: 'Добавьте хотя бы один филиал',
    branch_name_required: 'Укажите название филиала',
    duplicate_profile: 'Идентификаторы филиалов не должны повторяться',
    duplicate_phone: 'Универсальный номер уже используется другим филиалом',
    authentication_failed: 'МТС отклонил API-ключ',
    redirect_blocked: 'Перенаправление API заблокировано',
    invalid_content_type: 'МТС вернул неподдерживаемый ответ',
    response_too_large: 'Ответ МТС превысил безопасный размер',
    invalid_json: 'МТС вернул некорректный JSON',
    timeout: 'Истекло время ожидания ответа МТС',
    network_error: 'Соединение с МТС Автосекретарём недоступно',
    invalid_preview_date: 'Дата предпросмотра задана неверно',
    invalid_preview_period: 'Период должен быть от 1 до 62 дней'
  };
  return {
    safeErrorCode: code,
    safeMessage: messages[code] || (code.startsWith('cdr_http_') ? 'API МТС Автосекретаря вернул ошибку' : 'Проверка API не выполнена')
  };
}

const apiDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function retryTemporaryMtsRequest<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      return await request();
    } catch (error) {
      lastError = error;
      const code = error instanceof MtsAutoSecretaryProviderError ? error.safeCode : '';
      if (!['invalid_content_type', 'timeout', 'network_error', 'cdr_http_429', 'cdr_http_502', 'cdr_http_503'].includes(code)) {
        throw error;
      }
    }
  }
  throw lastError;
}

export class MtsAutoSecretaryService {
  private readonly settingsStore: MtsAutoSecretarySettingsStore;
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(hashSecret: string) {
    this.settingsStore = new MtsAutoSecretarySettingsStore(hashSecret);
  }

  async getSettings() {
    return this.settingsStore.safe(await this.settingsStore.load());
  }

  async saveSettings(input: unknown) {
    const current = await this.settingsStore.load();
    await this.settingsStore.save(input, current);
    return this.getSettings();
  }

  private async saveReport(report: any): Promise<void> {
    const payload = JSON.stringify(report);
    await queryPBXPulsDb(
      `INSERT INTO mts_auto_secretary_reports
       (report_from,report_to,payload_json,calls_count,synced_at,updated_at)
       VALUES(?,?,?,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json),calls_count=VALUES(calls_count),
       synced_at=NOW(),updated_at=NOW()`,
      [report.from, report.to, payload, Array.isArray(report.calls) ? report.calls.length : 0]
    );
  }

  private mergeReports(reports: any[], from: string, to: string) {
    if (!reports.length) return {
      date: from === to ? from : `${from} — ${to}`, from, to, calls: [], summary: null,
      branches: [], operators: [], unallocatedAdditionalCharges: [], stored: true, syncedAt: null
    };
    const numericSummaryKeys = [
      'exact', 'likely', 'conflict', 'unmatched', 'nonBillable', 'technicalErrors',
      'missingBusinessRows', 'matchedAmount', 'mavAmount', 'markingAmount', 'packageMinutesUsed'
    ];
    const summary: Record<string, number> = Object.fromEntries(numericSummaryKeys.map(key => [key, 0]));
    const branchMap = new Map<string, any>();
    const operatorMap = new Map<string, any>();
    const calls = reports.flatMap(report => Array.isArray(report.calls) ? report.calls : []);
    const unallocated = reports.flatMap(report =>
      Array.isArray(report.unallocatedAdditionalCharges) ? report.unallocatedAdditionalCharges : []);
    for (const report of reports) {
      for (const key of numericSummaryKeys) summary[key] += Number(report.summary?.[key]) || 0;
      for (const branch of report.branches || []) {
        const current = branchMap.get(branch.profileId) || {
          ...branch, calls: 0, exact: 0, likely: 0, unmatched: 0, callAmount: 0,
          mavAmount: 0, markingAmount: 0, packageMinutesUsed: 0, operators: {}
        };
        for (const key of ['calls', 'exact', 'likely', 'unmatched', 'callAmount', 'mavAmount', 'markingAmount', 'packageMinutesUsed']) {
          current[key] += Number(branch[key]) || 0;
        }
        for (const [name, value] of Object.entries(branch.operators || {}) as Array<[string, any]>) {
          const aggregate = current.operators[name] || { mavAmount: 0, markingAmount: 0, count: 0 };
          aggregate.mavAmount += Number(value.mavAmount) || 0;
          aggregate.markingAmount += Number(value.markingAmount) || 0;
          aggregate.count += Number(value.count) || 0;
          current.operators[name] = aggregate;
        }
        branchMap.set(branch.profileId, current);
      }
      for (const operator of report.operators || []) {
        const current = operatorMap.get(operator.operator) || {
          operator: operator.operator, mavAmount: 0, markingAmount: 0, linkedCount: 0, unallocatedCount: 0
        };
        for (const key of ['mavAmount', 'markingAmount', 'linkedCount', 'unallocatedCount']) {
          current[key] += Number(operator[key]) || 0;
        }
        operatorMap.set(operator.operator, current);
      }
    }
    return {
      date: from === to ? from : `${from} — ${to}`, from, to,
      calls: calls.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || ''))),
      summary, branches: [...branchMap.values()], operators: [...operatorMap.values()],
      unallocatedAdditionalCharges: unallocated,
      stored: true,
      syncedAt: reports.map(report => report.syncedAt).filter(Boolean).sort().at(-1) || null
    };
  }

  async storedReport(fromValue: unknown, toValue?: unknown) {
    const from = String(fromValue || '').trim();
    const to = String(toValue || from).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new MtsAutoSecretaryProviderError('invalid_preview_date');
    }
    const daily = await queryPBXPulsDb(
      `SELECT payload_json,DATE_FORMAT(synced_at,'%Y-%m-%dT%H:%i:%sZ') syncedAt
       FROM mts_auto_secretary_reports
       WHERE report_from=report_to AND report_from>=? AND report_to<=?
       ORDER BY report_from`,
      [from, to]
    );
    const expectedDays = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    const rows = daily.length === expectedDays ? daily : await queryPBXPulsDb(
      `SELECT payload_json,DATE_FORMAT(synced_at,'%Y-%m-%dT%H:%i:%sZ') syncedAt
       FROM mts_auto_secretary_reports WHERE report_from=? AND report_to=? LIMIT 1`,
      [from, to]
    );
    const reports = rows.flatMap(row => {
      try { return [{ ...JSON.parse(String(row.payload_json || '{}')), syncedAt: row.syncedAt }]; }
      catch { return []; }
    });
    return this.mergeReports(reports, from, to);
  }

  async syncStoredRange(from: string, to: string) {
    const report = await this.matchPreview(from, 'all', to);
    await this.saveReport(report);
    return { ...report, stored: true, syncedAt: new Date().toISOString() };
  }

  async backgroundSync(preSync: (from: string, to: string) => Promise<unknown>): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const settings = await this.settingsStore.load();
      if (!settings.enabled || !settings.profiles.some(profile => profile.active && profile.apiKey)) return;
      const countRows = await queryPBXPulsDb('SELECT COUNT(*) total FROM mts_auto_secretary_reports');
      const initial = Number(countRows[0]?.total || 0) === 0;
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - (initial ? 6 : 1));
      const from = start.toISOString().slice(0, 10);
      const to = end.toISOString().slice(0, 10);
      await preSync(`${from}T00:00:00Z`, end.toISOString().slice(0, 19) + 'Z').catch(() => undefined);
      for (let cursor = new Date(`${from}T00:00:00Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const day = cursor.toISOString().slice(0, 10);
        await this.syncStoredRange(day, day);
      }
      await queryPBXPulsDb(
        `DELETE FROM mts_auto_secretary_reports WHERE report_to<DATE_SUB(CURDATE(),INTERVAL 365 DAY)`
      );
      await queryPBXPulsDb(
        `UPDATE balance_sources SET usage_last_sync_at=NOW(),usage_last_error_code=NULL
         WHERE id='mts_auto_secretary'`
      );
    } catch (error: any) {
      await queryPBXPulsDb(
        `UPDATE balance_sources SET usage_last_sync_at=NOW(),usage_last_error_code=?
         WHERE id='mts_auto_secretary'`,
        [String(error?.safeCode || error?.message || 'auto_secretary_sync_failed').slice(0, 64)]
      ).catch(() => undefined);
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  start(preSync: (from: string, to: string) => Promise<unknown>): void {
    if (this.timer) return;
    const run = () => void this.backgroundSync(preSync).catch(error => {
      console.warn('[BALANCE_MTS_AUTO_SECRETARY] sync failed:', safeMtsAutoSecretaryError(error).safeErrorCode);
    });
    const startupTimer = setTimeout(run, 30_000);
    startupTimer.unref?.();
    this.timer = setInterval(run, 60 * 60_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private provider(profile: { active: boolean; apiKey: string; phone: string }, timeoutMs: number) {
    return new MtsAutoSecretaryProvider({
      enabled: profile.active,
      apiKey: profile.apiKey,
      phone: profile.phone,
      timeoutMs
    });
  }

  async diagnose() {
    const settings = await this.settingsStore.load();
    const profiles = settings.profiles.filter(profile => profile.active);
    if (!settings.enabled || !profiles.length) throw new MtsAutoSecretaryProviderError('provider_disabled');
    const end = new Date();
    const begin = new Date(end.getTime() - 60 * 60 * 1000);
    const results = [];
    for (const profile of profiles) {
      const calls = await this.provider(profile, settings.timeoutMs).fetchCalls(
        'inbound', apiDate(begin), apiDate(end), 1, 0,
        { id: profile.id, branchName: profile.branchName, pbxName: profile.pbxName }
      );
      results.push({ profileId: profile.id, branchName: profile.branchName, sampleCalls: calls.length });
    }
    return {
      requestOk: true,
      safeMessage: 'Подключение к МТС Автосекретарю работает',
      sampleCalls: results.reduce((sum, result) => sum + result.sampleCalls, 0),
      profiles: results
    };
  }

  async preview(
    dateValue: unknown,
    directionValue: unknown,
    toDateValue?: unknown
  ): Promise<{ date: string; from: string; to: string; calls: MtsAutoSecretaryCall[] }> {
    const from = String(dateValue || '').trim();
    const to = String(toDateValue || from).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new MtsAutoSecretaryProviderError('invalid_preview_date');
    }
    const fromMs = Date.parse(`${from}T00:00:00+03:00`);
    const toMs = Date.parse(`${to}T23:59:59+03:00`);
    if (toMs < fromMs || toMs - fromMs > 62 * 24 * 60 * 60 * 1000) {
      throw new MtsAutoSecretaryProviderError('invalid_preview_period');
    }
    const direction = String(directionValue || 'all');
    const directions: MtsAutoSecretaryDirection[] = direction === 'inbound'
      ? ['inbound'] : direction === 'outbound' ? ['outbound'] : ['inbound', 'outbound'];
    const settings = await this.settingsStore.load();
    const profiles = settings.profiles.filter(profile => profile.active);
    if (!settings.enabled || !profiles.length) throw new MtsAutoSecretaryProviderError('provider_disabled');
    const days: string[] = [];
    for (
      let day = Date.parse(`${from}T00:00:00Z`);
      day <= Date.parse(`${to}T00:00:00Z`);
      day += 24 * 60 * 60 * 1000
    ) {
      days.push(new Date(day).toISOString().slice(0, 10));
    }
    const tasks = profiles.flatMap(profile => directions.flatMap(direction =>
      days.map(day => ({ profile, direction, day }))
    ));
    const groups = await mapWithConcurrency(tasks, 2, async ({ profile, direction, day }) => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return retryTemporaryMtsRequest(() =>
        this.provider(profile, settings.timeoutMs).fetchCalls(
          direction, `${day}T00:00:00`, `${day}T23:59:59`, 200000, 0,
          { id: profile.id, branchName: profile.branchName, pbxName: profile.pbxName }
        )
      );
    });
    const calls = groups.flat().sort((left, right) =>
      String(right.startedAt || '').localeCompare(String(left.startedAt || '')));
    return { date: from === to ? from : `${from} — ${to}`, from, to, calls };
  }

  async matchPreview(dateValue: unknown, directionValue: unknown, toDateValue?: unknown) {
    const preview = await this.preview(dateValue, directionValue, toDateValue);
    const localStart = new Date(`${preview.from}T00:00:00+03:00`);
    const localEnd = new Date(Date.parse(`${preview.to}T00:00:00+03:00`) + 24 * 60 * 60 * 1000);
    const utcSql = (value: Date) => value.toISOString().slice(0, 19).replace('T', ' ');
    const rows = await queryPBXPulsDb(
      `SELECT e.id,DATE_FORMAT(e.occurred_at,'%Y-%m-%dT%H:%i:%sZ') occurredAt,
       e.direction,e.caller_number callerNumber,
       e.callee_number calleeNumber,e.amount,e.actual_units actualUnits,e.billed_units billedUnits,
       e.billed_unit_code billedUnitCode,
       e.package_counter_before packageCounterBefore,e.package_counter_after packageCounterAfter,
       e.package_counter_used packageCounterUsed,e.actual_unit_code actualUnitCode,e.label
       FROM balance_usage_events e
       JOIN balance_sources s ON s.source_pk=e.source_id
       WHERE s.id='mts_business' AND e.event_type='network' AND e.network_event='call'
       AND e.occurred_at>=? AND e.occurred_at<?
       ORDER BY e.occurred_at,e.id`,
      [utcSql(localStart), utcSql(localEnd)]
    );
    const addonRows = await queryPBXPulsDb(
      `SELECT e.id,DATE_FORMAT(e.occurred_at,'%Y-%m-%dT%H:%i:%sZ') occurredAt,
       DATE_FORMAT(e.rated_at,'%Y-%m-%dT%H:%i:%sZ') ratedAt,
       e.caller_number callerNumber,e.callee_number calleeNumber,e.amount,e.tax_amount taxAmount,e.label
       FROM balance_usage_events e
       JOIN balance_sources s ON s.source_pk=e.source_id
       WHERE s.id='mts_business' AND e.event_type='network' AND e.network_event='other'
       AND (e.label LIKE 'ИСС. МАВ.%' OR e.label LIKE 'ИСС. Маркировка.%')
       AND e.occurred_at>=? AND e.occurred_at<?
       ORDER BY e.occurred_at,e.id`,
      [utcSql(localStart), utcSql(localEnd)]
    );
    const seenAddons = new Set<string>();
    const uniqueAddonRows = addonRows.filter(row => {
      const dedupeKey = JSON.stringify([
        row.occurredAt, row.callerNumber, row.calleeNumber, row.label, Number(row.amount), Number(row.taxAmount)
      ]);
      if (seenAddons.has(dedupeKey)) return false;
      seenAddons.add(dedupeKey);
      return true;
    });
    const rawCandidates: MtsBusinessCallCandidate[] = rows.map(row => ({
      id: Number(row.id),
      occurredAt: String(row.occurredAt || ''),
      direction: row.direction === 'incoming' ? 'incoming' : 'outgoing',
      callerNumber: row.callerNumber || null,
      calleeNumber: row.calleeNumber || null,
      amount: row.amount === null ? null : Number(row.amount),
      actualUnits: row.actualUnits === null ? null : Number(row.actualUnits),
      billedUnits: row.billedUnits === null ? null : Number(row.billedUnits),
      billedUnitCode: row.billedUnitCode || null,
      packageCounterBefore: row.packageCounterBefore === null ? null : Number(row.packageCounterBefore),
      packageCounterAfter: row.packageCounterAfter === null ? null : Number(row.packageCounterAfter),
      packageCounterUsed: row.packageCounterUsed === null ? null : Number(row.packageCounterUsed),
      actualUnitCode: row.actualUnitCode || null,
      label: row.label || null,
      mavAmount: 0,
      markingAmount: 0
    }));
    const uniqueCandidates = new Map<string, MtsBusinessCallCandidate>();
    for (const candidate of rawCandidates) {
      const key = JSON.stringify([
        candidate.occurredAt, candidate.direction, candidate.callerNumber, candidate.calleeNumber,
        candidate.amount, candidate.actualUnits, candidate.billedUnits, candidate.billedUnitCode,
        candidate.packageCounterBefore, candidate.packageCounterAfter, candidate.packageCounterUsed,
        candidate.actualUnitCode, candidate.label
        , candidate.mavAmount, candidate.markingAmount
      ]);
      if (!uniqueCandidates.has(key)) uniqueCandidates.set(key, candidate);
    }
    const candidates = [...uniqueCandidates.values()];
    const calls = matchMtsAutoSecretaryCalls(preview.calls, candidates);
    const usedAddonIds = new Set<number>();
    for (const call of calls) {
      const callTime = call.startedAt ? Date.parse(`${call.startedAt}+03:00`) : NaN;
      const ownNumber = normalizeCallNumber(call.universalNumber);
      const destinations = new Set([
        call.connectedNumber,
        ...call.attempts.map(attempt => attempt.number),
        ...call.journey.map(event => event.number)
      ].map(normalizeCallNumber).filter((value): value is string => Boolean(value)));
      if (!Number.isFinite(callTime) || !ownNumber || !destinations.size) continue;
      for (const addon of uniqueAddonRows) {
        const addonId = Number(addon.id);
        if (usedAddonIds.has(addonId)) continue;
        if (normalizeCallNumber(addon.callerNumber) !== ownNumber
          || !destinations.has(normalizeCallNumber(addon.calleeNumber) || '')) continue;
        const differenceSeconds = Math.abs(callTime - Date.parse(String(addon.occurredAt || ''))) / 1000;
        if (!Number.isFinite(differenceSeconds) || differenceSeconds > 5) continue;
        const amount = Number(addon.amount) || 0;
        const label = String(addon.label || '');
        const type = label.startsWith('ИСС. МАВ.') ? 'mav' : 'marking';
        if (type === 'mav') call.match.mavAmount += amount;
        else call.match.markingAmount += amount;
        call.match.additionalCharges.push({
          type,
          operator: label.split('.').pop()?.trim() || 'Не определён',
          label,
          amount,
          taxAmount: Number(addon.taxAmount) || 0,
          occurredAt: String(addon.occurredAt || ''),
          ratedAt: addon.ratedAt ? String(addon.ratedAt) : null
        });
        call.match.totalAmount = (call.match.amount || 0) + call.match.mavAmount + call.match.markingAmount;
        usedAddonIds.add(addonId);
      }
    }
    const summary = calls.reduce((result, call) => {
      result[call.match.confidence] += 1;
      if (call.match.amount !== null) result.matchedAmount += call.match.amount;
      result.mavAmount += call.match.mavAmount;
      result.markingAmount += call.match.markingAmount;
      if (call.match.packageCounterUsed !== null) {
        const unit = String(call.match.packageUnit || '').toUpperCase();
        if (['SECOND', 'SECONDS', 'MINUTE', 'MINUTES'].includes(unit)) {
          result.packageMinutesUsed += call.match.packageCounterUsed / 60;
        }
      }
      if (call.match.confidence === 'unmatched') {
        if (call.match.explanation.startsWith('Не тарифицировался:')) result.nonBillable += 1;
        else if (call.match.explanation.startsWith('Техническая ошибка')) result.technicalErrors += 1;
        else result.missingBusinessRows += 1;
      }
      return result;
    }, {
      exact: 0, likely: 0, conflict: 0, unmatched: 0,
      nonBillable: 0, technicalErrors: 0, missingBusinessRows: 0,
      matchedAmount: 0, mavAmount: 0, markingAmount: 0, packageMinutesUsed: 0
    });
    const branchSummaries = new Map<string, {
      profileId: string; branchName: string; pbxName: string; calls: number; exact: number; likely: number;
      unmatched: number; callAmount: number; mavAmount: number; markingAmount: number; packageMinutesUsed: number;
      operators: Record<string, { mavAmount: number; markingAmount: number; count: number }>;
    }>();
    for (const call of calls) {
      const branch = branchSummaries.get(call.profileId) || {
        profileId: call.profileId, branchName: call.branchName, pbxName: call.pbxName,
        calls: 0, exact: 0, likely: 0, unmatched: 0,
        callAmount: 0, mavAmount: 0, markingAmount: 0, packageMinutesUsed: 0, operators: {}
      };
      branch.calls += 1;
      if (call.match.confidence === 'exact') branch.exact += 1;
      else if (call.match.confidence === 'likely') branch.likely += 1;
      else branch.unmatched += 1;
      branch.callAmount += call.match.amount || 0;
      branch.mavAmount += call.match.mavAmount;
      branch.markingAmount += call.match.markingAmount;
      for (const charge of call.match.additionalCharges) {
        const operator = branch.operators[charge.operator]
          || { mavAmount: 0, markingAmount: 0, count: 0 };
        if (charge.type === 'mav') operator.mavAmount += charge.amount;
        else operator.markingAmount += charge.amount;
        operator.count += 1;
        branch.operators[charge.operator] = operator;
      }
      if (call.match.packageCounterUsed !== null
        && ['SECOND', 'SECONDS', 'MINUTE', 'MINUTES'].includes(String(call.match.packageUnit || '').toUpperCase())) {
        branch.packageMinutesUsed += call.match.packageCounterUsed / 60;
      }
      branchSummaries.set(call.profileId, branch);
    }
    const operatorSummary: Record<string, {
      mavAmount: number; markingAmount: number; linkedCount: number; unallocatedCount: number;
    }> = {};
    for (const call of calls) {
      for (const charge of call.match.additionalCharges) {
        const operator = operatorSummary[charge.operator]
          || { mavAmount: 0, markingAmount: 0, linkedCount: 0, unallocatedCount: 0 };
        if (charge.type === 'mav') operator.mavAmount += charge.amount;
        else operator.markingAmount += charge.amount;
        operator.linkedCount += 1;
        operatorSummary[charge.operator] = operator;
      }
    }
    for (const row of uniqueAddonRows.filter(row => !usedAddonIds.has(Number(row.id)))) {
      const operatorName = String(row.label || '').split('.').pop()?.trim() || 'Не определён';
      const operator = operatorSummary[operatorName]
        || { mavAmount: 0, markingAmount: 0, linkedCount: 0, unallocatedCount: 0 };
      operator.unallocatedCount += 1;
      operatorSummary[operatorName] = operator;
    }
    return {
      date: preview.date,
      from: preview.from,
      to: preview.to,
      calls,
      summary,
      branches: [...branchSummaries.values()],
      operators: Object.entries(operatorSummary).map(([operator, values]) => ({ operator, ...values })),
      businessCandidates: candidates.length,
      businessDuplicateRows: rawCandidates.length - candidates.length,
      businessAddonRows: seenAddons.size,
      linkedBusinessAddonRows: usedAddonIds.size,
      unallocatedBusinessAddonRows: seenAddons.size - usedAddonIds.size,
      unallocatedAdditionalCharges: uniqueAddonRows
        .filter(row => !usedAddonIds.has(Number(row.id)))
        .map(row => ({
          id: Number(row.id),
          type: String(row.label || '').startsWith('ИСС. МАВ.') ? 'mav' : 'marking',
          operator: String(row.label || '').split('.').pop()?.trim() || 'Не определён',
          callerNumber: row.callerNumber || null,
          calleeNumber: row.calleeNumber || null,
          amount: Number(row.amount) || 0,
          taxAmount: Number(row.taxAmount) || 0,
          occurredAt: String(row.occurredAt || ''),
          ratedAt: row.ratedAt ? String(row.ratedAt) : null
        }))
    };
  }
}
