import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, KeyRound, Plus, RefreshCw, Save, Search } from 'lucide-react';

export type MtsAutoSecretaryPanelTab = 'overview' | 'calls' | 'charges' | 'packages' | 'branches' | 'settings';
type Props = {
  token: string;
  canManage: boolean;
  canViewAnalytics: boolean;
  activeTab?: MtsAutoSecretaryPanelTab;
  showNavigation?: boolean;
};
type Settings = {
  enabled: boolean;
  apiBase: string;
  timeoutMs: number;
  profiles: Array<{
    id: string; branchName: string; pbxName: string; phone: string;
    active: boolean; sortOrder: number; apiKeyConfigured: boolean;
  }>;
};
type Call = {
  id: string;
  profileId: string;
  branchName: string;
  pbxName: string;
  direction: 'inbound' | 'outbound';
  startedAt: string | null;
  callerNumber: string | null;
  connectedNumber: string | null;
  durationSeconds: number;
  talkDurationSeconds: number;
  statusLabel: string;
  attempts: Array<{ number: string | null; result: number | string | null; resultLabel: string | null }>;
  journey: Array<{ code: string; label: string; number: string | null }>;
  outcomeCategory: 'connected' | 'no_connection' | 'technical_error' | 'routing' | 'unknown';
  recordingAvailable: boolean;
  match?: {
    confidence: 'exact' | 'likely' | 'conflict' | 'unmatched';
    amount: number | null;
    packageCounterUsed: number | null;
    packageUnit: string | null;
    explanation: string;
    mavAmount: number;
    markingAmount: number;
    totalAmount: number | null;
    mtsDurationSeconds: number | null;
    durationDifferenceSeconds: number | null;
    additionalCharges: Array<{
      type: 'mav' | 'marking'; operator: string; label: string; amount: number;
      taxAmount: number; occurredAt: string; ratedAt: string | null;
    }>;
  };
};

