import React from 'react';
import DirectoryTypeIcon from './DirectoryTypeIcon';
import {
  PhoneCall,
  PhoneForwarded,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { isMultiNumberValue } from '../utils/CDRRowHelpers';
import { isBlindTransferBadgeEligible } from '../utils/isBlindTransferBadgeEligible';

interface Props {
  call: any;
  calleeName: string;
  calleeType: string;
  displayedDst: string;
  isFoundDst: boolean;

  triggerClickToCall: (phone: string, name?: string) => void;
  openAddFromCall: (number: string, initialName?: string) => void;
}

export default function CDRCalleeCell({
  call,
  calleeName,
  calleeType,
  displayedDst,
  isFoundDst,
  triggerClickToCall,
  openAddFromCall,
}: Props) {
  const isMultiDst = isMultiNumberValue(displayedDst);
  const transferTargetExt = String(call?.blindTransferTargetExt || call?.transferTargetExt || '').trim();
  const transferTargetLabel = String(call?.transferTargetLabel || '').trim();
  const hasTransferTarget = Boolean(isBlindTransferBadgeEligible(call) && transferTargetExt);
  const compactInternal = calleeName === `Внутренний ${displayedDst}`;
  const compactCalleeLabel = compactInternal ? calleeName.slice(0, -displayedDst.length).trim() : calleeName;
  const callAction = !isMultiDst && (
    <button
        type="button"
        onClick={() => triggerClickToCall(displayedDst, calleeName)}
        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
        title={`Позвонить на ${displayedDst}`}
      >
        <PhoneCall className="h-3 w-3" />
    </button>
  );
  const addAction = !isMultiDst && !isFoundDst && (
    <button
      type="button"
      onClick={() =>
        openAddFromCall(
          displayedDst,
          calleeName &&
          !calleeName.startsWith('Внешний') &&
          !calleeName.startsWith('Внутренний')
            ? calleeName
            : ''
        )
      }
      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-605 hover:text-indigo-700 transition-colors cursor-pointer"
      title={`Добавить ${displayedDst} в справочник`}
    >
      <UserPlus className="h-3 w-3" />
    </button>
  );

  if (call?.phoneMeeting) {
    return (
      <td className="py-4 px-4">
        <div className="flex max-w-xs flex-col gap-1.5 select-text">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
            <UsersRound className="h-4 w-4 shrink-0 text-violet-600" />
            <span>{displayedDst}</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Инициатор: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{call.phoneMeetingInitiator || '—'}</span>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td className="py-4 px-4">
      <div className="flex items-center justify-start gap-6 max-w-xs select-text">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <DirectoryTypeIcon type={calleeType} className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <span className={`font-bold text-xs ${
                isFoundDst
                  ? 'text-red-800 dark:text-red-400'
                  : 'text-slate-800 dark:text-slate-100'
              }`}>
                {compactCalleeLabel}
              </span>
              {compactInternal && callAction}
              {compactInternal && (
                <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                  {displayedDst}
                </span>
              )}
              {compactInternal && addAction}
            </span>
          </div>

          {!compactInternal && (
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
              {callAction}
              <span>{displayedDst}</span>
              {addAction}
            </div>
          )}

          {hasTransferTarget && (
            <div className="inline-flex w-fit items-center gap-1.5 rounded-md border border-slate-200 bg-transparent px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <PhoneForwarded className="h-3.5 w-3.5" aria-label="Переведён" />
              <span>на</span>
              <span className="font-mono text-xs">{transferTargetExt}</span>
              {transferTargetLabel && (
                <span className="max-w-[160px] truncate normal-case tracking-normal text-slate-600 dark:text-slate-300">
                  {transferTargetLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
