import {
  renderSkillTemplate,
  type SkillFieldSchema,
  type SkillSchema,
} from "../../skills/skillSchema.js";
import type { SkillRoutingDecision } from "../../skills/skillRouter.js";

export type TaskActionState =
  | "not_requested" | "pending" | "succeeded" | "failed" | "unavailable";
export type GenericResponseIntent =
  | "ask_missing_field" | "confirm_collected_data" | "perform_action"
  | "report_action_result" | "clarify" | "farewell" | "fallback";

export type GenericConversationTaskState = {
  activeSkillId: number | null;
  detectedIntent: string | null;
  collectedFields: Record<string, string>;
  missingFields: string[];
  invalidFields: string[];
  confirmedFields: string[];
  lastUpdatedFields: string[];
  currentStep: GenericResponseIntent;
  nextField: string | null;
  actionState: TaskActionState;
  actionResult: Record<string, unknown> | null;
  taskStatus: "idle" | "collecting" | "ready" | "completed" | "failed";
};

export type GenericResponsePlan = {
  intent: GenericResponseIntent;
  text: string | null;
  instructions: string;
  errorCode: string | null;
  templateKey: string | null;
  selectedAction: string | null;
};

export const createGenericTaskState = (): GenericConversationTaskState => ({
  activeSkillId: null,
  detectedIntent: null,
  collectedFields: {},
  missingFields: [],
  invalidFields: [],
  confirmedFields: [],
  lastUpdatedFields: [],
  currentStep: "clarify",
  nextField: null,
  actionState: "not_requested",
  actionResult: null,
  taskStatus: "idle",
});

const normalized = (value: string) =>
  value.toLocaleLowerCase("ru-RU").replace(/[.,!?;:]+/gu, " ").replace(/\s+/gu, " ").trim();

const normalizeTime = (hour: string, minutes = "00") =>
  `${String(Math.max(0, Math.min(23, Number(hour)))).padStart(2, "0")}:${minutes}`;

function parseUniversal(field: SkillFieldSchema, text: string) {
  const source = normalized(text);
  if (field.type === "date")
    return source.match(/(?:^|\s)(сегодня|завтра|послезавтра|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)(?=\s|$)/u)?.[1] || null;
  if (field.type === "time") {
    const clock = source.match(/(?:^|\s|в\s)((?:[01]?\d|2[0-3]))[:.]([0-5]\d)(?=\s|$)/u);
    const hour = source.match(/(?:^|\s)(?:в|на|к)\s+((?:[01]?\d|2[0-3]))(?=\s|$)/u)?.[1];
    return clock ? normalizeTime(clock[1], clock[2]) : hour ? normalizeTime(hour) : null;
  }
  if (field.type === "phone")
    return /\+?\d[\d ()-]{8,}/u.test(source) ? "provided" : null;
  if (field.type === "number")
    return source.match(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|$)/u)?.[1]?.replace(",", ".") || null;
  if (field.type === "boolean") {
    if (/(?:^|\s)(?:да|верно|согласен|согласна)(?=\s|$)/u.test(source)) return "true";
    if (/(?:^|\s)(?:нет|неверно|не согласен|не согласна)(?=\s|$)/u.test(source)) return "false";
    return null;
  }
  return null;
}

function configuredValue(skill: SkillSchema, field: SkillFieldSchema, text: string) {
  const source = normalized(text);
  const catalog = skill.catalogs.find((item) => item.catalogKey === field.enumSource);
  for (const entry of catalog?.values || [])
    if ([entry.value, ...entry.synonyms].some((candidate) =>
      source.includes(normalized(candidate)))) return entry.value;
  for (const synonym of field.synonyms)
    if (source.includes(normalized(synonym))) return synonym;
  if (field.type === "text" || field.type === "entity") {
    for (const hint of field.extractionHints) {
      const index = source.indexOf(normalized(hint));
      if (index >= 0) {
        const value = source.slice(index + normalized(hint).length).trim().split(/\s+/u).slice(0, 8).join(" ");
        if (value) return value;
      }
    }
  }
  return null;
}

export function validateGenericTaskState(
  state: GenericConversationTaskState,
  skills: SkillSchema[],
) {
  const skill = skills.find((item) => item.id === state.activeSkillId);
  if (!skill) {
    state.missingFields = [];
    state.invalidFields = [];
    state.nextField = null;
    state.taskStatus = "idle";
    return state;
  }
  state.missingFields = skill.fields
    .filter((field) => field.required && !state.collectedFields[field.key])
    .map((field) => field.key);
  state.invalidFields = skill.fields
    .filter((field) => {
      const value = state.collectedFields[field.key];
      const pattern = field.validation.pattern;
      return Boolean(value && typeof pattern === "string" && !new RegExp(pattern, "u").test(value));
    }).map((field) => field.key);
  state.nextField = state.invalidFields[0] || state.missingFields[0] || null;
  state.taskStatus = state.actionState === "succeeded" ? "completed"
    : state.actionState === "failed" ? "failed"
      : state.nextField ? "collecting" : "ready";
  return state;
}

