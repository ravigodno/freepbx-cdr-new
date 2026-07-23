const WORD = /[\p{L}\p{N}][\p{L}\p{N}-]*/gu;
const TERMINAL = /[.!?…][»”"')\]]*$/u;
const DANGLING_WORDS = new Set([
  "а",
  "без",
  "в",
  "для",
  "до",
  "если",
  "и",
  "из",
  "или",
  "как",
  "к",
  "когда",
  "на",
  "но",
  "о",
  "об",
  "от",
  "по",
  "при",
  "про",
  "с",
  "со",
  "у",
  "что",
  "чтобы",
]);
const DANGLING_PHRASES = [
  /(?:^|\s)чем\s+могу$/iu,
  /(?:^|\s)я\s+могу$/iu,
  /(?:^|\s)могу\s+помочь\s+с$/iu,
  /(?:^|\s)да,\s*вас$/iu,
  /(?:^|\s)хорошо,\s*да$/iu,
];

export type SemanticCompletion = {
  complete: boolean;
  reason: "complete" | "empty" | "missing_terminal" | "dangling_word" | "dangling_phrase";
  words: number;
};

export function assessSemanticCompletion(value: string): SemanticCompletion {
  const text = String(value || "").trim(),
    words = text.match(WORD) || [];
  if (!text) return { complete: false, reason: "empty", words: 0 };
  const withoutTerminal = text.replace(/[.!?…»”"')\]]+$/u, "").trim(),
    lastWord = (withoutTerminal.match(WORD) || []).at(-1)?.toLocaleLowerCase("ru");
  if (DANGLING_PHRASES.some((pattern) => pattern.test(withoutTerminal)))
    return { complete: false, reason: "dangling_phrase", words: words.length };
  if (lastWord && DANGLING_WORDS.has(lastWord))
    return { complete: false, reason: "dangling_word", words: words.length };
  if (!TERMINAL.test(text))
    return { complete: false, reason: "missing_terminal", words: words.length };
  return { complete: true, reason: "complete", words: words.length };
}

export type ReceptionistResponseBudgets = {
  response: number;
  retry: number;
  greeting: number;
};

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(min, Math.min(max, Math.floor(numeric)))
    : fallback;
};

export function receptionistResponseBudgets(config: unknown): ReceptionistResponseBudgets {
  const voice =
    config && typeof config === "object" && (config as any).voice
      ? (config as any).voice
      : {};
  return {
    response: clamp(voice.maxGeneratedUnits, 320, 160, 320),
    retry: clamp(voice.retryGeneratedUnits, 512, 256, 640),
    greeting: clamp(voice.greetingGeneratedUnits, 192, 160, 320),
  };
}

export type ResponseCompletionAction =
  | "play"
  | "retry"
  | "fallback"
  | "discard";

export function decideResponseCompletion(input:{
  providerStatus?:string;
  finishReason?:string;
  transcript:string;
  retryCount:number;
  fallbackResponse?:boolean;
  framesSent?:number;
}):{
  action:ResponseCompletionAction;
  semantic:SemanticCompletion;
  outputTokenLimitHit:boolean;
}{
  const semantic=assessSemanticCompletion(input.transcript),
    outputTokenLimitHit=
      input.providerStatus==="incomplete" &&
      input.finishReason==="max_output_tokens";
  if(!outputTokenLimitHit||semantic.complete)
    return {action:"play",semantic,outputTokenLimitHit};
  if(input.fallbackResponse)
    return {action:"discard",semantic,outputTokenLimitHit};
  return {
    action:input.retryCount===0&&Number(input.framesSent||0)===0?"retry":"play",
    semantic,
    outputTokenLimitHit,
  };
}
