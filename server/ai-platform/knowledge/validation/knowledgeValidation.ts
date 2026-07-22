import crypto from 'crypto';
import { AiPlatformError } from '../../core/errors.js';
import { redactAiPlatformValue } from '../../core/redaction.js';

export const KNOWLEDGE_SOURCE_TYPES=['document','text','faq','url','manual'] as const;
export function validateKnowledgeContent(value:unknown):string{const content=String(value||'').trim();if(!content)throw new AiPlatformError('invalid_request',400,'Knowledge content is required');if(content.length>1_000_000)throw new AiPlatformError('invalid_request',400,'Knowledge content is too large');if(redactAiPlatformValue({content}).stats.secrets>0)throw new AiPlatformError('invalid_request',400,'Secrets are not allowed in knowledge content');return content}
export function validateKnowledgeType(value:unknown){const type=String(value||'');if(!KNOWLEDGE_SOURCE_TYPES.includes(type as any))throw new AiPlatformError('invalid_request',400,'Invalid knowledge source type');return type}
export const knowledgeChecksum=(content:string)=>crypto.createHash('sha256').update(content).digest('hex');
