import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PERMISSION_GROUPS,PERMISSION_MODULE_MAP,SU_PERMISSION_KEYS,SYSTEM_SECTIONS,SECTION_LABELS,normalizeModuleVisibilitySettings,isPermissionModuleVisible,isSystemSectionVisible,type PermissionGroup} from '../shared/accessCatalog.js';
import {AI_PLATFORM_PERMISSIONS} from '../server/ai-platform/permissions/permissions.js';
import {filterPermissionGroups,groupPermissionState,toggleGroupPermissions} from '../src/modules/access/permissionMatrixModel.js';
import {hasUserPermission} from '../src/modules/access/permissions.js';
import {loadModuleVisibility,saveModuleVisibility} from '../server/moduleVisibility.js';
const groups:PermissionGroup[]=PERMISSION_GROUPS.map(g=>({...g,rows:[...g.rows]}));
const keys=groups.flatMap(g=>g.rows.map(row=>row.key));const known=new Set<string>(keys);
assert.equal(keys.length,known.size,'Every permission appears exactly once');
for(const key of AI_PLATFORM_PERMISSIONS)assert.ok(known.has(key),`Missing ${key}`);
// Audit literal permission checks in active application sources, including integration and skill routers.
function walk(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):/\.tsx?$/.test(entry.name)?[path.join(dir,entry.name)]:[]);}
for(const file of ['server.ts',...walk('server'),...walk('src')]) {
 for(const match of fs.readFileSync(file,'utf8').matchAll(/(?:permit|requirePermission|hasPermission|checkUserPermission)\([^\n)]*?['"]([a-z]+_[a-z_]+)['"]/g))assert.ok(known.has(match[1]),`Unlisted ${match[1]} in ${file}`);
}
for(const group of groups)assert.equal(group.title,SECTION_LABELS[group.id]);
const calls=groups.find(g=>g.id==='calls')!,management=groups.find(g=>g.id==='management')!;
const canEdit=(row:any)=>row.kind!=='su';
const start={own_calls_only:true,department_calls_only:false,view_calls:false,view_directory:true};
const enabled=toggleGroupPermissions(calls.rows,start,true,canEdit);
assert.equal(enabled.own_calls_only,true);assert.equal(enabled.department_calls_only,false);assert.equal(enabled.view_directory,true);assert.equal(enabled.view_calls,true);
assert.equal(groupPermissionState(calls.rows,enabled,canEdit).checked,true);
assert.equal(groupPermissionState(calls.rows,{view_calls:true},canEdit).mixed,true);
const blocked=toggleGroupPermissions(management.rows,{manage_trunks:false},true,canEdit);assert.equal(blocked.manage_trunks,false);
for(const key of ['manage_fail2ban','manage_security_whitelist','send_gsm_sms','manage_gsm_gateways'])assert.ok(SU_PERMISSION_KEYS.includes(key));
assert.equal(filterPermissionGroups(groups,'БАЛАНС аналитика')[0].rows[0].key,'view_balance_analytics');
assert.equal(filterPermissionGroups(groups,'manage_ai_voice_catalog')[0].id,'ai_platform');
assert.equal(filterPermissionGroups(groups,'нет-такого-права').length,0);
for(const section of SYSTEM_SECTIONS){const v=normalizeModuleVisibilitySettings({[section.key]:false});assert.equal(isSystemSectionVisible('su',v,section.key),true);assert.equal(isSystemSectionVisible('admin',v,section.key),false);}
for(const [key,section] of Object.entries(PERMISSION_MODULE_MAP))assert.equal(isPermissionModuleVisible('admin',{[section]:false},key),false,key);
assert.equal(isPermissionModuleVisible('admin',{ai_platform:false,scripts:true},'view_scripts'),false);
assert.equal(isPermissionModuleVisible('admin',{ai_platform:false},'view_integrations'),false);
assert.equal(normalizeModuleVisibilitySettings({management:false}).gsm_gateways,false);
assert.equal(normalizeModuleVisibilitySettings({management:false,gsm_gateways:true}).gsm_gateways,true);
assert.equal(hasUserPermission({role:'admin',permissions:{view_ai_platform:true}},{moduleVisibility:{ai_platform:false}},'view_ai_platform'),false);
let stored:string|undefined;
const query=async(sql:string,params:any[]=[])=>{if(sql.startsWith('INSERT')){stored=params[0];return [];}return stored?[{setting_value:stored}]:[];};
assert.equal((await loadModuleVisibility({marketing:false},query)).marketing,false);
await saveModuleVisibility(normalizeModuleVisibilitySettings({ai_platform:false,monitoring:false}),query);
assert.equal((await loadModuleVisibility({ai_platform:true},query)).ai_platform,false);
await assert.rejects(()=>loadModuleVisibility({},async()=>{throw Error('DB unavailable')}));
const app=fs.readFileSync('src/App.tsx','utf8');assert.equal((app.match(/<UnifiedDialer/g)||[]).length,1);
assert.ok(app.indexOf('<UnifiedDialer')>app.indexOf('LEFT SIDEBAR VIEW PLATFORM')&&app.indexOf('<UnifiedDialer')<app.indexOf('</aside>'));
console.log(`PASS ${known.size} permissions, complete router coverage, search, group toggles, restrictions, shared visibility, SQL persistence/error propagation and single sidebar dialer`);
