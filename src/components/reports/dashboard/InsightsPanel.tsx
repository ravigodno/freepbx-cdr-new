import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';

type Tone = 'blue' | 'amber' | 'emerald';

const toneClasses: Record<Tone, { icon: string; dot: string; item: string }> = {
  blue: {
    icon: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300',
    dot: 'bg-blue-500',
    item: 'bg-blue-50/50 text-slate-700 dark:bg-blue-950/10 dark:text-slate-200'
  },
  amber: {
    icon: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    item: 'bg-amber-50/60 text-slate-700 dark:bg-amber-950/10 dark:text-slate-200'
  },
  emerald: {
    icon: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    item: 'bg-emerald-50/50 text-slate-700 dark:bg-emerald-950/10 dark:text-slate-200'
  }
};

function Section({ title, items, tone, icon: Icon }: { title: string; items: string[]; tone: Tone; icon: typeof Lightbulb }) {
  const classes = toneClasses[tone];
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className={['flex h-9 w-9 items-center justify-center rounded-xl border', classes.icon].join(' ')}><Icon className="h-4 w-4" /></div>
        <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
      </div>
      <div className="mt-4 space-y-2">
        {items.length ? items.map(item => (
          <div key={item} className={['flex gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold leading-5', classes.item].join(' ')}>
            <span className={['mt-2 h-1.5 w-1.5 shrink-0 rounded-full', classes.dot].join(' ')} />
            <span>{item}</span>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">Нет данных</div>
        )}
      </div>
    </div>
  );
}

export function InsightsPanel({ insights, anomalies, recommendations }: { insights: string[]; anomalies: string[]; recommendations: string[] }) {
  return (
    <div className="grid gap-3">
      <Section title="Выводы за период" items={insights} tone="blue" icon={Lightbulb} />
      <Section title="Аномалии" items={anomalies} tone="amber" icon={AlertTriangle} />
      <Section title="Рекомендации" items={recommendations} tone="emerald" icon={CheckCircle2} />
    </div>
  );
}
