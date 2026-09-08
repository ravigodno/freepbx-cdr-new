import assert from 'node:assert/strict';
import {Response} from 'node-fetch';
import {McnTelecomClient,McnError,normalizeMcnBalance,mcnAccountId,safeMcnError,MCN_BALANCE_URL} from '../server/balance/providers/mcnTelecom.js';
import {McnTelecomService} from '../server/balance/mcnTelecomService.js';
import {registerBalanceRoutes} from '../server/balance/router.js';
const payload={status:'OK',result:{id:12345,balance:-25.75,credit:100,currency:'RUB'}};
assert.equal(normalizeMcnBalance(payload,12345).balance,-25.75);
assert.equal(normalizeMcnBalance({...payload,result:{...payload.result,balance:0}},12345).balance,0);
for(const value of [null,'',false,{},'NaN'])assert.throws(()=>normalizeMcnBalance({...payload,result:{...payload.result,balance:value}},12345));
assert.throws(()=>normalizeMcnBalance(payload,56789),/account_mismatch/);
assert.throws(()=>mcnAccountId('123/../../'));assert.throws(()=>mcnAccountId(0));
const seen:any[]=[];
const client=new McnTelecomClient('fixture-token',async(url,init)=>{seen.push({url,init});return new Response(JSON.stringify(url===MCN_BALANCE_URL?payload:{ok:true,result:{currentAccount:{accountId:12345}}}),{status:200})});
await client.getBalance();assert.equal(seen.length,2);assert.deepEqual(JSON.parse(seen[1].init.body),{account_id:12345});
assert.equal(seen[1].init.headers.Authorization,'Bearer fixture-token');assert.equal(seen[1].init.redirect,'manual');
await client.getBalance(12345);assert.equal(seen.length,3);
for(const status of [301,401,403,429,500]){
 await assert.rejects(()=>new McnTelecomClient('fixture-token',async()=>new Response('secret echoed',{status})).getBalance(12345),new RegExp(status===301?'redirect_blocked':`http_${status}`));
}
await assert.rejects(()=>new McnTelecomClient('fixture-token',async()=>new Response('{')).getBalance(12345),/invalid_json/);
await assert.rejects(()=>new McnTelecomClient('fixture-token',async()=>{throw Object.assign(Error('sensitive network text'),{name:'AbortError'})}).getBalance(12345),/timeout/);
assert.equal(JSON.stringify(safeMcnError(Error('secret=fixture-token'))).includes('fixture-token'),false);
console.log('PASS documented request/auth, negative/zero balance, account isolation, malformed data, redirects, HTTP and timeout safety');

let row:any={enabled:0,config_json:'{}',sync_interval_minutes:15,status:'disabled'},snaps:any[]=[],calls=0,fail=false;
const query:any=async(sql:string,p:any[]=[])=>{
 if(sql.startsWith('SELECT s.*'))return[row];
 if(sql.startsWith('SELECT balance_amount'))return snaps.slice(-1);
 if(sql.startsWith('INSERT IGNORE'))return[];
 if(sql.startsWith('UPDATE balance_sources SET enabled')){Object.assign(row,{enabled:p[0],config_json:p[1],sync_interval_minutes:p[2],status:p[3],safe_error_code:null});return[]}
 if(sql.startsWith('INSERT INTO balance_source_credentials')){row.access_token_encrypted=p[0];return[]}
 if(sql.startsWith('INSERT INTO balance_snapshots')){snaps.push({balance_amount:p[0],currency:p[1],credit_limit:p[2],account_number_masked:p[3],metadata_json:p[5],measured_at:'2026-09-08 12:00:00'});return[]}
 if(sql.startsWith("UPDATE balance_sources SET status='success'")){row.status='success';return[]}
 if(sql.startsWith("UPDATE balance_sources SET status='error'")){row.status='error';row.safe_error_code=p[0];return[]}
 throw Error('Unexpected fixture query');
};
const service=new McnTelecomService('isolated-encryption-secret',query,async work=>work(query),()=>({getBalance:async()=>{calls++;await new Promise(r=>setTimeout(r,5));if(fail)throw new McnError('http_403');return normalizeMcnBalance(payload,12345)}}) as any);
await service.save({enabled:true,accountId:12345,token:'fixture-token',syncIntervalMinutes:15});
assert.ok(!row.access_token_encrypted.includes('fixture-token'));assert.ok(!JSON.stringify(await service.settings()).includes('fixture-token'));
await Promise.all([service.sync(),service.sync()]);assert.equal(calls,1);assert.equal(snaps.length,1);
assert.equal((await service.source()).balance,-25.75);
fail=true;await assert.rejects(()=>service.sync(),/http_403/);assert.equal((await service.source()).balance,-25.75);assert.equal((await service.source()).status,'error');assert.equal(snaps.length,1);
await service.save({enabled:false,accountId:12345,syncIntervalMinutes:15});assert.equal((await service.settings()).hasToken,true);
await assert.rejects(()=>service.sync(),/provider_disabled/);
await service.save({enabled:true,accountId:56789,syncIntervalMinutes:15});assert.equal((await service.source()).balance,null,'Do not show old account balance after configuration change');
console.log('PASS encrypted write-only token, retention, concurrent sync, failed sync preserves last snapshot, disable, settings revision isolation');

const routes:any[]=[];const app:any={};for(const method of ['get','put','post'])app[method]=(path:any,...handlers:any[])=>routes.push({method,path,handler:handlers.at(-1)});
registerBalanceRoutes(app,{hashSecret:'isolated-secret',queryCdr:async()=>[],requireAuth:()=>()=>{},checkPermission:async()=>false});
for(const route of routes.filter(r=>String(r.path).includes('mcn-telecom'))){let status=0;await route.handler({}, {status:(n:number)=>{status=n;return{json:()=>{}}},json:()=>{throw Error('Unauthorized result')}});assert.equal(status,403)}
assert.equal(routes.filter(r=>String(r.path).includes('mcn-telecom')).length,5);
console.log('PASS all MCN endpoints deny insufficient permissions before provider/storage access');
