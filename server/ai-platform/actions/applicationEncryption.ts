import crypto from'crypto';import{BusinessActionError}from'./actionErrors.js';
export interface EncryptedValue{ciphertext:string;keyVersion:string}
export class ApplicationEncryptionService{
  private key():Buffer{const raw=process.env.PBXPULS_AI_ACTION_ENCRYPTION_KEY||'';let key:Buffer;try{key=/^[a-f0-9]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64')}catch{key=Buffer.alloc(0)}if(key.length!==32)throw new BusinessActionError('encryption_not_configured',503,'Callback encryption is not configured');return key}
  ready(){try{this.key();return true}catch{return false}}
  encrypt(value:string):EncryptedValue{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key(),iv),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]),tag=cipher.getAuthTag();return{ciphertext:`v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`,keyVersion:'v1'}}
  decrypt(value:string){const[version,iv,tag,data]=value.split(':');if(version!=='v1'||!iv||!tag||!data)throw new BusinessActionError('invalid_request',400,'Invalid encrypted value');const decipher=crypto.createDecipheriv('aes-256-gcm',this.key(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8')}
}
export function normalizePhone(value:unknown){const input=String(value||'').trim(),plus=input.startsWith('+'),digits=input.replace(/\D/g,'');if(digits.length<7||digits.length>15)throw new BusinessActionError('invalid_request',400,'Invalid phone number');return`${plus?'+':''}${digits}`}
export function maskCallbackPhone(phone:string){const digits=phone.replace(/\D/g,'');return`${phone.startsWith('+')?'+':''}${'*'.repeat(Math.max(3,digits.length-4))}${digits.slice(-4)}`}
export function tenantPhoneHash(tenantId:number,phone:string){const secret=process.env.PBXPULS_AI_ACTION_HASH_KEY||process.env.PBXPULS_AI_ACTION_ENCRYPTION_KEY;if(!secret)throw new BusinessActionError('encryption_not_configured',503,'Callback encryption is not configured');return crypto.createHmac('sha256',secret).update(`${tenantId}:${phone}`).digest('hex')}
