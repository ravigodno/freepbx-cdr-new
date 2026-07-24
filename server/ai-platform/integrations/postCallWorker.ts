import type{AiPlatformStore}from'../storage/aiPlatformStore.js';import type{ConnectorExecutor}from'./connectorExecutor.js';import{ApplicationEncryptionService}from'../actions/applicationEncryption.js';
export class IntegrationPostCallWorker{
 constructor(private store:AiPlatformStore,private executor:ConnectorExecutor){}
 async runOnce(tenantId:number){
  const jobs=await this.store.query("SELECT * FROM ai_integration_post_call_jobs WHERE tenant_id=? AND status IN('pending','retry') AND next_attempt_at<=NOW() ORDER BY id LIMIT 20",[tenantId]);
  for(const job of jobs)try{await this.store.query("UPDATE ai_integration_post_call_jobs SET status='running',attempt_count=attempt_count+1 WHERE id=? AND status IN('pending','retry')",[job.id]);const input=JSON.parse(new ApplicationEncryptionService().decrypt(String(job.input_encrypted||'')));await this.executor.execute({tenantId,agentId:null,agentVersionId:null,conversationId:String(job.conversation_id),actorId:'post-call-worker',role:'ai_agent',confirmed:true,idempotencyKey:String(job.idempotency_key)},Number(job.integration_id),String(job.action_id),input);await this.store.query("UPDATE ai_integration_post_call_jobs SET status='completed',completed_at=NOW(),input_encrypted=NULL WHERE id=?",[job.id])}catch(error:any){const attempts=Number(job.attempt_count||0)+1;await this.store.query("UPDATE ai_integration_post_call_jobs SET status=?,error_code='INTERNAL_CONNECTOR_ERROR',next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND) WHERE id=?",[attempts>=5?'dead_letter':'retry',Math.min(300,2**attempts),job.id])}
  return{processed:jobs.length}
 }
}
