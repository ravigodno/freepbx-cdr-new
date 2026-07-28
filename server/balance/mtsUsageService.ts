import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { maskMtsIdentifier, normalizeMtsMsisdn, type MtsBusinessProvider, type NormalizedUsageEvent } from './providers/mtsBusiness.js';
import { reconcileMtsOutgoingCall } from './reconciliation/mtsCdrReconciliation.js';

type ProviderContext = {
  provider: MtsBusinessProvider;
  config: { msisdn: string; usageOverlapHours: number };
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
    sourceId, msisdn, event.occurredAt, event.ratedAt, event.eventType, event.productId,
    event.networkEvent, event.direction, normalizedPhone(event.counterparty), event.amount,
    event.actualUnits, event.actualUnitCode
  ])).digest('hex');
}

function safeMetadata(event: NormalizedUsageEvent): string {
  return JSON.stringify({ warnings: event.warnings });
}

export class MtsUsageService {
  constructor(
    private readonly getProviderContext: () => ProviderContext,
    private readonly hashSecret: string,
    private readonly queryCdr: QueryCdr
  ) {}

  private async sourcePk(sourceKey: string): Promise<number> {
    const rows = await queryPBXPulsDb('SELECT source_pk FROM balance_sources WHERE id=? LIMIT 1', [sourceKey]);
    const sourceId = Number(rows[0]?.source_pk || 0);
    if (!sourceId) throw new Error('balance_source_not_found');
    return sourceId;
  }

