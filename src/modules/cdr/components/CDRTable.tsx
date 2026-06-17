import React from 'react';
import { CDRRow } from './CDRRow';

type Props = {
  calls: any[];
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

export function CDRTable(props: Props) {
  const {
    calls,
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
  } = props;

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr>
          <th>Src</th>
          <th>Dst</th>
          <th>Company</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-100">
        {calls.map((call, index) => (
          <CDRRow
            key={call.uniqueid || index}
            call={call}
            index={index}
            session={session}
            directory={directory}
            playingCallId={playingCallId}
            isAudioPaused={isAudioPaused}
            activeDropdownCallId={activeDropdownCallId}
            setActiveDropdownCallId={setActiveDropdownCallId}
            triggerClickToCall={triggerClickToCall}
            openAddFromCall={openAddFromCall}
            playRecording={playRecording}
            openProcessModal={openProcessModal}
            fetchChronology={fetchChronology}
          />
        ))}
      </tbody>
    </table>
  );
}
