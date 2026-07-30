import React, { useEffect, useState } from 'react';
import {
  AlertCircle, Check, CircleDollarSign, Clock3, Copy,
  CreditCard, FileText, Gauge, Globe, Layers, PhoneCall, RefreshCw, Settings, Wallet
} from 'lucide-react';
import MtsAutoSecretaryPanel, { type MtsAutoSecretaryPanelTab } from './MtsAutoSecretaryPanel';
import MtsBusinessSettingsForm from './MtsBusinessSettingsForm';
import MtsPackagesPanel from './MtsPackagesPanel';

type Props = {
  token: string;
  canManage: boolean;
  canViewAnalytics: boolean;
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

const money = (value: number | null) => value === null
  ? 'Нет данных'
  : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
const integer = (value: number | null) => value === null ? 'Не определён' : `${value.toLocaleString('ru-RU')} мин`;
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';

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

export default function MtsBalanceWorkspace({ token, canManage, canViewAnalytics }: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const saved = localStorage.getItem('pbxpuls_balance_workspace_tab');
    return ['overview', 'calls', 'charges', 'packages', 'branches', 'settings'].includes(saved || '')
      ? saved as WorkspaceTab
      : 'overview';
  });
  const [provider, setProvider] = useState<ProviderOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/balance/overview', { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || 'Сводка баланса недоступна');
      setProvider(data.provider);
      setError('');
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
      const response = await fetch('/api/balance/overview/sync', { method: 'POST', headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || 'Данные не обновились');
      setProvider(data.provider);
      setNotice('Данные успешно обновлены');
    } catch (reason: any) {
      // Keep the last successful provider snapshot visible on refresh failure.
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

  const remainingText = provider?.remainingPackageMinutes === null || provider?.remainingPackageMinutes === undefined
    ? 'Не определён'
    : `${provider.remainingPackageMinutes.toLocaleString('ru-RU')} из ${(provider.purchasedPackageMinutes || 0).toLocaleString('ru-RU')} мин`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">Баланс операторов IP-телефонии</h1>
          <p className="mt-0.5 text-xs text-slate-500">Остаток средств, пакеты минут и детализация начислений из реальных источников</p>
        </div>
        <button type="button" onClick={() => void sync()} disabled={!canManage || syncing}
          className="btn bg-blue-600 px-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
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

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex min-h-[118px] flex-col justify-between rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>Текущий баланс</span><Wallet className="h-4 w-4 text-blue-600" /></div>
          <div className="font-mono text-2xl font-black text-slate-900 dark:text-white">{loading && !provider ? 'Загрузка…' : money(provider?.balance ?? null)}</div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
            <span>Баланс на текущий момент</span><span><Clock3 className="mr-1 inline h-3 w-3" />{timestamp(provider?.lastSuccessAt || null)}</span>
          </div>
        </div>
        <div className="flex min-h-[118px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>Купленный пакет минут</span><CreditCard className="h-4 w-4 text-violet-600" /></div>
          <div className="font-mono text-2xl font-black text-slate-900 dark:text-white">{integer(provider?.purchasedPackageMinutes ?? null)}</div>
          <div className="truncate text-[10px] text-slate-500" title={provider?.packageLabels.join(', ') || ''}>
            {provider?.packageLabels.length ? provider.packageLabels.join(' · ') : 'Действующий пакет в детализации не найден'}
          </div>
        </div>
        <div className="flex min-h-[118px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>Осталось минут</span><Gauge className="h-4 w-4 text-emerald-600" /></div>
          <div className="font-mono text-2xl font-black text-slate-900 dark:text-white">{remainingText}</div>
          {provider?.remainingPackagePercent !== null && provider?.remainingPackagePercent !== undefined
            ? <div><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>Остаток</span><span>{provider.remainingPackagePercent.toFixed(0)}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, provider.remainingPackagePercent))}%` }} /></div></div>
            : <div className="text-[10px] text-slate-500">API не возвращает единый остаток пакета; приблизительное значение не рассчитывается</div>}
        </div>
      </div>

      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
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

      {activeTab === 'overview' && <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div>
              <h2 className="text-sm font-black">Контролируемые балансы и провайдеры IP-телефонии</h2>
              <p className="text-[10px] text-slate-500">Только реальные источники финансовых данных</p>
            </div>
            {provider && <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold ${statusTone[provider.status.code]}`}
              title={provider.status.reason || provider.status.label}>
              {syncing ? 'Обновление' : provider.status.label}
            </span>}
          </div>
          {provider && <div className="grid gap-4 px-4 py-3 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center">
            <div>
              <div className="text-[10px] uppercase text-slate-400">Оператор</div>
              <div className="mt-1 font-black">{provider.displayName}</div>
              {provider.accountNumber && <div className="mt-1 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Лицевой счёт:</span><span className="font-mono font-bold">{provider.accountNumber}</span>
                <button type="button" title="Копировать лицевой счёт" onClick={() => void copyText(provider.accountNumber!).then(() => setNotice('Лицевой счёт скопирован'))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"><Copy className="h-3.5 w-3.5" /></button>
              </div>}
            </div>
            <div><div className="text-[10px] uppercase text-slate-400">Источник данных</div><div className="mt-1 text-xs font-bold">МТС Бизнес API</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Текущий баланс</div><div className="mt-1 text-right font-mono text-lg font-black">{money(provider.balance)}</div></div>
            <div className="text-right text-[10px] text-slate-500">Обновлено:<br /><span className="font-medium text-slate-700 dark:text-slate-300">{timestamp(provider.lastSuccessAt)}</span></div>
            {provider.linkedTrunks.length > 0 && <div className="lg:col-span-4">
              <span className="text-[10px] uppercase text-slate-400">Связанные транки: </span>
              <span className="text-xs font-mono">{provider.linkedTrunks.join(', ')}</span>
            </div>}
            {provider.status.reason && <div className="text-[11px] text-slate-500 lg:col-span-4">{provider.status.reason}</div>}
          </div>}
        </div>
        <MtsAutoSecretaryPanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics}
          activeTab="overview" showNavigation={false} />
      </div>}

      {activeTab === 'packages' && <MtsPackagesPanel token={token} canViewAnalytics={canViewAnalytics} />}

      {['calls', 'charges', 'branches'].includes(activeTab) && (
        <MtsAutoSecretaryPanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics}
          activeTab={activeTab} showNavigation={false} />
      )}

      {activeTab === 'settings' && canManage && <div className="space-y-4">
        <MtsBusinessSettingsForm token={token} canManage={canManage} onSaved={() => void load()} />
        <MtsAutoSecretaryPanel token={token} canManage={canManage} canViewAnalytics={canViewAnalytics}
          activeTab="settings" showNavigation={false} />
      </div>}
    </div>
  );
}
