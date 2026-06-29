import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Clock, Download, Filter, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw, ShieldCheck, TrendingUp, XCircle } from 'lucide-react';
import { DirectoryEntry, AppSettings } from '../../types';
import { StatsKpiCard } from './dashboard/StatsKpiCard';
import { CallDirectionChart, ChartMode } from './dashboard/CallDirectionChart';
import { InsightsPanel } from './dashboard/InsightsPanel';
import { CallHeatmap } from './dashboard/CallHeatmap';
import { CallFunnelWidget } from './dashboard/CallFunnelWidget';
import { ProblemDepartmentsTable } from './dashboard/ProblemDepartmentsTable';
import { LostCallsTable, LostCallDetail } from './dashboard/LostCallsTable';
import { TrunkHealthWidget } from './dashboard/TrunkHealthWidget';

type Props = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  operatorExt: string;
  onlyMyCalls: boolean;
  accessUsers: any[];
  directory: DirectoryEntry[];
  settings: AppSettings | null;
  onStartDateChange?: (val: string) => void;
  onEndDateChange?: (val: string) => void;
};

interface DynamicDatapoint {
  label: string;
  sortKey: number;
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  internalCalls: number;
  missedCalls: number;
  processedCalls: number;
  lostCalls: number;
  totalDuration: number;
  answeredDuration: number;
  answeredCount: number;
  averageWaitSeconds?: number | null;
  slaPercent?: number;
  answeredWithinSla?: number;
  answeredInboundCalls?: number;
  extCalls?: Record<string, number>;
}

interface DetailingItem {
  name: string;
  totalCalls: number;
  answeredCalls: number;
  duration: number;
}

interface DetailingData {
  extensions: DetailingItem[];
  trunks: DetailingItem[];
  queues: DetailingItem[];
  groups: DetailingItem[];
  outboundRules: DetailingItem[];
}

interface SlaSummary {
  slaThresholdSeconds: number;
  inboundCalls: number;
  answeredInboundCalls: number;
  missedInboundCalls: number;
  slaAnsweredCalls: number;
  slaPercent: number;
  averageWaitSeconds: number | null;
  maxWaitSeconds: number | null;
  waitBuckets?: {
    under10: number;
    from10to20: number;
    from20to30: number;
    over30: number;
    unknown: number;
  };
}

interface LostCallSummary {
  missedCalls: number;
  lostCalls: number;
  callbackAfterMissed: number;
  callbackRate: number;
  notCalledBack: number;
  callbackWindowHours: number;
}

function safeNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, safeNumber(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = Math.round(safe % 60);
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
}

function formatNullableDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '—';
  return formatDuration(Number(seconds));
}

function controlClass() {
  return 'h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950/40';
}

function compactLabelClass() {
  return 'text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400';
}

