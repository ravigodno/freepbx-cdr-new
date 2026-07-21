import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity as Waveform,
  AlertTriangle,
  Download,
  GitBranch,
  Headphones,
  PhoneCall,
  Search,
  ShieldAlert,
} from "lucide-react";

type Props = { token: string; initialQuery?: string };
type Tab =
  | "overview"
  | "timeline"
  | "channels"
  | "sip"
  | "quality"
  | "recording"
  | "logs"
  | "security"
  | "export";
const labels: Record<Tab, string> = {
  overview: "Обзор",
  timeline: "Timeline",
  channels: "Каналы",
  sip: "SIP",
  quality: "Качество",
  recording: "Запись",
  logs: "Логи",
  security: "Безопасность",
  export: "Экспорт",
};
const fmt = (value: any) =>
  value ? new Date(value).toLocaleString("ru-RU", { hour12: false }) : "—";
const duration = (seconds: any) =>
  `${String(Math.floor(Number(seconds || 0) / 60)).padStart(2, "0")}:${String(Number(seconds || 0) % 60).padStart(2, "0")}`;

export default function CallIntelligencePanel({
  token,
  initialQuery = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery),
    [period, setPeriod] = useState("7d"),
    [candidates, setCandidates] = useState<any[]>([]),
    [core, setCore] = useState<any>(null),
    [tab, setTab] = useState<Tab>("overview"),
    [lazy, setLazy] = useState<Record<string, any>>({}),
    [loading, setLoading] = useState(false),
    [lazyLoading, setLazyLoading] = useState(""),
    [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const controllers = useRef(new Map<string, AbortController>()),
    recordingUrlsRef = useRef<Record<string, string>>({}),
    activeId = useRef("");
  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      Object.values(recordingUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const range = () => {
    const days = period === "24h" ? 1 : period === "30d" ? 30 : 7,
      to = new Date(),
      from = new Date(to.getTime() - days * 86400000);
    return { from: from.toISOString(), to: to.toISOString() };
  };
  const request = async (key: string, path: string) => {
    controllers.current.get(key)?.abort();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || data.success === false)
      throw new Error(
        data.error?.message || data.error || `HTTP ${response.status}`,
      );
    return data.data;
  };
  const params = (id: string) =>
    new URLSearchParams({
      query: id,
      queryType: /^\d{9,12}\.\d+$/.test(id) ? "linkedid" : "auto",
      ...range(),
    });
  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setCore(null);
    setLazy({});
    try {
      const data = await request(
        "candidates",
        `/api/monitoring/call-intelligence/candidates?${new URLSearchParams({ query: query.trim(), queryType: "auto", ...range(), limit: "50" })}`,
      );
      setCandidates(data.candidates || []);
      if (data.candidates?.length === 1)
        await open(data.candidates[0].linkedid);
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const open = async (id: string) => {
    activeId.current = id;
    controllers.current.forEach((controller) => controller.abort());
    setLoading(true);
    setError("");
    setLazy({});
    try {
      const data = await request(
        "core",
        `/api/monitoring/call-intelligence/core?${params(id)}`,
      );
      if (activeId.current !== id) return;
      setCore(data);
      setCandidates([]);
      setTab("overview");
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const stored = localStorage.getItem("pbxpuls_call_intelligence_query");
    if (!stored) return;
    setQuery(stored);
    localStorage.removeItem("pbxpuls_call_intelligence_query");
    void open(stored);
  }, []);
  const loadTab = async (next: Tab) => {
    setTab(next);
    if (
      !core ||
      lazy[next] ||
      !["logs", "sip", "quality", "security"].includes(next)
    )
      return;
    setLazyLoading(next);
    try {
      const data = await request(
        next,
        `/api/monitoring/call-intelligence/${next}?${params(core.summary.id)}`,
      );
      setLazy((value) => ({ ...value, [next]: data }));
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLazyLoading("");
    }
  };
  const download = async () => {
    if (!core) return;
    const response = await fetch(
      `/api/monitoring/call-intelligence/export?${params(core.summary.id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return setError(`Экспорт: HTTP ${response.status}`);
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `pbxpuls-call-${core.summary.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const loadRecording = async (filename: string) => {
    if (recordingUrls[filename]) return;
    setLazyLoading("recording");
    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Запись недоступна: HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      recordingUrlsRef.current[filename] = url;
      setRecordingUrls((value) => ({ ...value, [filename]: url }));
    } catch (recordingError: any) {
      setError(recordingError.message || "Запись недоступна");
    } finally {
      setLazyLoading("");
    }
  };
  const quality = lazy.quality,
    qualitySummary = useMemo(() => {
      const rows = quality?.rows || [];
      const values = (key: string) =>
        rows.map((row: any) => Number(row[key])).filter(Number.isFinite);
      const jitter = values("jitter_ms"),
        loss = values("rtp_loss"),
        mos = values("mos"),
        rtt = values("sip_rtt_ms");
      return {
        jitter: jitter.length ? Math.max(...jitter) : null,
        loss: loss.length
          ? Number(
              (
                loss.reduce((a: number, b: number) => a + b, 0) / loss.length
              ).toFixed(2),
            )
          : null,
        mos: mos.length
          ? Number(
              (
                mos.reduce((a: number, b: number) => a + b, 0) / mos.length
              ).toFixed(2),
            )
          : null,
        rtt: rtt.length
          ? Math.round(
              rtt.reduce((a: number, b: number) => a + b, 0) / rtt.length,
            )
          : null,
      };
    }, [quality]);
  const s = core?.summary;
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5 text-indigo-500" />
          <div>
            <h2 className="font-black dark:text-white">
              Call Intelligence — карточка звонка
            </h2>
            <p className="text-xs text-slate-500">
              CDR, CEL, каналы, SIP, качество, записи и безопасность без
              повторного сбора данных
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_130px_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && search()}
              placeholder="Номер, Linkedid, Uniqueid, Call-ID или канал"
            />
          </label>
          <select
            className="input"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="24h">24 часа</option>
            <option value="7d">7 дней</option>
            <option value="30d">30 дней</option>
          </select>
          <button
            className="btn"
            disabled={loading || !query.trim()}
            onClick={search}
          >
            {loading ? "Поиск…" : "Найти"}
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}
      {candidates.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr>
                {[
                  "Начало",
                  "Направление",
                  "Откуда",
                  "Куда",
                  "Результат",
                  "Длительность",
                  "CDR",
                ].map((label) => (
                  <th
                    key={label}
                    className="p-3 text-[10px] uppercase text-slate-500"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((item) => (
                <tr
                  key={item.candidateId}
                  onClick={() => open(item.linkedid)}
                  className="cursor-pointer border-t hover:bg-indigo-50 dark:border-slate-800"
                >
                  <td className="p-3">{fmt(item.startedAt)}</td>
                  <td>{item.directionLabel}</td>
                  <td>{item.src || "—"}</td>
                  <td>{item.dst || "—"}</td>
                  <td>{item.disposition}</td>
                  <td>{duration(item.duration)}</td>
                  <td>{item.cdrCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading && !core && (
        <div className="rounded-xl border p-8 text-center text-sm text-slate-500">
          Загрузка основной карточки…
        </div>
      )}
      {core && (
        <>
          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Звонок
                </div>
                <h3 className="break-all text-xl font-black dark:text-white">
                  #{s.id}
                </h3>
                <div className="mt-1 text-xs text-slate-500">
                  {core.profile?.intelligenceMs || core.profile?.totalMs || 0}{" "}
                  мс · кэш {core.cache?.hit ? "да" : "нет"} ·{" "}
                  {s.state === "live" ? "Live" : "Завершён"}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                {s.disposition}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {[
                ["Направление", s.directionLabel],
                ["Источник", s.caller],
                ["Назначение", s.callee],
                ["Время", fmt(s.startedAt)],
                ["Длительность", duration(s.duration)],
                ["Запись", s.recordingAvailable ? "Есть" : "Отсутствует"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border p-3 dark:border-slate-700"
                >
                  <div className="text-[9px] font-bold uppercase text-slate-400">
                    {label}
                  </div>
                  <div className="mt-1 break-all text-xs font-black dark:text-white">
                    {value || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels) as Tab[]).map((item) => (
              <button
                key={item}
                onClick={() => loadTab(item)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold ${tab === item ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "bg-white text-slate-600 dark:bg-slate-900"}`}
              >
                {labels[item]}
              </button>
            ))}
          </div>
          {lazyLoading && (
            <div className="rounded-lg border p-3 text-xs text-slate-500">
              Загрузка: {labels[lazyLoading as Tab]}…
            </div>
          )}
          {tab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-black dark:text-white">Обзор</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  {[
                    ["Caller", s.caller],
                    ["Callee", s.callee],
                    ["DID", s.did],
                    ["Extension", s.extension],
                    ["Транк", s.trunk],
                    ["Очередь", s.queue],
                    ["Оператор", s.operator],
                    ["Linkedid", s.linkedid],
                    ["Uniqueid", s.uniqueid],
                    ["CDR / CEL", `${s.cdrCount} / ${s.celCount}`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded bg-slate-50 p-2 dark:bg-slate-800"
                    >
                      <dt className="text-slate-400">{label}</dt>
                      <dd className="break-all font-mono">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-black dark:text-white">Анализ</h3>
                <div className="mt-3 text-xs uppercase text-slate-400">
                  {core.diagnosis?.certainty || "данных недостаточно"}
                </div>
                <div className="mt-1 font-black dark:text-white">
                  {core.diagnosis?.title}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {core.diagnosis?.details}
                </p>
                <div className="mt-3 text-[10px] text-slate-400">
                  Основание: CDR disposition, CEL и подтверждённые события
                  трассировки.
                </div>
              </section>
            </div>
          )}
          {tab === "timeline" && (
            <section className="rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
              <h3 className="border-b p-4 font-black dark:border-slate-800 dark:text-white">
                Timeline ({core.timeline.length})
              </h3>
              <div className="max-h-[650px] space-y-2 overflow-auto p-4">
                {core.timeline.map((event: any) => (
                  <div
                    key={event.id}
                    className="rounded-lg border p-3 text-xs dark:border-slate-700"
                  >
                    <div className="flex justify-between gap-2">
                      <b>{event.title}</b>
                      <span className="font-mono text-[10px]">
                        {fmt(event.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-500">{event.description}</p>
                    <div className="mt-1 text-[9px] uppercase text-indigo-500">
                      {event.source} · {event.confidence} ·{" "}
                      {event.correlation?.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === "channels" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 font-black">
                <GitBranch className="h-4 w-4" />
                Граф каналов
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {core.graph.nodes.map((node: any) => (
                  <div
                    key={node.id}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs"
                  >
                    <div className="text-[9px] uppercase text-indigo-500">
                      {node.type}
                    </div>
                    <div className="font-mono">{node.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {core.graph.edges.map((edge: any) => (
                  <div key={edge.id}>
                    {edge.from} — {edge.type} → {edge.to} ({edge.confidence})
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === "sip" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-black">
                SIP · {lazy.sip?.engine || "PBXPuls SIP parser"}
              </h3>
              {lazy.sip?.available ? (
                <div className="mt-3 space-y-2">
                  {lazy.sip.events.map((event: any) => (
                    <div key={event.id} className="rounded border p-2 text-xs">
                      <b>{event.requestMethod || event.code}</b> · {event.srcIp}
                      :{event.srcPort} → {event.dstIp}:{event.dstPort}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Связанный SIP-диалог отсутствует в текущем ограниченном
                  capture-буфере.
                </p>
              )}
            </section>
          )}
          {tab === "quality" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 font-black">
                <Waveform className="h-4 w-4" />
                Качество · источник RTCP
              </h3>
              {quality?.available ? (
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    ["MOS", qualitySummary.mos],
                    [
                      "Jitter",
                      qualitySummary.jitter == null
                        ? null
                        : `${qualitySummary.jitter} мс`,
                    ],
                    [
                      "Loss",
                      qualitySummary.loss == null
                        ? null
                        : `${qualitySummary.loss}%`,
                    ],
                    [
                      "RTT",
                      qualitySummary.rtt == null
                        ? null
                        : `${qualitySummary.rtt} мс`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border p-3">
                      <div className="text-[10px] uppercase text-slate-400">
                        {label}
                      </div>
                      <b>{value ?? "Нет данных"}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Недостаточно данных. Причина: RTCP отсутствует для каналов
                  этого звонка.
                </p>
              )}
            </section>
          )}
          {tab === "recording" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 font-black">
                <Headphones className="h-4 w-4" />
                Запись разговора
              </h3>
              {core.recordings.length ? (
                core.recordings.map((record: any) => (
                  <div
                    key={record.uniqueid}
                    className="mt-3 rounded-lg border p-3"
                  >
                    <div className="text-xs font-mono">{record.filename}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {fmt(record.recordedAt)} · {duration(record.duration)} ·{" "}
                      {record.channel}
                    </div>
                    {recordingUrls[record.filename] ? (
                      <audio className="mt-2 w-full" controls preload="metadata" src={recordingUrls[record.filename]} />
                    ) : (
                      <button className="btn mt-2" onClick={() => loadRecording(record.filename)}>
                        Загрузить запись
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Запись отсутствует.
                </p>
              )}
            </section>
          )}
          {tab === "logs" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-black">Связанные логи</h3>
              {lazy.logs?.timeline?.length ? (
                <div className="mt-3 space-y-2">
                  {lazy.logs.timeline.map((event: any) => (
                    <div key={event.id} className="rounded border p-2 text-xs">
                      <b>{event.title}</b>
                      <div className="text-slate-500">{event.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Связанные строки журналов не найдены.
                </p>
              )}
            </section>
          )}
          {tab === "security" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 font-black">
                <ShieldAlert className="h-4 w-4" />
                Безопасность
              </h3>
              {lazy.security?.rows?.length ? (
                <div className="mt-3 space-y-2">
                  {lazy.security.rows.map((event: any) => (
                    <div
                      key={event.eventId}
                      className="rounded border p-2 text-xs"
                    >
                      {fmt(event.occurredAt)} · {event.title}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Связанных событий безопасности нет.
                </p>
              )}
            </section>
          )}
          {tab === "export" && (
            <section className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <button className="btn" onClick={download}>
                <Download className="h-4 w-4" />
                Экспорт диагностического JSON
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
