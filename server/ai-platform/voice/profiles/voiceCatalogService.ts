import crypto from "node:crypto";
import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import type { AiAuditService } from "../../audit/aiAuditService.js";
import { AiPlatformError } from "../../core/errors.js";

export type VoiceCatalogEntry={
  id:number;provider:string;voiceId:string;displayName:string;description:string|null;
  supported:boolean;active:boolean;sortOrder:number;metadata:Record<string,unknown>;
  lastVerifiedAt:string|null;
};

export class VoiceCatalogService{
  constructor(private store:AiPlatformStore,private audit:AiAuditService){}
  async list(tenantId:number,filters:any={}):Promise<VoiceCatalogEntry[]>{
    const rows=await this.store.query(`SELECT id,provider_key,voice_id,display_name,description,supported,active,sort_order,metadata_json,last_verified_at
      FROM ai_voice_catalog WHERE (tenant_id=? OR tenant_id IS NULL)
      ORDER BY provider_key,sort_order,display_name`,[tenantId]);
    return rows.map((row:any)=>{
      let metadata:Record<string,unknown>={};try{metadata=JSON.parse(String(row.metadata_json||"{}"))}catch{}
      return{id:Number(row.id),provider:String(row.provider_key),voiceId:String(row.voice_id),displayName:String(row.display_name),description:row.description?String(row.description):null,supported:Boolean(row.supported),active:Boolean(row.active),sortOrder:Number(row.sort_order),metadata,lastVerifiedAt:row.last_verified_at?String(row.last_verified_at):null};
    }).filter(item=>
      (!filters.provider||item.provider===filters.provider)&&
      (filters.active==="all"||filters.active===undefined||item.active===(filters.active!=="false"))&&
      (!filters.gender||item.metadata.gender===filters.gender));
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
