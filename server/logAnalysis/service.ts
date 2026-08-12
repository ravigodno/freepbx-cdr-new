import { queryPBXPulsDb, sanitizePBXPulsDbError } from '../pbxpulsDb.js';
import { writePBXPulsSystemEvent } from '../pbxpulsEvents.js';
import { parseMultilineLog } from './parsers.js';
import { readAllowedJournal, readAllowedLogFile } from './reader.js';
import { detectLogSources, resolveLogSource } from './registry.js';
import { cleanupLogAnalysisRetention, correlateLogEvent, getLogAnalysisSettings, loadLogCursors, markLogSourceRead, saveDetectedSources, saveLogCursor, storeLogEvent } from './storage.js';

const runtime={running:false,collecting:false,startedAt:null as string|null,lastRunAt:null as string|null,lastError:null as string|null,
  discoveredSources:0,activeSources:0,processedSources:0,pendingSources:0,initializing:true,currentSourceKey:null as string|null,currentStage:'idle',
  metrics:{linesRead:0,bytesRead:0,eventsParsed:0,eventsStored:0,eventsUpdated:0,duplicatesSkipped:0,parseErrors:0,lastReadAt:null as string|null,lastEventAt:null as string|null,readDurationMs:0,sourceLagSeconds:0}};
let collecting:Promise<any>|null=null;let timer:ReturnType<typeof setInterval>|null=null;let lastRetention=0;let sourceOffset=0;
const SOURCES_PER_RUN=2;

async function collectDatabaseSource(sourceKey:string){const cursorMap=await loadLogCursors();const cursor=cursorMap.get(sourceKey);const lastId=Number(cursor?.offset||0);const system=sourceKey.endsWith('system_events');const table=system?'system_events':'audit_log';const rows=await queryPBXPulsDb(`SELECT * FROM ${table} WHERE id>? ORDER BY id LIMIT 500`,[lastId]);const source=resolveLogSource(sourceKey)!;const lines=rows.map((row:any)=>system?`${row.created_at} ${row.severity||'info'} ${row.source||'pbxpuls'}: ${row.message||''} ${row.details||''}`:`${row.created_at} audit ${row.actor_label||''} ${row.action||''} ${row.entity_type||''} ${row.details||''}`);const nextId=rows.length?Number(rows[rows.length-1].id):lastId;return{source,lines,bytesRead:Buffer.byteLength(lines.join('\n')),durationMs:0,nextCursor:{sourceKey,offset:nextId,fileSize:nextId,lastReadAt:new Date().toISOString()}};}

