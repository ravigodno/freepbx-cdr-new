export type CallClosingState =
  | "active" | "closing_requested" | "farewell_spoken"
  | "hangup_requested" | "hangup_confirmed";

export type ReceptionistTaskState = {
  detectedGoal: "appointment" | "information" | null;
  collectedFields: Record<string, string>;
  missingFields: string[];
  currentQuestion: string | null;
  lastConfirmedDetail: string | null;
  taskStatus: "idle" | "collecting" | "ready";
  nextBestQuestion: string | null;
};

export const createTaskState = (): ReceptionistTaskState => ({
  detectedGoal: null, collectedFields: {}, missingFields: [],
  currentQuestion: null, lastConfirmedDetail: null,
  taskStatus: "idle", nextBestQuestion: null,
});

export function updateTaskState(state: ReceptionistTaskState, text: string) {
  const normalized = text.toLocaleLowerCase("ru-RU");
  if (/(запиш|при[её]м|врач)/u.test(normalized)) state.detectedGoal = "appointment";
  const date = normalized.match(/(?:^|\s)(сегодня|завтра|послезавтра|\d{1,2}[./]\d{1,2})(?=\s|$|[,.!?])/u)?.[1];
  const time = normalized.match(/(?:^|\s)((?:[01]?\d|2[0-3])[:.][0-5]\d)(?=\s|$|[,.!?])/u)?.[1];
  const doctor = normalized.match(/(?:к|врач[ау]?)\s+([а-яё-]{3,}(?:\s+[а-яё-]{3,})?)/u)?.[1];
  if (date) state.collectedFields.date = date;
  if (time) state.collectedFields.time = time;
  if (doctor && !/врач|при[её]м/u.test(doctor)) state.collectedFields.specialist = doctor;
  if (date || time || doctor) state.lastConfirmedDetail = date || time || doctor || null;
  if (state.detectedGoal === "appointment") {
    state.missingFields = ["date", "time"].filter((key) => !state.collectedFields[key]);
    state.taskStatus = state.missingFields.length ? "collecting" : "ready";
    state.nextBestQuestion = state.missingFields[0] === "date"
      ? "На какой день вас записать?"
      : state.missingFields[0] === "time"
        ? "На какое время вас записать?"
        : null;
    state.currentQuestion = state.nextBestQuestion;
  }
  return state;
}

export function compileTaskStateInstructions(state: ReceptionistTaskState) {
  if (!state.detectedGoal) return "";
  const known = Object.entries(state.collectedFields)
    .map(([key, value]) => `${key}=${value}`).join(", ");
  return [
    "CURRENT CUSTOMER TASK (internal):",
    `goal=${state.detectedGoal}; known=${known || "none"}; missing=${state.missingFields.join(",") || "none"}.`,
    state.nextBestQuestion
      ? `Задай только следующий недостающий вопрос: «${state.nextBestQuestion}»`
      : "Не спрашивай повторно уже названные детали.",
  ].join("\n");
}

export const isFarewellIntent = (text: string) =>
  /(?:до\s+свидани[яе]|вс[её][,\s]+спасибо|можно\s+заканчивать|положи(?:те)?\s+трубку|заверши(?:те)?\s+(?:звонок|разговор))/iu.test(text);
