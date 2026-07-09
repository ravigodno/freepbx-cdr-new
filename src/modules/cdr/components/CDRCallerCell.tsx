import React from 'react';
import DirectoryTypeIcon from './DirectoryTypeIcon';
import {
  Check,
  Copy,
  PhoneCall,
  UserPlus,
} from 'lucide-react';

interface Props {
  callerName: string;
  callerType: string;
  displayedSrc: string;
  copiedKey: string;
  copiedNumber?: string | null;
  isFound: boolean;

  handleCopy: (num: string, copiedKey?: string) => void;
  triggerClickToCall: (phone: string, name?: string) => void;
  openAddFromCall: (number: string, initialName?: string) => void;
}

export default function CDRCallerCell({
  callerName,
  callerType,
  displayedSrc,
  copiedKey,
  copiedNumber,
  isFound,
  handleCopy,
  triggerClickToCall,
  openAddFromCall,
}: Props) {
  return (
    <td className="py-4 px-4 m-0">
      <div className="flex flex-col gap-1.5 justify-center">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <DirectoryTypeIcon type={callerType} className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <span className={`font-bold text-xs ${
              isFound
                ? 'text-red-800 dark:text-red-400'
                : 'text-slate-800 dark:text-slate-150'
            }`}>
              {callerName}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap select-none">
          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono select-all text-xs">
            {displayedSrc}
          </span>

          <button
            onClick={() => handleCopy(displayedSrc, copiedKey)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-303 transition-colors cursor-pointer"
          >
            {copiedNumber === copiedKey ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            onClick={() => triggerClickToCall(displayedSrc, callerName)}
            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs hover:scale-102"
          >
            <PhoneCall className="h-2.5 w-2.5" />
            <span>Позвонить</span>
          </button>

          {!isFound && (
            <button
              onClick={() =>
                openAddFromCall(
                  displayedSrc,
                  callerName &&
                  !callerName.startsWith('Внешний') &&
                  !callerName.startsWith('Внутренний')
                    ? callerName
                    : ''
                )
              }
              className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 text-indigo-650 dark:text-indigo-300 border border-indigo-200/30 dark:border-indigo-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs hover:scale-102"
            >
              <UserPlus className="h-2.5 w-2.5" />
              <span>Добавить</span>
            </button>
          )}
        </div>
      </div>
    </td>
  );
}
