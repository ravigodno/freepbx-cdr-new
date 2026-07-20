import React, { useState, useMemo } from 'react';
import { 
  Building2, Search, Award, TrendingUp, PhoneIncoming, PhoneOutgoing, 
  Clock, ShieldAlert, CheckCircle, Download, Users, Flame, 
  HelpCircle, ChevronDown, ChevronUp, BarChart2, Star, ArrowUpDown
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, ComposedChart, AreaChart, Area, Cell
} from 'recharts';
import { DepartmentSummaryRow } from './ProblemDepartmentsTable';
import { getServerNow } from '../../../utils/serverClock';

type DepartmentsDashboardProps = {
  departmentSummary: any[];
  loading?: boolean;
  effectiveAnswerSlaSeconds?: number;
};

type DepartmentAnalysisAngle = 'overview' | 'load' | 'quality_lost';

export function DepartmentsDashboard({ 
  departmentSummary, 
  loading = false,
  effectiveAnswerSlaSeconds = 20
}: DepartmentsDashboardProps) {
  const [selectedAngle, setSelectedAngle] = useState<DepartmentAnalysisAngle>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof DepartmentSummaryRow>('inboundCalls');
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

  // Normalization for legacy / mixed row structures (such as queues/groups data)
  const normalizedSummary = useMemo<DepartmentSummaryRow[]>(() => {
    if (!Array.isArray(departmentSummary)) return [];
    return departmentSummary.map((row: any) => {
      if (!row) return {};
      if ('department' in row || 'slaPercent' in row || 'lostCalls' in row) {
        return row as DepartmentSummaryRow;
      }
      // It's a legacy Row (e.g. from detailingData.queues or detailingData.groups)
      const totalCalls = n(row.totalCalls);
      const answeredCalls = n(row.answeredCalls);
      const ratio = totalCalls ? Math.round((answeredCalls / totalCalls) * 100) : 0;
      return {
        department: row.name || row.department || '',
        managerName: row.managerName || null,
        inboundCalls: totalCalls,
        outboundCalls: n(row.outboundCalls),
        answeredCalls: answeredCalls,
        missedCalls: Math.max(0, totalCalls - answeredCalls),
        lostCalls: n(row.lostCalls),
        callbackAfterMissed: n(row.callbackAfterMissed),
        callbackRate: n(row.callbackRate),
        averageWaitSeconds: row.averageWaitSeconds !== undefined ? row.averageWaitSeconds : null,
        slaPercent: ratio,
        averageDurationSeconds: row.averageDurationSeconds !== undefined ? row.averageDurationSeconds : (answeredCalls ? Math.round(row.duration / answeredCalls) : 0),
        status: row.status || (ratio >= 80 ? 'ok' : ratio >= 55 ? 'warning' : 'problem')
      };
    });
  }, [departmentSummary]);

  // Filter & Search
  const filteredDepartments = useMemo(() => {
    return normalizedSummary.filter(dep => {
      const name = text(dep.department).toLowerCase();
      const manager = text(dep.managerName).toLowerCase();
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || manager.includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [normalizedSummary, searchQuery]);

  // Handle Sort
  const handleSort = (field: keyof DepartmentSummaryRow) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sorted Departments
  const sortedDepartments = useMemo(() => {
    const sorted = [...filteredDepartments];
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
  }, [filteredDepartments, sortField, sortDirection]);

  // Insights / Leader departments
  const insights = useMemo(() => {
    if (normalizedSummary.length === 0) return null;

    let bestSlaDep: DepartmentSummaryRow | null = null;
    let maxVolumeDep: DepartmentSummaryRow | null = null;
    let lowestWaitDep: DepartmentSummaryRow | null = null;
    let bestCallbackDep: DepartmentSummaryRow | null = null;

    normalizedSummary.forEach(dep => {
      const totalCalls = n(dep.inboundCalls) + n(dep.outboundCalls);
      
      // 1. Best SLA (minimum of 3 inbound calls to be representative)
      if (n(dep.inboundCalls) >= 3) {
        if (!bestSlaDep || n(dep.slaPercent) > n(bestSlaDep.slaPercent)) {
          bestSlaDep = dep;
        }
      }
      // 2. Highest volume
      if (!maxVolumeDep || totalCalls > (n(maxVolumeDep.inboundCalls) + n(maxVolumeDep.outboundCalls))) {
        maxVolumeDep = dep;
      }
      // 3. Lowest Wait time (must have answered inbound calls)
      if (n(dep.answeredCalls) >= 3 && dep.averageWaitSeconds !== null && dep.averageWaitSeconds !== undefined) {
        if (!lowestWaitDep || n(dep.averageWaitSeconds) < n(lowestWaitDep.averageWaitSeconds)) {
          lowestWaitDep = dep;
        }
      }
      // 4. Best callback rate (must have missed calls)
      if (n(dep.missedCalls) >= 3 && dep.callbackRate !== null && dep.callbackRate !== undefined) {
        if (!bestCallbackDep || n(dep.callbackRate) > n(bestCallbackDep.callbackRate)) {
          bestCallbackDep = dep;
        }
      }
    });

    return { bestSlaDep, maxVolumeDep, lowestWaitDep, bestCallbackDep };
  }, [normalizedSummary]);

  // Chart data preps
  const chartDataOverview = useMemo(() => {
    return [...normalizedSummary]
      .sort((a, b) => (n(b.inboundCalls) + n(b.outboundCalls)) - (n(a.inboundCalls) + n(a.outboundCalls)))
      .map(dep => ({
        name: text(dep.department) || 'Неизвестный отдел',
        'Входящие': n(dep.inboundCalls),
        'Исходящие': n(dep.outboundCalls),
        'Отвечено': n(dep.answeredCalls),
        'Пропущено': n(dep.missedCalls),
        'Потеряно': n(dep.lostCalls),
        'SLA %': n(dep.slaPercent),
      }));
  }, [normalizedSummary]);

  // Overall Statistics
  const aggregateStats = useMemo(() => {
    let inboundTotal = 0;
    let outboundTotal = 0;
    let answeredTotal = 0;
    let missedTotal = 0;
    let lostTotal = 0;
    let sumSla = 0;
    let countSla = 0;
    let sumWait = 0;
    let countWait = 0;

    normalizedSummary.forEach(dep => {
      inboundTotal += n(dep.inboundCalls);
      outboundTotal += n(dep.outboundCalls);
      answeredTotal += n(dep.answeredCalls);
      missedTotal += n(dep.missedCalls);
      lostTotal += n(dep.lostCalls);

      if (dep.slaPercent !== null && dep.slaPercent !== undefined) {
        sumSla += dep.slaPercent;
        countSla++;
      }
      if (dep.averageWaitSeconds !== null && dep.averageWaitSeconds !== undefined && n(dep.answeredCalls) > 0) {
        sumWait += dep.averageWaitSeconds;
        countWait++;
      }
    });

    return {
      inbound: inboundTotal,
      outbound: outboundTotal,
      answered: answeredTotal,
      missed: missedTotal,
      lost: lostTotal,
      averageSla: countSla ? Math.round(sumSla / countSla) : 0,
      averageWait: countWait ? Math.round(sumWait / countWait) : 0
    };
  }, [normalizedSummary]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Отдел', 'Руководитель', 'Входящие', 'Исходящие', 'Отвечено', 'Пропущено', 'SLA %', 'Ср. ожидание (сек)', 'Разговоры ср. (сек)', 'Статус'];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [
      headers.join(';'),
      ...normalizedSummary.map(dep => [
        escape(dep.department),
        escape(dep.managerName),
        n(dep.inboundCalls),
        n(dep.outboundCalls),
        n(dep.answeredCalls),
        n(dep.missedCalls),
        dep.slaPercent !== null ? `${n(dep.slaPercent)}%` : '—',
        dep.averageWaitSeconds !== null ? n(dep.averageWaitSeconds) : '—',
        n(dep.averageDurationSeconds),
        escape(dep.status || 'ok')
      ].join(';'))
    ];

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `department_analytics_${getServerNow().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSortIcon = (field: keyof DepartmentSummaryRow) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40 hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc' 
      ? <ChevronUp className="ml-1 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" /> 
      : <ChevronDown className="ml-1 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" />;
  };

  return (
    <div className="space-y-6" id="departments-dashboard-panel">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" id="departments-leader-cards">
        {/* Highest Volume Department */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="card-max-volume">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Максимальная нагрузка</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.maxVolumeDep ? text(insights.maxVolumeDep.department) : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.maxVolumeDep ? `Всего: ${n(insights.maxVolumeDep.inboundCalls) + n(insights.maxVolumeDep.outboundCalls)} зв.` : '—'}
            </div>
          </div>
        </div>

        {/* Best SLA Department */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="card-best-sla">
          <div className="rounded-xl bg-purple-50 p-3 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Лучший сервис SLA</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.bestSlaDep ? text(insights.bestSlaDep.department) : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.bestSlaDep ? `SLA: ${n(insights.bestSlaDep.slaPercent)}%` : '—'}
            </div>
          </div>
        </div>

        {/* Fastest Wait Time Department */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="card-fastest-response">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Самый быстрый ответ</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.lowestWaitDep ? text(insights.lowestWaitDep.department) : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.lowestWaitDep ? `Ожидание: ${n(insights.lowestWaitDep.averageWaitSeconds)} сек` : '—'}
            </div>
          </div>
        </div>

        {/* Best Callback Department */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="card-best-callback">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Эффективный перезвон</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {insights?.bestCallbackDep ? text(insights.bestCallbackDep.department) : '—'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
              {insights?.bestCallbackDep ? `Перезвон: ${n(insights.bestCallbackDep.callbackRate)}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Selector and Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-1" id="departments-dashboard-tabs">
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
            Сравнение объема и SLA
          </button>
          <button 
            type="button"
            onClick={() => setSelectedAngle('load')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              selectedAngle === 'load' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Входящая vs Исходящая линия
          </button>
          <button 
            type="button"
            onClick={() => setSelectedAngle('quality_lost')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              selectedAngle === 'quality_lost' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Потери и скорость ответа
          </button>
        </div>

        {/* Export CSV button */}
        <button 
          onClick={handleExportCSV} 
          disabled={departmentSummary.length === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          Экспорт в CSV
        </button>
      </div>

      {/* Interactive Charts and summary state */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="departments-charts-section">
        {/* Chart View */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col h-[380px]" id="departments-main-chart">
          <div className="mb-4">
            <h3 className="text-base font-black text-slate-950 dark:text-white">
              {selectedAngle === 'overview' && 'Общий объем вызовов и уровень SLA'}
              {selectedAngle === 'load' && 'Отношение входящего потока к исходящей активности'}
              {selectedAngle === 'quality_lost' && 'Соотношение отвеченных, пропущенных и потерянных'}
            </h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {selectedAngle === 'overview' && 'Анализ ключевой нагрузки и качества обслуживания клиентов'}
              {selectedAngle === 'load' && 'Помогает сопоставить пассивные входящие обращения и активность отдела по исходящим звонкам'}
              {selectedAngle === 'quality_lost' && 'Контроль безвозвратных потерь клиентов из-за длительного ожидания или отсутствия перезвона'}
            </p>
          </div>

          <div className="flex-1 w-full min-h-0">
            {departmentSummary.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-4">
                <BarChart2 className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">Нет данных по отделам для визуализации</p>
              </div>
            ) : selectedAngle === 'overview' ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartDataOverview} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis yAxisId="left" label={{ value: 'Вызовы (кол-во)', angle: -90, position: 'insideLeft', fontSize: 10 }} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'SLA %', angle: 90, position: 'insideRight', fontSize: 10 }} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" name="Входящие" dataKey="Входящие" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" name="Исходящие" dataKey="Исходящие" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" name="SLA %" type="monotone" dataKey="SLA %" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : selectedAngle === 'load' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataOverview} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Входящие вызовы" dataKey="Входящие" stackId="a" fill="#2563eb" />
                  <Bar name="Исходящие вызовы" dataKey="Исходящие" stackId="a" fill="#059669" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataOverview} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Отвеченные" dataKey="Отвечено" fill="#10b981" />
                  <Bar name="Пропущенные" dataKey="Пропущено" fill="#f59e0b" />
                  <Bar name="Потерянные (без перезвона)" dataKey="Потеряно" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Aggregated Sidebar State */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-[380px]" id="departments-aggregates">
          <div>
            <h3 className="text-base font-black text-slate-950 dark:text-white">Суммарно по всем отделам</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Общие показатели по звонковому сервису компании</p>
          </div>

          <div className="space-y-3 my-auto">
            {/* Total calls ratio */}
            <div className="p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Общая активность</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {(aggregateStats.inbound + aggregateStats.outbound).toLocaleString('ru-RU')} зв.
                </span>
              </div>
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div 
                  className="h-full bg-blue-500" 
                  style={{ width: `${aggregateStats.inbound + aggregateStats.outbound > 0 ? (aggregateStats.inbound / (aggregateStats.inbound + aggregateStats.outbound)) * 100 : 50}%` }}
                />
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: `${aggregateStats.inbound + aggregateStats.outbound > 0 ? (aggregateStats.outbound / (aggregateStats.inbound + aggregateStats.outbound)) * 100 : 50}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9px] font-black uppercase text-slate-400">
                <span className="text-blue-500">Входящие ({aggregateStats.inbound})</span>
                <span className="text-emerald-500">Исходящие ({aggregateStats.outbound})</span>
              </div>
            </div>

            {/* Answer Rate & SLA */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Средний SLA по компании</span>
              <span className={`text-sm font-black font-mono ${
                aggregateStats.averageSla >= 80 ? 'text-emerald-600' : aggregateStats.averageSla >= 60 ? 'text-amber-500' : 'text-rose-500'
              }`}>
                {aggregateStats.averageSla}%
              </span>
            </div>

            {/* Answered vs Missed ratio bar */}
            <div className="p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Процент успешного приема</span>
                <span className="font-mono text-emerald-600">
                  {aggregateStats.inbound > 0 ? Math.round((aggregateStats.answered / aggregateStats.inbound) * 100) : 100}%
                </span>
              </div>
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: `${aggregateStats.inbound > 0 ? (aggregateStats.answered / aggregateStats.inbound) * 100 : 100}%` }}
                />
                <div 
                  className="h-full bg-rose-500" 
                  style={{ width: `${aggregateStats.inbound > 0 ? (aggregateStats.missed / aggregateStats.inbound) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9px] font-black uppercase text-slate-400">
                <span className="text-emerald-500">Принято ({aggregateStats.answered})</span>
                <span className="text-rose-500">Пропущено ({aggregateStats.missed})</span>
              </div>
            </div>

            {/* Average Wait Time */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/20">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Ср. ожидание до ответа</span>
              <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                {aggregateStats.averageWait} сек
              </span>
            </div>
          </div>

          {/* Quick info footer */}
          <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/40 dark:border-blue-900/20 p-2.5 text-[10px] text-blue-800 dark:text-blue-400 font-semibold leading-relaxed">
            <span className="flex gap-1.5 items-start">
              <Star className="h-4 w-4 shrink-0 text-blue-500 fill-blue-500" />
              <span>SLA в отделах рассчитывается на основе входящих звонков, на которые операторы ответили в регламентированное время ({effectiveAnswerSlaSeconds} сек).</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Department Matrix / Table */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" id="departments-matrix">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-black text-slate-950 dark:text-white">Сравнительный анализ отделов</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Сводные показатели по всем направлениям распределения вызовов</p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              placeholder="Поиск по названию или руководителю"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200/80 bg-white pl-8 pr-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse" id="departments-table">
            <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
              <tr className="divide-x divide-slate-100 dark:divide-slate-800">
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('department')}>
                  <div className="flex items-center">Отдел {getSortIcon('department')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('managerName')}>
                  <div className="flex items-center justify-center">Руководитель {getSortIcon('managerName')}</div>
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
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('lostCalls')}>
                  <div className="flex items-center justify-center">Безвозвратные {getSortIcon('lostCalls')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('slaPercent')}>
                  <div className="flex items-center justify-center">SLA % {getSortIcon('slaPercent')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('averageWaitSeconds')}>
                  <div className="flex items-center justify-center">Ср. Ожидание {getSortIcon('averageWaitSeconds')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('averageDurationSeconds')}>
                  <div className="flex items-center justify-center">Ср. Разговор {getSortIcon('averageDurationSeconds')}</div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('callbackRate')}>
                  <div className="flex items-center justify-center">Перезвон % {getSortIcon('callbackRate')}</div>
                </th>
                <th className="px-3 py-3 text-center">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedDepartments.length > 0 ? (
                sortedDepartments.map((dep, idx) => {
                  const inbound = n(dep.inboundCalls);
                  const outbound = n(dep.outboundCalls);
                  const total = inbound + outbound;
                  const answered = n(dep.answeredCalls);
                  const missed = n(dep.missedCalls);
                  const lost = n(dep.lostCalls);
                  const sla = dep.slaPercent !== null && dep.slaPercent !== undefined ? dep.slaPercent : null;
                  const wait = dep.averageWaitSeconds !== null && dep.averageWaitSeconds !== undefined ? dep.averageWaitSeconds : null;
                  const callback = dep.callbackRate !== null && dep.callbackRate !== undefined ? dep.callbackRate : null;

                  // Custom visual style based on status meta
                  let statusLabel = 'OK';
                  let statusColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';

                  if (dep.status === 'problem' || (lost > 3 && callback !== null && callback < 50)) {
                    statusLabel = 'Проблема';
                    statusColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
                  } else if (dep.status === 'warning' || (sla !== null && sla < 75) || (wait !== null && wait > 25)) {
                    statusLabel = 'Внимание';
                    statusColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
                  } else if (total === 0) {
                    statusLabel = 'Неактивен';
                    statusColor = 'bg-slate-50 text-slate-500 dark:bg-slate-950/20 dark:text-slate-400';
                  }

                  return (
                    <tr 
                      key={text(dep.department) + idx}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10 transition-colors"
                      id={`dep-row-${idx}`}
                    >
                      {/* Department Name */}
                      <td className="px-3 py-3.5 font-bold text-slate-800 dark:text-slate-200">
                        {text(dep.department) || '—'}
                      </td>

                      {/* Manager Name */}
                      <td className="px-3 py-3.5 text-center text-slate-600 dark:text-slate-300 font-semibold">
                        {text(dep.managerName) || 'Не назначен'}
                      </td>

                      {/* Inbound */}
                      <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {inbound.toLocaleString('ru-RU')}
                      </td>

                      {/* Outbound */}
                      <td className="px-3 py-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {outbound.toLocaleString('ru-RU')}
                      </td>

                      {/* Answered */}
                      <td className="px-3 py-3.5 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {answered.toLocaleString('ru-RU')}
                      </td>

                      {/* Missed */}
                      <td className="px-3 py-3.5 text-center font-mono font-semibold text-amber-500">
                        {missed.toLocaleString('ru-RU')}
                      </td>

                      {/* Lost Calls */}
                      <td className="px-3 py-3.5 text-center font-mono font-black text-rose-500">
                        {lost.toLocaleString('ru-RU')}
                      </td>

                      {/* SLA % */}
                      <td className="px-3 py-3.5 text-center">
                        {sla !== null ? (
                          <span className={`font-mono font-black ${
                            sla >= 80 ? 'text-emerald-600' : sla >= 60 ? 'text-amber-500' : 'text-rose-500'
                          }`}>
                            {sla}%
                          </span>
                        ) : '—'}
                      </td>

                      {/* Wait Seconds */}
                      <td className="px-3 py-3.5 text-center font-mono text-slate-600 dark:text-slate-300">
                        {wait !== null ? `${wait} сек` : '—'}
                      </td>

                      {/* Average call duration */}
                      <td className="px-3 py-3.5 text-center font-mono text-slate-600 dark:text-slate-300">
                        {formatSeconds(dep.averageDurationSeconds)}
                      </td>

                      {/* Callback rate */}
                      <td className="px-3 py-3.5 text-center">
                        {missed > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono font-bold text-emerald-600">
                              {Math.round(n(callback))}%
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold">
                              {n(dep.callbackAfterMissed)} из {missed}
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
                  <td colSpan={12} className="py-8 text-center text-slate-400 font-semibold">
                    Отделы не найдены
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
