import React from 'react';
import {
  PhoneCall,
  UserPlus,
} from 'lucide-react';
import { isInternalExt } from '../utils/CDRRowHelpers';

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
  return (
    <td className="py-4 px-4">
      <div className="flex items-center justify-between gap-6 max-w-xs select-text">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold text-xs ${
              isFoundDst
                ? 'text-red-800 dark:text-red-400'
                : 'text-slate-800 dark:text-slate-100'
            }`}>
              {calleeName}
            </span>

            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40 select-none">
              {calleeType === 'internal' ? 'Внутр.' : 'Клиент'}
            </span>
          </div>

          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
            <span>{displayedDst}</span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => triggerClickToCall(displayedDst, calleeName)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                title={`Позвонить на ${displayedDst}`}
              >
                <PhoneCall className="h-3 w-3" />
              </button>

              {!isFoundDst && (
                <button
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
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end text-right font-mono text-[10.5px] text-slate-400 dark:text-slate-500 gap-1 select-none">
          <span>DID: {call.did || '841282'}</span>
          <span>не отвечает: {isInternalExt(call.dst) && call.dst !== '9999' ? call.dst : '100, 200'}</span>
        </div>
      </div>
    </td>
  );
}
