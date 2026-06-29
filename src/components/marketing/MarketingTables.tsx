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

function safeNumber(value: unknown): string {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString('ru-RU') : '0';
}

function safePercent(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('ru-RU') + '%' : '—';
}

function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
}

function formatSeconds(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return Math.round(seconds) + ' сек';
  return Math.floor(seconds / 60) + ' мин ' + Math.round(seconds % 60) + ' сек';
}

function matchLabel(event: PhoneClickEvent): string {
  if (event.matchStatus === 'ambiguous') return 'Неоднозначно';
  if (event.matchConfidence === 'high') return 'Точно';
  if (event.matchConfidence === 'medium') return 'Вероятно';
  if (event.matchConfidence === 'low') return 'Слабо';
  return 'Не сопоставлено';
}

function matchClass(event: PhoneClickEvent): string {
  if (event.matchStatus === 'ambiguous') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  if (event.matchConfidence === 'high') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (event.matchConfidence === 'medium') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  if (event.matchConfidence === 'low') return 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function leadStatusLabel(event: PhoneClickEvent): string {
  if (event.leadStatus === 'answered') return 'Отвечен';
  if (event.leadStatus === 'recovered_by_callback') return 'Спасен перезвоном';
  if (event.leadStatus === 'lost') return 'Потерян';
  if (event.leadStatus === 'ambiguous') return 'Неоднозначно';
  return 'Не сопоставлен';
}

function leadStatusClass(event: PhoneClickEvent): string {
  if (event.leadStatus === 'answered') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (event.leadStatus === 'recovered_by_callback') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  if (event.leadStatus === 'lost') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  if (event.leadStatus === 'ambiguous') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function callbackStatusLabel(value: unknown): string {
  if (value === 'not_required') return 'Не нужен';
  if (value === 'called_back') return 'Перезвонили';
  if (value === 'not_called_back') return 'Не перезвонили';
  if (value === 'unknown') return 'Неизвестно';
  return '—';
}

function callbackStatusClass(value: unknown): string {
  if (value === 'not_required') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  if (value === 'called_back') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (value === 'not_called_back') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
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
        <table className="w-full min-w-[1180px] text-left text-xs">
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
      description="Сопоставление кликов по телефонным номерам с CDR-звонками и перезвонами"
      columns={['Дата/время клика', 'Сайт', 'Страница', 'Номер на сайте', 'ymClientId', 'utm_source', 'utm_medium', 'utm_campaign', 'Связь со звонком', 'Статус лида', 'Перезвон', 'Звонок', 'Диспозиция', 'Время до звонка', 'Время до перезвона']}
      emptyTitle="Событий пока нет"
      emptyDescription="Создайте сайт и установите JS-скрипт PBXPuls на сайт."
      hasRows={events.length > 0}
    >
      {events.map(event => (
        <tr key={event.eventId || event.id || event.eventTime + event.phoneText} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{formatDateTime(event.eventTime)}</td>
          <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">{safeText(event.siteName || event.siteNameFallback)}</td>
          <td className="max-w-[220px] truncate px-3 py-3 text-slate-500" title={event.pageUrl}>{safeText(event.pageUrl)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-800 dark:text-slate-100">{safeText(event.phoneText || event.phoneHref)}</td>
          <td className="px-3 py-3 font-mono text-slate-500">{safeText(event.ymClientId)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmSource)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmMedium)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmCampaign)}</td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', matchClass(event)].join(' ')}>{matchLabel(event)}</span></td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', leadStatusClass(event)].join(' ')}>{leadStatusLabel(event)}</span></td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', callbackStatusClass(event.callbackStatus)].join(' ')}>{callbackStatusLabel(event.callbackStatus)}</span></td>
          <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300">{safeText(event.matchedCallUniqueid)}</td>
          <td className="px-3 py-3 font-black text-slate-600 dark:text-slate-300">{safeText(event.matchedDisposition)}</td>
          <td className="px-3 py-3 text-slate-500">{formatSeconds(event.secondsToCall)}</td>
          <td className="px-3 py-3 text-slate-500">{formatSeconds(event.callbackSecondsAfterMissed)}</td>
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
      columns={['Источник', 'Medium', 'Кампания', 'Визиты', 'Клики', 'Формы', 'Звонки', 'Отвечено', 'Пропущено', 'Спасено', 'Потеряно', 'Конверсия', '% спасенных']}
      emptyTitle="Нет данных по источникам"
      emptyDescription="Данные появятся после подключения коллтрекинга и рекламных интеграций."
      hasRows={sources.length > 0}
    >
      {sources.map(source => (
        <tr key={[source.source, source.medium, source.campaign].join('|')} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-black text-slate-800 dark:text-slate-100">{safeText(source.source)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(source.medium)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(source.campaign)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeNumber(source.visits)}</td>
          <td className="px-3 py-3 font-mono font-black text-purple-700 dark:text-purple-300">{safeNumber(source.phoneClicks)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeNumber(source.formSubmits)}</td>
          <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">{safeNumber(source.calls)}</td>
          <td className="px-3 py-3 font-mono font-black text-emerald-700 dark:text-emerald-300">{safeNumber(source.answeredCalls)}</td>
          <td className="px-3 py-3 font-mono font-black text-amber-700 dark:text-amber-300">{safeNumber(source.missedCalls)}</td>
          <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">{safeNumber(source.recoveredByCallback)}</td>
          <td className="px-3 py-3 font-mono font-black text-rose-700 dark:text-rose-300">{safeNumber(source.trueLostLeads ?? source.lostCalls)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safePercent(source.clickToCallConversion)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safePercent(source.callbackRecoveryRate)}</td>
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

export function LostLeadsTable({ events = [] }: { events?: PhoneClickEvent[] }) {
  return (
    <EmptyTableCard
      title="Потерянные лиды"
      description="Сопоставленные звонки с сайта без успешного ответа и без успешного перезвона"
      columns={['Источник', 'Кампания', 'Страница', 'Время клика', 'Время звонка', 'Номер', 'Статус', 'Перезвон', 'Ответственный', 'Потерянный бюджет']}
      emptyTitle="Потерянных лидов по коллтрекингу пока нет"
      emptyDescription="Здесь появятся сопоставленные обращения без ответа, по которым не было успешного перезвона."
      hasRows={events.length > 0}
    >
      {events.map(event => (
        <tr key={event.eventId || event.id || event.eventTime + event.phoneText} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-black text-slate-800 dark:text-slate-100">{safeText(event.utmSource || event.referrer)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmCampaign)}</td>
          <td className="max-w-[220px] truncate px-3 py-3 text-slate-500" title={event.pageUrl}>{safeText(event.pageUrl)}</td>
          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(event.eventTime)}</td>
          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(event.matchedCallDate)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-800 dark:text-slate-100">{safeText(event.matchedExternalNumber || event.phoneText)}</td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', leadStatusClass(event)].join(' ')}>{leadStatusLabel(event)}</span></td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', callbackStatusClass(event.callbackStatus)].join(' ')}>{callbackStatusLabel(event.callbackStatus)}</span></td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.responsibleExtension)}</td>
          <td className="px-3 py-3 text-slate-400">—</td>
        </tr>
      ))}
    </EmptyTableCard>
  );
}
