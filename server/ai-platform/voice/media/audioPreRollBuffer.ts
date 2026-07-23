import type { AudioFrame } from "./mediaTypes.js";

export class AudioPreRollBuffer {
  private frames: AudioFrame[] = [];
  constructor(private readonly maximumMs = 240) {}
  push(frame: AudioFrame) {
    this.frames.push(frame);
    let duration = this.frames.reduce((sum, item) => sum + item.durationMs, 0);
    while (duration > this.maximumMs && this.frames.length) {
      duration -= this.frames.shift()!.durationMs;
    }
  }
  snapshot() {
    return [...this.frames];
  }
  clear() {
    this.frames = [];
  }
  durationMs() {
    return this.frames.reduce((sum, item) => sum + item.durationMs, 0);
  }
}
