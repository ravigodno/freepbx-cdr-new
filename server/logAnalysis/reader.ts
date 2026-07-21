import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { runSecurityCommand } from '../security/executor.js';
import { resolveLogSource } from './registry.js';
import { sanitizeLogText } from './redaction.js';
import { parseLogLine } from './parsers.js';
import type { LogCursor, LogReadResult, LogSourceDefinition } from './types.js';

const MAX_CHUNK_BYTES = 256 * 1024; const MAX_LINES = 2000; const MAX_LINE = 8000;
const hash = (value:string) => crypto.createHash('sha256').update(value).digest('hex');
const ROTATED_SUFFIX=/(?:\.\d+|[-.]\d{8}|-\d{6,14})(?:\.gz)?$/;

async function readTail(file:string,maxBytes:number,signal?:AbortSignal){if(signal?.aborted)throw Object.assign(new Error('Запрос отменён'),{name:'AbortError'});const stat=await fs.promises.stat(file);if(!stat.isFile()||stat.size===0)return{lines:[] as string[],bytesRead:0};const length=Math.min(maxBytes,stat.size),offset=Math.max(0,stat.size-length),buffer=Buffer.alloc(length),handle=await fs.promises.open(file,'r');try{await handle.read(buffer,0,length,offset)}finally{await handle.close()}if(signal?.aborted)throw Object.assign(new Error('Запрос отменён'),{name:'AbortError'});let text=buffer.toString('utf8');if(offset>0){const nl=text.indexOf('\n');text=nl>=0?text.slice(nl+1):''}return{lines:text.split(/\r?\n/).filter(Boolean).map(line=>sanitizeLogText(line,MAX_LINE)),bytesRead:length};}

export interface DirectLogSearchOptions { limit?:number; maxBytes?:number; from?:string; to?:string; severity?:string; search?:string; ip?:string; extension?:string; phone?:string; callId?:string; uniqueid?:string; linkedid?:string; onlyErrors?:boolean; includeRotated?:boolean; signal?:AbortSignal }
export async function searchAllowedLogSource(sourceKey:string,options:DirectLogSearchOptions={}){const source=resolveLogSource(sourceKey);if(!source?.canonicalPath||!['file','pm2'].includes(source.sourceType))throw new Error('Источник не входит в allowlist');const real=await fs.promises.realpath(source.canonicalPath);if(real!==source.canonicalPath)throw new Error('Некорректный canonical path');const limit=Math.max(1,Math.min(Number(options.limit)||200,500)),maxBytes=Math.max(4096,Math.min(Number(options.maxBytes)||1024*1024,2*1024*1024));const paths=[real];if(options.includeRotated!==false){const dir=path.dirname(real),base=path.basename(real);for(const name of (await fs.promises.readdir(dir)).sort().reverse()){if(name===base||!name.startsWith(base)||!ROTATED_SUFFIX.test(name)||name.endsWith('.gz'))continue;const candidate=await fs.promises.realpath(path.join(dir,name));if(path.dirname(candidate)===dir)paths.push(candidate);if(paths.length>=14)break;}}
 const perFile=Math.max(16384,Math.min(MAX_CHUNK_BYTES,Math.floor(maxBytes/Math.max(1,paths.length))));let bytesRead=0;const rows:any[]=[];const from=options.from?Date.parse(options.from):NaN,to=options.to?Date.parse(options.to):NaN;for(const file of paths){if(bytesRead>=maxBytes||rows.length>=limit)break;const chunk=await readTail(file,Math.min(perFile,maxBytes-bytesRead),options.signal);bytesRead+=chunk.bytesRead;for(const line of chunk.lines.reverse()){const event=parseLogLine(line,source);const time=Date.parse(event.occurredAt);if(Number.isFinite(from)&&time<from||Number.isFinite(to)&&time>to)continue;if(options.severity&&event.severity!==options.severity)continue;if(options.onlyErrors&&!['critical','error'].includes(event.severity))continue;if(options.search&&!event.rawMessage.toLowerCase().includes(options.search.toLowerCase()))continue;if(options.ip&&event.ip!==options.ip)continue;if(options.extension&&event.extension!==options.extension&&!event.rawMessage.includes(options.extension))continue;if(options.phone&&event.phone!==options.phone&&!event.rawMessage.includes(options.phone))continue;if(options.callId&&event.callId!==options.callId&&!event.rawMessage.includes(options.callId))continue;if(options.uniqueid&&event.uniqueid!==options.uniqueid&&event.linkedid!==options.uniqueid&&!event.rawMessage.includes(options.uniqueid))continue;rows.push({...event,eventId:undefined,originPath:path.basename(file),rotated:file!==real});if(rows.length>=limit)break;}}
 return{rows,total:rows.length,limit,bytesRead,truncated:bytesRead>=maxBytes||rows.length>=limit,filesScanned:paths.length};}

