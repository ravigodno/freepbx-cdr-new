import { MediaError } from "./mediaErrors.js";
export class AudioResampler {
  resamplePcm16(input: Int16Array, fromRate: number, toRate: number) {
    if (fromRate === toRate) return new Int16Array(input);
    if (
      ![8000, 16000, 24000].includes(fromRate) ||
      ![8000, 16000, 24000].includes(toRate)
    )
      throw new MediaError(
        "unsupported_codec",
        400,
        "Unsupported sample rate conversion",
      );
    const length = Math.max(1, Math.round((input.length * toRate) / fromRate)),
      out = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const position = (i * fromRate) / toRate,
        left = Math.min(input.length - 1, Math.floor(position)),
        right = Math.min(input.length - 1, left + 1),
        fraction = position - left;
      out[i] = Math.round(
        input[left] * (1 - fraction) + input[right] * fraction,
      );
    }
    return out;
  }
}

export class StreamingPcm16To8Downsampler {
  private static readonly coefficients = createLowPassFir(63, 3600 / 16000);
  private history = new Float64Array(
    StreamingPcm16To8Downsampler.coefficients.length - 1,
  );
  private initialized = false;

  process(input: Int16Array) {
    if (!input.length) return new Int16Array();
    if (!this.initialized) {
      this.history.fill(input[0]);
      this.initialized = true;
    }
    const combined = new Float64Array(this.history.length + input.length);
    combined.set(this.history);
    combined.set(input, this.history.length);
    const output = new Int16Array(Math.floor(input.length / 2));
    let outputIndex = 0;
    for (let index = 0; index < input.length; index++) {
      if (index % 2 === 1) {
        const end = this.history.length + index;
        let filtered = 0;
        for (
          let tap = 0;
          tap < StreamingPcm16To8Downsampler.coefficients.length;
          tap++
        )
          filtered +=
            combined[end - tap] *
            StreamingPcm16To8Downsampler.coefficients[tap];
        output[outputIndex++] = Math.max(
          -32768,
          Math.min(32767, Math.round(filtered)),
        );
      }
    }
    this.history.set(combined.subarray(combined.length - this.history.length));
    return output;
  }

  reset() {
    this.history.fill(0);
    this.initialized = false;
  }
}

function createLowPassFir(taps: number, normalizedCutoff: number) {
  const coefficients = new Float64Array(taps),
    center = (taps - 1) / 2;
  let total = 0;
  for (let index = 0; index < taps; index++) {
    const distance = index - center,
      sinc =
        distance === 0
          ? 2 * normalizedCutoff
          : Math.sin(2 * Math.PI * normalizedCutoff * distance) /
            (Math.PI * distance),
      window = 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (taps - 1));
    coefficients[index] = sinc * window;
    total += coefficients[index];
  }
  for (let index = 0; index < taps; index++) coefficients[index] /= total;
  return coefficients;
}
