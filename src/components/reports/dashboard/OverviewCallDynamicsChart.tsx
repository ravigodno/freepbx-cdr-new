import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type OverviewSeriesKey = 'inboundCalls' | 'outboundCalls' | 'internalCalls' | 'missedCalls' | 'processedCalls' | 'lostCalls' | 'slaPercent';

type OverviewPoint = {
  key?: string;
  label: string;
  sortKey?: number;
  inboundCalls?: number;
  outboundCalls?: number;
  internalCalls?: number;
  missedCalls?: number;
  processedCalls?: number;
  lostCalls?: number;
  slaPercent?: number;
};

const series: Array<{ key: OverviewSeriesKey; label: string; color: string; percent?: boolean }> = [
  { key: 'inboundCalls', label: 'Входящие', color: '#059669' },
  { key: 'outboundCalls', label: 'Исходящие', color: '#2563eb' },
  { key: 'internalCalls', label: 'Внутренние', color: '#0891b2' },
  { key: 'missedCalls', label: 'Пропущенные', color: '#f97316' },
  { key: 'processedCalls', label: 'Обработанные', color: '#16a34a' },
  { key: 'lostCalls', label: 'Потерянные', color: '#dc2626' },
  { key: 'slaPercent', label: 'SLA %', color: '#7c3aed', percent: true },
];

const allSeries = new Set<OverviewSeriesKey>(series.map(item => item.key));

function parseDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHourBucket(date: Date): { key: string; label: string } {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return {
    key: `${date.getFullYear()}-${month}-${day} ${hour}:00`,
    label: `${day}.${month} ${hour}:00`
  };
}

