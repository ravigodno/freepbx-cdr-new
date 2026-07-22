import type { ProviderResponse } from '../core/contracts.js';
export interface SandboxActor{traceId:string;actorId:string|null}
export interface RuntimeResult{message:string;conversationId:number;sessionId:number;intent:string|null;transferRequired:boolean;recommendedResponseDelayMs:number;interruptible:boolean;provider:string|null;model:string|null;latencyMs:number|null;context:{selectedKnowledgeIds:number[];selectedTrainingIds:number[];contextChars:number;truncated:boolean}}
export type ProviderExecutor=(input:{messages:{role:'system'|'user'|'assistant';content:string}[];traceId:string})=>Promise<ProviderResponse>;
