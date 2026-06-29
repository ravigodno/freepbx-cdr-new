import { ReactNode } from 'react';
import { MarketingEmptyState } from './MarketingEmptyState';
import { PhoneClickEvent, TrafficSourceSummary } from './types';

interface EmptyTableProps {
  title: string;
  description: string;
  columns: string[];
  emptyTitle: string;
  emptyDescription: string;
  children?: ReactNode;
  hasRows?: boolean;
}

function safeText(value: unknown): string {
  const text = String(value || '').trim();
  return text || '—';
}

function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
}

function EmptyTableCard({ title, description, columns, emptyTitle, emptyDescription, children, hasRows = false }: EmptyTableProps) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <button className="w-fit rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Экспорт</button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
            <tr>{columns.map(column => <th key={column} className="px-3 py-3">{column}</th>)}</tr>
          </thead>
          {hasRows && <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>}
        </table>
      </div>
      {!hasRows && <div className="mt-4"><MarketingEmptyState title={emptyTitle} description={emptyDescription} /></div>}
    </div>
  );
}

export function PhoneClicksTable({ events = [] }: { events?: PhoneClickEvent[] }) {
  return (
    <EmptyTableCard
      title="Клики по телефонам"
      description="События кликов по телефонным номерам на сайте"
      columns={['Дата/время', 'Сайт', 'Страница', 'Номер на сайте', 'ymClientId', 'utm_source', 'utm_medium', 'utm_campaign', 'Статус связи со звонком']}
      emptyTitle="Событий пока нет"
      emptyDescription="Создайте сайт и установите JS-скрипт PBXPuls на сайт."
      hasRows={events.length > 0}
    >
      {events.map(event => (
        <tr key={event.id || event.eventTime + event.phoneText} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{formatDateTime(event.eventTime)}</td>
          <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">{safeText(event.siteName || event.siteNameFallback)}</td>
          <td className="max-w-[220px] truncate px-3 py-3 text-slate-500" title={event.pageUrl}>{safeText(event.pageUrl)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-800 dark:text-slate-100">{safeText(event.phoneText)}</td>
          <td className="px-3 py-3 font-mono text-slate-500">{safeText(event.ymClientId)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmSource)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmMedium)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmCampaign)}</td>
          <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Не сопоставлено</span></td>
        </tr>
      ))}
    </EmptyTableCard>
  );
}

export function TrafficSourcesTable({ sources = [] }: { sources?: TrafficSourceSummary[] }) {
  return (
    <EmptyTableCard
      title="Источники звонков"
      description="Атрибуция звонков по рекламным и органическим источникам"
      columns={['Источник', 'Medium', 'Кампания', 'Визиты', 'Клики по телефону', 'Формы', 'Звонки', 'Конверсия']}
      emptyTitle="Нет данных по источникам"
      emptyDescription="Данные появятся после подключения коллтрекинга и рекламных интеграций."
      hasRows={sources.length > 0}
    >
      {sources.map(source => (
        <tr key={[source.source, source.medium, source.campaign].join('|')} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-black text-slate-800 dark:text-slate-100">{safeText(source.source)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(source.medium)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(source.campaign)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{Number(source.visits || 0).toLocaleString('ru-RU')}</td>
          <td className="px-3 py-3 font-mono font-black text-purple-700 dark:text-purple-300">{Number(source.phoneClicks || 0).toLocaleString('ru-RU')}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{Number(source.formSubmits || 0).toLocaleString('ru-RU')}</td>
          <td className="px-3 py-3 text-slate-400">—</td>
          <td className="px-3 py-3 text-slate-400">—</td>
        </tr>
      ))}
    </EmptyTableCard>
  );
}

export function CampaignsReportTable() {
  return (
    <EmptyTableCard
      title="Кампании"
      description="Будущая связка рекламных кампаний, звонков и потерь бюджета"
      columns={['Кампания', 'Показы', 'Клики', 'Расход', 'Клики по телефону', 'Звонки', 'Отвечено', 'Потеряно', 'Цена звонка', 'Потерянный бюджет']}
      emptyTitle="Данных по кампаниям пока нет"
      emptyDescription="Подключите рекламные интеграции, чтобы видеть эффективность кампаний."
    />
  );
}

export function LostLeadsTable() {
  return (
    <EmptyTableCard
      title="Потерянные лиды"
      description="Будущая оценка пропущенных обращений и потерянного рекламного бюджета"
      columns={['Источник', 'Кампания', 'Страница', 'Время клика', 'Время звонка', 'Номер', 'Статус', 'Ответственный', 'Потерянный бюджет']}
      emptyTitle="Потерянных лидов по коллтрекингу пока нет"
      emptyDescription="После matching phone_click -> CDR здесь появятся обращения без успешной обработки."
    />
  );
}
