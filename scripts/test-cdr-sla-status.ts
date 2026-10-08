import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { classifyMissedCallResolution } from '../server/missedCallResolution.js';
import { resolveMissedCallCallbackSlaMinutes } from '../shared/missedCallCallbackSla.js';
import { CDRStatusCell } from '../src/modules/cdr/components/CDRStatusCell.js';

const missedMs = Date.parse('2026-10-08T10:00:00Z');
const settings = { missedCallCallbackSlaMinutes: 5, callbackKpiMinutes: 60, answerSlaSeconds: 20 };
const classify = (seconds: number) => classifyMissedCallResolution({ missedMs, nowMs: missedMs + 3600000,
  callbackWindowMs: resolveMissedCallCallbackSlaMinutes(settings) * 60000, processedAtMs: missedMs + seconds * 1000 });
const badge = (callbackStatus: any, wasKpiResolved: boolean) => renderToStaticMarkup(React.createElement(CDRStatusCell,
  { isMissed: true, callDisp: 'NO ANSWER', processed: true, isProcessed: true, wasCallbacked: true,
    wasKpiResolved, callbackTime: '10:09', callbackStatus }));
assert.equal(classify(300).status, 'processed_in_sla');
assert.equal(classify(301).status, 'processed_late');
assert.equal(classify(540).status, 'processed_late');
assert.equal(classifyMissedCallResolution({ missedMs, nowMs: missedMs + 3600000,
  callbackWindowMs: resolveMissedCallCallbackSlaMinutes({ ...settings, missedCallCallbackSlaMinutes: 10 }) * 60000,
  processedAtMs: missedMs + 540000 }).status, 'processed_in_sla', 'Changing the configured SLA changes the result');
assert.equal(resolveMissedCallCallbackSlaMinutes({ ...settings, answerSlaSeconds: 300, callbackKpiMinutes: 999 }), 5,
  'Answer SLA and legacy KPI must not override the configured callback SLA');
const late = badge(classify(540).status, true);
assert.match(late, /text-rose-/);
assert.doesNotMatch(late, /text-emerald-/);
assert.match(late, /превышен/);
const onTime = badge(classify(300).status, false);
assert.match(onTime, /text-emerald-/);
assert.match(onTime, /соблюден/);
assert.doesNotMatch(badge('pending_callback', true), /Обработан/);
assert.match(badge('not_called_back', true), /Потерян/);
console.log('CDR callback SLA status: passed');
