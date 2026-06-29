type Point = { label: string; missedCalls: number; lostCalls: number; processedCalls: number };

export type LostCallDetail = {
  externalNumber?: string | null;
  normalizedNumber?: string | null;
  missedAt?: string | null;
  did?: string | null;
  direction?: string | null;
  department?: string | null;
  responsibleExtension?: string | null;
  responsibleName?: string | null;
  attempts?: number | null;
  callbackStatus?: 'not_called_back' | 'called_back' | 'repeated_inbound' | string | null;
  lastRelatedCallAt?: string | null;
  recordingAvailable?: boolean;
  uniqueid?: string | null;
  linkedid?: string | null;
};

function formatValue(value: unknown) {
  const text = String(value || '').trim();
  return text || '—';
}

function formatDate(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.replace('T', ' ').slice(0, 16);
}

function statusBadge(status: unknown) {
  if (status === 'called_back') {
    return <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Перезвонили</span>;
  }
  if (status === 'repeated_inbound') {
    return <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Повторный входящий</span>;
  }
  return <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Не перезвонили</span>;
}

export function LostCallsTable({ data, items }: { data: Point[]; items?: LostCallDetail[] }) {
  const detailRows = Array.isArray(items) ? items.slice(0, 8) : [];
  const fallbackRows = data.filter(item => (item.lostCalls || 0) > 0 || (item.missedCalls || 0) > 0).slice(-6).reverse();

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Потерянные звонки / Не перезвонили</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Клиентские пропуски без успешного исходящего callback</p>
        </div>
        <button className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-400">Смотреть все</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          {detailRows.length ? (
            <>
              <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr><th className="px-3 py-2.5">Номер</th><th className="px-3 py-2.5">Пропущен</th><th className="px-3 py-2.5">Ответственный</th><th className="px-3 py-2.5">Статус</th></tr>
              </thead>
              <tbody>
                {detailRows.map((row, index) => (
                  <tr key={row.uniqueid || row.missedAt || row.normalizedNumber || row.externalNumber || index} className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-3">
                      <div className="font-mono font-black text-slate-800 dark:text-slate-100">{formatValue(row.externalNumber || row.normalizedNumber)}</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-400">DID: {formatValue(row.did)}</div>
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">{formatDate(row.missedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-700 dark:text-slate-200">{formatValue(row.responsibleName)}</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-400">EXT: {formatValue(row.responsibleExtension)}</div>
                    </td>
                    <td className="px-3 py-3">{statusBadge(row.callbackStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr><th className="px-3 py-2.5">Период</th><th className="px-3 py-2.5">Пропущено</th><th className="px-3 py-2.5">Потеряно</th><th className="px-3 py-2.5">Статус</th></tr>
              </thead>
              <tbody>
                {fallbackRows.length ? fallbackRows.map(row => (
                  <tr key={row.label} className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-3 font-bold text-slate-800 dark:text-slate-100">{row.label}</td>
                    <td className="px-3 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">{(row.missedCalls || 0).toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-3 font-mono font-black text-rose-600">{(row.lostCalls || 0).toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-3">{statusBadge('not_called_back')}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="p-6 text-center font-semibold text-slate-400">Нет потерянных звонков</td></tr>}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
