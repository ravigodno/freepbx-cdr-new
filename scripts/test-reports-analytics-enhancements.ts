import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateAnsweredIncomingMetrics } from '../server/reportIncomingMetrics.js';
import { buildUniqueNumbersSql, escapeReportCsv, normalizeReportExternalPhone } from '../server/reportUniqueNumbers.js';

const rows = [
  { direction: 'incoming', disposition: 'ANSWERED', duration: 20, billsec: 10 },
  { direction: 'incoming', disposition: 'ANSWERED', duration: 50, billsec: 30 },
  { direction: 'incoming', disposition: 'ANSWERED', duration: 5, billsec: 10 },
  { direction: 'incoming', disposition: 'NO ANSWER', duration: 30, billsec: 0 },
  { direction: 'outgoing', disposition: 'ANSWERED', duration: 99, billsec: 90 }
];
const metrics = calculateAnsweredIncomingMetrics(
  rows,
  row => row.direction === 'incoming',
  row => String(row.disposition) === 'ANSWERED' ? Math.max(0, Number(row.duration) - Number(row.billsec)) : null
);
assert.deepEqual(metrics, {
  answeredAverageWaitSeconds: 10,
  answeredMedianWaitSeconds: 10,
  averageTalkSeconds: 17,
  totalTalkSeconds: 50,
  waitCalculationSource: 'duration_minus_billsec'
});
assert.equal(calculateAnsweredIncomingMetrics(rows.slice(0, 2), row => row.direction === 'incoming', row => row.duration - row.billsec).answeredMedianWaitSeconds, 15);
assert.equal(calculateAnsweredIncomingMetrics([], () => true, () => null).answeredAverageWaitSeconds, null);

assert.equal(normalizeReportExternalPhone('+7 (978) 123-45-67'), '79781234567');
assert.equal(normalizeReportExternalPhone('8 978 123-45-67'), '79781234567');
assert.equal(normalizeReportExternalPhone('anonymous'), '');
assert.equal(normalizeReportExternalPhone('100'), '');
assert.equal(escapeReportCsv('ООО "Ромашка"; тест'), '"ООО ""Ромашка""; тест"');

const incomingPlan = buildUniqueNumbersSql('incoming', {
  startDate: '2026-07-01', endDate: '2026-07-26', startTime: '00:00', endTime: '23:59',
  extensions: ['100'], search: '7978', status: 'answered', trunk: 'all', queue: 'all'
});
assert.match(incomingPlan.sql, /GROUP BY logical_id/);
assert.match(incomingPlan.sql, /GROUP BY external_number/);
assert.match(incomingPlan.sql, /LIMIT 20000/);
assert.match(incomingPlan.sql, /answered=1/);
assert.ok(incomingPlan.params.includes('%7978%'));

const inbound = fs.readFileSync('src/components/reports/dashboard/InboundDashboard.tsx', 'utf8');
const outbound = fs.readFileSync('src/components/reports/dashboard/OutgoingDashboard.tsx', 'utf8');
const chart = fs.readFileSync('src/components/reports/dashboard/OverviewCallDynamicsChart.tsx', 'utf8');
const heatmap = fs.readFileSync('src/components/reports/dashboard/CallHeatmap.tsx', 'utf8');
const route = fs.readFileSync('server/reportUniqueNumbers.ts', 'utf8');
assert.match(inbound, /Среднее ожидание/);
assert.match(inbound, /Медиана ожидания/);
assert.match(inbound, /Экспорт уникальных номеров|UniqueNumbersExportButton/);
assert.match(outbound, /UniqueNumbersExportButton/);
assert.match(outbound, /<CallHeatmap/);
assert.match(outbound, /Показатель тепловой карты исходящих/);
assert.doesNotMatch(outbound, /rgba\(37,99,235/);
assert.match(heatmap, /headerAction/);
assert.match(heatmap, /Низкая/);
assert.match(heatmap, /Высокая/);
assert.match(chart, /lg:grid-cols-\[minmax\(0,1fr\)_190px\]/);
assert.match(chart, /aria-label="Серии графика"/);
assert.match(chart, /yAxisId="sla"/);
assert.match(route, /res\.write\('\\uFEFF'\)/);
assert.match(route, /bulkLookup\(/);
assert.match(route, /view_reports/);

console.log(JSON.stringify({
  incomingMetrics: metrics,
  phoneNormalization: 'ok',
  uniqueExport: { logicalAggregation: true, streaming: true, bulkLookup: true, rbac: true },
  chartControls: { desktopRight: true, responsiveGrid: true, dualAxis: true }
}));