export async function readAllowedLogFile(sourceKey: string, cursor?: Partial<LogCursor>): Promise<LogReadResult> {
  const source = resolveLogSource(sourceKey); if (!source?.canonicalPath || !['file','pm2'].includes(source.sourceType)) throw new Error('Источник не входит в allowlist');
  const started=Date.now(); const real=await fs.promises.realpath(source.canonicalPath); if(real!==source.canonicalPath) throw new Error('Чтение симлинка запрещено');
  const stat=await fs.promises.stat(real); if(!stat.isFile())throw new Error('Источник не является файлом');
  const inode=String(stat.ino); const rotated=Boolean(cursor?.inode&&cursor.inode!==inode); const truncated=Boolean(!rotated&&cursor?.fileSize!==undefined&&stat.size<Number(cursor.fileSize));
  let offset=rotated||truncated?0:Math.max(0,Number(cursor?.offset||0)); if(!cursor?.lastReadAt)offset=Math.max(0,stat.size-MAX_CHUNK_BYTES);
  const length=Math.min(MAX_CHUNK_BYTES,Math.max(0,stat.size-offset)); const buffer=Buffer.alloc(length); const handle=await fs.promises.open(real,'r');
  try { await handle.read(buffer,0,length,offset); } finally { await handle.close(); }
  let text=buffer.toString('utf8'); if(offset>0&&!text.startsWith('\n')){const newline=text.indexOf('\n');if(newline>=0){offset+=newline+1;text=text.slice(newline+1);}else text='';}
  const lastNewline=text.lastIndexOf('\n'); const complete=lastNewline>=0?text.slice(0,lastNewline):''; const consumed=Buffer.byteLength(lastNewline>=0?text.slice(0,lastNewline+1):'');
  const lines=complete.split(/\r?\n/).filter(Boolean).slice(-MAX_LINES).map(line=>sanitizeLogText(line,MAX_LINE)); const lastLine=lines[lines.length-1]||'';
  return {lines,bytesRead:length,rotated,truncated,durationMs:Date.now()-started,nextCursor:{sourceKey,inode,offset:offset+consumed,fileSize:stat.size,modifiedAt:stat.mtime.toISOString(),lastLineHash:lastLine?hash(lastLine):cursor?.lastLineHash,lastReadAt:new Date().toISOString()}};
}

export async function readAllowedJournal(source: LogSourceDefinition, cursor?: Partial<LogCursor>): Promise<{lines:string[];nextCursor:LogCursor;bytesRead:number;durationMs:number}> {
  if(source.sourceType!=='journald'||!source.journalUnit)throw new Error('Некорректный journald source'); const started=Date.now();
  const args=['-u',source.journalUnit,'--no-pager','-o','json','-n','1000']; if(cursor?.journalCursor)args.push('--after-cursor',cursor.journalCursor);
  else args.push('--since','15 minutes ago'); const result=await runSecurityCommand('journalctl',args,8000); if(!result.ok)throw new Error(result.stderr||'journald недоступен');
  const rows=result.stdout.split(/\r?\n/).filter(Boolean).slice(-MAX_LINES);let journalCursor=cursor?.journalCursor;const lines:string[]=[];
  for(const row of rows){try{const parsed=JSON.parse(row);journalCursor=parsed.__CURSOR||journalCursor;lines.push(`${parsed.__REALTIME_TIMESTAMP||''} ${parsed.SYSLOG_IDENTIFIER||parsed._COMM||''}[${parsed._PID||''}]: ${parsed.MESSAGE||''}`);}catch{lines.push(row);}}
  return {lines:lines.map(line=>sanitizeLogText(line,MAX_LINE)),bytesRead:Buffer.byteLength(result.stdout),durationMs:Date.now()-started,nextCursor:{sourceKey:source.sourceKey,offset:0,fileSize:0,journalCursor,lastReadAt:new Date().toISOString()}};
}
