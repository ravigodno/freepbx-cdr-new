export type EnqueueResult = {
  accepted: boolean;
  dropped: boolean;
  depth: number;
};
export class BoundedSerialProcessor<T> {
  private queue: Array<{ value: T; queuedAt: number }> = [];
  private running = false;
  private accepting = true;
  private paused = false;
  private scheduled = false;
  private processing = false;
  private peak = 0;
  private dropped = 0;
  private processed = 0;
  private lag = 0;
  private times: number[] = [];
  private errors = 0;
  private drainWaiters: Array<() => void> = [];
  constructor(
    private readonly handler: (value: T) => void | Promise<void>,
    private readonly options: {
      capacity: number;
      batchSize?: number;
      signal?: AbortSignal;
      onError?: (error: unknown) => void;
      onDrop?: (value: T) => void;
    },
  ) {
    options.signal?.addEventListener("abort", () => void this.stop(false), {
      once: true,
    });
  }
  enqueue(value: T): EnqueueResult {
    if (!this.accepting || this.options.signal?.aborted)
      return { accepted: false, dropped: true, depth: this.queue.length };
    let dropped = false;
    if (this.queue.length >= this.options.capacity) {
      const removed = this.queue.shift();
      if (removed) this.options.onDrop?.(removed.value);
      this.dropped++;
      dropped = true;
    }
    this.queue.push({ value, queuedAt: Date.now() });
    this.peak = Math.max(this.peak, this.queue.length);
    this.schedule();
    return { accepted: true, dropped, depth: this.queue.length };
  }
  start() {
    this.running = true;
    this.paused = false;
    this.schedule();
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    this.running = true;
    this.schedule();
  }
  drain() {
    if (!this.queue.length && !this.processing) return Promise.resolve();
    return new Promise<void>((resolve) => this.drainWaiters.push(resolve));
  }
  clear() {
    this.queue.splice(0).forEach((item) => this.options.onDrop?.(item.value));
    this.resolveDrain();
  }
  async stop(drain = false) {
    this.accepting = false;
    this.running = false;
    if (!drain)
      this.queue.splice(0).forEach((item) => this.options.onDrop?.(item.value));
    else {
      this.running = true;
      this.schedule();
      await this.drain();
      this.running = false;
    }
    this.resolveDrain();
  }
  getMetrics() {
    const sorted = [...this.times].sort((a, b) => a - b);
    return {
      depth: this.queue.length,
      peak: this.peak,
      dropped: this.dropped,
      processed: this.processed,
      consumerLagMs: this.lag,
      processingTimeAvgMs: this.times.length
        ? this.times.reduce((a, b) => a + b, 0) / this.times.length
        : 0,
      processingTimeP95Ms: sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
        : 0,
      errors: this.errors,
    };
  }
  private schedule() {
    if (
      !this.running ||
      this.paused ||
      this.scheduled ||
      this.processing ||
      !this.queue.length
    )
      return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      void this.pump();
    });
  }
  private async pump() {
    if (this.processing) return;
    this.processing = true;
    try {
      let count = 0;
      while (
        this.running &&
        !this.paused &&
        this.queue.length &&
        count++ < (this.options.batchSize || 8)
      ) {
        const item = this.queue.shift()!;
        this.lag = Math.max(0, Date.now() - item.queuedAt);
        const started = Date.now();
        try {
          await this.handler(item.value);
          this.processed++;
        } catch (error) {
          this.errors++;
          this.options.onError?.(error);
        }
        this.times.push(Date.now() - started);
        if (this.times.length > 256) this.times.shift();
      }
    } finally {
      this.processing = false;
      this.resolveDrain();
      this.schedule();
    }
  }
  private resolveDrain() {
    if (this.queue.length || this.processing) return;
    for (const resolve of this.drainWaiters.splice(0)) resolve();
  }
}
