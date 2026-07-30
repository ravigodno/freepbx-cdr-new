import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { maskMtsIdentifier, normalizeMtsMsisdn, type MtsBusinessProvider, type NormalizedUsageEvent } from './providers/mtsBusiness.js';
import { reconcileMtsOutgoingCall } from './reconciliation/mtsCdrReconciliation.js';

type ProviderContext = {
  provider: MtsBusinessProvider;
  config: { lookupType: 'msisdn' | 'account'; msisdn: string; accountNo: string; usageOverlapHours: number };
};

type QueryCdr = (sql: string, params: any[]) => Promise<any[]>;

const sqlDate = (value: string | null): string | null => value
  ? new Date(value).toISOString().slice(0, 19).replace('T', ' ')
  : null;
const numberOrNull = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

function utcSecond(value: unknown, code: string): string {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new Error(code);
  }
  return text;
}

function normalizedPhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
}

export function hmacPhone(value: unknown, secret: string): string | null {
  const normalized = normalizedPhone(value);
  return normalized ? crypto.createHmac('sha256', secret).update(normalized).digest('hex') : null;
}

export function buildProviderEventKey(sourceId: number, msisdn: string, event: NormalizedUsageEvent): string {
  return crypto.createHash('sha256').update(JSON.stringify([
    sourceId, msisdn, event.msisdn, event.occurredAt, event.ratedAt, event.eventType, event.productId,
    event.networkEvent, event.direction, normalizedPhone(event.counterparty), event.amount,
    event.actualUnits, event.actualUnitCode
  ])).digest('hex');
}

export function splitUsageRange(from: string, to: string, chunkHours = 24): Array<{ startDateTime: string; endDateTime: string }> {
  const result: Array<{ startDateTime: string; endDateTime: string }> = [];
  const endMs = Date.parse(to);
  const stepMs = chunkHours * 3600_000;
  for (let startMs = Date.parse(from); startMs < endMs; startMs += stepMs) {
    result.push({
      startDateTime: new Date(startMs).toISOString().slice(0, 19) + 'Z',
      endDateTime: new Date(Math.min(endMs, startMs + stepMs)).toISOString().slice(0, 19) + 'Z'
    });
  }
  return result;
}

function safeMetadata(event: NormalizedUsageEvent): string {
  return JSON.stringify({ warnings: event.warnings });
}

function chargeCategory(row: any): {
  code: 'mav' | 'marking' | 'subscription' | 'one_time' | 'sms' | 'internet' | 'payment' | 'other';
  label: string;
} {
  const service = String(row.label || '');
  if (/^ИСС\.\s*МАВ\./iu.test(service)) return { code: 'mav', label: 'Массовые вызовы' };
  if (/^ИСС\.\s*Маркировка\./iu.test(service)) return { code: 'marking', label: 'Маркировка звонков' };
  if (row.eventType === 'income') return { code: 'payment', label: 'Платёж' };
  if (row.eventType === 'periodical') return { code: 'subscription', label: 'Абонентская плата' };
  if (row.eventType === 'one_time') return { code: 'one_time', label: 'Разовая услуга' };
  if (row.eventType === 'network' && row.networkEvent === 'sms') return { code: 'sms', label: 'SMS' };
  if (row.eventType === 'network' && row.networkEvent === 'data') return { code: 'internet', label: 'Интернет' };
  return { code: 'other', label: 'Прочее списание' };
}

export class MtsUsageService {
  private readonly activeSyncSources = new Set<string>();

  constructor(
    private readonly getProviderContext: () => ProviderContext,
    private readonly hashSecret: string,
    private readonly queryCdr: QueryCdr
  ) {}

  isSyncing(sourceKey: string): boolean {
    return this.activeSyncSources.has(sourceKey);
  }

  private async sourcePk(sourceKey: string): Promise<number> {
    const rows = await queryPBXPulsDb('SELECT source_pk FROM balance_sources WHERE id=? LIMIT 1', [sourceKey]);
    const sourceId = Number(rows[0]?.source_pk || 0);
    if (!sourceId) throw new Error('balance_source_not_found');
    return sourceId;
  }

  async sync(sourceKey: string, input: { from?: string; to?: string }): Promise<{ received: number; stored: number; from: string; to: string }> {
    if (this.isSyncing(sourceKey)) throw new Error('usage_sync_in_progress');
    this.activeSyncSources.add(sourceKey);
    try {
      return await this.performSync(sourceKey, input);
    } finally {
      this.activeSyncSources.delete(sourceKey);
    }
  }

