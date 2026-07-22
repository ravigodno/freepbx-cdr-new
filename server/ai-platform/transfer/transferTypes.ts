import type{AgentActorType}from'../core/contracts.js';
export type TransferDestinationType='extension'|'queue'|'ring_group'|'operator_role'|'fallback_number'|'voicemail'|'callback_request';
export type TransferStatus='requested'|'resolving'|'ready'|'executing'|'completed'|'failed'|'unavailable'|'cancelled'|'expired'|'dry_run_completed';
export type TransferTriggerType='explicit_human_request'|'policy_escalation'|'repeated_failure'|'urgent_request'|'admin_test';
export interface TransferDestinationConfig{type:TransferDestinationType;ref?:string}
export interface HumanTransferConfig{enabled:boolean;primaryDestination:TransferDestinationConfig;fallbacks:TransferDestinationConfig[];outsideBusinessHoursAction:TransferDestinationType;announceBeforeTransfer:boolean;maxResolveMs:number;maxExecutionMs:number;policyKey?:string}
export interface TransferDestination{type:TransferDestinationType;ref:string|null;safeLabel:string;available:boolean;fallback:boolean}
export interface TransferRequestInput{tenantId:number;traceId:string;conversationId:number|null;voiceSessionId?:number|null;agentId:number;agentVersionId:number;requestedByType:AgentActorType;requestedById:string|null;triggerType:TransferTriggerType;triggerText?:string;liveCallId?:string|null;dryRun:boolean}
export interface TransferProjection{id:number;status:TransferStatus;triggerType:TransferTriggerType;destinationType:TransferDestinationType|null;destinationSafeLabel:string|null;fallbackAction:string|null;fallbackAvailable:boolean;failureCode:string|null;requestedAt:string|null;startedAt:string|null;completedAt:string|null;failedAt:string|null;callbackRequired:boolean;transferMode:'dry_run'|'live_test'}
export interface TransferHooks{onTransferRequested(input:{conversationId:number|null;traceId:string}):Promise<void>|void}
