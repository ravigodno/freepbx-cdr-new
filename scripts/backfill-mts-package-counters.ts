import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { queryPBXPulsDb } from '../server/pbxpulsDb.js';
import { MTS_BUSINESS_SOURCE_ID, MtsBusinessBalanceService } from '../server/balance/mtsBusinessService.js';
import { buildProviderEventKey } from '../server/balance/mtsUsageService.js';
import { parseMtsBusinessUsagePayload } from '../server/balance/providers/mtsBusiness.js';

const directory = path.join(process.cwd(), 'mts-business-raw-api-2026-07-01--2026-07-30');
if (!fs.existsSync(directory)) throw new Error('mts_raw_directory_not_found');
const sourceRows = await queryPBXPulsDb('SELECT source_pk FROM balance_sources WHERE id=? LIMIT 1', [MTS_BUSINESS_SOURCE_ID]);
const sourceId = Number(sourceRows[0]?.source_pk || 0);
if (!sourceId) throw new Error('balance_source_not_found');

const balance = new MtsBusinessBalanceService(process.env.JWT_SECRET || 'asterisk-cdr-secret-key-132');
await balance.refreshSettings();
const config = balance.getUsageProvider().config;
const sourceIdentity = config.lookupType === 'account' ? `account:${config.accountNo}` : config.msisdn;
let identified = 0;
let updated = 0;
for (const filename of fs.readdirSync(directory).filter(item => item.endsWith('.json')).sort()) {
  const raw = fs.readFileSync(path.join(directory, filename), 'utf8');
  const payload = JSON.parse(raw);
  for (const event of parseMtsBusinessUsagePayload(payload, raw)) {
    if (!event.packageCounterId) continue;
    identified += 1;
    const key = buildProviderEventKey(sourceId, sourceIdentity, event);
    const result: any = await queryPBXPulsDb(
      `UPDATE balance_usage_events SET package_counter_id=?
       WHERE source_id=? AND provider_event_key=? AND package_counter_id IS NULL`,
      [event.packageCounterId, sourceId, key]
    );
    updated += Number(result?.affectedRows || 0);
  }
}
console.log(JSON.stringify({ identified, updated }));
process.exit(0);
