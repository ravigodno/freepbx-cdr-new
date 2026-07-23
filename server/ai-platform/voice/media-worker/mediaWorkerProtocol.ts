export const MEDIA_WORKER_PROTOCOL_VERSION = 1 as const;
export type MediaWorkerCommandType =
  | "create_session"
  | "configure_session"
  | "enqueue_response_audio"
  | "provider_response_done"
  | "cancel_response"
  | "close_session"
  | "shutdown"
  | "health_check";
export type MediaWorkerEventType =
  | "session_ready"
  | "ingress_audio"
  | "batch_accepted"
  | "frame_played"
  | "queue_low"
  | "response_playout_started"
  | "response_playout_completed"
  | "response_playout_interrupted"
  | "session_metrics"
  | "worker_error"
  | "health_status";
export interface MediaWorkerEnvelope {
  version: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: MediaWorkerCommandType | MediaWorkerEventType;
  request_id?: string;
  session_ref?: string;
  response_ref?: string;
  item_ref?: string;
  sequence?: number;
  payload?: unknown;
}
