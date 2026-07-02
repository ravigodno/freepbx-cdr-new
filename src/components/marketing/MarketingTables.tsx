import { ReactNode } from 'react';
import { MarketingEmptyState } from './MarketingEmptyState';
import { PhoneClickEvent, TrafficSourceSummary, YandexMetrikaPageSummary, YandexMetrikaPhoneGoalEventRow, YandexMetrikaPhoneGoalSummaryResponse } from './types';

interface EmptyTableProps {
  title: string;
  description: string;
  columns: string[];
  emptyTitle: string;
  emptyDescription: string;
  children?: ReactNode;
  hasRows?: boolean;
}

function formatMarketingCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    const text = value.map(item => formatMarketingCellValue(item)).filter(item => item !== '—').join(', ');
    return text || '—';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidate = record.name ?? record.value ?? record.id ?? record.title ?? record.label;
    if (candidate !== undefined && candidate !== null) return formatMarketingCellValue(candidate);
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json.slice(0, 180) : '—';
    } catch {
      return '—';
    }
  }
  const text = String(value).trim();
  return text || '—';
}

function safeText(value: unknown): string {
  return formatMarketingCellValue(value);
}

function safeNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('ru-RU') : '—';
}

function safeMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽' : '—';
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
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

function matchConfidenceScore(event: PhoneClickEvent): number {
  const score = Number(event.matchConfidenceScore);
  if (Number.isFinite(score)) return score;
  if (event.matchConfidence === 'high') return 100;
  if (event.matchConfidence === 'medium') return 80;
  if (event.matchConfidence === 'low') return 50;
  return 0;
}

function matchLabel(event: PhoneClickEvent): string {
  if (event.matchStatus === 'ambiguous') return 'Неоднозначно';
  const score = matchConfidenceScore(event);
  if (score >= 100) return 'Точно';
  if (score >= 80) return 'DID + время';
  if (score > 0) return 'По времени';
  return 'Не сопоставлено';
}

