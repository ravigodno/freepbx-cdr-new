import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeQualityMetrics } from '../server/qualityMetrics.js';
import { averageMetric, compareNullableMetrics, formatMetric } from '../src/modules/monitoring/qualityPresentation.js';

const onlineNoRtcp=normalizeQualityMetrics({status:'Online',ip:'192.0.2.1',rtt:28});
assert.equal(onlineNoRtcp.isRegistered,true);
assert.equal(onlineNoRtcp.availabilityStatus,'online');
assert.equal(onlineNoRtcp.qualityStatus,'insufficient_data');
assert.equal(onlineNoRtcp.sipRttMs,28);
assert.equal(onlineNoRtcp.jitterMs,null);
assert.equal(onlineNoRtcp.rtpLossPercent,null);
assert.equal(onlineNoRtcp.mos,null);
assert.equal(onlineNoRtcp.rtcpAvailable,false);
assert.equal(onlineNoRtcp.metricsSource,'sip_rtt');
assert.equal(onlineNoRtcp.statusReason,'rtcp_unavailable');

const offline=normalizeQualityMetrics({status:'Offline'});
assert.equal(offline.isRegistered,false);
assert.equal(offline.availabilityStatus,'offline');
assert.equal(offline.statusReason,'endpoint_unregistered');
assert.equal(offline.sipRttMs,null);

const zeros=normalizeQualityMetrics({status:'Online',jitter:0,rtpLoss:0,mos:null});
assert.equal(zeros.jitterMs,0);
assert.equal(zeros.rtpLossPercent,0);
assert.equal(zeros.mos,null);
assert.equal(zeros.rtcpAvailable,true);
assert.equal(zeros.qualityStatus,'good');
assert.equal(formatMetric(0,' %'),'0 %');
assert.equal(formatMetric(null,' %'),'Нет RTCP');

const healthy=normalizeQualityMetrics({status:'Online',rtcpAvailable:true,jitter:4,rtpLoss:0,mos:4.31});
assert.equal(healthy.qualityStatus,'good');
assert.equal(healthy.metricsSource,'rtcp');
const degraded=normalizeQualityMetrics({status:'Online',jitter:35,rtpLoss:4,mos:3.2});
assert.equal(degraded.qualityStatus,'critical');

assert.equal(averageMetric([{v:null},{v:0},{v:10}],row=>row.v),5);
assert.equal(averageMetric([{v:null}],row=>row.v),null);
assert(compareNullableMetrics(0,null,'asc')<0);
assert(compareNullableMetrics(10,2,'asc')>0);
assert(compareNullableMetrics(10,2,'desc')<0);

const server=fs.readFileSync('server.ts','utf8');
const ui=fs.readFileSync('src/modules/monitoring/tabs/monitoring/QualityTab.tsx','utf8');
for(const field of ['registrationStatus','isRegistered','availabilityStatus','qualityStatus','sipRttMs','jitterMs','rtpLossPercent','rtcpAvailable','metricsAvailable','metricsSource','statusReason','lastSeenAt']) assert(server.includes(field)||fs.readFileSync('server/qualityMetrics.ts','utf8').includes(field),`DTO field missing: ${field}`);
assert(ui.includes("point.metricsSource === 'synthetic_legacy'"),'synthetic legacy history must be isolated');
assert(ui.includes('Архивный расчётный MOS — не RTCP'),'legacy calculated history must be clearly labelled');
assert(server.includes('legacyCalculatedHistory'),'quality API must expose legacy provenance explicitly');
assert(ui.includes('За выбранный период реальных RTCP-метрик нет'),'RTCP chart empty state missing');
assert(!server.includes('calculatedMos = 4.41')||server.includes('if (!isDemo) return'),'production MOS must not be calculated from SIP RTT');

console.log('Quality DTO and presentation tests: OK');
