import type { SkillSchema } from "./skillSchema.js";
import { redactAiPlatformText } from "../core/redaction.js";

export type SkillClassificationSource =
  | "trigger" | "intent_example" | "description" | "extraction_hint"
  | "structured_classifier" | "ambiguous" | "none";

export type SkillRoutingAlternative = {
  skillId: number;
  skillKey: string;
  confidence: number;
};

export type SkillRoutingDecision = {
  skillId: number | null;
  confidence: number;
  matchedTrigger: string | null;
  matchedExample: string | null;
  classificationSource: SkillClassificationSource;
  alternatives: SkillRoutingAlternative[];
  activationReason: string;
  requiresClarification: boolean;
};

export type StructuredSkillClassifier = (
  input: {
    text: string;
    skills: Array<{
      id: number;
      name: string;
      description: string;
      intentExamples: string[];
    }>;
  },
) => Promise<{ skillId: number | null; confidence: number; reasonSafe: string }>;

const RU_SUFFIXES = [
  "иями", "ями", "ами", "его", "ого", "ему", "ому", "иях", "ах", "ях",
  "ить", "ыть", "ать", "еться", "аться", "иться", "ете", "ите", "ишь",
  "ешь", "ют", "ут", "ят", "ат", "ено", "ена", "ены", "ение", "ения",
  "ию", "июсь", "ись", "ться", "ся", "ей", "ой", "ий", "ый", "ая",
  "яя", "ое", "ее", "ие", "ые", "ам", "ям", "ом", "ем", "ов", "ев",
  "а", "я", "ы", "и", "у", "ю", "е", "о",
];

export function normalizeRussianIntent(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const stem = (token: string) => {
  if (token.length < 5) return token;
  const suffix = RU_SUFFIXES.find((item) => token.endsWith(item) && token.length - item.length >= 3);
  return suffix ? token.slice(0, -suffix.length) : token;
};

const tokens = (value: string) =>
  normalizeRussianIntent(value).split(/\s+/u).filter(Boolean).map(stem);

const closeToken = (left:string,right:string) => {
  if(left===right)return true;
  if(Math.min(left.length,right.length)<4||Math.abs(left.length-right.length)>1)return false;
  let previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let i=1;i<=left.length;i++){
    const current=[i];
    for(let j=1;j<=right.length;j++)
      current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(left[i-1]===right[j-1]?0:1));
    previous=current;
  }
  return previous[right.length]<=1;
};

const similarity = (left: string, right: string) => {
  const a = new Set(tokens(left)), b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if ([...b].some((candidate)=>closeToken(item,candidate))) intersection++;
  return intersection / Math.max(1, Math.min(a.size, b.size));
};

const phraseMatch = (text: string, phrase: string) => {
  const source = normalizeRussianIntent(text), candidate = normalizeRussianIntent(phrase);
  if (!candidate) return 0;
  if (source.includes(candidate)) return 1;
  return similarity(source, candidate);
};

type Candidate = SkillRoutingAlternative & {
  matchedTrigger: string | null;
  matchedExample: string | null;
  source: SkillClassificationSource;
};

function scoreSkill(skill: SkillSchema, text: string): Candidate {
  if ((skill.negativeTriggerPhrases || []).some((phrase) => phraseMatch(text, phrase) >= .8))
    return { skillId: skill.id, skillKey: skill.skillKey, confidence: 0, matchedTrigger: null, matchedExample: null, source: "none" };
  let best = 0, source: SkillClassificationSource = "none";
  let matchedTrigger: string | null = null, matchedExample: string | null = null;
  for (const phrase of skill.triggerPhrases || []) {
    const score = phraseMatch(text, phrase);
    if (score > best) { best = score; source = "trigger"; matchedTrigger = phrase; matchedExample = null; }
  }
  for (const example of skill.intentExamples) {
    const score = phraseMatch(text, example) * .95;
    if (score > best) { best = score; source = "intent_example"; matchedExample = example; matchedTrigger = null; }
  }
  const descriptionScore = similarity(text, skill.description) * .72;
  if (descriptionScore > best) { best = descriptionScore; source = "description"; matchedTrigger = null; matchedExample = null; }
  const hints = skill.fields.flatMap((field) => field.extractionHints);
  const hintScore = Math.max(0, ...hints.map((hint) => phraseMatch(text, hint))) * .68;
  if (hintScore > best) { best = hintScore; source = "extraction_hint"; matchedTrigger = null; matchedExample = null; }
  return { skillId: skill.id, skillKey: skill.skillKey, confidence: Math.min(1, best), matchedTrigger, matchedExample, source };
}

export class SkillRouter {
  constructor(private classifier: StructuredSkillClassifier | null = null) {}

  setClassifier(classifier: StructuredSkillClassifier | null) {
    this.classifier = classifier;
  }

  async route(skills: SkillSchema[], text: string): Promise<SkillRoutingDecision> {
    const ranked = skills.map((skill) => scoreSkill(skill, text))
      .sort((a, b) => b.confidence - a.confidence);
    const alternatives = ranked.slice(0, 3).map(({ skillId, skillKey, confidence }) => ({
      skillId, skillKey, confidence: Number(confidence.toFixed(3)),
    }));
    const top = ranked[0], skill = skills.find((item) => item.id === top?.skillId);
    const threshold = skill?.activationThreshold ?? .72;
    const ambiguous = Boolean(
      top && ranked[1] && top.confidence >= threshold &&
      ranked[1].confidence >= (skills.find((item) => item.id === ranked[1].skillId)?.activationThreshold ?? .72) &&
      Math.abs(top.confidence - ranked[1].confidence) < .12,
    );
    if (ambiguous) return {
      skillId: null, confidence: Number(top.confidence.toFixed(3)),
      matchedTrigger: top.matchedTrigger, matchedExample: top.matchedExample,
      classificationSource: "ambiguous", alternatives,
      activationReason: "multiple_configured_skills_matched",
      requiresClarification: (skill?.ambiguityPolicy ?? "clarify") !== "none",
    };
    if (top && top.confidence >= threshold) return {
      skillId: top.skillId, confidence: Number(top.confidence.toFixed(3)),
      matchedTrigger: top.matchedTrigger, matchedExample: top.matchedExample,
      classificationSource: top.source, alternatives,
      activationReason: `configured_${top.source}_matched`,
      requiresClarification: false,
    };
    if (this.classifier && skills.length) {
      try {
        const result = await this.classifier({
          text: redactAiPlatformText(text),
          skills: skills.map(({ id, name, description, intentExamples }) => ({ id, name, description, intentExamples })),
        });
        const selected = skills.find((item) => item.id === result.skillId);
        const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
        if (selected && confidence >= selected.activationThreshold) return {
          skillId: selected.id, confidence, matchedTrigger: null, matchedExample: null,
          classificationSource: "structured_classifier", alternatives,
          activationReason: String(result.reasonSafe || "structured_classifier_match").slice(0, 160),
          requiresClarification: false,
        };
      } catch {}
    }
    return {
      skillId: null, confidence: Number((top?.confidence || 0).toFixed(3)),
      matchedTrigger: top?.matchedTrigger || null, matchedExample: top?.matchedExample || null,
      classificationSource: "none", alternatives,
      activationReason: "no_skill_above_activation_threshold",
      requiresClarification: false,
    };
  }
}
