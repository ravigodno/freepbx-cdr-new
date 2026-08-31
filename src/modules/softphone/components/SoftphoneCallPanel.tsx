import React, { useState } from 'react';
import { Headphones, Mic, MicOff, PhoneIncoming, PhoneOff } from 'lucide-react';
import type { SoftphoneSnapshot } from '../sip/sipClient';

interface Props {
  snapshot: SoftphoneSnapshot;
  onAnswer: () => Promise<void>;
  onReject: () => Promise<void>;
  onHangup: () => Promise<void>;
  onMute: (muted: boolean) => void;
  onDtmf: (tone: string) => Promise<void>;
}

export default function SoftphoneCallPanel({ snapshot, onAnswer, onReject, onHangup, onMute, onDtmf }: Props) {
  const [showKeypad, setShowKeypad] = useState(false);
  if (snapshot.call === 'idle') return null;
  const incoming = snapshot.call === 'incoming';
  const active = snapshot.call === 'active';
  return <div className="fixed bottom-5 right-5 z-[85] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl">
    <div className="flex items-center gap-3">
      <div className={`rounded-xl p-2.5 ${incoming ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{incoming ? <PhoneIncoming className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}</div>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{incoming ? 'Входящий звонок' : active ? 'Разговор через гарнитуру' : 'Установка соединения'}</div><div className="truncate font-mono text-lg font-black">{snapshot.remoteNumber || 'Номер не определён'}</div></div>
    </div>
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {incoming ? <>
        <button type="button" onClick={() => void onAnswer()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black hover:bg-emerald-700"><Headphones className="h-4 w-4" />Ответить</button>
        <button type="button" onClick={() => void onReject()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-xs font-black hover:bg-rose-700"><PhoneOff className="h-4 w-4" />Отклонить</button>
      </> : <>
        <button type="button" onClick={() => onMute(!snapshot.muted)} disabled={!active} className="rounded-xl border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700 disabled:opacity-40" title={snapshot.muted ? 'Включить микрофон' : 'Выключить микрофон'}>{snapshot.muted ? <MicOff className="h-5 w-5 text-amber-300" /> : <Mic className="h-5 w-5" />}</button>
        <button type="button" onClick={() => setShowKeypad(value => !value)} disabled={!active} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-xs font-black hover:bg-slate-700 disabled:opacity-40">DTMF</button>
        <button type="button" onClick={() => void onHangup()} className="rounded-xl bg-rose-600 p-3 hover:bg-rose-700" title="Завершить"><PhoneOff className="h-5 w-5" /></button>
      </>}
    </div>
    {showKeypad && active && <div className="mt-3 grid grid-cols-4 gap-1.5">{'123A456B789C*0#D'.split('').map(tone => <button key={tone} type="button" onClick={() => void onDtmf(tone)} className="rounded-lg bg-slate-800 py-2 font-mono text-xs font-bold hover:bg-slate-700">{tone}</button>)}</div>}
    {snapshot.error && <div className="mt-3 text-[10px] font-semibold text-rose-300">{snapshot.error}</div>}
  </div>;
}
