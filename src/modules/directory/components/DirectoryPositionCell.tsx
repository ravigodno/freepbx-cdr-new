import React from 'react';

type Props = {
  position?: string;
};

export function DirectoryPositionCell({ position }: Props) {
  return (
    <td className="py-3.5 px-3 text-slate-700">
      {position || <span className="text-slate-350 italic">—</span>}
    </td>
  );
}
