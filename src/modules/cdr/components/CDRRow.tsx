import React from 'react';
import { formatSeconds } from '../utils/formatCall';
import { CDRStatusBadge } from './CDRStatusBadge';
import { CDRRecordingBadge } from './CDRRecordingBadge';
import { CDRRowActions } from './CDRRowActions';

type Props = {
  call: any;
  index: number;

  session: any;

  directory: any[];

  playingCallId: string | null;
  isAudioPaused: boolean;

  activeDropdownCallId: string | null;

  setActiveDropdownCallId: (id: string | null) => void;

  triggerClickToCall: (num: string, name?: string) => void;

  openAddFromCall: (num: string, name?: string) => void;

  playRecording: (call: any) => void;

  openProcessModal: (call: any) => void;

  fetchChronology: (id: string) => void;
};

export function CDRRow({
  call,
  index,
  session,
  directory,
  playingCallId,
  isAudioPaused,
  activeDropdownCallId,
  setActiveDropdownCallId,
  triggerClickToCall,
  openAddFromCall,
  playRecording,
  openProcessModal,
  fetchChronology
}: Props) {
  return (
    <tr>
      {/* ===== SOURCE ===== */}
      <td className="py-3 px-2 text-xs font-mono">
        {call.src || '—'}
      </td>

      {/* ===== DEST ===== */}
      <td className="py-3 px-2 text-xs font-mono">
        {call.dst || '—'}
      </td>

      {/* ===== COMPANY ===== */}
      <td className="py-3 px-2 text-xs">
        {call.company || '—'}
      </td>

      {/* ===== STATUS ===== */}
      <td className="py-3 px-2 text-xs">
        <CDRStatusBadge status={call.disposition} />
      </td>

      {/* ===== DURATION ===== */}
      <td className="py-3 px-2 text-xs font-mono">
        {call.duration || 0}s
      </td>

      {/* ===== ACTIONS ===== */}
      <td className="py-3 px-2 text-xs">
        <CDRRecordingBadge recordingfile={call.recordingfile} />

        <CDRRowActions
          call={call}
          session={session}
          triggerClickToCall={triggerClickToCall}
          playRecording={playRecording}
          openProcessModal={openProcessModal}
          fetchChronology={fetchChronology}
        />
      </td>
    </tr>
  );
}
