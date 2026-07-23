import crypto from "node:crypto";

type ResponseSilence = {
  frames: number;
  rmsTotal: number;
  rmsMin: number;
  peak: number;
  silentFrames: number;
  consecutiveSilentFrames: number;
  consecutiveSilentFramesMax: number;
};

export class ProviderSilenceTracker {
  private responses = new Map<string, ResponseSilence>();

  reset() {
    this.responses.clear();
  }

  record(responseRef: string | undefined, samples: Int16Array) {
    const key = responseRef || "unscoped";
    const current = this.responses.get(key) || {
      frames: 0,
      rmsTotal: 0,
      rmsMin: Number.POSITIVE_INFINITY,
      peak: 0,
      silentFrames: 0,
      consecutiveSilentFrames: 0,
      consecutiveSilentFramesMax: 0,
    };
    let squareTotal = 0,
      peak = 0;
    for (const sample of samples) {
      const absolute = Math.abs(sample);
      squareTotal += sample * sample;
      if (absolute > peak) peak = absolute;
    }
    const rms = samples.length ? Math.sqrt(squareTotal / samples.length) : 0,
      silent = rms < 120 && peak < 500;
    current.frames++;
    current.rmsTotal += rms;
    current.rmsMin = Math.min(current.rmsMin, rms);
    current.peak = Math.max(current.peak, peak);
    if (silent) {
      current.silentFrames++;
      current.consecutiveSilentFrames++;
      current.consecutiveSilentFramesMax = Math.max(
        current.consecutiveSilentFramesMax,
        current.consecutiveSilentFrames,
      );
    } else current.consecutiveSilentFrames = 0;
    this.responses.set(key, current);
  }

  metrics() {
    return [...this.responses.entries()].map(([responseRef, value]) => ({
      responseRefSafe: crypto
        .createHash("sha256")
        .update(responseRef)
        .digest("hex")
        .slice(0, 16),
      frameCount: value.frames,
      rmsAverage: value.frames ? value.rmsTotal / value.frames : 0,
      rmsMin: Number.isFinite(value.rmsMin) ? value.rmsMin : 0,
      peak: value.peak,
      silentFrameCount: value.silentFrames,
      consecutiveSilentFramesMax: value.consecutiveSilentFramesMax,
      providerSilenceGapMaxMs: value.consecutiveSilentFramesMax * 20,
    }));
  }
}
