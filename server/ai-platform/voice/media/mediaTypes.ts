export type MediaTransportMode = "synthetic" | "external_media" | "audiosocket";
export type MediaSessionState =
  | "created"
  | "negotiating"
  | "ready"
  | "streaming"
  | "paused"
  | "draining"
  | "completed"
  | "failed"
  | "cancelled";
export type AudioCodec = "ulaw" | "alaw" | "slin16" | "opus";
export interface AudioFormat {
  codec: AudioCodec;
  sampleRate: number;
  channels: 1;
  frameDurationMs: number;
}
export interface AudioFrame {
  sequence: number;
  timestampMs: number;
  direction: "ingress" | "egress";
  codec: AudioCodec;
  sampleRate: number;
  channels: 1;
  durationMs: number;
  payload: Uint8Array;
  source: string;
  traceId: string;
  voiceSessionId: number;
  mediaSessionId: number;
  responseId?: string;
  providerItemId?: string;
  providerArrivedAtMs?: number;
  providerDeltaBytes?: number;
  providerEventSequence?: number;
  contentIndex?: number;
}
export interface AudioSocketProtocolCapabilities {
  supportedInboundPacketTypes: readonly number[];
  supportedOutboundPacketTypes: readonly number[];
  preferredAsteriskPacketType: number;
  preferredAsteriskSampleRate: number;
  internalSampleRate: number;
  resamplingRequired: boolean;
  transportFormat: "ast18_slin8" | "slin16";
}
export interface AudioSocketProtocolMetrics {
  audiosocketIngressPackets: number;
  audiosocketEgressPackets: number;
  ingressPacketType: string | null;
  egressPacketType: string | null;
  ingressSourceSampleRate: number | null;
  egressTargetSampleRate: number | null;
  ingressResampledFrames: number;
  egressResampledFrames: number;
  unknownPacketTypes: number;
  malformedPackets: number;
  unsupportedAudioPackets: number;
  protocolErrors: number;
  firstIngressAudioAt: string | null;
  firstEgressAudioAt: string | null;
  egressSocketBackpressureCount?: number;
  audioSocketWriteErrors?: number;
  providerAudioFramesAccepted?: number;
  providerAudioDurationMsAccepted?: number;
  playoutFramesWritten?: number;
  playoutDurationMsWritten?: number;
  queuedAudioMsCurrent?: number;
  queuedAudioMsPeak?: number;
  prebufferMsCurrent?: number;
  prebufferMsMin?: number;
  prebufferMsAvg?: number;
  prebufferMsMax?: number;
  startupBufferMsActual?: number;
  lowWaterEvents?: number;
  starvationEvents?: number;
  starvationDurationMs?: number;
  providerDeliveryGapDuringPlayoutMs?: number;
  schedulerLateFrames?: number;
  schedulerLagAvgMs?: number | null;
  schedulerLagP95Ms?: number | null;
  schedulerLagMaxMs?: number | null;
  responseLimitRejectedFrames?: number;
  bargeInDiscardedFrames?: number;
  sessionEndDiscardedFrames?: number;
  malformedRejectedFrames?: number;
  audioConservationMismatch?: number;
  playoutPauseCount?: number;
  playoutResumeCount?: number;
  realBurstEvents?: number;
  framesPerBurstAvg?: number | null;
  framesPerBurstP95?: number | null;
  framesPerBurstMax?: number | null;
  bufferedAudioMs?: number;
  adaptivePrebufferMs?: number;
  playoutUnderruns?: number;
  outputBursts?: number;
  egressPacketGapP95Ms?: number | null;
  egressPacketGapMaxMs?: number | null;
  eventLoopLagP95Ms?: number | null;
  eventLoopLagMaxMs?: number | null;
  sourcePackets: number;
  sourcePacketDurationMsAvg: number | null;
  sourcePacketDurationMsP95: number | null;
  packetizedFrames: number;
  framesPerPacketAvg: number | null;
  framesPerPacketP95: number | null;
  remainderBytes: number;
  remainderPeakBytes: number;
  partialFrameDropped: number;
  oversizedPackets: number;
  oddLengthPackets: number;
  packetizationErrors: number;
  consecutivePacketizationErrors: number;
  packetizationErrorThreshold: number;
}
export interface MediaTransportCapabilities {
  mode: MediaTransportMode;
  available: boolean;
  live: boolean;
  network: boolean;
  codecs: readonly AudioCodec[];
  audioSocketProtocol?: AudioSocketProtocolCapabilities;
}
export interface MediaTransportContext {
  tenantId: number;
  traceId: string;
  voiceSessionId: number;
  mediaSessionId: number;
  format: AudioFormat;
  signal: AbortSignal;
}
export interface MediaSessionProjection {
  id: number;
  tenantId: number;
  voiceSessionId: number;
  transportMode: MediaTransportMode;
  state: MediaSessionState;
  codecIn: string;
  codecOut: string;
  sampleRateIn: number;
  sampleRateOut: number;
  channelsIn: number;
  channelsOut: number;
  frameDurationMs: number;
  ingressFrames: number;
  egressFrames: number;
  ingressBytes: number;
  egressBytes: number;
  droppedFrames: number;
  reorderedFrames: number;
  duplicateFrames: number;
  jitterMsAvg: number | null;
  jitterMsP95: number | null;
  ingressLatencyMsAvg: number | null;
  egressLatencyMsAvg: number | null;
  firstAudioAt: string | null;
  lastAudioAt: string | null;
  startedAt: string;
  endedAt: string | null;
  failureCode: string | null;
  vadState: string;
  bargeInCount: number;
  queueDepth: number;
  memoryEstimateBytes: number;
  audioSocketProtocol: AudioSocketProtocolMetrics | null;
  transportFormat: string | null;
  sourceSampleRate: number | null;
  internalSampleRate: number;
  targetSampleRate: number | null;
  resampling: boolean;
  greetingStatus: string | null;
}
export type SyntheticFixture =
  | "silence"
  | "speech"
  | "noise"
  | "reordered_sequence"
  | "duplicate_sequence"
  | "packet_loss";
