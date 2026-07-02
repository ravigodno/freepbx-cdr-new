import { useState } from 'react';
import { DatabaseZap, Loader2, RefreshCw } from 'lucide-react';
import { MarketingAggregateStatus, TrafficSourceSummary } from './types';
import { TrafficSourcesTable } from './MarketingTables';
import RussianDatePicker from '../common/RussianDatePicker';

interface Props {
  startDate: string;
  endDate: string;
  status?: MarketingAggregateStatus | null;
  sources?: TrafficSourceSummary[];
  totalRows?: number;
  onRebuilt?: () => void;
}

function getAuthToken(): string {
  const sessionSaved = localStorage.getItem('asterisk_cdr_session');
  if (!sessionSaved) return '';
  try { return JSON.parse(sessionSaved)?.token || ''; } catch { return ''; }
}

const marketingDatePickerButtonClass = 'mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-left font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 flex items-center gap-2';

function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
}

export function MarketingAggregatesPanel({ startDate, endDate, status, sources = [], totalRows = 0, onRebuilt }: Props) {
  const [dateFrom, setDateFrom] = useState(startDate);
  const [dateTo, setDateTo] = useState(endDate);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState('');

  const rebuild = async () => {
    setRebuilding(true);
    setMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/aggregates/rebuild', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось пересчитать агрегаты.');
      setMessage('Агрегаты пересчитаны: дней ' + (json.days || 0) + ', строк ' + (json.rows || 0) + '.');
      onRebuilt?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось пересчитать агрегаты.');
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <DatabaseZap className="h-3.5 w-3.5" /> marketing_daily_aggregates
            </div>
            <h3 className="mt-3 text-base font-black text-slate-950 dark:text-white">Дневные агрегаты</h3>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Ручной пересчет быстрых отчетов по Метрике, Директу и звонкам. Повторный пересчет периода обновляет строки за даты, не создает дубли.</p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-2">
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">С
              <RussianDatePicker value={dateFrom} onChange={setDateFrom} ariaLabel="Дата начала пересчета агрегатов" buttonClassName={marketingDatePickerButtonClass} accent="blue" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">По
              <RussianDatePicker value={dateTo} onChange={setDateTo} ariaLabel="Дата окончания пересчета агрегатов" buttonClassName={marketingDatePickerButtonClass} accent="blue" />
            </label>
            <button onClick={rebuild} disabled={rebuilding || !dateFrom || !dateTo} className="col-span-2 inline-flex h-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">
              {rebuilding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}Пересчитать агрегаты
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300">Последний пересчет<br /><span className="text-slate-900 dark:text-white">{formatDateTime(status?.lastRebuildAt)}</span></div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300">Период<br /><span className="text-slate-900 dark:text-white">{status?.lastDateFrom || '—'} — {status?.lastDateTo || '—'}</span></div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300">Строк агрегатов<br /><span className="text-slate-900 dark:text-white">{totalRows.toLocaleString('ru-RU')}</span></div>
          <div className={["rounded-xl p-3 text-xs font-bold", status?.lastError ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'].join(' ')}>Статус<br /><span>{status?.lastError || 'Ошибок нет'}</span></div>
        </div>
        {message && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700 dark:bg-slate-950 dark:text-slate-300">{message}</div>}
      </div>

      <TrafficSourcesTable sources={sources} />
    </div>
  );
}
