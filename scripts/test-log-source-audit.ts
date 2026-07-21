import assert from 'node:assert/strict';
import { detectLogSources,isApprovedLogPath,probeJournalSource,resolveLogSource } from '../server/logAnalysis/registry.js';
import { searchAllowedLogSource } from '../server/logAnalysis/reader.js';

assert.equal(isApprovedLogPath('/var/log/asterisk/full'),true);
assert.equal(isApprovedLogPath('/var/log/asterisk/../shadow'),false);
assert.equal(isApprovedLogPath('/etc/shadow'),false);
assert.equal(isApprovedLogPath('/root/.ssh/id_rsa'),false);
assert.equal(isApprovedLogPath('/var/log/asterisk-link-to-etc/shadow'),false);

const sources=await detectLogSources();
const full=sources.find(source=>source.sourceKey==='file:/var/log/asterisk/full');
assert.ok(full,'Asterisk full must be registered');
assert.equal(full.detected,true);
assert.equal(full.readable,true);
assert.equal(full.displayName,'Asterisk — полный журнал');
assert.ok((full.rotatedPaths?.length||0)>0,'Rotated Asterisk full files must be linked');
assert.equal(resolveLogSource(full.sourceKey)?.canonicalPath,'/var/log/asterisk/full');

const history=await searchAllowedLogSource(full.sourceKey,{from:new Date(Date.now()-7*86400000).toISOString(),limit:20,maxBytes:1024*1024,includeRotated:true});
assert.ok(history.rows.length>0);
assert.ok(history.rows.some(row=>row.rotated));
assert.ok(history.rows.every(row=>row.sourceName==='Asterisk — полный журнал'));

const text=await searchAllowedLogSource(full.sourceKey,{search:'UNREACHABLE',from:new Date(Date.now()-7*86400000).toISOString(),limit:5,includeRotated:true});
assert.ok(text.rows.length>0);
assert.ok(text.rows.length<=5);
const sip=await searchAllowedLogSource(full.sourceKey,{extension:'841282-in',from:new Date(Date.now()-7*86400000).toISOString(),limit:10,includeRotated:true});
assert.ok(sip.rows.length>0);
const ip=await searchAllowedLogSource(full.sourceKey,{ip:'127.0.0.1',from:new Date(Date.now()-7*86400000).toISOString(),limit:10,includeRotated:true});
assert.ok(ip.rows.length>0);

const aborter=new AbortController();aborter.abort();
await assert.rejects(()=>searchAllowedLogSource(full.sourceKey,{signal:aborter.signal}),error=>(error as Error).name==='AbortError');
await assert.rejects(()=>searchAllowedLogSource('file:/etc/shadow'),/allowlist/);
assert.equal(sources.some(source=>source.canonicalPath==='/etc/shadow'),false);
const expectedMissing=sources.find(source=>source.sourceKey==='file:/var/log/auth.log');
assert.ok(expectedMissing);
assert.equal(expectedMissing.detected,false);
assert.match(expectedMissing.unavailableReason||'',/отсутствует/i);

const large=await searchAllowedLogSource('file:/var/log/asterisk/freepbx.log',{limit:7,maxBytes:32768,from:new Date(Date.now()-7*86400000).toISOString()});
assert.ok(large.rows.length<=7);
assert.ok(large.bytesRead<=32768);

const journal={sourceKey:'journald:test',displayName:'test',category:'system' as const,sourceType:'journald' as const,journalUnit:'test',parserKey:'journald',platform:'systemd',collectorVersion:'test'};
const timeout=await probeJournalSource(journal,async(command)=>command==='systemctl'?({ok:true,stdout:'LoadState=loaded\n',stderr:'',command,exitCode:0,timedOut:false,unavailable:false,durationMs:1}):({ok:false,stdout:'',stderr:'timeout',command,exitCode:1,timedOut:true,unavailable:false,durationMs:4000}));
assert.equal(timeout.unavailableReason,'Timeout journalctl');
const absentCommand=await probeJournalSource(journal,async(command)=>({ok:false,stdout:'',stderr:'not found',command,exitCode:1,timedOut:false,unavailable:true,durationMs:1}));
assert.equal(absentCommand.unavailableReason,'Команда systemctl отсутствует');

console.log(JSON.stringify({ok:true,sources:sources.length,available:sources.filter(s=>s.detected&&s.readable).length,rotatedFull:full.rotatedPaths?.length,historyRows:history.rows.length,textRows:text.rows.length,sipRows:sip.rows.length,ipRows:ip.rows.length}));
