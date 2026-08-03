import crypto from 'node:crypto';

export class NotificationConfigCrypto {
  private readonly key: Buffer;
  constructor(secret: string) {
    if (!String(secret || '').trim()) throw new Error('notification_encryption_key_missing');
    this.key = crypto.createHash('sha256').update(`pbxpuls:notification-config:${secret}`).digest();
  }
  encrypt(value: Record<string, unknown>): string {
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
  }
  decrypt(value: unknown): Record<string, any> {
    const [version, iv, tag, body] = String(value || '').split(':'); if (version !== 'v1' || !iv || !tag || !body) return {};
    try { const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')); }
    catch { return {}; }
  }
}

export function mergeNotificationToken(currentToken:string,inputToken:unknown,replaceToken:boolean){const supplied=String(inputToken||'').trim();if(!supplied)return currentToken;if(currentToken&&!replaceToken)throw new Error('token_replace_confirmation_required');return supplied}
