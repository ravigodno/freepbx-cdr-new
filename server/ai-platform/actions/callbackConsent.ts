import{ApplicationEncryptionService,maskCallbackPhone,normalizePhone}from'./applicationEncryption.js';
export type CallbackFlowState={status:'offer_pending'|'awaiting_phone'|'awaiting_confirmation';transferRequestId:number|null;phoneEncrypted?:string;phoneMasked?:string;reason?:string};
const yes=/^(?:да|хорошо|согласен|согласна|перезвоните|да,?\s*перезвоните)[.!\s]*$/iu,denied=/^(?:нет|не надо|не нужно|отказываюсь)[.!\s]*$/iu;
export function classifyCallbackConsent(text:string,pending:boolean):'granted'|'denied'|'unknown'{if(!pending)return'unknown';const value=text.trim();return yes.test(value)?'granted':denied.test(value)?'denied':'unknown'}
export function extractCallbackPhone(text:string){const match=text.match(/\+?[\d\s()\-]{7,24}/);if(!match)return null;try{return normalizePhone(match[0])}catch{return null}}
export function protectCallbackState(phone:string,transferRequestId:number|null,reason:string,encryption=new ApplicationEncryptionService()):CallbackFlowState{const encrypted=encryption.encrypt(phone);return{status:'awaiting_confirmation',transferRequestId,phoneEncrypted:encrypted.ciphertext,phoneMasked:maskCallbackPhone(phone),reason:reason.slice(0,500)}}
