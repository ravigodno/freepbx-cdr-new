import assert from'node:assert/strict';
import fs from'node:fs';
import{execFileSync}from'node:child_process';
import{fallbackDialplanTarget,normalizeAiExtension}from'../server/ai-platform/extensions/aiExtensionTypes.js';
import{assertAiExtensionTransition,verifyLoadedAiExtensionDialplan}from'../server/ai-platform/extensions/aiExtensionStateMachine.js';
import{AiExtensionService}from'../server/ai-platform/extensions/aiExtensionService.js';

assert.equal(normalizeAiExtension('205'),'205');
assert.throws(()=>normalizeAiExtension('2'));
assert.throws(()=>normalizeAiExtension('205@from-internal'));
assert.equal(fallbackDialplanTarget('extension','201'),'from-did-direct,201,1');
assert.equal(fallbackDialplanTarget('ring_group','600'),'ext-group,600,1');
assert.equal(fallbackDialplanTarget('queue','700'),'ext-queues,700,1');
assert.equal(fallbackDialplanTarget('terminate_call',''),'hangup');
assert.throws(()=>fallbackDialplanTarget('external','1,Goto(evil)'));
assert.doesNotThrow(()=>assertAiExtensionTransition('preview_ready','applying'));
assert.doesNotThrow(()=>assertAiExtensionTransition('applying','verifying'));
assert.doesNotThrow(()=>assertAiExtensionTransition('verifying','active'));
assert.doesNotThrow(()=>assertAiExtensionTransition('verifying','sync_failed'));
assert.throws(()=>assertAiExtensionTransition('preview_ready','active'));
const validSnapshot={managed:"'205' => 1. Stasis(pbxpuls-ai-control,ai_extension:205)",miscApplication:"'205' => 3. Goto(pbxpuls-ai,205,1)",fromInternal:"'205' => 1. Goto(app-miscapps,205,1)"};
assert.equal(verifyLoadedAiExtensionDialplan('205',validSnapshot).ok,true);
assert.equal(verifyLoadedAiExtensionDialplan('205',{...validSnapshot,managed:"There is no existence of 'pbxpuls-ai' context"}).ok,false);
assert.equal(verifyLoadedAiExtensionDialplan('205',{...validSnapshot,fromInternal:"'205' => 1. Gosub(pbxpuls-ai-voice-test,205,1)"}).ok,false);

const helper=fs.readFileSync('scripts/freepbx-ai-extension.php','utf8');
assert.match(helper,/Customappsreg\(\)/);
assert.match(helper,/Miscapps\(\)->add/);
assert.match(helper,/extensions_custom\.conf/);
assert.match(helper,/PBXPULS_AI_FALLBACK_DEPTH/);
assert.match(helper,/managedObjectsExist/);
assert.match(helper,/\['misc_application', 'feature_code'\]/);
assert.doesNotMatch(helper,/extensions_additional\.conf|pjsip\.endpoint\.conf|sip_additional\.conf/);
assert.doesNotMatch(helper,/PJSIP|chan_sip|fwconsole/);

const inspection=JSON.parse(execFileSync('php',['scripts/freepbx-ai-extension.php','inspect','205'],{encoding:'utf8'}));
assert.equal(inspection.ok,true);
assert.equal(inspection.extension,'205');
assert.equal(inspection.conflicts.some((item:any)=>!['misc_application','feature_code'].includes(item.type)),false);
assert.equal(inspection.legacyRoutePresent,false);
assert.equal(inspection.managedBlockPresent,true);

const service=fs.readFileSync('server/ai-platform/extensions/aiExtensionService.ts','utf8');
assert.match(service,/productionAffected:false/);
assert.match(service,/Explicit confirmation is required/);
assert.match(service,/published_agent_version_id/);
assert.match(service,/status='applied'/);
assert.match(service,/fallback_value_hash/);
assert.doesNotMatch(service,/HumanHandoff|continueInDialplan|ClosingCoordinator/);

