import React from 'react';
import { CDRStatusBadge } from './CDRStatusBadge';

type Props = {
  status?: string;
};

export function CDRStatusCell({ status }: Props) {
  return (
    <td className="py-3 px-2 text-xs">
      <CDRStatusBadge status={status} />
    </td>
  );
}
