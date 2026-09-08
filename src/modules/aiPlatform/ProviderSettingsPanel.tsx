import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Server,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  OPENAI_DEFAULT_TEXT_MODEL,
  OPENAI_TEXT_MODELS,
} from "../../../shared/openAiModelCatalog.js";

const PROVIDERS = [
  {
    key: "openai",
    name: "OpenAI",
    models: OPENAI_TEXT_MODELS,
    baseUrl: "",
  },
  {
    key: "gemini",
    name: "Google Gemini",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    baseUrl: "",
  },
  {
    key: "anthropic",
    name: "Anthropic",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"],
    baseUrl: "",
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com",
  },
  {
    key: "yandex",
    name: "Yandex Cloud",
    models: ["yandexgpt-lite", "yandexgpt"],
    baseUrl: "",
  },
  {
    key: "openai_compatible",
    name: "OpenAI-compatible",
    models: [],
    baseUrl: "",
  },
] as const;

export default function ProviderSettingsPanel({
  token,
  canManage,
}: {
  token: string;
  canManage: boolean;
}) {
  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );
  const [rows, setRows] = useState<any[]>([]),
    [legacy, setLegacy] = useState<any>(null),
    [selected, setSelected] = useState("openai"),
    [model, setModel] = useState(OPENAI_DEFAULT_TEXT_MODEL),
    [baseUrl, setBaseUrl] = useState(""),
    [apiKey, setApiKey] = useState(""),
    [showApiKey, setShowApiKey] = useState(false),
    [revealingKey, setRevealingKey] = useState(false),
    [folderId, setFolderId] = useState(""),
    [fileSearchEnabled, setFileSearchEnabled] = useState(false),
    [vectorStoreId, setVectorStoreId] = useState(""),
    [fileSearchMaxResults, setFileSearchMaxResults] = useState(5),
    [enabled, setEnabled] = useState(true),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [testing, setTesting] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
      null,
    );
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ai-platform/providers", { headers }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Не удалось загрузить провайдеров");
      const list = body.rows || [];
      setRows(list);
      setLegacy(body.legacyCompatibility || null);
      const active = list.find((row: any) => row.status === "active"),
        first = active || list[0];
      if (first) {
        setSelected(first.providerKey);
        setModel(first.model);
        setBaseUrl(first.baseUrl || "");
        setFolderId(first.folderId || "");
        setFileSearchEnabled(first.fileSearchEnabled === true);
        setVectorStoreId(first.vectorStoreId || "");
        setFileSearchMaxResults(Number(first.fileSearchMaxResults || 5));
        setEnabled(first.status === "active");
      } else if (body.legacyCompatibility?.configured) {
        setSelected(body.legacyCompatibility.providerKey);
        setModel(body.legacyCompatibility.model);
        setEnabled(true);
      }
    } catch (error: any) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [headers]);
  const current = rows.find((row) => row.providerKey === selected),
    definition =
      PROVIDERS.find((item) => item.key === selected) || PROVIDERS[0];
  const choose = (key: string) => {
    const definition = PROVIDERS.find((item) => item.key === key)!,
      saved = rows.find((row) => row.providerKey === key);
    setSelected(key);
    setModel(saved?.model || definition.models[0] || "");
    setBaseUrl(saved?.baseUrl || definition.baseUrl);
    setFolderId(saved?.folderId || "");
    setFileSearchEnabled(saved?.fileSearchEnabled === true);
    setVectorStoreId(saved?.vectorStoreId || "");
    setFileSearchMaxResults(Number(saved?.fileSearchMaxResults || 5));
    setEnabled(saved?.status === "active" || !saved);
    setApiKey("");
    setShowApiKey(false);
    setMessage(null);
  };
  const request = async (path: string, method: string) => {
    const response = await fetch(path, {
        method,
        headers,
        body: JSON.stringify({
          model,
          baseUrl,
          apiKey,
          folderId,
          enabled,
          fileSearchEnabled,
          vectorStoreId,
          fileSearchMaxResults,
        }),
      }),
      body = await response.json();
    if (!response.ok) throw new Error(body.error || "Операция не выполнена");
    return body.data;
  };
  const toggleKey = async () => {
    if (showApiKey) {
      setShowApiKey(false);
      return;
    }
    if (apiKey) {
      setShowApiKey(true);
      return;
    }
    try {
      setRevealingKey(true);
      setMessage(null);
      const response = await fetch(
          `/api/ai-platform/providers/${selected}/secret`,
          { headers },
        ),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Не удалось показать API-ключ");
      setApiKey(String(body.data?.apiKey || ""));
      setShowApiKey(true);
    } catch (error: any) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setRevealingKey(false);
    }
  };
  const save = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await request(`/api/ai-platform/providers/${selected}`, "PUT");
      setApiKey("");
      await load();
      setMessage({
        ok: true,
        text: "Настройки провайдера сохранены и подключены к AI-платформе.",
      });
    } catch (error: any) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    try {
      setTesting(true);
      setMessage(null);
      const data = await request(
        `/api/ai-platform/providers/${selected}/test`,
        "POST",
      );
      setMessage({
        ok: true,
        text: `Подключение работает · ${data.model} · ${data.latencyMs} мс${data.fileSearch?.enabled ? " · база знаний готова" : ""}`,
      });
    } catch (error: any) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setTesting(false);
    }
  };
  if (loading)
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Загрузка провайдеров…
      </div>
    );
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {PROVIDERS.map((item) => {
          const saved = rows.find((row) => row.providerKey === item.key),
            active = saved?.status === "active";
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => choose(item.key)}
              className={`rounded-2xl border p-4 text-left transition ${selected === item.key ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "bg-white hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm text-slate-900">{item.name}</b>
                {active ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                )}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {active
                  ? "Активен"
                  : saved?.secretConfigured
                    ? "Настроен"
                    : "Не настроен"}
              </p>
            </button>
          );
        })}
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-900">
              <Server className="h-5 w-5 text-blue-600" />
              {definition.name}
              {selected === "yandex" && (
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  title="Как подключить Yandex Cloud"
                  aria-label="Как подключить Yandex Cloud"
                  className="rounded-full p-1 text-blue-600 hover:bg-blue-100"
                >
                  <HelpCircle className="h-5 w-5" />
                </button>
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Настройка используется тестовыми диалогами, навыками и анализом
              разговоров AI-платформы.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${current?.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
            >
              {current?.status === "active"
                ? "Активный провайдер"
                : "Не активен"}
            </span>
            <label
              className={`relative inline-flex h-6 w-11 shrink-0 ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
              title={enabled ? "Отключить провайдера" : "Включить провайдера"}
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={!canManage}
                role="switch"
                aria-label="Включить AI-провайдера"
              />
              <span
                className={`absolute inset-0 rounded-full transition ${enabled ? "bg-blue-600" : "bg-slate-300"}`}
              />
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`}
              />
            </label>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">
            Модель
            {definition.models.length ? (
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={!canManage}
                className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2.5 font-mono text-xs disabled:opacity-60"
              >
                {model && !definition.models.includes(model as never) && (
                  <option value={model}>{model} (сохранённая)</option>
                )}
                {definition.models.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            ) : (
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={!canManage}
                placeholder="Введите идентификатор модели"
                className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2.5 font-mono text-xs disabled:opacity-60"
              />
            )}
          </label>
          <label className="text-xs font-bold text-slate-700">
            Base URL
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              disabled={!canManage}
              placeholder={
                selected === "openai_compatible"
                  ? "https://example.com/v1"
                  : "Можно оставить пустым"
              }
              className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2.5 font-mono text-xs disabled:opacity-60"
            />
          </label>
          {selected === "yandex" && (
            <label className="text-xs font-bold text-slate-700">
              Folder ID
              <input
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
                disabled={!canManage}
                placeholder="b1g…"
                className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2.5 font-mono text-xs disabled:opacity-60"
              />
            </label>
          )}
          {selected === "yandex" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 md:col-span-2">
              <label className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
                <span>
                  База знаний Yandex File Search
                  <span className="mt-1 block text-[10px] font-normal text-slate-500">
                    Экспериментально: подключает готовый Vector Store к голосовым звонкам.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={fileSearchEnabled}
                  onChange={(event) => setFileSearchEnabled(event.target.checked)}
                  disabled={!canManage}
                  className="h-4 w-4"
                />
              </label>
              {fileSearchEnabled && (
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
                  <label className="text-xs font-bold text-slate-700">
                    Vector Store ID
                    <input
                      value={vectorStoreId}
                      onChange={(event) => setVectorStoreId(event.target.value)}
                      disabled={!canManage}
                      placeholder="vs_…"
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 font-mono text-xs disabled:opacity-60"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Фрагментов в ответе
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={fileSearchMaxResults}
                      onChange={(event) => setFileSearchMaxResults(Number(event.target.value))}
                      disabled={!canManage}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-xs disabled:opacity-60"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          <label className="text-xs font-bold text-slate-700 md:col-span-2">
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              API-ключ
            </span>
            <span className="relative mt-1 block">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={!canManage}
                autoComplete="off"
                placeholder={
                  current?.secretConfigured
                    ? "Ключ сохранён — нажмите глаз, чтобы показать"
                    : "Вставьте API-ключ"
                }
                className="w-full rounded-xl border bg-slate-50 px-3 py-2.5 pr-11 font-mono text-xs disabled:opacity-60"
              />
              {canManage && (apiKey || current?.secretConfigured) && (
                <button
                  type="button"
                  onClick={() => void toggleKey()}
                  disabled={revealingKey}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800 disabled:opacity-50"
                  title={showApiKey ? "Скрыть API-ключ" : "Показать API-ключ"}
                  aria-label={
                    showApiKey ? "Скрыть API-ключ" : "Показать API-ключ"
                  }
                >
                  {revealingKey ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              )}
            </span>
            <span className="mt-1 block text-[10px] font-normal text-slate-400">
              SU и администраторы с правом управления AI-провайдерами могут
              показать сохранённый ключ. Просмотр записывается в аудит.
            </span>
          </label>
        </div>
        {legacy?.configured && !rows.some((row) => row.status === "active") && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <TriangleAlert className="mr-2 inline h-4 w-4" />
            Пока используется совместимая конфигурация AIPBXAdmin:{" "}
            {legacy.providerKey} / {legacy.model}. Сохраните провайдера здесь
            для перехода на MariaDB.
          </div>
        )}
        {message && (
          <div
            className={`mt-4 rounded-xl border p-3 text-xs font-semibold ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
          >
            {message.text}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void test()}
            disabled={!canManage || testing || !model}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-40"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Проверить подключение
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canManage || saving || !model}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Сохранить
          </button>
        </div>
      </div>
      {helpOpen && <YandexConnectionHelp onClose={() => setHelpOpen(false)} />}
    </section>
  );
}