  private async performSync(sourceKey: string, input: { from?: string; to?: string }): Promise<{ received: number; stored: number; from: string; to: string }> {
    const { provider, config } = this.getProviderContext();
    const msisdn = config.lookupType === 'msisdn' ? normalizeMtsMsisdn(config.msisdn) : null;
    const accountNo = String(config.accountNo || '').trim();
    if (config.lookupType === 'account' && !accountNo) throw new Error('invalid_account_number');
    const sourceIdentity = msisdn || `account:${accountNo}`;
    const sourceId = await this.sourcePk(sourceKey);
    const cursorRows = await queryPBXPulsDb(
      'SELECT usage_last_event_at FROM balance_sources WHERE source_pk=? LIMIT 1',
      [sourceId]
    );
    const to = input.to ? utcSecond(input.to, 'invalid_usage_to') : new Date().toISOString().slice(0, 19) + 'Z';
    const cursorMs = cursorRows[0]?.usage_last_event_at
      ? Date.parse(String(cursorRows[0].usage_last_event_at).replace(' ', 'T') + 'Z') - config.usageOverlapHours * 3600_000
      : Date.parse(to) - 24 * 3600_000;
    const from = input.from
      ? utcSecond(input.from, 'invalid_usage_from')
      : new Date(cursorMs).toISOString().slice(0, 19) + 'Z';
    if (Date.parse(from) >= Date.parse(to)) throw new Error('invalid_usage_period_order');
    try {
      const events: NormalizedUsageEvent[] = [];
      for (const { startDateTime, endDateTime } of splitUsageRange(from, to)) {
        const chunk = config.lookupType === 'account'
          ? await provider.fetchUsageDetailsByAccount({ accountNo, startDateTime, endDateTime })
          : await provider.fetchUsageDetails({ msisdn: msisdn!, startDateTime, endDateTime });
        events.push(...chunk.events);
      }
      let stored = 0;
      let lastEventAt: string | null = null;
      let lastRatingAt: string | null = null;
      const callsToReconcile: Array<{
        id: number; occurredAt: string; direction: 'incoming' | 'outgoing';
        caller: string | null; callee: string | null; actualUnits: number | null;
      }> = [];
      for (const event of events) {
        const key = buildProviderEventKey(sourceId, sourceIdentity, event);
        const ownNumber = normalizedPhone(event.msisdn || msisdn);
        const interactionNumber = normalizedPhone(event.counterparty);
        const caller = event.direction === 'outgoing'
          ? ownNumber
          : event.direction === 'incoming' && interactionNumber !== ownNumber ? interactionNumber : null;
        const callee = event.direction === 'outgoing'
          ? interactionNumber
          : event.direction === 'incoming' ? ownNumber : null;
        await queryPBXPulsDb(
          `INSERT INTO balance_usage_events
           (source_id,provider_event_key,msisdn_masked,msisdn_hash,occurred_at,rated_at,event_type,network_event,direction,
            counterparty_masked,counterparty_hash,counterparty_number,caller_number,callee_number,
            amount,discount_amount,tax_amount,balance_after,billed_units,billed_unit_code,
            actual_units,actual_unit_code,category_id,product_id,network_service_id,label,package_counter_before,
            package_counter_after,package_counter_used,package_counter_id,charge_period_start,charge_period_end,raw_hash,metadata_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE rated_at=VALUES(rated_at),amount=VALUES(amount),discount_amount=VALUES(discount_amount),
            tax_amount=VALUES(tax_amount),balance_after=VALUES(balance_after),billed_units=VALUES(billed_units),
            actual_units=VALUES(actual_units),package_counter_before=VALUES(package_counter_before),
            package_counter_after=VALUES(package_counter_after),package_counter_used=VALUES(package_counter_used),
            package_counter_id=VALUES(package_counter_id),
            counterparty_number=VALUES(counterparty_number),caller_number=VALUES(caller_number),
            callee_number=VALUES(callee_number),raw_hash=VALUES(raw_hash),metadata_json=VALUES(metadata_json)`,
          [
            sourceId, key, maskMtsIdentifier(event.msisdn || msisdn), hmacPhone(event.msisdn || msisdn, this.hashSecret), sqlDate(event.occurredAt),
            sqlDate(event.ratedAt), event.eventType, event.networkEvent, event.direction,
            maskMtsIdentifier(event.counterparty), hmacPhone(event.counterparty, this.hashSecret), interactionNumber,
            caller, callee, event.amount, event.discount,
            event.tax, event.balanceAfter, event.billedUnits, event.billedUnitCode, event.actualUnits, event.actualUnitCode,
            event.categoryId, event.productId, event.networkServiceId, event.label, event.packageCounterBefore,
            event.packageCounterAfter, event.packageCounterUsed, event.packageCounterId,
            sqlDate(event.chargePeriodStart), sqlDate(event.chargePeriodEnd),
            event.rawHash, safeMetadata(event)
          ]
        );
        stored += 1;
        if (!lastEventAt || event.occurredAt > lastEventAt) lastEventAt = event.occurredAt;
        if (event.ratedAt && (!lastRatingAt || event.ratedAt > lastRatingAt)) lastRatingAt = event.ratedAt;
        if (event.eventType === 'network' && event.networkEvent === 'call' && event.direction) {
          const rows = await queryPBXPulsDb(
            'SELECT id FROM balance_usage_events WHERE source_id=? AND provider_event_key=? LIMIT 1',
            [sourceId, key]
          );
          if (rows[0]?.id) callsToReconcile.push({
            id: Number(rows[0].id), occurredAt: event.occurredAt,
            direction: event.direction, caller, callee, actualUnits: event.actualUnits
          });
        }
      }
      for (const call of callsToReconcile) {
        const match = await reconcileMtsOutgoingCall(call, this.queryCdr);
        await queryPBXPulsDb(
          `INSERT INTO balance_usage_cdr_matches
           (usage_event_id,cdr_uniqueid,cdr_linkedid,confidence,matched_by_json,time_difference_seconds,
            duration_difference_seconds,caller_number,callee_number)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE cdr_uniqueid=VALUES(cdr_uniqueid),cdr_linkedid=VALUES(cdr_linkedid),
            confidence=VALUES(confidence),matched_by_json=VALUES(matched_by_json),
            time_difference_seconds=VALUES(time_difference_seconds),duration_difference_seconds=VALUES(duration_difference_seconds),
            caller_number=VALUES(caller_number),callee_number=VALUES(callee_number)`,
          [match.usageEventId, match.cdrUniqueid, match.cdrLinkedid, match.confidence, JSON.stringify(match.matchedBy),
            match.timeDifferenceSeconds, match.durationDifferenceSeconds, match.caller, match.callee]
        );
      }
      await queryPBXPulsDb(
        `UPDATE balance_sources SET usage_last_event_at=COALESCE(?,usage_last_event_at),
         usage_last_rating_at=COALESCE(?,usage_last_rating_at),usage_last_sync_at=NOW(),usage_last_error_code=NULL WHERE source_pk=?`,
        [sqlDate(lastEventAt), sqlDate(lastRatingAt), sourceId]
      );
      return { received: events.length, stored, from, to };
    } catch (error: any) {
      await queryPBXPulsDb(
        'UPDATE balance_sources SET usage_last_sync_at=NOW(),usage_last_error_code=? WHERE source_pk=?',
        [String(error?.safeCode || error?.message || 'usage_sync_failed').slice(0, 64), sourceId]
      ).catch(() => undefined);
      throw error;
    }
  }

