import crypto from 'crypto';
import fs from 'fs';
import { runSecurityCommand } from '../security/executor.js';
import { resolveLogSource } from './registry.js';
import { sanitizeLogText } from './redaction.js';
import type { LogCursor, LogReadResult, LogSourceDefinition } from './types.js';

const MAX_CHUNK_BYTES = 256 * 1024; const MAX_LINES = 2000; const MAX_LINE = 8000;
const hash = (value:string) => crypto.createHash('sha256').update(value).digest('hex');

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
