import React from 'react';
import {
  Pause,
  Play,
} from 'lucide-react';

interface CDRRecordingCellProps {
  call: any;
  playingCallId?: string | null;
  isAudioPaused?: boolean;
  playRecording: (call: any) => void;
}

export function CDRRecordingCell({
  call,
  playingCallId,
  isAudioPaused,
  playRecording,
}: CDRRecordingCellProps) {
  return (
    <td className="py-4 px-4">
      {call.recordingfile ? (
        <>
          <button
            onClick={() => playRecording(call)}
            className={`inline-flex items-center gap-1.5 py-1 px-3 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-250/70 dark:border-slate-800/40 text-[10.5px] font-bold rounded-lg cursor-pointer transition-colors shadow-3xs ${
              playingCallId === call.uniqueid
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-600 hover:bg-rose-100/50 dark:text-rose-400'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-950'
            }`}
          >
            {playingCallId === call.uniqueid && !isAudioPaused ? (
              <>
                <Pause className="h-3.5 w-3.5 fill-current" />
                <span>Слушать</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Слушать</span>
              </>
            )}
          </button>
        </>
      ) : (
        <span className="text-slate-405 dark:text-slate-500 italic text-xs select-none font-light">Нет записи</span>
      )}
    </td>
  );
}

export default CDRRecordingCell;
