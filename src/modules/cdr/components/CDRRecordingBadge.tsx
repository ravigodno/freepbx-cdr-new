import React from 'react';

type Props = {
  recordingfile?: string;
};

export function CDRRecordingBadge({ recordingfile }: Props) {
  if (!recordingfile) {
    return (
      <span className="text-slate-400">
        Нет записи
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-700 text-[11px] font-bold">
      Есть запись
    </span>
  );
}
