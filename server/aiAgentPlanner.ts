import { AI_AGENT_CAPABILITIES, buildPlannerPrompt } from './aiAgentPrompts.js';
import type { AiAgentCapabilityId } from './aiAgentCapabilities.js';

export interface AiAgentPlan {
  capability: AiAgentCapabilityId;
  reason: string;
  target?: string;
  raw?: string;
}

export type AiTextComplete = (params: {
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  responseType?: 'json' | 'text';
  apiKey?: string;
  baseUrl?: string;
}) => Promise<string>;

function extractJsonObject(raw: string): any | null {
  const text = String(raw || '').trim();
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function normalizeCapability(value: string): AiAgentCapabilityId {
  const capability = String(value || '').trim() as AiAgentCapabilityId;
  return AI_AGENT_CAPABILITIES.includes(capability) ? capability : 'answer_only';
}

export async function planAiAgentCapability(params: {
  userText: string;
  settings: any;
  complete: AiTextComplete;
}): Promise<AiAgentPlan> {
  const settings = params.settings || {};
  const raw = await params.complete({
    provider: settings.provider || 'gemini',
    model: settings.model || 'gemini-2.5-flash',
    temperature: 0,
    systemPrompt: 'Верни только валидный JSON. Не возвращай markdown.',
    responseType: 'json',
    messages: [{ role: 'user', text: buildPlannerPrompt(params.userText) }],
    apiKey: settings.apiKey || '',
    baseUrl: settings.baseUrl || ''
  });

  const parsed = extractJsonObject(raw);
  return {
    capability: normalizeCapability(parsed?.capability),
    reason: String(parsed?.reason || ''),
    target: parsed?.target ? String(parsed.target).slice(0, 120) : '',
    raw
  };
}
