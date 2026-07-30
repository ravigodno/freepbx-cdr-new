import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, Clock3, Layers, RefreshCw, ShoppingCart, TrendingDown } from 'lucide-react';

type PackageItem = {
  packageId: string;
  packageName: string;
  totalUnits: number | null;
  usedUnits: number | null;
  remainingUnits: number | null;
  price: number | null;
  tax: number | null;
  activatedAt: string | null;
  periodStartedAt: string | null;
  periodEndsAt: string | null;
  status: 'active' | 'ending' | 'depleted' | 'scheduled' | 'expired' | 'unavailable';
  autoRenew: boolean | null;
  compatibleNumbers: string[];
  compatibleTrunks: string[];
  source: string;
  lastSyncedAt: string | null;
  counterId: string | null;
  counterSource: 'mts_service_counter' | 'unavailable';
  warning: string | null;
};
type UsageRow = { date: string; counterId: string; number: string | null; usedMinutes: number; billedCalls: number; averageActualSeconds: number | null };
type PackageData = {
  lastSyncedAt: string | null;
  billingPeriod: { startedAt: string; endsAt: string } | null;
  billingPeriodReason: string | null;
  summary: { totalUnits: number | null; usedUnits: number | null; remainingUnits: number | null; usedPercent: number | null; daysRemaining: number | null };
  activePackages: PackageItem[];
  usage: UsageRow[];
  forecast: null | { averagePerDay: number; projectedSpend: number | null; projectedRemaining: number | null; expectedDepletionAt: string | null; confidence: 'high' | 'medium' | 'low'; fullDays: number };
  availablePackages: unknown[];
  availablePackagesReason: string;
  packageActions: { canConnect: boolean; reason: string };
  recommendation: null;
  history: PackageItem[];
};

const fmt = (value: number | null, digits = 0) => value === null
  ? 'Нет данных'
  : value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Нет данных';
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
const money = (value: number | null) => value === null ? 'Нет данных' : `${fmt(value, 2)} ₽`;
const statusCopy: Record<PackageItem['status'], string> = {
  active: 'Активен', ending: 'Заканчивается', depleted: 'Исчерпан', scheduled: 'Запланирован',
  expired: 'Истёк', unavailable: 'Данные недоступны'
};
const confidenceCopy = { high: 'Высокая', medium: 'Средняя', low: 'Низкая' } as const;