const runtime=fs.readFileSync('server/ai-platform/voice/voiceRouteResolver.ts','utf8');
assert.match(runtime,/FROM ai_extensions/);
assert.match(runtime,/e\.extension_hash/);
assert.match(runtime,/e\.status='active'/);
assert.doesNotMatch(runtime,/205/);

const panel=fs.readFileSync('src/modules/aiPlatform/AiExtensionPanel.tsx','utf8');
assert.match(panel,/FreePBX пока не изменён/);
assert.match(panel,/SIP endpoint: не создаётся/);
assert.match(panel,/Автоматический звонок не выполнялся/);
assert.doesNotMatch(panel,/ARI|AudioSocket|Stasis/);

class ApplyStore{
  extension:any={id:1,tenant_id:1,extension:'205',display_name:'AI Receptionist',status:'preview_ready',published_agent_version_id:20,route_binding_id:1};
  preview:any={id:1,tenant_id:1,ai_extension_id:1,status:'ready',expires_at:new Date(Date.now()+60000),preview_json:JSON.stringify({fallback:{target:'hangup'},bindingBefore:{id:1,status:'active',matchType:'controlled_test_extension',agentVersionId:20}})};
  binding:any={status:'active',match_type:'controlled_test_extension',agent_version_id:20};
  async query(sql:string,params:any[]=[]):Promise<any>{
    if(sql.startsWith('SELECT * FROM ai_extension_previews'))return[this.preview];
    if(sql.startsWith('SELECT * FROM ai_extensions'))return[this.extension];
    if(sql.includes("SET status='applying'")){this.extension.status='applying';return{affectedRows:1}}
    if(sql.includes("SET status='verifying'")){this.extension.status='verifying';return{affectedRows:1}}
    if(sql.startsWith('UPDATE ai_voice_route_bindings SET status=?')){[this.binding.status,this.binding.match_type,this.binding.agent_version_id]=params;return{affectedRows:1}}
    if(sql.startsWith("UPDATE ai_voice_route_bindings SET status='active'")){this.binding={status:'active',match_type:'ai_extension',agent_version_id:params[0]};return{affectedRows:1}}
    if(sql.includes("SET status='sync_failed'")){this.extension.status='sync_failed';this.extension.enabled=0;this.extension.sync_error_code=params[0];return{affectedRows:1}}
    if(sql.includes("SET status='active'")){this.extension.status='active';this.extension.enabled=1;return{affectedRows:1}}
    if(sql.includes("ai_extension_previews SET status='applied'")){this.preview.status='applied';return{affectedRows:1}}
    if(sql.startsWith('INSERT INTO ai_audit_log'))return{insertId:1};
    return{affectedRows:1};
  }
}
const store=new ApplyStore(),audit={append:async()=>{}} as any,failedAdapter:any={apply:async()=>({miscApplicationId:1,customDestinationId:1}),reload:async()=>({ok:true}),dialplan:async()=>({...validSnapshot,managed:"There is no existence of 'pbxpuls-ai' context"})};
await assert.rejects(()=>new AiExtensionService(store as any,audit,failedAdapter).apply(1,1,true,{traceId:'test',actorType:'system',actorId:'test'}));
assert.equal(store.extension.status,'sync_failed');
assert.equal(store.extension.enabled,0);
assert.equal(store.extension.sync_error_code,'DIALPLAN_CONTEXT_NOT_LOADED');
assert.equal(store.binding.match_type,'controlled_test_extension');
const successfulAdapter:any={calls:0,apply:async function(){this.calls++;return{miscApplicationId:1,customDestinationId:1}},reload:async()=>({ok:true}),dialplan:async()=>validSnapshot};
await new AiExtensionService(store as any,audit,successfulAdapter).apply(1,1,true,{traceId:'retry',actorType:'system',actorId:'test'});
assert.equal(store.extension.status,'active');
assert.equal(store.binding.match_type,'ai_extension');
await new AiExtensionService(store as any,audit,successfulAdapter).apply(1,1,true,{traceId:'idempotent',actorType:'system',actorId:'test'});
assert.equal(successfulAdapter.calls,1);

console.log('AI Platform AI Extension tests: OK');
