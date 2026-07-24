import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import type { AiAuditService } from "../../audit/aiAuditService.js";
import { voiceHash } from "../voiceEncryption.js";

type RecordingResult = {
  available: boolean;
  ref: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  billsecSeconds: number | null;
  durationSeconds: number | null;
  path?: string;
};

const monitorRoot = () =>
  path.resolve(process.env.ASTERISK_MONITOR_ROOT || "/var/spool/asterisk/monitor");
export const safeRecordingReference = (tenantId:number,filename:string) =>
  `rec_${crypto.createHmac("sha256",process.env.PBXPULS_AI_VOICE_HASH_KEY||process.env.PBXPULS_AI_VOICE_ENCRYPTION_KEY||`tenant:${tenantId}`).update(`recording:${tenantId}:${filename}`).digest("hex")}`;
export const findRecordingWithinRoot = (root:string,target:string):string|null => {
  if(!fs.existsSync(root)) return null;
  const pending=[root];
  while(pending.length){
    const current=pending.pop()!;
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      const candidate=path.resolve(current,entry.name);
      if(candidate!==root&&!candidate.startsWith(root+path.sep))continue;
      if(entry.isDirectory())pending.push(candidate);
      else if(entry.isFile()&&entry.name===target)return candidate;
    }
  }
  return null;
};

