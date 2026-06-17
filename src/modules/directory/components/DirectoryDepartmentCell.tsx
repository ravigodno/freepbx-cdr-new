import React from 'react';

type Props = {
  department?: string;
};

export function DirectoryDepartmentCell({ department }: Props) {
  return (
    <td className="py-3.5 px-3 text-slate-700">
      {department ? (
        <span>{department}</span>
      ) : (
        <span className="text-slate-350 italic">—</span>
      )}
    </td>
  );
}
