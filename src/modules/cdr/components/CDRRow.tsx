import React from 'react';
import { formatSeconds } from '../utils/formatCall';
import { CDRStatusBadge } from './CDRStatusBadge';
import { CDRRecordingBadge } from './CDRRecordingBadge';
import { CDRRowActions } from './CDRRowActions';
import { CDRPhoneCell } from './CDRPhoneCell';
import { CDRDurationCell } from './CDRDurationCell';

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
      <CDRPhoneCell value={call.src} />
      <CDRPhoneCell value={call.dst} />

      {/* ===== COMPANY ===== */}
      <td className="py-3 px-2 text-xs">
        {call.company || '—'}
      </td>

      {/* ===== STATUS ===== */}
      <td className="py-3 px-2 text-xs">
        <CDRStatusBadge status={call.disposition} />
      </td>

      <CDRDurationCell duration={call.duration} />

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
