import React from 'react';

type Props = {
  company?: string;
};

export function DirectoryCompanyCell({ company }: Props) {
  return (
    <td className="py-3.5 px-2 text-slate-700 w-[230px] max-w-[230px]">
      {company ? (
        <div className="block truncate max-w-[210px]" title={company}>
          {company}
        </div>
      ) : (
        <span className="text-slate-350 italic">—</span>
      )}
    </td>
  );
}
