import React from 'react';

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
        {call.disposition || '—'}
      </td>

      {/* ===== DURATION ===== */}
      <td className="py-3 px-2 text-xs font-mono">
        {call.duration || 0}s
      </td>

      {/* ===== ACTIONS ===== */}
      <td className="py-3 px-2 text-xs">
        <button
          onClick={() => triggerClickToCall(call.dst, call.company)}
          className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs"
        >
          Call
        </button>

        {call.recordingfile && (
          <button
            onClick={() => playRecording(call)}
            className="ml-2 px-2 py-1 bg-slate-100 rounded text-xs"
          >
            Play
          </button>
        )}

        <button
          onClick={() => openProcessModal(call)}
          className="ml-2 px-2 py-1 bg-red-50 text-red-600 rounded text-xs"
        >
          Process
        </button>

        {session?.role === 'admin' && (
          <button
            onClick={() => fetchChronology(call.uniqueid)}
            className="ml-2 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs"
          >
            Log
          </button>
        )}
      </td>
    </tr>
  );
}
