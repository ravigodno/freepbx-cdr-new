import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';

type Props = { token: string; canManage: boolean };
type UsageRow = {
  id: number; occurredAt: string; ratedAt: string | null; eventType: string; networkEvent: string | null;
  direction: string | null; counterpartyMasked: string | null; actualUnits: number | null; billedUnits: number | null;
  billedUnitCode: string | null; actualUnitCode: string | null; amount: number | null; discount: number | null; tax: number | null;
  balanceAfter: number | null; categoryId: string | null; label: string | null; packageCounterUsed: number | null;
  reconciliationStatus: string;
};

const money = (value: number | null) => value === null ? 'Нет данных' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
const time = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
const number = (value: number | null, suffix = '') => value === null ? 'Нет данных' : `${value.toLocaleString('ru-RU')}${suffix}`;

export default function MtsUsageDetails({ token, canManage }: Props) {
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(today.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
  const [eventType, setEventType] = useState('');
  const [networkEvent, setNetworkEvent] = useState('');
  const [direction, setDirection] = useState('');
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number | string | null>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const range = () => ({
    from: `${fromDate}T00:00:00Z`,
    to: `${toDate}T23:59:59Z`
  });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ ...range(), page: '1', pageSize: '100' });
      if (eventType) query.set('eventType', eventType);
      if (networkEvent) query.set('networkEvent', networkEvent);
      if (direction) query.set('direction', direction);
      const [eventsResponse, summaryResponse] = await Promise.all([
        fetch(`/api/balance/sources/mts_business/usage?${query}`, { headers }),
        fetch(`/api/balance/sources/mts_business/usage/summary?${new URLSearchParams(range())}`, { headers })
      ]);
      const events = await eventsResponse.json().catch(() => ({}));
      const totals = await summaryResponse.json().catch(() => ({}));
      if (!eventsResponse.ok || !events.success) throw new Error(events.safeErrorCode || 'Не удалось загрузить детализацию');
      if (!summaryResponse.ok || !totals.success) throw new Error(totals.safeErrorCode || 'Не удалось загрузить итоги');
      setRows(events.rows || []);
      setSummary(totals.summary || {});
    } catch (reason: any) {
      setError(reason.message || 'Детализация недоступна');
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setError('');
    try {
      const response = await fetch('/api/balance/sources/mts_business/usage/sync', {
        method: 'POST', headers, body: JSON.stringify(range())
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeMessage || data.safeErrorCode || 'Синхронизация не выполнена');
      await load();
    } catch (reason: any) {
      setError(reason.message || 'Синхронизация не выполнена');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const cards = [
    ['Расходы всего', summary.totalCharges],
    ['Звонки', summary.callCharges],
    ['Абонентская плата', summary.periodicCharges],
    ['Разовые услуги', summary.oneTimeCharges],
    ['Пополнения', summary.incomeAmount],
    ['Прочие списания', summary.outcomeAmount],
    ['Звонки из пакета', summary.packageCallSeconds, ' сек.'],
    ['Платные звонки', summary.paidCallSeconds, ' сек.']
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">С даты<input className="input mt-1 block" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
        <label className="text-xs text-slate-500">По дату<input className="input mt-1 block" type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
        <select className="input" value={eventType} onChange={e => setEventType(e.target.value)}>
          <option value="">Все типы</option><option value="network">Сеть</option><option value="periodical">Периодические</option>
          <option value="one_time">Разовые</option><option value="income">Пополнения</option><option value="outcome">Списания</option>
        </select>
        <select className="input" value={networkEvent} onChange={e => setNetworkEvent(e.target.value)}>
          <option value="">Все услуги</option><option value="call">Звонки</option><option value="sms">SMS</option><option value="data">Интернет</option>
        </select>
        <select className="input" value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="">Все направления</option><option value="incoming">Входящие</option><option value="outgoing">Исходящие</option>
        </select>
        <button className="btn" onClick={() => void load()} disabled={loading}><Search className="h-4 w-4" />Показать</button>
        <button className="btn" onClick={() => void sync()} disabled={!canManage || syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />Обновить детализацию
        </button>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, suffix]) => (
          <div key={label} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
            <div className="mt-2 font-mono text-lg font-black">{suffix ? number(value as number | null, suffix) : money(value as number | null)}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[1500px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr>
            {['Дата события','Дата тарификации','Тип','Направление','Номер','Факт','Тарификация','Стоимость','Скидка','Налог','Баланс после','Категория','Описание','Сверка CDR'].map(label =>
              <th key={label} className="p-3 text-[10px] uppercase text-slate-500">{label}</th>)}
          </tr></thead>
          <tbody>{rows.map(row => {
            const packaged = row.amount === 0 && (row.packageCounterUsed ?? 0) > 0;
            return <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
              <td className="p-3">{time(row.occurredAt)}</td><td className="p-3">{time(row.ratedAt)}</td>
              <td className="p-3">{row.networkEvent || row.eventType}</td><td className="p-3">{row.direction || 'Нет данных'}</td>
              <td className="p-3 font-mono">{row.counterpartyMasked || 'Нет данных'}</td>
              <td className="p-3">{number(row.actualUnits, row.actualUnitCode ? ` ${row.actualUnitCode}` : '')}</td>
              <td className="p-3">{number(row.billedUnits, row.billedUnitCode ? ` ${row.billedUnitCode}` : '')}</td>
              <td className="p-3 font-mono">{money(row.amount)}{packaged && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">Из пакета</span>}</td>
              <td className="p-3">{money(row.discount)}</td><td className="p-3">{money(row.tax)}</td>
              <td className="p-3">{money(row.balanceAfter)}</td><td className="p-3">{row.categoryId || 'Нет данных'}</td>
              <td className="max-w-xs p-3">{row.label || 'Нет данных'}</td><td className="p-3">{row.reconciliationStatus}</td>
            </tr>;
          })}</tbody>
        </table>
        {!loading && rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">За выбранный период событий нет</div>}
      </div>
    </div>
  );
}
