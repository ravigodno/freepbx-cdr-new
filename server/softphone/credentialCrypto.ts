import crypto from 'crypto';

export class SoftphoneCredentialCrypto {
  private key(): Buffer {
    const dedicated = String(process.env.PBXPULS_SOFTPHONE_ENCRYPTION_KEY || '').trim();
    const installationSecret = String(process.env.JWT_SECRET || '').trim();
    const raw = dedicated || installationSecret;
    if (!dedicated && (!installationSecret || installationSecret === 'asterisk-cdr-secret-key-132')) {
      throw new Error('softphone_encryption_not_configured');
    }
    let key: Buffer;
    try {
      key = dedicated
        ? (/^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64'))
        : crypto.createHash('sha256').update(`pbxpuls-softphone-v1:${raw}`).digest();
    } catch {
      key = Buffer.alloc(0);
    }
    if (key.length !== 32) throw new Error('softphone_encryption_not_configured');
    return key;
  }

  ready(): boolean {
    try { this.key(); return true; } catch { return false; }
  }

  encrypt(value: string): { ciphertext: string; keyVersion: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`,
      keyVersion: 'v1'
    };
  }

  decrypt(value: string): string {
    const [version, iv, tag, body] = String(value || '').split(':');
    if (version !== 'v1' || !iv || !tag || !body) throw new Error('softphone_credential_invalid');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  }
}
