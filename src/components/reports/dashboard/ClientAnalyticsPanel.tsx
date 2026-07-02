import { Download, PhoneCall, UserRoundCheck, UsersRound } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export type ClientAnalyticsRow = {
  client?: string | null;
  company?: string | null;
  phone?: string | null;
  responsible?: string | null;
  department?: string | null;
  lastCallAt?: string | null;
  daysWithoutContact?: number | null;
  lastContactType?: 'incoming' | 'outgoing' | string | null;
  totalCalls?: number;
  incomingCalls?: number;
  outgoingCalls?: number;
  interestIndex?: number;
  status?: string | null;
};

export type MissedWithoutCallbackRow = {
  client?: string | null;
  company?: string | null;
  phone?: string | null;
  missedAt?: string | null;
  daysSinceMissed?: number | null;
  did?: string | null;
  responsible?: string | null;
  department?: string | null;
  status?: string | null;
};

type ClientAnalytics = {
  initiative?: { incoming: number; outgoing: number; total: number; incomingPercent: number; outgoingPercent: number; interestIndex: number };
  summary?: { totalClientCalls: number; uniqueClients: number; newClients: number; repeatClients: number; lostClients: number; riskClients: number; averageInterestIndex: number };
  topClients?: ClientAnalyticsRow[];
  lostClients?: ClientAnalyticsRow[];
  lowInterestClients?: ClientAnalyticsRow[];
  missedWithoutCallback?: MissedWithoutCallbackRow[];
};

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  const s = String(value || '').trim();
  return s || '—';
}

function dateText(value: unknown) {
  const s = String(value || '').trim();
  return s ? s.replace('T', ' ').slice(0, 16) : '—';
}

