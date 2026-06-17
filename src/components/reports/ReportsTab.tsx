import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  RefreshCw,
  Download,
  TrendingUp,
  TrendingDown,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  ArrowUpRight,
  Activity,
  Filter,
  BarChart3,
  Sliders,
  CheckCircle,
  XCircle,
  Hash,
  ArrowRight
} from 'lucide-react';
import { DirectoryEntry, AppSettings } from '../../types';

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
  extCalls?: Record<string, number>;
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
  const [department, setDepartment] = useState<string>('all');
  const [detailingType, setDetailingType] = useState<'none' | 'extensions' | 'trunks' | 'queues' | 'groups' | 'outboundRules'>('none');
  const [selectedMetric, setSelectedMetric] = useState<
    'totalCalls' | 'inboundCalls' | 'outboundCalls' | 'internalCalls' | 'missedCalls' | 'processedCalls' | 'lostCalls'
  >('totalCalls');

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

  const [data, setData] = useState<DynamicDatapoint[]>([]);
  const [detailingData, setDetailingData] = useState<DetailingData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [refreshes, setRefreshes] = useState<number>(0);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  const [selectedExts, setSelectedExts] = useState<string[]>([]);

  // State variables for interactive detailed tables
  const [slaShowAll, setSlaShowAll] = useState<boolean>(false);
  const [durationShowAll, setDurationShowAll] = useState<boolean>(false);
  const [slaSortKey, setSlaSortKey] = useState<'period' | 'missed' | 'processed' | 'lost' | 'sla'>('period');
  const [slaSortOrder, setSlaSortOrder] = useState<'asc' | 'desc'>('desc');
  const [durationSortKey, setDurationSortKey] = useState<'period' | 'answeredCount' | 'answeredDuration' | 'avgDuration'>('period');
  const [durationSortOrder, setDurationSortOrder] = useState<'asc' | 'desc'>('desc');

  const extColors = useMemo(() => [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f43f5e', // rose
    '#f59e0b', // amber
    '#a855f7', // purple
    '#06b6d4', // cyan
    '#6366f1', // indigo
    '#ec4899', // pink
  ], []);

  const toggleExtTrend = (ext: string) => {
    setSelectedExts(prev => {
      if (prev.includes(ext)) {
        return prev.filter(e => e !== ext);
      } else {
        return [...prev, ext];
      }
    });
  };

  const getDirName = (num: string) => {
    const entry = directory.find(e => {
      const numClean = String(num).trim();
      return String(e.number).trim() === numClean || (Array.isArray(e.phones) && e.phones.some(p => String(p).trim() === numClean));
    });
    return entry ? entry.name : '';
  };

  const formatReportDate = (sortKey: any, label: string) => {
    if (!sortKey) {
      return label;
    }
    try {
      const d = new Date(sortKey);
      if (!isNaN(d.getTime())) {
        const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        const months = [
          'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
          'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        const weekday = weekdays[d.getDay()];
        const day = d.getDate();
        const monthStr = months[d.getMonth()];
        const year = d.getFullYear();
        if (groupType === 'day') {
          return `${weekday}, ${day} ${monthStr} ${year}`;
        } else if (groupType === 'month') {
          return `${monthStr} ${year}`;
        }
      }
    } catch (e) {}
    return label;
  };

  // Load analytics reports dynamics from the API
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
          operatorExt,
          onlyMyCalls: String(onlyMyCalls)
        });

        const sessionSaved = localStorage.getItem('asterisk_cdr_session');
        let token = '';
        if (sessionSaved) {
          try {
            const parsed = JSON.parse(sessionSaved);
            token = parsed?.token || '';
          } catch (e) {}
        }

        const res = await fetch(`/api/reports/dynamics?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!res.ok) {
          throw new Error(`Ошибка сервера: ${res.status} ${res.statusText}`);
        }
        const json = await res.json();
        if (active) {
          setData(json.dynamics || []);
          setDetailingData(json.detailing || null);
          if (json.dbError) {
            setError(json.dbError);
          }
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Не удалось загрузить данные аналитики.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDynamics();
    return () => {
      active = false;
    };
  }, [startDate, endDate, startTime, endTime, groupType, department, operatorExt, onlyMyCalls, refreshes]);

  // Aggregate stats across all points loaded
  const summary = useMemo(() => {
    let total = 0;
    let inbound = 0;
    let outbound = 0;
    let internal = 0;
    let missed = 0;
    let processed = 0;
    let lost = 0;
    let totalDur = 0;
    let ansDur = 0;
    let ansCount = 0;

    data.forEach(p => {
      total += p.totalCalls;
      inbound += p.inboundCalls;
      outbound += p.outboundCalls;
      internal += p.internalCalls;
      missed += p.missedCalls;
      processed += p.processedCalls;
      lost += p.lostCalls;
      totalDur += p.totalDuration;
      ansDur += p.answeredDuration;
      ansCount += p.answeredCount;
    });

    const avgDuration = ansCount > 0 ? Math.round(ansDur / ansCount) : 0;
    const slaPercent = missed > 0 ? Math.round((processed / missed) * 100) : 100;

    return {
      total,
      inbound,
      outbound,
      internal,
      missed,
      processed,
      lost,
      avgDuration,
      slaPercent
    };
  }, [data]);

  // helper to get the trend for each metric
  const getMetricTrend = (metricKey: keyof typeof metricConfigs) => {
    if (data.length < 2) return null;
    const half = Math.floor(data.length / 2);
    if (half === 0) return null;
    const firstHalfSum = data.slice(0, half).reduce((sum, d) => sum + Number(d[metricKey] || 0), 0);
    const secondHalfSum = data.slice(half).reduce((sum, d) => sum + Number(d[metricKey] || 0), 0);
    
    if (firstHalfSum === 0) {
      if (secondHalfSum === 0) return { percent: 0, direction: 'neutral' as const };
      return { percent: 100, direction: 'up' as const };
    }
    const diff = secondHalfSum - firstHalfSum;
    const pct = Math.round((diff / firstHalfSum) * 100);
    return {
      percent: Math.abs(pct),
      direction: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('neutral' as const)
    };
  };

  const processedSlaData = useMemo(() => {
    const items = data.map((d, index) => {
      const sPercent = d.missedCalls > 0 ? Math.round((d.processedCalls / d.missedCalls) * 100) : 100;
      return {
        label: d.label,
        missedCalls: d.missedCalls,
        processedCalls: d.processedCalls,
        lostCalls: d.lostCalls,
        sPercent,
        originalIndex: index
      };
    });

    items.sort((a, b) => {
      let valA: any = a.originalIndex;
      let valB: any = b.originalIndex;

      if (slaSortKey === 'period') {
        valA = a.originalIndex;
        valB = b.originalIndex;
      } else if (slaSortKey === 'missed') {
        valA = a.missedCalls;
        valB = b.missedCalls;
      } else if (slaSortKey === 'processed') {
        valA = a.processedCalls;
        valB = b.processedCalls;
      } else if (slaSortKey === 'lost') {
        valA = a.lostCalls;
        valB = b.lostCalls;
      } else if (slaSortKey === 'sla') {
        valA = a.sPercent;
        valB = b.sPercent;
      }

      if (valA < valB) return slaSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return slaSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    if (!slaShowAll) {
      if (slaSortKey === 'period' && slaSortOrder === 'desc') {
        return items.slice(-7).reverse();
      }
      return items.slice(0, 7);
    }
    return items;
  }, [data, slaSortKey, slaSortOrder, slaShowAll]);

  const processedDurationData = useMemo(() => {
    const items = data.map((d, index) => {
      const itemAvg = d.answeredCount > 0 ? Math.round(d.answeredDuration / d.answeredCount) : 0;
      return {
        label: d.label,
        answeredCount: d.answeredCount,
        answeredDuration: d.answeredDuration,
        itemAvg,
        originalIndex: index
      };
    });

    items.sort((a, b) => {
      let valA: any = a.originalIndex;
      let valB: any = b.originalIndex;

      if (durationSortKey === 'period') {
        valA = a.originalIndex;
        valB = b.originalIndex;
      } else if (durationSortKey === 'answeredCount') {
        valA = a.answeredCount;
        valB = b.answeredCount;
      } else if (durationSortKey === 'answeredDuration') {
        valA = a.answeredDuration;
        valB = b.answeredDuration;
      } else if (durationSortKey === 'avgDuration') {
        valA = a.itemAvg;
        valB = b.itemAvg;
      }

      if (valA < valB) return durationSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return durationSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    if (!durationShowAll) {
      if (durationSortKey === 'period' && durationSortOrder === 'desc') {
        return items.slice(-7).reverse();
      }
      return items.slice(0, 7);
    }
    return items;
  }, [data, durationSortKey, durationSortOrder, durationShowAll]);

  // Russian metric translations and meta
  const metricConfigs = {
    totalCalls: {
      label: 'Всего звонков',
      short: 'Всего',
      color: '#3b82f6',
      bg: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-300',
      border: 'border-blue-100 dark:border-blue-900/35',
      activeClass: 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-800 ring-2 ring-blue-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-blue-600 dark:text-blue-400',
      textShortClass: 'text-blue-800 dark:text-blue-300',
      stroke: 'stroke-blue-500',
      fillGrad: 'url(#blueGrad)',
      icon: Phone
    },
    inboundCalls: {
      label: 'Входящие',
      short: 'Входящие',
      color: '#06b6d4',
      bg: 'bg-cyan-50 dark:bg-cyan-950/20 text-cyan-600 dark:text-cyan-404',
      border: 'border-cyan-100 dark:border-cyan-900/35',
      activeClass: 'bg-cyan-50/70 dark:bg-cyan-950/40 border-cyan-405 dark:border-cyan-800 ring-2 ring-cyan-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-cyan-600 dark:text-cyan-400',
      textShortClass: 'text-cyan-800 dark:text-cyan-300',
      stroke: 'stroke-cyan-500',
      fillGrad: 'url(#cyanGrad)',
      icon: PhoneIncoming
    },
    outboundCalls: {
      label: 'Исходящие',
      short: 'Исходящие',
      color: '#6366f1',
      bg: 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400',
      border: 'border-indigo-100 dark:border-indigo-900/35',
      activeClass: 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-805 ring-2 ring-indigo-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-indigo-600 dark:text-indigo-400',
      textShortClass: 'text-indigo-800 dark:text-indigo-300',
      stroke: 'stroke-indigo-500',
      fillGrad: 'url(#indigoGrad)',
      icon: PhoneOutgoing
    },
    internalCalls: {
      label: 'Внутренние',
      short: 'Внут.',
      color: '#a855f7',
      bg: 'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400',
      border: 'border-purple-100 dark:border-purple-900/35',
      activeClass: 'bg-purple-50/70 dark:bg-purple-950/40 border-purple-400 dark:border-purple-800 ring-2 ring-purple-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-purple-600 dark:text-purple-400',
      textShortClass: 'text-purple-800 dark:text-purple-300',
      stroke: 'stroke-purple-500',
      fillGrad: 'url(#purpleGrad)',
      icon: ArrowRight
    },
    missedCalls: {
      label: 'Пропущенные',
      short: 'Пропущенные',
      color: '#f43f5e',
      bg: 'bg-red-50 dark:bg-red-950/20 text-red-655 dark:text-red-400',
      border: 'border-red-105 dark:border-red-900/35',
      activeClass: 'bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-800 ring-2 ring-red-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-red-600 dark:text-red-400',
      textShortClass: 'text-red-800 dark:text-red-300',
      stroke: 'stroke-rose-500',
      fillGrad: 'url(#roseGrad)',
      icon: PhoneMissed
    },
    processedCalls: {
      label: 'Обработанные (SLA)',
      short: 'Обработанные',
      color: '#10b981',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-100 dark:border-emerald-900/35',
      activeClass: 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-800 ring-2 ring-emerald-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-emerald-600 dark:text-emerald-400',
      textShortClass: 'text-emerald-800 dark:text-emerald-300',
      stroke: 'stroke-emerald-500',
      fillGrad: 'url(#emeraldGrad)',
      icon: CheckCircle
    },
    lostCalls: {
      label: 'Потерянные звонки',
      short: 'Потерянные',
      color: '#f59e0b',
      bg: 'bg-amber-50 dark:bg-amber-950/20 text-amber-655 dark:text-amber-400',
      border: 'border-amber-100 dark:border-amber-900/30',
      activeClass: 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-400 dark:border-amber-800 ring-2 ring-amber-500/20 shadow-md scale-[1.02]',
      textValClass: 'text-amber-600 dark:text-amber-400',
      textShortClass: 'text-amber-800 dark:text-amber-300',
      stroke: 'stroke-amber-500',
      fillGrad: 'url(#amberGrad)',
      icon: XCircle
    }
  };

  // Convert duration in seconds to MM:SS
  const formatDurationStr = (sec: number) => {
    const min = Math.floor(sec / 60);
    const rSec = sec % 60;
    return `${String(min).padStart(2, '0')}:${String(rSec).padStart(2, '0')}`;
  };

  // Safe coordinate scaling helper for drawing premium SVG charts
  const svgCoordinates = useMemo(() => {
    if (data.length === 0) {
      return {
        lines: {} as Record<string, { points: Array<{ x: number, y: number, val: number, label: string, item: any }>, pathD: string, areaD: string }>,
        maxVal: 0,
        width: 1400,
        height: 300,
        marginX: 35,
        marginY: 30,
        rightMargin: 12
      };
    }
    
    const marginX = 35;
    const marginY = 30;
    const width = 1400;
    const height = 300;
    const rightMargin = 12;

    // To ensure correct proportion, we scale based on the absolute maximum of the selected metric(s)
    const metricsToScale = selectedMetric === 'totalCalls'
      ? (Object.keys(metricConfigs) as Array<keyof typeof metricConfigs>)
      : [selectedMetric];

    let maxValAcrossScaled = 0;
    metricsToScale.forEach(m => {
      data.forEach(d => {
        const val = Number(d[m] || 0);
        if (val > maxValAcrossScaled) {
          maxValAcrossScaled = val;
        }
      });
    });

    // CRITICAL FIX: Include the maximum values of selected extension lines
    // so that their trend lines do not exceed the graph's upper boundary on render.
    selectedExts.forEach(ext => {
      data.forEach(d => {
        const val = Number(d.extCalls?.[ext] || 0);
        if (val > maxValAcrossScaled) {
          maxValAcrossScaled = val;
        }
      });
    });

    const maxVal = Math.max(maxValAcrossScaled, 1); // Default minimum scale height of 1
    const roundedMax = Math.max(Math.ceil(maxVal * 1.15), 5); // Add nice empty headroom spacing, baseline of 5

    const buildMetricLine = (metricKey: keyof typeof metricConfigs) => {
      const points = data.map((d, index) => {
        const val = Number(d[metricKey] || 0);
        const x = marginX + (index / Math.max(data.length - 1, 1)) * (width - marginX - rightMargin);
        const y = height - marginY - (val / roundedMax) * (height - marginY * 2);
        return { x, y, val, label: d.label, item: d };
      });

      let pathD = '';
      let areaD = '';

      if (points.length > 0) {
        pathD = `M ${points[0].x} ${points[0].y}`;
        areaD = `M ${points[0].x} ${height - marginY} L ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpX1 = prev.x + (curr.x - prev.x) / 3;
          const cpY1 = prev.y;
          const cpX2 = prev.x + (2 * (curr.x - prev.x)) / 3;
          const cpY2 = curr.y;

          pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
          areaD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
        }

        areaD += ` L ${points[points.length - 1].x} ${height - marginY} Z`;
      }

      return { points, pathD, areaD };
    };

    const buildExtLine = (extNum: string) => {
      const points = data.map((d, index) => {
        const val = Number(d.extCalls?.[extNum] || 0);
        const x = marginX + (index / Math.max(data.length - 1, 1)) * (width - marginX - rightMargin);
        const y = height - marginY - (val / roundedMax) * (height - marginY * 2);
        return { x, y, val, label: d.label, item: d };
      });

      let pathD = '';
      let areaD = '';

      if (points.length > 0) {
        pathD = `M ${points[0].x} ${points[0].y}`;
        areaD = `M ${points[0].x} ${height - marginY} L ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpX1 = prev.x + (curr.x - prev.x) / 3;
          const cpY1 = prev.y;
          const cpX2 = prev.x + (2 * (curr.x - prev.x)) / 3;
          const cpY2 = curr.y;

          pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
          areaD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
        }

        areaD += ` L ${points[points.length - 1].x} ${height - marginY} Z`;
      }

      return { points, pathD, areaD };
    };

    const lines = {} as Record<keyof typeof metricConfigs, ReturnType<typeof buildMetricLine>>;
    (Object.keys(metricConfigs) as Array<keyof typeof metricConfigs>).forEach(m => {
      lines[m] = buildMetricLine(m);
    });

    const extLines = {} as Record<string, ReturnType<typeof buildExtLine>>;
    selectedExts.forEach(ext => {
      extLines[ext] = buildExtLine(ext);
    });

    return {
      lines,
      extLines,
      maxVal: roundedMax,
      width,
      height,
      marginX,
      marginY,
      rightMargin
    };
  }, [data, selectedMetric, selectedExts]);

  // Export full reports table in beautiful CSV UTF-8
  const handleExportCSV = () => {
    if (data.length === 0) {
      alert('Нет доступных данных для экспорта.');
      return;
    }

    const headers = [
      'Период',
      'Всего звонков',
      'Входящие',
      'Исходящие',
      'Внутренние',
      'Пропущенные',
      'Обработанные вызовы (SLA)',
      'Потерянные вызовы',
      'Общая длительность (сек)',
      'Разговорное время (сек)'
    ];

    const lines = [headers.join(',')];

    data.forEach(d => {
      lines.push([
        d.label,
        d.totalCalls,
        d.inboundCalls,
        d.outboundCalls,
        d.internalCalls,
        d.missedCalls,
        d.processedCalls,
        d.lostCalls,
        d.totalDuration,
        d.answeredDuration
      ].join(','));
    });

    const content = lines.join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cdr_analytics_dynamics_${groupType}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper calculation for individual sparks sparklines
  const generateSparklinePoints = (pointsArray: number[], w = 120, h = 30) => {
    if (pointsArray.length === 0) return '';
    const max = Math.max(...pointsArray, 1);
    const stepX = w / Math.max(pointsArray.length - 1, 1);
    
    return pointsArray.map((val, i) => {
      const x = i * stepX;
      const y = h - (val / max) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  return (
    <div className="space-y-6 pt-1 animate-fade-in pb-12" id="reports-tab-container">
      {/* 🚀 UPPER COMPACT STATUS PANEL */}
      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-900/35 text-amber-800 dark:text-amber-300 text-xs rounded-xl flex items-center gap-2.5 shadow-3xs">
          <Activity className="h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
          <div className="font-semibold leading-relaxed">
            Внимание: {error}
          </div>
        </div>
      )}

      {/* 🛠️ PREMIUM FILTER & TOOLBAR CARD */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2 text-slate-705 dark:text-slate-350 text-sm font-bold select-none">
            <Filter className="h-4 w-4 text-red-500" />
            <span>Фильтры</span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Working Date Range with Calendar icon (No "Интервал:" text) */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg py-1 px-2.5 transition-all">
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange && onStartDateChange(e.target.value)}
                className="bg-transparent border-none p-0 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-0 max-w-[105px] cursor-pointer"
              />
              <span className="text-xs text-slate-400 font-bold px-1.5">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange && onEndDateChange(e.target.value)}
                className="bg-transparent border-none p-0 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-0 max-w-[105px] cursor-pointer"
              />
            </div>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Grouping Interval Select Dropdown */}
          <div className="flex flex-wrap items-center gap-1.5 select-none">
            <span className="text-[11px] text-slate-500 dark:text-slate-450 font-bold select-none whitespace-nowrap">Группировка:</span>
            <div className="flex flex-wrap items-center gap-1">
              {(['day', 'week', 'month', 'year', 'hour', 'weekday'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setGroupType(type)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    groupType === type
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-750 dark:text-red-400 font-bold border border-red-200 dark:border-red-900/30 shadow-3xs'
                      : 'bg-slate-50 dark:bg-[#151c2c] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-205 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {type === 'day' && 'По дням'}
                  {type === 'week' && 'Неделям'}
                  {type === 'month' && 'Месяцам'}
                  {type === 'year' && 'Годам'}
                  {type === 'hour' && 'По часам'}
                  {type === 'weekday' && 'Дням недели'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Department Selector */}
          <div className="flex items-center gap-1.5 select-none">
            <span className="text-[11px] text-slate-500 dark:text-slate-450 font-bold select-none whitespace-nowrap">Направление:</span>
            <div className="relative">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="appearance-none bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700 hover:border-slate-350 dark:hover:border-slate-550 rounded-lg py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-755 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer transition-all text-ellipsis max-w-[200px]"
              >
                <option value="all">Все отделы АТС</option>
                <option value="sales">Отдел продаж (Sales)</option>
                <option value="support">Техподдержка (Support)</option>
                <option value="accounting">Бухгалтерия (Finance)</option>
                <option value="logistics">Логистика (Logistics)</option>
                <option value="other">Прочие направления</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-450 dark:text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Detailing Selector */}
          <div className="flex items-center gap-1.5 select-none">
            <span className="text-[11px] text-slate-500 dark:text-slate-450 font-bold select-none whitespace-nowrap">Детализация:</span>
            <div className="relative">
              <select
                value={detailingType}
                onChange={(e) => setDetailingType(e.target.value as any)}
                className="appearance-none bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700 hover:border-slate-350 dark:hover:border-slate-550 rounded-lg py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-755 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer transition-all text-ellipsis max-w-[200px]"
              >
                <option value="none">Без детализации</option>
                <option value="extensions">Внутренние абоненты</option>
                <option value="trunks">Транки (Внешние линии)</option>
                <option value="queues">Очереди вызовов</option>
                <option value="groups">Группы вызова</option>
                <option value="outboundRules">Исходящие правила</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-450 dark:text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <button
            onClick={() => setRefreshes(prev => prev + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-red-500 hover:text-red-655 border border-red-200 dark:border-[#334155] rounded-lg text-xs font-bold transition-all shadow-3xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Экспорт данных</span>
          </button>
        </div>
      </div>

      {/* 📊 INTEGRATED ANALYTICS METRIC PANEL - THE "7 KEY CALL TYPES" */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {(Object.keys(metricConfigs) as Array<keyof typeof metricConfigs>).map(metric => {
          const cfg = metricConfigs[metric];
          const val = summary[metric === 'totalCalls' ? 'total' : 
                          metric === 'inboundCalls' ? 'inbound' : 
                          metric === 'outboundCalls' ? 'outbound' : 
                          metric === 'internalCalls' ? 'internal' : 
                          metric === 'missedCalls' ? 'missed' : 
                          metric === 'processedCalls' ? 'processed' : 'lost'
                        ];
          const isSelected = selectedMetric === metric;
          const Icon = cfg.icon;

          // Compute proportion for sub-visual context
          let subtext = 'звонков';
          if (metric !== 'totalCalls' && summary.total > 0) {
            subtext = `${Math.round((val / summary.total) * 100)}% от общего`;
          } else if (metric === 'totalCalls') {
            subtext = 'всей телефонии';
          }

          return (
            <div
              key={metric}
              onClick={() => setSelectedMetric(metric)}
              className={`p-4 border rounded-xl cursor-pointer select-none transition-all outline-none ${
                isSelected
                  ? cfg.activeClass
                  : 'bg-white dark:bg-[#1e293b] border-slate-200 dark:border-[#334155] text-slate-900 dark:text-slate-100 hover:border-slate-350 dark:hover:border-slate-600 shadow-3xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`p-1.5 rounded-lg text-xs font-bold leading-none ${cfg.bg}`}>
                  <Icon className="h-4 w-4" />
                </span>
                
                <div className="flex items-center gap-1.5">
                  {!loading && data.length >= 2 && (() => {
                    const trend = getMetricTrend(metric);
                    if (!trend || trend.percent === 0) return null;
                    const isNegativeM = metric === 'missedCalls' || metric === 'lostCalls';
                    const isUp = trend.direction === 'up';
                    const isGood = isNegativeM ? !isUp : isUp;
                    
                    return (
                      <span className={`text-[9.5px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 select-none ${
                        isGood 
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/25 dark:text-emerald-400' 
                          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/25 dark:text-rose-400'
                      }`} title={isUp ? 'Рост относительно начала периода' : 'Спад относительно начала периода'}>
                        {isUp ? (
                          <TrendingUp className="h-2.5 w-2.5 shrink-0" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5 shrink-0" />
                        )}
                        <span>{trend.percent}%</span>
                      </span>
                    );
                  })()}

                  {/* Visual marker dot if selected */}
                  {isSelected && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3.5">
                <div className={`text-2xl font-black font-mono leading-none ${isSelected ? cfg.textValClass : 'text-slate-900 dark:text-white'}`}>
                  {loading ? '...' : val.toLocaleString()}
                </div>
                <div className={`text-[11px] font-bold mt-1.5 truncate ${isSelected ? cfg.textShortClass : 'text-slate-800 dark:text-slate-300'}`}>
                  {cfg.short}
                </div>
                <div className="text-[10px] sm:text-[9.5px] font-medium leading-normal mt-1 text-slate-500 dark:text-slate-400">
                  {subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🗺️ INTERACTIVE MAIN TIME-SERIES VOLUME CHART */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/40">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-305 flex items-center gap-2">
              <span className="w-1.5 h-3 bg-red-500 rounded-xs" />
              График динамики по звонкам: <span className="text-red-500">{metricConfigs[selectedMetric].label}</span>
            </h3>
            <p className="text-[11px] text-slate-405 mt-0.5 font-medium">
              Построено автоматически {groupType === 'day' ? 'по дням' : groupType === 'week' ? 'по неделям' : groupType === 'month' ? 'по месяцам' : 'по годам'} за выбранный интервал
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {selectedMetric === 'totalCalls' ? (
                <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-1 rounded-xl border border-slate-100 dark:border-slate-800/60 shadow-3xs">
                  {(Object.keys(metricConfigs) as Array<keyof typeof metricConfigs>).map(m => {
                    const cfg = metricConfigs[m];
                    return (
                      <div key={m} className="flex items-center gap-1 text-[10px] font-bold text-slate-650 dark:text-slate-400">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                        <span>{cfg.short}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-650 dark:text-slate-350 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-1.5 rounded-xl border border-slate-150 dark:border-slate-800/55 shadow-3xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: metricConfigs[selectedMetric].color }} />
                  <span className="font-semibold">{metricConfigs[selectedMetric].short} – Текущий выбор</span>
                </div>
              )}

              {/* Show selected extensions colors directly in the chart header legend */}
              {selectedExts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 dark:bg-slate-900/45 px-2.5 py-1 rounded-xl border border-slate-150 dark:border-slate-800/55 shadow-3xs">
                  {selectedExts.map((extNum, idx) => {
                    const color = extColors[idx % extColors.length];
                    const name = getDirName(extNum);
                    const labelStr = name ? `${extNum} (${name.split(' ')[0]})` : `Аб. ${extNum}`;
                    return (
                      <div key={extNum} className="flex items-center gap-1 text-[10px] font-bold text-slate-650 dark:text-slate-400">
                        <span className="w-3.5 h-0.5" style={{ backgroundColor: color, borderTop: `2.5px dashed ${color}` }} />
                        <span>{labelStr}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 dark:bg-[#151c2c] text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900/30 rounded-lg text-[11px] font-bold transition-all shadow-3xs cursor-pointer"
            >
              <Download className="h-3 w-3" />
              <span>Экспорт</span>
            </button>
          </div>
        </div>

        {/* THE GRAPH AREA */}
        <div className="mt-6 relative" style={{ minHeight: '340px' }}>
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xs z-20 gap-3 rounded-xl">
              <RefreshCw className="h-8 w-8 text-red-500 animate-spin" />
              <span className="text-xs font-bold text-slate-500">Запрос динамики звонков...</span>
            </div>
          ) : data.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
              <BarChart3 className="h-10 w-10 text-slate-300 stroke-1" />
              <span className="text-xs font-semibold">Нет записей звонков за выбранные даты</span>
            </div>
          ) : (
            <div className="w-full h-full select-none">
              {/* FLOATING ACTIVE LINE RADAR BADGE */}
              {hoveredLine && (
                <div className="absolute top-2 left-2 bg-[#0f172a] text-white border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-2 shadow-2xl animate-fade-in pointer-events-none z-10 select-none scale-90 sm:scale-100 origin-top-left transition-all">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-slate-300">Наведен график: <span className="text-green-400 dark:text-green-300 font-extrabold">{hoveredLine}</span></span>
                </div>
              )}
              <div className="w-full pb-4 relative">
                <svg
                  viewBox={`0 0 ${svgCoordinates.width} ${svgCoordinates.height}`}
                  className="w-full h-80 sm:h-96 md:h-[380px] overflow-visible"
                  preserveAspectRatio="none"
                  onMouseLeave={() => {
                    setHoveredPointIndex(null);
                    setHoveredLine(null);
                  }}
                >
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="limeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#84cc16" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#84cc16" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Weekend Column Highlights (Yandex.Metrica style) */}
                  {groupType === 'day' && (svgCoordinates.lines[selectedMetric]?.points || []).map((pt, i) => {
                    const d = new Date(pt.item.sortKey);
                    const dayOfWeek = d.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    if (!isWeekend) return null;
                    
                    const step = (svgCoordinates.width - svgCoordinates.marginX - svgCoordinates.rightMargin) / Math.max(data.length - 1, 1);
                    const rectWidth = step;
                    const rectX = pt.x - step / 2;
                    return (
                      <rect
                        key={`weekend-${i}`}
                        x={rectX}
                        y={svgCoordinates.marginY}
                        width={rectWidth}
                        height={svgCoordinates.height - svgCoordinates.marginY * 2}
                        className="fill-slate-100/50 dark:fill-slate-800/18"
                      />
                    );
                  })}
                  
                  {groupType === 'weekday' && (svgCoordinates.lines[selectedMetric]?.points || []).map((pt, i) => {
                    const isWeekend = pt.item.label === 'Суббота' || pt.item.label === 'Воскресенье';
                    if (!isWeekend) return null;
                    
                    const step = (svgCoordinates.width - svgCoordinates.marginX - svgCoordinates.rightMargin) / Math.max(data.length - 1, 1);
                    const rectWidth = step;
                    const rectX = pt.x - step / 2;
                    return (
                      <rect
                        key={`weekend-wd-${i}`}
                        x={rectX}
                        y={svgCoordinates.marginY}
                        width={rectWidth}
                        height={svgCoordinates.height - svgCoordinates.marginY * 2}
                        className="fill-slate-100/50 dark:fill-slate-800/18"
                      />
                    );
                  })}

                  {/* Horizontal Guide lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = svgCoordinates.marginY + ratio * (svgCoordinates.height - svgCoordinates.marginY * 2);
                    const labelVal = Math.round(svgCoordinates.maxVal * (1 - ratio));
                    return (
                      <g key={i}>
                        <line
                          x1={svgCoordinates.marginX}
                          y1={y}
                          x2={svgCoordinates.width - (svgCoordinates.rightMargin || 12)}
                          y2={y}
                          className="stroke-slate-100 dark:stroke-slate-850"
                          strokeWidth={0.8}
                        />
                        <text
                          x={svgCoordinates.marginX - 8}
                          y={y + 3.5}
                          textAnchor="end"
                          className="fill-slate-400 dark:fill-slate-500 font-mono text-[9px] font-bold"
                        >
                          {labelVal}
                        </text>
                      </g>
                    );
                  })}

                  {/* Shaded Area Region */}
                  {selectedMetric !== 'totalCalls' ? (
                    <path
                      d={svgCoordinates.lines[selectedMetric]?.areaD || ''}
                      fill={metricConfigs[selectedMetric].fillGrad}
                      className="transition-all duration-300"
                    />
                  ) : (
                    <path
                      d={svgCoordinates.lines.totalCalls?.areaD || ''}
                      fill={metricConfigs.totalCalls.fillGrad}
                      className="transition-all duration-300"
                    />
                  )}

                  {/* Draw other call category lines as background overlays if Total selected */}
                  {selectedMetric === 'totalCalls' && (
                    (Object.keys(metricConfigs) as Array<keyof typeof metricConfigs>).map(m => {
                      if (m === 'totalCalls') return null; // Drawn on top last
                      return (
                        <path
                          key={m}
                          d={svgCoordinates.lines[m]?.pathD || ''}
                          fill="none"
                          stroke={metricConfigs[m].color}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          opacity={0.48}
                          className="transition-all duration-300 hover:opacity-90 hover:stroke-[2.0px] cursor-pointer"
                          onMouseEnter={() => setHoveredLine(`${metricConfigs[m].label} (Фоновое сравнение)`)}
                          onMouseLeave={() => setHoveredLine(null)}
                        >
                          <title>{metricConfigs[m].label} (Фоновое сравнение)</title>
                        </path>
                      );
                    })
                  )}

                  {/* Main Selected Curving Path Line */}
                  <path
                    d={svgCoordinates.lines[selectedMetric]?.pathD || ''}
                    fill="none"
                    stroke={metricConfigs[selectedMetric].color}
                    strokeWidth={selectedMetric === 'totalCalls' ? 2.5 : 2.2}
                    strokeLinecap="round"
                    className="cursor-pointer transition-all stroke-linecap-round"
                    onMouseEnter={() => setHoveredLine(metricConfigs[selectedMetric].label)}
                    onMouseLeave={() => setHoveredLine(null)}
                  >
                    <title>Основной график: {metricConfigs[selectedMetric].label}</title>
                  </path>

                  {/* Selected Extensions Trendlines */}
                  {selectedExts.map((extNum, extIdx) => {
                    const extLine = svgCoordinates.extLines?.[extNum];
                    if (!extLine) return null;
                    const color = extColors[extIdx % extColors.length];
                    const name = getDirName(extNum);
                    const displayName = name ? `${extNum} (${name})` : extNum;
                    return (
                      <g key={extNum} className="transition-all duration-300">
                        <path
                          d={extLine.areaD}
                          fill={`url(#grad-${extNum})`}
                          opacity={0.02}
                        />
                        <defs>
                          <linearGradient id={`grad-${extNum}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path
                          d={extLine.pathD}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeDasharray="4 3"
                          opacity={0.8}
                          className="cursor-pointer transition-all hover:stroke-[2.4px]"
                          onMouseEnter={() => setHoveredLine(`Абонент: ${displayName}`)}
                          onMouseLeave={() => setHoveredLine(null)}
                        >
                          <title>Абонент: {displayName}</title>
                        </path>
                        {extLine.points.map((pt, pIdx) => (
                          <circle
                            key={pIdx}
                            cx={pt.x}
                            cy={pt.y}
                            r={hoveredPointIndex === pIdx ? 5.5 : 0}
                            fill={color}
                            stroke={hoveredPointIndex === pIdx ? '#ffffff' : 'transparent'}
                            strokeWidth={2.0}
                            className="transition-all cursor-pointer"
                            onMouseEnter={() => {
                              setHoveredPointIndex(pIdx);
                              setHoveredLine(`Абонент: ${displayName}`);
                            }}
                            onMouseLeave={() => {
                              setHoveredPointIndex(null);
                              setHoveredLine(null);
                            }}
                          >
                            <title>{displayName}: {pt.val} зв. ({pt.label})</title>
                          </circle>
                        ))}
                      </g>
                    );
                  })}

                  {/* X Axis ticks & Labels */}
                  {(svgCoordinates.lines[selectedMetric]?.points || []).map((p, i) => {
                    // Squeeze labels to keep them readable if there are many dots
                    const showLabel = (svgCoordinates.lines[selectedMetric]?.points || []).length <= 15 || i % Math.ceil((svgCoordinates.lines[selectedMetric]?.points || []).length / 12) === 0;
                    return (
                      <g key={i}>
                        {showLabel && (
                          <text
                            x={p.x}
                            y={svgCoordinates.height - 10}
                            textAnchor="middle"
                            className="fill-slate-400 dark:fill-slate-500 text-[9.5px] font-mono font-bold"
                          >
                            {p.label}
                          </text>
                        )}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPointIndex === i ? 5.8 : 0}
                          fill={metricConfigs[selectedMetric].color}
                          stroke={hoveredPointIndex === i ? '#ffffff' : 'transparent'}
                          strokeWidth={2.0}
                          className="transition-all cursor-pointer shadow-xs"
                          onMouseEnter={() => {
                            setHoveredPointIndex(i);
                            setHoveredLine(metricConfigs[selectedMetric].label);
                          }}
                          onMouseLeave={() => {
                            setHoveredPointIndex(null);
                            setHoveredLine(null);
                          }}
                        />
                      </g>
                    );
                  })}

                  {/* Vertical Guide Line */}
                  {hoveredPointIndex !== null && svgCoordinates.lines[selectedMetric]?.points?.[hoveredPointIndex] && (
                    <>
                      <line
                        x1={svgCoordinates.lines[selectedMetric].points[hoveredPointIndex].x}
                        y1={svgCoordinates.marginY}
                        x2={svgCoordinates.lines[selectedMetric].points[hoveredPointIndex].x}
                        y2={svgCoordinates.height - svgCoordinates.marginY}
                        stroke="rgba(148, 163, 184, 0.45)"
                        strokeWidth={1.2}
                        strokeDasharray="4 3"
                        pointerEvents="none"
                      />
                      {(() => {
                        const pt = svgCoordinates.lines[selectedMetric].points[hoveredPointIndex];
                        const labelText = pt.label;
                        const textWidth = Math.max(labelText.length * 7.0 + 12, 42);
                        return (
                          <g pointerEvents="none" className="transition-all duration-150">
                            <rect
                              x={pt.x - textWidth / 2}
                              y={svgCoordinates.height - svgCoordinates.marginY - 8}
                              width={textWidth}
                              height={16}
                              rx={3.5}
                              ry={3.5}
                              className="fill-slate-900 stroke-slate-800 dark:fill-slate-950 dark:stroke-slate-700"
                              strokeWidth={0.8}
                            />
                            <text
                              x={pt.x}
                              y={svgCoordinates.height - svgCoordinates.marginY + 3.5}
                              textAnchor="middle"
                              className="fill-white font-mono font-extrabold text-[9px]"
                            >
                              {labelText}
                            </text>
                          </g>
                        );
                      })()}
                    </>
                  )}

                  {/* Invisible Vertical Interaction Slices for Wide stable hovering */}
                  {(svgCoordinates.lines[selectedMetric]?.points || []).map((p, i) => {
                    const step = (svgCoordinates.width - svgCoordinates.marginX - svgCoordinates.rightMargin) / Math.max(data.length - 1, 1);
                    const rectWidth = step;
                    const rectX = p.x - step / 2;
                    return (
                      <rect
                        key={`slice-${i}`}
                        x={rectX}
                        y={0}
                        width={rectWidth}
                        height={svgCoordinates.height}
                        fill="transparent"
                        style={{ pointerEvents: 'auto' }}
                        className="cursor-pointer"
                        onMouseEnter={() => {
                          setHoveredPointIndex(i);
                        }}
                      />
                    );
                  })}
                </svg>

                {/* DYNAMIC COMPREHENSIVE INTERACTIVE TOOLTIP */}
                {hoveredPointIndex !== null && data[hoveredPointIndex] && (() => {
                  const pt = svgCoordinates.lines[selectedMetric]?.points?.[hoveredPointIndex];
                  const leftPercentage = pt ? (pt.x / svgCoordinates.width) * 100 : 50;
                  const topPercentage = pt ? (pt.y / svgCoordinates.height) * 100 : 40;
                  
                  return (
                    <div
                      className="absolute z-10 bg-[#0c1222]/95 backdrop-blur-md text-slate-100 p-3.5 rounded-xl border border-slate-750/80 shadow-[0_12px_36px_rgba(0,0,0,0.5)] text-[11px] leading-normal w-[245px] pointer-events-none transition-all duration-75 select-none animate-fade-in"
                      style={{
                        left: `${leftPercentage}%`,
                        top: `${topPercentage}%`,
                        transform: 'translate(-50%, calc(-100% - 14px))'
                      }}
                    >
                      {/* Arrow */}
                      <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-[#0c1222]/95 border-r border-b border-slate-750/80 pointer-events-none" />

                      <div className="flex items-center justify-between font-bold border-b border-slate-750/85 pb-2 mb-2">
                        <span className="text-slate-200">{formatReportDate(data[hoveredPointIndex].sortKey, data[hoveredPointIndex].label)}</span>
                        <span className="text-[9px] bg-red-500/10 text-red-400 font-mono px-1.5 py-0.5 rounded border border-red-500/20">
                          {groupType === 'day' ? 'День' : groupType === 'week' ? 'Неделя' : groupType === 'month' ? 'Месяц' : 'Год'}
                        </span>
                      </div>

                      {/* ACTIVE GRAPH LEGEND INDICATOR */}
                      <div className="mb-2.5 pb-2 border-b border-slate-850/80 text-[10px] flex flex-col gap-1">
                        <div className="text-slate-500 uppercase text-[8px] font-bold tracking-wider">Текущий выбор:</div>
                        <div className="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
                          <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: metricConfigs[selectedMetric].color }} />
                          <span className="text-slate-100 font-black">{metricConfigs[selectedMetric].label}</span>
                        </div>
                      </div>

                      <div className="space-y-1 my-1 overflow-y-auto max-h-[220px]">
                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-all ${selectedMetric === 'totalCalls' ? 'bg-blue-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span>Всего звонков:</span>
                          </span>
                          <span className="font-mono font-bold">{data[hoveredPointIndex].totalCalls}</span>
                        </div>

                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-all ${selectedMetric === 'inboundCalls' ? 'bg-cyan-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                            <span>Входящие:</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-400">{data[hoveredPointIndex].inboundCalls}</span>
                        </div>

                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-all ${selectedMetric === 'outboundCalls' ? 'bg-indigo-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <span>Исходящие:</span>
                          </span>
                          <span className="font-mono font-bold text-cyan-400">{data[hoveredPointIndex].outboundCalls}</span>
                        </div>

                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-all ${selectedMetric === 'internalCalls' ? 'bg-purple-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            <span>Внутренние:</span>
                          </span>
                          <span className="font-mono font-bold text-orange-400">{data[hoveredPointIndex].internalCalls}</span>
                        </div>

                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-all ${selectedMetric === 'missedCalls' ? 'bg-rose-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Пропущенные:</span>
                          </span>
                          <span className="font-mono font-bold text-rose-400">{data[hoveredPointIndex].missedCalls}</span>
                        </div>

                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-all ${selectedMetric === 'processedCalls' ? 'bg-emerald-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Обработанные:</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-300">{data[hoveredPointIndex].processedCalls}</span>
                        </div>

                        <div className={`flex items-center justify-between gap-4 px-1 py-0.5 rounded border-t border-slate-800/80 transition-all ${selectedMetric === 'lostCalls' ? 'bg-amber-500/10 text-white font-bold' : ''}`}>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>Потерянные:</span>
                          </span>
                          <span className="font-mono font-bold text-amber-400">{data[hoveredPointIndex].lostCalls}</span>
                        </div>

                        {selectedExts.length > 0 && (
                          <div className="pt-1.5 mt-1.5 border-t border-slate-800/80 space-y-1">
                            <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                              <span className="w-1 h-2.5 bg-red-500 rounded-sm" />
                              Абоненты:
                            </div>
                            {selectedExts.map((eNum, eIdx) => {
                              const val = data[hoveredPointIndex].extCalls?.[eNum] || 0;
                              const color = extColors[eIdx % extColors.length];
                              const name = getDirName(eNum);
                              return (
                                <div key={eNum} className="flex items-center justify-between gap-2 text-[10px] bg-slate-900/40 p-1 rounded border border-slate-850/60">
                                  <span className="flex items-center gap-1 text-slate-300 truncate max-w-[145px]">
                                    <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    {eNum} {name ? `(${name.split(' ')[0]})` : ''}
                                  </span>
                                  <span className="font-mono font-bold" style={{ color }}>{val} зв.</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM METRIC CARD STATS INFOFOOTER */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-slate-150 dark:border-slate-800 pt-5 mt-4 select-none">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-red-50 dark:bg-red-950/20 text-red-650 rounded-xl">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] text-slate-450 uppercase font-black tracking-wider">Максимальный пик вызовов</div>
              <div className="text-sm font-black text-slate-800 dark:text-white mt-0.5">
                {data.length > 0 ? (
                  <>
                    {Math.max(...data.map(d => d[selectedMetric] || 0))} в{' '}
                    <span className="font-mono underline">
                      {data.find(d => (d[selectedMetric] || 0) === Math.max(...data.map(z => z[selectedMetric] || 0)))?.label}
                    </span>
                  </>
                ) : (
                  'Нет данных'
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="p-3 bg-red-50 dark:bg-red-950/20 text-red-650 rounded-xl">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] text-slate-450 uppercase font-black tracking-wider">Среднее время разговора</div>
              <div className="text-sm font-black text-slate-800 dark:text-white mt-0.5">
                {formatDurationStr(summary.avgDuration)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="p-3 bg-red-50 dark:bg-red-950/20 text-red-650 rounded-xl">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] text-slate-450 uppercase font-black tracking-wider">Доля отзвонов (SLA KPI)</div>
              <div className="text-sm font-black text-slate-800 dark:text-white mt-0.5 flex items-center gap-1.5">
                <span>{summary.slaPercent}%</span>
                <span className={`text-[10.5px] font-bold px-1.5 rounded-full ${summary.slaPercent >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {summary.slaPercent >= 80 ? 'SLA OK' : 'SLA LOW'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: SELECTED EXTENSIONS & DIRECTORY CONTACTS PICKER */}
        <div className="mt-6 pt-5 border-t border-slate-150 dark:border-slate-800/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Hash className="h-4 w-4 text-red-500" />
                Сравнение внутренних абонентов на графике
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                Выберите внутренних абонентов из справочника ниже или из карточек детализации, чтобы отобразить и сопоставить их нагрузку в виде отдельных линий
              </p>
            </div>
            {selectedExts.length > 0 && (
              <button
                onClick={() => setSelectedExts([])}
                className="text-[10px] bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-500 font-bold transition-all cursor-pointer"
              >
                Сбросить всех ({selectedExts.length})
              </button>
            )}
          </div>

          {/* Active selected extension pills with customized color indicators */}
          {selectedExts.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-3 mb-3 border-b border-dashed border-slate-100 dark:border-slate-800/20 animate-fade-in">
              {selectedExts.map((eNum, idx) => {
                const color = extColors[idx % extColors.length];
                const dName = getDirName(eNum);
                return (
                  <span
                    key={eNum}
                    style={{ borderColor: `${color}40`, backgroundColor: `${color}08` }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-bold text-slate-750 dark:text-slate-300"
                  >
                    <span className="w-1.5 h-1.5 rounded-full ring-1 ring-white dark:ring-slate-900" style={{ backgroundColor: color }} />
                    <span className="font-mono">{eNum}</span>
                    {dName && <span className="text-slate-400 font-medium text-[11px]">({dName})</span>}
                    <button
                      onClick={() => toggleExtTrend(eNum)}
                      className="ml-1 hover:text-red-500 text-slate-400 font-normal select-none cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* List of internal employees from the Directory */}
          {(() => {
            const internalInDirectory = directory.filter(d => d.type === 'internal');
            if (internalInDirectory.length === 0) {
              return (
                <div className="text-[11px] text-slate-400 italic py-2">
                  В справочнике нет абонентов с типом "Внутренний". Пометьте контакты в справочнике как внутренние, чтобы добавлять их здесь.
                </div>
              );
            }

            return (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-405">Быстрый выбор из справочника контактов:</div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-150 dark:border-slate-800/40">
                  {internalInDirectory.map(contact => {
                    const numberStr = String(contact.number);
                    const isSelected = selectedExts.includes(numberStr);
                    const colorIndex = selectedExts.indexOf(numberStr);
                    const pillColor = colorIndex !== -1 ? extColors[colorIndex % extColors.length] : undefined;

                    return (
                      <button
                        key={contact.id}
                        onClick={() => toggleExtTrend(numberStr)}
                        className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-white dark:bg-[#151c2c] shadow-3xs'
                            : 'bg-white dark:bg-[#1e293b]/50 border-slate-205 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        style={isSelected ? { borderColor: pillColor, color: pillColor, boxShadow: `0 1px 3px ${pillColor}15` } : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded-[3px] border-slate-350 dark:border-slate-700 pointer-events-none text-red-500 focus:ring-0 focus:ring-offset-0 h-3 w-3"
                          style={isSelected ? { accentColor: pillColor } : undefined}
                        />
                        <span>{contact.name || numberStr}</span>
                        <span className="font-mono text-[9px] opacity-75">[{numberStr}]</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 🧭 ДЕТАЛИЗАЦИЯ НАГРУЗКИ ПО КАТЕГОРИЯМ */}
      {detailingType !== 'none' && detailingData && (
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-2xl p-5 shadow-xs animate-fade-in">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span className="w-1.5 h-3 bg-red-500 rounded-xs" />
              Анализ нагрузки по типу: <span className="text-red-500 font-black">
                {detailingType === 'extensions' && 'Внутренние абоненты'}
                {detailingType === 'trunks' && 'Транки (Внешние линии)'}
                {detailingType === 'queues' && 'Очереди вызовов'}
                {detailingType === 'groups' && 'Группы вызова'}
                {detailingType === 'outboundRules' && 'Исходящие правила'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
              Распределение звонков и суммарного времени соединения за выбранный период
            </p>
          </div>

          <div className="mt-5">
            {(() => {
              const currentList = detailingData[detailingType] || [];
              if (currentList.length === 0) {
                return (
                  <div className="text-center py-10 text-xs text-slate-400 dark:text-slate-500 font-medium">
                    Нет данных детализации для выбранного фильтра и направления
                  </div>
                );
              }

              const maxCalls = Math.max(...currentList.map(item => item.totalCalls), 1);
              const formatDuration = (sec: number) => {
                const h = Math.floor(sec / 3600);
                const m = Math.floor((sec % 3600) / 60);
                const s = sec % 60;
                if (h > 0) return `${h} ч ${m} мин`;
                if (m > 0) return `${m} мин ${s} сек`;
                return `${s} сек`;
              };

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentList.map((item) => {
                    const pct = (item.totalCalls / maxCalls) * 100;
                    const isSelectedExt = detailingType === 'extensions' && selectedExts.includes(item.name);
                    const extColorIndex = isSelectedExt ? selectedExts.indexOf(item.name) : -1;
                    const cardBorderColor = extColorIndex !== -1 ? extColors[extColorIndex % extColors.length] : undefined;

                    return (
                      <div 
                        key={item.name} 
                        className="flex flex-col space-y-2 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/30 p-4 rounded-xl border border-slate-150 dark:border-slate-850/80 transition-all shadow-3xs hover:shadow-2xs"
                        style={cardBorderColor ? { borderColor: cardBorderColor, boxShadow: `0 2px 8px ${cardBorderColor}12` } : undefined}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate pr-2 max-w-[220px]" title={item.name}>
                            {detailingType === 'extensions' ? (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelectedExt}
                                  onChange={() => toggleExtTrend(item.name)}
                                  className="rounded-[4px] border-slate-300 dark:border-slate-700 text-red-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                                  style={isSelectedExt ? { accentColor: cardBorderColor } : undefined}
                                />
                                <span className="hover:text-red-500 font-bold">
                                  {item.name} {getDirName(item.name) ? `(${getDirName(item.name)})` : ''}
                                </span>
                              </label>
                            ) : detailingType === 'outboundRules' ? (
                              <span>Исх. правило: {item.name}</span>
                            ) : detailingType === 'queues' ? (
                              <span>Очередь: {item.name}</span>
                            ) : detailingType === 'groups' ? (
                              <span>Группа: {item.name}</span>
                            ) : (
                              <span>Транк: {item.name}</span>
                            )}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 font-semibold shrink-0">
                            {item.answeredCalls} / {item.totalCalls} зв.
                          </span>
                        </div>

                        {/* Progress Bar Container */}
                        <div className="space-y-1">
                          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-lg transition-all duration-500"
                              style={{ 
                                width: `${pct}%`,
                                ...(cardBorderColor ? { backgroundImage: `linear-gradient(to right, ${cardBorderColor}, ${cardBorderColor}cc)` } : {})
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono font-medium">
                            <span>Доля нагрузки: {Math.round(pct)}%</span>
                            <span>Длительность: {formatDuration(item.duration)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 📊 SPARKLINES GRID: THE "TRENDS FOR EVERY SINGLE CALL TYPE" (по каждому виду звонков свой график) */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-2xl p-5 shadow-xs">
        <div className="pb-4 border-b border-slate-100 dark:border-slate-800/40">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-305 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-red-500 animate-pulse" />
            Сравнительные тренды по вектору категорий
          </h3>
          <p className="text-[11px] text-slate-405 mt-0.5">
            Каждая категория звонков имеет свой отдельный индивидуальный мини-график активности в реальном времени
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
          {(Object.keys(metricConfigs) as Array<keyof typeof metricConfigs>).map(metric => {
            const cfg = metricConfigs[metric];
            const dataset = data.map(d => d[metric] || 0);
            const totalSum = dataset.reduce((a, b) => a + b, 0);
            const peakVal = Math.max(...dataset, 0);
            const Icon = cfg.icon;

            return (
              <div
                key={metric}
                className="bg-slate-50/50 dark:bg-slate-800/10 hover:bg-slate-50 dark:hover:bg-slate-800/30 border border-slate-150 dark:border-slate-800/80 rounded-xl p-4 flex items-center justify-between gap-4 transition-all"
              >
                <div className="space-y-1.5 shrink-0 max-w-[120px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`p-1.5 rounded-lg ${cfg.bg}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{cfg.short}</span>
                  </div>
                  <div className="text-lg font-black font-mono text-slate-900 dark:text-white leading-none">
                    {totalSum.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400">
                    Пик нагрузки: <span className="font-mono text-slate-650">{peakVal}</span>
                  </div>
                </div>

                {/* Micro sparkline implementation */}
                <div className="flex-1 flex flex-col items-end gap-1">
                  <div className="h-10 w-32 border-b border-slate-250 dark:border-slate-800 relative">
                    {dataset.length > 1 ? (
                      <svg className="w-full h-full overflow-visible">
                        <path
                          d={generateSparklinePoints(dataset, 128, 40)}
                          fill="none"
                          stroke={cfg.color}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[10px] text-slate-400">
                        Точка зафиксирована
                      </div>
                    )}
                  </div>
                  <span className="text-[8.5px] font-mono text-slate-405">
                    {data[0]?.label || ''} → {data[data.length - 1]?.label || ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🏛️ TWO-COLUMN DETAILED REPORTS DATA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA Call Answer Success & Lead Conversion Analysis */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                Эффективность SLA и скорость отзвонов
              </h4>
              
              <button
                onClick={() => setSlaShowAll(p => !p)}
                className="text-[10px] px-2 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded text-slate-500 dark:text-slate-300 font-bold cursor-pointer shrink-0"
              >
                {slaShowAll ? 'Показать 7' : `Показать все (${data.length})`}
              </button>
            </div>
            <p className="text-[11px] text-slate-405">
              Конверсия пропущенных вызовов в завершенные . Кликните колонку для сортировки.
            </p>
          </div>

          <div className="overflow-x-auto mt-4 max-h-[350px] overflow-y-auto">
            <table className="w-full text-left text-[11px] font-sans">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-[9px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
                <tr>
                  <th 
                    onClick={() => {
                      if (slaSortKey === 'period') {
                        setSlaSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSlaSortKey('period');
                        setSlaSortOrder('desc');
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Период{slaSortKey === 'period' ? (slaSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (slaSortKey === 'missed') {
                        setSlaSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSlaSortKey('missed');
                        setSlaSortOrder('desc');
                      }
                    }}
                    className="py-2 px-2 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Пропущено{slaSortKey === 'missed' ? (slaSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (slaSortKey === 'processed') {
                        setSlaSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSlaSortKey('processed');
                        setSlaSortOrder('desc');
                      }
                    }}
                    className="py-2 px-2 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Обработано{slaSortKey === 'processed' ? (slaSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (slaSortKey === 'lost') {
                        setSlaSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSlaSortKey('lost');
                        setSlaSortOrder('desc');
                      }
                    }}
                    className="py-2 px-2 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Потеряно{slaSortKey === 'lost' ? (slaSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (slaSortKey === 'sla') {
                        setSlaSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSlaSortKey('sla');
                        setSlaSortOrder('desc');
                      }
                    }}
                    className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Показатель SLA{slaSortKey === 'sla' ? (slaSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-700 dark:text-slate-300 font-medium">
                {processedSlaData.map((d, index) => {
                  return (
                    <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-semibold font-mono text-slate-900 dark:text-slate-100">{d.label}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-rose-500">{d.missedCalls}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-lime-600 dark:text-lime-400">{d.processedCalls}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-purple-500">{d.lostCalls}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black">
                        <span className={d.sPercent >= 85 ? 'text-emerald-600' : d.sPercent >= 60 ? 'text-amber-500' : 'text-rose-500'}>
                          {d.sPercent}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {processedSlaData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 font-medium">Данные отсутствуют</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 mt-3 text-[10.5px] text-slate-450 leading-relaxed">
            * Целевой регламент телефонии: <span className="font-bold text-emerald-600">SLA &gt;= 90%</span>. Звонки, на которые успели перезвонить в пределах установленного KPI лимита, переводятся в статус Обработанных.
          </div>
        </div>

        {/* Call Duration metrics & Departments load */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="text-xs font-bold text-slate-705 dark:text-slate-205 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-500" />
                Продолжительность разговоров и нагрузка
              </h4>
              
              <button
                onClick={() => setDurationShowAll(p => !p)}
                className="text-[10px] px-2 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded text-slate-500 dark:text-slate-300 font-bold cursor-pointer shrink-0"
              >
                {durationShowAll ? 'Показать 7' : `Показать все (${data.length})`}
              </button>
            </div>
            <p className="text-[11px] text-slate-405">
              Динамика средней длительности результативных вызовов. Кликните колонку для сортировки.
            </p>
          </div>

          <div className="overflow-x-auto mt-4 max-h-[350px] overflow-y-auto">
            <table className="w-full text-left text-[11px] font-sans">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-[9px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
                <tr>
                  <th 
                    onClick={() => {
                      if (durationSortKey === 'period') {
                        setDurationSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setDurationSortKey('period');
                        setDurationSortOrder('desc');
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Период{durationSortKey === 'period' ? (durationSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (durationSortKey === 'answeredCount') {
                        setDurationSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setDurationSortKey('answeredCount');
                        setDurationSortOrder('desc');
                      }
                    }}
                    className="py-2 px-2 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Всего разг.{durationSortKey === 'answeredCount' ? (durationSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (durationSortKey === 'answeredDuration') {
                        setDurationSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setDurationSortKey('answeredDuration');
                        setDurationSortOrder('desc');
                      }
                    }}
                    className="py-2 px-2 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Разговорное время{durationSortKey === 'answeredDuration' ? (durationSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th 
                    onClick={() => {
                      if (durationSortKey === 'avgDuration') {
                        setDurationSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      } else {
                        setDurationSortKey('avgDuration');
                        setDurationSortOrder('desc');
                      }
                    }}
                    className="py-2 px-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                  >
                    Ср. длительность{durationSortKey === 'avgDuration' ? (durationSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-700 dark:text-slate-300 font-medium">
                {processedDurationData.map((d, index) => {
                  return (
                    <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-semibold font-mono text-slate-900 dark:text-slate-100">{d.label}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{d.answeredCount}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-500">{formatDurationStr(d.answeredDuration)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-violet-600 dark:text-violet-400 font-bold">{formatDurationStr(d.itemAvg)}</td>
                    </tr>
                  );
                })}
                {processedDurationData.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400 font-medium">Данные отсутствуют</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 mt-3 text-[10.5px] text-slate-450 leading-relaxed">
            * Учитываются только завершенные содержательные вызовы, где фактическое время разговора (billsec) составило более 0 секунд.
          </div>
        </div>
      </div>
    </div>
  );
}
