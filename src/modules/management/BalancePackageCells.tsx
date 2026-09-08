import React from 'react';

type Props = {
  purchased?: number | null;
  remaining?: number | null;
  labels?: string[];
  note?: string;
  calculated?: boolean;
};

const minutes = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? 'Нет данных'
  : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} мин`;

export default function BalancePackageCells({ purchased, remaining, labels = [], note, calculated }: Props) {
  return <>
    <div>
      <div className="text-[10px] uppercase text-slate-400">Пакет минут</div>
      <div className="mt-1 font-mono text-sm font-bold">{minutes(purchased)}</div>
      {labels.length > 0 && <div className="mt-1 text-[10px] text-slate-500">{labels.join(' · ')}</div>}
      {note && <div className="mt-1 text-[10px] text-slate-500">{note}</div>}
    </div>
    <div>
      <div className="text-[10px] uppercase text-slate-400">Осталось минут</div>
      <div className="mt-1 font-mono text-sm font-bold">{minutes(remaining)}</div>
      {remaining != null && calculated && <div className="mt-1 text-[10px] text-slate-500">Расчётный остаток</div>}
    </div>
  </>;
}
