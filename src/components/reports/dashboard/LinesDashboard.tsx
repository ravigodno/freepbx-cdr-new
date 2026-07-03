import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, Search, Award, TrendingUp, PhoneIncoming, PhoneOutgoing, 
  Clock, ShieldAlert, CheckCircle, Download, Users, Tag, Sliders, 
  HelpCircle, ChevronDown, ChevronUp, BarChart2, Star, ArrowUpDown,
  Settings, Info, Calendar, RefreshCw, BarChart, Percent, Plus, Play,
  Check, Edit2
} from 'lucide-react';
import { 
  BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { TrunkSummaryRow } from './TrunkHealthWidget';

type LinesDashboardProps = {
  trunks: TrunkSummaryRow[];
  loading?: boolean;
  effectiveAnswerSlaSeconds?: number;
};

// Available marketing channels for call tracking
const DEFAULT_MARKETING_CHANNELS = [
  { id: 'yandex', name: 'Яндекс.Директ', color: '#ffcc00' },
  { id: 'google', name: 'Google Ads', color: '#4285f4' },
  { id: 'vk', name: 'VK Реклама', color: '#0077ff' },
  { id: 'seo', name: 'SEO / Поиск', color: '#2db715' },
  { id: 'direct', name: 'Прямые заходы / Сайт', color: '#9c27b0' },
  { id: 'offline', name: 'Наружная реклама / Offline', color: '#ff5722' },
  { id: 'unassigned', name: 'Основная линия (Без источника)', color: '#64748b' }
];

export function LinesDashboard({ 
  trunks, 
  loading = false,
  effectiveAnswerSlaSeconds = 20
}: LinesDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof TrunkSummaryRow>('totalCalls');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [editingTrunk, setEditingTrunk] = useState<string | null>(null);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');
  
  // Local state for dynamic call tracking allocations (Trunk Name -> Marketing Channel ID)
  const [channelMap, setChannelMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('pbx_calltracking_channels');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Save allocations to localStorage when they change
  const handleAssignChannel = (trunkName: string, channelId: string) => {
    const updated = { ...channelMap, [trunkName]: channelId };
    setChannelMap(updated);
    localStorage.setItem('pbx_calltracking_channels', JSON.stringify(updated));
    setEditingTrunk(null);
  };

  // Safe number conversions
  const n = (val: unknown) => {
    const num = Number(val || 0);
    return Number.isFinite(num) ? num : 0;
  };

  const text = (val: unknown) => {
    return String(val || '').trim();
  };

  // Normalize trunks data (filling fields for consistency between full summaries and legacy detailings)
  const normalizedTrunks = useMemo(() => {
    return trunks.map(t => {
      const trunkName = text(t.trunkName || '');
      const total = n(t.totalCalls);
      const answered = n(t.answeredCalls);
      
      // Default channel mapping heuristics if not configured by user
      let channelId = channelMap[trunkName];
      if (!channelId) {
        const lowerName = trunkName.toLowerCase();
        if (lowerName.includes('yandex') || lowerName.includes('direct') || lowerName.includes('7999')) {
          channelId = 'yandex';
        } else if (lowerName.includes('google') || lowerName.includes('gads') || lowerName.includes('7888')) {
          channelId = 'google';
        } else if (lowerName.includes('vk') || lowerName.includes('target') || lowerName.includes('7777')) {
          channelId = 'vk';
        } else if (lowerName.includes('seo') || lowerName.includes('organic') || lowerName.includes('7666')) {
          channelId = 'seo';
        } else if (lowerName.includes('offline') || lowerName.includes('billboard')) {
          channelId = 'offline';
        } else if (lowerName.includes('main') || lowerName.includes('trunk') || lowerName.includes('7495') || lowerName.includes('7499')) {
          channelId = 'unassigned';
        } else {
          // Cycle distribution for mock look & feel if empty, but prefer unassigned
          channelId = 'unassigned';
        }
      }

      const channelObj = DEFAULT_MARKETING_CHANNELS.find(c => c.id === channelId) || DEFAULT_MARKETING_CHANNELS[DEFAULT_MARKETING_CHANNELS.length - 1];

      return {
        ...t,
        trunkName,
        totalCalls: total,
        answeredCalls: answered,
        inboundCalls: t.inboundCalls !== undefined ? n(t.inboundCalls) : total, // assume incoming if not specified
        outboundCalls: n(t.outboundCalls),
        missedCalls: t.missedCalls !== undefined ? n(t.missedCalls) : Math.max(0, total - answered),
        averageDurationSeconds: t.averageDurationSeconds !== undefined ? n(t.averageDurationSeconds) : n(t.acd),
        asr: total ? Math.round((answered / total) * 100) : 0,
        channelId,
        channelName: channelObj.name,
        channelColor: channelObj.color,
      };
    });
  }, [trunks, channelMap]);

  // Filters based on search query & channel selection
  const filteredTrunks = useMemo(() => {
    return normalizedTrunks.filter(t => {
      const matchesSearch = t.trunkName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            t.channelName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesChannel = selectedChannelFilter === 'all' || t.channelId === selectedChannelFilter;
      return matchesSearch && matchesChannel;
    });
  }, [normalizedTrunks, searchQuery, selectedChannelFilter]);

  // Handle Table Sorting
  const handleSort = (field: keyof TrunkSummaryRow) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sort Trunks
  const sortedTrunks = useMemo(() => {
    const sorted = [...filteredTrunks];
    sorted.sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (valA === null || valA === undefined) valA = sortDirection === 'asc' ? Infinity : -Infinity;
      if (valB === null || valB === undefined) valB = sortDirection === 'asc' ? -Infinity : Infinity;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? (n(valA) - n(valB)) : (n(valB) - n(valA));
    });
    return sorted;
  }, [filteredTrunks, sortField, sortDirection]);

  // Aggregated Marketing Channels Analytics
  const channelStats = useMemo(() => {
    const stats: Record<string, { id: string; name: string; color: string; totalCalls: number; answeredCalls: number; missedCalls: number; duration: number }> = {};
    
    DEFAULT_MARKETING_CHANNELS.forEach(chan => {
      stats[chan.id] = {
        id: chan.id,
        name: chan.name,
        color: chan.color,
        totalCalls: 0,
        answeredCalls: 0,
        missedCalls: 0,
        duration: 0
      };
    });

    normalizedTrunks.forEach(t => {
      const cid = t.channelId;
      if (!stats[cid]) {
        stats[cid] = {
          id: cid,
          name: t.channelName,
          color: t.channelColor || '#94a3b8',
          totalCalls: 0,
          answeredCalls: 0,
          missedCalls: 0,
          duration: 0
        };
      }
      stats[cid].totalCalls += t.totalCalls;
      stats[cid].answeredCalls += t.answeredCalls;
      stats[cid].missedCalls += t.missedCalls;
      stats[cid].duration += (t.averageDurationSeconds || 0) * t.answeredCalls;
    });

    return Object.values(stats).filter(s => s.totalCalls > 0 || s.id === 'unassigned');
  }, [normalizedTrunks]);

  // Overall Statistics for KPI Cards
  const overallStats = useMemo(() => {
    let totalLines = normalizedTrunks.length;
    let totalCalls = 0;
    let answeredCalls = 0;
    let missedCalls = 0;
    let sumDuration = 0;

    normalizedTrunks.forEach(t => {
      totalCalls += t.totalCalls;
      answeredCalls += t.answeredCalls;
      missedCalls += t.missedCalls;
      sumDuration += (t.averageDurationSeconds || 0) * t.answeredCalls;
    });

    const averageDuration = answeredCalls ? Math.round(sumDuration / answeredCalls) : 0;
    const overallAsr = totalCalls ? Math.round((answeredCalls / totalCalls) * 100) : 100;

    // Determine the highest performing channel
    let bestChannel = '—';
    let maxChannelCalls = -1;
    channelStats.forEach(cs => {
      if (cs.id !== 'unassigned' && cs.totalCalls > maxChannelCalls && cs.totalCalls > 0) {
        maxChannelCalls = cs.totalCalls;
        bestChannel = cs.name;
      }
    });

    return {
      totalLines,
      totalCalls,
      answeredCalls,
      missedCalls,
      averageDuration,
      overallAsr,
      bestChannel
    };
  }, [normalizedTrunks, channelStats]);

  // Charts Preps
  const pieChartData = useMemo(() => {
    return channelStats
      .filter(cs => cs.totalCalls > 0)
      .map(cs => ({
        name: cs.name,
        value: cs.totalCalls,
        color: cs.color
      }));
  }, [channelStats]);

  const barChartData = useMemo(() => {
    return sortedTrunks.slice(0, 8).map(t => ({
      name: t.trunkName.length > 15 ? t.trunkName.substring(0, 12) + '...' : t.trunkName,
      'Всего звонков': t.totalCalls,
      'Отвечено': t.answeredCalls,
      'Пропущено': t.missedCalls
    }));
  }, [sortedTrunks]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Название линии/Trunk', 'Рекламный канал (Коллтрекинг)', 'Входящие/Всего', 'Отвечено', 'Пропущено', 'Конверсия дозвона (ASR %)', 'Ср. время разговора (ACD)'];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [
      headers.join(';'),
      ...normalizedTrunks.map(t => [
        escape(t.trunkName),
        escape(t.channelName),
        t.totalCalls,
        t.answeredCalls,
        t.missedCalls,
        `${t.asr}%`,
        t.averageDurationSeconds ? `${Math.round(t.averageDurationSeconds)} сек` : '—'
      ].join(';'))
    ];

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calltracking_lines_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSortIcon = (field: keyof TrunkSummaryRow) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40 hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc' 
      ? <ChevronUp className="ml-1 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" /> 
      : <ChevronDown className="ml-1 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" />;
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6" id="lines-calltracking-dashboard">
      
      {/* Header Info Block */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm dark:border-blue-900/30 dark:bg-blue-950/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4" id="lines-dashboard-intro">
        <div className="flex gap-4 items-start">
          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400 shrink-0">
            <Sliders className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              Аналитика Входящих Линий и Коллтрекинг
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-black text-blue-600 uppercase dark:bg-blue-400/10 dark:text-blue-400">DID Call Tracking</span>
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
              Связывайте телефонные номера (транки) с источниками трафика для точного отслеживания рекламных каналов. Сравнивайте эффективность линий, выявляйте пиковые нагрузки и оптимизируйте бюджет.
            </p>
          </div>
        </div>
        <button 
          onClick={handleExportCSV} 
          disabled={normalizedTrunks.length === 0}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/35 dark:text-slate-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          Экспорт отчета в CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" id="lines-kpi-cards">
        {/* Total Active Numbers */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="kpi-total-lines">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Подключено линий (DID)</div>
            <div className="mt-1 font-black text-2xl text-slate-800 dark:text-slate-100 font-mono">
              {overallStats.totalLines}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
              Номеров в ротации
            </div>
          </div>
        </div>

        {/* Total Inbound Hits */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="kpi-total-calls">
          <div className="rounded-xl bg-purple-50 p-3 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <PhoneIncoming className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Всего обращений по линиям</div>
            <div className="mt-1 font-black text-2xl text-slate-800 dark:text-slate-100 font-mono">
              {overallStats.totalCalls.toLocaleString('ru-RU')}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
              {overallStats.answeredCalls} отв. / {overallStats.missedCalls} проп.
            </div>
          </div>
        </div>

        {/* Overall Answer Rate */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="kpi-asr-conversion">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Percent className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Средний прием звонков (ASR)</div>
            <div className="mt-1 font-black text-2xl text-slate-800 dark:text-slate-100 font-mono flex items-baseline gap-1">
              <span className={overallStats.overallAsr >= 85 ? 'text-emerald-600' : overallStats.overallAsr >= 65 ? 'text-amber-500' : 'text-rose-500'}>
                {overallStats.overallAsr}%
              </span>
            </div>
            <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
              Ср. время разговора: {formatSeconds(overallStats.averageDuration)}
            </div>
          </div>
        </div>

        {/* Best Traffic Channel */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4" id="kpi-best-channel">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <Tag className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Лидирующий канал трафика</div>
            <div className="mt-1 font-black text-slate-800 dark:text-slate-100 truncate text-sm">
              {overallStats.bestChannel}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 mt-1">
              Максимальный поток лидов
            </div>
          </div>
        </div>
      </div>

      {/* Visual Charts: Marketing Channels Share & Lines Load */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" id="lines-charts-row">
        
        {/* Call Tracking Sources (Pie Chart) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col h-[360px]" id="channels-share-chart">
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white">Источники звонков (Call Tracking)</h3>
            <p className="text-[11px] font-semibold text-slate-500">Доля звонков по рекламным каналам</p>
          </div>
          
          <div className="flex-1 w-full min-h-0 flex items-center justify-center relative">
            {pieChartData.length > 0 ? (
              <div className="w-full h-full flex flex-col justify-between py-2">
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} звонков`, 'Объем']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Custom list details inside card */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-400 px-2 mt-2">
                  {pieChartData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.name}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 ml-auto">
                        {item.value} ({Math.round((item.value / overallStats.totalCalls) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center p-4">
                <Info className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">Нет размеченных данных по источникам</p>
              </div>
            )}
          </div>
        </div>

        {/* Top active lines (Bar Chart) */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col h-[360px]" id="lines-load-chart">
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white">Поток звонков по линиям (Top 8)</h3>
            <p className="text-[11px] font-semibold text-slate-500">Сравнение отвеченных и упущенных вызовов в разрезе транков</p>
          </div>

          <div className="flex-1 w-full min-h-0 mt-4">
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={barChartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar name="Отвечено" dataKey="Отвечено" stackId="a" fill="#10b981" />
                  <Bar name="Пропущено" dataKey="Пропущено" stackId="a" fill="#ef4444" />
                </RechartsBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <BarChart className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">Нет данных для построения графика</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Traffic source performance comparison */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" id="channel-performance-matrix">
        <h3 className="text-sm font-black text-slate-950 dark:text-white mb-1">Сводная эффективность рекламных каналов</h3>
        <p className="text-[11px] font-semibold text-slate-500 mb-4">Статистика обращений, конверсии и качества приема по каждому рекламному источнику</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {channelStats.map(cs => {
            const hasCalls = cs.totalCalls > 0;
            const asr = hasCalls ? Math.round((cs.answeredCalls / cs.totalCalls) * 100) : 0;
            const avgDuration = cs.answeredCalls ? Math.round(cs.duration / cs.answeredCalls) : 0;

            return (
              <div 
                key={cs.id}
                className="p-4 rounded-xl border border-slate-100 bg-slate-50/45 dark:border-slate-800 dark:bg-slate-950/20 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cs.color }} />
                      {cs.name}
                    </span>
                    <span className="text-[9px] font-black font-mono text-slate-400 uppercase">
                      {cs.id === 'unassigned' ? 'Органическая линия' : 'Коллтрекинг'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-center border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div>
                      <div className="text-[9px] font-black uppercase text-slate-400">Звонки</div>
                      <div className="font-mono text-base font-black text-slate-800 dark:text-slate-100">{cs.totalCalls}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase text-slate-400">Конверсия (ASR)</div>
                      <div className="font-mono text-base font-black text-slate-800 dark:text-slate-100 flex items-center justify-center gap-0.5">
                        <span className={asr >= 80 ? 'text-emerald-600' : asr >= 60 ? 'text-amber-500' : 'text-rose-500'}>
                          {asr}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-[10px] font-bold text-slate-500">
                  <div className="flex justify-between">
                    <span>Успешных разговоров:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{cs.answeredCalls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Пропущено/Потеряно:</span>
                    <span className="text-rose-500 font-mono">{cs.missedCalls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ср. время диалога:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{formatSeconds(avgDuration)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main interactive table of lines / Call Tracking DID configuration */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" id="lines-interactive-table">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white">Детальный разрез входящих линий и DID разметка</h3>
            <p className="text-[11px] font-semibold text-slate-500">Интерактивная панель распределения номеров, разметки каналов рекламы и контроля KPI</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Channel filter select */}
            <div>
              <select
                value={selectedChannelFilter}
                onChange={e => setSelectedChannelFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                aria-label="Фильтр по каналу рекламы"
              >
                <option value="all">Все рекламные каналы</option>
                {DEFAULT_MARKETING_CHANNELS.map(chan => (
                  <option key={chan.id} value={chan.id}>{chan.name}</option>
                ))}
              </select>
            </div>

            {/* Line Search */}
            <div className="relative w-full sm:w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Поиск по названию или номеру"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200/80 bg-white pl-8 pr-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        {/* Lines Matrix Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse" id="lines-table">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
              <tr className="divide-x divide-slate-100 dark:divide-slate-800">
                <th className="px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('trunkName')}>
                  <div className="flex items-center">Линия / DID номер {getSortIcon('trunkName')}</div>
                </th>
                <th className="px-3 py-2.5 text-center">
                  Рекламный канал (Call Tracking Источник)
                </th>
                <th className="px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('totalCalls')}>
                  <div className="flex items-center justify-center">Входящие / Всего {getSortIcon('totalCalls')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('answeredCalls')}>
                  <div className="flex items-center justify-center">Принято {getSortIcon('answeredCalls')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('missedCalls')}>
                  <div className="flex items-center justify-center">Пропущено {getSortIcon('missedCalls')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('asr')}>
                  <div className="flex items-center justify-center">Конверсия ASR % {getSortIcon('asr')}</div>
                </th>
                <th className="px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 text-center" onClick={() => handleSort('averageDurationSeconds')}>
                  <div className="flex items-center justify-center">Ср. Диалог {getSortIcon('averageDurationSeconds')}</div>
                </th>
                <th className="px-3 py-2.5 text-center">Уровень Нагрузки</th>
                <th className="px-3 py-2.5 text-center">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedTrunks.length > 0 ? (
                sortedTrunks.map((t, idx) => {
                  const total = t.totalCalls;
                  const answered = t.answeredCalls;
                  const missed = t.missedCalls;
                  const asr = t.asr;
                  const avgDuration = t.averageDurationSeconds || 0;
                  
                  // Calculate load percent relative to total calls on all trunks
                  const relativeLoad = overallStats.totalCalls ? Math.round((total / overallStats.totalCalls) * 100) : 0;

                  // Health statuses
                  let statusLabel = 'Отличный';
                  let statusColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';

                  if (total > 0 && asr < 65) {
                    statusLabel = 'Проблемный';
                    statusColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
                  } else if (total > 0 && asr < 80) {
                    statusLabel = 'Внимание';
                    statusColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
                  } else if (total === 0) {
                    statusLabel = 'Спящий';
                    statusColor = 'bg-slate-50 text-slate-500 dark:bg-slate-950/20 dark:text-slate-400';
                  }

                  const isEditing = editingTrunk === t.trunkName;

                  return (
                    <tr 
                      key={t.trunkName + idx}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10 transition-colors"
                      id={`line-row-${idx}`}
                    >
                      {/* Name of Trunk Line */}
                      <td className="px-3 py-3">
                        <div className="font-black text-slate-800 dark:text-slate-200">
                          {t.trunkName}
                        </div>
                        {t.trunkType && t.trunkType !== 'unknown' && (
                          <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                            {t.trunkType} Line
                          </div>
                        )}
                      </td>

                      {/* Interactive Call Tracking Marketing Channel Allocator */}
                      <td className="px-3 py-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={t.channelId}
                              onChange={e => handleAssignChannel(t.trunkName, e.target.value)}
                              className="h-7 rounded-md border border-blue-300 bg-white px-1.5 text-[10px] font-black text-slate-700 shadow-sm outline-none"
                              aria-label="Выбрать канал"
                            >
                              {DEFAULT_MARKETING_CHANNELS.map(chan => (
                                <option key={chan.id} value={chan.id}>{chan.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setEditingTrunk(null)}
                              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-slate-600 flex items-center justify-center"
                              title="Отмена"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 group">
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black cursor-pointer hover:opacity-85 transition-opacity"
                              style={{ backgroundColor: `${t.channelColor}15`, color: t.channelColor }}
                              onClick={() => setEditingTrunk(t.trunkName)}
                            >
                              <Tag className="h-3 w-3 shrink-0" />
                              {t.channelName}
                            </span>
                            <button
                              onClick={() => setEditingTrunk(t.trunkName)}
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md bg-slate-50 text-slate-400 hover:text-slate-700 dark:bg-slate-800/40 dark:hover:text-slate-200 flex items-center justify-center transition-opacity"
                              title="Разметить рекламный канал"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Total calls */}
                      <td className="px-3 py-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {total.toLocaleString('ru-RU')}
                      </td>

                      {/* Answered calls */}
                      <td className="px-3 py-3 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {answered.toLocaleString('ru-RU')}
                      </td>

                      {/* Missed calls */}
                      <td className="px-3 py-3 text-center font-mono font-semibold text-rose-500">
                        {missed.toLocaleString('ru-RU')}
                      </td>

                      {/* ASR % */}
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono font-black ${
                          asr >= 80 ? 'text-emerald-600' : asr >= 60 ? 'text-amber-500' : 'text-rose-500'
                        }`}>
                          {asr}%
                        </span>
                      </td>

                      {/* ACD (Average duration) */}
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">
                        {total > 0 ? formatSeconds(avgDuration) : '—'}
                      </td>

                      {/* Relative Load bar */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/60">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${relativeLoad}%` }} />
                          </div>
                          <span className="w-8 text-right font-mono text-[10px] font-black text-slate-500">{relativeLoad}%</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
                    Входящие линии не найдены
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
