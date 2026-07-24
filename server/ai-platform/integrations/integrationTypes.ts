export type IntegrationProviderType='generic_rest'|'generic_webhook'|'bitrix24'|'amocrm'|'1c'|'retailcrm'|'custom_crm'|'mock_crm';
export type SideEffectLevel='read_only'|'reversible_write'|'consequential_write'|'destructive';
export type IntegrationErrorCode='INTEGRATION_DISABLED'|'ACTION_NOT_ALLOWED'|'CONFIRMATION_REQUIRED'|'AUTH_FAILED'|'TIMEOUT'|'RATE_LIMITED'|'VALIDATION_FAILED'|'REMOTE_NOT_FOUND'|'REMOTE_CONFLICT'|'REMOTE_UNAVAILABLE'|'RESPONSE_SCHEMA_INVALID'|'IDEMPOTENCY_CONFLICT'|'INTERNAL_CONNECTOR_ERROR';
export interface IntegrationActionDefinition{actionId:string;title:string;description:string;inputSchema:Record<string,unknown>;outputSchema:Record<string,unknown>;sideEffectLevel:SideEffectLevel;confirmationPolicy:'none'|'policy'|'required'|'denied';idempotencyPolicy:'none'|'conversation_action_business_key';timeoutMs:number;allowedRoles:string[];dataClassification:'public'|'internal'|'personal';auditPolicy:'metadata_only'}
export interface ConnectorRequest{requestId:string;actionId:string;input:Record<string,unknown>;idempotencyKey:string|null;dryRun:boolean}
export interface ConnectorResult{status:'completed'|'accepted'|'pending';data:Record<string,unknown>;externalObjectId?:string|null;latencyMs:number}
export interface IntegrationConnector{execute(integration:any,mapping:any,credential:Record<string,string>|null,request:ConnectorRequest):Promise<ConnectorResult>;health(integration:any,credential:Record<string,string>|null):Promise<{status:string;latencyMs:number}>}