function statusClass(status: unknown) {
  if (status === 'Критический' || status === 'Критично') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  if (status === 'Потерянный') return 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300';
  if (status === 'Требуется контакт') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = ['Клиент', 'Компания', 'Телефон', 'Ответственный', 'Отдел', 'Последний звонок', 'Дней без контакта', 'Последний тип контакта', 'Всего звонков ранее', 'Входящих ранее', 'Исходящих ранее', 'Индекс заинтересованности', 'Статус'];
  const keys = ['client', 'company', 'phone', 'responsible', 'department', 'lastCallAt', 'daysWithoutContact', 'lastContactType', 'totalCalls', 'incomingCalls', 'outgoingCalls', 'interestIndex', 'status'];
  const escape = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const lines = [headers.join(';'), ...rows.map(row => keys.map(key => escape(row[key])).join(';'))];
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ClientTable({ title, description, rows, empty }: { title: string; description: string; rows: ClientAnalyticsRow[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p></div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400"><tr><th className="px-3 py-2.5">Клиент</th><th className="px-3 py-2.5">Телефон</th><th className="px-3 py-2.5">Последний контакт</th><th className="px-3 py-2.5">Звонки</th><th className="px-3 py-2.5">Индекс</th><th className="px-3 py-2.5">Ответственный</th><th className="px-3 py-2.5">Статус</th><th className="px-3 py-2.5">Действие</th></tr></thead>
          <tbody>{rows.length ? rows.map((row, index) => <tr key={(row.phone || '') + index} className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50"><td className="px-3 py-3"><div className="font-black text-slate-800 dark:text-slate-100">{text(row.client)}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-400">{text(row.company)}</div></td><td className="px-3 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">{text(row.phone)}</td><td className="px-3 py-3"><div className="font-mono font-bold text-slate-600 dark:text-slate-300">{dateText(row.lastCallAt)}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-400">{row.daysWithoutContact ?? '—'} дн.</div></td><td className="px-3 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">{n(row.totalCalls)} / {n(row.incomingCalls)} / {n(row.outgoingCalls)}</td><td className="px-3 py-3 font-mono font-black text-violet-600">{n(row.interestIndex)}%</td><td className="px-3 py-3"><div className="font-bold text-slate-700 dark:text-slate-200">{text(row.responsible)}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-400">{text(row.department)}</div></td><td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', statusClass(row.status)].join(' ')}>{text(row.status)}</span></td><td className="px-3 py-3"><a href={row.phone ? 'tel:' + row.phone : undefined} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><PhoneCall className="h-3 w-3" />Позвонить</a></td></tr>) : <tr><td colSpan={8} className="p-6 text-center font-semibold text-slate-400">{empty}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function MissedTable({ rows }: { rows: MissedWithoutCallbackRow[] }) {
  return (
    <div className="rounded-2xl border border-rose-200/70 bg-white p-5 shadow-sm dark:border-rose-900/40 dark:bg-slate-900">
      <div><h3 className="text-base font-black text-rose-700 dark:text-rose-300">Потеря после пропуска</h3><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Последний значимый контакт был пропущенным входящим без успешного перезвона</p></div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-rose-50 text-[11px] font-black uppercase text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><tr><th className="px-3 py-2.5">Клиент</th><th className="px-3 py-2.5">Телефон</th><th className="px-3 py-2.5">Дата пропущенного</th><th className="px-3 py-2.5">DID</th><th className="px-3 py-2.5">Ответственный</th><th className="px-3 py-2.5">Действие</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={(row.phone || '') + index} className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50"><td className="px-3 py-3"><div className="font-black text-slate-800 dark:text-slate-100">{text(row.client)}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-400">{text(row.company)}</div></td><td className="px-3 py-3 font-mono font-bold">{text(row.phone)}</td><td className="px-3 py-3"><div className="font-mono font-bold">{dateText(row.missedAt)}</div><div className="text-[10px] font-semibold text-slate-400">{row.daysSinceMissed ?? '—'} дн.</div></td><td className="px-3 py-3 font-mono font-bold">{text(row.did)}</td><td className="px-3 py-3"><div className="font-bold">{text(row.responsible)}</div><div className="text-[10px] font-semibold text-slate-400">{text(row.department)}</div></td><td className="px-3 py-3"><a href={row.phone ? 'tel:' + row.phone : undefined} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white"><PhoneCall className="h-3 w-3" />Позвонить</a></td></tr>) : <tr><td colSpan={6} className="p-6 text-center font-semibold text-slate-400">Нет клиентов после пропущенного без перезвона</td></tr>}</tbody></table></div>
    </div>
  );
}

export function ClientAnalyticsPanel({ analytics, periodLabel }: { analytics?: ClientAnalytics | null; periodLabel: string }) {
  const initiative = analytics?.initiative || { incoming: 0, outgoing: 0, total: 0, incomingPercent: 0, outgoingPercent: 0, interestIndex: 0 };
  const summary = analytics?.summary || { totalClientCalls: 0, uniqueClients: 0, newClients: 0, repeatClients: 0, lostClients: 0, riskClients: 0, averageInterestIndex: 0 };
  const donutData = [{ name: 'Входящие от клиентов', value: initiative.incoming }, { name: 'Исходящие клиентам', value: initiative.outgoing }];
  const lostClients = analytics?.lostClients || [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-2">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-black text-slate-950 dark:text-white">Инициатива контакта</h3><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Входящие и исходящие клиентские звонки за период: {periodLabel}</p></div><UserRoundCheck className="h-5 w-5 text-blue-600" /></div>
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(180px,240px)_1fr] md:items-center">
            <div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={donutData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>{donutData.map((_, index) => <Cell key={index} fill={index === 0 ? '#2563eb' : '#10b981'} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            <div className="space-y-2 text-xs font-bold"><div className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Входящие от клиентов: {initiative.incoming} ({initiative.incomingPercent}%)</div><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Исходящие клиентам: {initiative.outgoing} ({initiative.outgoingPercent}%)</div>{!initiative.total && <div className="rounded-xl border border-dashed border-slate-200 p-3 text-slate-400 dark:border-slate-800">Нет данных по инициативе контакта за выбранный период</div>}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-violet-200/70 bg-white p-5 shadow-sm dark:border-violet-900/40 dark:bg-slate-900">
          <div className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-300">Индекс заинтересованности</div>
          <div className="mt-4 text-4xl font-black text-slate-950 dark:text-white">{initiative.total ? initiative.interestIndex + '%' : '—'}</div>
          <div className="mt-3 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Доля входящих клиентских обращений в общей клиентской активности.</div>
          {!initiative.total && <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-xs font-semibold text-slate-400 dark:border-slate-800">Нет данных для расчета индекса заинтересованности</div>}
        </div>
        <div className="rounded-2xl border border-orange-200/70 bg-white p-5 shadow-sm dark:border-orange-900/40 dark:bg-slate-900">
          <div className="text-[10px] font-black uppercase text-orange-600 dark:text-orange-300">Потерянные клиенты</div>
          <div className="mt-4 text-4xl font-black text-slate-950 dark:text-white">{summary.lostClients}</div>
          <div className="mt-3 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Клиенты без контакта 30+ дней и без активности в выбранном периоде.</div>
          {!lostClients.length && <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-xs font-semibold text-slate-400 dark:border-slate-800">Потерянных клиентов не найдено</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {[["Всего клиентских звонков", summary.totalClientCalls], ["Уникальных клиентов", summary.uniqueClients], ["Новых клиентов", summary.newClients], ["Повторных клиентов", summary.repeatClients], ["Потерянных клиентов", summary.lostClients], ["Клиентов в зоне риска", summary.riskClients], ["Средний индекс", summary.averageInterestIndex + '%']].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><div className="mt-2 text-xl font-black text-slate-950 dark:text-white">{String(value)}</div></div>)}
      </div>

      <ClientTable title="Потерянные клиенты" description="Клиенты из справочника, по которым не было контакта 30+ дней" rows={lostClients} empty="Потерянных клиентов не найдено" />
      <div className="flex justify-end"><button onClick={() => downloadCsv('pbxpuls_lost_clients.csv', lostClients as Array<Record<string, unknown>>)} disabled={!lostClients.length} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><Download className="h-4 w-4" />Экспорт потерянных клиентов CSV</button></div>
      <div className="grid gap-4 xl:grid-cols-2"><ClientTable title="Низкая заинтересованность" description="Много исходящих и мало входящих от клиента" rows={analytics?.lowInterestClients || []} empty="Нет данных для расчета индекса заинтересованности" /><MissedTable rows={analytics?.missedWithoutCallback || []} /></div>
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-blue-600" /><h3 className="text-base font-black text-slate-950 dark:text-white">Топ клиентов по звонкам</h3></div><div className="mt-4"><ClientTable title="Активность клиентов" description="Входящие, исходящие и индекс заинтересованности" rows={analytics?.topClients || []} empty="Нет данных за выбранный период" /></div></div>    </div>
  );
}
