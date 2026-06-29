type Point = { label: string; totalCalls: number; inboundCalls: number; missedCalls: number; processedCalls: number };
export type ChartMode = 'all' | 'inbound' | 'missed' | 'sla' | 'departments';

const colors: Record<ChartMode, string> = {
  all: '#2563eb',
  inbound: '#059669',
  missed: '#dc2626',
  sla: '#7c3aed',
  departments: '#f59e0b'
};

function metricValue(point: Point, mode: ChartMode) {
  if (mode === 'inbound') return point.inboundCalls || 0;
  if (mode === 'missed') return point.missedCalls || 0;
  if (mode === 'sla') return point.missedCalls > 0 ? Math.round((point.processedCalls / point.missedCalls) * 100) : 100;
  return point.totalCalls || 0;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('ru-RU') : '0';
}

export function CallDirectionChart({ data, mode, onModeChange }: { data: Point[]; mode: ChartMode; onModeChange: (mode: ChartMode) => void }) {
  const modes: Array<{ id: ChartMode; label: string }> = [
    { id: 'all', label: 'Все' },
    { id: 'inbound', label: 'Входящие' },
    { id: 'missed', label: 'Пропущенные' },
    { id: 'sla', label: 'SLA' },
    { id: 'departments', label: 'Отделы' }
  ];
  const safeData = data.slice(-18);
  const values = safeData.map(item => metricValue(item, mode));
  const max = Math.max(...values, 1);
  const w = 760;
  const h = 300;
  const padX = 42;
  const padY = 30;
  const chartHeight = h - padY * 2;
  const points = safeData.map((item, index) => {
    const x = padX + (index / Math.max(safeData.length - 1, 1)) * (w - padX * 2);
    const y = h - padY - (metricValue(item, mode) / max) * chartHeight;
    return { x, y, label: item.label, value: metricValue(item, mode) };
  });
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.y).join(' ');
  const area = points.length ? path + ' L ' + points[points.length - 1].x + ' ' + (h - padY) + ' L ' + points[0].x + ' ' + (h - padY) + ' Z' : '';
  const lastValue = values.length ? values[values.length - 1] : 0;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Динамика звонков</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Тренд по выбранному периоду, последние точки отображаются справа</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {modes.map(item => (
            <button
              key={item.id}
              onClick={() => onModeChange(item.id)}
              className={['rounded-lg px-3 py-1.5 text-xs font-bold transition', mode === item.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'].join(' ')}
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
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Максимум: {formatNumber(max)}</span>
            <span>Последнее значение: {formatNumber(lastValue)}</span>
          </div>
          <svg className="h-[320px] w-full" viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" role="img" aria-label="Динамика звонков">
            <defs>
              <linearGradient id={'callsArea-' + mode} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={colors[mode]} stopOpacity="0.18" />
                <stop offset="100%" stopColor={colors[mode]} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map(i => {
              const y = padY + i * (chartHeight / 4);
              return <line key={i} x1={padX} x2={w - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 8" />;
            })}
            <path d={area} fill={'url(#callsArea-' + mode + ')'} />
            <path d={path} fill="none" stroke={colors[mode]} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3" fill="#fff" stroke={colors[mode]} strokeWidth="2" />
                {i === points.length - 1 && <circle cx={p.x} cy={p.y} r="6" fill={colors[mode]} opacity="0.14" />}
              </g>
            ))}
          </svg>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Все</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Входящие</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" />Проблемы</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" />SLA</span>
          </div>
        </div>
      )}
    </div>
  );
}
