import React from 'react';

type Props = {
  company?: string;
};

export function CDRCompanyCell({ company }: Props) {
  return (
    <td className="py-3 px-2 text-xs">
      {company || '—'}
    </td>
  );
}
