import BalancePackageCells from './BalancePackageCells';
import React, { useEffect, useState } from 'react';
import {
  AlertCircle, Check, CircleDollarSign, Copy,
  FileText, Globe, Layers, PhoneCall, RefreshCw, Settings, Wallet
} from 'lucide-react';
import {
  Line, LineChart, Legend, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import MtsAutoSecretaryPanel, { type MtsAutoSecretaryPanelTab } from './MtsAutoSecretaryPanel';
import MtsBusinessSettingsForm from './MtsBusinessSettingsForm';
import MtsPackagesPanel from './MtsPackagesPanel';
import NovofonBalancePanel from './NovofonBalancePanel';
import McnTelecomBalancePanel from './McnTelecomBalancePanel';

type Props = {
  token: string;
  canManage: boolean;
  canViewAnalytics: boolean;
  canManageProviders: boolean;
  canListenRecordings: boolean;
};

type ProviderOverview = {
  provider: 'mts_business';
  displayName: string;
  balance: number | null;
  currency: 'RUB' | null;
  creditLimit: number | null;
  accountNumber: string | null;
  purchasedPackageMinutes: number | null;
  remainingPackageMinutes: number | null;
  remainingPackagePercent: number | null;
  packageCalculationStatus: 'direct' | 'calculated' | 'unavailable';
  packageLabels: string[];
  linkedTrunks: string[];
  measuredAt: string | null;
  lastSuccessAt: string | null;
  status: {
    code: 'connected' | 'authorization_required' | 'api_error' | 'stale' | 'updating' | 'offline';
    label: string;
    reason: string | null;
  };
};

type WorkspaceTab = MtsAutoSecretaryPanelTab;
type OverviewHistory = {
  balanceSeries?: Array<{sourceId:string;displayName:string;currency:string|null;points:Array<{date:string;balance:number|null}>}>;
  balance: Array<{ date: string; balance: number }>;
  minutes: Array<{ date: string; usedMinutes: number }>;
  periodDays: number;
};

const money = (value: number | null) => value === null
  ? 'Нет данных'
  : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
const shortDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}

