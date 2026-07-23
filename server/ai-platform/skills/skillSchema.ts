export const SKILL_SCHEMA_VERSION = 1;

export type SkillFieldType =
  | "text" | "number" | "phone" | "date" | "time"
  | "datetime" | "enum" | "boolean" | "entity";

export type SkillFieldSchema = {
  key: string;
  label: string;
  type: SkillFieldType;
  required: boolean;
  extractionHints: string[];
  synonyms: string[];
  enumSource: string | null;
  validation: Record<string, unknown>;
  confirmationRequired: boolean;
  sensitive: boolean;
  displayOrder: number;
  askTemplate: string | null;
};

export type SkillActionSchema = {
  id: number;
  actionKey: string;
  name: string;
  requiredFields: string[];
  executorKey: string | null;
  permissions: string[];
  timeoutMs: number;
  retryPolicy: Record<string, unknown>;
  successMapping: Record<string, unknown>;
  failureMapping: Record<string, unknown>;
};

export type SkillResponseTemplateKey =
  | "ask_field" | "confirm_fields" | "action_pending" | "action_success"
  | "action_failed" | "action_unavailable" | "escalation_offer"
  | "farewell" | "fallback" | "clarification";

export type EntityCatalogValue = {
  value: string;
  synonyms: string[];
};

export type EntityCatalogSchema = {
  catalogKey: string;
  name: string;
  entityType: string;
  values: EntityCatalogValue[];
};

export type SkillSchema = {
  id: number;
  schemaVersion: number;
  skillKey: string;
  name: string;
  description: string;
  intentExamples: string[];
  fields: SkillFieldSchema[];
  actions: SkillActionSchema[];
  responseTemplates: Partial<Record<SkillResponseTemplateKey, string>>;
  validationRules: Record<string, unknown>;
  escalationPolicy: Record<string, unknown>;
  completionPolicy: Record<string, unknown>;
  catalogs: EntityCatalogSchema[];
  status: "draft" | "published" | "archived";
};

const KEY = /^[a-z][a-z0-9_]{1,63}$/;
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/g;
const ALLOWED_ROOTS = new Set(["field", "skill", "agent", "action"]);
export function validateSkillSchema(
  skill: SkillSchema,
  options: { configuredActions?: boolean } = {},
) {
  const errors: string[] = [], keys = new Set<string>();
  if (skill.schemaVersion !== SKILL_SCHEMA_VERSION) errors.push("schema_version_invalid");
  if (!KEY.test(skill.skillKey)) errors.push("skill_key_invalid");
  if (!skill.name.trim()) errors.push("skill_name_required");
  for (const field of skill.fields) {
    if (!KEY.test(field.key)) errors.push("field_key_invalid");
    if (keys.has(field.key)) errors.push("field_key_duplicate");
    keys.add(field.key);
    if (field.required && !field.label.trim()) errors.push("required_field_label_missing");
    if (["enum", "entity"].includes(field.type) && !field.enumSource)
      errors.push(`field_source_missing:${field.key}`);
  }
  for (const action of skill.actions)
    if (action.requiredFields.some((key) => !keys.has(key)))
      errors.push(`action_required_field_missing:${action.actionKey}`);
  if (options.configuredActions && !skill.actions.length)
    errors.push("configured_action_required");
  if (skill.actions.length && !skill.responseTemplates.action_success)
    errors.push("action_success_path_missing");
  if (!skill.responseTemplates.action_unavailable)
    errors.push("action_unavailable_template_missing");
  const dependencies = skill.validationRules.dependencies;
  if (dependencies && typeof dependencies === "object") {
    for (const [key, values] of Object.entries(dependencies as Record<string,string[]>))
      if (Array.isArray(values) && values.includes(key)) errors.push(`workflow_cycle:${key}`);
  }
  for (const [templateKey, template] of Object.entries(skill.responseTemplates)) {
    if (!String(template || "").trim()) errors.push(`template_empty:${templateKey}`);
    for (const match of String(template || "").matchAll(PLACEHOLDER))
      if (!ALLOWED_ROOTS.has(match[1].split(".")[0]))
        errors.push(`template_placeholder_invalid:${match[1]}`);
  }
  if (!skill.responseTemplates.fallback) errors.push("fallback_template_missing");
  if (!skill.escalationPolicy || !Object.keys(skill.escalationPolicy).length)
    errors.push("escalation_policy_missing");
  else if (typeof skill.escalationPolicy.enabled !== "boolean")
    errors.push("escalation_policy_invalid");
  return [...new Set(errors)];
}

export function validateConfiguredSkillSet(
  skills: SkillSchema[],
  config: Record<string, unknown>,
) {
  const configuredActions = Boolean(
    (config.skillEngine as Record<string, unknown> | undefined)?.configuredActions,
  );
  return [...new Set(skills.flatMap((skill) =>
    validateSkillSchema(skill, { configuredActions })
      .map((error) => `${skill.skillKey}:${error}`),
  ))];
}

export function renderSkillTemplate(
  template: string,
  input: {
    field?: { label?: string; value?: string };
    skill?: { name?: string };
    agent?: { name?: string };
    action?: { name?: string };
  },
) {
  return String(template || "").replace(PLACEHOLDER, (_all, path: string) => {
    const [root, key] = path.split(".");
    const value = (input as any)?.[root]?.[key];
    return value === undefined || value === null ? "" : String(value);
  }).replace(/\s{2,}/g, " ").trim();
}
