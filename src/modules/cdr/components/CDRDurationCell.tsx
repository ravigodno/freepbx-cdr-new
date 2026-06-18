import React from 'react';

interface CDRDurationCellProps {
  duration: number;
  billsec: number;
  formatSeconds: (sec: number) => string;
}

export function CDRDurationCell({
  duration,
  billsec,
  formatSeconds
}: CDRDurationCellProps) {
  return (
    <td className="py-4 px-4 font-normal">
      <div className="text-slate-500 text-xs gap-1 flex flex-col">
        <div>
          Длительность:&nbsp;&nbsp;<span className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatSeconds(duration)}</span>
        </div>
        <div>
          Разговор:&nbsp;&nbsp;<span className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatSeconds(billsec)}</span>
        </div>
      </div>
    </td>
  );
}

export default CDRDurationCell;
