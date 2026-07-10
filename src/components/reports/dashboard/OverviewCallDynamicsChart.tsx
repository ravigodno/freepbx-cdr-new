import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type OverviewSeriesKey = 'inboundCalls' | 'outboundCalls' | 'internalCalls' | 'missedCalls' | 'processedCalls' | 'lostCalls' | 'slaPercent';

type OverviewPoint = {
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

function formatHourLabel(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${day}.${month} ${hour}:00`;
}

function normalizePoint(point: OverviewPoint | undefined, label: string, sortKey: number): OverviewPoint {
  return {
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
  if (groupType !== 'hour') {
    return [...data]
      .sort((a, b) => Number(a.sortKey || 0) - Number(b.sortKey || 0))
      .map(point => normalizePoint(point, point.label, Number(point.sortKey || 0)));
  }

  const start = parseDate(startDate);
  const endDateValue = parseDate(endDate);
  if (!start || !endDateValue || start > endDateValue) return [];
  const end = new Date(endDateValue.getFullYear(), endDateValue.getMonth(), endDateValue.getDate(), 23);
  const byLabel = new Map(data.map(point => [point.label, point]));
  const result: OverviewPoint[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0);
  let safety = 0;

  while (current <= end && safety < 50000) {
    const label = formatHourLabel(current);
    result.push(normalizePoint(byLabel.get(label), label, current.getTime()));
    current.setHours(current.getHours() + 1);
    safety++;
  }
  return result;
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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Динамика звонков</h3>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Количество звонков — левая шкала, SLA — правая шкала в процентах.</p>
        </div>
        <div className="flex max-w-3xl flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button type="button" onClick={() => setSelected(new Set(allSeries))} className={['rounded-lg px-2.5 py-1 text-[10px] font-bold transition', allSelected ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'].join(' ')}>Все</button>
          {series.map(item => (
            <button type="button" key={item.key} onClick={() => toggleSeries(item.key)} className={['rounded-lg px-2.5 py-1 text-[10px] font-bold transition', selected.has(item.key) ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700'].join(' ')} style={selected.has(item.key) ? { backgroundColor: item.color } : undefined}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[390px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" vertical={false} />
            <XAxis dataKey="label" minTickGap={30} tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} width={38} />
            <YAxis yAxisId="sla" orientation="right" domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 10, fill: '#7c3aed' }} width={42} />
            <Tooltip content={<OverviewTooltip />} />
            {series.filter(item => selected.has(item.key)).map(item => (
              <Line key={item.key} yAxisId={item.percent ? 'sla' : 'count'} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
