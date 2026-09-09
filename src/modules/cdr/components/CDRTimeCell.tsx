import { formatCdrDateTime } from '../../../utils/formatInterfaceDateTime';
export { formatCdrDateTime } from '../../../utils/formatInterfaceDateTime';
import React from 'react';
import CDRRegistryIcon, { type RegistryIconKind } from './CDRRegistryIcon';
import { type CdrDateTimeFormat } from '../../../utils/interfacePreferences';

interface CDRTimeCellProps {
  calldate: string;
  uniqueid: string;
  isIncoming: boolean;
  isOutgoing: boolean;
  iconKind?: RegistryIconKind;
  fetchChronology: (uniqueid: string) => void;
  dateTimeFormat?: CdrDateTimeFormat;
  showSeconds?: boolean;
  useBrowserTimezone?: boolean;
  hourCycle?: 12 | 24;
}


export function CDRTimeCell({
  calldate,
  uniqueid,
  isIncoming,
  isOutgoing,
  iconKind,
  fetchChronology,
  dateTimeFormat = 'dmy-dash',
  showSeconds = true,
  useBrowserTimezone = false,
  hourCycle = 24,
}: CDRTimeCellProps) {
  const meetingUid = uniqueid.match(/^pbxpuls-\d+-([a-f0-9]+)$/i)?.[1];
  const displayedId = meetingUid || uniqueid;

  return (
    <td className="py-4 px-4 font-normal text-slate-705 dark:text-slate-350">
      <div className="flex items-center gap-3">
        <CDRRegistryIcon kind={iconKind || (isIncoming ? 'incoming' : isOutgoing ? 'outgoing' : 'internal')} />

        <div className="flex flex-col">
          <span className="font-bold text-slate-800 dark:text-slate-200 text-[13px] tracking-tight">
            {formatCdrDateTime(calldate, dateTimeFormat, showSeconds, useBrowserTimezone, hourCycle)}
          </span>

          <span className="text-[11px] text-slate-400 dark:text-slate-505 font-mono mt-0.5 animate-none">
            ID:{' '}
            <button
              onClick={() => fetchChronology(uniqueid)}
              className="text-slate-400 hover:text-red-705 hover:underline cursor-pointer font-medium"
              title={meetingUid ? `Полный ID: ${uniqueid}` : 'Посмотреть хронологию прохождения звонка'}
            >
              {displayedId}
            </button>
          </span>
        </div>
      </div>
    </td>
  );
}

export default CDRTimeCell;
