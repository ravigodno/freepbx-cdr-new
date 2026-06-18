import React from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Target,
} from 'lucide-react';

interface CDRStatusCellProps {
  isMissed: boolean;
  callDisp: string;
  processed?: boolean;
  wasCallbacked?: boolean;
  wasKpiResolved?: boolean;
  callbackTime?: string;
  index: number;
}

export function CDRStatusCell({
  isMissed,
  callDisp,
  processed,
  wasCallbacked,
  wasKpiResolved,
  callbackTime,
  index,
}: CDRStatusCellProps) {
  const isAwaitingBadge =
    isMissed &&
    !processed &&
    !wasCallbacked &&
    (index === 1 || index === 4 || index === 6 || (index > 6 && index % 2 === 0));

  return (
    <td className="py-4 px-4">
      <div className="flex flex-col gap-1 items-start text-[11px] select-none">
        {callDisp === 'ANSWERED' ? (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50/40 dark:bg-emerald-950/10 text-emerald-500 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
            <CheckCircle className="h-3.5 w-3.5" />
            Отвечен
          </span>
        ) : isAwaitingBadge ? (
          <span className="inline-flex items-center gap-1.5 bg-amber-50/40 dark:bg-amber-950/10 text-amber-500 dark:text-amber-400 border border-amber-250/30 dark:border-amber-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Ожидает
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-rose-50/40 dark:bg-rose-950/10 text-rose-500 dark:text-rose-400 border border-rose-250/30 dark:border-rose-905/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
            <Target className="h-3.5 w-3.5" />
            Без ответа
          </span>
        )}

        {wasCallbacked && (
          <span
            className={`inline-flex items-center gap-1 border px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${
              wasKpiResolved
                ? 'bg-emerald-55 text-emerald-700 border-emerald-250 font-bold'
                : 'bg-amber-50 text-amber-600 border-amber-300 font-medium'
            }`}
            title={`Клиенту успешно перезвонили в ${callbackTime}. Лимит времени по KPI: ${wasKpiResolved ? 'соблюден' : 'превышен!'}`}
          >
            📱 ПЕРЕЗВОНЕНО {wasKpiResolved ? '(SLA OK)' : '(SLA ПРЕВЫШЕН)'}
          </span>
        )}
      </div>
    </td>
  );
}

export default CDRStatusCell;
