import React, { useEffect, useMemo, useState } from "react";
import {VOICE_INTENT_RULES,VOICE_INTENT_CLARIFY} from '../../../shared/voiceActionIntentDefaults.js';
import { OPENAI_REALTIME_MODELS } from "../../../shared/openAiModelCatalog.js";

const blindLabels = ["A", "B", "C"];
export default function VoiceSettingsPanel({
  token,
  agentId,
  canManage,
  expertMode = false,
  canManageRuntimePrompts = false,
}: {
  token: string;
  agentId: number;
  canManage: boolean;
  expertMode?: boolean;
  canManageRuntimePrompts?: boolean;
}) {
  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );
  const [catalog, setCatalog] = useState<any[]>([]),
    [texts, setTexts] = useState<any>({ primary: "", additional: "" }),
    [profile, setProfile] = useState<any>({
      provider: "",
      voiceId: "",
      language: "ru",
      locale: "ru-RU",
      pronunciationStyle: "native_neutral",
      speakingRate: "slightly_fast",
      pauseStyle: "short_natural",
      expressiveness: "warm_moderate",
      pitchStyle: "neutral",
      role: "neutral",
      speechRate: 1,
      sttLanguage: "ru-RU",
      eouSensitivity: 0.9,
      endOfUtteranceSilenceMs: 700,
      realtimeModel: "speech-realtime-260528",
      transcriptionModel: "gpt-live-transcribe",
      openaiMaxOutputTokens: 240,
      reasoningEffort: "low",
      noiseReduction: "near_field",
      turnDetection: "local",
      responseEagerness: "high",
      responseLength: "normal",
      maxResponseAudioSeconds: 15,
    }),
    [vad, setVad] = useState(700),
    [entries, setEntries] = useState<any[]>([]),
    [testText, setTestText] = useState(""),
    [audio, setAudio] = useState<Record<string, string>>({}),
    [generating, setGenerating] = useState(""),
    [comparison, setComparison] = useState<string[]>([]),
    [blind, setBlind] = useState(false),
    [blindVoices, setBlindVoices] = useState<string[]>([]),
    [blindChoice, setBlindChoice] = useState<number | null>(null),
    [providerFilter, setProviderFilter] = useState("all"),
    [availability, setAvailability] = useState("active"),
    [newOnly, setNewOnly] = useState(false),
    [genderFilter, setGenderFilter] = useState("all"),
    [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null),
    [preview, setPreview] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [published, setPublished] = useState<any>(null),
    [bindingId, setBindingId] = useState<number | null>(null),
    [controlledPreview, setControlledPreview] = useState<any>(null),
    [runtimePrompts,setRuntimePrompts]=useState<any>({
      actionIntentRules:VOICE_INTENT_RULES,
      actionIntentClarify:VOICE_INTENT_CLARIFY,
      conversationRules:"Веди предметный разговор по задаче клиента. Задавай по одному вопросу. Не спрашивай про отдел и не предлагай обратный звонок без просьбы клиента.",
      responseRules:"Отвечай только на русском языке, кратко и по существу. Одна законченная реплика или один вопрос, затем сразу замолчи.",
      knowledgeResponseRules:"",
      knowledgePriceNotFoundResponse:"В опубликованном прайсе цена для указанной площадки не найдена. Хотите уточнить её у менеджера?",
      knowledgeFrequencyMismatchResponse:"В прайсе для этой площадки указана частота {{availableFrequency}} выхода в час. Цены на {{requestedFrequency}} выхода в час нет. Уточнить этот вариант у менеджера?",
      fileSearchRules:"Когда вопрос требует сведений из файлов, первым действием вызови file_search и ничего не произноси до получения результата. Для вопроса о стоимости назови найденное поле «Цена» или «Розничная цена» вместе с соответствующим адресом. Учитывай город, адрес и услугу из предыдущих реплик. Никогда не говори, что ещё ищешь или просишь подождать.",
      knownNumber:"Номер входящего звонка уже известен системе. Не проси диктовать его заново. Если нужен обратный звонок, спроси: «Перезвонить на номер, с которого вы сейчас звоните?» Подтверждение номера не завершает разговор. Сообщай только подтверждённый результат действия и продолжай по задаче клиента.",
      retryResponse:"Предыдущий ответ не озвучивай. Ответь заново одной короткой фразой на русском языке. Не спрашивай про отдел. Если номер входящего звонка известен, не проси его диктовать.",
      salesValueResponse:"Понимаю ваше сомнение. Реклама в торговом зале регулярно охватывает покупателей рядом с местом принятия решения, а площадку можно подобрать под ваш бюджет.",
      salesNextStepKnownCity:"Чтобы подобрать площадки в городе {{city}}, какую задачу должна решить реклама: повысить узнаваемость, поддержать акцию или продвинуть конкретный товар?",
      salesNextStepUnknownCity:"В каком городе вы хотите запустить рекламу?",
      maxOutputTokens:240,
    }),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void Promise.all([
      fetch("/api/ai-platform/voice-profiles/options", { headers }).then((r) =>
        r.json(),
      ),
      fetch("/api/ai-platform/voice-catalog", { headers }).then((r) =>
        r.json(),
      ),
      fetch(`/api/ai-platform/agents/${agentId}/voice-settings`, {
        headers,
      }).then((r) => r.json()),
      fetch("/api/ai-platform/voice-agent-bindings", { headers }).then((r) =>
        r.json(),
      ),
    ])
      .then(([o, c, s, b]) => {
        const rows = c.rows || [];
        setCatalog(rows);
        setLastVerifiedAt(c.lastVerifiedAt || null);
        setTexts(o.data.comparisonTexts);
        setTestText(o.data.comparisonTexts.primary);
        if (s.data?.voiceProfile)
          setProfile((current: any) => ({
            ...current,
            ...s.data.voiceProfile,
            endOfUtteranceSilenceMs: Number(
              s.data.voiceProfile.endOfUtteranceSilenceMs ||
                s.data?.endOfTurnSilenceMs ||
                700,
            ),
          }));
        setVad(
          Number(
            s.data?.voiceProfile?.endOfUtteranceSilenceMs ||
              s.data?.endOfTurnSilenceMs ||
              700,
          ),
        );
        setEntries(s.data?.pronunciationEntries || []);
        if(canManageRuntimePrompts)setRuntimePrompts((current:any)=>({...current,...(s.data?.runtimePrompts||{})}));
        setBlindVoices(
          rows
            .filter((x: any) => x.active && x.supported)
            .map((x: any) => x.voiceId)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3),
        );
        const binding = (b.rows || []).find(
          (x: any) => x.bindingKey === "controlled_test_205",
        );
        setBindingId(binding ? Number(binding.id) : null);
      })
      .catch(() => setMessage("Не удалось загрузить Voice Catalog"));
  }, [agentId, headers]);
  const post = async (path: string, body: any) => {
    const r = await fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      v = await r.json();
    if (!r.ok) throw new Error(v.error || "Ошибка");
    return v.data;
  };
  const body = {
    voiceProfile: { ...profile, endOfUtteranceSilenceMs: vad },
    endOfTurnSilenceMs: vad,
    pronunciationEntries: entries,
    ...(canManageRuntimePrompts?{runtimePrompts}:{}),
  };
  const listen = async (voiceId: string, force = false, provider?: string) => {
    const selectedProvider = provider || profile.provider;
    setProfile((current: any) => ({
      ...current,
      provider: selectedProvider,
      voiceId,
      realtimeModel: selectedProvider === "openai_realtime"
        ? (OPENAI_REALTIME_MODELS.includes(current.realtimeModel) ? current.realtimeModel : "gpt-realtime-2.1")
        : (String(current.realtimeModel || "").startsWith("speech-realtime-") ? current.realtimeModel : "speech-realtime-260528"),
    }));
    setDraft(null);
    setPreview(null);
    try {
      setGenerating(voiceId);
      const r = await fetch("/api/ai-platform/voice-profiles/preview-audio", {
        method: "POST",
        headers,
        body: JSON.stringify({
          voiceProfile: { ...profile, provider: selectedProvider, voiceId },
          text: testText,
          force,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Голос недоступен");
      if (audio[voiceId]) URL.revokeObjectURL(audio[voiceId]);
      const url = URL.createObjectURL(await r.blob());
      setAudio((v) => ({ ...v, [voiceId]: url }));
      await new Audio(url).play();
      setMessage(
        `Preview ${blind ? "варианта" : voiceId}: cache ${r.headers.get("X-Voice-Preview-Cache") || "—"}`,
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setGenerating("");
    }
  };
  const compare = async () => {
    for (const voiceId of comparison) {
      const item = catalog.find((x) => x.voiceId === voiceId);
      await listen(voiceId, false, item?.provider);
    }
  };
  const refreshCatalog = async () => {
    try {
      const result = await post("/api/ai-platform/voice-catalog/refresh", {
        provider: profile.provider || "openai_realtime",
      });
      const response = await fetch("/api/ai-platform/voice-catalog", {
        headers,
      }).then((r) => r.json());
      setCatalog(response.rows || []);
      setLastVerifiedAt(response.lastVerifiedAt || result.lastVerifiedAt);
      setMessage(
        `Каталог проверен: новых ${result.added.length}, недоступных ${result.unavailable.length}. Agent versions и bindings не изменены.`,
      );
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const select = (item: any) => {
    setProfile({
      ...profile,
      provider: item.provider,
      voiceId: item.voiceId,
      realtimeModel: item.provider === "openai_realtime"
        ? (OPENAI_REALTIME_MODELS.includes(profile.realtimeModel) ? profile.realtimeModel : "gpt-realtime-2.1")
        : (String(profile.realtimeModel || "").startsWith("speech-realtime-") ? profile.realtimeModel : "speech-realtime-260528"),
    });
    setDraft(null);
    setPreview(null);
    setMessage(`Выбран ${item.voiceId}; изменение ещё не сохранено`);
  };
  const createDraft = async () => {
    try {
      const value = await post(
        `/api/ai-platform/agents/${agentId}/voice-settings/draft`,
        body,
      );
      setDraft(value);
      setPublished(null);
      setMessage(`Voice Profile сохранён в draft version ${value.version}`);
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const publish = async () => {
    if (
      !draft ||
      !window.confirm(`Опубликовать immutable version ${draft.version}?`)
    )
      return;
    try {
      const value = await post(
        `/api/ai-platform/agents/${agentId}/versions/${draft.id}/publish`,
        {},
      );
      setPublished({ ...value, version: draft.version });
      setMessage(
        `Version ${draft.version} опубликована; binding 205 не изменён`,
      );
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const previewBinding = async () => {
    try {
      if (!published || !bindingId) return;
      const value = await post(
        `/api/ai-platform/voice-agent-bindings/${bindingId}/version-preview`,
        { agentVersionId: published.id },
      );
      setControlledPreview(value);
      setMessage("Preview controlled binding готов");
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const applyBinding = async () => {
    if (
      !controlledPreview?.ready ||
      !window.confirm("Переключить только controlled binding 205?")
    )
      return;
    try {
      const value = await post(
        `/api/ai-platform/voice-agent-bindings/${bindingId}/version-apply`,
        { agentVersionId: published.id, confirm: true },
      );
      setMessage(
        `205 переключён; productionAffected=${String(value.productionAffected)}`,
      );
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const savePublishAndApply = async () => {
    if (!window.confirm(`Сохранить настройки голоса, опубликовать новую версию и применить её к ${bindingId ? "205" : "сотруднику"}?`)) return;
    setSaving(true);
    try {
      const nextDraft = await post(
        `/api/ai-platform/agents/${agentId}/voice-settings/draft`,
        body,
      );
      const nextPublished = await post(
        `/api/ai-platform/agents/${agentId}/versions/${nextDraft.id}/publish`,
        {},
      );
      setDraft(nextDraft);
      setPublished({ ...nextPublished, version: nextDraft.version });
      if (bindingId) {
        const bindingPreview = await post(
          `/api/ai-platform/voice-agent-bindings/${bindingId}/version-preview`,
          { agentVersionId: nextPublished.id },
        );
        if (!bindingPreview?.ready)
          throw new Error("Настройки сохранены, но номер 205 пока не готов к переключению");
        await post(
          `/api/ai-platform/voice-agent-bindings/${bindingId}/version-apply`,
          { agentVersionId: nextPublished.id, confirm: true },
        );
      }
      setMessage(`Настройки сохранены и применены${bindingId ? " к 205" : ""}`);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };
  const providers = [...new Set(catalog.map((x) => x.provider))],
    genders = [
      ...new Set(
        catalog.map((x) => String(x.metadata?.gender || "")).filter(Boolean),
      ),
    ];
  const visible = catalog.filter(
    (x) =>
      (providerFilter === "all" || x.provider === providerFilter) &&
      (availability === "all" ||
        (availability === "active"
          ? x.active && x.supported
          : !x.active || !x.supported)) &&
      (!newOnly || x.isNew) &&
      (genderFilter === "all" || x.metadata?.gender === genderFilter),
  );
  const renderCard = (item: any, label = item.displayName, hidden = false) => (
    <article
      key={label}
      className={`rounded-xl border p-3 ${profile.voiceId === item.voiceId ? "border-blue-500 bg-blue-50" : ""} ${!item.supported ? "opacity-60" : ""}`}
    >
      <div className="flex justify-between gap-2">
        <b>
          {label}{" "}
          {item.isNew && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
              Новый
            </span>
          )}{" "}
          {item.metadata?.apiVersion && (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] text-blue-800">
              SpeechKit {item.metadata.apiVersion}
            </span>
          )}
        </b>
        {!hidden && <code className="text-xs">{item.voiceId}</code>}
      </div>
      {!hidden && (
        <>
          {expertMode && (
            <p className="text-xs text-slate-500">
              Голосовой сервис: {item.provider}
            </p>
          )}
          <p className="mt-1 text-xs">
            {item.description || "Описание не задано"}
          </p>
          {Array.isArray(item.metadata?.roles) &&
            item.metadata.roles.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">
                Амплуа: {item.metadata.roles.join(", ")}
              </p>
            )}
          {!item.supported && (
            <p className="mt-1 text-xs text-amber-700">
              Недоступен для новых настроек; сохранён для опубликованных версий.
            </p>
          )}
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          disabled={
            !item.previewAvailable ||
            !item.supported ||
            generating === item.voiceId
          }
          onClick={() => void listen(item.voiceId, false, item.provider)}
          className="rounded border px-2 py-1 text-xs"
        >
          {generating === item.voiceId ? "Генерация…" : "Прослушать"}
        </button>
        <button
          disabled={!audio[item.voiceId]}
          onClick={() => void new Audio(audio[item.voiceId]).play()}
          className="rounded border px-2 py-1 text-xs"
        >
          Повторить
        </button>
        <button
          disabled={!item.previewAvailable || !item.supported}
          onClick={() => void listen(item.voiceId, true, item.provider)}
          className="rounded border px-2 py-1 text-xs"
        >
          Обновить пример
        </button>
      </div>
      {audio[item.voiceId] && (
        <audio controls className="mt-2 w-full" src={audio[item.voiceId]} />
      )}
      <div className="mt-2 flex gap-2">
        <button
          disabled={!canManage || !item.supported}
          onClick={() => {
            if (hidden) {
              const i = blindVoices.indexOf(item.voiceId);
              setBlindChoice(i);
            }
            select(item);
          }}
          className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
        >
          Выбрать
        </button>
        {!hidden && (
          <label className="text-xs">
            <input
              type="checkbox"
              checked={comparison.includes(item.voiceId)}
              disabled={
                !comparison.includes(item.voiceId) && comparison.length >= 5
              }
              onChange={(e) =>
                setComparison((v) =>
                  e.target.checked
                    ? [...v, item.voiceId]
                    : v.filter((x) => x !== item.voiceId),
                )
              }
            />{" "}
            Сравнить
          </label>
        )}
        {profile.voiceId === item.voiceId && (
          <span className="text-xs font-bold text-blue-700">Текущий выбор</span>
        )}
      </div>
    </article>
  );
  if (!catalog.length)
    return (
      <section className="mt-5 rounded-2xl border bg-white p-5">
        Voice Catalog загружается… {message}
      </section>
    );
  return (
    <section className="mt-5 rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black">Голос и произношение</h3>
        <button
          disabled={!canManage}
          onClick={() => void refreshCatalog()}
          className="rounded border px-3 py-2 text-sm disabled:opacity-40"
        >
          Обновить каталог голосов
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Preview изолирован от voice sessions и published version. Качество
        произношения зависит от языка и определяется пользователем на слух.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Последняя проверка каталога:{" "}
        {lastVerifiedAt
          ? new Date(lastVerifiedAt).toLocaleString("ru-RU")
          : "не выполнялась"}
      </p>
      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <textarea
          maxLength={300}
          className="w-full rounded border p-2 text-sm"
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setTestText(texts.primary)}
          >
            Текст по умолчанию
          </button>
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setTestText(texts.additional)}
          >
            Дополнительный текст
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => setBlind(false)}
        >
          Каталог
        </button>
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => {
            setBlind(true);
            setBlindChoice(null);
          }}
        >
          Сравнение голосов
        </button>
        {!blind && (
          <>
            {expertMode && (
              <select
                className="rounded border p-2 text-sm"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <option value="all">Все голосовые сервисы</option>
                {providers.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
            <select
              className="rounded border p-2 text-sm"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
            >
              <option value="active">Доступные</option>
              <option value="unavailable">Недоступные</option>
              <option value="all">Все</option>
            </select>
            <label className="rounded border p-2 text-sm">
              <input
                type="checkbox"
                checked={newOnly}
                onChange={(e) => setNewOnly(e.target.checked)}
              />{" "}
              Новые
            </label>
            {expertMode && genders.length > 0 && (
              <select
                className="rounded border p-2 text-sm"
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
              >
                <option value="all">Любой тип голоса</option>
                {genders.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
            <span className="rounded border p-2 text-sm">
              Язык: {profile.locale}
            </span>
            <button
              disabled={comparison.length < 2}
              onClick={() => void compare()}
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              Сравнить ({comparison.length})
            </button>
          </>
        )}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {blind
          ? blindVoices.map((id, i) =>
              renderCard(
                catalog.find((x) => x.voiceId === id),
                `Вариант ${blindLabels[i]}`,
                true,
              ),
            )
          : visible.map((item) => renderCard(item))}
      </div>
      {blindChoice !== null && (
        <p className="mt-2 rounded bg-emerald-50 p-2 text-sm">
          Выбран вариант {blindLabels[blindChoice]}:{" "}
          <code>{blindVoices[blindChoice]}</code>
        </p>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Voice ID
          <input
            readOnly
            className="mt-1 w-full rounded border p-2"
            value={profile.voiceId}
          />
        </label>
        <label className="text-sm">
          Язык
          <input
            className="mt-1 w-full rounded border p-2"
            value={profile.language}
            onChange={(e) =>
              setProfile({ ...profile, language: e.target.value })
            }
          />
        </label>
        <label className="text-sm">
          Locale
          <input
            className="mt-1 w-full rounded border p-2"
            value={profile.locale}
            onChange={(e) => setProfile({ ...profile, locale: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Темп
          <select
            className="mt-1 w-full rounded border p-2"
            value={profile.speakingRate}
            onChange={(e) =>
              setProfile({ ...profile, speakingRate: e.target.value })
            }
          >
            <option value="slightly_fast">Немного быстрее</option>
            <option value="normal">Обычный</option>
          </select>
        </label>
        <label className="text-sm">
          Паузы
          <select
            className="mt-1 w-full rounded border p-2"
            value={profile.pauseStyle}
            onChange={(e) =>
              setProfile({ ...profile, pauseStyle: e.target.value })
            }
          >
            <option value="short_natural">Короткие естественные</option>
            <option value="natural">Естественные</option>
          </select>
        </label>
        <label className="text-sm md:col-span-3">
          Инструкции произношения
          <textarea
            maxLength={1000}
            className="mt-1 w-full rounded border p-2"
            value={profile.pronunciationInstructions || ""}
            onChange={(e) =>
              setProfile({
                ...profile,
                pronunciationInstructions: e.target.value,
              })
            }
          />
        </label>
      </div>
      {profile.provider === "yandex_speechkit" && (
        <div className="mt-4 grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2">
          <section>
            <h4 className="font-black">Синтез речи Yandex</h4>
            <label className="mt-3 block text-sm">
              Модель Yandex Realtime
              <select
                className="mt-1 w-full rounded border bg-white p-2"
                value={profile.realtimeModel || "speech-realtime-260528"}
                onChange={(e) =>
                  setProfile({ ...profile, realtimeModel: e.target.value })
                }
              >
                <option value="speech-realtime-260528">
                  Speech Realtime v260528
                </option>
                <option value="speech-realtime-250923">
                  Speech Realtime v250923
                </option>
                <option value="speech-realtime-deepseek-v4-flash">
                  Speech Realtime DeepSeek V4 Flash
                </option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Амплуа
              <select
                className="mt-1 w-full rounded border bg-white p-2"
                value={profile.role || "neutral"}
                onChange={(e) =>
                  setProfile({ ...profile, role: e.target.value })
                }
              >
                {(
                  catalog.find(
                    (x) =>
                      x.provider === profile.provider &&
                      x.voiceId === profile.voiceId,
                  )?.metadata?.roles || ["neutral"]
                ).map((role: string) => (
                  <option key={role} value={role}>
                    {({neutral:"Нейтральный",friendly:"Дружелюбный",good:"Радостный",strict:"Строгий",evil:"Раздражённый",whisper:"Шёпот"} as Record<string,string>)[role] || role}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Скорость речи: {Number(profile.speechRate || 1).toFixed(1)}
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={profile.speechRate || 1}
                onChange={(e) =>
                  setProfile({ ...profile, speechRate: Number(e.target.value) })
                }
                className="mt-2 w-full"
              />
              <span className="flex justify-between text-xs text-slate-400">
                <span>0.1</span>
                <span>1.0 — обычная</span>
                <span>3.0</span>
              </span>
            </label>
          </section>
          <section>
            <h4 className="font-black">Распознавание речи Yandex</h4>
            <label className="mt-3 block text-sm">
              Язык
              <select
                className="mt-1 w-full rounded border bg-white p-2"
                value={profile.sttLanguage || "ru-RU"}
                onChange={(e) =>
                  setProfile({ ...profile, sttLanguage: e.target.value })
                }
              >
                <option value="ru-RU">Русский</option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Чувствительность конца фразы:{" "}
              {Number(profile.eouSensitivity ?? 0.9).toFixed(1)}
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={profile.eouSensitivity ?? 0.9}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    eouSensitivity: Number(e.target.value),
                  })
                }
                className="mt-2 w-full"
              />
            </label>
            <label className="mt-3 block text-sm">
              Длительность тишины: {vad} мс
              <input
                type="range"
                min="100"
                max="3000"
                step="100"
                value={vad}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setVad(value);
                  setProfile({ ...profile, endOfUtteranceSilenceMs: value });
                }}
                className="mt-2 w-full"
              />
              <span className="flex justify-between text-xs text-slate-400">
                <span>100 мс</span>
                <span>3000 мс</span>
              </span>
            </label>
            <p className="mt-2 text-xs text-amber-700">
              Параметры конца фразы применятся после подключения потокового
              Yandex STT v3 к живому voice runtime.
            </p>
          </section>
        </div>
      )}
      {profile.provider === "openai_realtime" && (
        <div className="mt-4 rounded-xl border bg-slate-50 p-4">
          <h4 className="font-black">OpenAI Realtime</h4>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="text-sm">Длина ответа
              <select className="mt-1 w-full rounded border bg-white p-2" value={profile.responseLength || "normal"} onChange={(e) => setProfile({...profile,responseLength:e.target.value})}>
                <option value="short">Короткая — 1–2 предложения</option><option value="normal">Обычная — 2–3 предложения</option><option value="detailed">Подробная — до 4–5 предложений</option>
              </select>
            </label>
            <label className="text-sm">Максимальная длительность одной реплики: {Number(profile.maxResponseAudioSeconds || 15)} сек.
              <input type="range" min="8" max="30" step="1" className="mt-2 w-full" value={Number(profile.maxResponseAudioSeconds || 15)} onChange={(e) => setProfile({...profile,maxResponseAudioSeconds:Number(e.target.value)})}/>
              <span className="flex justify-between text-xs text-slate-400"><span>8 сек.</span><span>30 сек.</span></span>
            </label>
            <label className="text-sm">Модель
              <select className="mt-1 w-full rounded border bg-white p-2" value={profile.realtimeModel || "gpt-realtime-2.1"} onChange={(e) => setProfile({...profile,realtimeModel:e.target.value})}>
                {OPENAI_REALTIME_MODELS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm">Модель распознавания речи пользователя
              <select className="mt-1 w-full rounded border bg-white p-2" value={profile.transcriptionModel || "gpt-live-transcribe"} onChange={(e) => setProfile({...profile,transcriptionModel:e.target.value})}>
                {["gpt-live-transcribe","gpt-transcribe","gpt-realtime-whisper","gpt-4o-transcribe","gpt-4o-mini-transcribe"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            {expertMode && canManageRuntimePrompts && <label className="text-sm">Максимум токенов ответа
              <div className="mt-1 flex gap-2">
                <input type="number" min="1" max="4096" disabled={profile.openaiMaxOutputTokens === "inf"} className="w-full rounded border bg-white p-2 disabled:opacity-50" value={profile.openaiMaxOutputTokens === "inf" ? 4096 : Number(profile.openaiMaxOutputTokens || 240)} onChange={(e) => setProfile({...profile,openaiMaxOutputTokens:Number(e.target.value)})}/>
                <label className="flex items-center gap-1 rounded border bg-white px-3"><input type="checkbox" checked={profile.openaiMaxOutputTokens === "inf"} onChange={(e) => setProfile({...profile,openaiMaxOutputTokens:e.target.checked ? "inf" : 240})}/>Без ограничений</label>
              </div>
            </label>}
            <label className="text-sm">Глубина рассуждений
              <select className="mt-1 w-full rounded border bg-white p-2" value={profile.reasoningEffort || "low"} onChange={(e) => setProfile({...profile,reasoningEffort:e.target.value})}>
                <option value="low">Низкая — быстрее</option><option value="medium">Средняя</option><option value="high">Высокая — глубже, медленнее</option>
              </select>
            </label>
            <label className="text-sm">Шумоподавление
              <select className="mt-1 w-full rounded border bg-white p-2" value={profile.noiseReduction || "near_field"} onChange={(e) => setProfile({...profile,noiseReduction:e.target.value})}>
                <option value="near_field">Ближнее поле — телефон или гарнитура</option><option value="far_field">Дальнее поле — громкая связь или помещение</option><option value="off">Выключено</option>
              </select>
            </label>
            <label className="text-sm">Автоматическое определение конца реплики
              <select className="mt-1 w-full rounded border bg-white p-2" value={profile.turnDetection || "local"} onChange={(e) => setProfile({...profile,turnDetection:e.target.value})}>
                <option value="local">Локальное определение PBXPuls — рекомендуется для телефонии</option><option value="semantic_vad">Семантическое определение OpenAI</option><option value="server_vad">Серверное определение OpenAI</option>
              </select>
            </label>
            <label className="text-sm">Скорость реакции на конец реплики
              <select disabled={profile.turnDetection !== "semantic_vad"} className="mt-1 w-full rounded border bg-white p-2 disabled:opacity-50" value={profile.responseEagerness || "high"} onChange={(e) => setProfile({...profile,responseEagerness:e.target.value})}>
                <option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая — быстрее отвечает</option>
              </select>
            </label>
            <div className="rounded border bg-white p-3 text-sm">
              <b>Функции</b><p className="mt-1 text-xs text-slate-500">Опубликованные навыки сотрудника автоматически передаются OpenAI как функции. Выполняются только разрешённые инструменты PBXPuls для чтения данных.</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">MCP-серверы будут настраиваться отдельно: им нужны адрес, авторизация и политика подтверждений. Функции уже подключены к существующим навыкам PBXPuls.</p>
        </div>
      )}
      <div className="mt-4">
        <div className="flex justify-between">
          <b className="text-sm">Словарь произношения</b>
          <button
            disabled={!canManage}
            onClick={() =>
              setEntries([
                ...entries,
                { source: "", pronunciation: "", stress: "", aliases: [] },
              ])
            }
            className="rounded border px-2 py-1 text-xs"
          >
            Добавить
          </button>
        </div>
        {entries.map((x, i) => (
          <div key={i} className="mt-2 grid gap-2 md:grid-cols-3">
            <input
              className="rounded border p-2"
              placeholder="Написание"
              value={x.source}
              onChange={(e) =>
                setEntries(
                  entries.map((v, j) =>
                    j === i ? { ...v, source: e.target.value } : v,
                  ),
                )
              }
            />
            <input
              className="rounded border p-2"
              placeholder="Произношение"
              value={x.pronunciation}
              onChange={(e) =>
                setEntries(
                  entries.map((v, j) =>
                    j === i ? { ...v, pronunciation: e.target.value } : v,
                  ),
                )
              }
            />
            <input
              className="rounded border p-2"
              placeholder="Ударение"
              value={x.stress || ""}
              onChange={(e) =>
                setEntries(
                  entries.map((v, j) =>
                    j === i ? { ...v, stress: e.target.value } : v,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>
      {canManageRuntimePrompts && (
        <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <summary className="cursor-pointer font-bold text-amber-950">Служебные промпты (только admin и SU)</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={runtimePrompts.agenticEnabled===true} onChange={event=>setRuntimePrompts({...runtimePrompts,agenticEnabled:event.target.checked})}/>Модель управляет задачей (текст и голос, первый этап)</label>
            {runtimePrompts.agenticEnabled===true&&<label className="block text-sm font-medium">Подключённый текстовый провайдер<select className="mt-1 w-full rounded border bg-white p-2" value={runtimePrompts.agenticProvider||''} onChange={event=>setRuntimePrompts({...runtimePrompts,agenticProvider:event.target.value,agenticModel:''})}><option value="">По умолчанию платформы</option><option value="openai">OpenAI</option><option value="yandex">Яндекс</option><option value="openai_compatible">OpenAI-совместимый</option></select><span className="text-xs font-normal text-slate-600">Используется только уже настроенный и включённый провайдер этой компании. Новое подключение не создаётся. Провайдер голоса не меняется.</span></label>}
            {runtimePrompts.agenticEnabled===true&&<label className="block text-sm font-medium">Текстовая модель управления задачей<input className="mt-1 w-full rounded border bg-white p-2 font-normal" value={runtimePrompts.agenticModel||''} maxLength={191} placeholder="Пусто — настроенная модель выбранного провайдера" onChange={event=>setRuntimePrompts({...runtimePrompts,agenticModel:event.target.value})}/><span className="text-xs font-normal text-slate-600">Идентификатор модели выбранного текстового провайдера. YandexGPT и Lite пока не прошли повторяемую проверку всего диалога. Голос и телефонный маршрут не меняются.</span></label>}
            {runtimePrompts.agenticEnabled===true&&<p className="text-sm text-slate-700">Общий цикл инструментов: назначенная база знаний, подтверждённая заявка, перевод. Используется активный текстовый провайдер и выбранный голос для озвучивания. Простой ответ — один запрос модели; после инструментов возможны дополнительные запросы. В песочнице действия только моделируются. Включение применяется через публикацию версии; телефонный маршрут здесь не меняется.</p>}
            <label className="flex items-center gap-2"><input type="checkbox" checked={runtimePrompts.leadCaptureEnabled===true} onChange={event=>setRuntimePrompts({...runtimePrompts,leadCaptureEnabled:event.target.checked})}/>Создавать заявки в PBXPuls после подтверждения клиента</label>
            <p className="text-sm text-slate-600">Заявки, обратные звонки и перевод распознаются нейросетью по контексту разговора. Не нужно перечислять все возможные фразы. Сохранение выполняет PBXPuls после подтверждения клиента; при неоднозначности сотрудник уточняет намерение.</p>
            {runtimePrompts.agenticEnabled!==true&&<p className="text-sm text-slate-600">Для распознавания используется активный текстовый AI-провайдер. Это дополнительный API-запрос на реплику; он влияет на стоимость и время ответа.</p>}
            {runtimePrompts.agenticEnabled===true&&<p className="text-sm text-amber-900">Поля ниже относятся к прежнему диалоговому механизму и не задают ход задачи в новом режиме. Роль, общие инструкции и правила продукта редактируются в настройках сотрудника и назначенных навыках. Бюджет структурированного решения нового режима: до 1400 токенов; это не предел длины произносимой фразы.</p>}
            {[
              ["actionIntentRules","Правила понимания заявок и перевода по контексту"],
              ["actionIntentClarify","Уточнение при неоднозначном намерении или ошибке распознавания"],
              ["leadRequestPhrases","Прежний список фраз (совместимость; не используется контекстным распознаванием)"],
              ["leadConfirm","Подтверждение создания заявки"],
              ["leadPhone","Вопрос о номере для связи, если входящий номер недоступен"],
              ["leadPhoneConfirm","Подтверждение указанного номера"],
              ["leadSuccess","Ответ после успешного сохранения заявки"],
              ["leadFailure","Ответ при ошибке сохранения заявки"],
              ["leadDeclined","Ответ при отказе от заявки"],
              ["conversationRules","Правила разговора"],
              ["responseRules","Правила каждого ответа"],
              ["knowledgeResponseRules","Стиль консультации по базе знаний (если заполнено, заменяет автоматическое перечисление позиций)"],
              ["knowledgePriceNotFoundResponse","Ответ, когда цена площадки не найдена"],
              ["knowledgeFrequencyMismatchResponse","Ответ при другой частоте размещения: {{requestedFrequency}}, {{availableFrequency}}"],
              ["fileSearchRules","Поиск по базе Яндекса"],
              ["knownNumber","Если известен входящий номер"],
              ["retryResponse","Повтор ответа при зависании"],
              ["salesValueResponse","Ответ на возражение о цене"],
              ["salesNextStepKnownCity","Следующий шаг, если город известен (переменная {{city}})"],
              ["salesNextStepUnknownCity","Следующий шаг, если город неизвестен"],
            ].map(([key,label])=><label key={key} className="block text-sm font-medium">{label}<textarea className="mt-1 min-h-24 w-full rounded border bg-white p-2 font-normal" value={runtimePrompts[key]||""} placeholder="Пусто — используется безопасное значение по умолчанию" onChange={event=>setRuntimePrompts({...runtimePrompts,[key]:event.target.value})}/></label>)}
            <label className="block text-sm font-medium">Максимум токенов ответа<input type="number" min="64" max="1024" className="mt-1 w-full rounded border bg-white p-2 font-normal" value={runtimePrompts.maxOutputTokens||240} onChange={event=>setRuntimePrompts({...runtimePrompts,maxOutputTokens:Number(event.target.value)})}/></label>
          </div>
        </details>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          disabled={!canManage || saving}
          onClick={() => void savePublishAndApply()}
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {saving ? "Сохраняем…" : `Сохранить и применить${bindingId ? " к 205" : ""}`}
        </button>
        {expertMode && (
          <details className="w-full rounded border p-2 text-sm">
            <summary className="cursor-pointer text-slate-600">Техническая диагностика</summary>
            <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() =>
                void post(
                  `/api/ai-platform/agents/${agentId}/voice-settings/preview`,
                  body,
                )
                  .then(setPreview)
                  .then(() =>
                    setMessage(
                      "Проверка готова; опубликованная версия не изменена",
                    ),
                  )
                  .catch((e) => setMessage(e.message))
              }
              className="rounded border px-3 py-2 text-sm"
            >
              Проверить настройки
            </button>
            <button
              disabled={!published || !bindingId}
              onClick={() => void previewBinding()}
              className="rounded border px-3 py-2 text-sm"
            >
              Проверить подключение 205
            </button>
            </div>
          </details>
        )}
      </div>
      {message && <p className="mt-2 text-sm">{message}</p>}
    </section>
  );
}