export default function ReportsTab({
  startDate,
  endDate,
  startTime,
  endTime,
  operatorExt,
  onlyMyCalls,
  accessUsers,
  directory,
  onStartDateChange,
  onEndDateChange
}: Props) {
  const [groupType, setGroupType] = useState<'day' | 'week' | 'month' | 'year' | 'hour' | 'weekday'>('day');
  const [department, setDepartment] = useState('all');
  const [employee, setEmployee] = useState('all');
  const [internalExt, setInternalExt] = useState(operatorExt || '');
  const [trunkFilter, setTrunkFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [chartMode, setChartMode] = useState<ChartMode>('all');
  const [data, setData] = useState<DynamicDatapoint[]>([]);
  const [detailingData, setDetailingData] = useState<DetailingData | null>(null);
  const [lostCallDetails, setLostCallDetails] = useState<LostCallDetail[]>([]);
  const [lostCallSummary, setLostCallSummary] = useState<LostCallSummary | null>(null);
  const [slaSummary, setSlaSummary] = useState<SlaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    setInternalExt(operatorExt || '');
  }, [operatorExt]);

  useEffect(() => {
    let active = true;
    const fetchDynamics = async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({
          startDate,
          endDate,
          startTime,
          endTime,
          groupType,
          department,
          operatorExt: internalExt || operatorExt,
          onlyMyCalls: String(onlyMyCalls),
          callbackWindowHours: '24',
          slaThresholdSeconds: '20'
        });
        const sessionSaved = localStorage.getItem('asterisk_cdr_session');
        let token = '';
        if (sessionSaved) {
          try { token = JSON.parse(sessionSaved)?.token || ''; } catch {}
        }
        const res = await fetch('/api/reports/dynamics?' + params.toString(), { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Ошибка сервера: ' + res.status + ' ' + res.statusText);
        const json = await res.json();
        if (!active) return;
        setData(Array.isArray(json.dynamics) ? json.dynamics : []);
        setDetailingData(json.detailing || null);
        setLostCallDetails(Array.isArray(json.lostCallDetails) ? json.lostCallDetails : []);
        setLostCallSummary(json.lostCallSummary || null);
        setSlaSummary(json.slaSummary || null);
        setError(json.dbError || '');
      } catch (err: any) {
        if (active) setError(err?.message || 'Не удалось загрузить данные аналитики.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDynamics();
    return () => { active = false; };
  }, [startDate, endDate, startTime, endTime, groupType, department, internalExt, operatorExt, onlyMyCalls, refreshes]);

  const visibleData = useMemo(() => {
    if (!onlyProblems && statusFilter === 'all') return data;
    return data.filter(item => {
      const hasProblem = safeNumber(item.missedCalls) > 0 || safeNumber(item.lostCalls) > 0;
      if (onlyProblems && !hasProblem) return false;
      if (statusFilter === 'missed') return safeNumber(item.missedCalls) > 0;
      if (statusFilter === 'lost') return safeNumber(item.lostCalls) > 0;
      if (statusFilter === 'answered') return safeNumber(item.answeredCount) > 0;
      return true;
    });
  }, [data, onlyProblems, statusFilter]);

  const summary = useMemo(() => {
    const totals = visibleData.reduce((acc, p) => {
      acc.total += safeNumber(p.totalCalls);
      acc.inbound += safeNumber(p.inboundCalls);
      acc.outbound += safeNumber(p.outboundCalls);
      acc.missed += safeNumber(p.missedCalls);
      acc.processed += safeNumber(p.processedCalls);
      acc.lost += safeNumber(p.lostCalls);
      acc.answeredDuration += safeNumber(p.answeredDuration);
      acc.answeredCount += safeNumber(p.answeredCount);
      return acc;
    }, { total: 0, inbound: 0, outbound: 0, missed: 0, processed: 0, lost: 0, answeredDuration: 0, answeredCount: 0 });
    const sla = totals.missed > 0 ? Math.round((totals.processed / totals.missed) * 100) : 100;
    return { ...totals, sla, avgWait: totals.answeredCount ? Math.round(totals.answeredDuration / totals.answeredCount) : 0 };
  }, [visibleData]);

  const departments = detailingData?.queues?.length ? detailingData.queues : (detailingData?.groups || []);
  const trunks = detailingData?.trunks || [];
  const employees = useMemo(() => {
    const fromAccess = accessUsers.map(user => ({ value: String(user.extension || user.username || ''), label: String(user.name || user.username || user.extension || 'Сотрудник') })).filter(item => item.value);
    const fromDirectory = directory.map(item => ({ value: String(item.number || ''), label: item.name || String(item.number || '') })).filter(item => item.value);
    return [...fromAccess, ...fromDirectory].slice(0, 80);
  }, [accessUsers, directory]);

  const slaPercentValue = slaSummary && Number.isFinite(Number(slaSummary.slaPercent)) ? Number(slaSummary.slaPercent) : summary.sla;
  const averageWaitValue = slaSummary ? slaSummary.averageWaitSeconds : summary.avgWait;
  const callbackAfterMissedValue = lostCallSummary && Number.isFinite(Number(lostCallSummary.callbackAfterMissed)) ? Number(lostCallSummary.callbackAfterMissed) : summary.processed;
  const lostCallsValue = lostCallSummary && Number.isFinite(Number(lostCallSummary.lostCalls)) ? Number(lostCallSummary.lostCalls) : summary.lost;
  const slaOutsideCount = slaSummary ? Math.max(0, safeNumber(slaSummary.answeredInboundCalls) - safeNumber(slaSummary.slaAnsweredCalls)) : 0;

  const insights = [
    summary.total > 0 ? 'За период обработано ' + summary.total.toLocaleString('ru-RU') + ' звонков.' : 'За выбранный период звонков не найдено.',
    slaSummary ? 'SLA входящих: ' + slaPercentValue + '% при цели ответа до ' + slaSummary.slaThresholdSeconds + ' сек.' : 'SLA по пропущенным: ' + summary.sla + '%',
    slaSummary ? 'Среднее время ожидания: ' + formatNullableDuration(averageWaitValue) : (summary.outbound > summary.inbound ? 'Исходящая активность выше входящей.' : 'Входящий поток не ниже исходящего.')
  ];
  const anomalies = [
    lostCallsValue > 0 ? 'Есть потерянные звонки: ' + lostCallsValue.toLocaleString('ru-RU') : '',
    slaSummary && slaPercentValue < 90 ? 'SLA ниже целевого значения 90%.' : '',
    slaSummary && slaOutsideCount > 0 ? 'Звонков вне SLA: ' + slaOutsideCount.toLocaleString('ru-RU') : '',
    error ? 'Источник данных вернул предупреждение.' : ''
  ].filter(Boolean);
  const recommendations = [
    lostCallsValue > 0 ? 'Проверьте ответственных за обратные звонки и очередь обработки пропусков.' : 'Критичных потерь по данным периода не видно.',
    slaSummary && slaPercentValue < 80 ? 'Разберите маршруты входящих и распределение нагрузки: SLA находится в красной зоне.' : 'Контролируйте интервалы ожидания и пики входящего потока.',
    trunks.length === 0 ? 'Данных по транкам нет: показан безопасный empty state.' : 'Проверьте транки с низкой долей ответов.'
  ];

  const handleExportCSV = () => {
    if (visibleData.length === 0) return;
    const headers = ['Период', 'Всего звонков', 'Входящие', 'Исходящие', 'Пропущенные', 'Перезвонили', 'Потерянные', 'Разговорное время'];
    const rows = visibleData.map(item => [item.label, item.totalCalls, item.inboundCalls, item.outboundCalls, item.missedCalls, item.processedCalls, item.lostCalls, item.answeredDuration].join(';'));
    const csv = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pbxpuls_statistics_' + startDate + '_' + endDate + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const tabs = [
    ['overview', 'Обзор'],
    ['inbound', 'Входящие'],
    ['departments', 'Отделы'],
    ['employees', 'Сотрудники'],
    ['trunks', 'Транки'],
    ['marketing', 'Маркетинг'],
    ['reports', 'Отчеты']
  ];

  return (
    <div className="w-full space-y-4" id="reports-tab-container">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <Activity className="h-3.5 w-3.5" /> PBXPuls Analytics
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Статистика и отчеты</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500 dark:text-slate-400">Аналитика телефонных коммуникаций и контроль эффективности</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
            <button onClick={() => setRefreshes(v => v + 1)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60" disabled={loading}>
              <RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />Обновить
            </button>
            <button onClick={handleExportCSV} disabled={visibleData.length === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              <Download className="h-4 w-4" />Экспорт
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300"><Filter className="h-4 w-4 text-blue-600" />Фильтры</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.45fr)_minmax(92px,.55fr)_minmax(130px,.8fr)_minmax(150px,.9fr)_minmax(120px,.7fr)_minmax(120px,.7fr)_minmax(130px,.75fr)_auto] xl:items-end">
            <div className="space-y-1">
              <label className={compactLabelClass()}>Период</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative"><CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input type="date" value={startDate} onChange={e => onStartDateChange?.(e.target.value)} className={controlClass() + ' pl-8'} /></div>
                <div className="relative"><CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input type="date" value={endDate} onChange={e => onEndDateChange?.(e.target.value)} className={controlClass() + ' pl-8'} /></div>
              </div>
            </div>
            <div className="space-y-1">
              <label className={compactLabelClass()}>Шаг</label>
              <select value={groupType} onChange={e => setGroupType(e.target.value as typeof groupType)} className={controlClass()}>
                <option value="day">День</option><option value="week">Неделя</option><option value="month">Месяц</option><option value="hour">Час</option><option value="weekday">День недели</option><option value="year">Год</option>
              </select>
            </div>
            <div className="space-y-1"><label className={compactLabelClass()}>Отдел</label><select value={department} onChange={e => setDepartment(e.target.value)} className={controlClass()}><option value="all">Все отделы</option><option value="sales">Продажи</option><option value="support">Поддержка</option><option value="accounting">Бухгалтерия</option><option value="logistics">Логистика</option></select></div>
            <div className="space-y-1"><label className={compactLabelClass()}>Сотрудник</label><select value={employee} onChange={e => setEmployee(e.target.value)} className={controlClass()}><option value="all">Все сотрудники</option>{employees.map(item => <option key={item.value + item.label} value={item.value}>{item.label}</option>)}</select></div>
            <div className="space-y-1"><label className={compactLabelClass()}>Внутренний номер</label><input value={internalExt} onChange={e => setInternalExt(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Все" className={controlClass()} /></div>
            <div className="space-y-1"><label className={compactLabelClass()}>Транк</label><select value={trunkFilter} onChange={e => setTrunkFilter(e.target.value)} className={controlClass()}><option value="all">Все транки</option>{trunks.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></div>
            <div className="space-y-1"><label className={compactLabelClass()}>Статус</label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={controlClass()}><option value="all">Все статусы</option><option value="answered">Отвеченные</option><option value="missed">Пропущенные</option><option value="lost">Потерянные</option></select></div>
            <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <span className={['relative h-4 w-7 rounded-full transition', onlyProblems ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'].join(' ')}><span className={['absolute top-0.5 h-3 w-3 rounded-full bg-white transition', onlyProblems ? 'left-3.5' : 'left-0.5'].join(' ')} /></span>
              <input className="sr-only" type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />Проблемные
            </label>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"><Activity className="mr-2 inline h-4 w-4" />{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-max gap-1">
          {tabs.map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} className={['whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black transition', activeTab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'].join(' ')}>{label}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <StatsKpiCard label="Всего звонков" value={summary.total.toLocaleString('ru-RU')} hint="Общая активность" icon={Phone} tone="blue" badge={loading ? 'Загрузка' : 'Live'} />
        <StatsKpiCard label="Входящие" value={summary.inbound.toLocaleString('ru-RU')} hint="Клиентский поток" icon={PhoneIncoming} tone="green" />
        <StatsKpiCard label="Исходящие" value={summary.outbound.toLocaleString('ru-RU')} hint="Активность операторов" icon={PhoneOutgoing} tone="blue" />
        <StatsKpiCard label="Пропущенные" value={summary.missed.toLocaleString('ru-RU')} hint="Требуют контроля" icon={PhoneMissed} tone="orange" />
        <StatsKpiCard label="Потерянные" value={lostCallsValue.toLocaleString('ru-RU')} hint="Без обратного звонка" icon={XCircle} tone="red" />
        <StatsKpiCard label="SLA" value={slaPercentValue + '%'} hint="Закрытие пропусков" icon={ShieldCheck} tone="purple" />
        <StatsKpiCard label="Среднее ожидание" value={formatNullableDuration(averageWaitValue)} hint="По отвеченным" icon={Clock} tone="orange" />
        <StatsKpiCard label="Перезвонили после пропуска" value={callbackAfterMissedValue.toLocaleString('ru-RU')} hint="Обработанные" icon={TrendingUp} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-9"><CallDirectionChart data={visibleData} mode={chartMode} onModeChange={setChartMode} /></div>
        <div className="xl:col-span-3"><InsightsPanel insights={insights} anomalies={anomalies} recommendations={recommendations} /></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CallHeatmap data={visibleData} />
        <CallFunnelWidget inbound={slaSummary?.inboundCalls ?? summary.inbound} missed={slaSummary?.missedInboundCalls ?? summary.missed} processed={callbackAfterMissedValue} lost={lostCallsValue} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ProblemDepartmentsTable rows={departments} />
        <LostCallsTable data={visibleData} items={lostCallDetails} />
        <TrunkHealthWidget rows={trunkFilter === 'all' ? trunks : trunks.filter(item => item.name === trunkFilter)} />
      </div>

      {visibleData.length === 0 && !loading && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">Нет данных за выбранный период</div>}
    </div>
  );
}
