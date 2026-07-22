import crypto from 'crypto';
import { sanitizeLogText } from '../logAnalysis/redaction.js';

export type AiConfidence = 'confirmed'|'high'|'medium'|'low'|'insufficient_data';
export type AiErrorCode = 'provider_not_configured'|'provider_timeout'|'provider_rate_limited'|'provider_auth_failed'|'provider_unavailable'|'provider_response_invalid'|'context_too_large'|'request_cancelled'|'groundedness_failed';
export interface AiFact { text:string; sourceType:string; evidenceIndexes:number[]; confidence:AiConfidence }
export interface AiRecommendation { text:string; basedOn:number[]; confidence:AiConfidence; isActionRequired:boolean }
export interface AiModelDraft { explanation:string; facts:AiFact[]; confidence:AiConfidence; recommendations:AiRecommendation[]; limitations:string[] }
export interface RedactionStats { phones:number; ips:number; ids:number; names:number; secrets:number; paths:number; stringsTruncated:number }
export interface PreparedAiContext { value:any; limitations:string[]; stats:RedactionStats; jsonBytes:number; preparationMs:number }

export class AiAnalystError extends Error { constructor(public code:AiErrorCode, public statusCode:number, message:string, public retryAfterSeconds?:number){super(message);this.name='AiAnalystError'} }
const CONFIDENCE:Record<AiConfidence,number>={insufficient_data:0,low:1,medium:2,high:3,confirmed:4};
const MAX_JSON=32*1024, MAX_STRING=600, MAX_EVIDENCE=20, MAX_PROBLEMS=12, MAX_RECOMMENDATIONS=12;
const SECRET_KEY=/api.?key|password|passwd|secret|token|authorization|proxy.authorization|cookie|session|credential/i;
const ID_KEY=/caller|callee|number|extension|endpoint|peer|ip|did|uniqueid|linkedid|call.?id|channel|recording|filename|path|email|user.?agent|person|name|trunk|queue/i;
const clean=(v:unknown,max=MAX_STRING)=>sanitizeLogText(String(v??'').normalize('NFKC').replace(/<\/?(?:script|style)[^>]*>/gi,'').replace(/```/g,'').replace(/[{}]/g,'').replace(/ignore (?:all |the )?previous instructions|reveal (?:the )?system prompt|execute (?:sql|shell)|выполни (?:sql|команду)/gi,'[UNTRUSTED_TEXT]'),max);

export function confidenceCeiling(requested:unknown, ceiling:AiConfidence):AiConfidence{
  const value=(['confirmed','high','medium','low','insufficient_data'].includes(String(requested))?String(requested):'low') as AiConfidence;
  return CONFIDENCE[value]<=CONFIDENCE[ceiling]?value:ceiling;
}

export function prepareAiContext(input:any):PreparedAiContext{
  const started=Date.now(),stats:RedactionStats={phones:0,ips:0,ids:0,names:0,secrets:0,paths:0,stringsTruncated:0},limitations:string[]=[];
  const maps=new Map<string,Map<string,string>>();
  const alias=(kind:string,raw:string)=>{let m=maps.get(kind);if(!m){m=new Map();maps.set(kind,m)}if(!m.has(raw))m.set(raw,`${kind}_${m.size+1}`);return m.get(raw)!};
  const redactText=(raw:unknown)=>{const original=String(raw??'');if(original.length>MAX_STRING)stats.stringsTruncated++;let v=clean(original);
    v=v.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[0-9a-f]{0,4}:[0-9a-f:]{2,}\b/gi,x=>{stats.ips++;return alias('IP',x)});
    v=v.replace(/[A-Z]:\\[^\s]+|\/(?:var|home|root|etc|opt|tmp)\/[^\s]+/gi,x=>{stats.paths++;return alias('PATH',x)});
    v=v.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,x=>{stats.names++;return alias('EMAIL',x.toLowerCase())});
    v=v.replace(/\+?\d[\d() .-]{5,}\d/g,x=>{stats.phones++;return alias('PHONE',x.replace(/\D/g,''))});
    v=v.replace(/\b\d{2,6}\b/g,x=>['403','404','408','480','486','487','500','503','603'].includes(x)?x:(stats.phones++,alias('PHONE',x)));
    return v;
  };
  const visit=(value:any,key=''):any=>{if(value==null||typeof value==='boolean'||typeof value==='number')return value;if(typeof value==='string'){
      if(SECRET_KEY.test(key)){stats.secrets++;return '[REDACTED]'}
      if(ID_KEY.test(key)){stats.ids++;const kind=/ip/i.test(key)?'IP':/trunk/i.test(key)?'TRUNK':/queue/i.test(key)?'QUEUE':/endpoint|peer/i.test(key)?'ENDPOINT':/name|caller|callee/i.test(key)?'PERSON':'ID';return alias(kind,clean(value,200))}
      return redactText(value);
    }if(Array.isArray(value))return value.map(v=>visit(v,key));const out:any={};for(const [k,v] of Object.entries(value)){if(SECRET_KEY.test(k)){stats.secrets++;continue}out[k]=visit(v,k)}return out};
  const compact={...input,evidence:(input.evidence||[]).slice(0,MAX_EVIDENCE),problems:(input.problems||[]).slice(0,MAX_PROBLEMS),recommendations:(input.recommendations||[]).slice(0,MAX_RECOMMENDATIONS),route:(input.route||[]).slice(0,12)};
  if((input.evidence||[]).length>MAX_EVIDENCE||(input.problems||[]).length>MAX_PROBLEMS||(input.recommendations||[]).length>MAX_RECOMMENDATIONS)limitations.push('context_truncated');
  let value=visit(compact),json=JSON.stringify(value);if(Buffer.byteLength(json)>MAX_JSON){limitations.push('context_truncated');value={kind:value.kind,call:value.call,diagnosis:value.diagnosis,evidence:(value.evidence||[]).slice(0,8),problems:(value.problems||[]).slice(0,6),recommendations:(value.recommendations||[]).slice(0,6),limitations:['context_truncated']};json=JSON.stringify(value)}
  if(Buffer.byteLength(json)>MAX_JSON)throw new AiAnalystError('context_too_large',413,'Контекст AI превышает безопасный лимит');
  return{value,limitations:[...new Set(limitations)],stats,jsonBytes:Buffer.byteLength(json),preparationMs:Date.now()-started};
}

function validIndexes(value:any,max:number){return Array.isArray(value)&&value.length>0&&value.length<=8&&value.every((x:any)=>Number.isInteger(x)&&x>=0&&x<max)}
export function parseAiDraft(raw:string,evidenceCount:number,ceiling:AiConfidence,evidence:any[]=[],groundedRecommendations:string[]=[]):AiModelDraft{
  let parsed:any;try{parsed=JSON.parse(String(raw).trim().replace(/^```json\s*|\s*```$/g,''))}catch{throw new AiAnalystError('provider_response_invalid',502,'AI provider вернул невалидный JSON')}
  if(parsed&&typeof parsed.explanation==='string'&&validIndexes(parsed.evidenceIndexes,evidenceCount)&&Array.isArray(parsed.limitations)&&!parsed.facts){const indexes=parsed.evidenceIndexes.slice(0,8),facts=indexes.map((index:number)=>({text:clean(evidence[index]?.message,500),sourceType:clean(evidence[index]?.source,40),evidenceIndexes:[index],confidence:ceiling}));return{explanation:clean(parsed.explanation,4000),facts,confidence:confidenceCeiling(parsed.confidence,ceiling),recommendations:groundedRecommendations.slice(0,12).map(text=>({text:clean(text,500),basedOn:indexes,confidence:ceiling,isActionRequired:true})),limitations:parsed.limitations.map((x:any)=>clean(x,100)).filter(Boolean)}}
  if(!parsed||typeof parsed.explanation!=='string'||!Array.isArray(parsed.facts)||!Array.isArray(parsed.recommendations)||!Array.isArray(parsed.limitations))throw new AiAnalystError('provider_response_invalid',502,'Ответ AI не соответствует схеме');
  if(parsed.facts.length>20||parsed.recommendations.length>12||parsed.limitations.length>12)throw new AiAnalystError('provider_response_invalid',502,'Ответ AI превышает лимиты схемы');
  const facts=parsed.facts.map((f:any)=>{if(!f||typeof f.text!=='string'||typeof f.sourceType!=='string'||!validIndexes(f.evidenceIndexes,evidenceCount))throw new AiAnalystError('provider_response_invalid',502,'Факт AI не связан с evidence');return{text:clean(f.text,500),sourceType:clean(f.sourceType,40),evidenceIndexes:f.evidenceIndexes,confidence:confidenceCeiling(f.confidence,ceiling)}});
  const recommendations=parsed.recommendations.map((r:any)=>{if(!r||typeof r.text!=='string'||!validIndexes(r.basedOn,evidenceCount)||typeof r.isActionRequired!=='boolean')throw new AiAnalystError('provider_response_invalid',502,'Рекомендация AI не имеет основания');return{text:clean(r.text,500),basedOn:r.basedOn,confidence:confidenceCeiling(r.confidence,ceiling),isActionRequired:r.isActionRequired}});
  return{explanation:clean(parsed.explanation,4000),facts,confidence:confidenceCeiling(parsed.confidence,ceiling),recommendations,limitations:parsed.limitations.map((x:any)=>clean(x,100)).filter(Boolean)};
}

export function validateGroundedness(draft:AiModelDraft,context:any,ceiling:AiConfidence){const serialized=JSON.stringify(context),violations:string[]=[];
  const claims=[draft.explanation,...draft.facts.map(x=>x.text),...draft.recommendations.map(x=>x.text)].join(' '),evidence=context.evidence||[];
  const codes=[...claims.matchAll(/\b[1-6]\d\d\b/g)].map(x=>x[0]);for(const code of codes)if(!serialized.includes(code))violations.push('unsupported_sip_code');
  const aliases=[...claims.matchAll(/\b(?:PHONE|IP|TRUNK|QUEUE|ENDPOINT|ID|PERSON)_\d+\b/g)].map(x=>x[0]);for(const alias of aliases)if(!serialized.includes(alias))violations.push('unsupported_object');
  for(const fact of draft.facts)for(const index of fact.evidenceIndexes)if(String(evidence[index]?.source||'')!==fact.sourceType)violations.push('source_mismatch');
  if(/перезапущен|исправлен[аоы]?|настройки изменены|блокировал номер|проблема (?:в|с) интернет|клиент положил трубку/i.test(claims)||(/качество отличн/i.test(claims)&&!context.quality?.available))violations.push('unsupported_action_or_cause');
  if(context.diagnosis?.status==='insufficient_data'&&!/недостаточно|ограничен/i.test(draft.explanation))violations.push('missing_data_claim');
  if(CONFIDENCE[draft.confidence]>CONFIDENCE[ceiling])violations.push('confidence_inflation');
  if(violations.length)throw new AiAnalystError('groundedness_failed',502,'Ответ отклонён проверкой достоверности');return{valid:true,violations:[],validationMs:0};}

export function safeId(value:unknown){return crypto.createHash('sha256').update(String(value??'')).digest('hex').slice(0,16)}
