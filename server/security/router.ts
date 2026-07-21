import type { Express, NextFunction, Request, Response } from 'express';
import { writePBXPulsAuditLog } from '../pbxpulsEvents.js';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { runFail2BanAction } from './executor.js';
import { collectSecuritySnapshot, getSecurityOverview, getSecurityStatus } from './service.js';
import { addWhitelist, deleteWhitelist, getSecurityEvent, getSecuritySettings, listSecurityEvents, listWhitelist, updateSecuritySettings } from './storage.js';
import { isLoopbackIp, isPrivateSecurityIp, isValidJailName, isValidSecurityIp } from './sanitize.js';
import { analyzePortFirewall, filterAndSortPorts, groupPortSockets, parsePortQuery } from './portDiagnostics.js';
import { listThreatActivity, listThreatSources } from './threatActivity.js';

type PermissionChecker = (req: Request, permission: string) => Promise<boolean>;
const structuredError = (res:Response, status:number, code:string, message:string) => res.status(status).json({ success:false, error:{ code, message } });

export function registerSecurityRoutes(app: Express, requireAuth: any, checkPermission: PermissionChecker) {
  const permit = (permission:string) => async (req:Request,res:Response,next:NextFunction) => {
    if (!(await checkPermission(req, 'view_security')) || (permission !== 'view_security' && !(await checkPermission(req, permission)))) {
      return structuredError(res, 403, 'permission_denied', 'Недостаточно прав для этого раздела безопасности');
    }
    next();
  };
  const view = [requireAuth(), permit('view_security')];
  app.get('/api/security/status', ...view, async (_req,res) => res.json({ success:true, ...(await getSecurityStatus()) }));
  app.get('/api/security/overview', ...view, async (_req,res) => res.json({ success:true, ...(await getSecurityOverview()) }));
  app.get('/api/security/threats', requireAuth(), permit('view_security_events'), async (req,res)=>res.json({success:true,...(await listThreatActivity(req.query))}));
  app.get('/api/security/threats/sources', requireAuth(), permit('view_security_events'), async (_req,res)=>res.json({success:true,rows:await listThreatSources()}));
  app.get('/api/security/events', requireAuth(), permit('view_security_events'), async (req,res) => res.json({ success:true, ...(await listSecurityEvents(req.query as any)) }));
  app.get('/api/security/events/:id', requireAuth(), permit('view_security_events'), async (req,res) => {
    const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id < 1) return structuredError(res,400,'invalid_id','Некорректный идентификатор');
    const event = await getSecurityEvent(id); return event ? res.json({ success:true,event }) : structuredError(res,404,'not_found','Событие не найдено');
  });
  app.get('/api/security/firewall/status', requireAuth(), permit('view_firewall'), async (_req,res) => res.json({ success:true, ...(await collectSecuritySnapshot()).firewall }));
  app.get('/api/security/firewall/rules', requireAuth(), permit('view_firewall'), async (req,res) => {
    const rules = (await collectSecuritySnapshot()).firewall.rules || []; const limit=Math.min(Number(req.query.limit)||100,500), offset=Math.max(Number(req.query.offset)||0,0);
    res.json({ success:true, rows:rules.slice(offset,offset+limit), total:rules.length, limit, offset });
  });
  app.get('/api/security/ports', requireAuth(), permit('view_firewall'), async (req,res) => {
    const parsed=parsePortQuery(req.query);if((req.query.ports||req.query.port)&&!parsed.ranges.length)return structuredError(res,400,'invalid_ports','Некорректный список портов или диапазонов');const snapshot=await collectSecuritySnapshot();let rows:any[]=filterAndSortPorts(snapshot.ports.ports||[],parsed);if(String(req.query.groupBy||'')==='port')rows=groupPortSockets(rows);
    if(String(req.query.external||'')==='true')rows=rows.filter((r:any)=>['external_possible','externally_exposed'].includes(r.exposure));if(String(req.query.critical||'')==='true')rows=rows.filter((r:any)=>r.risk==='critical');
    const total=rows.length;res.json({success:true,rows:rows.slice(parsed.offset,parsed.offset+parsed.limit),total,limit:parsed.limit,offset:parsed.offset,status:snapshot.ports.status,checkedAt:snapshot.generatedAt});
  });
  app.get('/api/security/ports/diagnostics', requireAuth(), permit('view_firewall'), async (req,res)=>{const ranges=parsePortQuery({ports:req.query.ports||req.query.port}).ranges;if(!ranges.length)return structuredError(res,400,'invalid_ports','Укажите корректные порты или диапазоны 1–65535');const snapshot=await collectSecuritySnapshot();const sockets=(snapshot.ports.ports||[]).filter((row:any)=>ranges.some(range=>row.port>=range.from&&row.port<=range.to));const rows=sockets.slice(0,200).map((socket:any)=>({...socket,analysis:analyzePortFirewall(socket,snapshot.firewall),detectionSource:'ss/netstat',checkedAt:snapshot.generatedAt}));res.json({success:true,rows,total:rows.length,firewall:{mechanism:snapshot.firewall.mechanism,status:snapshot.firewall.status,policies:snapshot.firewall.policies},checkedAt:snapshot.generatedAt});});
  app.get('/api/security/fail2ban/status', requireAuth(), permit('view_fail2ban'), async (_req,res) => res.json({ success:true, ...(await collectSecuritySnapshot()).fail2ban }));
  app.get('/api/security/fail2ban/jails', requireAuth(), permit('view_fail2ban'), async (_req,res) => { const data=(await collectSecuritySnapshot()).fail2ban; res.json({ success:true, rows:data.jails||[], total:data.jails?.length||0 }); });
  app.get('/api/security/fail2ban/jails/:jail', requireAuth(), permit('view_fail2ban'), async (req,res) => {
    if(!isValidJailName(req.params.jail)) return structuredError(res,400,'invalid_jail','Некорректное имя jail'); const jail=(await collectSecuritySnapshot()).fail2ban.jails?.find((j:any)=>j.name===req.params.jail);
    return jail?res.json({success:true,jail}):structuredError(res,404,'not_found','Jail не найден');
  });
  const action = (kind:'banip'|'unbanip') => async (req:Request,res:Response) => {
    const settings=await getSecuritySettings(); if(settings['security.fail2ban_actions_enabled']!==true) return structuredError(res,403,'feature_disabled','Управление Fail2Ban отключено серверной настройкой');
    const jail=String(req.body?.jail||''), ip=String(req.body?.ip||''); if(!isValidJailName(jail)||!isValidSecurityIp(ip)) return structuredError(res,400,'invalid_input','Некорректный IP или jail');
    if(isLoopbackIp(ip)) return structuredError(res,400,'protected_ip','Блокировка loopback запрещена'); if(req.body?.confirm!==true) return structuredError(res,409,'confirmation_required','Требуется явное подтверждение');
    const result=await runFail2BanAction(kind,jail,ip); const user:any=(req as any).user||{};
    await writePBXPulsAuditLog({actor_label:user.username,action:`security.fail2ban.${kind}`,entity_type:'ip',entity_id:ip,details:{jail,result:result.ok?'success':'failed',privateIp:isPrivateSecurityIp(ip)},ip_address:req.ip,user_agent:req.get('user-agent')});
    return result.ok?res.json({success:true,result:'success'}):structuredError(res,502,'fail2ban_failed',result.stderr||'Fail2Ban отклонил действие');
  };
  app.post('/api/security/fail2ban/ban', requireAuth(), permit('manage_fail2ban'), action('banip'));
  app.post('/api/security/fail2ban/unban', requireAuth(), permit('manage_fail2ban'), action('unbanip'));
  app.get('/api/security/whitelist', requireAuth(), permit('view_security_events'), async (_req,res)=>res.json({success:true,rows:await listWhitelist()}));
  app.post('/api/security/whitelist', requireAuth(), permit('manage_security_whitelist'), async (req,res)=>{
    const ip=String(req.body?.ip||''); if(!isValidSecurityIp(ip)) return structuredError(res,400,'invalid_ip','Некорректный IP'); const user:any=(req as any).user||{};
    const rows=await addWhitelist(ip,String(req.body?.comment||''),user.username||'unknown'); await writePBXPulsAuditLog({actor_label:user.username,action:'security.whitelist.add',entity_type:'ip',entity_id:ip,details:{comment:String(req.body?.comment||'').slice(0,255)},ip_address:req.ip,user_agent:req.get('user-agent')}); res.json({success:true,rows});
  });
  app.delete('/api/security/whitelist/:id', requireAuth(), permit('manage_security_whitelist'), async (req,res)=>{
    const id=Number(req.params.id); if(!Number.isSafeInteger(id)||id<1)return structuredError(res,400,'invalid_id','Некорректный ID'); await deleteWhitelist(id); const user:any=(req as any).user||{};
    await writePBXPulsAuditLog({actor_label:user.username,action:'security.whitelist.delete',entity_type:'whitelist',entity_id:String(id),ip_address:req.ip,user_agent:req.get('user-agent')}); res.json({success:true});
  });
  app.get('/api/security/sip/summary', requireAuth(), permit('view_security_events'), async (_req,res)=>{
    const rows=await queryPBXPulsDb(`SELECT category,COUNT(*) AS events,SUM(occurrence_count) AS occurrences FROM security_events WHERE category LIKE 'sip_%' AND last_seen_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR) GROUP BY category`); res.json({success:true,period:'24h',rows});
  });
  app.get('/api/security/sip/registrations', requireAuth(), permit('view_security_events'), async (req,res)=>{const limit=Math.min(Number(req.query.limit)||100,500);const rows=await queryPBXPulsDb(`SELECT endpoint,ip_address,port,transport,user_agent,first_seen_at,last_seen_at,seen_count,is_private,is_trusted FROM security_sip_registration_history ORDER BY last_seen_at DESC LIMIT ${limit}`);res.json({success:true,rows});});
  app.get('/api/security/checks', requireAuth(), permit('view_security_config_audit'), async (_req,res)=>res.json({success:true,rows:(await collectSecuritySnapshot()).checks}));
  app.post('/api/security/checks/run', requireAuth(), permit('view_security_config_audit'), async (_req,res)=>res.json({success:true,rows:(await collectSecuritySnapshot(true)).checks}));
  app.get('/api/security/services', ...view, async (req,res)=>{const data=(await collectSecuritySnapshot()).services;const service=String(req.query.service||'').trim().toLowerCase();const services=service?(data.services||[]).filter((item:any)=>String(item.name||'').toLowerCase()===service):data.services;res.json({success:true,...data,services});});
  app.get('/api/security/file-changes', requireAuth(), permit('view_security_config_audit'), async (req,res)=>{const limit=Math.min(Number(req.query.limit)||100,500);const rows=await queryPBXPulsDb(`SELECT id,path,change_type,severity,detected_at,metadata_json FROM security_file_changes ORDER BY detected_at DESC LIMIT ${limit}`);res.json({success:true,rows,fileIntegrityEnabled:(await getSecuritySettings())['security.file_integrity_enabled']===true});});
  app.get('/api/security/alerts', ...view, async (_req,res)=>res.json({success:true,rows:await queryPBXPulsDb('SELECT * FROM security_alert_rules ORDER BY severity DESC, rule_key')}));
  app.put('/api/security/alerts/:id', requireAuth(), permit('manage_security_settings'), async (req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id))return structuredError(res,400,'invalid_id','Некорректный ID');await queryPBXPulsDb('UPDATE security_alert_rules SET enabled=?,threshold_value=?,cooldown_minutes=?,updated_at=NOW() WHERE id=?',[req.body?.enabled===true?1:0,Number(req.body?.threshold)||null,Math.max(1,Number(req.body?.cooldownMinutes)||30),id]);res.json({success:true});});
  app.get('/api/security/settings', ...view, async (_req,res)=>res.json({success:true,settings:await getSecuritySettings()}));
  app.put('/api/security/settings', requireAuth(), permit('manage_security_settings'), async (req,res)=>{const saved=await updateSecuritySettings(req.body||{});const user:any=(req as any).user||{};await writePBXPulsAuditLog({actor_label:user.username,action:'security.settings.update',entity_type:'security_settings',entity_id:'security',details:{keys:Object.keys(saved)},ip_address:req.ip,user_agent:req.get('user-agent')});res.json({success:true,saved,settings:await getSecuritySettings()});});
}