  async list(sourceKey: string, query: Record<string, unknown>) {
    const sourceId = await this.sourcePk(sourceKey);
    const from = utcSecond(query.from, 'invalid_usage_from');
    const to = utcSecond(query.to, 'invalid_usage_to');
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(10, Math.min(200, Number(query.pageSize) || 50));
    const conditions = ['e.source_id=?', 'e.occurred_at>=?', 'e.occurred_at<?'];
    const params: any[] = [sourceId, sqlDate(from), sqlDate(to)];
    const detailKind = String(query.detailKind || '');
    if (detailKind === 'calls') conditions.push("e.event_type='network' AND e.network_event='call'");
    if (detailKind === 'finance' || detailKind === 'charges') {
      conditions.push("NOT(e.event_type='network' AND e.network_event='call')");
      if (detailKind === 'charges') conditions.push("e.event_type<>'income'");
      conditions.push('e.amount IS NOT NULL AND e.amount<>0');
      if (String(query.chargeCategory || '') === 'mav') conditions.push("e.label LIKE 'ИСС. МАВ.%'");
      if (String(query.chargeCategory || '') === 'marking') conditions.push("e.label LIKE 'ИСС. Маркировка.%'");
    }
    if (detailKind === 'payments') conditions.push("e.event_type='income' AND e.amount IS NOT NULL AND e.amount<>0");
    const msisdnHash = String(query.msisdnHash || '');
    if (/^[a-f0-9]{64}$/.test(msisdnHash)) {
      conditions.push('e.msisdn_hash=?');
      params.push(msisdnHash);
    }
    const accountHash = String(query.accountHash || '');
    if (/^[a-f0-9]{64}$/.test(accountHash)) {
      const configuredAccount = String(this.getProviderContext().config.accountNo || '').trim();
      conditions.push(hmacPhone(configuredAccount, this.hashSecret) === accountHash ? '1=1' : '1=0');
    }
    for (const [field, column, allowed] of [
      ['eventType', 'e.event_type', ['network', 'periodical', 'one_time', 'income', 'outcome', 'unknown']],
      ['networkEvent', 'e.network_event', ['call', 'sms', 'data']],
      ['direction', 'e.direction', ['incoming', 'outgoing']]
    ] as const) {
      const value = String(query[field] || '');
      if (value && (allowed as readonly string[]).includes(value)) {
        conditions.push(`${column}=?`);
        params.push(value);
      }
    }
    const count = await queryPBXPulsDb(`SELECT COUNT(*) total FROM balance_usage_events e WHERE ${conditions.join(' AND ')}`, params);
    const rows = await queryPBXPulsDb(
      `SELECT e.id,e.occurred_at occurredAt,e.rated_at ratedAt,e.event_type eventType,e.network_event networkEvent,
       e.direction,e.counterparty_masked counterpartyMasked,e.counterparty_number counterparty,
       COALESCE(m.caller_number,e.caller_number) callerNumber,COALESCE(m.callee_number,e.callee_number) calleeNumber,
       e.amount,e.discount_amount discount,e.tax_amount tax,
       e.balance_after balanceAfter,e.billed_units billedUnits,e.billed_unit_code billedUnitCode,e.actual_units actualUnits,
       e.actual_unit_code actualUnitCode,e.category_id categoryId,e.label,e.package_counter_before packageCounterBefore,
       e.package_counter_after packageCounterAfter,e.package_counter_used packageCounterUsed,
       COALESCE(m.confidence,'unmatched') reconciliationStatus
       FROM balance_usage_events e LEFT JOIN balance_usage_cdr_matches m ON m.usage_event_id=e.id
       WHERE ${conditions.join(' AND ')} ORDER BY e.occurred_at DESC,e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params
    );
    return {
      rows: rows.map(row => {
        const category = chargeCategory(row);
        return {
        ...row, chargeCategory: category.code, chargeCategoryLabel: category.label,
        auditStatus: row.eventType === 'network' && row.networkEvent === 'call'
          ? ['exact', 'high'].includes(row.reconciliationStatus) ? 'confirmed'
            : row.reconciliationStatus === 'medium' ? 'likely' : 'review'
          : row.eventType === 'income' ? 'confirmed'
            : ['periodical', 'network'].includes(row.eventType) ? 'expected' : 'review',
        auditReason: row.eventType === 'network' && row.networkEvent === 'call'
          ? row.reconciliationStatus === 'exact' ? 'Звонок точно найден в CDR по времени, номеру и длительности'
            : row.reconciliationStatus === 'high' ? 'Звонок найден в CDR с высокой уверенностью'
              : row.reconciliationStatus === 'medium' ? 'Есть вероятное совпадение в CDR — рекомендуется проверка'
                : 'Соответствующий звонок в CDR не найден'
          : row.eventType === 'income' ? 'Поступление средств по данным оператора'
            : row.eventType === 'periodical' ? 'Регулярное начисление оператора за указанный период'
              : row.eventType === 'network' ? 'Сетевая услуга оператора, не являющаяся звонком'
                : 'Разовое или прочее списание — рекомендуется проверить основание',
        amount: numberOrNull(row.amount), discount: numberOrNull(row.discount), tax: numberOrNull(row.tax),
        balanceAfter: numberOrNull(row.balanceAfter), billedUnits: numberOrNull(row.billedUnits),
        actualUnits: numberOrNull(row.actualUnits), packageCounterBefore: numberOrNull(row.packageCounterBefore),
        packageCounterAfter: numberOrNull(row.packageCounterAfter), packageCounterUsed: numberOrNull(row.packageCounterUsed)
      };
      }),
      total: Number(count[0]?.total || 0), page, pageSize
    };
  }

  async summary(sourceKey: string, query: Record<string, unknown>) {
    const sourceId = await this.sourcePk(sourceKey);
    const from = utcSecond(query.from, 'invalid_usage_from');
    const to = utcSecond(query.to, 'invalid_usage_to');
    const conditions = ['source_id=?', 'occurred_at>=?', 'occurred_at<?'];
    const params: any[] = [sourceId, sqlDate(from), sqlDate(to)];
    const detailKind = String(query.detailKind || '');
    if (detailKind === 'calls') conditions.push("event_type='network' AND network_event='call'");
    if (detailKind === 'finance' || detailKind === 'charges') {
      conditions.push("NOT(event_type='network' AND network_event='call')");
      if (detailKind === 'charges') conditions.push("event_type<>'income'");
      conditions.push('amount IS NOT NULL AND amount<>0');
    }
    if (detailKind === 'payments') conditions.push("event_type='income' AND amount IS NOT NULL AND amount<>0");
    const msisdnHash = String(query.msisdnHash || '');
    if (/^[a-f0-9]{64}$/.test(msisdnHash)) {
      conditions.push('msisdn_hash=?');
      params.push(msisdnHash);
    }
    const accountHash = String(query.accountHash || '');
    if (/^[a-f0-9]{64}$/.test(accountHash)) {
      const configuredAccount = String(this.getProviderContext().config.accountNo || '').trim();
      conditions.push(hmacPhone(configuredAccount, this.hashSecret) === accountHash ? '1=1' : '1=0');
    }
    const rows = await queryPBXPulsDb(
      `SELECT
       COUNT(*) operationCount,
       SUM(CASE WHEN event_type<>'income' THEN amount ELSE 0 END) totalCharges,
       SUM(CASE WHEN event_type='network' AND network_event='call' THEN amount ELSE 0 END) callCharges,
       SUM(CASE WHEN event_type='network' AND network_event='sms' THEN amount ELSE 0 END) smsCharges,
       SUM(CASE WHEN event_type='network' AND network_event='data' THEN amount ELSE 0 END) internetCharges,
       SUM(CASE WHEN event_type='periodical' THEN amount ELSE 0 END) periodicCharges,
       SUM(CASE WHEN event_type='one_time' THEN amount ELSE 0 END) oneTimeCharges,
       SUM(CASE WHEN event_type='income' THEN amount ELSE 0 END) incomeAmount,
       SUM(CASE WHEN event_type='outcome' THEN amount ELSE 0 END) outcomeAmount,
       SUM(event_type='network' AND network_event='call') callCount,
       SUM(event_type='network' AND network_event='call' AND direction='incoming') incomingCallCount,
       SUM(event_type='network' AND network_event='call' AND direction='outgoing') outgoingCallCount,
       SUM(CASE WHEN event_type='network' AND network_event='call' THEN actual_units ELSE 0 END) actualCallSeconds,
       SUM(CASE WHEN event_type='network' AND network_event='call' THEN billed_units ELSE 0 END) billedCallUnits,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND amount=0 AND package_counter_used>0 THEN actual_units ELSE 0 END) packageCallSeconds,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND amount<>0 THEN actual_units ELSE 0 END) paidCallSeconds,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND EXISTS(
         SELECT 1 FROM balance_usage_cdr_matches m WHERE m.usage_event_id=balance_usage_events.id AND m.confidence IN('exact','high')
       ) THEN amount ELSE 0 END) confirmedCallCharges,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND EXISTS(
         SELECT 1 FROM balance_usage_cdr_matches m WHERE m.usage_event_id=balance_usage_events.id AND m.confidence='medium'
       ) THEN amount ELSE 0 END) likelyCallCharges,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND NOT EXISTS(
         SELECT 1 FROM balance_usage_cdr_matches m WHERE m.usage_event_id=balance_usage_events.id AND m.confidence IN('exact','high','medium')
       ) THEN amount ELSE 0 END) unmatchedCallCharges,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND EXISTS(
         SELECT 1 FROM balance_usage_cdr_matches m WHERE m.usage_event_id=balance_usage_events.id AND m.confidence IN('exact','high')
       ) THEN 1 ELSE 0 END) confirmedCallCount,
       SUM(CASE WHEN event_type='network' AND network_event='call' AND NOT EXISTS(
         SELECT 1 FROM balance_usage_cdr_matches m WHERE m.usage_event_id=balance_usage_events.id AND m.confidence IN('exact','high','medium')
       ) THEN 1 ELSE 0 END) unmatchedCallCount,
       SUM(CASE WHEN event_type='periodical' OR (event_type='network' AND network_event<>'call') THEN amount ELSE 0 END) expectedServiceCharges,
       SUM(CASE WHEN event_type IN('one_time','outcome','unknown') THEN amount ELSE 0 END) reviewServiceCharges,
       MIN(occurred_at) firstEventAt,MAX(occurred_at) lastEventAt
       FROM balance_usage_events WHERE ${conditions.join(' AND ')}`,
      params
    );
    const row = rows[0] || {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) =>
      key.endsWith('At') ? [key, value ?? null] : [key, numberOrNull(value) ?? 0]
    ));
  }
}
