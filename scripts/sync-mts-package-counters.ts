import 'dotenv/config';
import { MTS_BUSINESS_SOURCE_ID, MtsBusinessBalanceService } from '../server/balance/mtsBusinessService.js';
import { MtsUsageService } from '../server/balance/mtsUsageService.js';

const secret = process.env.JWT_SECRET || 'asterisk-cdr-secret-key-132';
const balance = new MtsBusinessBalanceService(secret);
await balance.refreshSettings();
const usage = new MtsUsageService(
  () => balance.getUsageProvider(),
  secret,
  async () => []
);
const to = new Date().toISOString().slice(0, 19) + 'Z';
const from = new Date(Date.parse(to) - 20 * 86_400_000).toISOString().slice(0, 19) + 'Z';
const result = await usage.sync(MTS_BUSINESS_SOURCE_ID, { from, to });
console.log(JSON.stringify({ received: result.received, stored: result.stored, from: result.from, to: result.to }));
