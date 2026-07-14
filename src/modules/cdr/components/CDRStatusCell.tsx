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
  callbackStatus?: 'processed_in_sla' | 'processed_late' | 'pending_callback' | 'not_called_back' | 'processed' | 'called_back' | 'repeated_inbound';
  onShowProcessingEvent?: () => void;
}

export function CDRStatusCell({
  isMissed,
  callDisp,
  processed,
  wasCallbacked,
  wasKpiResolved,
  callbackTime,
  callbackStatus,
  onShowProcessingEvent,
}: CDRStatusCellProps) {
  const isAwaitingBadge = isMissed && callbackStatus === 'pending_callback';
  const isLostBadge = isMissed && callbackStatus === 'not_called_back';
  const hasProcessedCallbackStatus = callbackStatus === 'processed'
    || callbackStatus === 'called_back'
    || callbackStatus === 'repeated_inbound'
    || callbackStatus === 'processed_in_sla'
    || callbackStatus === 'processed_late';
  const showProcessedBadge = isMissed && (hasProcessedCallbackStatus || processed || wasCallbacked);

  return (
    <td className="py-4 px-4">
      <div className="flex flex-col gap-1 items-start text-[11px] select-none">
        {callDisp === 'ANSWERED' ? (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50/40 dark:bg-emerald-950/10 text-emerald-500 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
            <CheckCircle className="h-3.5 w-3.5" />
            Отвечен
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-rose-50/40 dark:bg-rose-950/10 text-rose-500 dark:text-rose-400 border border-rose-250/30 dark:border-rose-905/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
            <Target className="h-3.5 w-3.5" />
            Без ответа
          </span>
        )}

        {isAwaitingBadge && (
          <span className="inline-flex items-center gap-1.5 mt-1 bg-amber-50/40 dark:bg-amber-950/10 text-amber-500 dark:text-amber-400 border border-amber-250/30 dark:border-amber-800/40 px-2 py-0.5 rounded-lg text-[10px] font-bold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Ожидает обработки
          </span>
        )}

        {isLostBadge && (
          <span className="inline-flex items-center gap-1.5 mt-1 bg-rose-50/40 dark:bg-rose-950/10 text-rose-500 dark:text-rose-400 border border-rose-250/30 dark:border-rose-905/30 px-2 py-0.5 rounded-lg text-[10px] font-bold">
            <Target className="h-3.5 w-3.5" />
            Потерян
          </span>
        )}

        {showProcessedBadge && (
          <button
            type="button"
            onClick={onShowProcessingEvent}
            className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700 shadow-xs hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
            title={wasCallbacked ? `Клиенту успешно перезвонили в ${callbackTime}. Лимит времени по KPI: ${wasKpiResolved ? 'соблюден' : 'превышен!'}` : 'Звонок обработан вручную или автоматически.'}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              callbackStatus === 'processed_in_sla' || wasKpiResolved === true
                ? 'bg-emerald-500'
                : 'bg-rose-500'
              }`}
            />
            <span>Обработано</span>
          </button>
        )}
      </div>
    </td>
  );
}

export default CDRStatusCell;
