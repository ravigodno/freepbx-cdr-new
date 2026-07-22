import { Express, Request, Response } from 'express';
import { spawnSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { runAiAgentCore, sanitizeAiProviderError } from './aiAgentCore.js';
import { executeReadOnlyCommand, findAllowedDiagnosticCommand, getAllowedDiagnosticCommandSuggestions } from './aiAgentCapabilities.js';

function maskAiApiKey(key?: string): string {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length <= 8) return '********';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

function getDefaultAiModels(provider: string): string[] {
  if (provider === 'openai') {
    return [
      'gpt-5.5',
      'gpt-5.5-mini',
      'gpt-5.5-nano',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4o',
      'gpt-4o-mini'
    ];
  }

  if (provider === 'gemini') {
    return [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];
  }

  if (provider === 'anthropic' || provider === 'claude') {
    return [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  if (provider === 'deepseek') {
    return [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-coder'
    ];
  }

  return [
    'gpt-4o-mini',
    'gpt-4o',
    'llama-3.1-70b',
    'qwen2.5-coder-32b',
    'custom-model'
  ];
}

async function fetchJsonWithTimeout(url: string, options: any = {}, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${response.status} ${text.slice(0, 500)}`);
    }

    try {
      return JSON.parse(text);
    } catch (e: any) {
      throw new Error('Провайдер вернул не JSON: ' + text.slice(0, 300));
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`Таймаут запроса моделей ${Math.round(timeoutMs / 1000)} сек`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeModelsEndpoint(rawUrl?: string, fallback?: string): string {
  const source = String(rawUrl || fallback || '').trim();
  if (!source) return '';
  let normalized = source.replace(/\/+$/, '');
  normalized = normalized.replace(/\/chat\/completions$/i, '');
  normalized = normalized.replace(/\/responses$/i, '');
  if (/\/models$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return normalized + '/models';
  return normalized + '/v1/models';
}

async function discoverAiModels(params: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ models: string[]; source: string; error?: string }> {
  const provider = String(params.provider || 'gemini').trim();
  const fallbackModels = getDefaultAiModels(provider);

  try {
    if (provider === 'openai') {
      const key = String(params.apiKey || process.env.OPENAI_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ OpenAI не указан' };

      const endpoint = normalizeModelsEndpoint(params.baseUrl, 'https://api.openai.com/v1');
      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: { Authorization: `Bearer ${key}` }
      });
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'custom' || provider === 'openai_compatible') {
      const key = String(params.apiKey || '').trim();
      const endpoint = normalizeModelsEndpoint(params.baseUrl);
      if (!endpoint) return { models: fallbackModels, source: 'default', error: 'Base URL не указан' };
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ не указан' };

      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: { Authorization: `Bearer ${key}` }
      });
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || item.name || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'gemini') {
      const key = String(params.apiKey || process.env.GEMINI_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ Gemini не указан' };

      const data: any = await fetchJsonWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      const models = Array.isArray(data?.models)
        ? data.models.map((item: any) => String(item.name || '').replace(/^models\//, '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'deepseek') {
      const key = String(params.apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ DeepSeek не указан' };

      const endpoint = normalizeModelsEndpoint(params.baseUrl, 'https://api.deepseek.com');
      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: { Authorization: `Bearer ${key}` }
      });
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'anthropic' || provider === 'claude') {
      const key = String(params.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ Anthropic не указан' };

      const endpoint = String(params.baseUrl || 'https://api.anthropic.com/v1/models').trim();
      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        }
      });
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    return { models: fallbackModels, source: 'default' };
  } catch (error: any) {
    return { models: fallbackModels, source: 'default', error: error.message };
  }
}

function normalizeAiBaseUrl(rawUrl?: string, fallback?: string): string {
  const source = String(rawUrl || fallback || '').trim();
  if (!source) return '';
  const normalized = source.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return normalized + '/chat/completions';
  return normalized + '/v1/chat/completions';
}

// Helper to clean markdown block tags from JSON response
function cleanJsonResponseText(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '');
    cleaned = cleaned.replace(/\n```$/, '');
  }
  return cleaned.trim();
}

// Unified multi-provider AI text completion engine



// AIPBX_MESSAGE_NORMALIZER_RESTORED_V1
function normalizeAipbxMessageFinal(m: any): any | null {
  if (!m || typeof m !== 'object') return null;

  const role = typeof m.role === 'string' ? m.role : '';
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;

  const text = String(m.text || m.content || '');
  if (!text.trim()) return null;

  const rawDate = m.createdAt || m.timestamp || m.created_at;
  const createdAt = rawDate && !Number.isNaN(Date.parse(rawDate))
    ? new Date(rawDate).toISOString()
    : new Date().toISOString();

  return {
    id: String(m.id || ('msg_' + Date.now() + '_' + Math.random().toString(16).slice(2))),
    role,
    text,
    content: text,
    createdAt,
    timestamp: createdAt,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    capabilityPlan: m.capabilityPlan || m.toolPlan,
    capabilityResults: Array.isArray(m.capabilityResults) ? m.capabilityResults : [],
    toolResults: Array.isArray(m.toolResults) ? m.toolResults : (Array.isArray(m.capabilityResults) ? m.capabilityResults : [])
  };
}

function normalizeAipbxMessagesFinal(messages: any): any[] {
  return Array.isArray(messages)
    ? messages.map(normalizeAipbxMessageFinal).filter(Boolean)
    : [];
}

// OPENAI_CURL_HELPER_SAFE_V1
async function callOpenAIChatViaCurlSafe(endpoint: string, key: string, payload: any, signal?: AbortSignal): Promise<any> {
  const { execFile } = require('child_process');

  const body = JSON.stringify(payload);

  const runOnce = (attempt: number) => new Promise<any>((resolve, reject) => {
    const child = execFile('curl', [
      '-4',
      '-sS',
      '--connect-timeout', '20',
      '--max-time', '75',
      '--retry', '2',
      '--retry-delay', '1',
      endpoint,
      '-H', 'Authorization: Bearer ' + key,
      '-H', 'Content-Type: application/json',
      '-H', 'OpenAI-Beta: assistants=v2',
      '-d', body
    ], {
      timeout: 90000,
      maxBuffer: 1024 * 1024 * 4
    }, (error: any, stdout: string, stderr: string) => {
      signal?.removeEventListener('abort', onAbort);
      if (error) {
        reject(new Error('OpenAI curl request failed on attempt ' + attempt + ': ' + sanitizeAiProviderError(stderr || 'network error')));
        return;
      }

      try {
        const data = JSON.parse(String(stdout || '{}'));

        if (data.error) {
          const code = String(data.error.code || '');
          const msg = sanitizeAiProviderError(JSON.stringify(data.error));

          if (code === 'unsupported_country_region_territory') {
            reject(new Error('RETRYABLE_OPENAI_REGION_ERROR: ' + msg));
            return;
          }

          reject(new Error('OpenAI API error via curl: ' + msg));
          return;
        }

        resolve(data);
      } catch (e: any) {
        reject(new Error('OpenAI curl returned non-JSON response'));
      }
    });
    const onAbort = () => { child.kill('SIGTERM'); reject(Object.assign(new Error('AI request aborted'), { name: 'AbortError' })); };
    if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
  });

  let lastError: any = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await runOnce(attempt);
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e);

      if (!msg.includes('RETRYABLE_OPENAI_REGION_ERROR')) {
        throw e;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error('OpenAI API error via curl after retries: ' + sanitizeAiProviderError(lastError?.message || lastError || 'OpenAI curl failed'));
}

export async function generateAIResponse(params: {
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant', text: string }>;
  responseType?: 'json' | 'text';
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { provider, model, temperature, systemPrompt, messages, responseType = 'text', apiKey, baseUrl, signal } = params;

  // 1. Google Gemini
  if (provider === 'gemini') {
    const key = String(apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ Gemini в настройках AI-администратора.');
    }
    const ai = new GoogleGenAI({ apiKey: key });
    
    // Compile history
    const promptHistory = messages.map(m => {
      return `${m.role === 'user' ? 'Пользователь' : 'AI-Консультант'}: ${m.text}`;
    }).join('\n\n');

    const config: any = {
      systemInstruction: systemPrompt,
      temperature: Number(temperature)
    };

    if (responseType === 'json') {
      config.responseMimeType = 'application/json';
    }

    const res = await ai.models.generateContent({
      model: model || 'gemini-3.5-flash',
      contents: promptHistory,
      config
    });

    return res.text || '';
  }

  // 2. OpenAI ChatGPT
  if (provider === 'openai') {
    const key = String(apiKey || process.env.OPENAI_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ OpenAI в настройках AI-администратора.');
    }

    const endpoint = normalizeAiBaseUrl(baseUrl, 'https://api.openai.com/v1');

    const payload = {
      model: model || 'gpt-4o-mini',
      temperature: Number(temperature),
      messages: [
        { role: 'system', content: systemPrompt || '' },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.text || '')
        })).filter(m => m.content.trim())
      ]
    };

    if (responseType === 'json') {
      (payload as any).response_format = { type: 'json_object' };
    }

    const data: any = await callOpenAIChatViaCurlSafe(endpoint, key, payload, signal);

    return String(data?.choices?.[0]?.message?.content || '').trim();
  }

  // 3. Anthropic Claude
  if (provider === 'anthropic' || provider === 'claude') {
    const key = String(apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ Anthropic в настройках AI-администратора.');
    }
    const endpoint = String(baseUrl || 'https://api.anthropic.com/v1/messages').trim();

    const payload = {
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      temperature: Number(temperature),
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload), signal: signal as any
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return data?.content?.[0]?.text || '';
  }

  // 4. DeepSeek
  if (provider === 'deepseek') {
    const key = String(apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ DeepSeek в настройках AI-администратора.');
    }
    const endpoint = normalizeAiBaseUrl(baseUrl, 'https://api.deepseek.com');

    const payload = {
      model: model || 'deepseek-chat',
      temperature: Number(temperature),
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      ...(responseType === 'json' ? { response_format: { type: 'json_object' } } : {})
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(payload), signal: signal as any
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  // 5. Any OpenAI-compatible provider
  if (provider === 'custom' || provider === 'openai_compatible') {
    const key = String(apiKey || '').trim();
    const endpoint = normalizeAiBaseUrl(baseUrl);
    if (!endpoint) {
      throw new Error('Укажите Base URL для OpenAI-compatible провайдера.');
    }
    if (!key) {
      throw new Error('Укажите API-ключ для OpenAI-compatible провайдера.');
    }

    const payload = {
      model: model || 'gpt-4o-mini',
      temperature: Number(temperature),
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      ...(responseType === 'json' ? { response_format: { type: 'json_object' } } : {})
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(payload), signal: signal as any
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI-compatible API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Неизвестный провайдер: ${provider}`);
}

// Helper to sanitize secrets in terminal output and logs
function maskSecretsInText(text: string): string {
  if (!text) return '';
  let masked = text;
  // Mask generic assignments
  masked = masked.replace(/(secret\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(password\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(passwd\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(secret_key\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(token\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(auth_key\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(secret\s+)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(password\s+)([^\s\r\n;]+)/gi, '$1********');
  return masked;
}

export function registerAiPbxAdminRoutes(
  app: Express,
  requireAuth: any,
  checkPermission: (req: Request, permission: string) => Promise<boolean>,
  readLocalDb: () => Promise<any>,
  writeLocalDb: (data: any) => Promise<void>
) {
  const aiPbxAuth = [requireAuth(), async (req: Request, res: Response, next: any) => {
    if (!(await checkPermission(req, 'view_ai_pbx_admin'))) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  }];

  // 1. Get Sessions
  app.get('/api/ai-pbx-admin/sessions', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      if (!Array.isArray(db.ai_pbx_sessions)) {
        db.ai_pbx_sessions = [];
      }
      res.json(db.ai_pbx_sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Get Session by ID
  app.get('/api/ai-pbx-admin/sessions/:id', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const session = (db.ai_pbx_sessions || []).find((s: any) => s.id === req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Create Session
  app.post('/api/ai-pbx-admin/sessions', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { title, category } = req.body;
      const db = await readLocalDb();
      if (!Array.isArray(db.ai_pbx_sessions)) {
        db.ai_pbx_sessions = [];
      }

      const newSession = {
        id: 'session_' + crypto.randomBytes(6).toString('hex'),
        title: title || 'Новое обращение',
        category: category || 'other',
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        attachments: []
      };

      db.ai_pbx_sessions.push(newSession);
      await writeLocalDb(db);
      res.status(201).json(newSession);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Update Session status or details
  app.put('/api/ai-pbx-admin/sessions/:id', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { title, category, status } = req.body;
      const db = await readLocalDb();
      const session = (db.ai_pbx_sessions || []).find((s: any) => s.id === req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (title !== undefined) session.title = title;
      if (category !== undefined) session.category = category;
      if (status !== undefined) session.status = status;
      session.updatedAt = new Date().toISOString();

      await writeLocalDb(db);
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Delete Session
  app.delete('/api/ai-pbx-admin/sessions/:id', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      if (!Array.isArray(db.ai_pbx_sessions)) {
        db.ai_pbx_sessions = [];
      }

      const originalLength = db.ai_pbx_sessions.length;
      db.ai_pbx_sessions = db.ai_pbx_sessions.filter((s: any) => s.id !== req.params.id);
      
      if (db.ai_pbx_sessions.length === originalLength) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await writeLocalDb(db);
      res.json({ success: true, message: 'Session archived/deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 6. Post message and get AI reply (multi-provider support)
  app.post('/api/ai-pbx-admin/sessions/:id/messages', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const text = String(req.body?.text || '').trim();
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

      if (!text) {
        return res.status(400).json({ success: false, error: 'Message text is required' });
      }

      const db = await readLocalDb();
      db.ai_pbx_sessions = Array.isArray(db.ai_pbx_sessions) ? db.ai_pbx_sessions : [];

      const session = db.ai_pbx_sessions.find((s: any) => s && s.id === req.params.id);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      const settings = db.ai_pbx_settings || {};
      const nowIso = new Date().toISOString();

      const userMsg = {
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        role: 'user',
        text,
        content: text,
        attachments,
        createdAt: nowIso,
        timestamp: nowIso
      };

      session.messages = normalizeAipbxMessagesFinal(session.messages);

      session.messages.push(userMsg);

      const agentResult = await runAiAgentCore({
        userText: text,
        settings,
        sessionMessages: session.messages,
        knowledge: Array.isArray(db.ai_pbx_knowledge) ? db.ai_pbx_knowledge : [],
        complete: generateAIResponse,
        log: (message, meta = {}) => {
          console.log("[AIPBXAdmin][AgentCore]", message, meta);
        }
      });

      const finalText = agentResult.text;

      const assistantIso = new Date().toISOString();

      const assistantMsg = {
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        role: 'assistant',
        text: finalText,
        content: finalText,
        attachments: [],
        createdAt: assistantIso,
        timestamp: assistantIso,
        capabilityPlan: agentResult.plan,
        capabilityResults: agentResult.capabilityResults.map((r: any) => ({
          title: r.title,
          command: r.command,
          ok: r.ok,
          error: r.error || null
        })),
        toolResults: agentResult.capabilityResults.map((r: any) => ({
          title: r.title,
          command: r.command,
          ok: r.ok,
          error: r.error || null
        }))
      };

      session.messages.push(assistantMsg);
      session.updatedAt = assistantIso;

      if (typeof normalizeAipbxMessagesFinal === 'function') {
        session.messages = normalizeAipbxMessagesFinal(session.messages);
      }

      await writeLocalDb(db);
      console.log('[AIPBXAdmin][AgentCore]', 'final response saved', { sessionId: session.id, messageId: assistantMsg.id });

      return res.json({
        success: true,
        message: assistantMsg,
        session
      });
    } catch (error: any) {
      const safeError = sanitizeAiProviderError(error?.message || String(error));
      console.error('[AIPBXAdmin] Agent Core message route failed:', safeError);
      return res.status(500).json({
        success: false,
        error: 'AI provider недоступен или вернул ошибку. Проверьте Base URL, ключ и сетевой доступ.'
      });
    }
  });


  // 7. Add raw file/log attachment to session
  app.post('/api/ai-pbx-admin/sessions/:id/attachments', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { name, type, content } = req.body;
      if (!name || !content) {
        return res.status(400).json({ error: 'Attachment name and content are required' });
      }

      const db = await readLocalDb();
      const session = (db.ai_pbx_sessions || []).find((s: any) => s.id === req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!Array.isArray(session.attachments)) {
        session.attachments = [];
      }

      const newAttachment = {
        id: 'attach_' + crypto.randomBytes(6).toString('hex'),
        name,
        type: type || 'text/plain',
        content: maskSecretsInText(content), // Sanitize immediately on upload!
        createdAt: new Date().toISOString()
      };

      session.attachments.push(newAttachment);
      session.updatedAt = new Date().toISOString();
      await writeLocalDb(db);

      res.status(201).json(newAttachment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 8. Suggest terminal diagnostic commands
  app.post("/api/ai-pbx-admin/diagnostics/suggest", ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const category = String(req.body?.category || "").toLowerCase();
      const problem = String(req.body?.customProblem || "").toLowerCase();
      const allCommands = getAllowedDiagnosticCommandSuggestions();

      const matches = (command: string, description: string) => {
        const text = (command + " " + description).toLowerCase();
        if (category.includes("trunk") || problem.includes("транк") || problem.includes("trunk")) return /sip|pjsip|rtp/.test(text);
        if (category.includes("extension") || problem.includes("номер") || problem.includes("extension")) return /endpoint|contact|peer|channel/.test(text);
        if (category.includes("quality") || problem.includes("слыш") || problem.includes("rtp") || problem.includes("audio")) return /rtp|codec|translation|endpoint/.test(text);
        if (category.includes("call") || category.includes("queue") || problem.includes("очеред") || problem.includes("queue")) return /channel|queue/.test(text);
        if (category.includes("routing") || problem.includes("звон") || problem.includes("call")) return /channel|queue|route|address/.test(text);
        if (category.includes("security") || problem.includes("ami")) return /ami|manager|address/.test(text);
        return false;
      };

      const selected = allCommands.filter(item => matches(item.command, item.description));
      const commands = (selected.length ? selected : allCommands).slice(0, 6);

      res.json({ commands });
    } catch (error: any) {
      res.status(500).json({ error: "Не удалось подобрать безопасные диагностические команды" });
    }
  });

  // 9. Execute secure diagnostic commands on the server!
  app.post('/api/ai-pbx-admin/diagnostics/collect-safe', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { command } = req.body;
      if (!command) {
        return res.status(400).json({ error: 'Command is required' });
      }

      const allowedCommand = findAllowedDiagnosticCommand(String(command));
      if (!allowedCommand) {
        return res.status(403).json({
          error: 'Доступ заблокирован: команда не входит в точный whitelist read-only диагностики'
        });
      }

      const result = await executeReadOnlyCommand(allowedCommand);
      const output = [result.stdout, result.stderr, result.error ? 'ERROR: ' + result.error : '']
        .filter(Boolean)
        .join('\n');

      res.json({
        output: output || 'Команда выполнена успешно, вывод пуст.',
        ok: result.ok
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 10. AI analysis of logs / diagnostics
  app.post('/api/ai-pbx-admin/diagnostics/analyze', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { sourceTitle, content } = req.body;
      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const db = await readLocalDb();
      const settings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        temperature: 0.4
      };

      const prompt = `Проанализируй следующий диагностический вывод или лог-файл "${sourceTitle || 'Логи АТС'}". 
Объясни понятным языком, в чем может быть причина проблемы, укажи на критические ошибки в логах, если они есть, и предложи пошаговые инструкции по их исправлению.
Лог/Контент:
\`\`\`
${maskSecretsInText(content)}
\`\`\`

Ответ дай на русском языке в красивом markdown-формате.`;

      const analysis = await generateAIResponse({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.2,
        systemPrompt: 'You are an expert Asterisk, FreePBX, and Linux system logging analyzer.',
        messages: [{ role: 'user', text: prompt }],
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl
      });

      res.json({ analysis });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 11. Get Knowledge Base Articles
  app.get('/api/ai-pbx-admin/knowledge', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      if (!Array.isArray(db.ai_pbx_knowledge)) {
        db.ai_pbx_knowledge = [
          {
            id: 'kb_1',
            title: 'Устранение неполадок с регистрацией PJSIP транка',
            category: 'trunk',
            content: '### Симптомы:\nТранк переходит в статус Unregistered или Rejected.\n\n### Решение:\n1. Проверьте адрес SIP-сервера в настройках транка.\n2. Убедитесь, что порт 5060/5061 не блокируется файрволом.\n3. Запустите `asterisk -rx "pjsip show registrations"` для диагностики.\n4. Проверьте правильность auth_username и пароля.',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: 'kb_2',
            title: 'Предотвращение SIP-сканирования и атак подбора паролей',
            category: 'security',
            content: '### Защита АТС:\n1. Никогда не используйте стандартный порт 5060 для открытых SIP-подключений.\n2. Включите и настройте сервис Fail2ban.\n3. Установите сложные пароли на экстеншены (минимум 12 символов, буквы и цифры).\n4. Ограничьте IP-адреса в настройках PJSIP (параметр Permit/Deny).',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
        db.ai_pbx_knowledge = db.ai_pbx_knowledge;
        await writeLocalDb(db);
      }
      res.json(db.ai_pbx_knowledge);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 12. Create Knowledge Base Article
  app.post('/api/ai-pbx-admin/knowledge', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { title, category, content } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      const db = await readLocalDb();
      if (!Array.isArray(db.ai_pbx_knowledge)) {
        db.ai_pbx_knowledge = [];
      }

      const newArticle = {
        id: 'kb_' + crypto.randomBytes(6).toString('hex'),
        title,
        category: category || 'other',
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.ai_pbx_knowledge.push(newArticle);
      await writeLocalDb(db);
      res.status(201).json(newArticle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 13. Update Knowledge Base Article
  app.put('/api/ai-pbx-admin/knowledge/:id', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const { title, category, content } = req.body;
      const db = await readLocalDb();
      const article = (db.ai_pbx_knowledge || []).find((a: any) => a.id === req.params.id);
      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      if (title !== undefined) article.title = title;
      if (category !== undefined) article.category = category;
      if (content !== undefined) article.content = content;
      article.updatedAt = new Date().toISOString();

      await writeLocalDb(db);
      res.json(article);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 14. Delete Knowledge Base Article
  app.delete('/api/ai-pbx-admin/knowledge/:id', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      if (!Array.isArray(db.ai_pbx_knowledge)) {
        db.ai_pbx_knowledge = [];
      }

      const originalLength = db.ai_pbx_knowledge.length;
      db.ai_pbx_knowledge = db.ai_pbx_knowledge.filter((a: any) => a.id !== req.params.id);

      if (db.ai_pbx_knowledge.length === originalLength) {
        return res.status(404).json({ error: 'Article not found' });
      }

      await writeLocalDb(db);
      res.json({ success: true, message: 'Article deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 15. Create Article from support session dialog!
  app.post('/api/ai-pbx-admin/knowledge/from-session/:sessionId', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const session = (db.ai_pbx_sessions || []).find((s: any) => s.id === req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const settings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        temperature: 0.4
      };

      const history = session.messages.map((m: any) => `${m.role === 'user' ? 'Пользователь' : 'AI-Консультант'}: ${m.text}`).join('\n\n');

      const prompt = `На основе следующего диалога технической поддержки АТС Asterisk составь структурированную статью для корпоративной базы знаний на русском языке.
Статья должна содержать:
1. Краткое описание проблемы и симптомов.
2. Пошаговое руководство по исправлению (решение).
3. Дополнительные рекомендации для избежания повторения этой проблемы.

Диалог поддержки:
${history}

Верни только готовую статью в markdown-формате.`;

      const responseText = await generateAIResponse({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.3,
        systemPrompt: 'You are an expert at creating beautiful technical knowledge base documentation in markdown format.',
        messages: [{ role: 'user', text: prompt }]
      });

      if (!Array.isArray(db.ai_pbx_knowledge)) {
        db.ai_pbx_knowledge = [];
      }

      const newArticle = {
        id: 'kb_' + crypto.randomBytes(6).toString('hex'),
        title: `Решение проблемы: ${session.title}`,
        category: session.category || 'other',
        content: responseText || 'Не удалось сгенерировать контент.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.ai_pbx_knowledge.push(newArticle);
      await writeLocalDb(db);

      res.status(201).json(newArticle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 16. Get AIPBXAdmin Settings
  app.get('/api/ai-pbx-admin/settings', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const settings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.4,
        systemPrompt: 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.',
        baseUrl: '',
        modelCatalog: []
      };

      res.json({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-2.5-flash',
        temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.4,
        systemPrompt: settings.systemPrompt || '',
        baseUrl: settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(settings.apiKey),
        modelCatalog: settings.modelCatalog || []
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] GET settings failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 17. Put AIPBXAdmin Settings
  app.put('/api/ai-pbx-admin/settings', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      console.log('[AIPBXAdmin] PUT settings request received');

      const { provider, model, temperature, systemPrompt, apiKey, baseUrl } = req.body || {};
      const db = await readLocalDb();
      const previous = db.ai_pbx_settings || {};

      const nextSettings = {
        provider: provider || previous.provider || 'gemini',
        model: model || previous.model || 'gemini-2.5-flash',
        temperature: temperature !== undefined ? Number(temperature) : (previous.temperature !== undefined ? Number(previous.temperature) : 0.4),
        systemPrompt: systemPrompt || previous.systemPrompt || 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.',
        apiKey: String(apiKey || '').trim() ? String(apiKey).trim() : previous.apiKey,
        baseUrl: String(baseUrl || '').trim(),
        modelCatalog: previous.modelCatalog || []
      };

      db.ai_pbx_settings = nextSettings;

      await writeLocalDb(db);

      console.log('[AIPBXAdmin] settings saved:', {
        provider: nextSettings.provider,
        model: nextSettings.model,
        hasApiKey: Boolean(nextSettings.apiKey),
        baseUrl: nextSettings.baseUrl || ''
      });

      res.json({
        success: true,
        provider: nextSettings.provider,
        model: nextSettings.model,
        temperature: nextSettings.temperature,
        systemPrompt: nextSettings.systemPrompt,
        baseUrl: nextSettings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(nextSettings.apiKey),
        modelCatalog: nextSettings.modelCatalog || []
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] PUT settings failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 18. Refresh provider model list
  app.post('/api/ai-pbx-admin/settings/models', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const savedSettings = db.ai_pbx_settings || {};
      const provider = String(req.body?.provider || savedSettings.provider || 'gemini');
      const apiKey = String(req.body?.apiKey || '').trim() || savedSettings.apiKey || '';
      const baseUrl = String(req.body?.baseUrl || savedSettings.baseUrl || '').trim();

      const result = await discoverAiModels({ provider, apiKey, baseUrl });

      db.ai_pbx_settings = {
        ...savedSettings,
        provider,
        apiKey,
        baseUrl,
        modelCatalog: result.models
      };

      await writeLocalDb(db);

      res.json({
        success: true,
        provider,
        models: result.models,
        source: result.source,
        error: result.error || ''
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 19. Test Connection
  app.post('/api/ai-pbx-admin/settings/test-provider', ...aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const savedSettings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        temperature: 0.4
      };

      const settings = {
        ...savedSettings,
        ...req.body,
        apiKey: String(req.body?.apiKey || '').trim() ? String(req.body.apiKey).trim() : savedSettings.apiKey
      };

      const testResult = await generateAIResponse({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.1,
        systemPrompt: 'Say exactly: Connection OK',
        messages: [{ role: 'user', text: 'Respond with exactly "Connection OK"' }],
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl
      });

      res.json({ success: true, message: `Соединение с провайдером AI (${settings.provider}) успешно установлено!`, raw: testResult });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
