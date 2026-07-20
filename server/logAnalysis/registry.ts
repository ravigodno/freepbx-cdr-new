import fs from 'fs';
import path from 'path';
import { runSecurityCommand } from '../security/executor.js';
import type { DetectedLogSource, LogCategory, LogSourceDefinition } from './types.js';

const VERSION = '1';
const FILE_SPECS: Array<[string,string,LogCategory,string]> = [
  ['/var/log/asterisk/full','Asterisk full','asterisk','asterisk'], ['/var/log/asterisk/messages','Asterisk messages','asterisk','asterisk'],
  ['/var/log/asterisk/security','Asterisk security','security','asterisk_security'], ['/var/log/asterisk/freepbx.log','FreePBX','asterisk','freepbx'],
  ['/var/log/asterisk/queue_log','Asterisk queue','asterisk','asterisk'], ['/var/log/asterisk/fail2ban','Asterisk Fail2Ban','fail2ban','fail2ban'],
  ['/var/log/auth.log','Auth / SSH','security','auth'], ['/var/log/secure','Secure / SSH','security','auth'],
  ['/var/log/fail2ban.log','Fail2Ban','fail2ban','fail2ban'], ['/var/log/syslog','Syslog','system','syslog'],
  ['/var/log/messages','System messages','system','syslog'], ['/var/log/kern.log','Kernel','system','syslog'],
  ['/var/log/nginx/access.log','Nginx access','web','nginx'], ['/var/log/nginx/error.log','Nginx error','web','nginx'],
  ['/var/log/apache2/access.log','Apache access','web','apache'], ['/var/log/apache2/error.log','Apache error','web','apache'],
  ['/var/log/httpd/access_log','HTTPD access','web','apache'], ['/var/log/httpd/error_log','HTTPD error','web','apache'],
  ['/root/.pm2/logs/asterisk-cdr-panel-out.log','PBXPuls PM2 stdout','pbxpuls','pm2'],
  ['/root/.pm2/logs/asterisk-cdr-panel-error.log','PBXPuls PM2 stderr','pbxpuls','pm2']
];
const JOURNAL_SPECS: Array<[string,string,LogCategory,string]> = [
  ['asterisk','Asterisk journald','asterisk','journald'], ['freepbx','FreePBX journald','asterisk','journald'],
  ['ssh','SSH journald','security','auth_journald'], ['sshd','SSHD journald','security','auth_journald'],
  ['fail2ban','Fail2Ban journald','fail2ban','fail2ban_journald'], ['nginx','Nginx journald','web','nginx_journald'],
  ['apache2','Apache journald','web','apache_journald'], ['httpd','HTTPD journald','web','apache_journald'],
  ['mariadb','MariaDB journald','system','journald'], ['mysql','MySQL journald','system','journald']
];

function key(type: string, identity: string) { return `${type}:${identity}`; }
function fileDefinition(file: string, name: string, category: LogCategory, parserKey: string): LogSourceDefinition {
  return { sourceKey:key(file.includes('/.pm2/')?'pm2':'file',file),displayName:name,category,sourceType:file.includes('/.pm2/')?'pm2':'file',canonicalPath:file,parserKey,platform:'linux',collectorVersion:VERSION };
}

export function getLogSourceDefinitions(): LogSourceDefinition[] {
  return [
    ...FILE_SPECS.map(spec => fileDefinition(...spec)),
    ...JOURNAL_SPECS.map(([unit,name,category,parserKey]) => ({sourceKey:key('journald',unit),displayName:name,category,sourceType:'journald' as const,journalUnit:unit,parserKey,platform:'systemd',collectorVersion:VERSION})),
    {sourceKey:'database:system_events',displayName:'PBXPuls system_events',category:'pbxpuls',sourceType:'database',parserKey:'pbxpuls_database',platform:'pbxpuls',collectorVersion:VERSION},
    {sourceKey:'database:audit_log',displayName:'PBXPuls audit_log',category:'pbxpuls',sourceType:'database',parserKey:'pbxpuls_database',platform:'pbxpuls',collectorVersion:VERSION}
  ];
}

export function resolveLogSource(sourceKey: string): LogSourceDefinition | null {
  return getLogSourceDefinitions().find(source => source.sourceKey === sourceKey) || null;
}

export async function detectLogSources(): Promise<DetectedLogSource[]> {
  const result: DetectedLogSource[] = [];
  for (const source of getLogSourceDefinitions()) {
    if ((source.sourceType === 'file' || source.sourceType === 'pm2') && source.canonicalPath) {
      try {
        const real = await fs.promises.realpath(source.canonicalPath); const expected = path.resolve(source.canonicalPath);
        if (real !== expected && !getLogSourceDefinitions().some(item => item.canonicalPath === real)) throw Object.assign(new Error('Симлинк ведёт за пределы allowlist'), { code:'EACCES' });
        const stat = await fs.promises.stat(real); await fs.promises.access(real, fs.constants.R_OK);
        result.push({...source,canonicalPath:real,detected:true,readable:stat.isFile(),active:stat.isFile(),fileSize:stat.size,inode:String(stat.ino),modifiedAt:stat.mtime.toISOString(),readError:null});
      } catch (error:any) { result.push({...source,detected:error?.code!=='ENOENT',readable:false,active:false,modifiedAt:null,readError:error?.code==='ENOENT'?null:error?.code==='EACCES'?'Нет прав чтения':String(error?.message||error).slice(0,300)}); }
    } else if (source.sourceType === 'journald') {
      const unit = source.journalUnit || '';
      // FreePBX Distro and older CentOS systemctl versions do not support --value.
      const service = await runSecurityCommand('systemctl',['show',`${unit}.service`,'--property=LoadState'],3000);
      const loadState = service.stdout.match(/^LoadState=(.+)$/m)?.[1]?.trim();
      const detected = service.ok && Boolean(loadState) && loadState !== 'not-found';
      if (!detected) { result.push({...source,detected:false,readable:false,active:false,readError:null}); continue; }
      const probe = await runSecurityCommand('journalctl',['-u',unit,'-n','1','--no-pager','-o','json'],4000);
      result.push({...source,detected:true,readable:probe.ok,active:probe.ok,readError:probe.ok?null:(probe.stderr||'journald недоступен').slice(0,300)});
    } else result.push({...source,detected:true,readable:true,active:true,readError:null});
  }
  const identities = new Set<string>();
  return result.filter(source => { const identity = `${source.sourceType}:${source.canonicalPath||source.journalUnit||source.sourceKey}`; if(identities.has(identity))return false;identities.add(identity);return true; });
}
