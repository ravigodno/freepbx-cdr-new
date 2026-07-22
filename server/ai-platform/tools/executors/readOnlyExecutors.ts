import type { ToolExecutionContext } from '../toolExecutionContext.js';
export type ReadExecutor = (input: any, signal: AbortSignal, context?: ToolExecutionContext) => Promise<any>;

export class ReadOnlyExecutorRegistry {
  private readonly map = new Map<string, ReadExecutor>();
  register(key: string, executor: ReadExecutor): void {
    if (!/^[a-z][a-z0-9_.-]+$/.test(key)) throw new Error('Invalid executor key');
    this.map.set(key, executor);
  }
  has(key: string): boolean { return this.map.has(key); }
  get(key: string): ReadExecutor {
    const executor = this.map.get(key);
    if (!executor) throw new Error('Unknown executor');
    return executor;
  }
  keys(): string[] { return [...this.map.keys()]; }
}
