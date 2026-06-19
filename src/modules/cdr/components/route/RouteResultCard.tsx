import React from 'react';

interface Props {
  index: number;
  anyAnswered: boolean;
  resultText: string;
}

export default function RouteResultCard({
  index,
  anyAnswered,
  resultText,
}: Props) {
  const isIvrNoChoice = resultText.toLowerCase().includes('не выбрал пункт меню');

  const cardClass = isIvrNoChoice
    ? 'bg-amber-50/60 border-amber-200'
    : anyAnswered
      ? 'bg-emerald-50/50 border-emerald-200'
      : 'bg-red-50/50 border-red-200';

  const badgeClass = isIvrNoChoice
    ? 'bg-amber-600'
    : anyAnswered
      ? 'bg-emerald-600'
      : 'bg-red-600';

  const titleClass = isIvrNoChoice
    ? 'text-amber-700'
    : anyAnswered
      ? 'text-emerald-700'
      : 'text-red-700';

  const titleText = isIvrNoChoice
    ? 'Не выбрал IVR'
    : anyAnswered
      ? 'Ответил'
      : 'Не ответил';

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border ${cardClass}`}
    >
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">
        {index}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-white ${badgeClass}`}
          >
            Результат
          </span>

          <span
            className={`text-sm font-black ${titleClass}`}
          >
            {titleText}
          </span>
        </div>

        <div className="mt-2 text-xs text-slate-700">
          {resultText}
        </div>
      </div>
    </div>
  );
}