const initial: Settings = {
  enabled: false,
  apiBase: 'https://aa.mts.ru/api/v5',
  timeoutMs: 15000,
  profiles: []
};

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const duration = (seconds: number) => {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

export default function MtsAutoSecretaryPanel({
  token,
  canManage,
  canViewAnalytics,
  activeTab: controlledActiveTab,
  showNavigation = true
}: Props) {
  const [internalActiveTab, setInternalActiveTab] = useState<MtsAutoSecretaryPanelTab>('overview');
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const [settings, setSettings] = useState<Settings>(initial);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'exact' | 'likely' | 'non_billable' | 'technical' | 'missing_business' | 'conflict'>('all');
  const [calls, setCalls] = useState<Call[]>([]);
  const [matchSummary, setMatchSummary] = useState<{
    exact: number; likely: number; conflict: number; unmatched: number; matchedAmount: number; packageMinutesUsed: number;
    nonBillable: number; technicalErrors: number; missingBusinessRows: number;
    mavAmount: number; markingAmount: number;
  } | null>(null);
  const [branches, setBranches] = useState<Array<{
    profileId: string; branchName: string; pbxName: string; calls: number; exact: number; likely: number;
    unmatched: number; callAmount: number; mavAmount: number; markingAmount: number; packageMinutesUsed: number;
    operators: Record<string, { mavAmount: number; markingAmount: number; count: number }>;
  }>>([]);
  const [operators, setOperators] = useState<Array<{
    operator: string; mavAmount: number; markingAmount: number; linkedCount: number; unallocatedCount: number;
  }>>([]);
  const [unallocatedCharges, setUnallocatedCharges] = useState<Array<{
    id: number; type: 'mav' | 'marking'; operator: string; callerNumber: string | null;
    calleeNumber: string | null; amount: number; taxAmount: number; occurredAt: string; ratedAt: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [storedLoading, setStoredLoading] = useState(false);
  const [lastStoredSync, setLastStoredSync] = useState<string | null>(null);
  const [action, setAction] = useState<'save' | 'test' | 'preview' | null>(null);
  const [message, setMessage] = useState('');
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token]);
  const filteredCalls = useMemo(() => calls.filter(call => {
    if (resultFilter === 'all') return true;
    if (!call.match) return false;
    if (resultFilter === 'exact' || resultFilter === 'likely' || resultFilter === 'conflict') {
      return call.match.confidence === resultFilter;
    }
    if (resultFilter === 'non_billable') return call.match.explanation.startsWith('Не тарифицировался:');
    if (resultFilter === 'technical') return call.match.explanation.startsWith('Техническая ошибка');
    return call.match.explanation === 'Нет строки в MTS Business';
  }), [calls, resultFilter]);

  const matchStatus = (call: Call) => {
    if (!call.match) return '—';
    if (call.match.confidence === 'exact') return 'Точное';
    if (call.match.confidence === 'likely') return 'Вероятное';
    if (call.match.confidence === 'conflict') return 'Конфликт начислений';
    return call.match.explanation;
  };

  const load = async () => {
    if (!token || !canManage) return;
    setLoading(true);
    try {
      const response = await fetch('/api/balance/sources/mts-auto-secretary/settings', { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error('Настройки Автосекретаря недоступны');
      setSettings(data.settings);
    } catch (error: any) {
      setMessage(error.message || 'Настройки Автосекретаря недоступны');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token, canManage]);

  const request = async (mode: 'save' | 'test') => {
    setAction(mode);
    setMessage('');
    try {
      const response = await fetch(`/api/balance/sources/mts-auto-secretary/${mode === 'save' ? 'settings' : 'test'}`, {
        method: mode === 'save' ? 'PUT' : 'POST',
        headers,
        body: mode === 'save' ? JSON.stringify({
          ...settings,
          profiles: settings.profiles.map(profile => ({ ...profile, apiKey: apiKeys[profile.id] || '' }))
        }) : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || data.safeErrorCode || 'Операция не выполнена');
      if (mode === 'save') {
        setSettings(data.settings);
        setApiKeys({});
        setMessage('Настройки Автосекретаря сохранены');
      } else {
        setMessage(`Подключение работает${Number.isFinite(data.sampleCalls) ? ` · найдено в проверке: ${data.sampleCalls}` : ''}`);
      }
    } catch (error: any) {
      setMessage(error.message || 'Операция не выполнена');
    } finally {
      setAction(null);
    }
  };

  const preview = async () => {
    setAction('preview');
    setMessage('');
    try {
      const query = new URLSearchParams({ from: dateFrom, to: dateTo, direction });
      const response = await fetch(`/api/balance/sources/mts-auto-secretary/calls/preview?${query}`, { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || 'Не удалось загрузить звонки');
      setCalls(Array.isArray(data.calls) ? data.calls : []);
      setMatchSummary(null);
      setBranches([]);
      setOperators([]);
      setUnallocatedCharges([]);
      setMessage(`Получено логических звонков: ${Array.isArray(data.calls) ? data.calls.length : 0}`);
    } catch (error: any) {
      setMessage(error.message || 'Не удалось загрузить звонки');
    } finally {
      setAction(null);
    }
  };

  const matchPreview = async (directionOverride?: 'all' | 'inbound' | 'outbound') => {
    setAction('preview');
    setMessage('');
    try {
      const query = new URLSearchParams({ from: dateFrom, to: dateTo, direction: directionOverride || direction });
      const response = await fetch(`/api/balance/sources/mts-auto-secretary/matches/preview?${query}`, { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || 'Не удалось сопоставить звонки');
      setCalls(Array.isArray(data.calls) ? data.calls : []);
      setMatchSummary(data.summary || null);
      setBranches(Array.isArray(data.branches) ? data.branches : []);
      setOperators(Array.isArray(data.operators) ? data.operators : []);
      setUnallocatedCharges(Array.isArray(data.unallocatedAdditionalCharges) ? data.unallocatedAdditionalCharges : []);
      setLastStoredSync(data.syncedAt || new Date().toISOString());
      setMessage(`Сопоставление за ${data.date || `${dateFrom} — ${dateTo}`} · кандидатов MTS Business: ${Number(data.businessCandidates) || 0}`
        + (Number(data.businessDuplicateRows) > 0 ? ` · дублей объединено: ${Number(data.businessDuplicateRows)}` : ''));
    } catch (error: any) {
      setMessage(error.message || 'Не удалось сопоставить звонки');
    } finally {
      setAction(null);
    }
  };

  useEffect(() => {
    if (!token || !canViewAnalytics) return;
    const controller = new AbortController();
    const loadStored = async () => {
      setStoredLoading(true);
      try {
        const query = new URLSearchParams({ from: dateFrom, to: dateTo });
        const response = await fetch(`/api/balance/sources/mts-auto-secretary/reports/stored?${query}`, {
          headers, signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.safeMessage || 'Сохранённый отчёт недоступен');
        setCalls(Array.isArray(data.calls) ? data.calls : []);
        setMatchSummary(data.summary || null);
        setBranches(Array.isArray(data.branches) ? data.branches : []);
        setOperators(Array.isArray(data.operators) ? data.operators : []);
        setUnallocatedCharges(Array.isArray(data.unallocatedAdditionalCharges) ? data.unallocatedAdditionalCharges : []);
        setLastStoredSync(data.syncedAt || null);
      } catch (error: any) {
        if (error?.name !== 'AbortError') setMessage(error.message || 'Сохранённый отчёт недоступен');
      } finally {
        if (!controller.signal.aborted) setStoredLoading(false);
      }
    };
    void loadStored();
    return () => controller.abort();
  }, [token, canViewAnalytics, dateFrom, dateTo, headers]);

  if (!canManage && !canViewAnalytics) return null;
  const sectionCopy: Record<MtsAutoSecretaryPanelTab, { title: string; description: string; empty: string }> = {
    overview: {
      title: 'Обзор расходов и сопоставления',
      description: 'Сводные показатели связи, пакетов, МАВ и маркировки по филиалам',
      empty: 'Выберите период и сформируйте сводный отчёт.'
    },
    calls: {
      title: 'Звонки Автосекретаря',
      description: 'Чистый CDR со статусами, длительностью и сопоставлением с начислениями MTS Business',
      empty: 'Звонки за выбранный период ещё не загружены.'
    },
    charges: {
      title: 'МАВ и маркировка',
      description: 'Списания по операторам с привязкой к конкретным звонкам и отдельным списком операций без CDR',
      empty: 'Сформируйте отчёт, чтобы увидеть МАВ и маркировку по операторам.'
    },
    packages: {
      title: 'Расход пакетов минут',
      description: 'Использование включённых минут отдельно по каждому филиалу',
      empty: 'Сформируйте отчёт, чтобы рассчитать расход пакетов по филиалам.'
    },
    branches: {
      title: 'Филиалы',
      description: 'Привязка универсальных номеров Автосекретаря к отдельным АТС и городам',
      empty: 'Добавьте первый филиал.'
    },
    settings: {
      title: 'Настройки Автосекретаря',
      description: 'API-ключи филиалов и параметры подключения к МТС',
      empty: 'Настройки источника недоступны.'
    }
  };
  const currentSection = sectionCopy[activeTab];
  return (
    <section className="space-y-4 rounded-3xl border border-violet-200 bg-violet-50/30 p-5 text-xs dark:border-violet-900 dark:bg-violet-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black">
            <KeyRound className="h-4 w-4 text-violet-600" />{currentSection.title}
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">{currentSection.description}</p>
        </div>
        {canManage && (
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} />
            Включён
          </label>
        )}
      </div>

      {showNavigation && <div className="flex gap-1 overflow-x-auto rounded-2xl border border-violet-200 bg-white p-1 dark:border-violet-900 dark:bg-slate-950">
        {[
          ['overview', 'Обзор'], ['calls', 'Звонки'], ['charges', 'МАВ и маркировка'],
          ['packages', 'Пакеты'], ['branches', 'Филиалы'], ['settings', 'Настройки']
        ].filter(([id]) => canManage || !['branches', 'settings'].includes(id)).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setInternalActiveTab(id as MtsAutoSecretaryPanelTab)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-bold transition ${
              activeTab === id ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:bg-violet-50 dark:hover:bg-violet-950'
            }`}>{label}</button>
        ))}
      </div>}

      {canManage && ['branches', 'settings'].includes(activeTab) && (loading ? <div className="text-slate-500">Загрузка…</div> : (
        <div className="space-y-3">
          {activeTab === 'branches' && settings.profiles.map((profile, index) => (
            <div key={profile.id} className="rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-950">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-black">{profile.branchName || `Филиал ${index + 1}`}</div>
                <label className="flex items-center gap-2 font-bold">
                  <input type="checkbox" checked={profile.active} onChange={event => setSettings({
                    ...settings, profiles: settings.profiles.map(item => item.id === profile.id ? { ...item, active: event.target.checked } : item)
                  })} />Активен
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label>Филиал<input className="input mt-1 w-full" value={profile.branchName} onChange={event => setSettings({
                  ...settings, profiles: settings.profiles.map(item => item.id === profile.id ? { ...item, branchName: event.target.value } : item)
                })} /></label>
                <label>АТС<input className="input mt-1 w-full" value={profile.pbxName} onChange={event => setSettings({
                  ...settings, profiles: settings.profiles.map(item => item.id === profile.id ? { ...item, pbxName: event.target.value } : item)
                })} placeholder="Название АТС" /></label>
                <label>Универсальный номер<input className="input mt-1 w-full" value={profile.phone} onChange={event => setSettings({
                  ...settings, profiles: settings.profiles.map(item => item.id === profile.id ? { ...item, phone: event.target.value } : item)
                })} placeholder="10 цифр" /></label>
              </div>
            </div>
          ))}
          {activeTab === 'branches' && <div className="flex flex-wrap items-end justify-between gap-3">
            <button type="button" className="btn border border-violet-200 bg-white text-violet-700" onClick={() => {
              const id = `branch-${Date.now()}`;
              setSettings({ ...settings, profiles: [...settings.profiles, {
                id, branchName: 'Новый филиал', pbxName: '', phone: '', active: false,
                sortOrder: (settings.profiles.length + 1) * 10, apiKeyConfigured: false
              }] });
            }}><Plus className="h-4 w-4" />Добавить филиал</button>
          </div>}
          {activeTab === 'settings' && <div className="space-y-3">
            <div className="rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-950">
              <div className="mb-3 font-black">API МТС Автосекретаря по филиалам</div>
              <div className="grid gap-3 md:grid-cols-2">
                {settings.profiles.map((profile, index) => (
                  <label key={profile.id}>
                    {profile.branchName || `Филиал ${index + 1}`} · API-ключ
                    <input className="input mt-1 w-full" type="password" value={apiKeys[profile.id] || ''}
                      onChange={event => setApiKeys({ ...apiKeys, [profile.id]: event.target.value })}
                      placeholder={profile.apiKeyConfigured ? 'Сохранён · без изменения' : 'Введите Api-Key'}
                      autoComplete="new-password" />
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-950">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>Таймаут, мс<input className="input mt-1 block" type="number" min="1000" max="60000" value={settings.timeoutMs}
                  onChange={event => setSettings({ ...settings, timeoutMs: Number(event.target.value) })} /></label>
                <label>API endpoint<input className="input mt-1 block bg-slate-100" value={settings.apiBase} disabled /></label>
              </div>
            </div>
          </div>}
        </div>
      ))}

      {canManage && ['branches', 'settings'].includes(activeTab) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            Ключи сохраняются отдельно и зашифрованно для каждого филиала
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn border border-violet-200 bg-white text-violet-700" disabled={action !== null}
              onClick={() => void request('test')}>
              {action === 'test' && <RefreshCw className="h-4 w-4 animate-spin" />}Проверить
            </button>
            <button type="button" className="btn bg-violet-600 text-white" disabled={action !== null}
              onClick={() => void request('save')}>
              <Save className="h-4 w-4" />{action === 'save' ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {canViewAnalytics && !['branches', 'settings'].includes(activeTab) && (
        <div className="space-y-3 border-t border-violet-200 pt-4 dark:border-violet-900">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[11px] dark:bg-slate-900">
            <span className="font-bold text-slate-600 dark:text-slate-300">
              {storedLoading ? 'Загрузка сохранённых данных…' : 'Данные загружены из базы PBXPuls'}
            </span>
            <span className="text-slate-400">
              {lastStoredSync ? `Обновлено: ${new Date(lastStoredSync).toLocaleString('ru-RU')}` : 'Синхронизация ещё не выполнялась'}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label>С<input className="input mt-1 block" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
            <label>По<input className="input mt-1 block" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
            {activeTab === 'calls' && <label>Направление
              <select className="input mt-1 block" value={direction} onChange={event => setDirection(event.target.value as any)}>
                <option value="all">Все</option><option value="inbound">Входящие</option><option value="outbound">Исходящие</option>
              </select>
            </label>}
            {activeTab === 'calls' && <label>Результат
              <select className="input mt-1 block" value={resultFilter} onChange={event => setResultFilter(event.target.value as typeof resultFilter)}>
                <option value="all">Все результаты</option>
                <option value="exact">Точные</option><option value="likely">Вероятные</option>
                <option value="non_billable">Без тарификации</option><option value="technical">Технические ошибки</option>
                <option value="missing_business">Нет в MTS Business</option><option value="conflict">Конфликты</option>
              </select>
            </label>}
            <button type="button" className="btn border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
              onClick={() => {
                const end = today();
                const start = new Date(`${end}T00:00:00`);
                start.setDate(start.getDate() - 6);
                setDateFrom(start.toISOString().slice(0, 10)); setDateTo(end);
              }}>7 дней</button>
            <button type="button" className="btn border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
              onClick={() => {
                const end = today();
                setDateFrom(`${end.slice(0, 8)}01`); setDateTo(end);
              }}>Этот месяц</button>
            {activeTab === 'calls' && <button type="button" className="btn bg-slate-900 text-white dark:bg-white dark:text-slate-900" disabled={action !== null}
              onClick={() => void preview()}>
              {action === 'preview' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Загрузить CDR за период
            </button>}
            <button type="button" className="btn bg-violet-600 text-white" disabled={action !== null}
              onClick={() => void matchPreview(activeTab === 'calls' ? direction : 'all')}>
              {action === 'preview' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {activeTab === 'calls' ? 'Сопоставить с MTS Business' : 'Сформировать отчёт'}
            </button>
          </div>
          {((activeTab === 'overview' && !matchSummary)
            || (activeTab === 'calls' && calls.length === 0)
            || (activeTab === 'charges' && operators.length === 0 && unallocatedCharges.length === 0)
            || (activeTab === 'packages' && branches.length === 0)) && (
            <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 px-5 py-8 text-center text-slate-500 dark:border-violet-900 dark:bg-slate-950/50">
              <div className="font-bold text-slate-700 dark:text-slate-200">{currentSection.title}</div>
              <div className="mt-1 text-[11px]">{currentSection.empty}</div>
            </div>
          )}
          {activeTab === 'overview' && matchSummary && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-9">
              {[
                ['Точные', matchSummary.exact],
                ['Вероятные', matchSummary.likely],
                ['Конфликты', matchSummary.conflict],
                ['Не найдены', matchSummary.unmatched],
                ['Без тарификации', matchSummary.nonBillable],
                ['Технические', matchSummary.technicalErrors],
                ['Нет в Business', matchSummary.missingBusinessRows],
                ['МАВ', `${matchSummary.mavAmount.toLocaleString('ru-RU')} ₽`],
                ['Маркировка', `${matchSummary.markingAmount.toLocaleString('ru-RU')} ₽`],
                ['Сумма', `${matchSummary.matchedAmount.toLocaleString('ru-RU')} ₽`],
                ['Из пакета', `${matchSummary.packageMinutesUsed.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} мин`]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-white p-3 dark:bg-slate-900">
                  <div className="text-[10px] text-slate-400">{label}</div><div className="mt-1 font-black">{value}</div>
                </div>
              ))}
            </div>
          )}
          {['overview', 'packages'].includes(activeTab) && branches.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-violet-200 bg-white dark:border-violet-900 dark:bg-slate-950">
              <table className="w-full min-w-[900px] text-left text-[11px]">
                <thead><tr className="border-b border-slate-200 text-slate-400 dark:border-slate-800">
                  <th className="p-3">Филиал</th><th className="p-3">АТС</th><th className="p-3 text-right">Звонки</th>
                  <th className="p-3 text-right">Сопоставлено</th><th className="p-3 text-right">Минуты пакета</th>
                  <th className="p-3 text-right">Связь</th><th className="p-3 text-right">МАВ</th>
                  <th className="p-3 text-right">Маркировка</th><th className="p-3 text-right">Итого</th>
                </tr></thead>
                <tbody>{branches.map(branch => (
                  <React.Fragment key={branch.profileId}>
                  <tr className="border-b border-slate-100 last:border-0 dark:border-slate-900">
                    <td className="p-3 font-black">{branch.branchName}</td><td className="p-3">{branch.pbxName || '—'}</td>
                    <td className="p-3 text-right">{branch.calls}</td><td className="p-3 text-right">{branch.exact + branch.likely}</td>
                    <td className="p-3 text-right">{branch.packageMinutesUsed.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right">{branch.callAmount.toLocaleString('ru-RU')} ₽</td>
                    <td className="p-3 text-right">{branch.mavAmount.toLocaleString('ru-RU')} ₽</td>
                    <td className="p-3 text-right">{branch.markingAmount.toLocaleString('ru-RU')} ₽</td>
                    <td className="p-3 text-right font-black">{(branch.callAmount + branch.mavAmount + branch.markingAmount).toLocaleString('ru-RU')} ₽</td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-900 dark:bg-slate-900/40">
                    <td className="p-3 text-slate-400" colSpan={2}>По операторам</td>
                    <td className="p-3" colSpan={7}>
                      {Object.entries(branch.operators || {}).map(([operator, value]) => (
                        <span key={operator} className="mr-3 inline-block">
                          <b>{operator}</b>: МАВ {value.mavAmount.toLocaleString('ru-RU')} ₽ · маркировка {value.markingAmount.toLocaleString('ru-RU')} ₽
                        </span>
                      ))}
                    </td>
                  </tr>
                  </React.Fragment>
                ))}</tbody>
              </table>
            </div>
          )}
          {activeTab === 'charges' && operators.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {operators.map(operator => (
                <div key={operator.operator} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="font-black">{operator.operator}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div><span className="text-slate-400">МАВ</span><div className="font-bold">{operator.mavAmount.toLocaleString('ru-RU')} ₽</div></div>
                    <div><span className="text-slate-400">Маркировка</span><div className="font-bold">{operator.markingAmount.toLocaleString('ru-RU')} ₽</div></div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400">
                    Привязано: {operator.linkedCount} · без CDR: {operator.unallocatedCount}
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'charges' && unallocatedCharges.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10">
              <div className="p-3 font-black text-amber-800 dark:text-amber-300">
                Дополнительные списания без CDR Автосекретаря: {unallocatedCharges.length}
              </div>
              <table className="w-full min-w-[850px] text-left text-[11px]">
                <thead><tr className="border-y border-amber-200 text-slate-500 dark:border-amber-900">
                  <th className="p-3">Дата операции</th><th className="p-3">Дата тарификации</th>
                  <th className="p-3">Откуда</th><th className="p-3">Куда</th><th className="p-3">Услуга</th>
                  <th className="p-3">Оператор</th><th className="p-3 text-right">Сумма</th><th className="p-3 text-right">Налог</th>
                </tr></thead>
                <tbody>{unallocatedCharges.map(charge => (
                  <tr key={charge.id} className="border-b border-amber-100 last:border-0 dark:border-amber-950">
                    <td className="p-3">{new Date(charge.occurredAt).toLocaleString('ru-RU')}</td>
                    <td className="p-3">{charge.ratedAt ? new Date(charge.ratedAt).toLocaleString('ru-RU') : '—'}</td>
                    <td className="p-3 font-mono">{charge.callerNumber || '—'}</td>
                    <td className="p-3 font-mono">{charge.calleeNumber || '—'}</td>
                    <td className="p-3">{charge.type === 'mav' ? 'МАВ' : 'Маркировка'}</td>
                    <td className="p-3">{charge.operator}</td>
                    <td className="p-3 text-right">{charge.amount.toLocaleString('ru-RU')} ₽</td>
                    <td className="p-3 text-right">{charge.taxAmount.toLocaleString('ru-RU')} ₽</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {activeTab === 'calls' && calls.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="border-b border-slate-200 px-3 py-2 text-[10px] text-slate-400 dark:border-slate-800">
                Показано {filteredCalls.length.toLocaleString('ru-RU')} из {calls.length.toLocaleString('ru-RU')} звонков
              </div>
              <table className="w-full min-w-[1450px] text-left text-[11px]">
                <thead><tr className="border-b border-slate-200 text-slate-400 dark:border-slate-800">
                  <th className="p-3">Филиал</th><th className="p-3">Время</th><th className="p-3">Тип</th><th className="p-3">Откуда</th>
                  <th className="p-3">Соединён с</th><th className="p-3">Статус</th><th className="p-3 text-right">Разговор</th>
                  <th className="p-3 text-right">MTS, сек</th><th className="p-3 text-right">Разница</th>
                  <th className="p-3 text-right">Попытки</th><th className="p-3">MTS Business</th>
                  <th className="p-3">Пояснение</th><th className="p-3 text-right">Связь</th>
                  <th className="p-3 text-right">МАВ</th><th className="p-3 text-right">Маркировка</th>
                  <th className="p-3 text-right">Из пакета, мин</th><th className="p-3 text-center">Запись</th>
                </tr></thead>
                <tbody>{filteredCalls.map(call => (
                  <tr key={call.id} className="border-b border-slate-100 last:border-0 dark:border-slate-900">
                    <td className="p-3"><div className="font-black">{call.branchName || '—'}</div><div className="text-[10px] text-slate-400">{call.pbxName}</div></td>
                    <td className="p-3 font-mono">{call.startedAt ? new Date(call.startedAt).toLocaleString('ru-RU') : '—'}</td>
                    <td className="p-3">{call.direction === 'inbound' ? 'Входящий' : 'Исходящий'}</td>
                    <td className="p-3 font-mono">{call.callerNumber || '—'}</td>
                    <td className="p-3 font-mono">{call.connectedNumber || '—'}</td>
                    <td className="p-3 font-bold">{call.statusLabel}</td>
                    <td className="p-3 text-right font-mono">{duration(call.talkDurationSeconds)}</td>
                    <td className="p-3 text-right font-mono">{call.match?.mtsDurationSeconds ?? '—'}</td>
                    <td className="p-3 text-right font-mono">{call.match?.durationDifferenceSeconds ?? '—'}</td>
                    <td className="p-3 text-right">{call.attempts.length}</td>
                    <td className="p-3 font-bold">{matchStatus(call)}</td>
                    <td className="p-3">
                      <div className="font-medium">{call.match?.explanation || call.journey?.[0]?.label || '—'}</div>
                      {call.journey?.length > 1 && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          {call.journey.slice(0, 3).map(event => event.number ? `${event.label}: ${event.number}` : event.label).join(' → ')}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">{call.match?.amount?.toLocaleString('ru-RU') ?? '—'}</td>
                    <td className="p-3 text-right" title={call.match?.additionalCharges
                      ?.filter(charge => charge.type === 'mav')
                      .map(charge => `${charge.operator}: ${charge.amount.toLocaleString('ru-RU')} ₽ · операция ${new Date(charge.occurredAt).toLocaleString('ru-RU')}`)
                      .join('\n') || ''}>{call.match?.mavAmount?.toLocaleString('ru-RU') ?? '—'}</td>
                    <td className="p-3 text-right" title={call.match?.additionalCharges
                      ?.filter(charge => charge.type === 'marking')
                      .map(charge => `${charge.operator}: ${charge.amount.toLocaleString('ru-RU')} ₽ · операция ${new Date(charge.occurredAt).toLocaleString('ru-RU')}`
                        + (charge.ratedAt ? ` · тарификация ${new Date(charge.ratedAt).toLocaleString('ru-RU')}` : ''))
                      .join('\n') || ''}>{call.match?.markingAmount?.toLocaleString('ru-RU') ?? '—'}</td>
                    <td className="p-3 text-right font-mono">{call.match?.packageCounterUsed === null || call.match?.packageCounterUsed === undefined
                      ? '—'
                      : ['SECOND', 'SECONDS', 'MINUTE', 'MINUTES'].includes(String(call.match.packageUnit || '').toUpperCase())
                        ? (call.match.packageCounterUsed / 60).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                        : call.match.packageCounterUsed.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td>
                    <td className="p-3 text-center">{call.recordingAvailable ? 'Есть' : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {message && <div className="rounded-xl bg-white p-3 text-[11px] dark:bg-slate-900">{message}</div>}
    </section>
  );
}
