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
  const isLostBadge = isMissed && callbackStatus === 'not_called_back';
  const hasProcessedCallbackStatus = callbackStatus === 'processed'
    || callbackStatus === 'called_back'
    || callbackStatus === 'repeated_inbound'
    || callbackStatus === 'processed_in_sla'
    || callbackStatus === 'processed_late';
  const showProcessedBadge = isMissed && (hasProcessedCallbackStatus || processed || wasCallbacked);
  const processedInSla = callbackStatus === 'processed_in_sla' || wasKpiResolved === true;

  const statusBadge = callDisp === 'ANSWERED' ? (
    <span className="inline-flex items-center gap-1.5 bg-emerald-50/40 dark:bg-emerald-950/10 text-emerald-500 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
      <CheckCircle className="h-3.5 w-3.5" />
      Отвечен
    </span>
  ) : isLostBadge ? (
    <span className="inline-flex items-center gap-1.5 bg-rose-50/40 dark:bg-rose-950/10 text-rose-500 dark:text-rose-400 border border-rose-250/30 dark:border-rose-905/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
      <Target className="h-3.5 w-3.5" />
      Потерян
    </span>
  ) : showProcessedBadge ? (
    <button
      type="button"
      onClick={onShowProcessingEvent}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
        processedInSla
          ? 'bg-emerald-50/40 dark:bg-emerald-950/10 text-emerald-500 dark:text-emerald-400 border-emerald-250/30 dark:border-emerald-800/40 hover:bg-emerald-50'
          : 'bg-rose-50/40 dark:bg-rose-950/10 text-rose-500 dark:text-rose-400 border-rose-250/30 dark:border-rose-905/30 hover:bg-rose-50'
      }`}
      title={wasCallbacked ? `Клиенту успешно перезвонили в ${callbackTime}. Лимит времени по KPI: ${wasKpiResolved ? 'соблюден' : 'превышен!'}` : 'Звонок обработан вручную или автоматически.'}
    >
      <CheckCircle className="h-3.5 w-3.5" />
      Обработан
    </button>
  ) : (
    <span className="inline-flex items-center gap-1.5 bg-amber-50/40 dark:bg-amber-950/10 text-amber-500 dark:text-amber-400 border border-amber-250/30 dark:border-amber-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
      <AlertTriangle className="h-3.5 w-3.5" />
      Пропущен
    </span>
  );

  return (
    <td className="py-4 px-4">
      <div className="flex flex-col gap-1 items-start text-[11px] select-none">
        {statusBadge}
      </div>
    </td>
  );
}

export default CDRStatusCell;
