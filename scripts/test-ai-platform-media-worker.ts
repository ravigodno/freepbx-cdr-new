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
worker.send({version:1,type:"close_session",request_id:"close",session_ref:sessionRef});
const closed=await waitFor(event=>event.type==="session_metrics"&&event.payload?.providerAudioFramesAccepted===500);
assert.equal(closed.payload.providerAudioFramesAccepted,500);
assert.equal(closed.payload.playoutFramesWritten,500);
assert.equal(closed.payload.audioConservationMismatch,0);
assert.ok(closed.payload.egressPacketGapP95Ms<35,`worker pacing p95 ${closed.payload.egressPacketGapP95Ms}`);
assert.ok(closed.payload.egressPacketGapMaxMs<80,`worker pacing max ${closed.payload.egressPacketGapMaxMs}`);
assert.ok(closed.payload.inResponsePacketGapP95Ms<35,`in-response p95 ${closed.payload.inResponsePacketGapP95Ms}`);
assert.ok(closed.payload.inResponsePacketGapMaxMs<80,`in-response max ${closed.payload.inResponsePacketGapMaxMs}`);
assert.equal(closed.payload.inResponseGapsOver80Ms,0);
assert.equal(closed.payload.inResponseGapsOver150Ms,0);
assert.equal(closed.payload.inResponseGapsOver300Ms,0);
assert.equal(closed.payload.inResponseGapsOver500Ms,0);
assert.equal(closed.payload.betweenResponseGapMaxMs,null);
socket.destroy();
worker.send({version:1,type:"shutdown",request_id:"shutdown"});
await new Promise<void>((resolve)=>worker.once("exit",()=>resolve()));
console.log("AI Platform media worker isolation tests: OK");
