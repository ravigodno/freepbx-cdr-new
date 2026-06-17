import React from 'react';
import { formatSeconds } from '../utils/formatCall';

type Props = {
  duration?: number | string;
};

export function CDRDurationCell({ duration }: Props) {
  return (
    <td className="py-3 px-2 text-xs font-mono">
      {formatSeconds(duration)}
    </td>
  );
}
