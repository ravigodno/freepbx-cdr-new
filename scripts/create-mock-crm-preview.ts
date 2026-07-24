import dotenv from'dotenv';dotenv.config({path:'.env',quiet:true});
import{sqlAiPlatformStore as store}from'../server/ai-platform/storage/aiPlatformStore.js';
import{ConnectorExecutor}from'../server/ai-platform/integrations/connectorExecutor.js';
const tenant=(await store.query("SELECT id FROM ai_tenants WHERE tenant_key='installation' LIMIT 1"))[0];if(!tenant)throw new Error('tenant unavailable');
let integration=(await store.query("SELECT id FROM ai_integrations WHERE tenant_id=? AND provider_type='mock_crm' AND name='PBXPuls Mock CRM' LIMIT 1",[tenant.id]))[0];
if(!integration){const result:any=await store.query(`INSERT INTO ai_integrations(tenant_id,name,provider_type,connector_type,base_url,auth_type,status,enabled,environment,timeout_ms,retry_policy_json,rate_limit_policy_json,allowed_hosts_json,allow_private,created_by,health_status)VALUES(?,'PBXPuls Mock CRM','mock_crm','mock_crm',NULL,'none','active',1,'test',1000,'{}','{}','[]',0,'controlled-preview','connected')`,[tenant.id]);integration={id:Number(result.insertId)}}
const executor=new ConnectorExecutor(store);
const preview=await executor.execute({tenantId:Number(tenant.id),agentId:null,agentVersionId:null,conversationId:'controlled-preview-crm-200',actorId:'controlled-preview',role:'admin',confirmed:false,dryRun:false},Number(integration.id),'customer.lookup_by_phone',{phone:'200'});
console.log(JSON.stringify({integrationId:Number(integration.id),actionId:'customer.lookup_by_phone',input:{phone:'200'},externalRequest:false,normalizedResult:preview.data,executionId:preview.id,status:preview.status},null,2));
process.exit(0);
