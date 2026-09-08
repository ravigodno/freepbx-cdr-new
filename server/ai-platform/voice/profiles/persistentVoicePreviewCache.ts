import { AiPlatformError } from '../../core/errors.js';
import type { AiPlatformStore } from '../../storage/aiPlatformStore.js';

export class PersistentVoicePreviewCache{
  constructor(private store:AiPlatformStore,private ttlDays=30){}
  async get(tenantId:number,key:string):Promise<Buffer|null>{
    const rows=await this.store.query(`SELECT audio_data FROM ai_voice_preview_cache WHERE tenant_id=? AND cache_key=? AND expires_at>NOW() LIMIT 1`,[tenantId,key]);
    const value=rows[0]?.audio_data;if(!value)return null;
    await this.store.query('UPDATE ai_voice_preview_cache SET last_accessed_at=NOW() WHERE tenant_id=? AND cache_key=?',[tenantId,key]);
    return Buffer.isBuffer(value)?value:Buffer.from(value);
  }
  async set(tenantId:number,key:string,input:{provider:string;voiceId:string;configHash:string;textHash:string;audio:Buffer}){
    if(!input.audio.length||input.audio.length>10*1024*1024)throw new AiPlatformError('invalid_request',400,'Некорректный размер voice preview');
    await this.store.query(`INSERT INTO ai_voice_preview_cache(tenant_id,cache_key,provider_key,voice_id,config_hash,text_hash,mime_type,audio_data,audio_bytes,last_accessed_at,expires_at)
      VALUES(?,?,?,?,?,?,'audio/wav',?,?,NOW(),DATE_ADD(NOW(),INTERVAL ? DAY))
      ON DUPLICATE KEY UPDATE provider_key=VALUES(provider_key),voice_id=VALUES(voice_id),config_hash=VALUES(config_hash),text_hash=VALUES(text_hash),audio_data=VALUES(audio_data),audio_bytes=VALUES(audio_bytes),last_accessed_at=NOW(),expires_at=VALUES(expires_at)`,
      [tenantId,key,input.provider,input.voiceId,input.configHash,input.textHash,input.audio,input.audio.length,this.ttlDays]);
    await this.store.query('DELETE FROM ai_voice_preview_cache WHERE tenant_id=? AND expires_at<=NOW()',[tenantId]);
  }
  async delete(tenantId:number,key:string){await this.store.query('DELETE FROM ai_voice_preview_cache WHERE tenant_id=? AND cache_key=?',[tenantId,key])}
}
