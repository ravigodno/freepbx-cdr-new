import type { AiPlatformStore } from '../storage/aiPlatformStore.js';

export class MessageRepository {
  constructor(private readonly store:AiPlatformStore){}
  async add(tenantId:number,conversationId:number,role:string,content:string,extra:any={}):Promise<void>{
    const rows=await this.store.query('SELECT COALESCE(MAX(sequence_no),0)+1 next_no FROM ai_conversation_messages WHERE conversation_id=? AND tenant_id=?',[conversationId,tenantId]);
    await this.store.query('INSERT INTO ai_conversation_messages (tenant_id,conversation_id,sequence_no,role,content,content_json,provider_message_id,token_json,latency_ms) VALUES (?,?,?,?,?,?,?,?,?)',[tenantId,conversationId,Number(rows[0]?.next_no||1),role,content.slice(0,8000),JSON.stringify(extra.contentJson||{}).slice(0,16000),extra.providerRequestId||null,JSON.stringify(extra.usage||{}),extra.latencyMs??null]);
  }
  async addTool(tenantId:number,conversationId:number,value:{toolKey:string;executionId:number|null;summary:string;result:unknown;status:string}):Promise<void>{
    await this.add(tenantId,conversationId,'tool',value.summary,{contentJson:{toolKey:value.toolKey,executionId:value.executionId,summary:value.summary,result:value.result,status:value.status}});
  }
  async addSystemAction(tenantId:number,conversationId:number,value:{action:string;requestId:number|null;status:string;safeLabel:string|null}):Promise<void>{await this.add(tenantId,conversationId,'system','Human transfer action requested',{contentJson:value})}
}
