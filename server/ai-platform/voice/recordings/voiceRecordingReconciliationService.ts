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
  constructor(private store:AiPlatformStore,private audit:AiAuditService){}
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
      const row=(rows as any[]).find(item=>
        voiceHash(tenantId,String(item.uniqueid||""))===voice.external_call_id_hash||
        voiceHash(tenantId,String(item.linkedid||""))===voice.external_call_id_hash);
      if(!row?.recordingfile)return{available:false,ref:null,mimeType:null,sizeBytes:null,durationMs:null,billsecSeconds:row?Number(row.billsec):null,durationSeconds:row?Number(row.duration):null};
      const filename=path.basename(String(row.recordingfile));
      if(filename!==String(row.recordingfile)||!/^ai-[0-9.]+\.wav$/i.test(filename))
        return{available:false,ref:null,mimeType:null,sizeBytes:null,durationMs:null,billsecSeconds:Number(row.billsec),durationSeconds:Number(row.duration)};
      const root=monitorRoot(),file=findRecordingWithinRoot(root,filename);
      if(!file||!file.startsWith(root+path.sep))return{available:false,ref:null,mimeType:null,sizeBytes:null,durationMs:null,billsecSeconds:Number(row.billsec),durationSeconds:Number(row.duration)};
      const stat=fs.statSync(file);
      if(!stat.isFile()||stat.size<=0)return{available:false,ref:null,mimeType:null,sizeBytes:stat.size,durationMs:null,billsecSeconds:Number(row.billsec),durationSeconds:Number(row.duration)};
      const probe=spawnSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",file],{encoding:"utf8",timeout:3000}),
        seconds=probe.status===0?Number(String(probe.stdout).trim()):NaN;
      return{available:true,ref:safeRecordingReference(tenantId,filename),mimeType:"audio/wav",sizeBytes:stat.size,durationMs:Number.isFinite(seconds)?Math.round(seconds*1000):null,billsecSeconds:Number(row.billsec),durationSeconds:Number(row.duration),path:file};
    }finally{await db.end();}
  }
  async reconcile(tenantId:number,voiceSessionId:number,traceId="recording-reconcile"){
    const voice=(await this.store.query("SELECT id,started_at,ended_at,external_call_id_hash,recording_ref_safe FROM ai_voice_sessions WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,voiceSessionId]))[0];
    if(!voice)return{available:false};
    if(voice.recording_ref_safe)return{available:true,idempotent:true};
    const result=await this.locate(tenantId,voice);
    await this.store.query(`UPDATE ai_voice_sessions SET recording_status=?,recording_ref_safe=?,recording_mime_type=?,recording_size_bytes=?,recording_duration_ms=?,cdr_billsec_seconds=?,cdr_duration_seconds=?,cdr_internal_ref=? WHERE tenant_id=? AND id=?`,[
      result.available?"available":"unavailable",result.ref,result.mimeType,result.sizeBytes,result.durationMs,result.billsecSeconds,result.durationSeconds,
      result.available?voice.external_call_id_hash:null,tenantId,voiceSessionId,
    ]);
    if(result.available)await this.audit.append({tenantId,traceId,actorType:"service",eventType:"voice_recording_reconciled" as any,entityType:"voice_session",entityId:String(voiceSessionId),decision:"available",details:{mimeType:result.mimeType,sizeBytes:result.sizeBytes,durationMs:result.durationMs}});
    return{...result,path:undefined};
  }
  schedule(tenantId:number,voiceSessionId:number,traceId:string){
    if(this.timers.has(voiceSessionId))return;
    const delays=[0,2000,10000,30000];let attempt=0;
    const run=async()=>{const result=await this.reconcile(tenantId,voiceSessionId,traceId).catch(()=>({available:false}));if(result.available||attempt>=delays.length-1){this.timers.delete(voiceSessionId);return}attempt++;const timer=setTimeout(run,delays[attempt]);timer.unref?.();this.timers.set(voiceSessionId,timer)};
    const timer=setTimeout(run,delays[0]);timer.unref?.();this.timers.set(voiceSessionId,timer);
  }
  async resolve(tenantId:number,voiceSessionId:number,ref:string){
    const voice=(await this.store.query("SELECT id,started_at,ended_at,external_call_id_hash,recording_ref_safe FROM ai_voice_sessions WHERE tenant_id=? AND id=? AND recording_ref_safe=? LIMIT 1",[tenantId,voiceSessionId,ref]))[0];
    if(!voice)return null;
    const result=await this.locate(tenantId,voice);
    return result.available&&result.ref===ref?result:null;
  }
}
