import crypto from "node:crypto";
import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import type { AiAuditService } from "../../audit/aiAuditService.js";
import { AiPlatformError } from "../../core/errors.js";
import {
  OPENAI_REALTIME_VOICE_MANIFEST,
  OPENAI_REALTIME_VOICE_MANIFEST_VERSION,
} from "../providers/manifests/openaiRealtimeVoiceManifest.js";

export type VoiceCatalogEntry={
  id:number;provider:string;voiceId:string;displayName:string;description:string|null;
  supported:boolean;active:boolean;sortOrder:number;metadata:Record<string,unknown>;
  modelCompatibility:string[];supportedOutputFormats:string[];
  supportedSampleRates:number[];previewAvailable:boolean;
  firstSeenAt:string|null;lastVerifiedAt:string|null;
};

export class VoiceCatalogService{
  constructor(private store:AiPlatformStore,private audit:AiAuditService){}
  async list(tenantId:number,filters:any={}):Promise<VoiceCatalogEntry[]>{
    const rows=await this.store.query(`SELECT id,provider_key,voice_id,display_name,description,supported,active,sort_order,metadata_json,
      model_compatibility_json,supported_output_formats_json,supported_sample_rates_json,preview_available,first_seen_at,last_verified_at
      FROM ai_voice_catalog WHERE (tenant_id=? OR tenant_id IS NULL)
      ORDER BY provider_key,sort_order,display_name`,[tenantId]);
    return rows.map((row:any)=>{
      let metadata:Record<string,unknown>={};try{metadata=JSON.parse(String(row.metadata_json||"{}"))}catch{}
      const array=(value:any)=>{try{const parsed=JSON.parse(String(value||"[]"));return Array.isArray(parsed)?parsed:[]}catch{return[]}};
      return{id:Number(row.id),provider:String(row.provider_key),voiceId:String(row.voice_id),displayName:String(row.display_name),description:row.description?String(row.description):null,supported:Boolean(row.supported),active:Boolean(row.active),sortOrder:Number(row.sort_order),metadata,modelCompatibility:array(row.model_compatibility_json).map(String),supportedOutputFormats:array(row.supported_output_formats_json).map(String),supportedSampleRates:array(row.supported_sample_rates_json).map(Number).filter(Number.isFinite),previewAvailable:Boolean(row.preview_available),firstSeenAt:row.first_seen_at?String(row.first_seen_at):null,lastVerifiedAt:row.last_verified_at?String(row.last_verified_at):null};
    }).filter(item=>
      (!filters.provider||item.provider===filters.provider)&&
      (filters.active==="all"||filters.active===undefined||item.active===(filters.active!=="false"))&&
      (!filters.newOnly||this.isNew(item.firstSeenAt))&&
      (!filters.gender||item.metadata.gender===filters.gender));
  }
  isNew(firstSeenAt:string|null,now=Date.now()){
    return Boolean(firstSeenAt&&now-new Date(firstSeenAt).getTime()<=30*24*60*60*1000);
  }
  async refresh(tenantId:number,provider:string,actor:any){
    if(provider!=="openai_realtime")throw new AiPlatformError("not_found",404,"Provider voice manifest is unavailable");
    const verifiedAt=new Date().toISOString().slice(0,19).replace("T"," ");
    const existing=await this.list(tenantId,{provider,active:"all"}),known=new Set(existing.map(item=>item.voiceId));
    for(const item of OPENAI_REALTIME_VOICE_MANIFEST){
      const current=existing.find(row=>row.voiceId===item.voiceId);
      if(current)await this.store.query(`UPDATE ai_voice_catalog SET display_name=?,description=?,supported=1,active=1,sort_order=?,model_compatibility_json=?,supported_output_formats_json=?,supported_sample_rates_json=?,preview_available=?,last_verified_at=? WHERE id=?`,[item.displayName,item.description,item.sortOrder,JSON.stringify(item.modelCompatibility),JSON.stringify(item.supportedOutputFormats),JSON.stringify(item.supportedSampleRates),item.previewAvailable?1:0,verifiedAt,current.id]);
      else await this.store.query(`INSERT INTO ai_voice_catalog
        (tenant_id,provider_key,voice_id,display_name,description,supported,active,sort_order,metadata_json,model_compatibility_json,supported_output_formats_json,supported_sample_rates_json,preview_available,first_seen_at,last_verified_at)
        VALUES(NULL,?,?,?,?,1,1,?,'{}',?,?,?,?,?,?)`,
        [provider,item.voiceId,item.displayName,item.description,item.sortOrder,JSON.stringify(item.modelCompatibility),JSON.stringify(item.supportedOutputFormats),JSON.stringify(item.supportedSampleRates),item.previewAvailable?1:0,verifiedAt,verifiedAt]);
    }
    const currentIds=OPENAI_REALTIME_VOICE_MANIFEST.map(item=>item.voiceId);
    await this.store.query(`UPDATE ai_voice_catalog SET supported=0,active=0,last_verified_at=? WHERE (tenant_id=? OR tenant_id IS NULL) AND provider_key=? AND voice_id NOT IN (${currentIds.map(()=>"?").join(",")})`,[verifiedAt,tenantId,provider,...currentIds]);
    const added=currentIds.filter(id=>!known.has(id)),unavailable=existing.filter(item=>!currentIds.includes(item.voiceId)).map(item=>item.voiceId);
    await this.audit.append({tenantId,...actor,eventType:"voice_catalog_refreshed" as any,entityType:"voice_catalog",entityId:provider,decision:"refreshed",details:{provider,manifestVersion:OPENAI_REALTIME_VOICE_MANIFEST_VERSION,added,unavailable,verifiedAt}});
    return{provider,manifestVersion:OPENAI_REALTIME_VOICE_MANIFEST_VERSION,added,unavailable,lastVerifiedAt:verifiedAt};
  }
  async requireAvailable(tenantId:number,provider:string,voiceId:string){
    const item=(await this.list(tenantId,{provider,active:"true"})).find(row=>row.voiceId===voiceId);
    if(!item||!item.supported)throw new AiPlatformError("conflict",409,"Выбранный голос недоступен");
    return item;
  }
  async markUnavailable(tenantId:number,provider:string,voiceId:string,reasonCode:string,actor:any){
    await this.store.query(`UPDATE ai_voice_catalog SET supported=0,last_verified_at=NOW() WHERE (tenant_id=? OR tenant_id IS NULL) AND provider_key=? AND voice_id=?`,[tenantId,provider,voiceId]);
    await this.audit.append({tenantId,...actor,eventType:"voice_catalog_availability_changed" as any,entityType:"voice_catalog",entityId:`${provider}:${voiceId}`,decision:"unavailable",details:{provider,voiceId,reasonCode}});
  }
}

type CachedPreview={audio:Buffer;expiresAt:number};
export class VoicePreviewCache{
  private cache=new Map<string,CachedPreview>();
  constructor(private ttlMs=15*60*1000){}
  key(value:unknown){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}
  get(key:string){const item=this.cache.get(key);if(!item)return null;if(item.expiresAt<=Date.now()){this.cache.delete(key);return null}return item.audio}
  set(key:string,audio:Buffer){this.cache.set(key,{audio,expiresAt:Date.now()+this.ttlMs})}
  delete(key:string){this.cache.delete(key)}
}
