import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Clock, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw, ShieldCheck, TrendingUp, XCircle } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import RussianDatePicker, { toLocalDateInputValue } from '../common/RussianDatePicker';
import { DirectoryEntry, AppSettings } from '../../types';
import { StatsKpiCard } from './dashboard/StatsKpiCard';
import { CallDirectionChart, ChartMode } from './dashboard/CallDirectionChart';
import { OverviewCallDynamicsChart } from './dashboard/OverviewCallDynamicsChart';
import { CallHeatmap } from './dashboard/CallHeatmap';
import { CallFunnelWidget } from './dashboard/CallFunnelWidget';
import { ProblemDepartmentsTable, DepartmentSummaryRow } from './dashboard/ProblemDepartmentsTable';
import { LostCallsTable, LostCallDetail } from './dashboard/LostCallsTable';
import { TrunkHealthWidget, TrunkSummaryRow } from './dashboard/TrunkHealthWidget';
import { ClientAnalyticsPanel } from './dashboard/ClientAnalyticsPanel';
import { InboundDashboard } from './dashboard/InboundDashboard';
import { EmployeesDashboard } from './dashboard/EmployeesDashboard';
import { DepartmentsDashboard } from './dashboard/DepartmentsDashboard';
import { LinesDashboard } from './dashboard/LinesDashboard';
import { OutgoingDashboard } from './dashboard/OutgoingDashboard';

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
  key?: string;
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
  pendingCallback?: number;
  callbackRecoveredWithinSla?: number;
  callbackWindowHours: number;
}

interface UsedCallQualitySettings {
  answerSlaSeconds: number;
  missedCallCallbackSlaHours: number;
  calltrackingMatchWindowMinutes: number;
}

interface HeatmapHour { hour: number; total: number; incoming: number; outgoing: number; answered: number; missed: number; lost: number }
interface HeatmapData { days: Array<{ day: string; hours: HeatmapHour[] }> }
interface ClientAnalyticsData { initiative?: any; summary?: any; topClients?: any[]; lostClients?: any[]; lowInterestClients?: any[]; missedWithoutCallback?: any[] }

interface EmployeeSummaryRow {
  extension?: string | null;
  employeeName?: string | null;
  department?: string | null;
  inboundCalls?: number;
  outboundCalls?: number;
  answeredCalls?: number;
  missedCalls?: number;
  lostCalls?: number;
  callbackAfterMissed?: number;
  callbackRate?: number;
  averageWaitSeconds?: number | null;
  slaPercent?: number | null;
  averageDurationSeconds?: number;
  recordingCount?: number;
  status?: 'ok' | 'warning' | 'problem' | string;
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
  return 'h-8 w-full rounded-lg border border-slate-200/80 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950/40';
}

const reportDatePickerButtonClass = 'h-8 w-full rounded-lg border border-slate-200/80 bg-white px-2.5 text-left font-mono text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950/40 flex items-center gap-1.5';
const periodShiftButtonClass = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/30 dark:hover:text-blue-300';
const internalExtensionPattern = /^\d{2,6}$/;
const dayMs = 24 * 60 * 60 * 1000;

function formatEmployeeLabel(name: string, extension: string) {
  const safeName = String(name || '').trim();
  const safeExtension = String(extension || '').trim();
  if (safeName && safeName !== safeExtension) return safeName + ' — ' + safeExtension;
  return safeExtension;
}

function parseReportDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function getDateKey(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function getInclusiveDays(start: Date, end: Date): number {
  return Math.round((getDateKey(end) - getDateKey(start)) / dayMs) + 1;
}

function isFullCalendarMonth(start: Date, end: Date): boolean {
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return start.getDate() === 1
    && end.getFullYear() === start.getFullYear()
    && end.getMonth() === start.getMonth()
    && end.getDate() === monthEnd.getDate();
}

function isFullCalendarYear(start: Date, end: Date): boolean {
  return start.getMonth() === 0
    && start.getDate() === 1
    && end.getFullYear() === start.getFullYear()
    && end.getMonth() === 11
    && end.getDate() === 31;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getShiftedPeriod(startDate: string, endDate: string, direction: -1 | 1): { startDate: string; endDate: string } | null {
  const start = parseReportDate(startDate);
  const end = parseReportDate(endDate);
  if (!start || !end) return null;
  const inclusiveDays = getInclusiveDays(start, end);
  if (inclusiveDays < 1) return null;

  if (isFullCalendarYear(start, end)) {
    const shiftedYear = start.getFullYear() + direction;
    return {
      startDate: toLocalDateInputValue(new Date(shiftedYear, 0, 1)),
      endDate: toLocalDateInputValue(new Date(shiftedYear, 11, 31))
    };
  }

  if (isFullCalendarMonth(start, end)) {
    const shiftedStart = new Date(start.getFullYear(), start.getMonth() + direction, 1);
    return {
      startDate: toLocalDateInputValue(shiftedStart),
      endDate: toLocalDateInputValue(new Date(shiftedStart.getFullYear(), shiftedStart.getMonth() + 1, 0))
    };
  }

  return {
    startDate: toLocalDateInputValue(addDays(start, inclusiveDays * direction)),
    endDate: toLocalDateInputValue(addDays(end, inclusiveDays * direction))
  };
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
  settings,
  onStartDateChange,
  onEndDateChange
}: Props) {
  const [groupType, setGroupType] = useState<'day' | 'week' | 'month' | 'year' | 'hour' | 'weekday'>('day');
  const [department, setDepartment] = useState('all');
  const [employee, setEmployee] = useState('all');
  const [internalExt, setInternalExt] = useState('');
  const trunkFilter: string = 'all';
  const statusFilter: string = 'all';
  const onlyProblems: boolean = false;
  const [activeTab, setActiveTab] = useState('overview');
  const [chartMode, setChartMode] = useState<ChartMode>('all');
  const [data, setData] = useState<DynamicDatapoint[]>([]);
  const [detailingData, setDetailingData] = useState<DetailingData | null>(null);
  const [lostCallDetails, setLostCallDetails] = useState<LostCallDetail[]>([]);
  const [lostCallSummary, setLostCallSummary] = useState<LostCallSummary | null>(null);
  const [slaSummary, setSlaSummary] = useState<SlaSummary | null>(null);
  const [usedSettings, setUsedSettings] = useState<UsedCallQualitySettings | null>(null);
  const [departmentSummary, setDepartmentSummary] = useState<DepartmentSummaryRow[]>([]);
  const [employeeSummary, setEmployeeSummary] = useState<EmployeeSummaryRow[]>([]);
  const [trunkSummary, setTrunkSummary] = useState<TrunkSummaryRow[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [clientAnalytics, setClientAnalytics] = useState<ClientAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshes, setRefreshes] = useState(0);

  const canShiftPeriod = Boolean(onStartDateChange && onEndDateChange && getShiftedPeriod(startDate, endDate, -1));

  const shiftPeriod = (direction: -1 | 1) => {
    const shifted = getShiftedPeriod(startDate, endDate, direction);
    if (!shifted) return;
    onStartDateChange?.(shifted.startDate);
    onEndDateChange?.(shifted.endDate);
  };


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
          employee,
          trunk: trunkFilter,
          onlyMyCalls: String(onlyMyCalls)
        });
        const explicitExtension = internalExt.trim();
        if (explicitExtension) params.set('extension', explicitExtension);
        if (onlyMyCalls && operatorExt.trim()) params.set('operatorExt', operatorExt.trim());
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
        setDepartmentSummary(Array.isArray(json.departmentSummary) ? json.departmentSummary : []);
        setEmployeeSummary(Array.isArray(json.employeeSummary) ? json.employeeSummary : []);
        setTrunkSummary(Array.isArray(json.trunkSummary) ? json.trunkSummary : []);
        setHeatmap(json.heatmap || null);
        setClientAnalytics(json.clientAnalytics || null);
        setUsedSettings(json.usedSettings || null);
        setError(json.dbError || '');
      } catch (err: any) {
        if (active) setError(err?.message || 'Не удалось загрузить данные аналитики.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDynamics();
    return () => { active = false; };
  }, [startDate, endDate, startTime, endTime, groupType, department, employee, internalExt, operatorExt, trunkFilter, onlyMyCalls, refreshes]);

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

  const departments = departmentSummary.length ? departmentSummary : (detailingData?.queues?.length ? detailingData.queues : (detailingData?.groups || []));
  const departmentOptions = useMemo(() => Array.from(new Set(departmentSummary.map(item => String(item.department || '').trim()).filter(Boolean))), [departmentSummary]);
  const legacyTrunks = detailingData?.trunks || [];
  const trunks: TrunkSummaryRow[] = trunkSummary.length ? trunkSummary : legacyTrunks.map(item => ({
    trunkName: item.name,
    totalCalls: item.totalCalls,
    answeredCalls: item.answeredCalls,
    acd: item.answeredCalls ? Math.round(item.duration / item.answeredCalls) : 0,
    asr: item.totalCalls ? Math.round((item.answeredCalls / item.totalCalls) * 100) : 0,
    loadPercent: 0,
    qualityLabel: item.totalCalls && (item.answeredCalls / item.totalCalls) >= 0.8 ? 'ok' : 'warning',
    statusText: item.totalCalls ? 'Проверить' : 'Нет данных',
    trunkType: 'unknown'
  }));
  const employees = useMemo(() => {
    const fromSummary = employeeSummary
      .map(item => ({ value: String(item.extension || '').trim(), label: formatEmployeeLabel(String(item.employeeName || item.extension || ''), String(item.extension || '')) }))
      .filter(item => internalExtensionPattern.test(item.value));
    const fromAccess = accessUsers
      .map(user => ({ value: String(user.extension || '').trim(), label: formatEmployeeLabel(String(user.name || user.username || user.extension || ''), String(user.extension || '')) }))
      .filter(item => internalExtensionPattern.test(item.value));
    const fromDirectory = directory
      .filter(item => item.type === 'internal')
      .map(item => {
        const extension = String(item.internalExtension || item.number || '').trim();
        return { value: extension, label: formatEmployeeLabel(String(item.name || extension), extension) };
      })
      .filter(item => internalExtensionPattern.test(item.value));
    const seen = new Set<string>();
    return [...fromSummary, ...fromAccess, ...fromDirectory].filter(item => { if (seen.has(item.value)) return false; seen.add(item.value); return true; }).slice(0, 80);
  }, [accessUsers, directory, employeeSummary]);

  const effectiveAnswerSlaSeconds = usedSettings?.answerSlaSeconds ?? settings?.answerSlaSeconds ?? slaSummary?.slaThresholdSeconds ?? 20;
  const slaPercentValue = slaSummary && Number.isFinite(Number(slaSummary.slaPercent)) ? Number(slaSummary.slaPercent) : summary.sla;
  const averageWaitValue = slaSummary ? slaSummary.averageWaitSeconds : summary.avgWait;
  const callbackAfterMissedValue = lostCallSummary && Number.isFinite(Number(lostCallSummary.callbackAfterMissed)) ? Number(lostCallSummary.callbackAfterMissed) : summary.processed;
  const lostCallsValue = lostCallSummary && Number.isFinite(Number(lostCallSummary.lostCalls)) ? Number(lostCallSummary.lostCalls) : summary.lost;

  const tabs = [
    ['overview', 'Обзор'],
    ['inbound', 'Входящие'],
    ['outgoing', 'Исходящие'],
    ['departments', 'Отделы'],
    ['employees', 'Сотрудники'],
    ['clients', 'Клиенты'],
    ['trunks', 'Линии'],
    ['marketing', 'Маркетинг'],
    ['reports', 'Отчеты']
  ];

  const periodLabel = startDate + ' - ' + endDate;
  const clientInitiative = clientAnalytics?.initiative || { incoming: 0, outgoing: 0, total: 0, incomingPercent: 0, outgoingPercent: 0, interestIndex: 0 };
  const hasClientInitiative = Number(clientInitiative.total || 0) > 0;
  const clientInitiativeDonutData = [
    { name: 'Входящие от клиентов', value: Number(clientInitiative.incoming || 0) },
    { name: 'Исходящие клиентам', value: Number(clientInitiative.outgoing || 0) }
  ];

  return (
    <div className="w-full space-y-4" id="reports-tab-container">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => shiftPeriod(-1)} className={periodShiftButtonClass} disabled={!canShiftPeriod} title="Предыдущий период" aria-label="Предыдущий период">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="w-[130px]"><RussianDatePicker value={startDate} onChange={value => onStartDateChange?.(value)} ariaLabel="Дата начала периода" buttonClassName={reportDatePickerButtonClass} accent="blue" /></div>
            <div className="w-[130px]"><RussianDatePicker value={endDate} onChange={value => onEndDateChange?.(value)} ariaLabel="Дата окончания периода" buttonClassName={reportDatePickerButtonClass} accent="blue" /></div>
            <button type="button" onClick={() => shiftPeriod(1)} className={periodShiftButtonClass} disabled={!canShiftPeriod} title="Следующий период" aria-label="Следующий период">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="w-[92px]"><select value={groupType} onChange={e => setGroupType(e.target.value as typeof groupType)} className={controlClass()} aria-label="Шаг группировки"><option value="day">День</option><option value="week">Неделя</option><option value="month">Месяц</option><option value="hour">Час</option><option value="weekday">День недели</option><option value="year">Год</option></select></div>
            <div className="w-[128px]"><select value={department} onChange={e => setDepartment(e.target.value)} className={controlClass()} aria-label="Отдел"><option value="all">Все отделы</option>{departmentOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="sales">Продажи</option><option value="support">Поддержка</option><option value="accounting">Бухгалтерия</option><option value="logistics">Логистика</option></select></div>
            <div className="w-[166px]"><select value={employee} onChange={e => setEmployee(e.target.value)} className={controlClass()} aria-label="Сотрудник"><option value="all">Все сотрудники</option>{employees.map(item => <option key={item.value + item.label} value={item.value}>{item.label}</option>)}</select></div>
            <div className="w-[132px]"><input value={internalExt} onChange={e => setInternalExt(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Все номера" className={controlClass()} aria-label="Внутренний номер" /></div>
            <button onClick={() => setRefreshes(v => v + 1)} className="ml-auto inline-flex h-8 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60" disabled={loading}>
              <RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />Обновить
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"><Activity className="mr-2 inline h-4 w-4" />{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-max gap-1">
          {tabs.map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} className={['whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black transition', activeTab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'].join(' ')}>{label}</button>)}
        </div>
      </div>

      {activeTab === 'clients' ? (
        <ClientAnalyticsPanel analytics={clientAnalytics} periodLabel={periodLabel} />
      ) : activeTab === 'inbound' ? (
        <InboundDashboard 
          slaSummary={slaSummary}
          lostCallSummary={lostCallSummary}
          detailingData={detailingData}
          employeeSummary={employeeSummary}
          heatmap={heatmap}
          loading={loading}
          effectiveAnswerSlaSeconds={effectiveAnswerSlaSeconds}
        />
      ) : activeTab === 'outgoing' ? (
        <OutgoingDashboard
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
        />
      ) : activeTab === 'departments' ? (
        <DepartmentsDashboard 
          departmentSummary={departments}
          loading={loading}
          effectiveAnswerSlaSeconds={effectiveAnswerSlaSeconds}
        />
      ) : activeTab === 'employees' ? (
        <EmployeesDashboard 
          employeeSummary={employeeSummary}
          loading={loading}
          effectiveAnswerSlaSeconds={effectiveAnswerSlaSeconds}
        />
      ) : activeTab === 'trunks' ? (
        <LinesDashboard 
          trunks={trunks}
          loading={loading}
          effectiveAnswerSlaSeconds={effectiveAnswerSlaSeconds}
        />
      ) : (
        <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <StatsKpiCard label="Всего звонков" value={summary.total.toLocaleString('ru-RU')} hint="Общая активность" icon={Phone} tone="blue" badge={loading ? 'Загрузка' : 'Live'} />
        <StatsKpiCard label="Входящие" value={summary.inbound.toLocaleString('ru-RU')} hint="Клиентский поток" icon={PhoneIncoming} tone="green" />
        <StatsKpiCard label="Исходящие" value={summary.outbound.toLocaleString('ru-RU')} hint="Активность операторов" icon={PhoneOutgoing} tone="blue" />
        <StatsKpiCard label="Пропущенные" value={summary.missed.toLocaleString('ru-RU')} hint="Требуют контроля" icon={PhoneMissed} tone="orange" />
        <StatsKpiCard label="Потерянные" value={lostCallsValue.toLocaleString('ru-RU')} hint="Без успешного перезвона" icon={XCircle} tone="red" />
        <StatsKpiCard label="SLA" value={slaPercentValue + '%'} hint={'Ответ до ' + effectiveAnswerSlaSeconds + ' сек'} icon={ShieldCheck} tone="purple" />
        <StatsKpiCard label="Среднее ожидание" value={formatNullableDuration(averageWaitValue)} hint="По отвеченным" icon={Clock} tone="orange" />
        <StatsKpiCard label="Обработанные пропущенные" value={callbackAfterMissedValue.toLocaleString('ru-RU')} hint="Был успешный перезвон" icon={TrendingUp} tone="green" />
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]">
            <OverviewCallDynamicsChart data={visibleData} groupType={groupType} startDate={startDate} endDate={endDate} />
            <div className="flex h-full min-h-[420px] flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Инициатива контакта</div>
              <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Входящие и исходящие клиентские звонки</div>
              {hasClientInitiative ? (
                <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
                  <div className="flex min-h-[170px] flex-1 items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={clientInitiativeDonutData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={66} paddingAngle={3}>
                          {clientInitiativeDonutData.map((_, index) => <Cell key={index} fill={index === 0 ? '#2563eb' : '#10b981'} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 text-xs font-bold">
                    <div className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Входящие от клиентов: {Number(clientInitiative.incoming || 0).toLocaleString('ru-RU')} ({Number(clientInitiative.incomingPercent || 0)}%)</div>
                    <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Исходящие клиентам: {Number(clientInitiative.outgoing || 0).toLocaleString('ru-RU')} ({Number(clientInitiative.outgoingPercent || 0)}%)</div>
                    <div className="rounded-xl border border-slate-100 p-3 font-black text-slate-700 dark:border-slate-800 dark:text-slate-200">Индекс заинтересованности: {Number(clientInitiative.interestIndex || 0)}%</div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">Нет данных по инициативе контакта за выбранный период</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            <CallFunnelWidget inbound={slaSummary?.inboundCalls ?? summary.inbound} missed={slaSummary?.missedInboundCalls ?? summary.missed} processed={callbackAfterMissedValue} lost={lostCallsValue} />
            <CallHeatmap data={visibleData} heatmap={heatmap} />
          </div>
        </>
      ) : (
        <>
          <CallDirectionChart data={visibleData} mode={chartMode} onModeChange={setChartMode} groupType={groupType} startDate={startDate} endDate={endDate} />
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            <CallFunnelWidget inbound={slaSummary?.inboundCalls ?? summary.inbound} missed={slaSummary?.missedInboundCalls ?? summary.missed} processed={callbackAfterMissedValue} lost={lostCallsValue} />
            <CallHeatmap data={visibleData} heatmap={heatmap} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ProblemDepartmentsTable rows={departments} />
        <LostCallsTable data={visibleData} items={lostCallDetails} />
        <TrunkHealthWidget rows={trunkFilter === 'all' || trunkSummary.length ? trunks : trunks.filter(item => item.trunkName === trunkFilter)} />
      </div>

      {visibleData.length === 0 && !loading && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">Нет данных за выбранный период</div>}
        </>
      )}
    </div>
  );
}
