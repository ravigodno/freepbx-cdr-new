import { extractCallbackPhone, classifyCallbackConsent } from '../../actions/callbackConsent.js';
import { formatTranscriptPhones } from '../../../../shared/transcriptPhoneDisplay.js';
import type {VoiceIntent} from './contextualVoiceIntent.js';

export const VOICE_LEAD_DEFAULTS = {
  leadRequestPhrases: 'оформите заявку\nсоздайте заявку\nоставить заявку\nоставить обращение\nподготовьте расчёт\nподготовьте расчет\nдавайте расчёт\nдавайте расчет\nперезвоните мне',
  leadConfirm: 'Создать заявку для менеджера по вашему обращению?',
  leadPhone: 'На какой номер менеджер сможет с вами связаться?',
  leadPhoneConfirm: 'Подтвердите, пожалуйста: создать заявку с указанным номером?',
  leadSuccess: 'Заявка сохранена в PBXPuls. Менеджер увидит ваше обращение.',
  leadFailure: 'Не удалось сохранить заявку. Пожалуйста, попробуйте ещё раз позже.',
  leadDeclined: 'Хорошо, заявку не создаю.',
};

// Provider-independent, explicit two-step consent. Never infer approval from an
// arbitrary "yes", model output, retrieved documents or a tool's arguments.
export class VoiceLeadCapture {
  private phase: 'idle'|'confirm'|'phone'|'confirm_phone' = 'idle';
  private phone = '';
  private reason = '';
  private attemptedReason: string | null = null;
  private completed = false;
  private turn = -1;
  private pending: Promise<string|null> = Promise.resolve(null);
  constructor(private readonly settings: Record<string, unknown>, private readonly callerPhone: string) {}
  get active() { return this.phase !== 'idle'; }
  get context() { return {phase:this.phase,completed:this.completed,pendingSummary:this.reason}; }
  cancelPending() { this.phase='idle';this.phone=''; }
  private template(key: keyof typeof VOICE_LEAD_DEFAULTS) {
    return String(this.settings[key] || VOICE_LEAD_DEFAULTS[key]).trim().slice(0,500);
  }
  private requested(text: string) {
    if (/(?:(?:^|\s)(?:не|нет)(?:\s|[,!.?]|$)|если|допустим|например|цитат|[«»"])/iu.test(text)) return false;
    const value = text.toLocaleLowerCase('ru-RU').replace(/ё/gu,'е');
    return String(this.settings.leadRequestPhrases || VOICE_LEAD_DEFAULTS.leadRequestPhrases)
      .split('\n').map(s=>s.trim().toLocaleLowerCase('ru-RU').replace(/ё/gu,'е'))
      .filter(s=>s.length>=8).some(s=>value.includes(s));
  }
  respond(turn: number, text: string, history: string[], save: (phone:string, reason:string)=>Promise<boolean>, intent?:VoiceIntent) {
    if (this.settings.leadCaptureEnabled !== true) return Promise.resolve(null);
    if (turn === this.turn) return this.pending;
    this.turn=turn;
    this.pending=this.handle(text,history,save,intent);
    return this.pending;
  }
  private async handle(text:string,history:string[],save:(phone:string,reason:string)=>Promise<boolean>,intent?:VoiceIntent):Promise<string|null> {
    const consent=intent?intent.consent:classifyCallbackConsent(text,this.active);
    if (this.active && consent==='denied') { this.phase='idle';this.phone='';return this.template('leadDeclined'); }
    if (this.phase==='phone') {
      const phone=extractCallbackPhone(formatTranscriptPhones(text,'Назовите телефон'));
      if (!phone) return this.template('leadPhone');
      this.phone=phone;this.phase='confirm_phone';
      const confirmation=this.template('leadPhoneConfirm');
      return `${phone}. ${confirmation}`;
    }
    if (this.active && consent==='granted') {
      if (!this.phone) { this.phase='phone';return this.template('leadPhone'); }
      this.phase='idle';
      this.attemptedReason=this.reason;
      try {
        if (!await save(this.phone,this.reason)) return this.template('leadFailure');
        this.completed=true;return this.template('leadSuccess');
      } catch { return this.template('leadFailure'); }
    }
    // A clarification or an ASR fragment is not consent and must not silently
    // abandon the pending request. Keep the original phone and ask again.
    if (this.active) {
      if (!this.attemptedReason && text.trim())
        this.reason=[this.reason,text.trim().slice(0,160)].filter(Boolean).join('\n').slice(0,1000);
      return this.phase==='confirm_phone'
        ? `${this.phone}. ${this.template('leadPhoneConfirm')}`
        : this.template('leadConfirm');
    }
    if (!(intent?intent.intent==='lead_request':this.requested(text))) return null;
    if (this.completed) return this.template('leadSuccess');
    this.reason=this.attemptedReason??(intent?.summary||history.slice(-6).map(s=>s.slice(0,160)).join('\n').slice(0,1000));
    this.phone=extractCallbackPhone(this.callerPhone)||'';
    this.phase='confirm';
    return this.template('leadConfirm');
  }
}
