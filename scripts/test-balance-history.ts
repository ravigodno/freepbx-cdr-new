import assert from 'node:assert/strict';
import {buildBalanceHistory,getEnabledBalanceHistory} from '../server/balance/balanceHistory.js';

async function main() {
  const row=(sourceId:string,balanceAmount:any,measuredAt:any,currency='RUB')=>({sourceId,displayName:sourceId,currency,balanceAmount,measuredAt});
  const series=buildBalanceHistory([
    row('first',12,'2026-09-06 01:00:00'),row('first',0,'2026-09-06 23:00:00'),
    row('first',-3,new Date('2026-09-08T01:00:00Z')),
    row('second',99,'2026-09-08 01:00:00'),row('second',100,'2026-09-08 02:00:00'),
    row('empty',null,null),row('first',7,'2026-09-08 02:00:00','USD')
  ],3,new Date('2026-09-08T12:00:00Z'));
  assert.equal(series.length,4);
  assert.deepEqual(series[0].points.map(p=>p.balance),[0,null,-3]);
  assert.deepEqual(series[1].points.map(p=>p.balance),[null,null,100]);
  assert.ok(series[2].points.every(p=>p.balance===null));
  assert.equal(series[3].currency,'USD');
  assert.deepEqual(buildBalanceHistory([],3),[]);
  await getEnabledBalanceHistory(31,async(sql,params)=>{
    assert.match(sql,/WHERE s.enabled=1/);
    assert.match(sql,/LEFT JOIN balance_snapshots/);
    assert.match(sql,/ORDER BY s.id,p.measured_at,p.id/);
    assert.deepEqual(params,[30]);return [];
  });
  console.log('PASS: multiple sources, last daily snapshot, zero/negative, gaps, no data, separate currencies, enabled-source SQL');
}
void main();
