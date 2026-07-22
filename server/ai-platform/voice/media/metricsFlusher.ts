export class MetricsFlusher {
  private dirty = false;
  private flushing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private rerun = false;
  private count = 0;
  private failures = 0;
  private lastFlushedAt: string | null = null;
  constructor(
    private readonly flushFn: () => Promise<void>,
    private readonly intervalMs = 1000,
    private readonly onFailure?: (error: unknown) => void,
  ) {}
  markDirty() {
    if (this.stopped) return;
    this.dirty = true;
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.intervalMs);
  }
  async flush() {
    if (this.flushing) {
      this.rerun = true;
      return this.flushing;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.flushing = (async () => {
      try {
        await this.flushFn();
        this.count++;
        this.lastFlushedAt = new Date().toISOString();
      } catch (error) {
        this.failures++;
        this.onFailure?.(error);
      }
    })();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
      if (this.rerun || this.dirty) {
        this.rerun = false;
        this.markDirty();
      }
    }
  }
  async final(timeoutMs = 1000) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.dirty = true;
    await Promise.race([
      this.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    this.stopped = true;
  }
  getMetrics() {
    return {
      metricsFlushCount: this.count,
      metricsFlushFailures: this.failures,
      metricsLastFlushedAt: this.lastFlushedAt,
      dirty: this.dirty,
      flushInFlight: Boolean(this.flushing),
    };
  }
}
