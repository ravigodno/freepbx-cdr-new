import { AiPlatformError } from '../core/errors.js';
import { parseJsonObject } from '../core/redaction.js';

export function validateBehaviorProfile(value:unknown){const data=parseJsonObject(value,'behavior profile');const sentences=Number(data.max_sentences??data.maxSentences??0),seconds=Number(data.max_voice_seconds??data.maxVoiceSeconds??0);if(sentences<1||sentences>10||seconds<1||seconds>60)throw new AiPlatformError('invalid_request',400,'Invalid behavior limits');return data}
export function validateTransferPolicy(value:unknown){const data=parseJsonObject(value,'transfer policy');if(data.priority!=='CRITICAL'||!Array.isArray(data.triggers)||(data.triggers as unknown[]).length===0)throw new AiPlatformError('invalid_request',400,'Invalid human transfer policy');return data}
export function validateAutonomyPolicy(level:unknown,value:unknown){if(!['SAFE','ASSISTED','AUTONOMOUS'].includes(String(level)))throw new AiPlatformError('invalid_request',400,'Invalid autonomy level');const data=parseJsonObject(value,'autonomy policy');if(String(level)==='SAFE'&&data.actionsRequireApproval!==true)throw new AiPlatformError('invalid_request',400,'SAFE policy requires approval');return data}
