import { draftFingerprint, useUnsavedSource, useUnsavedChanges } from "../../settings/UnsavedChanges";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";

const sessionToken = () => {
  try { return JSON.parse(localStorage.getItem("asterisk_cdr_session") || "{}").token || ""; } catch { return ""; }
};
async function api(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${sessionToken()}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export default function BitrixPullEditor({ integration, onClose, onChanged }: { integration: any; onClose: () => void; onChanged: () => Promise<void> }) {
  const [sites, setSites] = useState<any[]>([]), [forms, setForms] = useState<any[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]), [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [tracking, setTracking] = useState(true), [interval, setIntervalValue] = useState(60);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const { requestNavigation } = useUnsavedChanges();
  const [savedDraft, setSavedDraft] = useState<any>(null);
  const draft = { selectedSites, selectedForms, tracking, interval };
  const visibleForms = useMemo(() => forms.filter(form => !form.siteIds?.length || form.siteIds.some((id: string) => selectedSites.includes(String(id)))), [forms, selectedSites]);
  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await api(`/api/site-forms/integrations/${integration.id}/pull-forms`);
      setSites(Array.isArray(data.sites) ? data.sites : []); setForms(Array.isArray(data.forms) ? data.forms : []);
      setSelectedSites((data.selectedSiteIds || []).map(String)); setSelectedForms((data.selectedFormIds || []).map(String));
      setTracking(data.trackingEnabled !== false); setIntervalValue(Number(data.syncIntervalSeconds || 60));
      setSavedDraft({ selectedSites: (data.selectedSiteIds || []).map(String), selectedForms: (data.selectedFormIds || []).map(String), tracking: data.trackingEnabled !== false, interval: Number(data.syncIntervalSeconds || 60) });
    } catch (e: any) { setError(e.message || "Не удалось загрузить настройки"); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [integration.id]);
  const toggleSite = (id: string, enabled: boolean) => {
    setSelectedSites(current => enabled ? [...new Set([...current, id])] : current.filter(value => value !== id));
    if (!enabled) setSelectedForms(current => current.filter(formId => { const form = forms.find(item => String(item.id) === formId); return !form?.siteIds?.length || form.siteIds.some((siteId: string) => siteId !== id && selectedSites.includes(String(siteId))); }));
  };
  const save = async () => {
    setSaving(true); setError("");
    try {
      await api(`/api/site-forms/integrations/${integration.id}/pull-settings`, { method: "PATCH", body: JSON.stringify({ siteIds: selectedSites, formIds: selectedForms, trackingEnabled: tracking, syncIntervalSeconds: interval }) });
      await api(`/api/site-forms/integrations/${integration.id}/sync`, { method: "POST", body: "{}" });
      setSavedDraft(draft);
      await onChanged();
      return true;
    } catch (e: any) { setError(e.message || "Не удалось сохранить настройки"); return false; } finally { setSaving(false); }
  };
  useUnsavedSource({ label: 'настройки Битрикс', dirty: !!savedDraft && draftFingerprint(draft) !== draftFingerprint(savedDraft), busy: saving, save,
    discard: () => { if (savedDraft) { setSelectedSites(savedDraft.selectedSites); setSelectedForms(savedDraft.selectedForms); setTracking(savedDraft.tracking); setIntervalValue(savedDraft.interval); } } });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5">
    <div className="flex items-start justify-between"><div><h2 className="text-lg font-black">Сайты и формы 1С-Битрикс</h2><p className="text-xs text-slate-500">{integration.name} · актуальные данные получены из Bitrix</p></div><button onClick={onClose}><X /></button></div>
    {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
    {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>Получение сайтов и форм…</div> : <div className="mt-5 space-y-5">
      <section><div className="mb-2 flex items-center justify-between"><b className="text-sm">Сайты Bitrix</b><button onClick={() => requestNavigation(() => void load())} className="flex items-center gap-1 text-xs font-bold text-violet-700"><RefreshCw className="h-3.5 w-3.5"/>Обновить из Bitrix</button></div><div className="grid gap-2 sm:grid-cols-3">{sites.map(site => { const id=String(site.id); return <label key={id} className="flex gap-2 rounded-xl border bg-slate-50 p-3 text-xs"><input type="checkbox" checked={selectedSites.includes(id)} onChange={e => toggleSite(id,e.target.checked)}/><span><b>{id} — {site.name || site.domain}</b><span className="mt-1 block text-slate-500">{site.domain || site.directory || "Сайт Bitrix"}</span></span></label>; })}</div></section>
      <section><div className="mb-2 flex items-center justify-between"><b className="text-sm">Формы выбранных сайтов</b><button onClick={() => setSelectedForms(visibleForms.filter(form => form.hasPhone).map(form => String(form.id)))} className="text-xs font-bold text-violet-700">Выбрать все с телефоном</button></div><div className="grid gap-2 sm:grid-cols-2">{visibleForms.map(form => <label key={form.id} className="flex gap-2 rounded-xl border p-3 text-xs"><input type="checkbox" disabled={!form.hasPhone} checked={selectedForms.includes(String(form.id))} onChange={e => setSelectedForms(current => e.target.checked ? [...new Set([...current,String(form.id)])] : current.filter(id => id !== String(form.id)))}/><span><b>{form.name}</b><span className="mt-1 block text-slate-500">ID {form.id} · сайты {(form.siteIds || []).join(", ") || "все"} · результатов {form.resultsCount} · {form.hasPhone ? "есть телефон" : "нет телефона"}</span></span></label>)}</div></section>
      <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs"><input type="checkbox" checked={tracking} onChange={e => setTracking(e.target.checked)}/><span><b>Собирать клики по телефонам</b><span className="mt-1 block text-slate-500">Tracker будет активен на выбранных сайтах.</span></span></label><label className="text-xs font-bold">Интервал синхронизации, секунд<input type="number" min={30} max={3600} value={interval} onChange={e => setIntervalValue(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border px-3 font-normal"/></label></div>
      <button disabled={saving || !selectedSites.length || !selectedForms.length} onClick={() => void save()} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? "Сохранение…" : "Сохранить и проверить синхронизацию"}</button>
    </div>}
  </div></div>;
}