  async sync(sourceKey: string, input: { from?: string; to?: string }): Promise<{ received: number; stored: number; from: string; to: string }> {
    const { provider, config } = this.getProviderContext();
    const msisdn = normalizeMtsMsisdn(config.msisdn);
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
      const result = await provider.fetchUsageDetails({ msisdn, startDateTime: from, endDateTime: to });
      let stored = 0;
      let lastEventAt: string | null = null;
      let lastRatingAt: string | null = null;
      const callsToReconcile: Array<{ id: number; occurredAt: string; counterparty: string | null; actualUnits: number | null }> = [];
      for (const event of result.events) {
        const key = buildProviderEventKey(sourceId, msisdn, event);
        await queryPBXPulsDb(
          `INSERT INTO balance_usage_events
           (source_id,provider_event_key,msisdn_masked,msisdn_hash,occurred_at,rated_at,event_type,network_event,direction,
            counterparty_masked,counterparty_hash,amount,discount_amount,tax_amount,balance_after,billed_units,billed_unit_code,
            actual_units,actual_unit_code,category_id,product_id,network_service_id,label,package_counter_before,
            package_counter_after,package_counter_used,charge_period_start,charge_period_end,raw_hash,metadata_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE rated_at=VALUES(rated_at),amount=VALUES(amount),discount_amount=VALUES(discount_amount),
            tax_amount=VALUES(tax_amount),balance_after=VALUES(balance_after),billed_units=VALUES(billed_units),
            actual_units=VALUES(actual_units),package_counter_before=VALUES(package_counter_before),
            package_counter_after=VALUES(package_counter_after),package_counter_used=VALUES(package_counter_used),
            raw_hash=VALUES(raw_hash),metadata_json=VALUES(metadata_json)`,
          [
            sourceId, key, maskMtsIdentifier(msisdn), hmacPhone(msisdn, this.hashSecret), sqlDate(event.occurredAt),
            sqlDate(event.ratedAt), event.eventType, event.networkEvent, event.direction,
            maskMtsIdentifier(event.counterparty), hmacPhone(event.counterparty, this.hashSecret), event.amount, event.discount,
            event.tax, event.balanceAfter, event.billedUnits, event.billedUnitCode, event.actualUnits, event.actualUnitCode,
            event.categoryId, event.productId, event.networkServiceId, event.label, event.packageCounterBefore,
            event.packageCounterAfter, event.packageCounterUsed, sqlDate(event.chargePeriodStart), sqlDate(event.chargePeriodEnd),
            event.rawHash, safeMetadata(event)
          ]
        );
        stored += 1;
        if (!lastEventAt || event.occurredAt > lastEventAt) lastEventAt = event.occurredAt;
        if (event.ratedAt && (!lastRatingAt || event.ratedAt > lastRatingAt)) lastRatingAt = event.ratedAt;
        if (event.eventType === 'network' && event.networkEvent === 'call' && event.direction === 'outgoing') {
          const rows = await queryPBXPulsDb(
            'SELECT id FROM balance_usage_events WHERE source_id=? AND provider_event_key=? LIMIT 1',
            [sourceId, key]
          );
          if (rows[0]?.id) callsToReconcile.push({
            id: Number(rows[0].id), occurredAt: event.occurredAt,
            counterparty: event.counterparty, actualUnits: event.actualUnits
          });
        }
      }
      for (const call of callsToReconcile) {
        const match = await reconcileMtsOutgoingCall(call, this.queryCdr);
        await queryPBXPulsDb(
          `INSERT INTO balance_usage_cdr_matches
           (usage_event_id,cdr_uniqueid,cdr_linkedid,confidence,matched_by_json,time_difference_seconds,duration_difference_seconds)
           VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE cdr_uniqueid=VALUES(cdr_uniqueid),cdr_linkedid=VALUES(cdr_linkedid),
            confidence=VALUES(confidence),matched_by_json=VALUES(matched_by_json),
            time_difference_seconds=VALUES(time_difference_seconds),duration_difference_seconds=VALUES(duration_difference_seconds)`,
          [match.usageEventId, match.cdrUniqueid, match.cdrLinkedid, match.confidence, JSON.stringify(match.matchedBy), match.timeDifferenceSeconds, match.durationDifferenceSeconds]
        );
      }
      await queryPBXPulsDb(
        `UPDATE balance_sources SET usage_last_event_at=COALESCE(?,usage_last_event_at),
         usage_last_rating_at=COALESCE(?,usage_last_rating_at),usage_last_sync_at=NOW(),usage_last_error_code=NULL WHERE source_pk=?`,
        [sqlDate(lastEventAt), sqlDate(lastRatingAt), sourceId]
      );
      return { received: result.events.length, stored, from, to };
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
       e.direction,e.counterparty_masked counterpartyMasked,e.amount,e.discount_amount discount,e.tax_amount tax,
       e.balance_after balanceAfter,e.billed_units billedUnits,e.billed_unit_code billedUnitCode,e.actual_units actualUnits,
       e.actual_unit_code actualUnitCode,e.category_id categoryId,e.label,e.package_counter_before packageCounterBefore,
       e.package_counter_after packageCounterAfter,e.package_counter_used packageCounterUsed,
       COALESCE(m.confidence,'unmatched') reconciliationStatus
       FROM balance_usage_events e LEFT JOIN balance_usage_cdr_matches m ON m.usage_event_id=e.id
       WHERE ${conditions.join(' AND ')} ORDER BY e.occurred_at DESC,e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params
    );
    return {
      rows: rows.map(row => ({
        ...row,
        amount: numberOrNull(row.amount), discount: numberOrNull(row.discount), tax: numberOrNull(row.tax),
        balanceAfter: numberOrNull(row.balanceAfter), billedUnits: numberOrNull(row.billedUnits),
        actualUnits: numberOrNull(row.actualUnits), packageCounterBefore: numberOrNull(row.packageCounterBefore),
        packageCounterAfter: numberOrNull(row.packageCounterAfter), packageCounterUsed: numberOrNull(row.packageCounterUsed)
      })),
      total: Number(count[0]?.total || 0), page, pageSize
    };
  }

  async summary(sourceKey: string, query: Record<string, unknown>) {
    const sourceId = await this.sourcePk(sourceKey);
    const from = utcSecond(query.from, 'invalid_usage_from');
    const to = utcSecond(query.to, 'invalid_usage_to');
    const rows = await queryPBXPulsDb(
      `SELECT
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
       MIN(occurred_at) firstEventAt,MAX(occurred_at) lastEventAt
       FROM balance_usage_events WHERE source_id=? AND occurred_at>=? AND occurred_at<?`,
      [sourceId, sqlDate(from), sqlDate(to)]
    );
    const row = rows[0] || {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) =>
      key.endsWith('At') ? [key, value ?? null] : [key, numberOrNull(value) ?? 0]
    ));
  }
}
