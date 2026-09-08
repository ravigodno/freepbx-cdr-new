// Volatile, per-call audio only. Never retain or recognize a truncated utterance.
export class YandexTurnAudio {
  private pending:Buffer[]=[];
  private committed:Buffer[]=[];
  private bytes=0;
  private overflow=false;
  append(pcm:Buffer){
    if(this.overflow)return;
    this.bytes+=pcm.length;
    if(this.bytes>30*16000*2){this.overflow=true;this.pending=[];this.committed=[];return;}
    this.pending.push(Buffer.from(pcm));
  }
  commit(){this.committed.push(...this.pending);this.pending=[];}
  snapshot(){return this.overflow||!this.committed.length?null:Buffer.concat(this.committed);}
  accept(){this.bytes=this.pending.reduce((sum,b)=>sum+b.length,0);this.committed=[];this.overflow=false;}
  reset(){this.pending=[];this.committed=[];this.bytes=0;this.overflow=false;}
}
