export type TaskActionState =
  | "not_requested" | "pending" | "succeeded" | "failed" | "unavailable";
export type ResponseIntent =
  | "ask_missing_field" | "confirm_collected_data" | "perform_action"
  | "report_action_result" | "clarify" | "farewell" | "fallback";
export type TaskSlot =
  | "service" | "specialist" | "date" | "time" | "branch"
  | "client_name" | "phone" | "pet_name" | "notes";

export type ReceptionistTaskState = {
  detectedGoal: "appointment" | "information" | null;
  collectedFields: Partial<Record<TaskSlot, string>>;
  missingFields: TaskSlot[];
  lastUpdatedFields: TaskSlot[];
  currentIntent: ResponseIntent;
  nextQuestion: string | null;
  lastConfirmedDetail: string | null;
  taskStatus: "idle" | "collecting" | "ready" | "completed";
  actionState: TaskActionState;
};

const SPECIALISTS: Array<[RegExp, string]> = [
  [/(?:^|\s)невролог(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "невролог"],
  [/(?:^|\s)терапевт(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "терапевт"],
  [/(?:^|\s)кардиолог(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "кардиолог"],
  [/(?:^|\s)хирург(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "хирург"],
  [/(?:^|\s)педиатр(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "педиатр"],
  [/(?:^|\s)стоматолог(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "стоматолог"],
  [/(?:^|\s)дерматолог(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "дерматолог"],
  [/(?:^|\s)ветеринар(?:а|у|ом)?(?=\s|$|[,.!?])/iu, "ветеринар"],
];
const REQUIRED_APPOINTMENT_FIELDS: TaskSlot[] = ["date", "time", "specialist"];

export const createTaskState = (): ReceptionistTaskState => ({
  detectedGoal: null,
  collectedFields: {},
  missingFields: [],
  lastUpdatedFields: [],
  currentIntent: "clarify",
  nextQuestion: null,
  lastConfirmedDetail: null,
  taskStatus: "idle",
  actionState: "not_requested",
});

const normalizeTime = (hour: string, minutes = "00") =>
  `${String(Math.max(0, Math.min(23, Number(hour)))).padStart(2, "0")}:${minutes}`;

export function updateTaskState(state: ReceptionistTaskState, text: string) {
  const normalized = String(text || "").toLocaleLowerCase("ru-RU");
  const updates: Partial<Record<TaskSlot, string>> = {};
  if (/(запиш|запис[ьи]|при[её]м|к\s+врач)/u.test(normalized))
    state.detectedGoal = "appointment";
  const date = normalized.match(
    /(?:^|\s)(сегодня|завтра|послезавтра|\d{1,2}[./]\d{1,2})(?=\s|$|[,.!?])/u,
  )?.[1];
  const clock = normalized.match(
    /(?:^|\s|в\s)((?:[01]?\d|2[0-3]))[:.]([0-5]\d)(?=\s|$|[,.!?])/u,
  );
  const hourOnly = normalized.match(
    /(?:^|\s)в\s+((?:[01]?\d|2[0-3]))(?=\s|$|[,.!?])/u,
  )?.[1];
  const specialist = SPECIALISTS.find(([pattern]) => pattern.test(normalized))?.[1];
  const service = normalized.match(/(?:на|для)\s+(консультаци[юя]|осмотр|при[её]м|процедур[уы])/u)?.[1];
  const branch = normalized.match(/(?:в\s+филиал(?:е)?|филиал)\s+([а-яё0-9 -]{2,40})/u)?.[1]?.trim();
  const clientName = normalized.match(/(?:меня\s+зовут|я)\s+([а-яё-]{2,30})/u)?.[1];
  const petName = normalized.match(/(?:питомц[аеу]|кот[аеу]?|собак[аеу]?)\s+(?:зовут\s+)?([а-яё-]{2,30})/u)?.[1];
  if (date) updates.date = date;
  if (clock) updates.time = normalizeTime(clock[1], clock[2]);
  else if (hourOnly) updates.time = normalizeTime(hourOnly);
  if (specialist) updates.specialist = specialist;
  if (service) updates.service = service;
  if (branch) updates.branch = branch;
  if (clientName) updates.client_name = clientName;
  if (/\+?\d[\d ()-]{8,}/u.test(normalized)) updates.phone = "provided";
  if (petName) updates.pet_name = petName;
  state.lastUpdatedFields = [];
  for (const [slot, value] of Object.entries(updates) as Array<[TaskSlot, string]>) {
    if (state.collectedFields[slot] !== value) state.lastUpdatedFields.push(slot);
    state.collectedFields[slot] = value;
  }
  state.lastConfirmedDetail =
    state.lastUpdatedFields.length > 0
      ? state.collectedFields[state.lastUpdatedFields.at(-1)!] || null
      : state.lastConfirmedDetail;
  validateTaskState(state);
  return state;
}

export function validateTaskState(state: ReceptionistTaskState) {
  if (state.detectedGoal === "appointment") {
    state.missingFields = REQUIRED_APPOINTMENT_FIELDS.filter(
      (field) => !state.collectedFields[field],
    );
    state.taskStatus =
      state.actionState === "succeeded"
        ? "completed"
        : state.missingFields.length
          ? "collecting"
          : "ready";
    const missing = state.missingFields[0];
    state.nextQuestion =
      missing === "date" ? "На какой день вас записать?"
        : missing === "time"
          ? state.collectedFields.date
            ? `На какое время ${state.collectedFields.date} вас записать?`
            : "На какое время вас записать?"
          : missing === "specialist"
            ? "К какому специалисту вас записать?"
            : null;
  } else {
    state.missingFields = [];
    state.taskStatus = "idle";
    state.nextQuestion = null;
  }
  return state;
}

export function setTaskActionState(state: ReceptionistTaskState, actionState: TaskActionState) {
  state.actionState = actionState;
  return validateTaskState(state);
}

export type ReceptionistResponsePlan = {
  intent: ResponseIntent;
  text: string | null;
  instructions: string;
};

export function planReceptionistResponse(state: ReceptionistTaskState): ReceptionistResponsePlan {
  validateTaskState(state);
  if (state.detectedGoal !== "appointment")
    return {
      intent: "clarify",
      text: null,
      instructions: "Ответь по существу одним коротким предложением. Не утверждай, что какое-либо действие выполнено.",
    };
  if (state.missingFields.length) {
    state.currentIntent = "ask_missing_field";
    return {
      intent: "ask_missing_field",
      text: state.nextQuestion,
      instructions: `Произнеси только: «${state.nextQuestion}»`,
    };
  }
  if (state.actionState === "succeeded") {
    state.currentIntent = "report_action_result";
    return {
      intent: "report_action_result",
      text: "Запись подтверждена.",
      instructions: "Произнеси только: «Запись подтверждена.»",
    };
  }
  if (state.actionState === "failed" || state.actionState === "unavailable") {
    state.currentIntent = "report_action_result";
    return {
      intent: "report_action_result",
      text: "Я пока не могу подтвердить запись. Соединить с сотрудником?",
      instructions: "Произнеси только: «Я пока не могу подтвердить запись. Соединить с сотрудником?»",
    };
  }
  state.actionState = "unavailable";
  state.currentIntent = "report_action_result";
  return {
    intent: "report_action_result",
    text: "Я пока не могу подтвердить запись. Соединить с сотрудником?",
    instructions: "Произнеси только: «Я пока не могу подтвердить запись. Соединить с сотрудником?»",
  };
}

export function compileTaskStateInstructions(state: ReceptionistTaskState) {
  const plan = planReceptionistResponse(state);
  const known = Object.entries(state.collectedFields)
    .map(([key, value]) => `${key}=${value}`).join(", ");
  return [
    "CURRENT CUSTOMER TASK (internal):",
    `goal=${state.detectedGoal || "unknown"}; known=${known || "none"}; missing=${state.missingFields.join(",") || "none"}; action_state=${state.actionState}.`,
    plan.instructions,
    "Запрещено говорить «Вы записаны», «Запись подтверждена» или «Я перенесла запись», если action_state не succeeded.",
  ].join("\n");
}

export const isFarewellIntent = (text: string) =>
  /(?:до\s+свидани[яе]|спасибо[,\s]+вс[её]|вс[её][,\s]+спасибо|можно\s+заканчивать|положи(?:те)?\s+труб(?:ку|очку)|вс[её][,\s]+пока|заверши(?:те)?\s+(?:звонок|разговор))/iu.test(text);
