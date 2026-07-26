import { useState } from 'react';
import { Download } from 'lucide-react';

type Props = {
  direction: 'incoming' | 'outgoing';
  params: URLSearchParams;
  disabled?: boolean;
};

function sessionToken() {
  try { return JSON.parse(localStorage.getItem('asterisk_cdr_session') || '{}').token || ''; } catch { return ''; }
}

export function UniqueNumbersExportButton({ direction, params, disabled }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'started' | 'empty' | 'error'>('idle');
  const run = async () => {
    setState('loading');
    try {
      const query = new URLSearchParams(params);
      query.set('direction', direction);
      const response = await fetch(`/api/reports/unique-numbers.csv?${query}`, { headers: { Authorization: `Bearer ${sessionToken()}` } });
      if (response.status === 404) { setState('empty'); return; }
      if (!response.ok) throw new Error('export_failed');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `pbxpuls_${direction}_unique_numbers.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      URL.revokeObjectURL(url);
      setState('started');
    } catch {
      setState('error');
    }
  };
  const message = state === 'loading' ? 'Подготовка экспорта…'
    : state === 'started' ? 'Скачивание началось'
      : state === 'empty' ? 'По текущим фильтрам внешние номера не найдены'
        : state === 'error' ? 'Не удалось подготовить экспорт' : '';
  return <div className="flex flex-col items-end gap-1">
    <button type="button" title="Скачать CSV с уникальными внешними номерами и данными из справочника" onClick={run} disabled={disabled || state === 'loading'} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-300">
      <Download className={state === 'loading' ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />{state === 'loading' ? 'Подготовка…' : 'Экспорт уникальных номеров'}
    </button>
    {message && <span aria-live="polite" className={state === 'error' || state === 'empty' ? 'text-[10px] font-semibold text-amber-600' : 'text-[10px] font-semibold text-emerald-600'}>{message}</span>}
  </div>;
}
