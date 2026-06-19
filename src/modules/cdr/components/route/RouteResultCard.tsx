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
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border ${
        anyAnswered
          ? 'bg-emerald-50/50 border-emerald-200'
          : 'bg-red-50/50 border-red-200'
      }`}
    >
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">
        {index}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-white ${
              anyAnswered ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            Результат
          </span>

          <span
            className={`text-sm font-black ${
              anyAnswered ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {anyAnswered ? 'Ответил' : 'Не ответил'}
          </span>
        </div>

        <div className="mt-2 text-xs text-slate-700">
          {resultText}
        </div>
      </div>
    </div>
  );
}
