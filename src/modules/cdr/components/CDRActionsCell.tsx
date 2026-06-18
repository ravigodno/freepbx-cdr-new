import React from 'react';
import {
  PhoneCall,
  UserPlus,
  MoreVertical,
  Volume2,
} from 'lucide-react';

interface Props {
  call: any;
  isMissed: boolean;
  isFound: boolean;
  displayedSrc: string;
  displayedDst: string;
  callerName: string;
  calleeName: string;
  isAdmin?: boolean;
  activeDropdownCallId?: string | null;

  openProcessModal: (call: any) => void;
  toggleRowDropdown: (uniqueid: string) => void;
  setActiveDropdownCallId: (id: string | null) => void;
  triggerClickToCall: (phone: string, name?: string) => void;
  openAddFromCall: (number: string, initialName?: string) => void;
  fetchChronology: (uniqueid: string) => void;
}

export default function CDRActionsCell({
  call,
  isMissed,
  isFound,
  displayedSrc,
  displayedDst,
  callerName,
  calleeName,
  isAdmin,
  activeDropdownCallId,
  openProcessModal,
  toggleRowDropdown,
  setActiveDropdownCallId,
  triggerClickToCall,
  openAddFromCall,
  fetchChronology,
}: Props) {
  return (
    <td className="py-4 px-4">
      <div className="flex items-center justify-start gap-2.5">
        {isMissed ? (
          <button
            onClick={() => openProcessModal(call)}
            className={`px-3.5 py-1.5 rounded-lg border transition-all text-xs font-bold whitespace-nowrap cursor-pointer shadow-3xs ${
              call.processed
                ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-705 dark:text-slate-300 dark:border-slate-800'
                : 'border-red-200 bg-white hover:bg-red-50/40 text-red-500 hover:text-red-600 dark:border-red-900/40 dark:hover:bg-red-950/20'
            }`}
          >
            {call.processed ? 'Изменить' : 'Обработать'}
          </button>
        ) : (
          <div className="w-[102px]" />
        )}

        <div className="relative inline-block leading-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRowDropdown(call.uniqueid);
            }}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="Дополнительные действия"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {activeDropdownCallId === call.uniqueid && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-905 border border-slate-150 dark:border-slate-800 rounded-lg shadow-lg py-1 z-30 font-sans text-xs text-left text-slate-700 dark:text-slate-200">
              <button
                onClick={() => {
                  setActiveDropdownCallId(null);
                  triggerClickToCall(displayedSrc, callerName);
                }}
                className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer font-medium"
              >
                <PhoneCall className="h-3.5 w-3.5 text-emerald-500" />
                <span>Позвонить вызыв.</span>
              </button>

              <button
                onClick={() => {
                  setActiveDropdownCallId(null);
                  triggerClickToCall(displayedDst, calleeName);
                }}
                className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer font-medium"
              >
                <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
                <span>Позвонить куда</span>
              </button>

              {!isFound && (
                <button
                  onClick={() => {
                    setActiveDropdownCallId(null);
                    openAddFromCall(
                      displayedSrc,
                      callerName &&
                      !callerName.startsWith('Внешний') &&
                      !callerName.startsWith('Внутренний')
                        ? callerName
                        : ''
                    );
                  }}
                  className="w-full px-3 py-2 text-slate-700 dark:text-slate-355 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800 font-medium"
                >
                  <UserPlus className="h-3.5 w-3.5 text-indigo-505" />
                  <span>Добавить {displayedSrc}</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => {
                    setActiveDropdownCallId(null);
                    fetchChronology(call.uniqueid);
                  }}
                  className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800 font-medium"
                >
                  <Volume2 className="h-3.5 w-3.5 text-purple-500" />
                  <span>Хронология вызова</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
