import assert from "node:assert/strict";
import { fork } from "node:child_process";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";

const reserve = net.createServer();
await new Promise<void>((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = (reserve.address() as net.AddressInfo).port;
await new Promise<void>((resolve) => reserve.close(() => resolve()));

const worker = fork(
  path.resolve("server/ai-platform/voice/media-worker/mediaWorkerProcess.cjs"),
  [],
  { stdio:["ignore","ignore","ignore","ipc"],serialization:"advanced" },
);
const events:any[]=[];
worker.on("message",(event)=>events.push(event));
const waitFor=async(predicate:(event:any)=>boolean,timeout=5000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout){
    const found=events.find(predicate);if(found)return found;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error("media_worker_test_timeout");
};
const sessionRef="isolation-test",requestId=crypto.randomUUID();
worker.send({version:1,type:"create_session",request_id:requestId,session_ref:sessionRef,
  payload:{host:"127.0.0.1",port,transport_format:"ast18_slin8",prebuffer_ms:80,max_response_seconds:60}});
const ready=await waitFor(event=>event.type==="session_ready"&&event.request_id===requestId&&!event.payload.authenticated);
const socket=net.connect(port,"127.0.0.1");
await new Promise<void>((resolve,reject)=>{socket.once("connect",resolve);socket.once("error",reject)});
const uuid=Buffer.from(String(ready.payload.connection_id).replace(/-/g,""),"hex");
const auth=Buffer.alloc(19);auth[0]=1;auth.writeUInt16BE(16,1);uuid.copy(auth,3);socket.write(auth);
await waitFor(event=>event.type==="session_ready"&&event.payload.authenticated);

const pcm=Buffer.alloc(320);for(let i=0;i<100;i++)pcm.writeInt16LE(i,0);
worker.send({version:1,type:"enqueue_response_audio",request_id:"batch",session_ref:sessionRef,
  payload:{frames:Array.from({length:500},(_,sequence)=>({response_ref:"response",item_ref:"item",sequence,pcm:Buffer.from(pcm)}))}});
worker.send({version:1,type:"provider_response_done",request_id:"done",session_ref:sessionRef,response_ref:"response"});
const blockedUntil=Date.now()+3000;while(Date.now()<blockedUntil){}
await waitFor(event=>event.type==="response_playout_completed",15000);
const isolationMetrics=(await waitFor(
  event=>event.type==="frame_played"&&event.response_ref==="response"&&event.sequence===499,
)).payload.metrics;
worker.send({version:1,type:"enqueue_response_audio",request_id:"stream-start",session_ref:sessionRef,
  payload:{frames:Array.from({length:25},(_,sequence)=>({response_ref:"streaming-response",item_ref:"item",sequence,pcm:Buffer.from(pcm)}))}});
for(let batch=0;batch<15;batch++){
  await new Promise(resolve=>setTimeout(resolve,batch===5?600:100));
  worker.send({version:1,type:"enqueue_response_audio",request_id:`stream-${batch}`,session_ref:sessionRef,
    payload:{frames:Array.from({length:5},(_,offset)=>({response_ref:"streaming-response",item_ref:"item",sequence:25+batch*5+offset,pcm:Buffer.from(pcm)}))}});
}
worker.send({version:1,type:"provider_response_done",request_id:"stream-done",session_ref:sessionRef,response_ref:"streaming-response"});
await waitFor(event=>event.type==="response_playout_completed"&&event.response_ref==="streaming-response",6000);
worker.send({version:1,type:"close_session",request_id:"close",session_ref:sessionRef});
const closed=await waitFor(event=>event.type==="session_metrics"&&event.payload?.providerAudioFramesAccepted===600);
assert.equal(closed.payload.providerAudioFramesAccepted,600);
assert.equal(closed.payload.playoutFramesWritten,600);
assert.equal(closed.payload.audioConservationMismatch,0);
assert.equal(closed.payload.startupBufferMsActual,500);
assert.ok(closed.payload.lowWaterEvents>=1);
assert.ok(closed.payload.starvationEvents>=1);
assert.ok(closed.payload.starvationDurationMs>0);
assert.ok(closed.payload.providerDeliveryGapDuringPlayoutMs>=500);
assert.ok(isolationMetrics.egressPacketGapP95Ms<35,`worker pacing p95 ${isolationMetrics.egressPacketGapP95Ms}`);
assert.ok(isolationMetrics.egressPacketGapMaxMs<80,`worker pacing max ${isolationMetrics.egressPacketGapMaxMs}`);
assert.ok(isolationMetrics.inResponsePacketGapP95Ms<35,`in-response p95 ${isolationMetrics.inResponsePacketGapP95Ms}`);
assert.ok(isolationMetrics.inResponsePacketGapMaxMs<80,`in-response max ${isolationMetrics.inResponsePacketGapMaxMs}`);
assert.equal(isolationMetrics.inResponseGapsOver80Ms,0);
assert.equal(isolationMetrics.inResponseGapsOver150Ms,0);
assert.equal(isolationMetrics.inResponseGapsOver300Ms,0);
assert.equal(isolationMetrics.inResponseGapsOver500Ms,0);
assert.equal(isolationMetrics.betweenResponseGapMaxMs,null);
socket.destroy();
worker.send({version:1,type:"shutdown",request_id:"shutdown"});
await new Promise<void>((resolve)=>worker.once("exit",()=>resolve()));
console.log("AI Platform media worker isolation tests: OK");
