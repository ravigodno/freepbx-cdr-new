import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';

type Props = { token: string; canManage: boolean };
type UsageRow = {
  id: number; occurredAt: string; ratedAt: string | null; eventType: string; networkEvent: string | null;
  direction: string | null; callerNumber: string | null; calleeNumber: string | null;
  counterparty: string | null; counterpartyMasked: string | null; actualUnits: number | null; billedUnits: number | null;
  billedUnitCode: string | null; actualUnitCode: string | null; amount: number | null; discount: number | null; tax: number | null;
  balanceAfter: number | null; categoryId: string | null; label: string | null; packageCounterUsed: number | null;
  reconciliationStatus: string;
};
type SubscriberNumber = { id: string; label: string; accountId: string | null; accountLabel: string | null };

const money = (value: number | null | undefined) => value == null ? 'Нет данных' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
const time = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
const number = (value: number | null | undefined, suffix = '') => value == null ? 'Нет данных' : `${value.toLocaleString('ru-RU')}${suffix}`;

export default function MtsUsageDetails({ token, canManage }: Props) {
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(today.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
  const [eventType, setEventType] = useState('');
  const [networkEvent, setNetworkEvent] = useState('');
  const [direction, setDirection] = useState('');
  const [detailKind, setDetailKind] = useState<'calls' | 'finance'>('calls');
  const [msisdnHash, setMsisdnHash] = useState('');
  const [accountHash, setAccountHash] = useState('');
  const [subscriberNumbers, setSubscriberNumbers] = useState<SubscriberNumber[]>([]);
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
      const query = new URLSearchParams({ ...range(), page: '1', pageSize: '100', detailKind });
      if (detailKind === 'finance' && eventType) query.set('eventType', eventType);
      if (detailKind === 'finance' && networkEvent) query.set('networkEvent', networkEvent);
      if (detailKind === 'calls' && direction) query.set('direction', direction);
      if (msisdnHash) query.set('msisdnHash', msisdnHash);
      if (accountHash) query.set('accountHash', accountHash);
      const summaryQuery = new URLSearchParams({ ...range(), detailKind });
      if (msisdnHash) summaryQuery.set('msisdnHash', msisdnHash);
      if (accountHash) summaryQuery.set('accountHash', accountHash);
      const [eventsResponse, summaryResponse] = await Promise.all([
        fetch(`/api/balance/sources/mts_business/usage?${query}`, { headers }),
        fetch(`/api/balance/sources/mts_business/usage/summary?${summaryQuery}`, { headers })
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
      if (response.status === 409 && data.safeErrorCode === 'usage_sync_in_progress') {
        throw new Error('Синхронизация уже выполняется. Дождитесь её завершения.');
      }
      if (!response.ok || !data.success) throw new Error(data.safeMessage || data.safeErrorCode || 'Синхронизация не выполнена');
      await load();
    } catch (reason: any) {
      setError(reason.message || 'Синхронизация не выполнена');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void fetch('/api/balance/sources/mts-business/numbers', { headers })
      .then(response => response.json())
      .then(data => { if (data.success) setSubscriberNumbers(data.numbers || []); })
      .catch(() => undefined);
  }, []);
  useEffect(() => { void load(); }, [detailKind]);

  const accounts = [...new Map(subscriberNumbers
    .filter(item => item.accountId && item.accountLabel)
    .map(item => [item.accountId!, { id: item.accountId!, label: item.accountLabel! }])).values()];

  const cards: ReadonlyArray<readonly [string, string | number | null | undefined, string?]> = detailKind === 'calls'
    ? [
        ['Стоимость звонков', summary.callCharges],
        ['Всего звонков', summary.callCount, ' шт.'],
        ['Входящие', summary.incomingCallCount, ' шт.'],
        ['Исходящие', summary.outgoingCallCount, ' шт.'],
        ['Фактическая длительность', summary.actualCallSeconds, ' сек.'],
        ['Тарифицируемые единицы', summary.billedCallUnits, ' ед.'],
        ['Звонки из пакета', summary.packageCallSeconds, ' сек.'],
        ['Платные звонки', summary.paidCallSeconds, ' сек.']
      ] as const
    : [
        ['Списания всего', summary.totalCharges],
        ['Абонентская плата', summary.periodicCharges],
        ['Разовые услуги', summary.oneTimeCharges],
        ['SMS', summary.smsCharges],
        ['Интернет', summary.internetCharges],
        ['Пополнения', summary.incomeAmount],
        ['Прочие списания', summary.outcomeAmount]
      ] as const;

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
        <button className={`rounded-lg px-4 py-2 text-xs font-bold ${detailKind === 'calls' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500'}`}
          onClick={() => setDetailKind('calls')}>Звонки</button>
        <button className={`rounded-lg px-4 py-2 text-xs font-bold ${detailKind === 'finance' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500'}`}
          onClick={() => setDetailKind('finance')}>Списания и платежи</button>
      </div>
      <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-1">
        <label className="shrink-0 text-[10px] text-slate-500">С даты<input className="input mt-1 block w-[132px]" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
        <label className="shrink-0 text-[10px] text-slate-500">По дату<input className="input mt-1 block w-[132px]" type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
        {detailKind === 'finance' && <select className="input w-[125px] shrink-0" value={eventType} onChange={e => setEventType(e.target.value)}>
          <option value="">Все типы</option><option value="network">Сеть</option><option value="periodical">Периодические</option>
          <option value="one_time">Разовые</option><option value="income">Пополнения</option><option value="outcome">Списания</option>
        </select>}
        {detailKind === 'finance' && <select className="input w-[120px] shrink-0" value={networkEvent} onChange={e => setNetworkEvent(e.target.value)}>
          <option value="">Все услуги</option><option value="call">Звонки</option><option value="sms">SMS</option><option value="data">Интернет</option>
        </select>}
        {detailKind === 'calls' && <select className="input w-[125px] shrink-0" value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="">Все направления</option><option value="incoming">Входящие</option><option value="outgoing">Исходящие</option>
        </select>}
        <select className="input w-[145px] shrink-0" value={accountHash} onChange={e => { setAccountHash(e.target.value); setMsisdnHash(''); }}>
          <option value="">Все счета</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
        <select className="input w-[145px] shrink-0" value={msisdnHash} onChange={e => setMsisdnHash(e.target.value)}>
          <option value="">Все номера</option>{subscriberNumbers.filter(item => !accountHash || item.accountId === accountHash)
            .map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <button className="btn shrink-0 px-3" onClick={() => void load()} disabled={loading}><Search className="h-4 w-4" />Показать</button>
        <button className="btn shrink-0 px-3" onClick={() => void sync()} disabled={!canManage || syncing}>
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
        <table className={`w-full text-left text-xs ${detailKind === 'calls' ? 'min-w-[1350px]' : 'min-w-[1200px]'}`}>
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr>
            {(detailKind === 'calls'
              ? ['Дата события','Дата тарификации','Направление','Кто звонил','Куда звонил','Факт','Тарификация','Стоимость','Из пакета','Сверка CDR']
              : ['Дата операции','Дата тарификации','Тип','Услуга','Стоимость','Скидка','Налог','Баланс после','Категория','Описание']
            ).map(label =>
              <th key={label} className="p-3 text-[10px] uppercase text-slate-500">{label}</th>)}
          </tr></thead>
          <tbody>{rows.map(row => {
            const packaged = row.amount === 0 && (row.packageCounterUsed ?? 0) > 0;
            return <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
              <td className="p-3">{time(row.occurredAt)}</td><td className="p-3">{time(row.ratedAt)}</td>
              {detailKind === 'calls' ? <>
                <td className="p-3">{row.direction || 'Нет данных'}</td>
                <td className="p-3 font-mono">{row.callerNumber || 'Нет данных'}</td>
                <td className="p-3 font-mono">{row.calleeNumber || 'Нет данных'}</td>
                <td className="p-3">{number(row.actualUnits, row.actualUnitCode ? ` ${row.actualUnitCode}` : '')}</td>
                <td className="p-3">{number(row.billedUnits, row.billedUnitCode ? ` ${row.billedUnitCode}` : '')}</td>
                <td className="p-3 font-mono">{money(row.amount)}</td>
                <td className="p-3">{packaged ? 'Да' : 'Нет'}</td>
                <td className="p-3">{row.reconciliationStatus}</td>
              </> : <>
                <td className="p-3">{row.eventType}</td><td className="p-3">{row.networkEvent || 'Нет данных'}</td>
                <td className="p-3 font-mono">{money(row.amount)}</td>
                <td className="p-3">{money(row.discount)}</td><td className="p-3">{money(row.tax)}</td>
                <td className="p-3">{money(row.balanceAfter)}</td><td className="p-3">{row.categoryId || 'Нет данных'}</td>
                <td className="max-w-xs p-3">{row.label || 'Нет данных'}</td>
              </>}
            </tr>;
          })}</tbody>
        </table>
        {!loading && rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">За выбранный период событий нет</div>}
      </div>
    </div>
  );
}
