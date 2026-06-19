import React from 'react';

interface Props {
  step: RouteStep;
  index: number;
}

export default function RouteStepCard({ step, index }: Props) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50/40 border border-blue-100">
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-700">
            {step.label}
          </span>

          <span className="text-sm font-black text-slate-900">
            {step.title}
          </span>
        </div>

        <div className="mt-1 text-[11px] text-slate-600 font-mono break-all">
          {step.pattern && <span>PATTERN: {step.pattern} · </span>}
          {step.destination && <span>DEST: {step.destination} · </span>}
          {step.number && <span>NUM: {step.number}</span>}
        </div>

        {step.members?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.members.map((m: any) => (
              <span
                key={m.extension}
                className="px-2 py-1 rounded-lg bg-white border border-blue-100 text-[10px] font-bold text-slate-700"
              >
                {m.extension}
                {m.name ? ` — ${m.name}` : ''}
                {m.status ? ` · ${m.status}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
