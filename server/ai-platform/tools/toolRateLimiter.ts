import { ToolExecutionError } from './toolErrors.js';

export interface ToolRateLimits { userPerMinute: number; tenantPerMinute: number; conversationConcurrency: number }

export class InMemoryToolRateLimiter {
  private readonly users = new Map<string, number[]>();
  private readonly tenants = new Map<number, number[]>();
  private readonly conversations = new Map<string, number>();
  constructor(private readonly limits: ToolRateLimits = { userPerMinute: 10, tenantPerMinute: 30, conversationConcurrency: 2 }) {}

  consume(tenantId: number, actorId: string|null, now = Date.now()): void {
    this.cleanup(now);
    const userKey = `${tenantId}:${actorId || 'anonymous'}`;
    const userHits = this.users.get(userKey) || [];
    const tenantHits = this.tenants.get(tenantId) || [];
    if (userHits.length >= this.limits.userPerMinute || tenantHits.length >= this.limits.tenantPerMinute)
      throw new ToolExecutionError('conflict', 429, 'Tool rate limit exceeded');
    userHits.push(now); tenantHits.push(now); this.users.set(userKey, userHits); this.tenants.set(tenantId, tenantHits);
  }

  acquireConversation(tenantId: number, conversationId: number|null): () => void {
    if (!conversationId) return () => undefined;
    const key = `${tenantId}:${conversationId}`;
    const count = this.conversations.get(key) || 0;
    if (count >= this.limits.conversationConcurrency) throw new ToolExecutionError('conflict', 429, 'Tool concurrency limit exceeded');
    this.conversations.set(key, count + 1);
    let released = false;
    return () => { if (released) return; released = true; const next = (this.conversations.get(key) || 1) - 1; if (next > 0) this.conversations.set(key, next); else this.conversations.delete(key); };
  }

  cleanup(now = Date.now()): void {
    for (const [key, hits] of this.users) { const active = hits.filter(time => now - time < 60_000); if (active.length) this.users.set(key, active); else this.users.delete(key); }
    for (const [key, hits] of this.tenants) { const active = hits.filter(time => now - time < 60_000); if (active.length) this.tenants.set(key, active); else this.tenants.delete(key); }
  }
}
