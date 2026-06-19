import React from 'react';
import { Edit2 } from 'lucide-react';

interface Props {
  call: any;
  isMissed: boolean;
  isIncoming: boolean;
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
  isIncoming,
  openProcessModal,
}: Props) {
  const isProcessedLike = Boolean(call.processed || call.comment);
  const needsProcessing = isMissed && isIncoming && !isProcessedLike;

  return (
    <td className="py-4 px-4">
      <div className="flex items-center justify-end w-full pr-2">
        <button
          onClick={() => openProcessModal(call)}
          className={`px-2 py-1.5 rounded-lg border transition-all text-xs font-bold whitespace-nowrap cursor-pointer shadow-3xs ${
            needsProcessing
              ? 'border-red-300 bg-red-50 hover:bg-red-100 text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-705 dark:text-slate-300 dark:border-slate-800'
          }`}
          title={needsProcessing ? 'Обработать пропущенный звонок' : 'Комментарий / редактирование звонка'}
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </td>
  );
}
