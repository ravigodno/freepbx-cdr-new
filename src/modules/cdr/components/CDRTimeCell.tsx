import React from 'react';
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
} from 'lucide-react';
import { serverLocalDateTimeToBrowser } from '../../../utils/serverClock';

interface CDRTimeCellProps {
  calldate: string;
  uniqueid: string;
  isIncoming: boolean;
  isOutgoing: boolean;
  fetchChronology: (uniqueid: string) => void;
  dateTimeFormat?: 'dmy-dash' | 'dmy-short-dash' | 'dmy-dot' | 'dmy-slash' | 'ymd-dash';
  showSeconds?: boolean;
  useBrowserTimezone?: boolean;
  hourCycle?: 12 | 24;
}

function formatCdrDateTime(value: string, format: NonNullable<CDRTimeCellProps['dateTimeFormat']>, showSeconds: boolean, useBrowserTimezone: boolean, hourCycle: 12 | 24): string {
  if (useBrowserTimezone) {
    const browserDate = serverLocalDateTimeToBrowser(value);
    if (browserDate) value = `${browserDate.getFullYear()}-${String(browserDate.getMonth()+1).padStart(2,'0')}-${String(browserDate.getDate()).padStart(2,'0')} ${String(browserDate.getHours()).padStart(2,'0')}:${String(browserDate.getMinutes()).padStart(2,'0')}:${String(browserDate.getSeconds()).padStart(2,'0')}`;
  }
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  const numericHour = Number(hour);
  const displayHour = hourCycle === 12 ? String(numericHour % 12 || 12).padStart(2, '0') : hour;
  const suffix = hourCycle === 12 ? (numericHour >= 12 ? ' PM' : ' AM') : '';
  const time = `${displayHour}:${minute}${showSeconds ? `:${second}` : ''}${suffix}`;
  if (format === 'ymd-dash') return `${year}-${month}-${day} ${time}`;
  if (format === 'dmy-short-dash') return `${day}-${month}-${year.slice(-2)} ${time}`;
  const separator = format === 'dmy-dot' ? '.' : format === 'dmy-slash' ? '/' : '-';
  return `${day}${separator}${month}${separator}${year} ${time}`;
}

export function CDRTimeCell({
  calldate,
  uniqueid,
  isIncoming,
  isOutgoing,
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
