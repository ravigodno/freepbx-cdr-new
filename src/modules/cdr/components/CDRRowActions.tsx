import React from 'react';

type Props = {
  call: any;
  session: any;
  triggerClickToCall: (num: string, name?: string) => void;
  playRecording: (call: any) => void;
  openProcessModal: (call: any) => void;
  fetchChronology: (id: string) => void;
};

export function CDRRowActions({
  call,
  session,
  triggerClickToCall,
  playRecording,
  openProcessModal,
  fetchChronology
}: Props) {
  return (
    <>
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
    </>
  );
}