export class VoiceRecordingReconciliationService {
  private timers=new Map<number,NodeJS.Timeout>();
  private handoffCompletionHandler:((tenantId:number,voiceSessionId:number,traceId:string)=>Promise<void>)|null=null;
  constructor(private store:AiPlatformStore,private audit:AiAuditService){}
  setHandoffCompletionHandler(handler:(tenantId:number,voiceSessionId:number,traceId:string)=>Promise<void>){
    this.handoffCompletionHandler=handler;
  }
  private async cdr(){
    const sockets=["/var/lib/mysql/mysql.sock","/run/mysqld/mysqld.sock"];
    for(const socketPath of sockets)if(fs.existsSync(socketPath))try{
      return await mysql.createConnection({user:"root",socketPath,database:"asteriskcdrdb",dateStrings:true});
    }catch{}
    throw new Error("cdr_unavailable");
  }
  private async locate(tenantId:number,voice:any):Promise<RecordingResult>{
    const db=await this.cdr();
    try{
      const [rows]=await db.query(
        "SELECT uniqueid,linkedid,recordingfile,billsec,duration FROM cdr WHERE calldate BETWEEN DATE_SUB(?,INTERVAL 2 MINUTE) AND DATE_ADD(COALESCE(?,?),INTERVAL 5 MINUTE) ORDER BY calldate",
        [voice.started_at,voice.ended_at,voice.started_at],
      );
      const matched=(rows as any[]).filter(item=>
        voiceHash(tenantId,String(item.uniqueid||""))===voice.external_call_id_hash||
        voiceHash(tenantId,String(item.linkedid||""))===voice.external_call_id_hash);
      const root=monitorRoot();
      const candidate=matched
        .filter(item=>String(item.recordingfile||"").trim())
        .map(row=>{const filename=path.basename(String(row.recordingfile));return{row,filename,file:filename===String(row.recordingfile)&&/^(?:ai|internal)-[A-Za-z0-9_.-]+\.wav$/i.test(filename)?findRecordingWithinRoot(root,filename):null}})
        .find(item=>item.file&&item.file.startsWith(root+path.sep));
      const fallback=matched.find(item=>String(item.recordingfile||"").trim())||matched[0];
      if(!candidate)return{available:false,ref:null,mimeType:null,sizeBytes:null,durationMs:null,billsecSeconds:fallback?Number(fallback.billsec):null,durationSeconds:fallback?Number(fallback.duration):null};
      const{row,filename}=candidate,file=candidate.file!;
      const stat=fs.statSync(file);
      if(!stat.isFile()||stat.size<=0)return{available:false,ref:null,mimeType:null,sizeBytes:stat.size,durationMs:null,billsecSeconds:Number(row.billsec),durationSeconds:Number(row.duration)};
      const probe=spawnSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",file],{encoding:"utf8",timeout:3000}),
        seconds=probe.status===0?Number(String(probe.stdout).trim()):NaN;
      return{available:true,ref:safeRecordingReference(tenantId,filename),mimeType:"audio/wav",sizeBytes:stat.size,durationMs:Number.isFinite(seconds)?Math.round(seconds*1000):null,billsecSeconds:Number(row.billsec),durationSeconds:Number(row.duration),path:file};
    }finally{await db.end();}
  }
  private async answeredHandoff(tenantId:number,voice:any,destination:string){
    const db=await this.cdr();
    try{
      const [rows]=await db.query(
        "SELECT uniqueid,linkedid,calldate,duration,billsec,disposition,dst FROM cdr WHERE calldate BETWEEN DATE_SUB(?,INTERVAL 2 MINUTE) AND DATE_ADD(COALESCE(?,?),INTERVAL 5 MINUTE) AND dst=? ORDER BY calldate",
        [voice.started_at,voice.ended_at,voice.started_at,destination],
      );
      const row=(rows as any[]).find(item=>
        (voiceHash(tenantId,String(item.uniqueid||""))===voice.external_call_id_hash||
         voiceHash(tenantId,String(item.linkedid||""))===voice.external_call_id_hash)&&
        String(item.disposition||"").toUpperCase()==="ANSWERED"
      );
      if(!row)return null;
      const started=new Date(String(row.calldate).replace(" ","T")).getTime();
      const duration=Math.max(0,Number(row.duration||0)),billsec=Math.max(0,Number(row.billsec||0));
      return{
        answeredAt:new Date(started+Math.max(0,duration-billsec)*1000),
        endedAt:new Date(started+duration*1000),
        humanTalkSeconds:billsec,
      };
    }finally{await db.end();}
  }
  async reconcile(tenantId:number,voiceSessionId:number,traceId="recording-reconcile"){
    const voice=(await this.store.query("SELECT id,started_at,ended_at,external_call_id_hash,recording_ref_safe FROM ai_voice_sessions WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,voiceSessionId]))[0];
    if(!voice)return{available:false};
    const result=await this.locate(tenantId,voice);
    await this.store.query(`UPDATE ai_voice_sessions SET recording_status=?,recording_ref_safe=?,recording_mime_type=?,recording_size_bytes=?,recording_duration_ms=?,cdr_billsec_seconds=?,cdr_duration_seconds=?,cdr_internal_ref=? WHERE tenant_id=? AND id=?`,[
      result.available?"available":"unavailable",result.ref,result.mimeType,result.sizeBytes,result.durationMs,result.billsecSeconds,result.durationSeconds,
      result.available?voice.external_call_id_hash:null,tenantId,voiceSessionId,
    ]);
    if(result.available)await this.audit.append({tenantId,traceId,actorType:"service",eventType:"voice_recording_reconciled" as any,entityType:"voice_session",entityId:String(voiceSessionId),decision:"available",details:{mimeType:result.mimeType,sizeBytes:result.sizeBytes,durationMs:result.durationMs}});
    const handoff=(await this.store.query(`SELECT e.id,c.primary_destination_ref destination
      FROM ai_handoff_events e JOIN ai_handoff_configs c ON c.id=e.config_id AND c.tenant_id=e.tenant_id
      WHERE e.tenant_id=? AND e.voice_session_id=? AND e.state IN('transferring','ringing')
      ORDER BY e.id DESC LIMIT 1`,[tenantId,voiceSessionId]))[0];
    let handoffPending=Boolean(handoff);
    if(handoff){
      const answered=await this.answeredHandoff(tenantId,voice,String(handoff.destination));
      if(answered){
        await this.store.query("UPDATE ai_handoff_events SET state='completed',dial_status='ANSWER',answered_at=?,ended_at=?,outcome='transferred_to_human',failure_cause=NULL,metadata_json=? WHERE tenant_id=? AND id=?",[answered.answeredAt,answered.endedAt,JSON.stringify({humanTalkSeconds:answered.humanTalkSeconds}),tenantId,handoff.id]);
        await this.store.query("UPDATE ai_voice_sessions SET state='completed',transfer_state='completed',completion_reason='human_handoff_completed',ended_at=COALESCE(ended_at,NOW(3)),last_event_at=NOW(3) WHERE tenant_id=? AND id=?",[tenantId,voiceSessionId]);
        await this.store.query("UPDATE ai_voice_call_insights SET transferred=1,outcome_safe=COALESCE(outcome_safe,'Переведён сотруднику'),updated_at=NOW() WHERE tenant_id=? AND voice_session_id=?",[tenantId,voiceSessionId]);
        await this.handoffCompletionHandler?.(tenantId,voiceSessionId,traceId);
        handoffPending=false;
      }
    }
    return{...result,path:undefined,handoffPending};
  }
  schedule(tenantId:number,voiceSessionId:number,traceId:string){
    if(this.timers.has(voiceSessionId))return;
    let attempt=0;
    const run=async()=>{const result=await this.reconcile(tenantId,voiceSessionId,traceId).catch(()=>({available:false,handoffPending:true}));if((result.available&&!result.handoffPending)||attempt>=120){this.timers.delete(voiceSessionId);return}attempt++;const timer=setTimeout(run,1000);timer.unref?.();this.timers.set(voiceSessionId,timer)};
    const timer=setTimeout(run,0);timer.unref?.();this.timers.set(voiceSessionId,timer);
  }
  async resolve(tenantId:number,voiceSessionId:number,ref:string){
    const voice=(await this.store.query("SELECT id,started_at,ended_at,external_call_id_hash,recording_ref_safe FROM ai_voice_sessions WHERE tenant_id=? AND id=? AND recording_ref_safe=? LIMIT 1",[tenantId,voiceSessionId,ref]))[0];
    if(!voice)return null;
    const result=await this.locate(tenantId,voice);
    return result.available&&result.ref===ref?result:null;
  }
}
