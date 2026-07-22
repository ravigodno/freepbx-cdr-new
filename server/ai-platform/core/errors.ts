export type AiPlatformErrorCode =
  | 'feature_disabled'
  | 'permission_denied'
  | 'invalid_request'
  | 'not_found'
  | 'conflict'
  | 'provider_unknown'
  | 'provider_not_configured'
  | 'storage_unavailable'
  | 'rate_limited'
  | 'destination_not_configured'
  | 'destination_not_found'
  | 'destination_unavailable'
  | 'outside_business_hours'
  | 'live_context_required'
  | 'live_call_not_found'
  | 'live_call_ended'
  | 'transfer_not_allowed'
  | 'transfer_timeout'
  | 'transfer_failed'
  | 'duplicate_transfer'
  | 'encryption_not_configured'
  | 'consent_required'
  | 'action_timeout'
  | 'action_failed'
  | 'internal_error';

export class AiPlatformError extends Error {
  constructor(public code: AiPlatformErrorCode, public statusCode: number, message: string) {
    super(message);
    this.name = 'AiPlatformError';
  }
}

export function toSafeAiPlatformError(error: unknown): AiPlatformError {
  if (error instanceof AiPlatformError) return error;
  return new AiPlatformError('internal_error', 500, 'Внутренняя ошибка AI Platform');
}
