export type AiPlatformErrorCode =
  | 'feature_disabled'
  | 'permission_denied'
  | 'invalid_request'
  | 'not_found'
  | 'conflict'
  | 'provider_unknown'
  | 'provider_not_configured'
  | 'storage_unavailable'
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
