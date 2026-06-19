import React from 'react';
import DirectoryTypeIcon from './DirectoryTypeIcon';
import {
  PhoneCall,
  UserPlus,
} from 'lucide-react';
import { isMultiNumberValue } from '../utils/CDRRowHelpers';

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
  calleeName,
  calleeType,
  displayedDst,
  isFoundDst,
  triggerClickToCall,
  openAddFromCall,
}: Props) {
  const isMultiDst = isMultiNumberValue(displayedDst);

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
                {calleeName}
              </span>
            </span>
          </div>

          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
            <span>{displayedDst}</span>

            {!isMultiDst && (
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
            )}
          </div>
        </div>
      </div>
    </td>
  );
}
