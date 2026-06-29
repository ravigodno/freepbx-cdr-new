export type TrunkSummaryRow = {
  trunkName?: string | null;
  trunkType?: 'chan_sip' | 'pjsip' | 'unknown' | string | null;
  inboundCalls?: number;
  outboundCalls?: number;
  totalCalls?: number;
  answeredCalls?: number;
  missedCalls?: number;
  failedCalls?: number;
  busyCalls?: number;
  noAnswerCalls?: number;
  averageDurationSeconds?: number;
  acd?: number;
  asr?: number;
  loadPercent?: number;
  qualityLabel?: 'ok' | 'warning' | 'problem' | 'unknown' | string;
  statusText?: string;
  lastCallAt?: string | null;
  liveStatus?: string;
};

function safeNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function labelForType(type: unknown): string {
  if (type === 'chan_sip') return 'chan_sip';
  if (type === 'pjsip') return 'PJSIP';
  return '—';
}

function statusFor(label: unknown) {
  if (label === 'ok') {
    return { label: 'OK', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300', bar: 'bg-emerald-500' };
  }
  if (label === 'problem') {
    return { label: 'Проблема', className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300', bar: 'bg-rose-500' };
  }
  if (label === 'unknown') {
    return { label: 'Нет данных', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', bar: 'bg-slate-400' };
  }
  return { label: 'Внимание', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300', bar: 'bg-amber-500' };
}

export function TrunkHealthWidget({ rows }: { rows: TrunkSummaryRow[] }) {
  const safeRows = rows.slice(0, 5);
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Состояние транков</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">ASR, ACD и нагрузка по CDR</p>
        </div>
        <button className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-400">Смотреть все</button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
        {safeRows.length ? (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Транк</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Нагрузка</th>
                <th className="px-3 py-2">Качество</th>
                <th className="px-3 py-2 text-right">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {safeRows.map(row => {
                const trunkName = row.trunkName || 'Не определен';
                const totalCalls = safeNumber(row.totalCalls);
                const asr = safeNumber(row.asr);
                const load = Math.max(0, Math.min(100, safeNumber(row.loadPercent)));
                const status = statusFor(row.qualityLabel);
                const statusText = row.statusText || status.label;
                return (
                  <tr key={trunkName} className="bg-white transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/40">
                    <td className="max-w-[150px] px-3 py-3">
                      <div className="truncate font-black text-slate-800 dark:text-slate-100">{trunkName}</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-400">{totalCalls.toLocaleString('ru-RU')} звонков</div>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{labelForType(row.trunkType)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: Math.max(totalCalls ? 6 : 0, load) + '%' }} />
                        </div>
                        <span className="w-8 text-right font-mono font-black text-slate-600 dark:text-slate-300">{load}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{asr}%</td>
                    <td className="px-3 py-3 text-right">
                      <span className={['inline-flex rounded-full px-2 py-1 text-[10px] font-black', status.className].join(' ')}>{statusText}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-950/40">
            <div className="text-xs font-black text-slate-500 dark:text-slate-300">Нет данных по транкам</div>
            <div className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">Данные появятся после накопления звонков или подключения AMI/ARI</div>
          </div>
        )}
      </div>
    </div>
  );
}
