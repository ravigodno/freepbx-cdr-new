import { Bell, Code2, LineChart, Megaphone, PlugZap } from 'lucide-react';

const integrations = [
  { title: 'JS-скрипт сайта', description: 'Сбор кликов по телефонным номерам и UTM-меток.', icon: Code2, action: 'Скоро' },
  { title: 'Яндекс.Метрика', description: 'Связь визитов, ymClientId и целей сайта.', icon: LineChart, action: 'Скоро' },
  { title: 'Яндекс Директ', description: 'Импорт расходов, кампаний и ключевых связок.', icon: Megaphone, action: 'Скоро' },
  { title: 'CRM / Bitrix24', description: 'Передача звонков и лидов в CRM на следующих этапах.', icon: PlugZap, action: 'Скоро' },
  { title: 'Уведомления', description: 'Оповещения о потерянных рекламных обращениях.', icon: Bell, action: 'Скоро' }
];

export function MarketingIntegrationsPanel() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-base font-black text-slate-950 dark:text-white">Интеграции</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Заготовки подключений для следующих этапов коллтрекинга</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {integrations.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 ring-1 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/40">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">Не подключено</span>
              </div>
              <div className="mt-4 text-sm font-black text-slate-900 dark:text-white">{item.title}</div>
              <div className="mt-1 min-h-[42px] text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</div>
              <button className="mt-4 h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{item.action}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
