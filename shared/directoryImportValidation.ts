export type DirectoryPhoneField='phone'|'phone2'|'phone3'|'linkedExternalNumber'|'internalExtension';
export type DirectoryImportReason='invalid_length'|'invalid_characters'|'unsupported_prefix'|'scientific_notation'|'hidden_unicode'|'bom'|'whitespace'|'duplicate_in_file'|'duplicate_in_row'|'duplicate_in_database'|'parser_column_mismatch'|'invalid_type'|'invalid_visibility'|'invalid_boolean'|'empty_phone_and_email';
export interface DirectoryImportDiagnostic{rowNumber:number;field:DirectoryPhoneField|'row'|'type'|'visibility'|'isSpam';raw:string;trimmed:string;normalized:string;digitLength:number;codePoints:string[];reason:DirectoryImportReason;duplicateInFile:boolean;suggestedValue:string|null}
const hidden=/[\u200B-\u200D\u2060\uFEFF]/g;
export function normalizeDirectoryPhoneInput(value:unknown){
 const raw=String(value??''),trimmed=raw.trim(),withoutHidden=trimmed.replace(hidden,'').replace(/\u00A0|\u202F/g,' ').replace(/[−–—]/g,'-'),digits=withoutHidden.replace(/\D/g,'');
 return{raw,trimmed,cleaned:withoutHidden,digits,codePoints:Array.from(raw).map(char=>`U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4,'0')}`)};
}
export function diagnoseDirectoryPhone(value:unknown,field:DirectoryPhoneField,rowNumber:number):DirectoryImportDiagnostic|null{
 const v=normalizeDirectoryPhoneInput(value);if(!v.trimmed)return null;
 let reason:DirectoryImportReason|null=null;
 if(/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(v.cleaned))reason='scientific_notation';
 else if(/[\u200B-\u200D\u2060]/.test(v.raw))reason='hidden_unicode';
 else if(v.raw.includes('\uFEFF'))reason='bom';
 else if(/[\u00A0\u202F]/.test(v.raw))reason='whitespace';
 else if(!/^\+?[0-9\s\-()]+$/.test(v.cleaned))reason='invalid_characters';
 else if((v.cleaned.match(/\+/g)||[]).length>1||(v.cleaned.includes('+')&&!v.cleaned.startsWith('+')))reason='unsupported_prefix';
 else if(v.digits.length<2||v.digits.length>11)reason='invalid_length';
 if(!reason)return null;
 return{rowNumber,field,raw:v.raw,trimmed:v.trimmed,normalized:v.digits,digitLength:v.digits.length,codePoints:v.codePoints,reason,duplicateInFile:false,suggestedValue:['hidden_unicode','bom','whitespace'].includes(reason)?v.cleaned:null};
}
export function validateDirectoryPhone(value:unknown){const normalized=normalizeDirectoryPhoneInput(value),diagnostic=diagnoseDirectoryPhone(value,'phone',0),fixable=diagnostic&&['hidden_unicode','bom','whitespace'].includes(diagnostic.reason);return{valid:diagnostic===null||Boolean(fixable),digits:normalized.digits,cleaned:normalized.cleaned,reason:diagnostic?.reason||null}}
export function diagnoseDirectoryExtension(value:unknown,rowNumber:number):DirectoryImportDiagnostic|null{
 const v=normalizeDirectoryPhoneInput(value);if(!v.trimmed)return null;
 let reason:DirectoryImportReason|null=null;
 if(/[\u200B-\u200D\u2060]/.test(v.raw))reason='hidden_unicode';else if(v.raw.includes('\uFEFF'))reason='bom';else if(!/^\d+$/.test(v.cleaned))reason='invalid_characters';else if(v.digits.length<2||v.digits.length>11)reason='invalid_length';
 return reason?{rowNumber,field:'internalExtension',raw:v.raw,trimmed:v.trimmed,normalized:v.digits,digitLength:v.digits.length,codePoints:v.codePoints,reason,duplicateInFile:false,suggestedValue:null}:null;
}
function delimiterFor(line:string){const counts=[',',';','\t'].map(delimiter=>({delimiter,count:(line.match(new RegExp(delimiter==='|'?'\\|':delimiter,'g'))||[]).length}));return counts.sort((a,b)=>b.count-a.count)[0]?.delimiter||','}
export function parseDirectoryCsv(text:string){
 const source=String(text||'').replace(/^\uFEFF/,'');const firstLine=source.split(/\r?\n/,1)[0]||'',delimiter=delimiterFor(firstLine),rows:Array<{rowNumber:number;values:string[]}>=[];let values:string[]=[],value='',quoted=false,rowNumber=1;
 const pushValue=()=>{values.push(value.trim());value=''};const pushRow=()=>{pushValue();if(values.some(item=>item.trim()))rows.push({rowNumber,values});values=[]};
 for(let index=0;index<source.length;index++){const char=source[index],next=source[index+1];if(char==='"'&&quoted&&next==='"'){value+='"';index++;continue}if(char==='"'){quoted=!quoted;continue}if(char===delimiter&&!quoted){pushValue();continue}if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')index++;pushRow();rowNumber++;continue}value+=char}
 if(value||values.length)pushRow();return{delimiter,rows};
}