function getWeekNumber(date: Date): number {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatCalendarBucket(date: Date, groupType: string): { key: string; label: string } {
  const year = date.getFullYear();
  if (groupType === 'year') return { key: String(year), label: String(year) };
  if (groupType === 'month') {
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const label = `${months[date.getMonth()]} ${year}`;
    return { key: label, label };
  }
  if (groupType === 'week') {
    const label = `W${String(getWeekNumber(date)).padStart(2, '0')} ${year}`;
    return { key: label, label };
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const label = `${day}.${month}`;
  return { key: label, label };
}

function normalizePoint(point: OverviewPoint | undefined, key: string, label: string, sortKey: number): OverviewPoint {
  return {
    key,
    label,
    sortKey,
    inboundCalls: Number(point?.inboundCalls || 0),
    outboundCalls: Number(point?.outboundCalls || 0),
    internalCalls: Number(point?.internalCalls || 0),
    missedCalls: Number(point?.missedCalls || 0),
    processedCalls: Number(point?.processedCalls || 0),
    lostCalls: Number(point?.lostCalls || 0),
    slaPercent: Number(point?.slaPercent || 0),
  };
}

export function buildOverviewData(data: OverviewPoint[], groupType: string, startDate: string, endDate: string): OverviewPoint[] {
  if (groupType === 'weekday') {
    return [...data]
      .sort((a, b) => Number(a.sortKey || 0) - Number(b.sortKey || 0))
      .map(point => normalizePoint(point, point.key || point.label, point.label, Number(point.sortKey || 0)));
  }

  const start = parseDate(startDate);
  const endDateValue = parseDate(endDate);
  if (!start || !endDateValue || start > endDateValue) return [...data].sort((a, b) => Number(a.sortKey || 0) - Number(b.sortKey || 0));
  if (groupType !== 'hour') {
    const byKey = new Map(data.map(point => [point.key || point.label, point]));
    const result: OverviewPoint[] = [];
    let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let safety = 0;
    while (current <= endDateValue && safety < 10000) {
      const { key, label } = formatCalendarBucket(current, groupType);
      if (!result.some(point => point.key === key)) result.push(normalizePoint(byKey.get(key), key, label, current.getTime()));
      if (groupType === 'week') current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
      else if (groupType === 'month') current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      else if (groupType === 'year') current = new Date(current.getFullYear() + 1, 0, 1);
      else current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      safety++;
    }
    const endBucket = formatCalendarBucket(endDateValue, groupType);
    if (!result.some(point => point.key === endBucket.key)) result.push(normalizePoint(byKey.get(endBucket.key), endBucket.key, endBucket.label, endDateValue.getTime()));
    return result.sort((a, b) => Number(a.sortKey || 0) - Number(b.sortKey || 0));
  }

  const end = new Date(endDateValue.getFullYear(), endDateValue.getMonth(), endDateValue.getDate(), 23);
  const byKey = new Map(data.map(point => [point.key || point.label, point]));
  const result: OverviewPoint[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0);
  let safety = 0;

  while (current <= end && safety < 50000) {
    const { key, label } = formatHourBucket(current);
    result.push(normalizePoint(byKey.get(key), key, label, current.getTime()));
    current.setHours(current.getHours() + 1);
    safety++;
  }
  return result;
}

export function buildOverviewTicks(data: OverviewPoint[], maxTicks = 8): string[] {
  if (data.length <= maxTicks) return data.map(point => point.label);
  const lastIndex = data.length - 1;
  const indexes = new Set<number>([0, lastIndex]);
  for (let position = 1; position < maxTicks - 1; position++) {
    indexes.add(Math.round((lastIndex * position) / (maxTicks - 1)));
  }
  return [...indexes].sort((a, b) => a - b).map(index => data[index].label);
}

function OverviewTooltip({ active, label, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="font-black text-slate-900 dark:text-white">{label}</div>
      <div className="mt-1.5 space-y-1">
        {payload.map((entry: any) => {
          const config = series.find(item => item.key === entry.dataKey);
          if (!config) return null;
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4 font-bold">
              <span style={{ color: config.color }}>{config.label}</span>
              <span className="font-mono text-slate-800 dark:text-slate-100">{Number(entry.value || 0).toLocaleString('ru-RU')}{config.percent ? '%' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OverviewCallDynamicsChart({ data, groupType, startDate, endDate }: { data: OverviewPoint[]; groupType: string; startDate: string; endDate: string }) {
  const [selected, setSelected] = useState<Set<OverviewSeriesKey>>(() => new Set(allSeries));
  const chartData = useMemo(() => buildOverviewData(data, groupType, startDate, endDate), [data, groupType, startDate, endDate]);
  const axisTicks = useMemo(() => buildOverviewTicks(chartData), [chartData]);
  const allSelected = selected.size === series.length;

  const toggleSeries = (key: OverviewSeriesKey) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size ? next : new Set(allSeries);
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-base font-black text-slate-950 dark:text-white">Динамика звонков</h3>
        <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Количество звонков — левая шкала, SLA — правая шкала в процентах.</p>
      </div>
      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-stretch">
        <div className="h-[390px] min-w-0 overflow-visible">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" vertical={false} />
              <XAxis dataKey="label" ticks={axisTicks} interval={0} minTickGap={30} tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} width={38} />
              <YAxis yAxisId="sla" orientation="right" domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 10, fill: '#7c3aed' }} width={42} />
              <Tooltip content={<OverviewTooltip />} />
              {series.filter(item => selected.has(item.key)).map(item => (
                <Line key={item.key} yAxisId={item.percent ? 'sla' : 'count'} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div role="group" aria-label="Серии графика" className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 lg:grid-cols-1 lg:content-start dark:border-slate-700 dark:bg-slate-800/60">
          <button type="button" aria-pressed={allSelected} onClick={() => setSelected(new Set(allSeries))} className={['flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', allSelected ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'].join(' ')}>
            <span className="h-2.5 w-2.5 rounded-full border-2 border-current" />Все
          </button>
          {series.map(item => (
            <button type="button" aria-pressed={selected.has(item.key)} key={item.key} onClick={() => toggleSeries(item.key)} className={['flex h-9 items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', selected.has(item.key) ? 'border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white' : 'border-transparent text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700'].join(' ')}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