const statusTone: Record<ProviderOverview['status']['code'], string> = {
  connected: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
  updating: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
  stale: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  authorization_required: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  api_error: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900',
  offline: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

export default function MtsBalanceWorkspace({ token, canManage, canViewAnalytics, canManageProviders, canListenRecordings }: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const saved = localStorage.getItem('pbxpuls_balance_workspace_tab');
    return ['overview', 'calls', 'charges', 'packages', 'branches', 'settings'].includes(saved || '')
      ? saved as WorkspaceTab
      : 'overview';
  });
  const [provider, setProvider] = useState<ProviderOverview | null>(null);
  const [history, setHistory] = useState<OverviewHistory | null>(null);
  const balanceSeries = history?.balanceSeries || [];
  const balanceColors = ['#2563eb','#7c3aed','#059669','#ea580c','#db2777','#0891b2'];
  const balanceChart = (balanceSeries[0]?.points || []).map((point, index) => {
    const row: Record<string,string|number|null> = {date:point.date};
    balanceSeries.forEach((series,i) => {row[`source${i}`] = series.points[index]?.balance ?? null});
    return row;
  });
  const hasBalanceHistory = balanceSeries.some(series => series.points.some(point => point.balance !== null));
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [novofonRefreshKey, setNovofonRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadHistory = async () => {
    try {
      const response = await fetch('/api/balance/overview/history?days=31', { headers });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) setHistory(data.history);
    } catch {
      // The provider summary remains usable when historical charts are unavailable.
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/balance/overview', { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || 'Сводка баланса недоступна');
      setProvider(data.provider);
      setError('');
      void loadHistory();
    } catch (reason: any) {
      setError(reason.message || 'Сводка баланса недоступна');
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError('');
    try {
      const request = async (label: string, url: string) => {
        const response = await fetch(url, { method: 'POST', headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(`${label}: ${data.safeMessage || 'ошибка подключения'}`);
        return data;
      };
      const results = await Promise.allSettled([
        request('МТС Бизнес', '/api/balance/sources/mts_business/sync'),
        request('Баланс Novofon', '/api/balance/providers/novofon/sync'),
        request('Детализация Novofon', '/api/balance/providers/novofon/usage/sync'),
        request('MCN Telecom', '/api/balance/providers/mcn-telecom/sync')
      ]);
      const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason?.message || 'Неизвестная ошибка'] : []);
      setNovofonRefreshKey(value => value + 1);
      await load();
      if (failures.length) {
        setError(`Часть данных не обновилась: ${failures.join(' · ')}`);
        setNotice('Обновление завершено с предупреждениями');
      } else {
        setNotice('МТС Бизнес, Novofon и MCN Telecom успешно обновлены');
      }
    } catch (reason: any) {
      setError(`Данные не обновились: ${reason.message || 'ошибка подключения'}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { void load(); }, [token]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 items-center gap-3 pl-4">
        <h1 className="flex shrink-0 items-center gap-2 text-lg font-black text-slate-900 dark:text-white"><Wallet className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />Баланс</h1>
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([
            ['overview', 'Обзор', CircleDollarSign],
            ['calls', 'Звонки', PhoneCall],
            ['charges', 'МАВ и маркировка', FileText],
            ['packages', 'Пакеты', Layers],
            ['branches', 'Филиалы', Globe],
            ['settings', 'Настройки', Settings]
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => {
              setActiveTab(id);
              localStorage.setItem('pbxpuls_balance_workspace_tab', id);
            }} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
              activeTab === id ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500'
            }`}><Icon className="h-3.5 w-3.5" />{label}</button>
          ))}
        </div>
        <button type="button" onClick={() => void sync()} disabled={!canManage || syncing}
          className="btn ml-auto shrink-0 whitespace-nowrap bg-blue-600 px-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Обновление…' : 'Обновить данные'}
        </button>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
      </div>}
      {notice && <div className="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl">
        <Check className="h-4 w-4 text-emerald-400" />{notice}
      </div>}

      {activeTab === 'overview' && <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div>
              <h2 className="text-sm font-black">Контролируемые балансы и провайдеры IP-телефонии</h2>
              <p className="text-[10px] text-slate-500">Балансы и пакеты минут по операторам · если источник не передаёт значение — «Нет данных»</p>
            </div>
          </div>
          {loading && !provider && <div className="px-4 py-3 text-xs text-slate-500">Загрузка МТС Бизнес…</div>}
          {provider && <div className="grid gap-4 px-4 py-3 sm:grid-cols-2 2xl:grid-cols-[minmax(200px,1.4fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(150px,1fr)] 2xl:items-center">
            <div>
              <div className="text-[10px] uppercase text-slate-400">Оператор</div>
              <div className="mt-1 font-black">{provider.displayName}</div>
              <div className={`mt-1 inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${statusTone[provider.status.code]}`} title={provider.status.reason || provider.status.label}>{syncing ? 'Обновление' : provider.status.label}</div>
              {provider.accountNumber && <div className="mt-1 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Лицевой счёт:</span><span className="font-mono font-bold">{provider.accountNumber}</span>
                <button type="button" title="Копировать лицевой счёт" onClick={() => void copyText(provider.accountNumber!).then(() => setNotice('Лицевой счёт скопирован'))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"><Copy className="h-3.5 w-3.5" /></button>
              </div>}
            </div>
            <div><div className="text-[10px] uppercase text-slate-400">Источник данных</div><div className="mt-1 text-xs font-bold">МТС Бизнес API</div></div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase text-slate-400">Текущий баланс</div>
              <div className="mt-1 whitespace-nowrap font-mono text-lg font-black">{money(provider.balance)}</div>
            </div>
            <BalancePackageCells purchased={provider.purchasedPackageMinutes} remaining={provider.remainingPackageMinutes}
              labels={provider.packageLabels} calculated={provider.packageCalculationStatus === 'calculated'} />
            <div className="min-w-0 border-slate-200 text-[10px] text-slate-500 sm:text-right 2xl:border-l 2xl:pl-4 dark:border-slate-700">
              Обновлено:<br /><span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">{timestamp(provider.lastSuccessAt)}</span>
            </div>
            {provider.linkedTrunks.length > 0 && <div className="sm:col-span-2 2xl:col-span-6">
              <span className="text-[10px] uppercase text-slate-400">Связанные транки: </span>
              <span className="text-xs font-mono">{provider.linkedTrunks.join(', ')}</span>
            </div>}
            {provider.status.reason && <div className="text-[11px] text-slate-500 sm:col-span-2 2xl:col-span-6">{provider.status.reason}</div>}
          </div>}
          <NovofonBalancePanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics} canListenRecordings={canListenRecordings} mode="summary" refreshKey={novofonRefreshKey} refreshing={syncing} />
          <McnTelecomBalancePanel token={token} canManage={canManageProviders} canSync={canManage} mode="summary" refreshKey={novofonRefreshKey}/>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div><h3 className="text-sm font-black">Динамика баланса</h3><p className="text-[10px] text-slate-500">Все включённые источники · последний снимок дня (UTC) · 31 день</p></div>
            </div>
            {hasBalanceHistory
              ? <div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%">
                  <LineChart data={balanceChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.45} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis width={58} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip labelFormatter={shortDate} />
                    <Legend wrapperStyle={{fontSize:11}} />
                    {balanceSeries.map((series,i)=><Line key={`${series.sourceId}:${series.currency}`} type="linear" dataKey={`source${i}`} name={`${series.displayName}${series.currency?`, ${series.currency}`:''}`} stroke={balanceColors[i%balanceColors.length]} strokeWidth={2} dot={{r:2}} connectNulls={false} isAnimationActive={false}/>)}
                  </LineChart>
                </ResponsiveContainer></div>
              : <div className="flex h-56 items-center justify-center text-xs text-slate-500">История баланса ещё не накоплена</div>}
            {balanceSeries.filter(series=>series.points.every(point=>point.balance===null)).map(series=><p key={`${series.sourceId}:${series.currency}`} className="mt-1 text-[10px] text-slate-500">{series.displayName}: нет снимков за этот период</p>)}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div><h3 className="text-sm font-black">Расход минут</h3><p className="text-[10px] text-slate-500">Подтверждённое списание из пакетов по дням</p></div>
              <span className="whitespace-nowrap font-mono text-xs font-bold text-violet-600">
                {history?.minutes.reduce((sum, item) => sum + item.usedMinutes, 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) || '0'} мин
              </span>
            </div>
            {history?.minutes.length
              ? <div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%">
                  <BarChart data={history.minutes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.45} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis width={48} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip labelFormatter={shortDate} />
                    <Bar dataKey="usedMinutes" name="Из пакета, мин" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer></div>
              : <div className="flex h-56 items-center justify-center text-xs text-slate-500">Подтверждённые списания минут не найдены</div>}
          </div>
        </div>
        <MtsAutoSecretaryPanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics}
          activeTab="overview" showNavigation={false} />
      </div>}

      {activeTab === 'packages' && <MtsPackagesPanel token={token} canViewAnalytics={canViewAnalytics} />}

      {['calls', 'charges', 'branches'].includes(activeTab) && (
        <MtsAutoSecretaryPanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics}
          activeTab={activeTab} showNavigation={false} />
      )}

      {activeTab === 'calls' && <NovofonBalancePanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics} canListenRecordings={canListenRecordings} mode="details" />}

      {activeTab === 'settings' && (canManage || canManageProviders) && <div className="space-y-4">
        {canManage && <><MtsBusinessSettingsForm token={token} canManage={canManage} onSaved={() => void load()} />
          <MtsAutoSecretaryPanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics} activeTab="settings" showNavigation={false} /></>}
        <NovofonBalancePanel token={token} canManage={canManageProviders} canViewAnalytics={canViewAnalytics} canListenRecordings={canListenRecordings} mode="settings" />
        <McnTelecomBalancePanel token={token} canManage={canManageProviders} canSync={canManage} mode="settings"/>
      </div>}
    </div>
  );
}
