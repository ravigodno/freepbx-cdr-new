import crypto from 'node:crypto';

export class SiteFormPullCrypto {
  private key:Buffer;
  constructor(secret:string){this.key=crypto.createHash('sha256').update(`pbxpuls:site-form-pull:${secret}`).digest()}
  encrypt(value:string){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv),body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return`v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`}
  decrypt(value:any){try{const[v,iv,tag,body]=String(value||'').split(':');if(v!=='v1')return'';const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(body,'base64')),decipher.final()]).toString('utf8')}catch{return''}}
}