export default function MtsPackagesPanel({ token, canViewAnalytics }: { token: string; canViewAnalytics: boolean }) {
  const [data, setData] = useState<PackageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'days' | 'weeks' | 'numbers' | 'trunks'>('days');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/balance/sources/mts_business/packages', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.safeMessage || 'Данные пакетов недоступны');
      setData(body.packages);
      setError('');
    } catch (reason: any) {
      setError(reason.message || 'Данные пакетов недоступны');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (canViewAnalytics) void load(); }, [token, canViewAnalytics]);

  const usageRows = useMemo(() => {
    const rows = data?.usage || [];
    const grouped = new Map<string, { label: string; used: number; calls: number; seconds: number; weighted: number }>();
    for (const row of rows) {
      let key = row.date;
      let label = new Date(`${row.date}T00:00:00Z`).toLocaleDateString('ru-RU');
      if (mode === 'weeks') {
        const day = new Date(`${row.date}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
        key = day.toISOString().slice(0, 10);
        label = `с ${day.toLocaleDateString('ru-RU')}`;
      } else if (mode === 'numbers') {
        key = row.number || 'unknown';
        label = row.number || 'Номер не передан';
      } else if (mode === 'trunks') {
        key = 'unsupported';
        label = 'Транк не передан МТС';
      }
      const item = grouped.get(key) || { label, used: 0, calls: 0, seconds: 0, weighted: 0 };
      item.used += row.usedMinutes;
      item.calls += row.billedCalls;
      if (row.averageActualSeconds !== null) {
        item.seconds += row.averageActualSeconds * row.billedCalls;
        item.weighted += row.billedCalls;
      }
      grouped.set(key, item);
    }
    let cumulative = 0;
    return [...grouped.values()].map(item => {
      cumulative += item.used;
      return {
        ...item,
        cumulative: ['days', 'weeks'].includes(mode) ? cumulative : null,
        remaining: ['days', 'weeks'].includes(mode) && data?.billingPeriod && data.summary.totalUnits !== null
          ? Math.max(0, data.summary.totalUnits - cumulative) : null,
        average: item.weighted ? item.seconds / item.weighted : null
      };
    });
  }, [data, mode]);

  if (!canViewAnalytics) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Недостаточно прав для просмотра пакетов.</div>;

  const summary = data?.summary;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-black"><Layers className="h-4 w-4 text-violet-600" />Пакеты минут</h2>
        <div className="mt-1 text-[11px] text-slate-500">
          {data?.billingPeriod
            ? `Расчётный период: ${date(data.billingPeriod.startedAt)} — ${date(data.billingPeriod.endsAt)}`
            : `Расчётный период не определён${data?.billingPeriodReason ? ` · ${data.billingPeriodReason}` : ''}`}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Clock3 className="h-3.5 w-3.5" />Обновлено: {dateTime(data?.lastSyncedAt || null)}
        <button type="button" onClick={() => void load()} disabled={loading}
          className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
    {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <AlertCircle className="h-4 w-4 shrink-0" />Не удалось обновить данные. {data ? `Отображается информация на ${dateTime(data.lastSyncedAt)}` : error}
    </div>}

    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Куплено минут', summary?.totalUnits === null || summary?.totalUnits === undefined ? 'Не определено' : `${fmt(summary.totalUnits)} мин`],
        ['Израсходовано', summary?.usedUnits === null || summary?.usedUnits === undefined ? 'Не определено' : `${fmt(summary.usedUnits, 1)} мин`],
        ['Осталось', summary?.remainingUnits === null || summary?.remainingUnits === undefined ? 'Не определено' : `${fmt(summary.remainingUnits, 1)} мин`],
        ['Использовано', summary?.usedPercent === null || summary?.usedPercent === undefined ? 'Не определено' : `${fmt(summary.usedPercent, 1)}%`],
        ['До окончания периода', summary?.daysRemaining === null || summary?.daysRemaining === undefined ? 'Не определено' : `${summary.daysRemaining} дн.`]
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-[10px] font-bold text-slate-500">{label}</div><div className="mt-1 font-mono text-lg font-black">{value}</div>
        {label === 'Использовано' && summary?.usedPercent !== null && summary?.usedPercent !== undefined &&
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, Math.max(0, summary.usedPercent))}%` }} />
          </div>}
      </div>)}
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-black dark:border-slate-700">Подключённые пакеты</div>
      {!loading && data?.activePackages.length === 0 && <div className="p-6 text-center text-xs text-slate-500">Активные пакеты минут не найдены</div>}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{data?.activePackages.map(item => {
        const percent = item.totalUnits && item.usedUnits !== null ? item.usedUnits / item.totalUnits * 100 : null;
        const low = item.remainingUnits !== null && item.totalUnits !== null && item.remainingUnits / item.totalUnits < .2;
        return <div key={item.packageId} className="grid gap-3 px-4 py-3 lg:grid-cols-[140px_1.5fr_repeat(4,minmax(110px,1fr))]">
          <div>
            <div className="text-[10px] text-slate-400">Номер</div>
            <div className="mt-1 font-mono text-xs font-bold">{item.compatibleNumbers[0] || 'Не определён'}</div>
          </div>
          <div>
            <div className="font-normal">{item.packageName}</div>
            <div className="mt-1 text-[10px] text-slate-500">{item.source}</div>
          </div>
          <div><div className="text-[10px] text-slate-400">Период</div><div className="text-xs font-bold">{date(item.periodStartedAt)} — {date(item.periodEndsAt)}</div></div>
          <div className="text-right"><div className="text-[10px] text-slate-400">Объём / расход</div><div className="font-mono text-xs font-bold">{fmt(item.totalUnits)} / {fmt(item.usedUnits, 1)} мин</div></div>
          <div className="text-right"><div className="text-[10px] text-slate-400">Осталось</div><div className="font-mono text-xs font-bold">{fmt(item.remainingUnits, 1)} мин</div>{percent !== null && <div className="text-[10px] text-slate-400">использовано {fmt(percent, 1)}%</div>}</div>
          <div className="text-right"><div className="text-[10px] text-slate-400">Стоимость / статус</div><div className="font-mono text-xs font-bold">{money(item.price)}</div><div className={`text-[10px] font-bold ${item.status === 'depleted' || low ? 'text-rose-600' : 'text-emerald-600'}`}>{statusCopy[item.status]}</div></div>
          {(low || item.warning) && <div className="text-[11px] text-amber-700 lg:col-span-6">{low ? 'Пакет скоро закончится. ' : ''}{item.warning || ''}</div>}
        </div>;
      })}</div>
    </div>

    <div className="grid gap-3 xl:grid-cols-[1.65fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="text-sm font-black">Использование минут</div>
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {([['days','По дням'],['weeks','По неделям'],['numbers','По номерам'],['trunks','По транкам']] as const).map(([id, label]) =>
              <button key={id} type="button" onClick={() => setMode(id)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold ${mode === id ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}>{label}</button>)}
          </div>
        </div>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[620px] text-left text-[11px]"><thead className="sticky top-0 bg-white dark:bg-slate-900"><tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
            <th className="p-3">{mode === 'days' ? 'Дата' : mode === 'weeks' ? 'Неделя' : mode === 'numbers' ? 'Номер' : 'Транк'}</th>
            <th className="p-3 text-right">Из пакета</th><th className="p-3 text-right">Накопительно</th><th className="p-3 text-right">Остаток на конец</th>
            <th className="p-3 text-right">Тарифицированных звонков</th><th className="p-3 text-right">Средняя фактическая длительность</th>
          </tr></thead><tbody>{usageRows.map((row, index) => <tr key={`${row.label}-${index}`} className="border-b border-slate-50 dark:border-slate-800">
            <td className="p-3 font-medium">{row.label}</td><td className="p-3 text-right font-mono">{fmt(row.used, 1)} мин</td>
            <td className="p-3 text-right font-mono">{row.cumulative === null ? '—' : `${fmt(row.cumulative, 1)} мин`}</td>
            <td className="p-3 text-right font-mono">{row.remaining === null ? '—' : `${fmt(row.remaining, 1)} мин`}</td>
            <td className="p-3 text-right">{row.calls}</td><td className="p-3 text-right">{row.average === null ? 'Нет данных' : `${fmt(row.average, 0)} сек`}</td>
          </tr>)}</tbody></table>
          {!usageRows.length && <div className="p-6 text-center text-xs text-slate-500">Подтверждённое использование пакетных счётчиков не найдено</div>}
        </div>
        <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500 dark:border-slate-800">
          Минуты рассчитаны по точной разнице счётчика МТС до и после каждого тарифицированного звонка. Длительность разговора с минутами пакета не смешивается.
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-black"><TrendingDown className="h-4 w-4 text-blue-600" />Прогноз до конца периода</div>
          {data?.forecast ? <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-400">Средний расход</span><div className="font-bold">{fmt(data.forecast.averagePerDay, 1)} мин/день</div></div>
            <div><span className="text-slate-400">Прогноз расхода</span><div className="font-bold">{fmt(data.forecast.projectedSpend, 1)} мин</div></div>
            <div><span className="text-slate-400">Прогноз остатка</span><div className="font-bold">{fmt(data.forecast.projectedRemaining, 1)} мин</div></div>
            <div><span className="text-slate-400">Уверенность</span><div className="font-bold">{confidenceCopy[data.forecast.confidence]} · {data.forecast.fullDays} дн.</div></div>
            {data.forecast.expectedDepletionAt && <div className="col-span-2">Возможное исчерпание: <b>{date(data.forecast.expectedDepletionAt)}</b></div>}
          </div> : <div className="mt-3 text-xs text-slate-500">Прогноз недоступен: требуется единый период, подтверждённый остаток и не менее трёх полных дней данных.</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-black"><ShoppingCart className="h-4 w-4 text-violet-600" />Доступные для подключения пакеты</div>
          <div className="mt-3 text-xs text-slate-500">{data?.availablePackagesReason || 'Каталог не получен'}</div>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{data?.packageActions.reason}</div>
        </div>
      </div>
    </div>

    <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black"><CalendarDays className="mr-2 inline h-4 w-4 text-slate-500" />История пакетов ({data?.history.length || 0})</summary>
      <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-[760px] text-left text-[11px]"><thead><tr className="text-slate-400">
          <th className="p-3">Пакет</th><th className="p-3">Период</th><th className="p-3 text-right">Объём</th><th className="p-3 text-right">Расход</th><th className="p-3 text-right">Остаток</th><th className="p-3 text-right">Стоимость</th><th className="p-3">Статус</th>
        </tr></thead><tbody>{data?.history.map(item => <tr key={item.packageId} className="border-t border-slate-50 dark:border-slate-800">
          <td className="p-3 font-bold">{item.packageName}</td><td className="p-3">{date(item.periodStartedAt)} — {date(item.periodEndsAt)}</td>
          <td className="p-3 text-right">{fmt(item.totalUnits)} мин</td><td className="p-3 text-right">{fmt(item.usedUnits, 1)} мин</td>
          <td className="p-3 text-right">{fmt(item.remainingUnits, 1)} мин</td><td className="p-3 text-right">{money(item.price)}</td><td className="p-3">{statusCopy[item.status]}</td>
        </tr>)}</tbody></table>
        {!data?.history.length && <div className="p-5 text-center text-xs text-slate-500">История за сохранённый период пока отсутствует</div>}
      </div>
    </details>
  </section>;
}
