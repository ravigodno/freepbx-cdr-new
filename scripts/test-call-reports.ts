import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateCallStatistics, calculateSla, normalizeReportType } from '../server/callIntelligence/reports.js';

const rows=[
  {calldate:'2026-07-21 10:00:00',src:'100',dst:'200',dcontext:'from-internal',duration:40,billsec:35,disposition:'ANSWERED',uniqueid:'1.1',linkedid:'1.1'},
  {calldate:'2026-07-21 11:00:00',src:'100',dst:'79990000000',dcontext:'from-internal',duration:20,billsec:0,disposition:'FAILED',uniqueid:'2.1',linkedid:'2.1'},
  {calldate:'2026-07-21 12:00:00',src:'79990000000',dst:'600',did:'8412',dcontext:'ext-queues',lastapp:'Queue',duration:45,billsec:25,disposition:'ANSWERED',uniqueid:'3.1',linkedid:'3.1'},
  {calldate:'2026-07-21 13:00:00',src:'79990000001',dst:'600',did:'8412',dcontext:'ext-queues',lastapp:'Queue',duration:35,billsec:0,disposition:'NOANSWER',uniqueid:'4.1',linkedid:'4.1'}
];
const stats=calculateCallStatistics(rows);
assert.deepEqual(stats,{total:4,incoming:2,outgoing:1,internal:1,answered:2,missed:1,failed:1,problemRate:50});
const sla=calculateSla(rows);
assert.equal(sla.available,true);assert.equal(sla.averageWaitSeconds,20);assert.equal(sla.answeredWithinTargetPercent,100);assert.equal(sla.lostAfterTarget,1);assert.equal(sla.status,'ok');
assert.equal(calculateSla(rows.filter(r=>r.lastapp!=='Queue')).status,'insufficient_data');
for(const type of ['daily','weekly','technical','management'])assert.equal(normalizeReportType(type),type);
assert.equal(normalizeReportType('bad'),'daily');

const router=fs.readFileSync('server/callIntelligence/router.ts','utf8'),ui=fs.readFileSync('src/modules/monitoring/tabs/monitoring/CallIntelligencePanel.tsx','utf8'),service=fs.readFileSync('server/callIntelligence/reports.ts','utf8');
for(const type of ['daily','weekly','technical','management'])assert(router.includes(`'${type}'`));
assert(router.includes("check(req, 'view_call_intelligence')"));
assert(router.includes('/reports/:type/export'));
assert(ui.includes('Call Intelligence Reports'));assert(ui.includes('JSON export'));
assert(service.includes('buildCallIntelligenceInsights'));
assert(service.includes("pdf:false,email:false,telegram:false"));
assert(!/Math\.random|mock report|demo report/i.test(service));
console.log('Call reports tests: OK');