function matchClass(event: PhoneClickEvent): string {
  const score = matchConfidenceScore(event);
  if (event.matchStatus === 'ambiguous') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  if (score >= 100) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (score >= 80) return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  if (score > 0) return 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function callStatusLabel(value: unknown): string {
  if (value === 'answered') return 'Отвечен';
  if (value === 'missed') return 'Пропущен';
  if (value === 'lost') return 'Потерян';
  return 'Неизвестно';
}

function callStatusClass(value: unknown): string {
  if (value === 'answered') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (value === 'missed') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  if (value === 'lost') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function matchReasonLabel(value: unknown): string {
  if (value === 'did_time_single_candidate') return 'DID + время, один кандидат';
  if (value === 'did_time_match') return 'DID + время';
  if (value === 'nearest_inbound_time') return 'Ближайший по времени';
  if (value === 'multiple_candidates') return 'Несколько кандидатов';
  if (value === 'invalid_event_time') return 'Некорректное время';
  if (value === 'no_candidate') return 'Не найдено';
  return safeText(value);
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

interface PhoneClicksTableProps {
  events?: PhoneClickEvent[] | null;
  metrikaGoalSummary?: YandexMetrikaPhoneGoalSummaryResponse | null;
  metrikaGoalRows?: YandexMetrikaPhoneGoalEventRow[] | null;
  metrikaGoalError?: string | null;
}

type UnifiedPhoneClickRow =
  | { kind: 'pbxpuls'; sortTime: number; event: PhoneClickEvent }
  | { kind: 'metrika'; sortTime: number; row: YandexMetrikaPhoneGoalEventRow };

function goalTimeAccuracyLabel(row: YandexMetrikaPhoneGoalEventRow): string {
  if (row.timeGranularity === 'exact') return 'точное';
  if (row.timeGranularity === 'minute') return 'до минуты';
  if (row.timeGranularity === 'daily') return 'только дата';
  return 'агрегировано';
}

function goalDateTimeLabel(row: YandexMetrikaPhoneGoalEventRow): string {
  if (row.dateTime) return formatDateTime(row.dateTime);
  const date = safeText(row.date);
  return date === '—' ? '—' : date + ' · без точного времени';
}

function toSortTime(value: unknown): number {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function PhoneClicksTable({ events = [], metrikaGoalSummary = null, metrikaGoalRows = [], metrikaGoalError = null }: PhoneClicksTableProps) {
  const rows = safeArray(events);
  const goalRows = safeArray(metrikaGoalRows);
  const goalItems = safeArray(metrikaGoalSummary?.items);
  const pbxpulsPhoneClicks = rows.length;
  const metrikaPhoneGoalConversions = Number(metrikaGoalSummary?.totalGoalConversions || 0);
  const phoneClickDataGap = metrikaPhoneGoalConversions - pbxpulsPhoneClicks;
  const primaryGoalName = goalItems.find(item => item.phoneClickGoalName)?.phoneClickGoalName || goalItems[0]?.phoneClickGoalId || 'цель звонка';
  const hasMetrikaRows = goalRows.length > 0;
  const hasMetrikaOnlyWarning = rows.length === 0 && (metrikaPhoneGoalConversions > 0 || hasMetrikaRows);
  const hasMixedWarning = rows.length > 0 && hasMetrikaRows;
  const partialErrorText = metrikaGoalError || safeArray(metrikaGoalSummary?.partialErrors).map(item => item.error).filter(Boolean).join('; ');
  const emptyDescription = hasMetrikaOnlyWarning
    ? 'PBXPuls пока не получил реальные phone_click через JS-скрипт. Строки Яндекс.Метрики ниже — это агрегированная сверка, не реальные события PBXPuls. Метрика может отдавать цели агрегировано без точного времени. Для точного сопоставления со звонками установите JS-скрипт PBXPuls.'
    : 'Создайте сайт и установите JS-скрипт PBXPuls на сайт.';
  const unifiedRows: UnifiedPhoneClickRow[] = [
    ...rows.map(event => ({ kind: 'pbxpuls' as const, sortTime: toSortTime(event.eventTime), event })),
    ...goalRows.map(row => ({ kind: 'metrika' as const, sortTime: toSortTime(row.dateTime || row.date), row }))
  ].sort((a, b) => b.sortTime - a.sortTime);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">PBXPuls JS</div>
          <div className="mt-2 font-mono text-2xl font-black text-slate-950 dark:text-white">{safeNumber(pbxpulsPhoneClicks)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">Реальные события phone_click для CDR matching</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Яндекс.Метрика цели</div>
          <div className="mt-2 font-mono text-2xl font-black text-purple-700 dark:text-purple-300">{safeNumber(metrikaPhoneGoalConversions)}</div>
          <div className="mt-1 break-words text-xs font-semibold text-slate-500">Достижения сопоставленной цели звонка</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Сверка</div>
          <div className="mt-2 font-mono text-2xl font-black text-blue-700 dark:text-blue-300">{safeNumber(phoneClickDataGap)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">Метрика минус PBXPuls JS</div>
        </div>
      </div>

      {(hasMetrikaOnlyWarning || hasMixedWarning) && <div className="break-words rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">{hasMetrikaOnlyWarning ? emptyDescription : 'Основная таблица показывает реальные PBXPuls JS клики и агрегированную сверку из Яндекс.Метрики. CDR-сопоставление выполняется только для PBXPuls JS.'}</div>}
      {partialErrorText && <div className="break-words rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">{safeText(partialErrorText)}</div>}

      {goalItems.length > 0 && (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Сопоставленные цели звонка</div>
          <div className="mt-2 space-y-1">
            {goalItems.map(item => <div key={item.integrationId} className="break-words">{safeText(item.siteName || item.domain)}: {safeText(item.phoneClickGoalName)} — <span className="font-mono">{safeText(item.phoneClickGoalId)}</span></div>)}
          </div>
        </div>
      )}

      <EmptyTableCard
        title="Клики по телефонам"
        description="Основная таблица показывает реальные PBXPuls JS клики и агрегированную сверку из Яндекс.Метрики. CDR-сопоставление выполняется только для PBXPuls JS."
        columns={['Источник данных', 'Дата/время клика', 'Точность времени', 'Сайт', 'Страница', 'Цель', 'Конверсии', 'Номер на сайте', 'ymClientId', 'utm_source', 'utm_medium', 'utm_campaign', 'Связь со звонком', 'Confidence', 'Причина', 'Статус звонка', 'Статус лида', 'Перезвон', 'UniqueID', 'LinkedID', 'Диспозиция', 'Время до звонка', 'Время до перезвона']}
        emptyTitle="Событий пока нет"
        emptyDescription={emptyDescription}
        hasRows={unifiedRows.length > 0}
      >
        {unifiedRows.map(item => {
          if (item.kind === 'metrika') {
            const row = item.row;
            return (
              <tr key={['metrika', row.siteId, row.goalId, row.dateTime || row.date, row.page, row.utmSource, row.utmMedium, row.utmCampaign].map(safeText).join('|')} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3"><span className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-black text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">Яндекс.Метрика goal{row.exactTimeAvailable ? '' : ' / агрегировано'}</span></td>
                <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{goalDateTimeLabel(row)}</td>
                <td className="px-3 py-3 text-slate-500">{goalTimeAccuracyLabel(row)}</td>
                <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">{safeText(row.domain || row.siteId)}</td>
                <td className="max-w-[220px] truncate px-3 py-3 text-slate-500" title={safeText(row.page)}>{safeText(row.page)}</td>
                <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300">{safeText(row.goalName)} — {safeText(row.goalId)}</td>
                <td className="px-3 py-3 font-mono font-black text-purple-700 dark:text-purple-300">{safeNumber(row.conversions)}</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 font-mono text-slate-500">{safeText(row.ymClientId)}</td>
                <td className="px-3 py-3 text-slate-500">{safeText(row.utmSource)}</td>
                <td className="px-3 py-3 text-slate-500">{safeText(row.utmMedium)}</td>
                <td className="px-3 py-3 text-slate-500">{safeText(row.utmCampaign)}</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
              </tr>
            );
          }
          const event = item.event;
          return (
            <tr key={event.eventId || event.id || event.eventTime + event.phoneText} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="px-3 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">PBXPuls JS</span></td>
              <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{formatDateTime(event.eventTime)}</td>
              <td className="px-3 py-3 text-slate-500">точное</td>
              <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">{safeText(event.siteName || event.siteNameFallback)}</td>
              <td className="max-w-[220px] truncate px-3 py-3 text-slate-500" title={safeText(event.pageUrl)}>{safeText(event.pageUrl)}</td>
              <td className="px-3 py-3 text-slate-500">—</td>
              <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">1</td>
              <td className="px-3 py-3 font-mono font-black text-slate-800 dark:text-slate-100">{safeText(event.phoneText || event.phoneHref)}</td>
              <td className="px-3 py-3 font-mono text-slate-500">{safeText(event.ymClientId)}</td>
              <td className="px-3 py-3 text-slate-500">{safeText(event.utmSource)}</td>
              <td className="px-3 py-3 text-slate-500">{safeText(event.utmMedium)}</td>
              <td className="px-3 py-3 text-slate-500">{safeText(event.utmCampaign)}</td>
              <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', matchClass(event)].join(' ')}>{matchLabel(event)}</span></td>
              <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{matchConfidenceScore(event)}</td>
              <td className="max-w-[180px] truncate px-3 py-3 text-slate-500" title={safeText(event.matchExplanation || event.matchReason)}>{matchReasonLabel(event.matchReason)}</td>
              <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', callStatusClass(event.callStatus)].join(' ')}>{callStatusLabel(event.callStatus)}</span></td>
              <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', leadStatusClass(event)].join(' ')}>{leadStatusLabel(event)}</span></td>
              <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', callbackStatusClass(event.callbackStatus)].join(' ')}>{callbackStatusLabel(event.callbackStatus)}</span></td>
              <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300">{safeText(event.matchedCallUniqueId || event.matchedCallUniqueid)}</td>
              <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300">{safeText(event.matchedLinkedId || event.matchedLinkedid)}</td>
              <td className="px-3 py-3 font-black text-slate-600 dark:text-slate-300">{safeText(event.matchedDisposition)}</td>
              <td className="px-3 py-3 text-slate-500">{formatSeconds(event.secondsToCall)}</td>
              <td className="px-3 py-3 text-slate-500">{formatSeconds(event.callbackSecondsAfterMissed)}</td>
            </tr>
          );
        })}
      </EmptyTableCard>
    </div>
  );
}

export function TrafficSourcesTable({ sources = [] }: { sources?: TrafficSourceSummary[] | null }) {
  const rows = safeArray(sources);
  return (
    <EmptyTableCard
      title="Источники звонков"
      description="Атрибуция звонков по рекламным и органическим источникам"
      columns={['Источник', 'Medium', 'Кампания', 'Визиты', 'Пользователи', 'Отказы', 'Клики', 'Формы', 'Звонки', 'Отвечено', 'Пропущено', 'Спасено', 'Потеряно', 'Расход', 'Клики Директа', 'CPC', 'Цена звонка', 'Цена отвеченного звонка', 'Потерянный бюджет', 'Конверсия', '% спасенных']}
      emptyTitle="Нет данных по источникам"
      emptyDescription="Данные появятся после подключения коллтрекинга и рекламных интеграций."
      hasRows={rows.length > 0}
    >
      {rows.map(source => (
        <tr key={[source.source, source.medium, source.campaign].join('|')} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-black text-slate-800 dark:text-slate-100">{safeText(source.source)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(source.medium)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(source.campaign)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeNumber(source.visits)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{source.users === undefined ? '—' : safeNumber(source.users)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{source.bounceRate === undefined || source.bounceRate === null ? '—' : safePercent(source.bounceRate)}</td>
          <td className="px-3 py-3 font-mono font-black text-purple-700 dark:text-purple-300">{safeNumber(source.phoneClicks)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeNumber(source.formSubmits)}</td>
          <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">{safeNumber(source.calls)}</td>
          <td className="px-3 py-3 font-mono font-black text-emerald-700 dark:text-emerald-300">{safeNumber(source.answeredCalls)}</td>
          <td className="px-3 py-3 font-mono font-black text-amber-700 dark:text-amber-300">{safeNumber(source.missedCalls)}</td>
          <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">{safeNumber(source.recoveredByCallback)}</td>
          <td className="px-3 py-3 font-mono font-black text-rose-700 dark:text-rose-300">{safeNumber(source.trueLostLeads ?? source.lostCalls)}</td>
          <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">{safeMoney(source.cost)}</td>
          <td className="px-3 py-3 font-mono font-black text-purple-700 dark:text-purple-300">{safeNumber(source.directClicks)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeMoney(source.avgCpc)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeMoney(source.costPerCall)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeMoney(source.costPerAnsweredCall)}</td>
          <td className="px-3 py-3 font-mono font-black text-rose-700 dark:text-rose-300">{safeMoney(source.lostBudgetEstimate)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safePercent(source.clickToCallConversion)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safePercent(source.callbackRecoveryRate)}</td>
        </tr>
      ))}
    </EmptyTableCard>
  );
}

export function MetrikaPagesTable({ pages = [], connected = false }: { pages?: YandexMetrikaPageSummary[] | null; connected?: boolean }) {
  const rows = safeArray(pages);
  return (
    <EmptyTableCard
      title="Страницы"
      description="Страницы входа и активность посетителей из Яндекс.Метрики"
      columns={['Страница', 'Визиты', 'Пользователи', 'Просмотры', 'Клики по телефону']}
      emptyTitle={connected ? 'Данных по страницам пока нет' : 'Яндекс.Метрика не подключена'}
      emptyDescription={connected ? 'Данные появятся после накопления статистики Метрики.' : 'Подключите Яндекс.Метрику, чтобы видеть страницы входа и поведение посетителей.'}
      hasRows={rows.length > 0}
    >
      {rows.map(page => (
        <tr key={page.pageUrl} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="max-w-[520px] truncate px-3 py-3 font-semibold text-slate-700 dark:text-slate-200" title={page.pageUrl}>{safeText(page.pageUrl)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeNumber(page.visits)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{safeNumber(page.users)}</td>
          <td className="px-3 py-3 font-mono font-black text-blue-700 dark:text-blue-300">{safeNumber(page.pageViews)}</td>
          <td className="px-3 py-3 font-mono font-black text-purple-700 dark:text-purple-300">{safeNumber(page.phoneClicks)}</td>
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

export function LostLeadsTable({ events = [] }: { events?: PhoneClickEvent[] | null }) {
  const rows = safeArray(events);
  return (
    <EmptyTableCard
      title="Потерянные лиды"
      description="Сопоставленные звонки с сайта без успешного ответа и без успешного перезвона"
      columns={['Источник', 'Кампания', 'Страница', 'Время клика', 'Время звонка', 'Номер', 'Confidence', 'Причина', 'Статус звонка', 'Статус', 'Перезвон', 'UniqueID', 'LinkedID', 'Ответственный', 'Потерянный бюджет']}
      emptyTitle="Потерянных лидов по коллтрекингу пока нет"
      emptyDescription="Здесь появятся сопоставленные обращения без ответа, по которым не было успешного перезвона."
      hasRows={rows.length > 0}
    >
      {rows.map(event => (
        <tr key={event.eventId || event.id || event.eventTime + event.phoneText} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="px-3 py-3 font-black text-slate-800 dark:text-slate-100">{safeText(event.utmSource || event.referrer)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.utmCampaign)}</td>
          <td className="max-w-[220px] truncate px-3 py-3 text-slate-500" title={event.pageUrl}>{safeText(event.pageUrl)}</td>
          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(event.eventTime)}</td>
          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(event.matchedCallDate)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-800 dark:text-slate-100">{safeText(event.matchedExternalNumber || event.phoneText)}</td>
          <td className="px-3 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{matchConfidenceScore(event)}</td>
          <td className="max-w-[180px] truncate px-3 py-3 text-slate-500" title={safeText(event.matchExplanation || event.matchReason)}>{matchReasonLabel(event.matchReason)}</td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', callStatusClass(event.callStatus)].join(' ')}>{callStatusLabel(event.callStatus)}</span></td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', leadStatusClass(event)].join(' ')}>{leadStatusLabel(event)}</span></td>
          <td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', callbackStatusClass(event.callbackStatus)].join(' ')}>{callbackStatusLabel(event.callbackStatus)}</span></td>
          <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300">{safeText(event.matchedCallUniqueId || event.matchedCallUniqueid)}</td>
          <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300">{safeText(event.matchedLinkedId || event.matchedLinkedid)}</td>
          <td className="px-3 py-3 text-slate-500">{safeText(event.responsibleExtension)}</td>
          <td className="px-3 py-3 text-slate-400">—</td>
        </tr>
      ))}
    </EmptyTableCard>
  );
}
