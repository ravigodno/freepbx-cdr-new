import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  Eye,
  Play,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";

type Props = { token?: string; onNavigate?: (mode: any) => void };
const methods = [
  "ALL",
  "INVITE",
  "REGISTER",
  "OPTIONS",
  "ACK",
  "BYE",
  "CANCEL",
  "REFER",
  "NOTIFY",
  "SUBSCRIBE",
  "INFO",
  "UPDATE",
  "PRACK",
];
const stateLabel: Record<string, string> = {
  "INVITE sent": "INVITE отправлен",
  Trying: "Trying",
  Ringing: "Ringing",
  Answered: "Answered",
  Cancelled: "Отменён",
  Rejected: "Отклонён",
  Failed: "Ошибка",
  Completed: "Завершён",
  Incomplete: "Неполный",
};

export default function SipDialogsTab({ token, onNavigate }: Props) {
  const [capabilities, setCapabilities] = useState<any>(null),
    [session, setSession] = useState<any>(null),
    [dialogs, setDialogs] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [messages, setMessages] = useState<any[]>([]),
    [raw, setRaw] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [iface, setIface] = useState("any"),
    [duration, setDuration] = useState(60),
    [host, setHost] = useState(""),
    [port, setPort] = useState(""),
    [search, setSearch] = useState(""),
    [method, setMethod] = useState("ALL");
  const controller = useRef<AbortController | null>(null);
  const request = useCallback(
    async (path: string, options: any = {}) => {
      const response = await fetch(path, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-PBXPuls-Monitoring-Permission": "view_sngrep",
          ...(options.headers || {}),
        },
        signal: options.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false)
        throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    },
    [token],
  );
  const load = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    try {
      const [caps, status, list] = await Promise.all([
        request("/api/diagnostics/sngrep/capabilities", { signal: c.signal }),
        request("/api/diagnostics/sngrep/session", { signal: c.signal }),
        request(
          `/api/diagnostics/sngrep/dialogs?limit=200&search=${encodeURIComponent(search)}&method=${encodeURIComponent(method)}`,
          { signal: c.signal },
        ),
      ]);
      setCapabilities(caps);
      setSession(status);
      setDialogs(list.dialogs || []);
      if (selected) {
        const updated = (list.dialogs || []).find(
          (item: any) => item.id === selected.id,
        );
        if (updated) setSelected(updated);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
    }
  }, [request, search, method, selected?.id]);
  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!session?.running) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 3000);
    return () => clearInterval(timer);
  }, [session?.running, load]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        mode: "sip",
        iface,
        duration: String(duration),
      });
      if (host) query.set("host", host);
      if (port) query.set("port", port);
      await request(`/api/diagnostics/tcpdump/start?${query}`, {
        method: "POST",
      });
      setSelected(null);
      setMessages([]);
      setRaw({});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await request("/api/diagnostics/tcpdump/stop?reason=user", {
        method: "POST",
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openDialog = async (dialog: any) => {
    setSelected(dialog);
    setMessages([]);
    try {
      const data = await request(
        `/api/diagnostics/sngrep/dialogs/${encodeURIComponent(dialog.id)}/messages?limit=200`,
      );
      setMessages(data.messages || []);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const openRaw = async (id: string) => {
    if (raw[id]) return;
    try {
      const data = await request(
        `/api/diagnostics/sngrep/messages/${encodeURIComponent(id)}/raw`,
      );
      setRaw((value) => ({ ...value, [id]: data.raw || "" }));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const exportPcap = async () => {
    const response = await fetch("/api/diagnostics/sngrep/session/pcap", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "pbxpuls-sip-capture.pcap";
    a.click();
    URL.revokeObjectURL(url);
  };
  const trace = () => {
    if (!selected?.callId) return;
    localStorage.setItem("pbxpuls_call_trace_query", selected.callId);
    window.dispatchEvent(
      new CustomEvent("pbxpuls:call-trace", {
        detail: { query: selected.callId },
      }),
    );
    onNavigate?.("log-analysis");
  };
  const intelligence = () => {
    if (!selected?.callId) return;
    localStorage.setItem("pbxpuls_call_intelligence_query", selected.callId);
    window.dispatchEvent(
      new CustomEvent("pbxpuls:call-intelligence", {
        detail: { query: selected.callId },
      }),
    );
    onNavigate?.("call-intelligence");
  };
  return (
    <div className="space-y-4 bg-slate-50/50 p-4 dark:bg-slate-950/30">
      <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-black dark:text-white">SIP-диалоги</h2>
            <p className="text-xs text-slate-500">
              Реальные SIP-сообщения из ограниченного PCAP-захвата
            </p>
          </div>
          <div className="rounded-lg border px-3 py-2 text-xs dark:border-slate-700">
            <b>Источник анализа:</b> PBXPuls SIP parser
            <div className="text-[10px] text-slate-500">
              SNGREP{" "}
              {capabilities?.installed
                ? "установлен; доступен для офлайн-просмотра PCAP"
                : "не установлен"}{" "}
              · структурированный CLI: нет
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Интерфейс
            <select
              className="input mt-1"
              value={iface}
              onChange={(e) => setIface(e.target.value)}
            >
              {(capabilities?.interfaces || ["any"]).map((item: string) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Длительность
            <select
              className="input mt-1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              <option value={15}>15 сек</option>
              <option value={30}>30 сек</option>
              <option value={60}>1 мин</option>
              <option value={180}>3 мин</option>
              <option value={300}>5 мин</option>
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Host
            <input
              className="input mt-1"
              placeholder="IPv4 / IPv6"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Порт
            <input
              className="input mt-1"
              inputMode="numeric"
              placeholder="5060 / 5160"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Метод
            <select
              className="input mt-1"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {methods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              className="btn border-emerald-300 text-emerald-700"
              disabled={busy || session?.running}
              onClick={start}
            >
              <Play className="h-4 w-4" />
              Запуск
            </button>
            <button
              className="btn border-red-300 text-red-600"
              disabled={busy || !session?.running}
              onClick={stop}
            >
              <Square className="h-4 w-4" />
              Стоп
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Статус", session?.status || "stopped"],
          ["Пакеты", session?.packetsRead || 0],
          ["SIP-сообщения", session?.sipMessagesParsed || 0],
          ["Диалоги", dialogs.length],
          ["PCAP", `${((session?.pcapSize || 0) / 1024).toFixed(1)} КБ`],
          ["Интерфейс", session?.interface || "—"],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-[10px] uppercase text-slate-400">{label}</div>
            <b className="text-sm dark:text-white">{value}</b>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Call-ID, номер, endpoint или IP"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="btn" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
        <button className="btn" disabled={!session?.file} onClick={exportPcap}>
          <Download className="h-4 w-4" />
          PCAP для Wireshark / SNGREP
        </button>
      </div>
      {!session?.startedAt ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
          Захват ещё не запускался.
        </div>
      ) : session?.running && !session?.packetsRead ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
          Захват идёт, пакетов пока нет.
        </div>
      ) : session?.packetsRead && !session?.sipMessagesParsed ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
          Пакеты обнаружены, но открытый SIP не распознан. TLS-содержимое
          зашифровано.
        </div>
      ) : !dialogs.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
          SIP-диалоги в текущем захвате не найдены.
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b p-3 text-xs font-black dark:border-slate-800">
            Диалоги
          </div>
          {dialogs.map((dialog) => (
            <button
              key={dialog.id}
              onClick={() => openDialog(dialog)}
              className={`block w-full border-b p-3 text-left text-xs dark:border-slate-800 ${selected?.id === dialog.id ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            >
              <div className="flex justify-between gap-2">
                <b>
                  {dialog.from} → {dialog.to}
                </b>
                <span>{stateLabel[dialog.state] || dialog.state}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
                {dialog.callId}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {dialog.messageCount} сообщений · retransmit{" "}
                {dialog.retransmissions}
              </div>
            </button>
          ))}
        </div>
        <div className="rounded-xl border bg-white xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 dark:border-slate-800">
            <b className="text-xs">
              SIP ladder {selected ? `· ${selected.callId}` : ""}
            </b>
            {selected && (
              <div className="flex gap-2">
                <button className="btn" onClick={intelligence}>
                  <ExternalLink className="h-3 w-3" />Карточка звонка
                </button>
                <button className="btn" onClick={trace}>
                  <ExternalLink className="h-3 w-3" />
                  Трассировка звонка
                </button>
                <button
                  className="btn"
                  onClick={() => onNavigate?.("log-analysis")}
                >
                  <ExternalLink className="h-3 w-3" />
                  Анализ логов
                </button>
              </div>
            )}
          </div>
          {!selected ? (
            <div className="p-10 text-center text-sm text-slate-400">
              Выберите диалог.
            </div>
          ) : (
            <div className="max-h-[620px] overflow-auto p-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="mb-2 rounded-lg border p-3 text-xs dark:border-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>{message.method}</b>
                    <span className="font-mono text-[10px]">
                      {message.srcIp}:{message.srcPort} → {message.dstIp}:
                      {message.dstPort}
                    </span>
                    <span>{message.time}</span>
                    <button className="btn" onClick={() => openRaw(message.id)}>
                      <Eye className="h-3 w-3" />
                      Raw
                    </button>
                  </div>
                  {message.cseq && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      CSeq {message.cseq}
                      {message.branch ? ` · branch ${message.branch}` : ""}
                    </div>
                  )}
                  {raw[message.id] && (
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-3 text-[10px] text-emerald-300">
                      {raw[message.id]}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
