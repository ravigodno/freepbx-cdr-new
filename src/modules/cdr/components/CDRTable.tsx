import React from 'react';

type Props = {
  calls: any[];
};

export function CDRTable({ calls }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
      CDRTable module ready: {calls.length} calls
    </div>
  );
}
