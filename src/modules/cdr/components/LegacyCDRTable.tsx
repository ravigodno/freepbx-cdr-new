import React from 'react';

interface LegacyCDRTableProps {
  calls: any[];
  directory?: any[];
  session?: any;
  copiedNumber?: string | null;
  playingCallId?: string | null;
  isAudioPaused?: boolean;
  activeDropdownCallId?: string | null;
  handleCopy?: (num: string) => void;
  triggerClickToCall?: (targetPhone: string, targetName?: string) => void;
  openAddFromCall?: (number: string, initialName?: string) => void;
  playRecording?: (call: any) => void;
  openProcessModal?: (call: any) => void;
  toggleRowDropdown?: (uniqueid: string) => void;
  fetchChronology?: (uniqueid: string) => void;
  setActiveDropdownCallId?: (id: string | null) => void;
  formatSeconds?: (sec: number) => string;
}

export default function LegacyCDRTable({
  calls,
  directory,
  session,
  copiedNumber,
  playingCallId,
  isAudioPaused,
  activeDropdownCallId,
  handleCopy,
  triggerClickToCall,
  openAddFromCall,
  playRecording,
  openProcessModal,
  toggleRowDropdown,
  fetchChronology,
  setActiveDropdownCallId,
  formatSeconds
}: LegacyCDRTableProps) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#1e293b]/20 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
          <th className="py-4 px-4">ВРЕМЯ ВЫЗОВА / ID</th>
          <th className="py-4 px-4 font-bold">КТО ЗВОНИЛ</th>
          <th className="py-4 px-4 font-bold">КУДА ЗВОНИЛ</th>
          <th className="py-4 px-4 font-bold">РЕШЕНИЕ (СТАТУС)</th>
          <th className="py-4 px-4 font-bold">ДЛИТЕЛЬНОСТЬ</th>
          <th className="py-4 px-4 font-bold">ЗАПИСЬ</th>
          <th className="py-4 px-4 font-bold">КОММЕНТАРИЙ ОПЕРАТОРА</th>
          <th className="py-4 px-4 font-bold text-left">УПРАВЛЕНИЕ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/45 text-xs bg-white dark:bg-slate-900">
      </tbody>
    </table>
  );
}
