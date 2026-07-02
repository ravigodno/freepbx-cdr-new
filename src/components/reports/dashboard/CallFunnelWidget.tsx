function percent(value: number, base: number) {
  if (!base) return 0;
  const result = Math.round((value / base) * 100);
  return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : 0;
}

export function CallFunnelWidget({ inbound, missed, processed, lost }: { inbound: number; missed: number; processed: number; lost: number }) {
  const answered = Math.max(inbound - missed, 0);
  const stages = [
    { label: 'Входящие', value: inbound, color: 'bg-blue-600', soft: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' },
    { label: 'Ответили', value: answered, color: 'bg-emerald-600', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
    { label: 'Пропущены', value: missed, color: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
    { label: 'Перезвонили', value: processed, color: 'bg-violet-600', soft: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300' },
    { label: 'Потеряны', value: lost, color: 'bg-rose-600', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' }
  ];
  const max = Math.max(inbound, 1);

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-base font-black text-slate-950 dark:text-white">Воронка обработки входящих</h3>
        <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Путь входящего звонка от поступления до закрытия</p>
      </div>
      <div className="mt-4 flex-1 space-y-2.5">
        {stages.map(stage => {
          const share = percent(stage.value, max);
          return (
            <div key={stage.label} className="grid grid-cols-[92px_minmax(0,1fr)_56px_42px] items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/20">
              <div className="flex min-w-0 items-center gap-2">
                <span className={['h-2 w-2 shrink-0 rounded-full', stage.color].join(' ')} />
                <span className="truncate text-xs font-black text-slate-700 dark:text-slate-200">{stage.label}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-700">
                <div className={['h-full rounded-full', stage.color].join(' ')} style={{ width: Math.max(stage.value ? 6 : 0, share) + '%' }} />
              </div>
              <span className="text-right font-mono text-xs font-black text-slate-950 dark:text-white">{stage.value.toLocaleString('ru-RU')}</span>
              <span className={['text-center rounded-full px-1.5 py-0.5 text-[10px] font-black', stage.soft].join(' ')}>{share}%</span>
            </div>
          );
        })}
      </div>
      {!inbound && <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 text-center text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">Нет входящих звонков за выбранный период</div>}
    </div>
  );
}