function YandexConnectionHelp({ onClose }: { onClose: () => void }) {
  const steps = [
    <>
      Откройте{" "}
      <a
        href="https://console.yandex.cloud/"
        target="_blank"
        rel="noreferrer"
        className="font-bold text-blue-600 hover:underline"
      >
        Yandex Cloud Console <ExternalLink className="inline h-3 w-3" />
      </a>
      , выберите каталог и скопируйте его <b>Folder ID</b>.
    </>,
    <>
      Перейдите в <b>Identity and Access Management → Сервисные аккаунты</b> и
      создайте аккаунт, например <code>pbxpuls-ai</code>.
    </>,
    <>
      Назначьте аккаунту роли <code>ai.languageModels.user</code>,{" "}
      <code>ai.speechkit-stt.user</code> и <code>ai.speechkit-tts.user</code>.
    </>,
    <>
      Откройте аккаунт и выберите <b>Создать новый ключ → Создать API-ключ</b>.
      Не выбирайте статический или авторизованный ключ.
    </>,
    <>
      Для ключа включите области <code>yc.ai.languageModels.execute</code>,{" "}
      <code>yc.ai.speechkitStt.execute</code> и{" "}
      <code>yc.ai.speechkitTts.execute</code>. Скопируйте секрет сразу: повторно
      Яндекс его не покажет.
    </>,
    <>
      В PBXPuls укажите модель <code>yandexgpt-lite</code>, оставьте Base URL
      пустым, вставьте Folder ID и API-ключ. Голос и амплуа выбираются отдельно
      в настройках AI-сотрудника.
    </>,
    <>
      Нажмите <b>Проверить подключение</b>. После успешной проверки нажмите{" "}
      <b>Сохранить</b>.
    </>,
  ];
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="yandex-help-title"
      onClick={onClose}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        className="mx-auto my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="yandex-help-title"
              className="text-lg font-black text-slate-900"
            >
              Как подключить Yandex Cloud
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              YandexGPT, распознавание и синтез русской речи
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть инструкцию"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <ol className="mt-5 space-y-3">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm text-slate-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
                {index + 1}
              </span>
              <div className="min-w-0 pt-0.5 leading-6">{step}</div>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <b>Важно:</b> API-ключ хранится в MariaDB в зашифрованном виде. Его
          могут показать только пользователи с правом управления
          AI-провайдерами; просмотр фиксируется в аудите.
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <a
            href="https://yandex.cloud/ru/docs/iam/operations/authentication/manage-api-keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
          >
            Официальная инструкция Yandex Cloud{" "}
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
          >
            Понятно
          </button>
        </div>
      </section>
    </div>
  );
}
