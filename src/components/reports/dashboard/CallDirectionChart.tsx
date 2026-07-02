import { useMemo, useState } from 'react';

type GroupType = 'day' | 'week' | 'month' | 'year' | 'hour' | 'weekday';
type Point = { label: string; sortKey?: number; totalCalls: number; inboundCalls: number; missedCalls: number; processedCalls: number };
export type ChartMode = 'all' | 'inbound' | 'missed' | 'sla' | 'departments';

type ChartPoint = Point & { axisLabel: string; tooltipPeriod: string; value: number };

const colors: Record<ChartMode, string> = {
  all: '#2563eb',
  inbound: '#059669',
  missed: '#dc2626',
  sla: '#7c3aed',
  departments: '#f59e0b'
};

const emptyPoint = { totalCalls: 0, inboundCalls: 0, missedCalls: 0, processedCalls: 0 };
const ruMonths = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const ruWeekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function metricValue(point: Point, mode: ChartMode) {
  if (mode === 'inbound') return point.inboundCalls || 0;
  if (mode === 'missed') return point.missedCalls || 0;
  if (mode === 'sla') return point.missedCalls > 0 ? Math.round((point.processedCalls / point.missedCalls) * 100) : 100;
  return point.totalCalls || 0;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('ru-RU') : '0';
}

