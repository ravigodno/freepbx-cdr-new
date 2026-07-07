import { executeCapability, formatCapabilityResultsForAi, type AiCapabilityResult } from './aiAgentCapabilities.js';
import type { AiAgentCapabilityId } from './aiAgentCapabilities.js';
import { buildAnswerOnlyPrompt, buildFinalAnalysisPrompt } from './aiAgentPrompts.js';
import { planAiAgentCapability, type AiAgentPlan, type AiTextComplete } from './aiAgentPlanner.js';

export interface AiAgentRunResult {
  text: string;
  plan: AiAgentPlan;
  capabilityResults: AiCapabilityResult[];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: таймаут ${Math.round(timeoutMs / 1000)} сек`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function formatKnowledge(articles: any[]): string {
  return Array.isArray(articles)
    ? articles.slice(0, 8).map((article: any) => [
        'Тема: ' + String(article.title || ''),
        'Категория: ' + String(article.category || ''),
        String(article.content || '').slice(0, 4000)
      ].join('\n')).join('\n\n')
    : '';
}

function formatHistory(messages: any[]): string {
  return Array.isArray(messages)
    ? messages.slice(-12).map((message: any) => {
        const role = message?.role === 'assistant' ? 'AI' : 'Пользователь';
        return `${role}: ${String(message?.text || message?.content || '').slice(0, 3000)}`;
      }).join('\n\n')
    : '';
}

export function sanitizeAiProviderError(error: any): string {
  let message = String(error?.message || error || "AI provider error");
  message = message.replace(new RegExp("Authorization:" + "\\s*Bearer\\s+" + "[^\\s\x27\x22;,)]+", "gi"), "Authorization: Bearer ********");
  message = message.replace(new RegExp("sk-[A-Za-z0-9_-]{8,}", "g"), "sk-********");
  message = message.replace(new RegExp("OPENAI_API_KEY" + "\\s*[:=]\\s*" + "[^\\s\x27\x22;,)]+", "gi"), "OPENAI_API_KEY=********");
  message = message.replace(new RegExp("apiKey" + "\\s*[:=]\\s*" + "[^\\s\x27\x22;,)]+", "gi"), "apiKey=********");
  message = message.replace(new RegExp("api[_-]?key" + "\\s*[:=]\\s*" + "[^\\s\x27\x22;,)]+", "gi"), "apiKey=********");
  message = message.replace(new RegExp("\\b[A-Za-z0-9_-]{48,}\\b", "g"), "********");
  message = message.replace(new RegExp("\\b[A-Za-z0-9+/]{64,}={0,2}\\b", "g"), "********");
  return message.slice(0, 500);
}

function providerUnavailableText(_error: any): string {
  return 'AI provider недоступен или вернул ошибку. Проверьте Base URL, ключ и сетевой доступ.';
}

export async function runAiAgentCore(params: {
  userText: string;
  settings: any;
  sessionMessages: any[];
  knowledge: any[];
  complete: AiTextComplete;
  log?: (message: string, meta?: Record<string, any>) => void;
}): Promise<AiAgentRunResult> {
  const settings = params.settings || {};
  const log = params.log || (() => {});

  let plan: AiAgentPlan = {
    capability: 'answer_only',
    reason: 'Planner не запускался.',
    target: ''
  };

  try {
    log('planner started');
    plan = await withTimeout(planAiAgentCapability({
      userText: params.userText,
      settings,
      complete: params.complete
    }), 30000, 'planner');
    log('selected capability', { capability: plan.capability });
  } catch (error: any) {
    log('planner failed', { error: sanitizeAiProviderError(error) });
    return {
      text: providerUnavailableText(error),
      plan: {
        capability: 'answer_only',
        reason: 'AI provider недоступен на этапе planner.',
        target: ''
      },
      capabilityResults: []
    };
  }

  let capabilityResults: AiCapabilityResult[] = [];

  if (plan.capability !== 'answer_only') {
    log('capability execution started', { capability: plan.capability });
    capabilityResults = await executeCapability(plan.capability as AiAgentCapabilityId);
    log('capability execution finished', {
      capability: plan.capability,
      commands: capabilityResults.length,
      ok: capabilityResults.filter(item => item.ok).length
    });
  }

  try {
    log('final analysis started', { capability: plan.capability });
    const prompt = plan.capability === 'answer_only'
      ? buildAnswerOnlyPrompt(params.userText, formatHistory(params.sessionMessages))
      : buildFinalAnalysisPrompt({
          userText: params.userText,
          capability: plan.capability,
          reason: plan.reason,
          diagnosticsText: formatCapabilityResultsForAi(capabilityResults),
          knowledgeText: formatKnowledge(params.knowledge)
        });

    const text = await withTimeout(params.complete({
      provider: settings.provider || 'gemini',
      model: settings.model || 'gemini-2.5-flash',
      temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.2,
      systemPrompt: settings.systemPrompt || 'Ты — AI Администратор АТС PBXPuls, инженер FreePBX/Asterisk. Отвечай на русском.',
      messages: [{ role: 'user', text: prompt }],
      apiKey: settings.apiKey || '',
      baseUrl: settings.baseUrl || ''
    }), 45000, 'final analysis');

    return {
      text: text || 'AI provider вернул пустой ответ.',
      plan,
      capabilityResults
    };
  } catch (error: any) {
    return {
      text: providerUnavailableText(error),
      plan,
      capabilityResults
    };
  }
}
