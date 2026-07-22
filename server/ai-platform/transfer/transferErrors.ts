import{AiPlatformError}from'../core/errors.js';
export type TransferFailureCode='destination_not_configured'|'destination_not_found'|'destination_unavailable'|'outside_business_hours'|'live_context_required'|'live_call_not_found'|'live_call_ended'|'transfer_not_allowed'|'transfer_timeout'|'transfer_failed'|'duplicate_transfer'|'feature_disabled';
export class TransferError extends AiPlatformError{constructor(public readonly failureCode:TransferFailureCode,statusCode=409,message='Human transfer unavailable'){super(failureCode,statusCode,message)}}
