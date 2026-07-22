import { redactAiPlatformText } from "../../core/redaction.js";
import type {
  RealtimeVoiceEvent,
  RealtimeTranscriptKind,
} from "./realtimeVoiceTypes.js";
const transcriptTypes: Record<string, RealtimeTranscriptKind> = {
  "conversation.item.input_audio_transcription.delta": "input_partial",
  "conversation.item.input_audio_transcription.completed": "input_final",
  "response.output_audio_transcript.delta": "output_partial",
  "response.output_audio_transcript.done": "output_final",
  "response.audio_transcript.delta": "output_partial",
  "response.audio_transcript.done": "output_final",
  "response.output_text.delta": "output_generated_partial",
  "response.output_text.done": "output_generated_final",
  "response.text.delta": "output_generated_partial",
  "response.text.done": "output_generated_final",
};
export function normalizeOpenAIRealtimeEvent(
  raw: any,
  frameFactory: (payload: Uint8Array) => any,
): RealtimeVoiceEvent | null {
  const type = String(raw?.type || "");
  if (type === "session.created")
    return {
      type: "session_connected",
      providerSessionRef: String(raw?.session?.id || ""),
    };
  if (type === "session.updated") return { type: "session_configured" };
  if (type === "input_audio_buffer.speech_started")
    return { type: "input_audio_started" };
  if (type === "input_audio_buffer.committed")
    return { type: "input_audio_committed" };
  if (type === "response.created") return { type: "response_started" };
  if (type === "response.done")
    return {
      type:
        raw?.response?.status === "cancelled"
          ? "response_cancelled"
          : "response_completed",
      eventId: String(raw?.event_id || "").slice(0, 191) || undefined,
      usage: raw?.response?.usage && typeof raw.response.usage === "object" ? raw.response.usage : undefined,
    };
  if (type === "response.cancelled") return { type: "response_cancelled" };
  if (
    (type === "response.output_audio.delta" ||
      type === "response.audio.delta") &&
    typeof raw.delta === "string"
  )
    return {
      type: "output_audio",
      frame: frameFactory(Buffer.from(raw.delta, "base64")),
    };
  if (transcriptTypes[type])
    return {
      type: "transcript",
      kind: transcriptTypes[type],
      text: redactAiPlatformText(raw.delta || raw.transcript || "").slice(
        0,
        1000,
      ),
      ...(raw?.event_id?{eventId:String(raw.event_id).slice(0,191)}:{}),
      ...(raw?.item_id||raw?.item?.id?{itemId:String(raw.item_id||raw.item.id).slice(0,191)}:{}),
      ...(raw?.response_id?{responseId:String(raw.response_id).slice(0,191)}:{}),
      ...(Number.isFinite(raw?.confidence)?{confidence:Number(raw.confidence)}:{}),
    };
  if (type === "response.output_item.added" || type === "response.output_item.done")
    return {type:"response_item",status:type.endsWith("done")?"done":"added",eventId:String(raw?.event_id||"").slice(0,191)||undefined,itemId:String(raw?.item?.id||raw?.item_id||"").slice(0,191)||undefined,role:String(raw?.item?.role||"").slice(0,32)||undefined};
  if (type === "conversation.item.input_audio_transcription.failed")
    return {type:"transcript_unavailable",speaker:"caller",errorCode:safeErrorCode(raw?.error?.code||raw?.error?.type||"transcript_unavailable")};
  if (type === "response.function_call_arguments.done")
    return {
      type: "tool_call",
      toolKey: String(raw.name || ""),
      arguments: safeJson(raw.arguments),
      callId: String(raw.call_id || "").slice(0, 100),
    };
  if (type === "error")
    return {
      type: "error",
      errorCode: safeErrorCode(raw?.error?.code || raw?.error?.type),
    };
  return null;
}
function safeErrorCode(value: unknown) {
  const code = String(value || "provider_error")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .slice(0, 64);
  return code || "provider_error";
}
function safeJson(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
