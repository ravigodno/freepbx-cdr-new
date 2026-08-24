import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleHelp,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  token: string;
  canManage: boolean;
  canViewSms: boolean;
  canSend: boolean;
  canViewBalances: boolean;
  canManageBalances: boolean;
  canManageServices: boolean;
};
type Tab = "overview" | "sms" | "balance" | "ussd" | "settings";
const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const USSD_DIRECTORY = [
  {id:"mts",name:"МТС",source:"https://support.mts.ru/mts_mobilnaya_svyaz/balans-i-spisaniya/kak-proverit-balans",commands:[{code:"*100#",label:"Баланс"},{code:"*100*1#",label:"Остатки пакетов по тарифу"},{code:"*100*2#",label:"Остатки разовых пакетов"},{code:"*111*60#",label:"Текущие начисления"},{code:"*152*1#",label:"Расходы за сегодня"},{code:"*152*4#",label:"Последнее пополнение"},{code:"*376#",label:"Остаток интернет-пакета (корпоративные SIM)"},{code:"*100*3#",label:"Задолженность при кредитном методе"},{code:"*111#",label:"Меню самообслуживания"}]},
  {id:"beeline",name:"билайн",source:"https://chechnya.beeline.ru/customers/support/new-abonent/mobilnaya-svyaz/komandy/",commands:[{code:"*102#",label:"Баланс"},{code:"*110*10#",label:"Свой номер"},{code:"*110*05#",label:"Параметры тарифа"},{code:"*110*06#",label:"Остатки минут и SMS"},{code:"*110*09#",label:"Подключённые услуги"}]},
  {id:"megafon",name:"МегаФон",source:"https://ceph.megafon.ru/htdocs-pk-ceph/ai/tariff_attr_redef/e5aff498-aac8-44ee-92e0-48800f08b33c/9c894331-97c6-4a37-89db-693a6494722a/pdf/tariff_346_svr_a6761.pdf",commands:[{code:"*100#",label:"Баланс"},{code:"*558#",label:"Остатки пакетов"},{code:"*583#",label:"Подключённые платные услуги"},{code:"*105#",label:"Меню самообслуживания"}]},
  {id:"t2",name:"T2",source:"https://selfcare.t2.ru/help/article/ussd-commands",commands:[{code:"*105#",label:"Баланс и остатки"},{code:"*201#",label:"Свой номер"},{code:"*155*0#",label:"Остатки минут, ГБ и SMS"},{code:"*108#",label:"Параметры тарифа"},{code:"*153#",label:"Платные услуги"},{code:"*189#",label:"Платные подписки"}]},
  {id:"yota",name:"Yota",source:"https://www.yota.ru/support/mobile/uznat-nomer-i-balans",commands:[{code:"*101#",label:"Баланс и остатки по тарифу"},{code:"*103#",label:"Свой номер"}]},
] as const;
const quality = (
  value: number,
  max: number,
  color = "bg-emerald-500",
  display?: string,
) => (
  <div className="min-w-[90px]">
    <div className="mb-1 flex justify-between text-[10px]">
      <span>{display ?? value}</span>
      {display == null && <span>{max}</span>}
    </div>
    <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
      <div
        className={`h-full ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
      />
    </div>
  </div>
);
const MobileSignal = ({ value }: { value: number }) => {
  const count =
      value < 0 ? 0 : value < 10 ? 1 : value < 15 ? 2 : value < 20 ? 3 : 4,
    color =
      value >= 20
        ? "bg-emerald-500"
        : value >= 15
          ? "bg-amber-500"
          : "bg-red-500";
  return (
    <div className="flex min-w-[76px] items-end gap-2">
      <div className="flex h-5 items-end gap-0.5" title={`CSQ ${value}/31`}>
        {[6, 10, 14, 18].map((height, index) => (
          <span
            key={height}
            className={`w-1.5 rounded-sm ${index < count ? color : "bg-slate-200 dark:bg-slate-700"}`}
            style={{ height }}
          />
        ))}
      </div>
      <span className="font-mono text-[11px]">{value}/31</span>
    </div>
  );
};
const MiniGauge = ({
  value,
  max,
  display,
  stops,
  reverse = false,
}: {
  value: number;
  max: number;
  display: string;
  stops?: [number, number];
  reverse?: boolean;
}) => {
  const zones =
      stops ||
      (max === 7
        ? [2, 5]
        : max === 15
          ? [5, 10]
          : max === 100
            ? [30, 60]
            : reverse
              ? [30, 60]
              : [30, 57]),
    pct = Math.max(0, Math.min(1, value / max)),
    angle = -90 + pct * 180,
    a = Math.max(0, Math.min(100, (zones[0] / max) * 100)),
    b = Math.max(a, Math.min(100, (zones[1] / max) * 100)),
    colors = reverse
      ? ["#ef4444", "#f59e0b", "#10b981"]
      : ["#10b981", "#f59e0b", "#ef4444"],
    active = value <= zones[0] ? 0 : value <= zones[1] ? 1 : 2;
  return (
    <div className="w-[60px] text-center" title={display}>
      <svg viewBox="0 0 100 58" className="h-[34px] w-full">
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke={colors[0]}
          opacity={active === 0 ? 1 : 0.2}
          strokeWidth="9"
          pathLength="100"
          strokeDasharray={`${a} ${100 - a}`}
        />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke={colors[1]}
          opacity={active === 1 ? 1 : 0.2}
          strokeWidth="9"
          pathLength="100"
          strokeDasharray={`${b - a} ${100 - (b - a)}`}
          strokeDashoffset={`${-a}`}
        />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke={colors[2]}
          opacity={active === 2 ? 1 : 0.2}
          strokeWidth="9"
          pathLength="100"
          strokeDasharray={`${100 - b} ${b}`}
          strokeDashoffset={`${-b}`}
        />
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="16"
          stroke="#334155"
          strokeWidth="3.5"
          strokeLinecap="round"
          transform={`rotate(${angle} 50 50)`}
        />
        <circle cx="50" cy="50" r="4.5" fill="#334155" />
      </svg>
      <b className="-mt-0.5 block whitespace-nowrap font-mono text-sm leading-none">
        {display}
      </b>
    </div>
  );
};
const metricHints: Record<string, string> = {
  Сигнал:
    "Уровень GSM-сигнала CSQ: от 0 до 31. Чем выше значение, тем лучше связь.",
  BER: "Bit Error Rate — частота битовых ошибок радиоканала. Чем меньше значение, тем лучше.",
  "SIP latency":
    "Задержка ответа SIP endpoint в миллисекундах. Чем меньше, тем лучше.",
  PDD: "Post Dial Delay — время от завершения набора до появления сигнала вызова, в секундах. Чем меньше, тем лучше.",
  ACD: "Average Call Duration — средняя длительность успешного разговора, в секундах.",
  ASR: "Answer-Seizure Ratio — доля успешных соединений от общего числа попыток вызова, в процентах.",
};
const MetricHeader = ({ label }: { label: string }) => (
  <span
    className="inline-flex cursor-help items-center gap-1"
    title={metricHints[label]}
  >
    {label}
    <CircleHelp className="h-3.5 w-3.5 text-slate-400" />
  </span>
);
const balanceError = (code: string) =>
  code === "openvox_ussd_no_operator_response" ||
  code === "openvox_ussd_empty_response"
    ? "Оператор не вернул ответ"
    : code === "openvox_gsm_not_running"
      ? "GSM-модуль или SIM недоступны"
      : code === "openvox_balance_not_recognized"
        ? "Ответ получен, но баланс не распознан"
        : code === "openvox_timeout" || code === "openvox_ami_timeout"
          ? "Истекло время ожидания ответа"
          : code === "openvox_ami_credentials_required"
            ? "Укажите AMI логин и пароль в настройках"
            : code === "openvox_ami_auth_failed"
              ? "AMI отклонил логин или пароль"
              : code === "openvox_ami_connection_failed" ||
                  code === "openvox_ami_connection_closed"
                ? "Нет подключения к AMI"
                : "Не удалось проверить баланс";
const smsError = (code: string) =>
  code === "openvox_sms_auth_failed"
    ? "SMS API отклонил логин или пароль"
    : code === "openvox_sms_send_failed"
      ? "Шлюз не отправил SMS"
      : "Не удалось отправить SMS";
const ussdError = (code: string) =>
  code === "invalid_ussd_code"
    ? "Некорректный USSD-код"
    : code === "openvox_ussd_no_operator_response" || code === "openvox_ussd_empty_response"
      ? "Оператор не вернул ответ на USSD"
      : code === "openvox_gsm_not_running"
        ? "Выбранный GSM-порт недоступен"
        : balanceError(code);
const safeJson = (value: unknown) => {
  try { return JSON.parse(String(value || "{}")); } catch { return {}; }
};
const HistoryChart = ({data,lines}:{data:any[];lines:Array<{key:string;name:string;color:string}>}) => (
  <div className="h-48">
    {data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{fontSize:9}} minTickGap={35}/><YAxis tick={{fontSize:10}}/><Tooltip/><Legend/>{lines.map(line=><Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} connectNulls/>)}</LineChart></ResponsiveContainer>:<div className="flex h-full items-center justify-center text-sm text-slate-400">История начнёт накапливаться после обновлений</div>}
  </div>
);

export default function GsmGatewaysPage({
  token,
  canManage: canManageGateway,
  canViewSms,
  canSend,
  canViewBalances,
  canManageBalances,
  canManageServices,
}: Props) {
  const metricPanelRef = useRef<HTMLDivElement | null>(null);
  const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    [gateways, setGateways] = useState<any[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [status, setStatus] = useState<any>(null),
    [tab, setTab] = useState<Tab>("overview"),
    [box, setBox] = useState<"inbox" | "outbox">("inbox"),
    [smsHistory, setSmsHistory] = useState<any>(null),
    [balances, setBalances] = useState<any>(null),
    [metricHistory, setMetricHistory] = useState<any>(null),
    [selectedMetricPort, setSelectedMetricPort] = useState("gsm-1.1"),
    [balanceDays, setBalanceDays] = useState(30),
    [directoryOperator, setDirectoryOperator] = useState("mts"),
    [chartPort, setChartPort] = useState("gsm-1.1"),
    [page, setPage] = useState(1),
    [portFilter, setPortFilter] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [settings, setSettings] = useState<any>({
      name: "OpenVox VS-GWM400",
      baseUrl: "",
      username: "",
      password: "",
      boardCount: 2,
      timeoutMs: 8000,
      enabled: true,
    }),
    [balanceSettings, setBalanceSettings] = useState<any>({
      enabled: false,
      intervalMinutes: 60,
      codes: {},
      dataRefreshEnabled: false,
      dataRefreshSeconds: 30,
    }),
    [sms, setSms] = useState({ port: "gsm-1.1", destination: "", message: "" }),
    [ussd, setUssd] = useState({ port: "gsm-1.1", code: "", actionType: "check", presetName: "" }),
    [ussdPresets, setUssdPresets] = useState<any[]>([]),
    [ussdHistory, setUssdHistory] = useState<any[]>([]),
    [presetDraft, setPresetDraft] = useState({ id: 0, name: "", code: "", actionType: "check", description: "", enabled: true });
  const canManage =
    tab === "sms"
      ? canSend
      : tab === "ussd"
        ? canManageServices
      : tab === "balance"
        ? canManageBalances
        : canManageGateway;
  const request = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(url, {
        ...init,
        headers: { ...headers, ...(init.headers || {}) },
      }),
      d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.safeErrorCode || d.error || "request_failed");
    return d;
  };
  const load = async () => {
    setBusy("load");
    try {
      const d = await request("/api/gsm-gateways"),
        list = d.gateways || [];
      setGateways(list);
      const id = selected || list[0]?.id;
      if (id) {
        setSelected(id);
        const gateway = list.find((item: any) => item.id === id) || list[0];
        if (gateway)
          setSettings((old: any) => ({
            ...old,
            ...gateway,
            username: "",
            password: "",
          }));
        const nextStatus = await request(`/api/gsm-gateways/${id}/status`);
        setStatus(nextStatus);
        const metricPort = nextStatus.gsm?.some((port: any) => port.id === selectedMetricPort) ? selectedMetricPort : nextStatus.gsm?.[0]?.id;
        if (metricPort) {
          setSelectedMetricPort(metricPort);
          setMetricHistory(await request(`/api/gsm-gateways/${id}/metrics/${encodeURIComponent(metricPort)}`));
        }
        if (canViewBalances) {
          const nextBalances = await request(
            `/api/gsm-gateways/${id}/balances?days=${balanceDays}`,
          );
          setBalances(nextBalances);
          setBalanceSettings(nextBalances.settings);
        }
      }
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const loadSms = async (nextPage = page) => {
    if (!selected) return;
    setBusy("history");
    try {
      const q = new URLSearchParams({ page: String(nextPage) });
      if (portFilter) q.set("port", portFilter);
      if (search) q.set("search", search);
      setSmsHistory(
        await request(`/api/gsm-gateways/${selected}/sms/${box}?${q}`),
      );
      setPage(nextPage);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const loadUssd = async () => {
    if (!selected || !canManageServices) return;
    setBusy("ussd-history");
    try {
      const [presets, history] = await Promise.all([
        request(`/api/gsm-gateways/${selected}/ussd/presets`),
        request(`/api/gsm-gateways/${selected}/ussd/history`),
      ]);
      setUssdPresets(presets.items || []);
      setUssdHistory(history.items || []);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const loadBalances = async (days = balanceDays) => {
    if (!selected) return;
    setBusy("balances");
    try {
      const d = await request(
        `/api/gsm-gateways/${selected}/balances?days=${days}`,
      );
      setBalances(d);
      setBalanceSettings(d.settings);
      setBalanceDays(days);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const loadMetricHistory = async (port: string) => {
    if (!selected) return;
    setSelectedMetricPort(port);
    try {
      setMetricHistory(await request(`/api/gsm-gateways/${selected}/metrics/${encodeURIComponent(port)}`));
      window.setTimeout(() => metricPanelRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 0);
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (tab === "sms" && selected && canViewSms) void loadSms(1);
    if (tab === "balance" && selected && canViewBalances) void loadBalances();
    if (tab === "ussd" && selected && canManageServices) void loadUssd();
  }, [tab, box, selected]);
  const save = async (e: any) => {
    e.preventDefault();
    setBusy("save");
    try {
      const d = await request("/api/gsm-gateways/settings", {
        method: "PUT",
        body: JSON.stringify({ ...settings, id: selected }),
      });
      setMessage("Настройки сохранены");
      setSelected(d.id);
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const saveBalance = async () => {
    if (!selected) return;
    setBusy("balance-save");
    try {
      const d = await request(
        `/api/gsm-gateways/${selected}/balance-settings`,
        { method: "PUT", body: JSON.stringify(balanceSettings) },
      );
      setBalanceSettings(d.settings);
      setMessage("Настройки автообновления сохранены");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const refreshBalance = async (port: string) => {
    if (!selected) return;
    setBusy(`balance-${port}`);
    try {
      const saved = await request(
        `/api/gsm-gateways/${selected}/balance-settings`,
        { method: "PUT", body: JSON.stringify(balanceSettings) },
      );
      setBalanceSettings(saved.settings);
      await request(
        `/api/gsm-gateways/${selected}/balances/${encodeURIComponent(port)}/refresh`,
        {
          method: "POST",
          body: JSON.stringify({ code: balanceSettings.codes?.[port] }),
        },
      );
      setMessage(`Баланс ${port} обновлён, USSD-код сохранён`);
      await loadBalances();
    } catch (e: any) {
      setMessage(balanceError(e.message));
      await loadBalances();
    } finally {
      setBusy("");
    }
  };
  const testAmi = async () => {
    if (!selected) return;
    setBusy("ami-test");
    try {
      await request(`/api/gsm-gateways/${selected}/ami/test`, {
        method: "POST",
      });
      setMessage("Подключение AMI работает");
    } catch (e: any) {
      setMessage(balanceError(e.message));
    } finally {
      setBusy("");
    }
  };
  const makePreview = async () => {
    if (!selected) return;
    setBusy("sms");
    try {
      const d = await request(`/api/gsm-gateways/${selected}/sms/preview`, {
        method: "POST",
        body: JSON.stringify(sms),
      });
      setPreview(d.preview);
      setMessage("Preview подготовлен");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const makeUssdPreview = async () => {
    if (!selected) return;
    setBusy("ussd-preview");
    try {
      const d = await request(`/api/gsm-gateways/${selected}/ussd/preview`, {
        method: "POST",
        body: JSON.stringify(ussd),
      });
      setPreview(d.preview);
      setMessage("USSD Preview подготовлен — проверьте команду перед выполнением");
    } catch (e: any) {
      setMessage(ussdError(e.message));
    } finally {
      setBusy("");
    }
  };
  const saveUssdPreset = async () => {
    if (!selected) return;
    setBusy("ussd-preset");
    try {
      const d = await request(`/api/gsm-gateways/${selected}/ussd/presets`, {
        method: "PUT",
        body: JSON.stringify(presetDraft),
      });
      setUssdPresets(d.items || []);
      setPresetDraft({ id: 0, name: "", code: "", actionType: "check", description: "", enabled: true });
      setMessage("Шаблон USSD сохранён");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  const apply = async () => {
    if (!preview?.previewId) return;
    setBusy("apply");
    try {
      await request(`/api/gsm-gateways/operations/${preview.previewId}/apply`, {
        method: "POST",
      });
      setMessage(preview.type === "ussd" ? "USSD выполнен" : "SMS отправлено");
      setPreview(null);
      if (preview.type === "ussd") await loadUssd(); else await loadSms(1);
    } catch (e: any) {
      setMessage(preview.type === "ussd" ? ussdError(e.message) : smsError(e.message));
    } finally {
      setBusy("");
    }
  };
  const refresh = () =>
    tab === "sms" ? loadSms() : tab === "balance" ? loadBalances() : tab === "ussd" ? loadUssd() : load();
  useEffect(() => {
    if (!balanceSettings.dataRefreshEnabled || tab === "settings") return;
    const interval = window.setInterval(() => {
      if (!busy) void refresh();
    }, Math.max(10, Number(balanceSettings.dataRefreshSeconds) || 30) * 1000);
    return () => window.clearInterval(interval);
  }, [balanceSettings.dataRefreshEnabled, balanceSettings.dataRefreshSeconds, tab, selected, box, page, portFilter, search, busy]);
  const chartColors = [
      "#2563eb",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#ec4899",
      "#64748b",
    ],
    balanceChartData = (balances?.history || []).map((row: any) => ({
      label: new Date(row.measuredAt).toLocaleString("ru-RU"),
      [row.port]: row.balance,
    })),
    metricChartData = (metricHistory?.items || []).map((row: any) => ({...row,label:new Date(row.measuredAt).toLocaleString("ru-RU")})),
    metricBalanceData = (metricHistory?.balances || []).map((row: any) => ({...row,label:new Date(row.measuredAt).toLocaleString("ru-RU")})),
    selectedMetricSim = status?.gsm?.find((port:any)=>port.id===selectedMetricPort),
    selectedDirectory = USSD_DIRECTORY.find(operator=>operator.id===directoryOperator) || USSD_DIRECTORY[0];
  return (
    <section className="gsm-gateways-page space-y-5">
      <style>{`.gsm-gateways-page table th,.gsm-gateways-page table td{text-align:center;vertical-align:middle}.gsm-gateways-page table td>div{margin-left:auto;margin-right:auto}.gsm-gateways-page table td .flex{justify-content:center}`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">GSM-шлюзы</h2>
          <p className="text-xs text-slate-500">
            OpenVox: GSM, SIP endpoints, баланс SIM и SMS
          </p>
        </div>
        <button
          className="btn"
          disabled={!!busy || !selected}
          onClick={() => void refresh()}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {message}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto border-b dark:border-slate-700">
        {(
          [
            ["overview", "Обзор", true],
            ["sms", "SMS", canViewSms],
            ["balance", "Баланс", canViewBalances],
            ["ussd", "USSD / Услуги", canManageServices],
            ["settings", "Настройки", canManageGateway || canManageBalances],
          ] as const
        )
          .filter(([, , visible]) => visible)
          .map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap px-4 py-3 text-sm font-bold ${tab === id ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
      </div>
      {tab === "balance" && status && (
        <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-black">Баланс всех SIM</h3>
              <p className="text-xs text-slate-500">
                Все порты на одном графике
              </p>
            </div>
            <select
              className={input}
              value={balanceDays}
              onChange={(e) => void loadBalances(Number(e.target.value))}
            >
              {[7, 30, 90].map((days) => (
                <option key={days} value={days}>
                  {days} дней
                </option>
              ))}
            </select>
          </div>
          <div className="h-72">
            {balanceChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={balanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  {status.gsm.map((p: any, index: number) => (
                    <Line
                      key={p.id}
                      type="monotone"
                      dataKey={p.id}
                      name={`${p.id} · ${p.number || "без номера"}`}
                      stroke={chartColors[index % chartColors.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Для графика нужны успешные измерения
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "overview" && status && (
        <>
          <div ref={metricPanelRef} className="scroll-mt-4 rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4"><h3 className="font-black">История за 30 дней · {selectedMetricPort}{selectedMetricSim?.number?` · ${selectedMetricSim.number}`:""}</h3><p className="text-xs text-slate-500">Выберите SIM кликом по строке таблицы. Замеры сохраняются не чаще одного раза в 5 минут.</p></div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border p-3 dark:border-slate-700"><h4 className="mb-2 text-xs font-bold">Радиоканал</h4><HistoryChart data={metricChartData} lines={[{key:"signal",name:"Сигнал CSQ",color:"#10b981"},{key:"ber",name:"BER",color:"#ef4444"}]}/></div>
              <div className="rounded-xl border p-3 dark:border-slate-700"><h4 className="mb-2 text-xs font-bold">SIP latency</h4><HistoryChart data={metricChartData} lines={[{key:"sipLatencyMs",name:"Latency, мс",color:"#2563eb"}]}/></div>
              <div className="rounded-xl border p-3 dark:border-slate-700"><h4 className="mb-2 text-xs font-bold">Качество вызовов</h4><HistoryChart data={metricChartData} lines={[{key:"pdd",name:"PDD, с",color:"#f59e0b"},{key:"acd",name:"ACD, с",color:"#8b5cf6"},{key:"asr",name:"ASR, %",color:"#06b6d4"}]}/></div>
              <div className="rounded-xl border p-3 dark:border-slate-700"><h4 className="mb-2 text-xs font-bold">Баланс</h4><HistoryChart data={metricBalanceData} lines={[{key:"balance",name:"Баланс",color:"#ec4899"}]}/></div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {[
                    "Порт / SIM",
                    "Баланс сейчас",
                    "SIP endpoint",
                    "GSM",
                    "Сигнал",
                    "BER",
                    "SIP latency",
                    "PDD",
                    "ACD",
                    "ASR",
                    "Маршруты",
                  ].map((x) => (
                    <th className="p-3" key={x}>
                      {metricHints[x] ? <MetricHeader label={x} /> : x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.gsm.map((p: any) => {
                  const hasCallMetrics =
                      Number(p.pdd) > 0 ||
                      Number(p.acd) > 0 ||
                      Number(p.asr) > 0,
                    currentBalance = balances?.currentItems?.find(
                      (row: any) => row.port === p.id,
                    );
                  return (
                    <tr
                      className={`cursor-pointer border-t align-top transition hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-700/50 ${selectedMetricPort===p.id?"bg-blue-50 ring-1 ring-inset ring-blue-300 dark:bg-slate-700/60":""}`}
                      key={p.id}
                      onClick={() => void loadMetricHistory(p.id)}
                      tabIndex={0}
                      onKeyDown={(event) => { if(event.key==="Enter"||event.key===" "){event.preventDefault();void loadMetricHistory(p.id);} }}
                    >
                      <td className="p-3">
                        <b className="font-mono">{p.id}</b>
                        <div>{p.number || "Номер не определён"}</div>
                      </td>
                      <td className="whitespace-nowrap p-3">
                        <b className="text-sm">
                          {currentBalance?.balance != null
                            ? `${currentBalance.balance} ${currentBalance.currency || ""}`
                            : "—"}
                        </b>
                        {currentBalance?.measuredAt && (
                          <div className="text-[10px] text-slate-400">
                            {new Date(currentBalance.measuredAt).toLocaleString(
                              "ru-RU",
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {p.sipEndpoint ? (
                          <>
                            <b>{p.sipEndpoint.name}</b>
                            <div
                              className={
                                p.sipEndpoint.reachable
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }
                            >
                              {p.sipEndpoint.status}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        <div>{p.registration || "—"}</div>
                        <b>{p.state || "—"}</b>
                      </td>
                      <td className="p-3">
                        <MobileSignal value={Number(p.signal)} />
                      </td>
                      <td className="p-3">
                        <MiniGauge
                          value={Number(p.ber)}
                          max={7}
                          display={String(p.ber)}
                        />
                      </td>
                      <td className="p-3">
                        {p.sipEndpoint ? (
                          <MiniGauge
                            value={Number(p.sipEndpoint.latencyMs || 0)}
                            max={90}
                            display={`${p.sipEndpoint.latencyMs} ms`}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        {hasCallMetrics ? (
                          <MiniGauge
                            value={Number(p.pdd)}
                            max={15}
                            display={`${p.pdd} с`}
                          />
                        ) : (
                          <span className="text-slate-400">Нет данных</span>
                        )}
                      </td>
                      <td className="p-3">
                        {hasCallMetrics ? (
                          <MiniGauge
                            value={Number(p.acd)}
                            max={90}
                            display={`${p.acd} с`}
                            reverse
                          />
                        ) : (
                          <span className="text-slate-400">Нет данных</span>
                        )}
                      </td>
                      <td className="p-3">
                        {hasCallMetrics ? (
                          <MiniGauge
                            value={Number(p.asr)}
                            max={100}
                            display={`${p.asr}%`}
                            reverse
                          />
                        ) : (
                          <span className="text-slate-400">Нет данных</span>
                        )}
                      </td>
                      <td className="max-w-[260px] p-3">
                        {p.routeConflict && (
                          <div className="mb-1 flex gap-1 text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            Несовпадение номера
                          </div>
                        )}
                        {p.routes?.map((r: any) => (
                          <div
                            key={r.name}
                            className="mb-1 font-mono text-[10px]"
                          >
                            {r.from} → {r.to}
                          </div>
                        )) || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "sms" && status && (
        <>
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-3 flex gap-2 font-black">
                <Send className="h-4 w-4" />
                SMS Sender
              </h3>
              <div className="grid gap-2">
                <select
                  className={input}
                  value={sms.port}
                  onChange={(e) => setSms({ ...sms, port: e.target.value })}
                >
                  {status.gsm.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.number || "без номера"}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  placeholder="Номер получателя"
                  value={sms.destination}
                  onChange={(e) =>
                    setSms({ ...sms, destination: e.target.value })
                  }
                />
                <textarea
                  className={input}
                  rows={6}
                  placeholder="Текст сообщения"
                  value={sms.message}
                  onChange={(e) => setSms({ ...sms, message: e.target.value })}
                />
                <button
                  className="btn"
                  disabled={!canSend || !!busy}
                  onClick={() => void makePreview()}
                >
                  <MessageSquare className="h-4 w-4" />
                  Подготовить Preview
                </button>
              </div>
            </div>
            <div className="rounded-2xl border bg-white dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap gap-2 border-b p-3 dark:border-slate-700">
                <button
                  className={`btn ${box === "inbox" ? "bg-blue-600 text-white" : ""}`}
                  onClick={() => setBox("inbox")}
                >
                  Входящие
                </button>
                <button
                  className={`btn ${box === "outbox" ? "bg-blue-600 text-white" : ""}`}
                  onClick={() => setBox("outbox")}
                >
                  Исходящие
                </button>
                <select
                  className={input}
                  value={portFilter}
                  onChange={(e) => setPortFilter(e.target.value)}
                >
                  <option value="">Все порты</option>
                  {status.gsm.map((p: any) => (
                    <option key={p.id}>{p.id}</option>
                  ))}
                </select>
                <input
                  className={input}
                  placeholder="Поиск в сообщениях"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn" onClick={() => void loadSms(1)}>
                  Найти
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      {[
                        "Порт / SIM",
                        "Корреспондент",
                        "Время",
                        ...(box === "outbox" ? ["Статус"] : []),
                        "Сообщение",
                      ].map((x) => (
                        <th className="p-3" key={x}>
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {smsHistory?.items?.map((item: any, index: number) => (
                      <tr
                        className="border-t dark:border-slate-700"
                        key={`${item.time}-${index}`}
                      >
                        <td className="p-3 font-mono">
                          {item.port}
                          <div>
                            {status.gsm.find((p: any) => p.id === item.port)
                              ?.number || ""}
                          </div>
                        </td>
                        <td className="p-3">{item.phoneNumber}</td>
                        <td className="whitespace-nowrap p-3">{item.time}</td>
                        {box === "outbox" && (
                          <td className="p-3">{item.status}</td>
                        )}
                        <td className="max-w-lg whitespace-pre-wrap break-words p-3">
                          {item.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t p-3 text-xs dark:border-slate-700">
                <span>Всего: {smsHistory?.total || 0}</span>
                <div className="flex gap-2">
                  <button
                    className="btn"
                    disabled={page <= 1}
                    onClick={() => void loadSms(page - 1)}
                  >
                    Назад
                  </button>
                  <span className="p-2">
                    {page}/{smsHistory?.totalPages || 1}
                  </span>
                  <button
                    className="btn"
                    disabled={page >= (smsHistory?.totalPages || 1)}
                    onClick={() => void loadSms(page + 1)}
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {tab === "balance" && status && (
        <div className="space-y-4">
          <div className="hidden">
            <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black">История баланса</h3>
                  <p className="text-xs text-slate-500">
                    Изменения по выбранной SIM
                  </p>
                </div>
                <div className="flex gap-2">
                  <select
                    className={input}
                    value={chartPort}
                    onChange={(e) => setChartPort(e.target.value)}
                  >
                    {status.gsm.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.id} · {p.number || "без номера"}
                      </option>
                    ))}
                  </select>
                  <select
                    className={input}
                    value={balanceDays}
                    onChange={(e) => void loadBalances(Number(e.target.value))}
                  >
                    {[7, 30, 90].map((days) => (
                      <option key={days} value={days}>
                        {days} дней
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="h-64">
                {balances?.history?.filter((row: any) => row.port === chartPort)
                  .length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={balances.history
                        .filter((row: any) => row.port === chartPort)
                        .map((row: any) => ({
                          ...row,
                          label: new Date(row.measuredAt).toLocaleString(
                            "ru-RU",
                          ),
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        name="Баланс"
                        stroke="#2563eb"
                        fill="#93c5fd"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Для графика нужны успешные измерения
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex justify-between gap-3">
                <div>
                  <h3 className="font-black">Расходы и пополнения</h3>
                  <p className="text-xs text-slate-500">
                    Расход считается по уменьшению баланса между замерами
                  </p>
                </div>
                <div className="text-right text-xs">
                  <b className="block text-red-600">
                    Расход: {(balances?.summary?.expense || 0).toFixed(2)} RUB
                  </b>
                  <b className="block text-emerald-600">
                    Пополнения: {(balances?.summary?.topUp || 0).toFixed(2)} RUB
                  </b>
                </div>
              </div>
              <div className="h-64">
                {balances?.timeline?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={balances.timeline}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="expense" name="Расход" fill="#ef4444" />
                      <Bar dataKey="topUp" name="Пополнение" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Расход появится после двух замеров баланса
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {[
                    "Порт / SIM",
                    "USSD-код",
                    "Баланс",
                    "Ответ оператора",
                    "Обновлено",
                    "Действие",
                  ].map((x) => (
                    <th className="p-3" key={x}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.gsm.map((p: any) => {
                  const item = balances?.items?.find(
                    (row: any) => row.port === p.id,
                  );
                  return (
                    <tr className="border-t dark:border-slate-700" key={p.id}>
                      <td className="p-3">
                        <b className="font-mono">{p.id}</b>
                        <div>{p.number || "без номера"}</div>
                      </td>
                      <td className="p-3">
                        <input
                          className={`${input} w-28 font-mono`}
                          placeholder="*100#"
                          disabled={!canManage}
                          value={balanceSettings.codes?.[p.id] || ""}
                          onChange={(e) =>
                            setBalanceSettings({
                              ...balanceSettings,
                              codes: {
                                ...balanceSettings.codes,
                                [p.id]: e.target.value,
                              },
                            })
                          }
                        />
                      </td>
                      <td className="p-3 text-base font-black">
                        {item?.balance != null
                          ? `${item.balance} ${item.currency || ""}`
                          : "—"}
                      </td>
                      <td className="max-w-md p-3">
                        {item?.status === "failed" ? (
                          <span className="text-red-600">
                            {balanceError(item.safeErrorCode)}
                          </span>
                        ) : (
                          item?.response || "Ещё не проверялся"
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {item?.measuredAt
                          ? new Date(item.measuredAt).toLocaleString("ru-RU")
                          : "—"}
                      </td>
                      <td className="p-3">
                        <button
                          className="btn"
                          disabled={
                            !canManage ||
                            !!busy ||
                            !balanceSettings.codes?.[p.id]
                          }
                          onClick={() => void refreshBalance(p.id)}
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${busy === `balance-${p.id}` ? "animate-spin" : ""}`}
                          />
                          Проверить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "ussd" && canManageServices && status && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-black">Справочник USSD-команд</h3><p className="mt-1 text-xs text-slate-500">Информационные команды операторов. «Использовать» только подставляет код в форму ниже.</p></div>
              <select className={input} value={directoryOperator} onChange={(e)=>setDirectoryOperator(e.target.value)}>{USSD_DIRECTORY.map(operator=><option key={operator.id} value={operator.id}>{operator.name}</option>)}</select>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {selectedDirectory.commands.map(command=><div key={command.code} className="flex items-center justify-between gap-3 rounded-xl border p-3 dark:border-slate-700"><div className="text-left"><b className="block text-xs">{command.label}</b><code className="text-sm">{command.code}</code></div><button className="btn" onClick={()=>setUssd({...ussd,code:command.code,actionType:"check",presetName:`${selectedDirectory.name}: ${command.label}`})}>Использовать</button></div>)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500"><span>Перед выполнением PBXPuls всё равно покажет Preview.</span><a className="font-bold text-blue-600 hover:underline" href={selectedDirectory.source} target="_blank" rel="noreferrer">Официальный источник</a></div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h3 className="font-black">Выполнить USSD</h3>
              <p className="mt-1 text-xs text-slate-500">Команда будет выполнена только после проверки Preview и отдельного подтверждения.</p>
              <div className="mt-4 grid gap-3">
                <select className={input} value={ussd.port} onChange={(e) => setUssd({ ...ussd, port: e.target.value })}>
                  {status.gsm.map((p: any) => <option key={p.id} value={p.id}>{p.id} · {p.number || "без номера"}</option>)}
                </select>
                <select className={input} value="" onChange={(e) => { const preset=ussdPresets.find((item:any)=>String(item.id)===e.target.value);if(preset)setUssd({ ...ussd, code:preset.code, actionType:preset.actionType, presetName:preset.name }); }}>
                  <option value="">Выбрать сохранённый шаблон</option>
                  {ussdPresets.filter((item:any)=>item.enabled).map((item:any)=><option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
                </select>
                <input className={`${input} font-mono`} placeholder="Например, *100#" value={ussd.code} onChange={(e)=>setUssd({...ussd,code:e.target.value,presetName:""})}/>
                <select className={input} value={ussd.actionType} onChange={(e)=>setUssd({...ussd,actionType:e.target.value})}>
                  <option value="check">Проверка информации</option>
                  <option value="enable">Подключение услуги</option>
                  <option value="disable">Отключение услуги</option>
                </select>
                {ussd.actionType!=="check"&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-800">Команда может изменить услуги и тарификацию SIM. Сверьте код с оператором.</div>}
                <button className="btn" disabled={!!busy||!ussd.code} onClick={()=>void makeUssdPreview()}><MessageSquare className="h-4 w-4"/>Подготовить Preview</button>
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h3 className="font-black">Шаблоны услуг</h3>
              <div className="mt-4 grid gap-2">
                <input className={input} placeholder="Название шаблона" value={presetDraft.name} onChange={(e)=>setPresetDraft({...presetDraft,name:e.target.value})}/>
                <input className={`${input} font-mono`} placeholder="USSD-код" value={presetDraft.code} onChange={(e)=>setPresetDraft({...presetDraft,code:e.target.value})}/>
                <select className={input} value={presetDraft.actionType} onChange={(e)=>setPresetDraft({...presetDraft,actionType:e.target.value})}><option value="check">Проверка</option><option value="enable">Подключение</option><option value="disable">Отключение</option></select>
                <textarea className={input} rows={2} placeholder="Описание услуги" value={presetDraft.description} onChange={(e)=>setPresetDraft({...presetDraft,description:e.target.value})}/>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={presetDraft.enabled} onChange={(e)=>setPresetDraft({...presetDraft,enabled:e.target.checked})}/>Шаблон активен</label>
                <button className="btn" disabled={!!busy||!presetDraft.name||!presetDraft.code} onClick={()=>void saveUssdPreset()}>{presetDraft.id?"Обновить шаблон":"Сохранить шаблон"}</button>
              </div>
              <div className="mt-4 space-y-2">
                {ussdPresets.map((item:any)=><button key={item.id} className="w-full rounded-xl border p-3 text-left text-xs disabled:opacity-50" onClick={()=>setPresetDraft({id:item.id,name:item.name,code:item.code,actionType:item.actionType,description:item.description,enabled:item.enabled})}><b>{item.name}</b><code className="ml-2">{item.code}</code><span className="block text-slate-500">{item.description||"Без описания"}</span></button>)}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="p-4"><h3 className="font-black">История USSD</h3></div>
            <table className="w-full text-xs"><thead><tr>{["Дата","Порт","Команда","Тип","Статус","Цепочка ответа"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{ussdHistory.map((item:any)=>{const requestData=safeJson(item.preview_json),result=safeJson(item.result_json),kind=item.responseKind||result.responseKind;return <tr key={item.id} className="border-t align-top dark:border-slate-700"><td className="whitespace-nowrap p-3">{item.applied_at||item.created_at}</td><td className="p-3 font-mono">{requestData.port||"—"}</td><td className="p-3 font-mono">{requestData.code||"—"}</td><td className="p-3">{requestData.actionType||"check"}</td><td className="p-3"><span>{item.status}</span>{kind==="awaiting_sms"&&<span className="mt-1 block rounded-full bg-amber-100 px-2 py-1 text-center font-bold text-amber-800">{item.followups?.length?"SMS получено":"Ожидается SMS"}</span>}{kind==="interactive_menu"&&<span className="mt-1 block rounded-full bg-blue-100 px-2 py-1 text-center font-bold text-blue-800">Интерактивное меню</span>}</td><td className="max-w-xl p-3"><div>{result.response||item.safe_error_code||"—"}</div>{item.followups?.map((followup:any,index:number)=><div key={`${item.id}-${index}`} className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-900"><b className="block">Ответ по SMS · {followup.receivedAt||"время не указано"}</b><span>{followup.message}</span></div>)}{kind==="interactive_menu"&&<div className="mt-2 text-slate-500">Продолжение сессии не поддерживается документированным API этой модели. Используйте прямой код из справочника.</div>}</td></tr>})}</tbody></table>
          </div>
        </div>
      )}
      {tab === "settings" && canManageBalances && (
        <div className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="font-black">Автообновление</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4 dark:border-slate-700">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={balanceSettings.dataRefreshEnabled || false}
                  onChange={(e) => setBalanceSettings({ ...balanceSettings, dataRefreshEnabled: e.target.checked })}
                />
                <span>
                  <b>Обновлять данные активной вкладки</b>
                  <small className="block text-slate-500">Обзор, SMS и графики баланса обновляются без отправки USSD.</small>
                </span>
              </label>
              <label className="mt-3 block text-xs text-slate-500">
                Интервал, секунд
                <input
                  className={`${input} mt-1 w-full`}
                  type="number"
                  min={10}
                  max={3600}
                  value={balanceSettings.dataRefreshSeconds || 30}
                  onChange={(e) => setBalanceSettings({ ...balanceSettings, dataRefreshSeconds: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="rounded-xl border p-4 dark:border-slate-700">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={balanceSettings.enabled || false}
                  onChange={(e) => setBalanceSettings({ ...balanceSettings, enabled: e.target.checked })}
                />
                <span>
                  <b>Проверять баланс по USSD</b>
                  <small className="block text-slate-500">Шлюз выполняет сохранённые USSD-запросы по расписанию.</small>
                </span>
              </label>
              <label className="mt-3 block text-xs text-slate-500">
                Интервал, минут
                <input
                  className={`${input} mt-1 w-full`}
                  type="number"
                  min={5}
                  max={1440}
                  value={balanceSettings.intervalMinutes || 60}
                  onChange={(e) => setBalanceSettings({ ...balanceSettings, intervalMinutes: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn" disabled={!!busy} onClick={() => void saveBalance()}>Сохранить автообновление</button>
          </div>
        </div>
      )}
      {tab === "settings" && canManageGateway && (
        <form
          onSubmit={save}
          className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
        >
          <h3 className="mb-4 flex items-center gap-2 font-black">
            <Settings className="h-4 w-4" />
            Подключение OpenVox
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-500">
              Название
              <input
                className={`${input} mt-1 w-full`}
                value={settings.name}
                onChange={(e) =>
                  setSettings({ ...settings, name: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Адрес шлюза
              <input
                className={`${input} mt-1 w-full`}
                value={settings.baseUrl}
                onChange={(e) =>
                  setSettings({ ...settings, baseUrl: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Логин Web
              <input
                className={`${input} mt-1 w-full`}
                placeholder={
                  settings.usernameConfigured
                    ? "Сохранён — оставьте пустым"
                    : "Логин"
                }
                value={settings.username}
                onChange={(e) =>
                  setSettings({ ...settings, username: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Пароль Web
              <input
                className={`${input} mt-1 w-full`}
                type="password"
                placeholder={
                  settings.passwordConfigured
                    ? "Сохранён — оставьте пустым"
                    : "Пароль"
                }
                value={settings.password}
                onChange={(e) =>
                  setSettings({ ...settings, password: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Количество плат
              <input
                className={`${input} mt-1 w-full`}
                type="number"
                min={1}
                max={5}
                value={settings.boardCount}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    boardCount: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Таймаут Web, мс
              <input
                className={`${input} mt-1 w-full`}
                type="number"
                min={1000}
                max={30000}
                value={settings.timeoutMs}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    timeoutMs: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <h4 className="mb-3 mt-6 font-bold">Asterisk API / AMI</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-500">
              Manager name
              <input
                className={`${input} mt-1 w-full`}
                placeholder={
                  settings.amiUsernameConfigured
                    ? "Сохранён — оставьте пустым"
                    : "AMI логин"
                }
                value={settings.amiUsername || ""}
                onChange={(e) =>
                  setSettings({ ...settings, amiUsername: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Secret
              <input
                className={`${input} mt-1 w-full`}
                type="password"
                placeholder={
                  settings.amiSecretConfigured
                    ? "Сохранён — оставьте пустым"
                    : "AMI secret"
                }
                value={settings.amiSecret || ""}
                onChange={(e) =>
                  setSettings({ ...settings, amiSecret: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Порт
              <input
                className={`${input} mt-1 w-full`}
                type="number"
                min={1}
                max={65535}
                value={settings.amiPort || 5038}
                onChange={(e) =>
                  setSettings({ ...settings, amiPort: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enabled !== false}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
            />
            Шлюз включён
          </label>
          <div className="mt-4 flex gap-2">
            <button className="btn" disabled={!!busy}>
              Сохранить настройки
            </button>
            <button
              className="btn"
              type="button"
              disabled={
                !!busy ||
                !settings.amiUsernameConfigured ||
                !settings.amiSecretConfigured
              }
              onClick={() => void testAmi()}
            >
              Проверить AMI
            </button>
          </div>
        </form>
      )}
      {!gateways.length && tab !== "settings" && canManage && (
        <button className="btn" onClick={() => setTab("settings")}>
          Настроить шлюз
        </button>
      )}
      {preview && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-sm">
          <h3 className="font-black">{preview.type === "ussd" ? "Подтверждение USSD-команды" : "Подтверждение SMS"}</h3>
          {preview.type === "ussd" && preview.actionType !== "check" && <p className="mt-2 font-bold text-amber-800">Внимание: команда отмечена как изменение услуги. Проверьте порт и код перед выполнением.</p>}
          <pre className="my-3">{JSON.stringify(preview, null, 2)}</pre>
          <button
            className="btn"
            disabled={!canManage || !!busy}
            onClick={() => void apply()}
          >
            {preview.type === "ussd" ? "Подтвердить и выполнить" : "Подтвердить и отправить"}
          </button>
        </div>
      )}
    </section>
  );
}
