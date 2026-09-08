import crypto from "crypto";
import fetch from "node-fetch";
import { AiPlatformError } from "../core/errors.js";
import type { AiAuditService } from "../audit/aiAuditService.js";
import type { AiPlatformStore } from "../storage/aiPlatformStore.js";
import type { ProviderConfig } from "./providerAdapter.js";
import { getAIProviderRegistry } from "./providerRegistry.js";

const PURPOSE = "platform_default";
const PROVIDERS = new Set([
  "openai",
  "openai_compatible",
  "gemini",
  "anthropic",
  "deepseek",
  "yandex",
]);
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Math.max(
    min,
    Math.min(max, Number.isFinite(parsed) ? parsed : fallback),
  );
};

function encryptionKey(): Buffer {
  const dedicated = String(
    process.env.PBXPULS_AI_PROVIDER_ENCRYPTION_KEY || "",
  ).trim();
  const installationSecret = String(process.env.JWT_SECRET || "").trim();
  if (
    !dedicated &&
    (!installationSecret ||
      installationSecret === "asterisk-cdr-secret-key-132")
  ) {
    throw new AiPlatformError(
      "encryption_not_configured",
      503,
      "Шифрование ключей AI-провайдера не настроено",
    );
  }
  if (dedicated) {
    const key = /^[a-f0-9]{64}$/i.test(dedicated)
      ? Buffer.from(dedicated, "hex")
      : Buffer.from(dedicated, "base64");
    if (key.length !== 32)
      throw new AiPlatformError(
        "encryption_not_configured",
        503,
        "Некорректный ключ шифрования AI-провайдера",
      );
    return key;
  }
  return crypto
    .createHash("sha256")
    .update(`pbxpuls-ai-provider-v1:${installationSecret}`)
    .digest();
}

function encryptSecret(value: string): { encrypted: string; version: string } {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted: `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${body.toString("base64")}`,
    version: "v1",
  };
}

function decryptSecret(value: string): string {
  const [version, iv, tag, body] = String(value || "").split(":");
  if (version !== "v1" || !iv || !tag || !body)
    throw new AiPlatformError(
      "encryption_not_configured",
      503,
      "Ключ AI-провайдера невозможно расшифровать",
    );
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function providerKey(value: unknown): string {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!PROVIDERS.has(key))
    throw new AiPlatformError(
      "provider_unknown",
      404,
      "Неизвестный AI-провайдер",
    );
  return key;
}

function model(value: unknown): string {
  const next = String(value || "").trim();
  if (!next || next.length > 191 || !/^[A-Za-z0-9._:/-]+$/.test(next))
    throw new AiPlatformError(
      "invalid_request",
      400,
      "Некорректная модель AI-провайдера",
    );
  return next;
}

function baseUrl(value: unknown): string | null {
  const next = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!next) return null;
  let parsed: URL;
  try {
    parsed = new URL(next);
  } catch {
    throw new AiPlatformError("invalid_request", 400, "Некорректный Base URL");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new AiPlatformError(
      "invalid_request",
      400,
      "Base URL должен быть HTTP(S) без учётных данных",
    );
  return parsed.toString().replace(/\/$/, "");
}

export class ProviderConfigService {
  constructor(
    private store: AiPlatformStore,
    private audit: AiAuditService,
  ) {}

