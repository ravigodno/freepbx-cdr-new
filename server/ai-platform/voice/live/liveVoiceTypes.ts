export interface LiveVoiceConfig {
  enabled: boolean;
  transport: "audiosocket";
  testExtension: string | null;
  testContext: string;
  stasisApplication: string;
  allowedCallers: string[];
  provider: "synthetic" | "openai_realtime";
  transferTestEnabled: boolean;
  dialplanConfirmed: boolean;
}
export interface LiveReadinessItem {
  key: string;
  ready: boolean;
  code: string | null;
}
export interface LiveReadiness {
  ready: boolean;
  items: LiveReadinessItem[];
  safe: {
    extensionLabel: string | null;
    transport: "audiosocket";
    provider: string;
    allowedCallersCount: number;
    stasisApplication: string;
  };
}
export interface LiveRuntimeMetrics {
  startupMs: number | null;
  firstAudioMs: number | null;
  bargeInMs: number | null;
  transferStartMs: number | null;
  controlOperationDelayMs: number | null;
  greetingStartDelayMs: number | null;
  startedAt: number;
}
