import crypto from 'node:crypto';

export function generateWebhookToken(): string { return crypto.randomBytes(32).toString('base64url'); }
export function hashWebhookToken(integrationId: string, token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${integrationId}:${token}`).digest('hex');
}
export function verifyWebhookToken(expected: string, integrationId: string, token: string, secret: string): boolean {
  const actual = hashWebhookToken(integrationId, token, secret);
  if (!/^[a-f0-9]{64}$/.test(expected) || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
