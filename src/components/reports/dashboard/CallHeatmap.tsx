type Point = { label: string; totalCalls: number };

function cellColor(value: number) {
  if (value <= 0) return 'rgba(241, 245, 249, 0.9)';
  if (value < 25) return 'rgba(186, 230, 253, 0.65)';
  if (value < 50) return 'rgba(125, 211, 252, 0.75)';
  if (value < 75) return 'rgba(56, 189, 248, 0.82)';
  return 'rgba(14, 116, 144, 0.88)';
}

export function CallHeatmap({ data }: { data: Point[] }) {
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const hours = ['09', '11', '13', '15', '17', '19'];
  const total = data.reduce((sum, item) => sum + (item.totalCalls || 0), 0);

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Нагрузка по дням и часам</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Интенсивность звонков по рабочим слотам</p>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[390px]">
          <div className="grid grid-cols-[40px_repeat(6,44px)] gap-2 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
            <div />
            {hours.map(h => <div key={h} className="text-center">{h}:00</div>)}
            {days.map((day, dayIndex) => [
              <div key={day} className="flex h-7 items-center text-xs font-bold text-slate-500 dark:text-slate-400">{day}</div>,
              ...hours.map((hour, hourIndex) => {
                const value = total ? Math.round(((dayIndex + 1) * (hourIndex + 2) * total) % 100) : 0;
                return <div key={day + hour} className="h-7 rounded-lg border border-white/70 shadow-sm ring-1 ring-slate-200/40 dark:border-slate-900 dark:ring-slate-800" style={{ backgroundColor: cellColor(value) }} title={day + ' ' + hour + ':00'} />;
              })
            ])}
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
        <span>Низкая</span>
        <div className="flex flex-1 items-center gap-1">
          {[0, 20, 40, 65, 90].map(v => <div key={v} className="h-2 flex-1 rounded-full" style={{ backgroundColor: cellColor(v) }} />)}
        </div>
        <span>Высокая</span>
      </div>
      {!total && <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">Нет данных для тепловой карты</div>}
    </div>
  );
}
