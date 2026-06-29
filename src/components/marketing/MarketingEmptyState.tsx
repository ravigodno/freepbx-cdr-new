import { Inbox } from 'lucide-react';

interface Props {
  title: string;
  description: string;
}

export function MarketingEmptyState({ title, description }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center dark:border-slate-800 dark:bg-slate-950/30">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
        <Inbox className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">{title}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</div>
    </div>
  );
}
