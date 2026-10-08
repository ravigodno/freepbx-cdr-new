import assert from 'node:assert/strict';
import { enrichMissedRouteResponsibility } from '../server/calls/missedRouteResponsibility.js';
import { callMatchesExtensions } from '../server/departmentCallAccess.js';
import { buildCallRouteView } from '../src/modules/cdr/utils/buildCallRouteView.js';
import { buildCdrLogicalNumberScope } from '../server/reportCdrScope.js';

const base = { uniqueid: '1791469196.14076', linkedid: '1791469196.14076', src: '79215693128', dst: 's',
  dcontext: 'app-announcement-5', disposition: 'ANSWERED', billsec: 4, dstchannel: '' };
let destinations: Record<string, string> = { '5': 'from-did-direct,692,1', '6': 'from-did-direct,692,1', '7': 'app-announcement,7,1' };
const query = async (sql: string, params: any[]) => {
  if (sql.includes('asterisk.announcement')) return destinations[params[0]] ? [{ post_dest: destinations[params[0]], return_ivr: 0 }] : [];
  if (sql.includes('asterisk.ringgroups')) return [{ grplist: '692-781-79991234567#' }];
  if (sql.includes('asterisk.queues_details')) return [{ data: 'Local/692@from-queue/n,0' }, { data: 'PJSIP/781,0' }];
  if (sql.includes('asterisk.ivr_details')) return [{ timeout_destination: 'from-did-direct,692,1', timeout_ivr_ret: 0 }];
  if (sql.includes('asterisk.ivr_entries')) return params[1] === '2' ? [{ dest: 'from-did-direct,781,1' }] : [];
  if (sql.includes('asterisk.users')) return params.map(extension => ({ extension, name: extension === '692' ? 'Деркач А.И.' : 'Сотрудник' }));
  throw Error('Unexpected query');
};
const row: any = { ...base };
await enrichMissedRouteResponsibility([row], query);
assert.deepEqual(row.routeResponsibleExts, ['692']);
assert.equal(row.missedExts, undefined, 'Responsibility must not invent a ringing leg');
assert.equal(callMatchesExtensions(row, ['692']), true);
assert.equal(callMatchesExtensions(row, ['781']), false);
assert.equal(callMatchesExtensions(row, []), false);
const route = buildCallRouteView({ timeline: [row], routeResponsiblePeople: row.routeResponsiblePeople, routeAnalysis: { direction: 'inbound', steps: [{ type: 'announcement', destination: row.dcontext }] } });
assert.equal(route.anyAnswered, false);
assert.match(route.resultText, /^Пропущен\./);
assert.match(route.resultText, /Деркач А.И. \(692\)/);
assert.match(route.resultText, /вызов сотруднику не подтверждён/);
for (const [destination, expected] of [['app-announcement,6,1', ['692']], ['ext-group,600,1', ['692', '781']], ['ext-queues,700,1', ['692', '781']], ['app-announcement,7,1', []], ['timeconditions,3,1', []]] as const) {
  destinations['5'] = destination;
  const call: any = { ...base };
  await enrichMissedRouteResponsibility([call], query);
  assert.deepEqual(call.routeResponsibleExts || [], expected);
}
for (const [dst, expected] of [['s', '692'], ['2', '781']] as const) {
  const call: any = { ...base, dcontext: 'ivr-1', dst };
  await enrichMissedRouteResponsibility([call], query);
  assert.deepEqual(call.routeResponsibleExts, [expected]);
}
destinations['5'] = 'from-did-direct,692,1';
for (const call of [{ ...base, dstchannel: 'SIP/781-00001' }, { ...base, missedExts: ['781'] }, { ...base, src: '100' }]) {
  await enrichMissedRouteResponsibility([call], query);
  assert.equal((call as any).routeResponsibleExts, undefined);
}
const failed: any = { ...base };
await enrichMissedRouteResponsibility([failed], async () => { throw Error('DB unavailable'); });
assert.equal(failed.routeResponsibleExts, undefined, 'Lookup failure must not grant access');
assert.match(buildCdrLogicalNumberScope('1=1', [], '692').whereSql, /app-announcement/);
assert.doesNotMatch(buildCdrLogicalNumberScope('1=1', [], '79215693128').whereSql, /app-announcement/);
console.log('Route responsibility: direct, group, queue, IVR, cycles, access isolation and historical evidence passed');
