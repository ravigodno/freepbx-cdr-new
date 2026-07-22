const BIAS = 0x84;
const CLIP = 32635;

export function encodePcm16ToUlaw(input: Int16Array) {
  const output = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index++) {
    let sample = input[index], sign = 0;
    if (sample < 0) { sign = 0x80; sample = -sample; }
    sample = Math.min(CLIP, sample) + BIAS;
    let exponent = 7;
    for (let mask = 0x4000; exponent > 0 && !(sample & mask); exponent--)
      mask >>= 1;
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    output[index] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return output;
}

export function decodeUlawToPcm16(input: Uint8Array) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index++) {
    const value = ~input[index] & 0xff,
      sign = value & 0x80,
      exponent = (value >> 4) & 0x07,
      mantissa = value & 0x0f;
    let sample = ((mantissa << 3) + BIAS) << exponent;
    sample -= BIAS;
    output[index] = sign ? -sample : sample;
  }
  return output;
}
