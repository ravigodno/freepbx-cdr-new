import React from 'react';
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
} from 'lucide-react';

interface CDRTimeCellProps {
  calldate: string;
  uniqueid: string;
  isIncoming: boolean;
  isOutgoing: boolean;
  isAdmin?: boolean;
  fetchChronology: (uniqueid: string) => void;
}

export function CDRTimeCell({
  calldate,
  uniqueid,
  isIncoming,
  isOutgoing,
  isAdmin,
  fetchChronology,
}: CDRTimeCellProps) {
  return (
    <td className="py-4 px-4 font-normal text-slate-705 dark:text-slate-350">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-3xs">
          {isIncoming ? (
            <PhoneIncoming className="h-4.5 w-4.5" />
          ) : isOutgoing ? (
            <PhoneOutgoing className="h-4.5 w-4.5" />
          ) : (
            <PhoneCall className="h-4.5 w-4.5" />
          )}
        </div>

        <div className="flex flex-col">
          <span className="font-bold text-slate-800 dark:text-slate-200 text-[13px] tracking-tight">
            {calldate}
          </span>

          <span className="text-[11px] text-slate-400 dark:text-slate-505 font-mono mt-0.5 animate-none">
            ID:{' '}
            {isAdmin ? (
              <button
                onClick={() => fetchChronology(uniqueid)}
                className="text-slate-400 hover:text-red-705 hover:underline cursor-pointer font-medium"
                title="Посмотреть хронологию прохождения звонка"
              >
                {uniqueid}
              </button>
            ) : (
              <span className="select-all">{uniqueid}</span>
            )}
          </span>
        </div>
      </div>
    </td>
  );
}

export default CDRTimeCell;
