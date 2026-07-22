import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { runAsteriskCliCommand } from '../server/asteriskCli.js';
import { getDirectoryRuntimeSnapshot } from '../server/pbxpulsDirectoryRuntime.js';
import { createPBXReadServices, type FixedDiagnostic } from '../server/services/pbxReadServices.js';
import { TOOL_SCHEMAS } from '../server/ai-platform/tools/toolSchemas.js';
import { validateToolOutput } from '../server/ai-platform/tools/toolOutputValidator.js';

const db=JSON.parse(fs.readFileSync('data/db.json','utf8')),settings=db.settings||{};
const commands:Record<FixedDiagnostic,string>={channels:'core show channels concise',pjsip_contacts:'pjsip show contacts',pjsip_registrations:'pjsip show registrations outbound',pjsip_endpoints:'pjsip show endpoints',sip_peers:'sip show peers',sip_registry:'sip show registry'};
const query=async(sql:string,params:unknown[])=>{const connection=await mysql.createConnection({host:settings.dbHost,port:settings.dbPort,user:settings.dbUser,password:settings.dbPass,database:settings.dbName,connectTimeout:5000,dateStrings:true});try{const[rows]=await connection.execute(sql,params as any[]);return rows as any[]}finally{await connection.end()}};
const services=createPBXReadServices({runFixedDiagnostic:command=>runAsteriskCliCommand(commands[command],5000),queryCdr:query,readDirectory:async context=>(await getDirectoryRuntimeSnapshot({legacyDirectory:db.directory||[],settings,authUser:{username:context.actorId,role:'su'},dbUser:{username:context.actorId,role:'su'}})).contacts,readAuthoritativeExtensions:async()=>{try{return await query("SELECT id ext,description name,tech FROM asterisk.devices WHERE id REGEXP '^[0-9]{2,6}$'",[])}catch{return query("SELECT id ext,description name,tech FROM devices WHERE id REGEXP '^[0-9]{2,6}$'",[])}},readConfiguredTrunks:async()=>{try{return await query('SELECT name `key`,name,tech technology FROM asterisk.trunks',[])}catch{return[]}}});
const context={tenantId:1,actorId:'su',permissions:['execute_ai_read_tools']};
const cases:[string,(input:any,signal?:AbortSignal,context?:any)=>Promise<any>,any][]=[['pbx.get_active_calls',services.activeCalls,{}],['pbx.get_sip_registrations',services.sipRegistrations,{}],['pbx.get_trunks_status',services.trunksStatus,{}],['pbx.get_extensions_status',services.extensionsStatus,{limit:10}],['pbx.get_missed_calls',services.missedCalls,{periodHours:24,limit:10}],['pbx.get_call_statistics',services.callStatistics,{period:'today'}],['directory.search_contacts',services.searchContacts,{query:'',limit:10}],['calls.search_history',services.searchHistory,{limit:10}]];
const results:any[]=[];
for(const[key,service,input]of cases){try{const output=await service(input,undefined,context);validateToolOutput(TOOL_SCHEMAS[key].output,output);const serialized=JSON.stringify(output);if(/(?:password|passwd|authorization|api.?key|secret|--END COMMAND--|Response:)/i.test(serialized)||/(?:\d{1,3}\.){3}\d{1,3}/.test(serialized))throw new Error('unsafe_output');results.push({tool:key,status:'ok',items:Array.isArray(output.items)?output.items.length:null})}catch{results.push({tool:key,status:'unavailable_or_invalid',items:null})}}
console.log(JSON.stringify(results,null,2));
process.exit(results.some(item=>item.status!=='ok')?1:0);