export function updateGenericTaskState(
  state: GenericConversationTaskState,
  skills: SkillSchema[],
  text: string,
) {
  let skill = skills.find((item) => item.id === state.activeSkillId) || null;
  state.lastUpdatedFields = [];
  if (!skill) return validateGenericTaskState(state, skills);
  for (const field of skill.fields) {
    const value = parseUniversal(field, text) || configuredValue(skill, field, text);
    if (value && state.collectedFields[field.key] !== value) {
      state.collectedFields[field.key] = value;
      state.lastUpdatedFields.push(field.key);
    }
  }
  return validateGenericTaskState(state, skills);
}

export function applySkillRoutingDecision(
  state: GenericConversationTaskState,
  skills: SkillSchema[],
  decision: SkillRoutingDecision,
) {
  if (state.activeSkillId || !decision.skillId) return state;
  const skill = skills.find((item) => item.id === decision.skillId);
  if (!skill) return state;
  state.activeSkillId = skill.id;
  state.detectedIntent = skill.skillKey;
  return validateGenericTaskState(state, skills);
}

export function setGenericActionState(
  state: GenericConversationTaskState,
  skills: SkillSchema[],
  actionState: TaskActionState,
  result: Record<string, unknown> | null = null,
) {
  state.actionState = actionState;
  state.actionResult = result;
  return validateGenericTaskState(state, skills);
}

export function planGenericResponse(
  state: GenericConversationTaskState,
  skills: SkillSchema[],
  agentName = "",
): GenericResponsePlan {
  validateGenericTaskState(state, skills);
  const skill = skills.find((item) => item.id === state.activeSkillId);
  if (!skill) return {
    intent: "clarify",
    text: null,
    instructions: "Ответь кратко по существу и не утверждай, что действие выполнено.",
    errorCode: null,
    templateKey: null,
    selectedAction: null,
  };
  const field = skill.fields.find((item) => item.key === state.nextField);
  const action = skill.actions[0];
  if (
    !field &&
    state.actionState === "not_requested" &&
    action?.executorKey?.startsWith("unavailable/")
  ) {
    setGenericActionState(state, skills, "unavailable", {
      errorCode: "action_unavailable",
      actionKey: action.actionKey,
      executorKey: action.executorKey,
      executorResult: "unavailable",
      invoked: true,
    });
  }
  let intent: GenericResponseIntent;
  let template: string | undefined | null;
  let templateKey: string | null = null;
  if (field) {
    intent = "ask_missing_field";
    template = field.askTemplate || skill.responseTemplates.ask_field;
    templateKey = field.askTemplate ? `field.${field.key}.ask_template` : "ask_field";
  } else if (state.actionState === "succeeded") {
    intent = "report_action_result";
    template = skill.responseTemplates.action_success;
    templateKey = "action_success";
  } else if (state.actionState === "failed") {
    intent = "report_action_result";
    template = skill.responseTemplates.action_failed;
    templateKey = "action_failed";
  } else if (state.actionState === "unavailable" || !skill.actions.length) {
    intent = "report_action_result";
    template = skill.responseTemplates.action_unavailable;
    templateKey = "action_unavailable";
  } else {
    intent = "perform_action";
    template = skill.responseTemplates.action_pending;
    templateKey = "action_pending";
  }
  state.currentStep = intent;
  const selectedTemplate = template || skill.responseTemplates.fallback;
  if (!selectedTemplate) return {
    intent,
    text: null,
    instructions: "INTERNAL SAFE ERROR: action_execution_failed. Do not generate customer-facing text.",
    errorCode: "action_execution_failed",
    templateKey: null,
    selectedAction: action?.actionKey || null,
  };
  const text = renderSkillTemplate(selectedTemplate, {
    field: { label: field?.label, value: field ? state.collectedFields[field.key] : undefined },
    skill: { name: skill.name },
    agent: { name: agentName },
    action: { name: action?.name },
  });
  return {
    intent,
    text,
    instructions: `Произнеси только: «${text}»`,
    errorCode: null,
    templateKey,
    selectedAction: action?.actionKey || null,
  };
}

export function compileGenericTaskInstructions(
  state: GenericConversationTaskState,
  skills: SkillSchema[],
) {
  const plan = planGenericResponse(state, skills);
  return [
    "CURRENT CONFIGURED TASK (internal):",
    `skill=${state.detectedIntent || "unknown"}; known=${Object.keys(state.collectedFields).join(",") || "none"}; missing=${state.missingFields.join(",") || "none"}; action_state=${state.actionState}.`,
    plan.instructions,
    "Не утверждай, что действие выполнено, пока action_state не succeeded.",
  ].join("\n");
}

export const isFarewellIntent = (text: string) =>
  /(?:до\s+свидани[яе]|спасибо[,\s]+вс[её]|вс[её][,\s]+спасибо|можно\s+заканчивать|положи(?:те)?\s+труб(?:ку|очку)|вс[её][,\s]+пока|заверши(?:те)?\s+(?:звонок|разговор))/iu.test(text);
