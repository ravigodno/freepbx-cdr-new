import type { RealtimeVoiceEvent } from "./realtimeVoiceTypes.js";

type Transcript = Extract<RealtimeVoiceEvent,{type:"transcript"}>;

// A response.create can expose a revised cumulative ASR snapshot. Confirm it
// on a subsequent probe; do not wait for unused probe speech to finish.
export class YandexRecognitionWindow {
  private candidate:Transcript|null=null;
  private previousSnapshot:string|null=null;
  private passes=0;
  deadlineAt=0;
  reset(now=Date.now()) {
    this.candidate=null;this.previousSnapshot=null;this.passes=0;
    this.deadlineAt=now+10000;
  }
  observe(event:Transcript) {
    if((event.extractionText||event.text).trim())this.candidate=event;
  }
  checkpoint() {
    this.passes++;
    const final=this.candidate;
    const snapshot=final?.inputSnapshot??final?.extractionText??final?.text;
    const stable=Boolean(final&&snapshot===this.previousSnapshot);
    this.previousSnapshot=snapshot??null;
    return {final,stable,passes:this.passes,ready:Boolean(final&&(stable||this.passes>=4))};
  }
}
