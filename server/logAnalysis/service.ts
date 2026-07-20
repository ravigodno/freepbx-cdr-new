import { queryPBXPulsDb, sanitizePBXPulsDbError } from '../pbxpulsDb.js';
import { writePBXPulsSystemEvent } from '../pbxpulsEvents.js';
import { parseMultilineLog } from './parsers.js';
import { readAllowedJournal, readAllowedLogFile } from './reader.js';
import { detectLogSources, resolveLogSource } from './registry.js';
import { cleanupLogAnalysisRetention, correlateLogEvent, getLogAnalysisSettings, loadLogCursors, markLogSourceRead, saveDetectedSources, saveLogCursor, storeLogEvent } from './storage.js';

const runtime={running:false,collecting:false,startedAt:null as string|null,lastRunAt:null as string|null,lastError:null as string|null,
  metrics:{linesRead:0,bytesRead:0,eventsParsed:0,eventsStored:0,eventsUpdated:0,duplicatesSkipped:0,parseErrors:0,lastReadAt:null as string|null,lastEventAt:null as string|null,readDurationMs:0,sourceLagSeconds:0}};
let collecting:Promise<any>|null=null;let timer:ReturnType<typeof setInterval>|null=null;let lastRetention=0;

async function collectDatabaseSource(sourceKey:string){const cursorMap=await loadLogCursors();const cursor=cursorMap.get(sourceKey);const lastId=Number(cursor?.offset||0);const system=sourceKey.endsWith('system_events');const table=system?'system_events':'audit_log';const rows=await queryPBXPulsDb(`SELECT * FROM ${table} WHERE id>? ORDER BY id LIMIT 500`,[lastId]);const source=resolveLogSource(sourceKey)!;const lines=rows.map((row:any)=>system?`${row.created_at} ${row.severity||'info'} ${row.source||'pbxpuls'}: ${row.message||''} ${row.details||''}`:`${row.created_at} audit ${row.actor_label||''} ${row.action||''} ${row.entity_type||''} ${row.details||''}`);const nextId=rows.length?Number(rows[rows.length-1].id):lastId;return{source,lines,bytesRead:Buffer.byteLength(lines.join('\n')),durationMs:0,nextCursor:{sourceKey,offset:nextId,fileSize:nextId,lastReadAt:new Date().toISOString()}};}

export async function collectLogAnalysisNow(reason='manual'){
  if(collecting)return collecting;collecting=(async()=>{runtime.collecting=true;runtime.lastError=null;const started=Date.now();const settings=await getLogAnalysisSettings();if(settings['log_analysis.enabled']!==true)return{skipped:true,reason:'disabled'};
    const detected=await detectLogSources();await saveDetectedSources(detected);const cursors=await loadLogCursors();let linesRead=0,bytesRead=0,eventsParsed=0,eventsStored=0,duplicatesSkipped=0,parseErrors=0;let lastEventAt:string|undefined;
    for(const detectedSource of detected.filter(source=>source.active&&source.readable)){
      const source=resolveLogSource(detectedSource.sourceKey);if(!source)continue;
      try{let read:any;if(source.sourceType==='journald')read={source,...await readAllowedJournal(source,cursors.get(source.sourceKey))};else if(source.sourceType==='database')read=await collectDatabaseSource(source.sourceKey);else read={source,...await readAllowedLogFile(source.sourceKey,cursors.get(source.sourceKey))};
        linesRead+=read.lines.length;bytesRead+=read.bytesRead;let events=[];try{events=parseMultilineLog(read.lines,source);}catch{parseErrors+=1;}eventsParsed+=events.length;
        for(let start=0;start<events.length;start+=20){const batch=events.slice(start,start+20);await Promise.all(batch.map(async(event:any,batchIndex:number)=>{const index=start+batchIndex;event.contextBefore=read.lines.slice(Math.max(0,index-3),index);event.contextAfter=read.lines.slice(index+1,index+4);const outcome=await storeLogEvent(event);if(outcome==='created'){eventsStored+=1;if(settings['log_analysis.correlation_enabled']===true&&(event.linkedid||event.callId||event.ip))await correlateLogEvent(event);}else duplicatesSkipped+=1;lastEventAt=!lastEventAt||event.occurredAt>lastEventAt?event.occurredAt:lastEventAt;}));}
        await saveLogCursor(read.nextCursor);await markLogSourceRead(source.sourceKey,{status:events.length?'online':'waiting',lastEventAt,fileSize:read.nextCursor.fileSize,inode:read.nextCursor.inode,modifiedAt:read.nextCursor.modifiedAt});
      }catch(error:any){await markLogSourceRead(source.sourceKey,{error:sanitizePBXPulsDbError(error)});}
    }
    if(Date.now()-lastRetention>86400000){await cleanupLogAnalysisRetention();lastRetention=Date.now();}
    runtime.lastRunAt=new Date().toISOString();runtime.metrics={linesRead:runtime.metrics.linesRead+linesRead,bytesRead:runtime.metrics.bytesRead+bytesRead,eventsParsed:runtime.metrics.eventsParsed+eventsParsed,eventsStored:runtime.metrics.eventsStored+eventsStored,eventsUpdated:runtime.metrics.eventsUpdated,duplicatesSkipped:runtime.metrics.duplicatesSkipped+duplicatesSkipped,parseErrors:runtime.metrics.parseErrors+parseErrors,lastReadAt:runtime.lastRunAt,lastEventAt:lastEventAt||runtime.metrics.lastEventAt,readDurationMs:Date.now()-started,sourceLagSeconds:lastEventAt?Math.max(0,Math.round((Date.now()-new Date(lastEventAt).getTime())/1000)):0};return{reason,linesRead,bytesRead,eventsParsed,eventsStored,duplicatesSkipped,parseErrors,durationMs:Date.now()-started};
  })().catch(error=>{runtime.lastError=sanitizePBXPulsDbError(error);throw error}).finally(()=>{runtime.collecting=false;collecting=null});return collecting;}

export function startLogAnalysisCollector(){if(timer||runtime.running)return;runtime.running=true;runtime.startedAt=new Date().toISOString();setTimeout(()=>collectLogAnalysisNow('startup').catch(()=>undefined),8000).unref();timer=setInterval(()=>collectLogAnalysisNow('background').catch(()=>undefined),60000);timer.unref();writePBXPulsSystemEvent({event_type:'log_analysis_collector_started',severity:'info',source:'log_analysis',message:'Read-only centralized log analysis collector started'}).catch(()=>undefined);}
export function getLogAnalysisRuntime(){return{...runtime,metrics:{...runtime.metrics}};}
