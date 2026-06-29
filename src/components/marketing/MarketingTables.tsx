import { MarketingEmptyState } from './MarketingEmptyState';

interface EmptyTableProps {
  title: string;
  description: string;
  columns: string[];
  emptyTitle: string;
  emptyDescription: string;
}

function EmptyTableCard({ title, description, columns, emptyTitle, emptyDescription }: EmptyTableProps) {
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
        </table>
      </div>
      <div className="mt-4">
        <MarketingEmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    </div>
  );
}

export function PhoneClicksTable() {
  return (
    <EmptyTableCard
      title="Клики по телефонам"
      description="События кликов по телефонным номерам на сайте"
      columns={['Дата/время', 'Сайт', 'Страница', 'Номер на сайте', 'ymClientId', 'utm_source', 'utm_medium', 'utm_campaign', 'Статус связи со звонком']}
      emptyTitle="Кликов по телефонам пока нет"
      emptyDescription="Установите JS-скрипт PBXPuls на сайт, чтобы начать сбор событий."
    />
  );
}

export function TrafficSourcesTable() {
  return (
    <EmptyTableCard
      title="Источники звонков"
      description="Атрибуция звонков по рекламным и органическим источникам"
      columns={['Источник', 'Визиты', 'Клики по телефону', 'Звонки', 'Отвечено', 'Пропущено', 'Потеряно', 'Конверсия', 'Расход', 'Цена звонка']}
      emptyTitle="Нет данных по источникам"
      emptyDescription="Данные появятся после подключения коллтрекинга и рекламных интеграций."
    />
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
