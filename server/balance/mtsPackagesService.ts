import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { type MtsBusinessProvider, type MtsValidityPackage } from './providers/mtsBusiness.js';

type ProviderContext = {
  provider: MtsBusinessProvider;
  config: { msisdn: string };
};
let validityCache: { expiresAt: number; fetchedAt: string; packages: MtsValidityPackage[] } | null = null;

const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const isoOrNull = (value: unknown): string | null => {
  if (!value) return null;
  const text = String(value).replace(' ', 'T');
  const date = new Date(/[z+-]/i.test(text.slice(10)) ? text : `${text}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const minutesFromLabel = (label: string): number | null => {
  const match = label.match(/пакет(?:\s+минут)?\s+(\d[\d\s]*)/iu);
  if (!match) return null;
  const value = Number(match[1].replace(/\s/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function matchMtsPackageCounter(label: string, counterIds: string[]): string | null {
  const candidates = [...new Set(counterIds.filter(Boolean))];
  if (!candidates.length) return null;
  if (/автосекрет/iu.test(label)) {
    const exact = candidates.find(id => /AVS/iu.test(id));
    if (exact) return exact;
  }
  if (/\bPBX\b/iu.test(label)) {
    const exact = candidates.find(id => /PBXPACK/iu.test(id));
    if (exact) return exact;
  }
  const volume = minutesFromLabel(label);
  if (volume !== null) {
    const exact = candidates.find(id => id.includes(String(volume)));
    if (exact) return exact;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export type MtsPackageStatus = 'active' | 'ending' | 'depleted' | 'scheduled' | 'expired' | 'unavailable';

export interface MtsPackageView {
  providerId: 'mts_business';
  accountId: string;
  packageId: string;
  externalPackageId: string | null;
  packageName: string;
  packageType: 'minutes';
  totalUnits: number | null;
  usedUnits: number | null;
  remainingUnits: number | null;
  unit: 'minutes';
  price: number | null;
  tax: number | null;
  currency: 'RUB';
  activatedAt: string | null;
  periodStartedAt: string | null;
  periodEndsAt: string | null;
  status: MtsPackageStatus;
  autoRenew: boolean | null;
  compatibleNumbers: string[];
  compatibleTrunks: string[];
  source: string;
  lastSyncedAt: string | null;
  rawReference: string;
  counterId: string | null;
  counterSource: 'mts_service_counter' | 'unavailable';
  warning: string | null;
}

function packageStatus(start: string | null, end: string | null, remaining: number | null, total: number | null, now: number): MtsPackageStatus {
  if (!start || !end) return 'unavailable';
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (startMs > now) return 'scheduled';
  if (endMs < now) return 'expired';
  if (remaining !== null && remaining <= 0) return 'depleted';
  if (endMs - now <= 3 * 86_400_000 || (remaining !== null && total !== null && remaining / total < .2)) return 'ending';
  return 'active';
}

export class MtsPackagesService {
  constructor(private readonly getProviderContext?: () => ProviderContext) {}

  private async source(sourceKey: string): Promise<{ id: number; accountId: string; lastSyncedAt: string | null }> {
    const rows = await queryPBXPulsDb(
      'SELECT source_pk,config_json,usage_last_sync_at,last_success_at FROM balance_sources WHERE id=? LIMIT 1',
      [sourceKey]
    );
    if (!rows[0]?.source_pk) throw new Error('balance_source_not_found');
    let config: any = {};
    try { config = JSON.parse(String(rows[0].config_json || '{}')); } catch {}
    return {
      id: Number(rows[0].source_pk),
      accountId: String(config.accountNo || ''),
      lastSyncedAt: isoOrNull(rows[0].usage_last_sync_at || rows[0].last_success_at)
    };
  }

  async get(sourceKey: string) {
    const source = await this.source(sourceKey);
    const now = Date.now();
    const periodRows = await queryPBXPulsDb(
      `SELECT id,label,amount,tax_amount tax,occurred_at occurredAt,charge_period_start periodStartedAt,
       charge_period_end periodEndsAt,provider_event_key providerEventKey,msisdn_masked msisdnMasked
       FROM balance_usage_events
       WHERE source_id=? AND event_type='periodical' AND (LOWER(label) LIKE '%пакет%' OR label LIKE '%PBX%')
         AND charge_period_start IS NOT NULL AND charge_period_end IS NOT NULL
       ORDER BY charge_period_start DESC,id DESC`,
      [source.id]
    );
    const counterRows = await queryPBXPulsDb(
      `SELECT DISTINCT package_counter_id counterId FROM balance_usage_events
       WHERE source_id=? AND package_counter_id IS NOT NULL`,
      [source.id]
    );
    const counterIds = counterRows.map(row => String(row.counterId));
    let validityPackages: MtsValidityPackage[] = [];
    let validityFetchedAt: string | null = null;
    if (this.getProviderContext) {
      if (validityCache && validityCache.expiresAt > Date.now()) {
        validityPackages = validityCache.packages;
        validityFetchedAt = validityCache.fetchedAt;
      } else {
        const context = this.getProviderContext();
        const numberRows = await queryPBXPulsDb(
          'SELECT msisdn_number msisdn FROM balance_source_numbers WHERE source_id=? ORDER BY msisdn_number',
          [sourceKey]
        );
        const numbers = [...new Set([
          ...numberRows.map(row => String(row.msisdn || '')).filter(value => /^7\d{10}$/.test(value)),
          String(context.config.msisdn || '')
        ].filter(value => /^7\d{10}$/.test(value)))];
        try {
          const responses = await Promise.all(numbers.map(number => context.provider.fetchValidityPackages(number)));
          validityPackages = responses.flatMap(response => response.packages);
          validityFetchedAt = responses.map(response => response.fetchedAt).sort().at(-1) || new Date().toISOString();
          validityCache = { packages: validityPackages, fetchedAt: validityFetchedAt, expiresAt: Date.now() + 10 * 60_000 };
        } catch (error) {
          if (!validityCache) throw error;
          validityPackages = validityCache.packages;
          validityFetchedAt = validityCache.fetchedAt;
        }
      }
    }
    const packages: MtsPackageView[] = [];

    for (const item of validityPackages) {
      const totalUnits = minutesFromLabel(item.serviceName);
      const remainingUnits = Math.max(0, item.unit === 'SECOND' ? item.currentValue / 60 : item.currentValue);
      const usedUnits = totalUnits === null ? null : Math.max(0, totalUnits - remainingUnits);
      const priceRow = periodRows.find(row =>
        String(row.label || '').trim().toLocaleLowerCase('ru-RU') === item.serviceName.trim().toLocaleLowerCase('ru-RU')
      );
      const packageId = crypto.createHash('sha256')
        .update(`${source.id}:${item.msisdn}:${item.counterId}:${item.externalServiceId || ''}:${item.periodStartedAt || ''}`)
        .digest('hex').slice(0, 24);
      packages.push({
        providerId: 'mts_business',
        accountId: source.accountId,
        packageId,
        externalPackageId: item.externalServiceId,
        packageName: item.serviceName,
        packageType: 'minutes',
        totalUnits,
        usedUnits,
        remainingUnits,
        unit: 'minutes',
        price: numberOrNull(priceRow?.amount),
        tax: numberOrNull(priceRow?.tax),
        currency: 'RUB',
        activatedAt: item.periodStartedAt,
        periodStartedAt: item.periodStartedAt,
        periodEndsAt: item.periodEndsAt,
        status: item.status?.toLowerCase() === 'active'
          ? packageStatus(item.periodStartedAt, item.periodEndsAt, remainingUnits, totalUnits, now)
          : 'unavailable',
        autoRenew: item.autoExtensionValue === null ? null : item.autoExtensionValue > 0,
        compatibleNumbers: [item.msisdn],
        compatibleTrunks: [],
        source: 'MTS Business API · ValidityInfo',
        lastSyncedAt: validityFetchedAt,
        rawReference: item.externalServiceId || item.counterId,
        counterId: item.counterId,
        counterSource: 'mts_service_counter',
        warning: null
      });
    }

    if (!packages.length) for (const row of periodRows) {
      const label = String(row.label || 'Пакет минут');
      const counterId = matchMtsPackageCounter(label, counterIds);
      const periodStartedAt = isoOrNull(row.periodStartedAt);
      const periodEndsAt = isoOrNull(row.periodEndsAt);
      const latest = counterId ? await queryPBXPulsDb(
        `SELECT package_counter_after remaining,msisdn_masked msisdnMasked
         FROM balance_usage_events
         WHERE source_id=? AND package_counter_id=? AND package_counter_after IS NOT NULL
           AND occurred_at>=? AND occurred_at<=?
         ORDER BY occurred_at DESC,id DESC LIMIT 1`,
        [source.id, counterId, row.periodStartedAt, row.periodEndsAt]
      ) : [];
      const totalUnits = minutesFromLabel(label);
      const remainingSeconds = numberOrNull(latest[0]?.remaining);
      const remainingUnits = remainingSeconds === null ? null : Math.max(0, remainingSeconds / 60);
      const usedUnits = totalUnits !== null && remainingUnits !== null
        ? Math.max(0, totalUnits - remainingUnits)
        : null;
      const packageId = crypto.createHash('sha256')
        .update(`${source.id}:${row.providerEventKey || row.id}`).digest('hex').slice(0, 24);
      packages.push({
        providerId: 'mts_business',
        accountId: source.accountId,
        packageId,
        externalPackageId: null,
        packageName: label,
        packageType: 'minutes',
        totalUnits,
        usedUnits,
        remainingUnits,
        unit: 'minutes',
        price: numberOrNull(row.amount),
        tax: numberOrNull(row.tax),
        currency: 'RUB',
        activatedAt: isoOrNull(row.occurredAt),
        periodStartedAt,
        periodEndsAt,
        status: packageStatus(periodStartedAt, periodEndsAt, remainingUnits, totalUnits, now),
        autoRenew: null,
        compatibleNumbers: [...new Set([row.msisdnMasked, latest[0]?.msisdnMasked].filter(Boolean).map(String))],
        compatibleTrunks: [],
        source: 'MTS Business API · BillingStatement',
        lastSyncedAt: source.lastSyncedAt,
        rawReference: String(row.providerEventKey || ''),
        counterId,
        counterSource: counterId && remainingUnits !== null ? 'mts_service_counter' : 'unavailable',
        warning: counterId
          ? remainingUnits === null ? 'МТС не передал данные об остатке за период пакета' : null
          : 'Счётчик МТС не удалось однозначно связать с пакетом'
      });
    }

    const activePackages = packages.filter(item => ['active', 'ending', 'depleted'].includes(item.status));
    const periods = new Set(activePackages.map(item => `${item.periodStartedAt}|${item.periodEndsAt}`));
    const commonPeriod = periods.size === 1 && activePackages.length
      ? { startedAt: activePackages[0].periodStartedAt, endsAt: activePackages[0].periodEndsAt }
      : null;
    const totalUnits = activePackages.every(item => item.totalUnits !== null)
      ? activePackages.reduce((sum, item) => sum + (item.totalUnits || 0), 0) : null;
    const usedUnits = activePackages.every(item => item.usedUnits !== null)
      ? activePackages.reduce((sum, item) => sum + (item.usedUnits || 0), 0) : null;
    const remainingUnits = activePackages.every(item => item.remainingUnits !== null)
      ? activePackages.reduce((sum, item) => sum + (item.remainingUnits || 0), 0) : null;
    const activeKeys = new Set(activePackages.map(item =>
      `${item.packageName.toLocaleLowerCase('ru-RU')}|${item.periodStartedAt}|${item.periodEndsAt}`
    ));
    const billingHistory: MtsPackageView[] = periodRows
      .map(row => {
        const periodStartedAt = isoOrNull(row.periodStartedAt);
        const periodEndsAt = isoOrNull(row.periodEndsAt);
        const label = String(row.label || 'Пакет минут');
        return {
          providerId: 'mts_business' as const,
          accountId: source.accountId,
          packageId: crypto.createHash('sha256').update(`${source.id}:history:${row.providerEventKey || row.id}`).digest('hex').slice(0, 24),
          externalPackageId: null,
          packageName: label,
          packageType: 'minutes' as const,
          totalUnits: minutesFromLabel(label),
          usedUnits: null,
          remainingUnits: null,
          unit: 'minutes' as const,
          price: numberOrNull(row.amount),
          tax: numberOrNull(row.tax),
          currency: 'RUB' as const,
          activatedAt: isoOrNull(row.occurredAt),
          periodStartedAt,
          periodEndsAt,
          status: packageStatus(periodStartedAt, periodEndsAt, null, minutesFromLabel(label), now),
          autoRenew: null,
          compatibleNumbers: row.msisdnMasked ? [String(row.msisdnMasked)] : [],
          compatibleTrunks: [],
          source: 'MTS Business API · BillingStatement',
          lastSyncedAt: source.lastSyncedAt,
          rawReference: String(row.providerEventKey || ''),
          counterId: null,
          counterSource: 'unavailable' as const,
          warning: null
        };
      })
      .filter(item => !activeKeys.has(`${item.packageName.toLocaleLowerCase('ru-RU')}|${item.periodStartedAt}|${item.periodEndsAt}`));

    const usageRows = await queryPBXPulsDb(
      `SELECT DATE(occurred_at) usageDate,package_counter_id counterId,msisdn_masked msisdnMasked,
       SUM(package_counter_used)/60 usedMinutes,COUNT(*) billedCalls,
       AVG(actual_units) averageActualSeconds
       FROM balance_usage_events
       WHERE source_id=? AND package_counter_id IS NOT NULL AND package_counter_used IS NOT NULL
         AND occurred_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 370 DAY)
       GROUP BY DATE(occurred_at),package_counter_id,msisdn_masked ORDER BY usageDate`,
      [source.id]
    );
    const usage = usageRows.map(row => ({
      date: String(row.usageDate).slice(0, 10),
      counterId: String(row.counterId),
      number: row.msisdnMasked ? String(row.msisdnMasked) : null,
      usedMinutes: numberOrNull(row.usedMinutes) || 0,
      billedCalls: Number(row.billedCalls || 0),
      averageActualSeconds: numberOrNull(row.averageActualSeconds)
    })).filter(row => activePackages.some(item =>
      item.counterId === row.counterId
      && !!item.periodStartedAt && !!item.periodEndsAt
      && Date.parse(`${row.date}T23:59:59Z`) >= Date.parse(item.periodStartedAt)
      && Date.parse(`${row.date}T00:00:00Z`) <= Date.parse(item.periodEndsAt)
    ));

    const completeDays = usage.filter(row => Date.parse(`${row.date}T23:59:59Z`) < new Date().setUTCHours(0, 0, 0, 0));
    const activeCounterIds = new Set(activePackages.map(item => item.counterId).filter(Boolean));
    const forecastRows = completeDays.filter(row => activeCounterIds.has(row.counterId));
    const distinctDays = new Set(forecastRows.map(row => row.date)).size;
    const averagePerDay = distinctDays >= 3
      ? forecastRows.reduce((sum, row) => sum + row.usedMinutes, 0) / distinctDays : null;
    const daysRemaining = commonPeriod?.endsAt
      ? Math.max(0, Math.ceil((Date.parse(commonPeriod.endsAt) - now) / 86_400_000)) : null;
    const forecastSpend = averagePerDay !== null && daysRemaining !== null ? averagePerDay * daysRemaining : null;
    const forecastRemaining = remainingUnits !== null && forecastSpend !== null ? remainingUnits - forecastSpend : null;

    return {
      calculatedAt: new Date().toISOString(),
      lastSyncedAt: validityFetchedAt || source.lastSyncedAt,
      billingPeriod: commonPeriod,
      billingPeriodReason: activePackages.length > 1 && periods.size > 1
        ? 'У активных пакетов разные подтверждённые периоды действия'
        : activePackages.length ? null : 'Активные пакеты минут не найдены',
      summary: {
        totalUnits, usedUnits, remainingUnits,
        usedPercent: totalUnits !== null && usedUnits !== null && totalUnits > 0 ? usedUnits / totalUnits * 100 : null,
        daysRemaining
      },
      activePackages,
      usage,
      forecast: averagePerDay === null || !commonPeriod ? null : {
        averagePerDay,
        projectedSpend: forecastSpend,
        projectedRemaining: forecastRemaining,
        expectedDepletionAt: remainingUnits !== null && averagePerDay > 0
          ? new Date(now + remainingUnits / averagePerDay * 86_400_000).toISOString() : null,
        confidence: distinctDays >= 14 ? 'high' : distinctDays >= 7 ? 'medium' : 'low',
        fullDays: distinctDays
      },
      availablePackages: [],
      availablePackagesReason: 'МТС Бизнес API не предоставил каталог совместимых пакетов',
      packageActions: {
        canConnect: false,
        reason: 'Подключение доступно в личном кабинете МТС'
      },
      recommendation: null,
      history: [
        ...packages.filter(item => !activePackages.some(active => active.packageId === item.packageId)),
        ...billingHistory
      ]
    };
  }
}
