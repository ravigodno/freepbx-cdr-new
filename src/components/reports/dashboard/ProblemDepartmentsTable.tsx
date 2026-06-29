export type DepartmentSummaryRow = {
  department?: string | null;
  managerName?: string | null;
  inboundCalls?: number;
  outboundCalls?: number;
  answeredCalls?: number;
  missedCalls?: number;
  lostCalls?: number;
  callbackAfterMissed?: number;
  callbackRate?: number;
  averageWaitSeconds?: number | null;
  slaPercent?: number | null;
  averageDurationSeconds?: number;
  status?: 'ok' | 'warning' | 'problem' | string;
};

type LegacyRow = { name: string; totalCalls: number; answeredCalls: number; duration: number };

type Row = DepartmentSummaryRow | LegacyRow;

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function statusMeta(status: unknown) {
  if (status === 'problem') return { label: 'Проблема', className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' };
  if (status === 'warning') return { label: 'Внимание', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' };
  return { label: 'OK', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' };
}

function normalizeRow(row: Row): DepartmentSummaryRow {
  if ('department' in row || 'slaPercent' in row || 'lostCalls' in row) return row as DepartmentSummaryRow;
  const legacy = row as LegacyRow;
  const ratio = legacy.totalCalls ? Math.round((legacy.answeredCalls / legacy.totalCalls) * 100) : 0;
  return {
    department: legacy.name,
    inboundCalls: legacy.totalCalls,
    answeredCalls: legacy.answeredCalls,
    missedCalls: Math.max(0, legacy.totalCalls - legacy.answeredCalls),
    lostCalls: 0,
    slaPercent: ratio,
    status: ratio >= 80 ? 'ok' : ratio >= 55 ? 'warning' : 'problem'
  };
}

export function ProblemDepartmentsTable({ rows }: { rows: Row[] }) {
  const safeRows = rows.map(normalizeRow).slice(0, 5);
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Проблемные отделы</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Отделы с потерями, пропусками и нарушениями SLA</p>
        </div>
        <button className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-400">Смотреть все</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
            <tr><th className="px-3 py-2.5">Отдел</th><th className="px-3 py-2.5">Входящие</th><th className="px-3 py-2.5">Отвеченные</th><th className="px-3 py-2.5">Пропущенные</th><th className="px-3 py-2.5">Потерянные</th><th className="px-3 py-2.5">SLA</th><th className="px-3 py-2.5">Статус</th></tr>
          </thead>
          <tbody>
            {safeRows.length ? safeRows.map(row => {
              const status = statusMeta(row.status);
              return (
                <tr key={row.department || 'unknown'} className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-3 font-bold text-slate-800 dark:text-slate-100">{row.department || '—'}</td>
                  <td className="px-3 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">{numberValue(row.inboundCalls).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">{numberValue(row.answeredCalls).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-3 font-mono font-bold text-amber-600">{numberValue(row.missedCalls).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-3 font-mono font-black text-rose-600">{numberValue(row.lostCalls).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-3 font-mono font-black text-violet-600">{row.slaPercent === null || row.slaPercent === undefined ? '—' : numberValue(row.slaPercent) + '%'}</td>
                  <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', status.className].join(' ')}>{status.label}</span></td>
                </tr>
              );
            }) : <tr><td colSpan={7} className="p-6 text-center font-semibold text-slate-400"><div>Нет данных по отделам</div><div className="mt-1 text-[11px] font-medium">Подключите справочник сотрудников для детализации</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
