import { ArrowRight, CheckCircle2, MousePointerClick, PhoneCall, PhoneMissed, RefreshCw, Search } from 'lucide-react';

const steps = [
  { label: 'Источник трафика', icon: Search, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Визит', icon: MousePointerClick, tone: 'text-purple-600 bg-purple-50' },
  { label: 'Клик по телефону', icon: PhoneCall, tone: 'text-indigo-600 bg-indigo-50' },
  { label: 'Звонок в АТС', icon: PhoneCall, tone: 'text-sky-600 bg-sky-50' },
  { label: 'Ответ / пропуск', icon: PhoneMissed, tone: 'text-amber-600 bg-amber-50' },
  { label: 'Перезвон', icon: RefreshCw, tone: 'text-emerald-600 bg-emerald-50' },
  { label: 'Потеря / успех', icon: CheckCircle2, tone: 'text-rose-600 bg-rose-50' }
];

export function MarketingFunnelChain() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">Цепочка аналитики</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">После подключения скрипта сайта и интеграций PBXPuls сможет связывать рекламу, визиты и реальные звонки.</p>
        </div>
        <span className="w-fit rounded-full bg-purple-50 px-3 py-1 text-[11px] font-black text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">Foundation</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="relative rounded-2xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
              <div className={['flex h-9 w-9 items-center justify-center rounded-xl', step.tone].join(' ')}><Icon className="h-4 w-4" /></div>
              <div className="mt-3 text-xs font-black leading-snug text-slate-800 dark:text-slate-100">{step.label}</div>
              {index < steps.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 xl:block" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