export async function collectLogAnalysisNow(reason='manual'){
  if(collecting)return collecting;collecting=(async()=>{runtime.collecting=true;runtime.lastError=null;const started=Date.now();const settings=await getLogAnalysisSettings();if(settings['log_analysis.enabled']!==true)return{skipped:true,reason:'disabled'};
    runtime.currentStage='detecting';const detected=await detectLogSources();const active=detected.filter(source=>source.active&&source.readable);runtime.discoveredSources=detected.length;runtime.activeSources=active.length;
    runtime.currentStage='saving_sources';await saveDetectedSources(detected);runtime.currentStage='loading_cursors';const cursors=await loadLogCursors();let linesRead=0,bytesRead=0,eventsParsed=0,eventsStored=0,duplicatesSkipped=0,parseErrors=0;let lastEventAt:string|undefined;
    const selected=active.length?Array.from({length:Math.min(SOURCES_PER_RUN,active.length)},(_,index)=>active[(sourceOffset+index)%active.length]):[];
    sourceOffset=active.length?(sourceOffset+selected.length)%active.length:0;runtime.processedSources=0;runtime.pendingSources=Math.max(0,active.length-selected.length);
    for(const detectedSource of selected){
      const source=resolveLogSource(detectedSource.sourceKey);if(!source)continue;runtime.currentSourceKey=source.sourceKey;runtime.currentStage='reading_source';
      try{let read:any;if(source.sourceType==='journald')read={source,...await readAllowedJournal(source,cursors.get(source.sourceKey))};else if(source.sourceType==='database')read=await collectDatabaseSource(source.sourceKey);else read={source,...await readAllowedLogFile(source.sourceKey,cursors.get(source.sourceKey))};
        linesRead+=read.lines.length;bytesRead+=read.bytesRead;let events=[];try{events=parseMultilineLog(read.lines,source);}catch{parseErrors+=1;}eventsParsed+=events.length;
        runtime.currentStage='storing_events';for(let index=0;index<events.length;index+=1){const event:any=events[index];event.contextBefore=read.lines.slice(Math.max(0,index-3),index);event.contextAfter=read.lines.slice(index+1,index+4);const outcome=await storeLogEvent(event);if(outcome==='created'){eventsStored+=1;if(settings['log_analysis.correlation_enabled']===true&&(event.linkedid||event.callId||event.ip))await correlateLogEvent(event);}else duplicatesSkipped+=1;lastEventAt=!lastEventAt||event.occurredAt>lastEventAt?event.occurredAt:lastEventAt;}
        runtime.currentStage='saving_cursor';await saveLogCursor(read.nextCursor);await markLogSourceRead(source.sourceKey,{status:events.length?'online':'waiting',lastEventAt,fileSize:read.nextCursor.fileSize,inode:read.nextCursor.inode,modifiedAt:read.nextCursor.modifiedAt});runtime.processedSources+=1;
      }catch(error:any){await markLogSourceRead(source.sourceKey,{error:sanitizePBXPulsDbError(error)});}
    }
    if(Date.now()-lastRetention>86400000){await cleanupLogAnalysisRetention();lastRetention=Date.now();}
    runtime.lastRunAt=new Date().toISOString();runtime.initializing=false;runtime.currentSourceKey=null;runtime.currentStage='idle';runtime.metrics={linesRead:runtime.metrics.linesRead+linesRead,bytesRead:runtime.metrics.bytesRead+bytesRead,eventsParsed:runtime.metrics.eventsParsed+eventsParsed,eventsStored:runtime.metrics.eventsStored+eventsStored,eventsUpdated:runtime.metrics.eventsUpdated,duplicatesSkipped:runtime.metrics.duplicatesSkipped+duplicatesSkipped,parseErrors:runtime.metrics.parseErrors+parseErrors,lastReadAt:runtime.lastRunAt,lastEventAt:lastEventAt||runtime.metrics.lastEventAt,readDurationMs:Date.now()-started,sourceLagSeconds:lastEventAt?Math.max(0,Math.round((Date.now()-new Date(lastEventAt).getTime())/1000)):0};return{reason,linesRead,bytesRead,eventsParsed,eventsStored,duplicatesSkipped,parseErrors,processedSources:selected.length,pendingSources:runtime.pendingSources,durationMs:Date.now()-started};
  })().catch(error=>{runtime.lastError=sanitizePBXPulsDbError(error);throw error}).finally(()=>{runtime.collecting=false;collecting=null});return collecting;}

export function startLogAnalysisCollector(){if(timer||runtime.running)return;runtime.running=true;runtime.startedAt=new Date().toISOString();setTimeout(()=>collectLogAnalysisNow('startup').catch(()=>undefined),8000).unref();timer=setInterval(()=>collectLogAnalysisNow('background').catch(()=>undefined),60000);timer.unref();writePBXPulsSystemEvent({event_type:'log_analysis_collector_started',severity:'info',source:'log_analysis',message:'Read-only centralized log analysis collector started'}).catch(()=>undefined);}
export function getLogAnalysisRuntime(){return{...runtime,metrics:{...runtime.metrics}};}
export function requestLogAnalysisCollection(reason='manual'){
  if(collecting)return{accepted:false,alreadyRunning:true,runtime:getLogAnalysisRuntime()};
  void collectLogAnalysisNow(reason).catch(()=>undefined);
  return{accepted:true,alreadyRunning:false,runtime:getLogAnalysisRuntime()};
}
