const SELF_REFERENTIAL_INTERNAL =
  /(?:(?:я|мне|у меня|мой|моя)[^.!?]{0,70}(?:нет доступа|не могу|не разрешено|ограничен|запрещено)[^.!?]{0,70}(?:backend|бэкенд|API|SQL|база данных|инструмент)|(?:мой|моя|внутренн(?:ий|яя|ие)|системн(?:ый|ая|ые))[^.!?]{0,90}(?:system prompt|системн(?:ый|ого)\s+prompt|tool call|executor|policy engine|allowlist|внутренн(?:яя|ие)\s+(?:инструкц|политик)|безопасн(?:ый|ого)\s+(?:backend|бэкенд)))/iu;

export function containsInternalAgentDisclosure(text: string) {
  return SELF_REFERENTIAL_INTERNAL.test(String(text || ""));
}

export function customerSafeToolResult(ok: boolean) {
  return ok
    ? "Я уточнил информацию и могу продолжить."
    : "Сейчас я не могу выполнить это действие. Я могу соединить вас с сотрудником.";
}
