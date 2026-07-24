export const OPENAI_REALTIME_VOICE_MANIFEST_VERSION = "2026-07-24";

const formats = [
  { codec: "slin16", sampleRate: 16000 },
  { codec: "ulaw", sampleRate: 8000 },
] as const;

export const OPENAI_REALTIME_VOICE_MANIFEST = [
  "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse",
  "marin", "cedar",
].map((voiceId, index) => ({
  provider: "openai_realtime",
  voiceId,
  displayName: voiceId.charAt(0).toUpperCase() + voiceId.slice(1),
  description: `OpenAI Realtime voice ${voiceId}`,
  modelCompatibility: ["gpt-realtime-2.1"],
  supportedOutputFormats: formats.map(({ codec }) => codec),
  supportedSampleRates: [...new Set(formats.map(({ sampleRate }) => sampleRate))],
  previewAvailable: true,
  sortOrder: (index + 1) * 10,
}));