function parseDate(value: string) {
  const d = new Date(value + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function cloneDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateShort(date: Date) {
  return String(date.getDate()).padStart(2, '0') + '.' + String(date.getMonth() + 1).padStart(2, '0');
}

function formatDateFull(date: Date) {
  return formatDateShort(date) + '.' + date.getFullYear();
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getIsoWeekStart(year: number, week: number) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  if (day <= 4) simple.setUTCDate(simple.getUTCDate() - day + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - day);
  return new Date(simple.getUTCFullYear(), simple.getUTCMonth(), simple.getUTCDate());
}

function formatGroupKey(date: Date, type: GroupType): { label: string; sortKey: number } {
  if (type === 'hour') {
    const hour = date.getHours();
    return { label: String(hour).padStart(2, '0') + ':00', sortKey: hour };
  }
  if (type === 'weekday') {
    const dayIndex = date.getDay();
    const sortKey = dayIndex === 0 ? 7 : dayIndex;
    return { label: ruWeekdays[sortKey - 1], sortKey };
  }
  if (type === 'year') {
    const year = date.getFullYear();
    return { label: String(year), sortKey: year };
  }
  if (type === 'month') {
    const year = date.getFullYear();
    const month = date.getMonth();
    return { label: ruMonths[month] + ' ' + year, sortKey: year * 12 + month };
  }
  if (type === 'week') {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    return { label: 'W' + String(week).padStart(2, '0') + ' ' + year, sortKey: year * 53 + week };
  }
  return { label: formatDateShort(date), sortKey: date.getTime() };
}

function buildTimeline(startDate: string, endDate: string, groupType: GroupType) {
  if (groupType === 'hour') return Array.from({ length: 24 }, (_, hour) => ({ label: String(hour).padStart(2, '0') + ':00', sortKey: hour }));
  if (groupType === 'weekday') return ruWeekdays.map((label, index) => ({ label, sortKey: index + 1 }));

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return [];

  const rows: Array<{ label: string; sortKey: number }> = [];
  const seen = new Set<string>();
  const current = cloneDate(start);
  let safety = 0;

  while (current <= end && safety < 1200) {
    const item = formatGroupKey(current, groupType);
    if (!seen.has(item.label)) {
      seen.add(item.label);
      rows.push(item);
    }
    if (groupType === 'day') current.setDate(current.getDate() + 1);
    else if (groupType === 'week') current.setDate(current.getDate() + 7);
    else if (groupType === 'month') current.setMonth(current.getMonth() + 1);
    else current.setFullYear(current.getFullYear() + 1);
    safety++;
  }

  const endItem = formatGroupKey(end, groupType);
  if (!seen.has(endItem.label)) rows.push(endItem);
  return rows.sort((a, b) => a.sortKey - b.sortKey);
}

function axisLabel(label: string, groupType: GroupType) {
  if (groupType === 'week') return label.replace('W', 'Нед ');
  if (groupType === 'month') return label.split(' ')[0].slice(0, 3) + ' ' + (label.split(' ')[1] || '');
  if (groupType === 'weekday') return label.slice(0, 2);
  return label;
}

function tooltipPeriod(label: string, groupType: GroupType, startDate: string) {
  if (groupType === 'day') {
    const year = parseDate(startDate)?.getFullYear();
    return year ? label + '.' + year : label;
  }
  if (groupType === 'week') {
    const match = label.match(/^W(\d{2})\s+(\d{4})$/);
    if (match) {
      const start = getIsoWeekStart(Number(match[2]), Number(match[1]));
      const end = cloneDate(start);
      end.setDate(end.getDate() + 6);
      return 'Неделя ' + formatDateFull(start) + '-' + formatDateFull(end);
    }
  }
  if (groupType === 'month') return label;
  if (groupType === 'year') return label;
  if (groupType === 'hour') return label.slice(0, 2) + ':00-' + label.slice(0, 2) + ':59';
  return label;
}

function buildChartData(data: Point[], groupType: GroupType, startDate: string, endDate: string, mode: ChartMode): ChartPoint[] {
  const byLabel = new Map(data.map(item => [item.label, item]));
  const timeline = buildTimeline(startDate, endDate, groupType);
  const source = timeline.length ? timeline : data.map(item => ({ label: item.label, sortKey: Number(item.sortKey || 0) }));
  return source.map(item => {
    const original = byLabel.get(item.label) || { label: item.label, sortKey: item.sortKey, ...emptyPoint };
    const point = { ...original, label: item.label, sortKey: item.sortKey };
    return {
      ...point,
      axisLabel: axisLabel(item.label, groupType),
      tooltipPeriod: tooltipPeriod(item.label, groupType, startDate),
      value: metricValue(point, mode)
    };
  });
}

export function CallDirectionChart({
  data,
  mode,
  onModeChange,
  groupType,
  startDate,
  endDate
}: {
  data: Point[];
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  groupType: GroupType;
  startDate: string;
  endDate: string;
}) {
  const modes: Array<{ id: ChartMode; label: string }> = [
    { id: 'all', label: 'Все' },
    { id: 'inbound', label: 'Входящие' },
    { id: 'missed', label: 'Пропущенные' },
    { id: 'sla', label: 'SLA' },
    { id: 'departments', label: 'Отделы' }
  ];
  const [hovered, setHovered] = useState<ChartPoint | null>(null);
  const activeMode = modes.find(item => item.id === mode) || modes[0];
  const safeData = useMemo(() => buildChartData(data, groupType, startDate, endDate, mode), [data, groupType, startDate, endDate, mode]);
  const values = safeData.map(item => item.value);
  const max = Math.max(...values, 1);
  const w = 1120;
  const h = 380;
  const padX = 52;
  const padTop = 12;
  const padBottom = 34;
  const chartBottom = h - padBottom;
  const chartHeight = chartBottom - padTop;
  const labelStep = Math.max(1, Math.ceil(safeData.length / 10));
  const points = safeData.map((item, index) => {
    const x = padX + (index / Math.max(safeData.length - 1, 1)) * (w - padX * 2);
    const y = chartBottom - (item.value / max) * chartHeight;
    return { ...item, x, y };
  });
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.y).join(' ');
  const area = points.length ? path + ' L ' + points[points.length - 1].x + ' ' + chartBottom + ' L ' + points[0].x + ' ' + chartBottom + ' Z' : '';
  const lastValue = values.length ? values[values.length - 1] : 0;
  const hoveredPoint = hovered ? points.find(point => point.label === hovered.label) : null;
  const tooltipValueLabel = mode === 'sla' ? 'SLA' : 'Звонков';
  const tooltipValueSuffix = mode === 'sla' ? '%' : '';

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Динамика звонков</h3>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Ось X — выбранный период, ось Y — количество звонков. Последние точки справа.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {modes.map(item => (
            <button
              key={item.id}
              onClick={() => onModeChange(item.id)}
              className={['rounded-lg px-2.5 py-1 text-[10px] font-bold transition', mode === item.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {safeData.length === 0 ? (
        <div className="mt-5 flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
          Нет данных для графика
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Максимум: {formatNumber(max)}{mode === 'sla' ? '%' : ''}</span>
            <span>Последнее значение: {formatNumber(lastValue)}{mode === 'sla' ? '%' : ''}</span>
          </div>
          <div className="relative">
            <svg className="h-[390px] w-full" viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Динамика звонков">
              <defs>
                <linearGradient id={'callsArea-' + mode} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colors[mode]} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={colors[mode]} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4].map(i => {
                const y = padTop + i * (chartHeight / 4);
                const value = Math.round(max - (i * max / 4));
                return <g key={'h' + i}><line x1={padX} x2={w - padX} y1={y} y2={y} stroke="#edf2f7" strokeWidth="0.55" strokeDasharray="2 7" opacity="0.65" /><text x={padX - 8} y={y + 3} textAnchor="end" className="fill-slate-400 text-[6px] font-semibold">{formatNumber(value)}</text></g>;
              })}
              {points.map((p, i) => {
                const showLabel = i === 0 || i === points.length - 1 || i % labelStep === 0;
                return (
                  <g key={'v' + i}>
                    <line x1={p.x} x2={p.x} y1={padTop} y2={chartBottom} stroke="#f3f6fa" strokeWidth="0.5" strokeDasharray="2 8" />
                    {showLabel && <text x={p.x} y={chartBottom + 20} textAnchor="middle" className="fill-slate-400 text-[6px] font-semibold">{p.axisLabel}</text>}
                  </g>
                );
              })}
              <line x1={padX} x2={padX} y1={padTop} y2={chartBottom} stroke="#dbe3ee" strokeWidth="0.7" />
              <line x1={padX} x2={w - padX} y1={chartBottom} y2={chartBottom} stroke="#dbe3ee" strokeWidth="0.7" />
              <path d={area} fill={'url(#callsArea-' + mode + ')'} />
              <path d={path} fill="none" stroke={colors[mode]} strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round" />
              {hoveredPoint && <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={padTop} y2={chartBottom} stroke={colors[mode]} strokeWidth="0.7" strokeDasharray="3 5" />}
              {points.map((p, i) => (
                <g key={i} onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)}>
                  <rect x={p.x - Math.max(8, (w - padX * 2) / Math.max(points.length - 1, 1) / 2)} y={padTop} width={Math.max(16, (w - padX * 2) / Math.max(points.length - 1, 1))} height={chartHeight} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={hovered?.label === p.label ? '2.4' : '1.25'} fill="#fff" stroke={colors[mode]} strokeWidth="0.85" />
                  {i === points.length - 1 && <circle cx={p.x} cy={p.y} r="3" fill={colors[mode]} opacity="0.12" />}
                </g>
              ))}
            </svg>
            {hoveredPoint && (
              <div className="pointer-events-none absolute z-10 min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900" style={{ left: (hoveredPoint.x / w * 100) + '%', top: (hoveredPoint.y / h * 100) + '%', transform: hoveredPoint.x > w * 0.72 ? 'translate(-105%, -115%)' : 'translate(10px, -115%)' }}>
                <div className="font-black text-slate-900 dark:text-white">{hoveredPoint.tooltipPeriod}</div>
                <div className="mt-1 font-bold text-slate-600 dark:text-slate-300">{activeMode.label}</div>
                <div className="mt-1 font-black" style={{ color: colors[mode] }}>{tooltipValueLabel}: {formatNumber(hoveredPoint.value)}{tooltipValueSuffix}</div>
              </div>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[8px] font-bold text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[mode] }} />Текущая серия: {activeMode.label}</span>
            <span>X — время</span>
            <span>Y — {mode === 'sla' ? 'SLA, %' : 'количество звонков'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
