import React, { useState, useMemo } from 'react';
import {
  Users, Search, Award, TrendingUp, PhoneIncoming, PhoneOutgoing, 
  Clock, ShieldAlert, CheckCircle, Download, UserCheck, Flame, 
  HelpCircle, ChevronDown, ChevronUp, BarChart2, Star, ArrowUpDown
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, ComposedChart, AreaChart, Area, Cell
} from 'recharts';
import { getServerNow } from '../../../utils/serverClock';

export interface EmployeeSummaryRow {
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

type EmployeesDashboardProps = {
  employeeSummary: EmployeeSummaryRow[];
  loading?: boolean;
  effectiveAnswerSlaSeconds?: number;
};

type AnalysisAngle = 'overview' | 'activity' | 'quality' | 'recovery';

export function EmployeesDashboard({ 
  employeeSummary, 
  loading = false,
  effectiveAnswerSlaSeconds = 20
}: EmployeesDashboardProps) {
  const [selectedAngle, setSelectedAngle] = useState<AnalysisAngle>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [sortField, setSortField] = useState<keyof EmployeeSummaryRow>('inboundCalls');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Helper safe number conversion
  const n = (val: unknown) => {
    const num = Number(val || 0);
    return Number.isFinite(num) ? num : 0;
  };

  const text = (val: unknown) => {
    return String(val || '').trim();
  };

  const formatSeconds = (sec: number | null | undefined) => {
    if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return '—';
    const s = Math.round(Number(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  // Get departments list
  const departments = useMemo(() => {
    const list = new Set<string>();
    employeeSummary.forEach(emp => {
      const dep = text(emp.department);
      if (dep) list.add(dep);
    });
    return Array.from(list);
  }, [employeeSummary]);

  // Filter & Search
  const filteredEmployees = useMemo(() => {
    return employeeSummary.filter(emp => {
      const name = text(emp.employeeName).toLowerCase();
      const ext = text(emp.extension).toLowerCase();
      const dep = text(emp.department).toLowerCase();
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || ext.includes(searchQuery.toLowerCase());
      const matchesDep = selectedDepartment === 'all' || dep === selectedDepartment.toLowerCase();
      return matchesSearch && matchesDep;
    });
  }, [employeeSummary, searchQuery, selectedDepartment]);

  // Handle Sort
  const handleSort = (field: keyof EmployeeSummaryRow) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sorted Employees
  const sortedEmployees = useMemo(() => {
    const sorted = [...filteredEmployees];
    sorted.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // Handle null/undefined values
      if (valA === null || valA === undefined) valA = sortDirection === 'asc' ? Infinity : -Infinity;
      if (valB === null || valB === undefined) valB = sortDirection === 'asc' ? -Infinity : Infinity;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? (n(valA) - n(valB)) : (n(valB) - n(valA));
    });
    return sorted;
  }, [filteredEmployees, sortField, sortDirection]);

  // Multi-angle Top-performer Insights
  const insights = useMemo(() => {
    if (employeeSummary.length === 0) return null;

    let bestSla: EmployeeSummaryRow | null = null;
    let mostInbound: EmployeeSummaryRow | null = null;
    let mostOutbound: EmployeeSummaryRow | null = null;
    let fastestResponse: EmployeeSummaryRow | null = null;

    employeeSummary.forEach(emp => {
      // 1. Best SLA (SLA >= 80% and significant inbound calls)
      if (n(emp.inboundCalls) >= 5) {
        if (!bestSla || n(emp.slaPercent) > n(bestSla.slaPercent)) {
          bestSla = emp;
        }
      }
      // 2. Most Inbound
      if (!mostInbound || n(emp.inboundCalls) > n(mostInbound.inboundCalls)) {
        mostInbound = emp;
      }
      // 3. Most Outbound
      if (!mostOutbound || n(emp.outboundCalls) > n(mostOutbound.outboundCalls)) {
        mostOutbound = emp;
      }
      // 4. Fastest response (minimum wait time and handled some calls)
      if (n(emp.answeredCalls) >= 5 && emp.averageWaitSeconds !== null && emp.averageWaitSeconds !== undefined) {
        if (!fastestResponse || n(emp.averageWaitSeconds) < n(fastestResponse.averageWaitSeconds)) {
          fastestResponse = emp;
        }
      }
    });

    return { bestSla, mostInbound, mostOutbound, fastestResponse };
  }, [employeeSummary]);

  // Chart data preps
  const topEmployeesByVolume = useMemo(() => {
    return [...employeeSummary]
      .sort((a, b) => (n(b.inboundCalls) + n(b.outboundCalls)) - (n(a.inboundCalls) + n(a.outboundCalls)))
      .slice(0, 10)
      .map(emp => ({
        name: text(emp.employeeName) || text(emp.extension) || 'Неизвестно',
        extension: text(emp.extension),
        'Входящие': n(emp.inboundCalls),
        'Исходящие': n(emp.outboundCalls),
        'Всего': n(emp.inboundCalls) + n(emp.outboundCalls)
      }));
  }, [employeeSummary]);

  const topEmployeesByQuality = useMemo(() => {
    return [...employeeSummary]
      .filter(emp => n(emp.inboundCalls) > 0)
      .sort((a, b) => n(b.slaPercent) - n(a.slaPercent))
      .slice(0, 10)
      .map(emp => ({
        name: text(emp.employeeName) || text(emp.extension) || 'Неизвестно',
        'SLA %': n(emp.slaPercent),
        'Ср. ожидание (сек)': n(emp.averageWaitSeconds),
      }));
  }, [employeeSummary]);

  const topEmployeesByRecovery = useMemo(() => {
    return [...employeeSummary]
      .filter(emp => n(emp.missedCalls) > 0)
      .sort((a, b) => n(b.callbackRate) - n(a.callbackRate))
      .slice(0, 10)
      .map(emp => ({
        name: text(emp.employeeName) || text(emp.extension) || 'Неизвестно',
        'Пропущенные': n(emp.missedCalls),
        'Перезвоны': n(emp.callbackAfterMissed),
        'Уровень перезвона %': Math.round(n(emp.callbackRate))
      }));
  }, [employeeSummary]);

  // Overall statistics
  const averages = useMemo(() => {
    if (employeeSummary.length === 0) return { sla: 0, wait: 0, callback: 0, inbound: 0, outbound: 0 };
    let totalInbound = 0;
    let totalOutbound = 0;
    let sumSla = 0;
    let countSla = 0;
    let sumWait = 0;
    let countWait = 0;
    let sumCallbackRate = 0;
    let countCallback = 0;

    employeeSummary.forEach(emp => {
      totalInbound += n(emp.inboundCalls);
      totalOutbound += n(emp.outboundCalls);

      if (emp.slaPercent !== null && emp.slaPercent !== undefined) {
        sumSla += emp.slaPercent;
        countSla++;
      }
      if (emp.averageWaitSeconds !== null && emp.averageWaitSeconds !== undefined && n(emp.answeredCalls) > 0) {
        sumWait += emp.averageWaitSeconds;
        countWait++;
      }
      if (emp.callbackRate !== null && emp.callbackRate !== undefined && n(emp.missedCalls) > 0) {
        sumCallbackRate += emp.callbackRate;
        countCallback++;
      }
    });

    return {
      inbound: totalInbound,
      outbound: totalOutbound,
      sla: countSla ? Math.round(sumSla / countSla) : 0,
      wait: countWait ? Math.round(sumWait / countWait) : 0,
      callback: countCallback ? Math.round(sumCallbackRate / countCallback) : 0
    };
  }, [employeeSummary]);

  // Export CSV helper
  const handleExportCSV = () => {
    const headers = ['Сотрудник', 'Вн. номер', 'Отдел', 'Входящие', 'Исходящие', 'Отвечено', 'Пропущенные', 'SLA %', 'Ср. ожидание (сек)', 'Разговоры ср. (сек)', 'Перезвонено'];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    
    const lines = [
      headers.join(';'),
      ...employeeSummary.map(emp => [
        escape(emp.employeeName),
        escape(emp.extension),
        escape(emp.department),
        n(emp.inboundCalls),
        n(emp.outboundCalls),
        n(emp.answeredCalls),
        n(emp.missedCalls),
        emp.slaPercent !== null ? `${n(emp.slaPercent)}%` : '—',
        emp.averageWaitSeconds !== null ? n(emp.averageWaitSeconds) : '—',
        n(emp.averageDurationSeconds),
        n(emp.callbackAfterMissed)
      ].join(';'))
    ];

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employee_analytics_${getServerNow().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSortIcon = (field: keyof EmployeeSummaryRow) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40 hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc' 
      ? <ChevronUp className="ml-1 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" /> 
      : <ChevronDown className="ml-1 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" />;
  };

  return (
    <div className="space-y-6" id="employees-dashboard-panel">
      {/* KPI Cards / Leaders Section */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" id="employees-leaders-cards">
        {/* Leader Inbound */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Максимум входящих</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.mostInbound ? `${insights.mostInbound.employeeName || 'Без имени'}` : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.mostInbound ? `Вн: ${insights.mostInbound.extension} (${n(insights.mostInbound.inboundCalls)} звонков)` : '—'}
            </div>
          </div>
        </div>

        {/* Leader Outbound */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Flame className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Лидер исходящей линии</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.mostOutbound ? `${insights.mostOutbound.employeeName || 'Без имени'}` : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.mostOutbound ? `Вн: ${insights.mostOutbound.extension} (${n(insights.mostOutbound.outboundCalls)} звонков)` : '—'}
            </div>
          </div>
        </div>

        {/* Best SLA */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4">
          <div className="rounded-xl bg-purple-50 p-3 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <UserCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Максимальный SLA (скорость)</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.bestSla ? `${insights.bestSla.employeeName || 'Без имени'}` : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.bestSla ? `Вн: ${insights.bestSla.extension} (${n(insights.bestSla.slaPercent)}% SLA)` : '—'}
            </div>
          </div>
        </div>

        {/* Fastest Response */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Быстрый ответ (в среднем)</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.fastestResponse ? `${insights.fastestResponse.employeeName || 'Без имени'}` : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.fastestResponse ? `Вн: ${insights.fastestResponse.extension} (${n(insights.fastestResponse.averageWaitSeconds)} сек)` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Angle Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-1" id="employees-dashboard-angles-tab">
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => setSelectedAngle('overview')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              selectedAngle === 'overview' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Общий обзор
          </button>
          <button 
            type="button"
            onClick={() => setSelectedAngle('activity')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              selectedAngle === 'activity' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Активность и объем вызовов
          </button>
          <button 
            type="button"
            onClick={() => setSelectedAngle('quality')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              selectedAngle === 'quality' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Ответы и SLA
          </button>
          <button 
            type="button"
            onClick={() => setSelectedAngle('recovery')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              selectedAngle === 'recovery' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Потери и перезвоны
          </button>
        </div>

        {/* CSV Export Button */}
        <button 
          onClick={handleExportCSV} 
          disabled={employeeSummary.length === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          Экспорт в CSV
        </button>
      </div>

      {/* Visual Analytics Angle charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="employees-visual-charts">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col h-[380px]" id="employees-main-chart-card">
          <div className="mb-4">
            <h3 className="text-base font-black text-slate-950 dark:text-white">
              {selectedAngle === 'overview' && 'Топ-10 сотрудников по общей нагрузке'}
              {selectedAngle === 'activity' && 'Распределение звонков: Входящие vs Исходящие'}
              {selectedAngle === 'quality' && 'Сравнение SLA % сотрудников'}
              {selectedAngle === 'recovery' && 'Обработка пропущенных вызовов сотрудниками'}
            </h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {selectedAngle === 'overview' && 'Учитывает суммарное количество входящих и исходящих звонков за период'}
              {selectedAngle === 'activity' && 'Анализ направлений звонков для распределения операторской нагрузки'}
              {selectedAngle === 'quality' && 'Эффективность ответа в пределах SLA (регламент ответа за 20 секунд)'}
              {selectedAngle === 'recovery' && 'Количество пропущенных звонков на сотрудника и уровень успешных перезвонов'}
            </p>
          </div>

          <div className="flex-1 w-full min-h-0">
            {employeeSummary.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-4">
                <BarChart2 className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">Нет данных для визуализации за период</p>
              </div>
            ) : selectedAngle === 'overview' || selectedAngle === 'activity' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEmployeesByVolume} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Входящие" dataKey="Входящие" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar name="Исходящие" dataKey="Исходящие" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : selectedAngle === 'quality' ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={topEmployeesByQuality} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis yAxisId="left" label={{ value: 'SLA %', angle: -90, position: 'insideLeft', fontSize: 10 }} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Ожидание (сек)', angle: 90, position: 'insideRight', fontSize: 10 }} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" name="SLA %" dataKey="SLA %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" name="Ср. ожидание (сек)" type="monotone" dataKey="Ср. ожидание (сек)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={topEmployeesByRecovery} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorMissed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCallback" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area name="Пропущенные звонки" type="monotone" dataKey="Пропущенные" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorMissed)" />
                  <Area name="Успешные перезвоны" type="monotone" dataKey="Перезвоны" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCallback)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Side-by-Side aggregate state */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-[380px]" id="employees-aggregates-card">
          <div>
            <h3 className="text-base font-black text-slate-950 dark:text-white">Средние показатели по штату</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Статистика по всем операторам за выбранный период времени</p>
          </div>

          <div className="space-y-4 my-auto">
            {/* SLA circle or stat */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Средний SLA</span>
              </div>
              <span className={`text-sm font-black font-mono ${
                averages.sla >= 85 ? 'text-emerald-600' : averages.sla >= 65 ? 'text-amber-500' : 'text-rose-500'
              }`}>
                {averages.sla}%
              </span>
            </div>

            {/* Wait time */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Ср. ожидание на линии</span>
              </div>
              <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">
                {averages.wait} сек
              </span>
            </div>

            {/* Total Inbound/Outbound ratio bar */}
            <div className="p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20 space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Пропорции звонков</span>
                <span className="font-mono">{averages.inbound} вх / {averages.outbound} исх</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className="h-full bg-blue-500" 
                  style={{ width: `${averages.inbound + averages.outbound > 0 ? (averages.inbound / (averages.inbound + averages.outbound)) * 100 : 50}%` }}
                  title="Входящие"
                />
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: `${averages.inbound + averages.outbound > 0 ? (averages.outbound / (averages.inbound + averages.outbound)) * 100 : 50}%` }}
                  title="Исходящие"
                />
              </div>
              <div className="flex justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
                <span className="text-blue-500">Входящие ({averages.inbound + averages.outbound > 0 ? Math.round((averages.inbound / (averages.inbound + averages.outbound)) * 100) : 0}%)</span>
                <span className="text-emerald-500">Исходящие ({averages.inbound + averages.outbound > 0 ? Math.round((averages.outbound / (averages.inbound + averages.outbound)) * 100) : 0}%)</span>
              </div>
            </div>

            {/* Callback Rate */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Перезваниваемость пропущенных</span>
              </div>
              <span className={`text-sm font-black font-mono ${
                averages.callback >= 75 ? 'text-emerald-600' : averages.callback >= 50 ? 'text-amber-500' : 'text-rose-500'
              }`}>
                {averages.callback}%
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/40 dark:border-blue-900/20 p-2.5 text-[10px] text-blue-800 dark:text-blue-400 font-semibold leading-relaxed">
            <span className="flex gap-1.5 items-start">
              <Star className="h-4 w-4 shrink-0 text-blue-500 fill-blue-500" />
              <span>Показатель SLA измеряет долю звонков, отвеченных сотрудником быстрее регламентированных {effectiveAnswerSlaSeconds} секунд.</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Employee Matrix / Filter Panel */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" id="employees-matrix-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-black text-slate-950 dark:text-white">Сравнительная матрица сотрудников</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Детальные показатели по каждому сотруднику с возможностью гибкой сортировки</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Поиск по имени или вн."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200/80 bg-white pl-8 pr-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950/40"
              />
            </div>

            {/* Department selector */}
            <select 
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              className="h-8 rounded-lg border border-slate-200/80 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-950/40"
            >
              <option value="all">Все отделы</option>
              {departments.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse" id="employees-dashboard-table">
            <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
              <tr className="divide-x divide-slate-100 dark:divide-slate-800">
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('employeeName')}>
                  <div className="flex items-center">Сотрудник {getSortIcon('employeeName')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('department')}>
                  <div className="flex items-center justify-center">Отдел {getSortIcon('department')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('inboundCalls')}>
                  <div className="flex items-center justify-center">Входящие {getSortIcon('inboundCalls')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('outboundCalls')}>
                  <div className="flex items-center justify-center">Исходящие {getSortIcon('outboundCalls')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('answeredCalls')}>
                  <div className="flex items-center justify-center">Отвечено {getSortIcon('answeredCalls')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('missedCalls')}>
                  <div className="flex items-center justify-center">Пропущено {getSortIcon('missedCalls')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('slaPercent')}>
                  <div className="flex items-center justify-center">SLA % {getSortIcon('slaPercent')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('averageWaitSeconds')}>
                  <div className="flex items-center justify-center">Ожидание {getSortIcon('averageWaitSeconds')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('averageDurationSeconds')}>
                  <div className="flex items-center justify-center">Ср. разг. {getSortIcon('averageDurationSeconds')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('callbackRate')}>
                  <div className="flex items-center justify-center">Перезвоны % {getSortIcon('callbackRate')}</div>
                </th>
                <th className="px-3 py-3 text-center">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedEmployees.length > 0 ? (
                sortedEmployees.map((emp, index) => {
                  const total = n(emp.inboundCalls) + n(emp.outboundCalls);
                  const answered = n(emp.answeredCalls);
                  const sla = emp.slaPercent !== null && emp.slaPercent !== undefined ? emp.slaPercent : null;
                  const wait = emp.averageWaitSeconds !== null && emp.averageWaitSeconds !== undefined ? emp.averageWaitSeconds : null;
                  const callback = emp.callbackRate !== null && emp.callbackRate !== undefined ? emp.callbackRate : null;

                  // Evaluate a human status for the operator
                  let statusLabel = 'Отлично';
                  let statusColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                  
                  if (sla !== null && sla < 65 && total > 5) {
                    statusLabel = 'Низкий SLA';
                    statusColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
                  } else if (wait !== null && wait > 30 && answered > 5) {
                    statusLabel = 'Долгое ожидание';
                    statusColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
                  } else if (n(emp.missedCalls) > 3 && n(emp.callbackAfterMissed) === 0) {
                    statusLabel = 'Без перезвонов';
                    statusColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
                  } else if (total === 0) {
                    statusLabel = 'Нет звонков';
                    statusColor = 'bg-slate-50 text-slate-500 dark:bg-slate-950/20 dark:text-slate-400';
                  } else if (sla !== null && sla < 85) {
                    statusLabel = 'Нормально';
                    statusColor = 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400';
                  }

                  // Employee Initials
                  const nameStr = text(emp.employeeName);
                  const initials = nameStr ? nameStr.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : '👤';

                  return (
                    <tr 
                      key={text(emp.extension) + index} 
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10 transition-colors"
                      id={`emp-row-${emp.extension}`}
                    >
                      {/* Name & Ext */}
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center text-xs font-black">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-200">
                              {emp.employeeName || 'Без имени'}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-semibold font-mono">
                              Вн. номер: {emp.extension}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-3 py-3.5 text-center text-slate-600 dark:text-slate-300 font-semibold">
                        {emp.department || '—'}
                      </td>

                      {/* Inbound */}
                      <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {n(emp.inboundCalls)}
                      </td>

                      {/* Outbound */}
                      <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {n(emp.outboundCalls)}
                      </td>

                      {/* Answered */}
                      <td className="px-3 py-3.5 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {n(emp.answeredCalls)}
                      </td>

                      {/* Missed */}
                      <td className="px-3 py-3.5 text-center font-mono font-semibold text-rose-500">
                        {n(emp.missedCalls)}
                      </td>

                      {/* SLA % */}
                      <td className="px-3 py-3.5 text-center">
                        {sla !== null ? (
                          <span className={`font-mono font-black ${
                            sla >= 85 ? 'text-emerald-600' : sla >= 65 ? 'text-amber-500' : 'text-rose-500'
                          }`}>
                            {sla}%
                          </span>
                        ) : '—'}
                      </td>

                      {/* Wait Time */}
                      <td className="px-3 py-3.5 text-center font-mono text-slate-600 dark:text-slate-300">
                        {wait !== null ? `${wait} сек` : '—'}
                      </td>

                      {/* Average talk duration */}
                      <td className="px-3 py-3.5 text-center font-mono text-slate-600 dark:text-slate-300">
                        {formatSeconds(emp.averageDurationSeconds)}
                      </td>

                      {/* Callback rate */}
                      <td className="px-3 py-3.5 text-center">
                        {n(emp.missedCalls) > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono font-bold text-emerald-600">
                              {Math.round(n(callback))}%
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold">
                              {n(emp.callbackAfterMissed)} из {n(emp.missedCalls)}
                            </span>
                          </div>
                        ) : '—'}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400 font-semibold">
                    Сотрудники не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