  async list(tenantId: number) {
    const rows = await this.store.query(
      `SELECT id,provider_key,purpose,model,base_url,status,options_json,created_at,updated_at,
      CASE WHEN encrypted_secret IS NOT NULL AND encrypted_secret<>'' THEN 1 ELSE 0 END secret_configured
      FROM ai_provider_configs WHERE tenant_id=? AND purpose=? ORDER BY provider_key`,
      [tenantId, PURPOSE],
    );
    return rows.map((row: any) => {
      let options: any = {};
      try {
        options = JSON.parse(String(row.options_json || "{}"));
      } catch {}
      return {
        id: Number(row.id),
        providerKey: String(row.provider_key),
        purpose: String(row.purpose),
        model: String(row.model),
        baseUrl: String(row.base_url || ""),
        status: String(row.status),
        secretConfigured: Boolean(row.secret_configured),
        ...(row.provider_key === "yandex"
          ? {
              folderId: String(options.folderId || ""),
              fileSearchEnabled: options.fileSearchEnabled === true,
              vectorStoreId: String(options.vectorStoreId || ""),
              fileSearchMaxResults: clamp(options.fileSearchMaxResults, 5, 1, 20),
            }
          : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async save(tenantId: number, input: any, actor: any) {
    const key = providerKey(input?.providerKey),
      selectedModel = model(input?.model),
      url = baseUrl(input?.baseUrl);
    const existing = (
      await this.store.query(
        "SELECT id,encrypted_secret,key_version,options_json FROM ai_provider_configs WHERE tenant_id=? AND provider_key=? AND purpose=? LIMIT 1",
        [tenantId, key, PURPOSE],
      )
    )[0];
    const incomingSecret = String(input?.apiKey || "").trim();
    const secret = incomingSecret ? encryptSecret(incomingSecret) : null;
    const encrypted =
      input?.clearSecret === true
        ? null
        : secret?.encrypted || existing?.encrypted_secret || null;
    const keyVersion =
      input?.clearSecret === true
        ? null
        : secret?.version || existing?.key_version || null;
    const enabled = input?.enabled !== false;
    if (enabled && !encrypted)
      throw new AiPlatformError(
        "invalid_request",
        400,
        "Укажите API-ключ провайдера",
      );
    let previousOptions: any = {};
    try {
      previousOptions = JSON.parse(String(existing?.options_json || "{}"));
    } catch {}
    const options = {
      temperature: clamp(input?.temperature, 0.2, 0, 1),
      ...(key === "yandex"
        ? {
            folderId: String(input?.folderId || "")
              .trim()
              .slice(0, 191),
            fileSearchEnabled: input?.fileSearchEnabled === true,
            vectorStoreId: String(input?.vectorStoreId || "")
              .trim()
              .slice(0, 191),
            fileSearchMaxResults: clamp(input?.fileSearchMaxResults, 5, 1, 20),
            voice: String(previousOptions.voice || "marina"),
            role: String(previousOptions.role || "neutral"),
            speechRate: clamp(previousOptions.speechRate, 1, 0.1, 3),
            sttLanguage: String(previousOptions.sttLanguage || "ru-RU"),
            eouSensitivity: clamp(previousOptions.eouSensitivity, 0.9, 0, 1),
            endOfUtteranceSilenceMs: clamp(
              previousOptions.endOfUtteranceSilenceMs,
              700,
              100,
              3000,
            ),
          }
        : {}),
    };
    if (key === "yandex" && !options.folderId)
      throw new AiPlatformError(
        "invalid_request",
        400,
        "Укажите Folder ID Yandex Cloud",
      );
    if (key === "yandex" && options.fileSearchEnabled && !options.vectorStoreId)
      throw new AiPlatformError(
        "invalid_request",
        400,
        "Укажите Vector Store ID для базы знаний Yandex",
      );
    await this.store.query(
      `INSERT INTO ai_provider_configs(tenant_id,provider_key,purpose,model,base_url,encrypted_secret,key_version,options_json,status,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE model=VALUES(model),base_url=VALUES(base_url),encrypted_secret=VALUES(encrypted_secret),key_version=VALUES(key_version),options_json=VALUES(options_json),status=VALUES(status),updated_at=NOW()`,
      [
        tenantId,
        key,
        PURPOSE,
        selectedModel,
        url,
        encrypted,
        keyVersion,
        JSON.stringify(options),
        enabled ? "active" : "disabled",
      ],
    );
    await this.audit.append({
      tenantId,
      ...actor,
      eventType: "provider_config_updated",
      entityType: "provider_config",
      entityId: key,
      decision: enabled ? "active" : "disabled",
      details: {
        providerKey: key,
        model: selectedModel,
        baseUrlConfigured: Boolean(url),
        secretChanged: Boolean(incomingSecret),
        secretCleared: input?.clearSecret === true,
      },
    });
    return (await this.list(tenantId)).find((row) => row.providerKey === key);
  }

  async runtime(tenantId: number): Promise<ProviderConfig | null> {
    const row = (
      await this.store.query(
        `SELECT provider_key,model,base_url,encrypted_secret,options_json FROM ai_provider_configs
      WHERE tenant_id=? AND purpose=? AND status='active' ORDER BY updated_at DESC,id DESC LIMIT 1`,
        [tenantId, PURPOSE],
      )
    )[0];
    if (!row?.encrypted_secret) return null;
    let options = {};
    try {
      options = JSON.parse(String(row.options_json || "{}"));
    } catch {}
    return {
      providerKey: providerKey(row.provider_key),
      model: String(row.model),
      baseUrl: row.base_url ? String(row.base_url) : null,
      secret: decryptSecret(String(row.encrypted_secret)),
      options,
    };
  }

  async test(tenantId: number, input: any) {
    const saved = await this.configuredProvider(tenantId, input?.providerKey);
    const key = providerKey(input?.providerKey || saved?.providerKey),
      incomingSecret = String(input?.apiKey || "").trim();
    const config: ProviderConfig = {
      providerKey: key,
      model: model(input?.model || saved?.model),
      baseUrl: baseUrl(input?.baseUrl ?? saved?.baseUrl),
      secret: incomingSecret || saved?.secret || null,
      options: {
        ...(saved?.options || {}),
        temperature: 0,
        ...(key === "yandex"
          ? {
              folderId: String(
                input?.folderId || saved?.options?.folderId || "",
              ).trim(),
              fileSearchEnabled:
                input?.fileSearchEnabled === true ||
                (input?.fileSearchEnabled === undefined &&
                  saved?.options?.fileSearchEnabled === true),
              vectorStoreId: String(
                input?.vectorStoreId || saved?.options?.vectorStoreId || "",
              ).trim(),
              fileSearchMaxResults: clamp(
                input?.fileSearchMaxResults ?? saved?.options?.fileSearchMaxResults,
                5,
                1,
                20,
              ),
            }
          : {}),
      },
    };
    const adapter = getAIProviderRegistry().get(key),
      validation = adapter.validateConfig(config);
    if (!validation.valid)
      throw new AiPlatformError(
        "provider_not_configured",
        400,
        validation.errors.join("; "),
      );
    const response = await adapter.generate(
      {
        traceId: crypto.randomUUID(),
        messages: [
          { role: "system", content: "Reply with exactly OK." },
          { role: "user", content: "Connection test. Reply OK." },
        ],
        model: config.model,
        temperature: 0,
        maxOutput: 8,
        responseFormat: "text",
        timeoutMs: 15000,
      },
      config,
    );
    let fileSearch: { enabled: boolean; vectorStoreId?: string; status?: string } = {
      enabled: false,
    };
    if (key === "yandex" && config.options?.fileSearchEnabled === true) {
      const vectorStoreId = String(config.options?.vectorStoreId || "").trim();
      if (!vectorStoreId)
        throw new AiPlatformError(
          "invalid_request",
          400,
          "Укажите Vector Store ID для базы знаний Yandex",
        );
      const vectorResponse = await fetch(
        `https://ai.api.cloud.yandex.net/v1/vector_stores/${encodeURIComponent(vectorStoreId)}`,
        { headers: { Authorization: `Api-Key ${config.secret}` } },
      );
      const vectorStore: any = await vectorResponse.json().catch(() => null);
      if (!vectorResponse.ok)
        throw new AiPlatformError(
          "provider_not_configured",
          400,
          `Yandex Vector Store недоступен (HTTP ${vectorResponse.status})`,
        );
      if (String(vectorStore?.status || "") !== "completed")
        throw new AiPlatformError(
          "conflict",
          409,
          `Yandex Vector Store ещё не готов: ${String(vectorStore?.status || "unknown")}`,
        );
      fileSearch = {
        enabled: true,
        vectorStoreId,
        status: String(vectorStore.status),
      };
    }
    return {
      ok: true,
      providerKey: key,
      model: response.model,
      latencyMs: response.latencyMs,
      fileSearch,
      message: "Подключение успешно проверено",
    };
  }

  async configuredProvider(
    tenantId: number,
    value: unknown,
  ): Promise<ProviderConfig | null> {
    const key = providerKey(value);
    const row = (
      await this.store.query(
        "SELECT provider_key,model,base_url,encrypted_secret,options_json,status FROM ai_provider_configs WHERE tenant_id=? AND provider_key=? AND purpose=? LIMIT 1",
        [tenantId, key, PURPOSE],
      )
    )[0];
    if (!row || row.status !== "active") return null;
    let options = {};
    try {
      options = JSON.parse(String(row.options_json || "{}"));
    } catch {}
    return {
      providerKey: key,
      model: String(row.model),
      baseUrl: row.base_url ? String(row.base_url) : null,
      secret: row.encrypted_secret
        ? decryptSecret(String(row.encrypted_secret))
        : null,
      options,
    };
  }

  async revealSecret(
    tenantId: number,
    value: unknown,
    actor: any,
  ): Promise<string> {
    const key = providerKey(value);
    const row = (
      await this.store.query(
        "SELECT encrypted_secret FROM ai_provider_configs WHERE tenant_id=? AND provider_key=? AND purpose=? LIMIT 1",
        [tenantId, key, PURPOSE],
      )
    )[0];
    if (!row?.encrypted_secret)
      throw new AiPlatformError(
        "provider_not_configured",
        404,
        "API-ключ провайдера не сохранён",
      );
    const secret = decryptSecret(String(row.encrypted_secret));
    await this.audit.append({
      tenantId,
      ...actor,
      eventType: "provider_secret_revealed" as any,
      entityType: "provider_config",
      entityId: key,
      decision: "revealed",
      details: { providerKey: key },
    });
    return secret;
  }
}
