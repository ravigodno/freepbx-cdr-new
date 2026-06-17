import React from 'react';

type Props = {
  calldate?: string;
  uniqueid?: string;
};

export function CDRDateCell({ calldate, uniqueid }: Props) {
  return (
    <td className="py-3 px-2 text-xs">
      <div className="font-mono text-slate-800">
        {calldate || '—'}
      </div>
      {uniqueid && (
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
          ID: {uniqueid}
        </div>
      )}
    </td>
  );
}
