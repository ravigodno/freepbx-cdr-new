// With explicit commits Yandex may return the complete accumulated input.
// Strip the previous prefix, including a small trailing ASR correction in a
// long cumulative transcript. Never discard a standalone repeated question.
export class YandexInputTranscript {
  private previous = "";
  private cumulative = false;
  reset() { this.previous = "";this.cumulative=false; }
  take(text: string) {
    const result=this.preview(text);
    this.accept(text);
    return result;
  }
  accept(text:string) {
    const current=text.trim();
    if(!current)return;
    if(this.previous&&current.startsWith(this.previous)&&/^\s/u.test(current.slice(this.previous.length)))
      this.cumulative=true;
    this.previous=current;
  }
  preview(text:string) {
    const current = text.trim();
    if (!current) return current;
    const previous = this.previous;
    // Once the provider has demonstrated cumulative recognition, an unchanged
    // snapshot is old input, not a new utterance. Wait for the current audio.
    if(this.cumulative&&current===previous)return '';
    if (previous && current.startsWith(previous) && /^\s/u.test(current.slice(previous.length)))
      return current.slice(previous.length).trim();
    const before=previous.split(/\s+/u),after=[...current.matchAll(/\S+/gu)];
    let common=0;
    while(common<before.length&&common<after.length&&before[common]===after[common][0])common++;
    // Yandex can revise the last recognized word on the next commit. Require
    // a long, almost identical history and additional words before stripping.
    if(before.length>=8&&after.length>before.length&&common>=before.length-2&&common/before.length>=0.8)
      return current.slice(after[before.length].index).trim();
    return current;
  }
}
