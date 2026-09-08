import { StringDecoder } from 'node:string_decoder';

// SpeechKit REST emits newline-delimited JSON envelopes. Network boundaries
// need not coincide with JSON lines, UTF-8 characters or PCM frames.
export async function readYandexAudioStream(source:AsyncIterable<Buffer>, emit:(audio:Buffer)=>void) {
  const decoder=new StringDecoder('utf8');
  let pending='',bytes=0;
  const consume=(line:string)=>{
    if(!line.trim())return;
    const envelope=JSON.parse(line),item=envelope.result??envelope;
    if(envelope.error)throw new Error('SpeechKit synthesis stream failed');
    const data=item?.audioChunk?.data;
    if(data===undefined)return;
    if(typeof data!=='string'||!data.length||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))
      throw new Error('Invalid SpeechKit audio encoding');
    const audio=Buffer.from(data,'base64');
    bytes+=audio.length;
    if(bytes>8*1024*1024)throw new Error('SpeechKit audio exceeds limit');
    emit(audio);
  };
  for await(const chunk of source){
    pending+=decoder.write(chunk);
    let end:number;
    while((end=pending.indexOf('\n'))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1);}
    if(pending.length>12*1024*1024)throw new Error('SpeechKit envelope exceeds limit');
  }
  pending+=decoder.end();consume(pending);
  if(!bytes)throw new Error('SpeechKit returned no audio');
}

export class Pcm16FrameStream {
  private pending=Buffer.alloc(0);
  constructor(private readonly emit:(samples:Int16Array)=>void){}
  push(chunk:Buffer){
    this.pending=Buffer.concat([this.pending,chunk]);
    while(this.pending.length>=320){this.frame(this.pending.subarray(0,320));this.pending=this.pending.subarray(320);}
  }
  finish(){
    if(this.pending.length%2)throw new Error('Truncated PCM sample');
    if(this.pending.length){const frame=Buffer.alloc(320);this.pending.copy(frame);this.frame(frame);}
    this.pending=Buffer.alloc(0);
  }
  private frame(pcm:Buffer){
    const samples=new Int16Array(160);
    for(let i=0;i<160;i++)samples[i]=pcm.readInt16LE(i*2);
    this.emit(samples);
  }
}
