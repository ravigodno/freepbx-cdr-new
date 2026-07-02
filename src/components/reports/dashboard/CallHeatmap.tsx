export type HeatmapHour = { hour: number; total: number; incoming: number; outgoing: number; answered: number; missed: number; lost: number };
export type HeatmapDay = { day: string; hours: HeatmapHour[] };
type LegacyPoint = { label: string; totalCalls: number; inboundCalls?: number; outboundCalls?: number; processedCalls?: number; missedCalls?: number; lostCalls?: number };

function cellColor(value: number, max: number) {
  if (value <= 0 || max <= 0) return 'rgba(241, 245, 249, 0.9)';
  const intensity = value / max;
  if (intensity < 0.2) return 'rgba(186, 230, 253, 0.65)';
  if (intensity < 0.45) return 'rgba(125, 211, 252, 0.75)';
  if (intensity < 0.7) return 'rgba(56, 189, 248, 0.82)';
  return 'rgba(14, 116, 144, 0.9)';
}

function buildFallbackHeatmap(data: LegacyPoint[]): HeatmapDay[] {
  const labels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
  return labels.map((day, dayIndex) => ({
    day,
    hours: Array.from({ length: 25 }, (_, hour) => {
      const source = hour < 24 ? data[(dayIndex * 24 + hour) % Math.max(1, data.length)] : null;
      const value = hour < 24 && data.length ? Math.round(Number(source?.totalCalls || 0) / 24) : 0;
      return { hour, total: value, incoming: 0, outgoing: 0, answered: 0, missed: 0, lost: 0 };
    })
  }));
}

export function CallHeatmap({ data, heatmap }: { data: LegacyPoint[]; heatmap?: { days?: HeatmapDay[] } | null }) {
  const days = heatmap?.days?.length ? heatmap.days : buildFallbackHeatmap(data);
  const hours = Array.from({ length: 25 }, (_, hour) => hour);
  const max = Math.max(0, ...days.flatMap(day => day.hours.map(hour => Number(hour.total || 0))));
  const total = days.reduce((sum, day) => sum + day.hours.reduce((daySum, hour) => daySum + Number(hour.total || 0), 0), 0);

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Нагрузка по дням и часам</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Полная почасовая карта суток: 00:00-24:00</p>
        </div>
      </div>
      <div className="mt-4 flex-1 overflow-x-auto">
        <div className="min-w-[610px]">
          <div className="grid grid-cols-[28px_repeat(25,minmax(17px,1fr))] gap-1 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">
            <div />
            {hours.map(hour => <div key={hour} className="text-center">{String(hour).padStart(2, '0')}</div>)}
            {days.map(day => [
              <div key={day.day} className="flex h-6 items-center text-[10px] font-bold text-slate-500 dark:text-slate-400">{day.day}</div>,
              ...hours.map(hour => {
                const cell = day.hours.find(item => Number(item.hour) === hour) || { hour, total: 0, incoming: 0, outgoing: 0, answered: 0, missed: 0, lost: 0 };
                const interval = hour === 24 ? '24:00-24:00' : String(hour).padStart(2, '0') + ':00-' + String(hour).padStart(2, '0') + ':59';
                const title = day.day + ' ' + interval + '\nВсего: ' + cell.total + '\nВходящих: ' + cell.incoming + '\nИсходящих: ' + cell.outgoing + '\nОбработанных: ' + cell.answered + '\nПропущенных: ' + cell.missed + '\nПотерянных: ' + cell.lost;
                return <div key={day.day + hour} className="flex h-6 items-center justify-center rounded border border-white/70 text-[9px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200/40 dark:border-slate-900 dark:text-slate-200 dark:ring-slate-800" style={{ backgroundColor: cellColor(Number(cell.total || 0), max) }} title={title}>{cell.total || ''}</div>;
              })
            ])}
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">
        <span>Низкая</span>
        <div className="flex flex-1 items-center gap-1">
          {[0, 0.25, 0.5, 0.75, 1].map(v => <div key={v} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: cellColor(Math.round(max * v), max) }} />)}
        </div>
        <span>Высокая</span>
      </div>
      {!total && <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 text-center text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">Нет данных для тепловой карты</div>}
    </div>
  );
}
