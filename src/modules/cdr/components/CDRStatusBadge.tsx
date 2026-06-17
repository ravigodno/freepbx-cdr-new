import React from 'react';

type Props = {
  status?: string;
};

export function CDRStatusBadge({ status }: Props) {
  const value = String(status || '').toUpperCase();

  let cls =
    'px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700';

  if (value === 'ANSWERED') {
    cls = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700';
  } else if (value === 'NO ANSWER') {
    cls = 'px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-700';
  } else if (value === 'BUSY') {
    cls = 'px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700';
  }

  return <span className={cls}>{status || '—'}</span>;
}
