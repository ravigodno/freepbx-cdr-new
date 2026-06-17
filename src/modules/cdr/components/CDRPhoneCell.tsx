import React from 'react';

type Props = {
  value?: string;
};

export function CDRPhoneCell({ value }: Props) {
  return (
    <td className="py-3 px-2 text-xs font-mono">
      {value || '—'}
    </td>
  );
}
