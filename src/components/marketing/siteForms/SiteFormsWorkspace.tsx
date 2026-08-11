import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import BitrixPullSetup from "./BitrixPullSetup";
import SiteFormsLeadTable from "./SiteFormsLeadTable";

type Tab = "leads" | "reports" | "integrations";
const statusLabels: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  call_scheduled: "Звонок запланирован",
  contact_attempted: "Попытка связи",
  contacted: "Связались",
  completed: "Обработана",
  rejected: "Отклонена",
  spam: "Спам",
  duplicate: "Дубль",
};
const token = () => {
  try {
    return (
      JSON.parse(localStorage.getItem("asterisk_cdr_session") || "{}").token ||
      ""
    );
  } catch {
    return "";
  }
};
const session = () => {
  try {
    return JSON.parse(localStorage.getItem("asterisk_cdr_session") || "{}");
  } catch {
    return {};
  }
};
const can = (key: string) => {
  const s = session();
  return s.role === "su" || s.permissions?.[key] === true;
};
async function api(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (copied) return true;
  } catch {}
  window.prompt("Скопируйте значение вручную:", value);
  return false;
}
const fmt = (v: any) =>
  v ? new Date(String(v).replace(" ", "T")).toLocaleString("ru-RU") : "—";
const pct = (v: any) =>
  `${Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

export default function SiteFormsWorkspace({
  initialTab = "leads",
  showNavigation = true,
}: { initialTab?: Tab; showNavigation?: boolean } = {}) {
  const emptyIntegrationForm = {
    name: "",
    provider: "bitrix_site",
    siteUrl: "",
    siteId: "s1",
    isEnabled: true,
    allowedIps: "",
    allowedFormIds: "",
    slaMinutes: 30,
    duplicateDetectionEnabled: true,
    duplicateWindowMinutes: 1440,
    callMatchWindowDays: 7,
    minimumAnsweredSeconds: 3,
  };
  const [tab, setTab] = useState<Tab>(initialTab),
    [items, setItems] = useState<any[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [details, setDetails] = useState<any>(null),
    [overview, setOverview] = useState<any>(null),
    [breakdown, setBreakdown] = useState<any[]>([]),
    [integrations, setIntegrations] = useState<any[]>([]),
    [webhookLog, setWebhookLog] = useState<any[]>([]),
    [showCreate, setShowCreate] = useState(false),
    [editingIntegrationId, setEditingIntegrationId] = useState(""),
    [oneTimeToken, setOneTimeToken] = useState(""),
    [updatingIntegrationId, setUpdatingIntegrationId] = useState("");
  const [form, setForm] = useState<any>(emptyIntegrationForm),
    [assignableUsers, setAssignableUsers] = useState<any[]>([]),
    [newComment, setNewComment] = useState("");
  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        limit: "25",
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
      }),
    [page, search, status],
  );
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "leads") {
        const d = await api(`/api/site-forms/leads?${query}`);
        setItems(d.items || []);
        setTotal(d.total || 0);
      } else if (tab === "reports") {
        const [o, b] = await Promise.all([
          api("/api/site-forms/reports/overview"),
          api("/api/site-forms/reports/breakdown?group=source"),
        ]);
        setOverview(o);
        setBreakdown(b.items || []);
      } else {
        const [d, l] = await Promise.all([
          api("/api/site-forms/integrations"),
          can("view_site_form_webhook_logs")
            ? api("/api/site-forms/webhook-log?limit=25")
            : Promise.resolve({ items: [] }),
        ]);
        setIntegrations(d.integrations || []);
        setWebhookLog(l.items || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [tab, query.toString()]);
  useEffect(() => {
    if (can("assign_site_form_leads"))
      void api("/api/site-forms/assignable-users")
        .then((data) => setAssignableUsers(data.users || []))
        .catch(() => setAssignableUsers([]));
  }, []);
  useEffect(() => {
    const leadId = new URLSearchParams(location.search).get("leadId");
    if (!leadId) return;
    setTab("leads");
    void api(`/api/site-forms/leads/${leadId}`)
      .then((data) => {
        setSelected(data.lead);
        setDetails(data);
      })
      .catch((e) => setError(e.message));
  }, []);
  const open = async (row: any) => {
    setSelected(row);
    try {
      setDetails(await api(`/api/site-forms/leads/${row.id}`));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const updateStatus = async (id: number, next: string) => {
    await api(`/api/site-forms/leads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    await load();
    if (selected?.id === id)
      setDetails(await api(`/api/site-forms/leads/${id}`));
  };
  const assign = async (id: number) => {
    const value = prompt(
      `ID ответственного пользователя\n${assignableUsers.map((user) => `${user.id}: ${user.fullName}${user.extension ? ` (${user.extension})` : ""}`).join("\n")}`,
    );
    if (value === null) return;
    await api(`/api/site-forms/leads/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ userId: value || null }),
    });
    setDetails(await api(`/api/site-forms/leads/${id}`));
    await load();
  };
  const addComment = async (id: number) => {
    const value = newComment.trim();
    if (!value) return;
    await api(`/api/site-forms/leads/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ comment: value }),
    });
    setNewComment("");
    setDetails(await api(`/api/site-forms/leads/${id}`));
  };
  const schedule = async (id: number) => {
    const value = prompt("Дата и время звонка, например 2026-08-03T17:00");
    if (!value) return;
    await api(`/api/site-forms/leads/${id}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ scheduledAt: value }),
    });
    setDetails(await api(`/api/site-forms/leads/${id}`));
    await load();
  };
  const manualLink = async (id: number) => {
    const linkedid = prompt("linkedid или uniqueid звонка");
    if (!linkedid) return;
    await api(`/api/site-forms/leads/${id}/calls/link`, {
      method: "POST",
      body: JSON.stringify({ linkedid }),
    });
    setDetails(await api(`/api/site-forms/leads/${id}`));
  };
  const unlink = async (leadId: number, callId: number) => {
    if (!confirm("Удалить неправильную связь со звонком?")) return;
    await api(`/api/site-forms/leads/${leadId}/calls/${callId}`, {
      method: "DELETE",
    });
    setDetails(await api(`/api/site-forms/leads/${leadId}`));
  };
  const call = async (row: any) => {
    await api(`/api/site-forms/leads/${row.id}/call`, {
      method: "POST",
      body: "{}",
    });
    await load();
  };
  const integrationPayload = () => ({
    ...form,
    allowedIps: String(form.allowedIps)
      .split(/[,\n]/)
      .map((x: string) => x.trim())
      .filter(Boolean),
    allowedFormIds: String(form.allowedFormIds)
      .split(/[,\n]/)
      .map((x: string) => x.trim())
      .filter(Boolean),
  });
  const openCreate = () => {
    setEditingIntegrationId("");
    setForm({ ...emptyIntegrationForm });
    setShowCreate(true);
  };
  const openEdit = (integration: any) => {
    setEditingIntegrationId(integration.id);
    setForm({
      ...integration,
      allowedIps: (integration.allowedIps || []).join(", "),
      allowedFormIds: (integration.allowedFormIds || []).join(", "),
    });
    setShowCreate(true);
  };
  const saveIntegration = async () => {
    setError("");
    try {
      if (editingIntegrationId) {
        await api(`/api/site-forms/integrations/${editingIntegrationId}`, {
          method: "PUT",
          body: JSON.stringify(integrationPayload()),
        });
      } else {
        const data = await api("/api/site-forms/integrations", {
          method: "POST",
          body: JSON.stringify(integrationPayload()),
        });
        setOneTimeToken(data.webhookToken);
      }
      setShowCreate(false);
      setEditingIntegrationId("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const toggleIntegration = async (integration: any) => {
    const next = !integration.isEnabled;
    setUpdatingIntegrationId(integration.id);
    setError("");
    setIntegrations((current) =>
      current.map((item) =>
        item.id === integration.id ? { ...item, isEnabled: next } : item,
      ),
    );
    try {
      await api(`/api/site-forms/integrations/${integration.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...integration, isEnabled: next }),
      });
      await load();
    } catch (e: any) {
      setIntegrations((current) =>
        current.map((item) =>
          item.id === integration.id
            ? { ...item, isEnabled: integration.isEnabled }
            : item,
        ),
      );
      setError(e.message);
    } finally {
      setUpdatingIntegrationId("");
    }
  };
  const rotate = async (id: string) => {
    if (
      !confirm("Перевыпустить webhook-токен? Старый токен перестанет работать.")
    )
      return;
    const d = await api(`/api/site-forms/integrations/${id}/rotate-token`, {
      method: "POST",
      body: "{}",
    });
    setOneTimeToken(d.webhookToken);
  };
  const testIntegration = async (id: string) => {
    const d = await api(`/api/site-forms/integrations/${id}/test`, {
      method: "POST",
      body: "{}",
    });
    alert(d.message);
  };
  const sendTestLead = async (id: string) => {
    const d = await api(`/api/site-forms/integrations/${id}/test-lead`, {
      method: "POST",
      body: "{}",
    });
    alert(`Тестовая заявка #${d.leadId} создана с признаком test`);
  };
  const deleteIntegration = async (integration: any) => {
    setError("");
    try {
      const preview = await api(`/api/site-forms/integrations/${integration.id}/delete-preview`, { method: "POST", body: "{}" });
      if (!confirm(`Удалить интеграцию «${preview.integration.name}»?\n\nОна будет отключена и скрыта. Заявки сохранятся: ${preview.leadCount}.`)) return;
      await api(`/api/site-forms/integrations/${integration.id}/delete-apply`, { method: "POST", body: JSON.stringify({ previewToken: preview.previewToken }) });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const download = async (format: "csv" | "xlsx") => {
    const response = await fetch(`/api/site-forms/export.${format}?${query}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!response.ok) throw new Error("Не удалось выгрузить отчёт");
    const url = URL.createObjectURL(await response.blob()),
      link = document.createElement("a");
    link.href = url;
    link.download = `site-form-leads.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const summary = overview?.summary || {},
    conversion = overview?.conversion || {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {showNavigation &&
          (
            [
              ["leads", "Заявки"],
              ["reports", "Отчёты"],
              ["integrations", "Интеграции"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-xl px-4 py-2 text-xs font-black ${tab === id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}
            >
              {label}
            </button>
          ))}
        <button
          onClick={() => void load()}
          className="ml-auto rounded-xl p-2 text-slate-500 hover:bg-slate-100"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {tab === "integrations" && <BitrixPullSetup onChanged={load} />}
      {oneTimeToken && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="font-black text-amber-900">
            Скопируйте токен сейчас — повторно он не показывается
          </div>
          <div className="mt-2 flex gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white p-2 text-xs">
              {oneTimeToken}
            </code>
            <button
              onClick={() => void copyText(oneTimeToken)}
              className="rounded-lg bg-amber-600 px-3 text-white"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button onClick={() => setOneTimeToken("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {tab === "leads" && (
        <>
          <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="ID, телефон, имя, email, компания, форма, страница"
                className="h-9 w-full rounded-xl border pl-9 pr-3 text-xs"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-xl border px-3 text-xs"
            >
              <option value="">Все статусы</option>
              {Object.entries(statusLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {can("export_site_form_leads") && (
              <>
                <button
                  onClick={() =>
                    void download("csv").catch((e) => setError(e.message))
                  }
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"
                >
                  CSV
                </button>
                <button
                  onClick={() =>
                    void download("xlsx").catch((e) => setError(e.message))
                  }
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white"
                >
                  XLSX
                </button>
              </>
            )}
          </div>
          <SiteFormsLeadTable
            items={items}
            loading={loading}
            canManage={can("manage_site_form_leads")}
            onOpen={(row) => void open(row)}
            onCall={(row) => void call(row)}
            onChanged={load}
            onError={setError}
          />
          <div className="hidden overflow-x-auto rounded-2xl border bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[1200px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {[
                    "Дата",
                    "Статус",
                    "SLA",
                    "Имя",
                    "Телефон",
                    "Форма",
                    "Сайт",
                    "Страница",
                    "UTM",
                    "Ответственный",
                    "Звонки",
                    "Последний результат",
                    "Первый звонок",
                    "Действия",
                  ].map((x) => (
                    <th key={x} className="px-3 py-2">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t hover:bg-blue-50/40 ${row.sla_status === "overdue" ? "bg-rose-50" : ""}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmt(row.created_at)}
                    </td>
                    <td className="px-3 py-2 font-bold">
                      {statusLabels[row.status] || row.status}
                    </td>
                    <td className="px-3 py-2">{row.sla_status}</td>
                    <td className="px-3 py-2 font-semibold">
                      {row.customer_name || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => void call(row)}
                        className="font-mono font-black text-blue-600"
                      >
                        {row.phone_raw}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {row.form_name || row.external_form_id}
                    </td>
                    <td className="px-3 py-2">{row.integration_name}</td>
                    <td
                      className="max-w-[180px] truncate px-3 py-2"
                      title={row.page_url}
                    >
                      {row.page_title || row.page_url || "—"}
                    </td>
                    <td className="px-3 py-2">{row.utm_source || "—"}</td>
                    <td className="px-3 py-2">{row.assigned_user_id || "—"}</td>
                    <td className="px-3 py-2 text-center font-black">
                      {row.call_count}
                    </td>
                    <td className="px-3 py-2">{row.last_call_result || "—"}</td>
                    <td className="px-3 py-2">
                      {row.first_call_at
                        ? `${Math.max(0, Math.round((new Date(row.first_call_at).getTime() - new Date(row.created_at).getTime()) / 60000))} мин`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => void call(row)}
                          title="Позвонить"
                          className="rounded-lg bg-emerald-100 p-2 text-emerald-700"
                        >
                          <Phone className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void open(row)}
                          className="rounded-lg bg-blue-100 px-3 font-bold text-blue-700"
                        >
                          Открыть
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && !loading && (
              <div className="p-10 text-center text-slate-500">
                Заявок пока нет
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Всего: {total}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Назад
              </button>
              <span className="py-1">{page}</span>
              <button
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Далее
              </button>
            </div>
          </div>
        </>
      )}
      {tab === "reports" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Всего заявок", summary.total],
              ["Уникальные заявители", summary.unique_applicants],
              ["Без звонка", summary.without_call],
              ["Просрочено SLA", summary.overdue],
              ["Конверсия в звонок", pct(conversion.attempt)],
              ["Успешный контакт", pct(conversion.contact)],
              ["Обработано", pct(conversion.completed)],
              ["В SLA", pct(conversion.sla)],
            ].map(([l, v]) => (
              <div
                key={String(l)}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="text-xs font-bold text-slate-500">{l}</div>
                <div className="mt-2 text-2xl font-black">{v ?? 0}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4">
              <h3 className="font-black">Воронка</h3>
              {Object.entries(overview?.funnel || {}).map(([k, v]) => (
                <div key={k} className="mt-3">
                  <div className="flex justify-between text-xs">
                    <span>{k}</span>
                    <b>{Number(v)}</b>
                  </div>
                  <div className="mt-1 h-2 rounded bg-slate-100">
                    <div
                      className="h-2 rounded bg-blue-600"
                      style={{
                        width: `${Math.min(100, (100 * Number(v)) / (Number(overview?.funnel?.received) || 1))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <h3 className="font-black">Источники</h3>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left">Источник</th>
                    <th>Заявки</th>
                    <th>Попытки</th>
                    <th>Контакты</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((r) => (
                    <tr key={r.group_key} className="border-t">
                      <td className="py-2">{r.group_key}</td>
                      <td className="text-center">{r.leads}</td>
                      <td className="text-center">{r.attempted}</td>
                      <td className="text-center">{r.contacted}</td>
                      <td className="text-center">{r.in_sla}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {tab === "integrations" && (
        <>
          <div className="flex justify-end">
            {can("manage_site_form_integrations") && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white"
              >
                <Plus className="h-4 w-4" />
                Добавить интеграцию
              </button>
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {integrations.map((i) => (
              <div
                key={i.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-black">{i.name}</h3>
                    <p className="text-xs text-slate-500">
                      {i.provider} · {i.siteUrl || i.siteId || "Сайт не указан"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={i.isEnabled}
                    disabled={updatingIntegrationId === i.id}
                    onClick={() => void toggleIntegration(i)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:cursor-wait disabled:opacity-50 ${i.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {updatingIntegrationId === i.id
                      ? "Сохранение…"
                      : i.isEnabled
                        ? "Включена"
                        : "Отключена"}
                  </button>
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-xs break-all">
                  {location.origin}
                  {i.webhookUrl}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    SLA: <b>{i.slaMinutes} мин</b>
                  </div>
                  <div>
                    Дубли: <b>{i.duplicateWindowMinutes} мин</b>
                  </div>
                  <div>
                    Успешно: <b>{fmt(i.lastSuccessAt)}</b>
                  </div>
                  <div>
                    Ошибка: <b>{fmt(i.lastErrorAt)}</b>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => openEdit(i)}
                    className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Изменить
                  </button>
                  <button
                    onClick={() =>
                      void copyText(`${location.origin}${i.webhookUrl}`)
                    }
                    className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    URL
                  </button>
                  <button
                    onClick={() => void testIntegration(i.id)}
                    className="rounded-lg border px-3 py-2 text-xs font-bold"
                  >
                    Проверить
                  </button>
                  <button
                    onClick={() => void sendTestLead(i.id)}
                    className="rounded-lg border px-3 py-2 text-xs font-bold"
                  >
                    Тестовая заявка
                  </button>
                  <button
                    onClick={() => void rotate(i.id)}
                    className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Токен
                  </button>
                  <button
                    onClick={() => void deleteIntegration(i)}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
          {can("view_site_form_webhook_logs") && (
            <div className="overflow-x-auto rounded-2xl border bg-white p-4">
              <h3 className="font-black">Последние webhook-запросы</h3>
              <table className="mt-3 w-full min-w-[800px] text-xs">
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Event ID</th>
                    <th>IP</th>
                    <th>HTTP</th>
                    <th>Статус</th>
                    <th>Заявка</th>
                    <th>Ошибка</th>
                    <th>мс</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookLog.map((r) => (
                    <tr key={r.id} className="border-t text-center">
                      <td className="py-2">{fmt(r.created_at)}</td>
                      <td>{r.event_id || "—"}</td>
                      <td>{r.request_ip || "—"}</td>
                      <td>{r.http_status}</td>
                      <td>{r.processing_status}</td>
                      <td>{r.lead_id || "—"}</td>
                      <td>{r.error_code || "—"}</td>
                      <td>{r.processing_time_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5">
            <div className="flex justify-between">
              <h2 className="text-lg font-black">
                {editingIntegrationId
                  ? "Изменить интеграцию"
                  : "Новая интеграция форм"}
              </h2>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setEditingIntegrationId("");
                }}
              >
                <X />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["name", "Название сайта"],
                ["siteUrl", "URL сайта"],
                ["siteId", "Site ID"],
                ["allowedIps", "Разрешённые IP через запятую"],
                ["allowedFormIds", "ID форм через запятую"],
                ["slaMinutes", "SLA, минут"],
                ["duplicateWindowMinutes", "Окно дублей, минут"],
                ["callMatchWindowDays", "Окно звонков, дней"],
                ["minimumAnsweredSeconds", "Минимальный разговор, секунд"],
              ].map(([k, l]) => (
                <label key={k} className="text-xs font-bold">
                  {l}
                  <input
                    type={
                      k.includes("Minutes") ||
                      k.includes("Days") ||
                      k.includes("Seconds")
                        ? "number"
                        : "text"
                    }
                    value={form[k] ?? ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
              ))}
              <label className="text-xs font-bold">
                Источник
                <select
                  value={form.provider}
                  onChange={(e) =>
                    setForm({ ...form, provider: e.target.value })
                  }
                  className="mt-1 h-9 w-full rounded-lg border px-3"
                >
                  <option value="bitrix_site">1С-Битрикс</option>
                  <option value="bitrix24">Битрикс24</option>
                  <option value="universal">Универсальный webhook</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end rounded-lg border px-3 py-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) =>
                    setForm({ ...form, isEnabled: e.target.checked })
                  }
                />
                Интеграция включена
              </label>
            </div>
            <button
              onClick={() => void saveIntegration()}
              className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white"
            >
              {editingIntegrationId
                ? "Сохранить изменения"
                : "Создать и получить токен"}
            </button>
            {editingIntegrationId && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Webhook-токен при сохранении не изменяется.
              </p>
            )}
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-black">Заявка #{selected.id}</h2>
                <p className="text-xs text-slate-500">
                  {selected.form_name || selected.external_form_id} ·{" "}
                  {fmt(selected.created_at)}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setDetails(null);
                }}
              >
                <X />
              </button>
            </div>
            {details && (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-500">Статус</div>
                    <b>{statusLabels[details.lead.status]}</b>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">SLA</div>
                    <b>{details.lead.sla_status}</b>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Ответственный</div>
                    <b>{details.lead.assigned_user_id || "Не назначен"}</b>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <h3 className="font-black">Контакт</h3>
                  <button
                    onClick={() => void call(details.lead)}
                    className="mt-2 text-lg font-black text-blue-600"
                  >
                    {details.lead.phone_raw}
                  </button>
                  <div>{details.lead.customer_name}</div>
                  <div>{details.lead.email}</div>
                  <div>{details.lead.company}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {details.lead.comment}
                  </p>
                </div>
                {details.formFields?.length > 0 && (
                  <div className="rounded-xl border bg-white p-4">
                    <h3 className="font-black">Все поля формы</h3>
                    <dl className="mt-3 divide-y">
                      {details.formFields.map((field: any) => (
                        <div
                          key={field.code}
                          className="grid gap-1 py-2 text-sm sm:grid-cols-[180px_1fr]"
                        >
                          <dt className="font-bold text-slate-500">
                            {field.code}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {field.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void call(details.lead)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white"
                  >
                    Позвонить
                  </button>
                  {can("assign_site_form_leads") && (
                    <button
                      onClick={() => void assign(details.lead.id)}
                      className="rounded-lg border px-3 py-2 text-xs font-bold"
                    >
                      Назначить
                    </button>
                  )}
                  <button
                    onClick={() => void schedule(details.lead.id)}
                    className="rounded-lg border px-3 py-2 text-xs font-bold"
                  >
                    Запланировать
                  </button>
                  {[
                    ["in_progress", "В работу"],
                    ["completed", "Обработано"],
                    ["rejected", "Отклонить"],
                    ["spam", "Спам"],
                    ["duplicate", "Дубль"],
                  ].map(([s, l]) => (
                    <button
                      key={s}
                      onClick={() => void updateStatus(details.lead.id, s)}
                      className="rounded-lg border px-3 py-2 text-xs font-bold"
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div>
                  <h3 className="font-black">Источник</h3>
                  <div className="mt-2 text-sm">
                    <a
                      className="text-blue-600"
                      href={details.lead.page_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {details.lead.page_title || details.lead.page_url}
                    </a>
                    <div>
                      {[
                        details.lead.utm_source,
                        details.lead.utm_medium,
                        details.lead.utm_campaign,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "UTM не указаны"}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-black">Связанные звонки</h3>
                  {details.calls.map((c: any) => (
                    <div
                      key={c.id}
                      className="mt-2 flex justify-between rounded-lg border p-3 text-xs"
                    >
                      <span>
                        {fmt(c.call_started_at)} · {c.call_direction} ·{" "}
                        {c.match_confidence}
                      </span>
                      <b>
                        {c.disposition} · {c.billsec} сек
                      </b>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="font-black">Хронология</h3>
                  {details.history.map((h: any) => (
                    <div
                      key={h.id}
                      className="mt-2 border-l-2 border-blue-200 pl-3 text-xs"
                    >
                      <b>{h.event_type}</b>
                      <div>
                        {fmt(h.created_at)} · {h.actor_label || "Система"}
                      </div>
                      <div>{h.new_value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
