import React from 'react';
import { AudioLines, CheckCircle2, CircleAlert, Flag, Mic2, Send, UsersRound, XCircle } from 'lucide-react';

type ParticipantStatus = 'connected' | 'missed' | 'busy' | 'failed';

interface MeetingParticipant {
  number: string;
  initiator: boolean;
  status: ParticipantStatus;
  durationSec: number;
}

interface MeetingData {
  kind?: 'meeting' | 'active_conference';
  createdAt: string;
  initiatorExt: string;
  participants: MeetingParticipant[];
  recordingFile: string;
  durationSec: number;
}

const durationText = (seconds: number) => {
  const value = Math.max(0, Number(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

const participantState = (participant: MeetingParticipant) => {
  if (participant.status === 'connected') {
    return participant.durationSec <= 2
      ? { label: `Подключался ${participant.durationSec} сек.`, className: 'border-amber-200 bg-amber-50 text-amber-800', icon: CircleAlert }
      : { label: `Участвовал ${durationText(participant.durationSec)}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 };
  }
  if (participant.status === 'busy') return { label: 'Был занят', className: 'border-amber-200 bg-amber-50 text-amber-800', icon: CircleAlert };
  if (participant.status === 'failed') return { label: 'Ошибка приглашения', className: 'border-red-200 bg-red-50 text-red-800', icon: CircleAlert };
  return { label: 'Пропустил совещание', className: 'border-slate-200 bg-slate-50 text-slate-600', icon: XCircle };
};

function Step({ icon: Icon, label, title, children, tone = 'blue' }: any) {
  const tones: Record<string, string> = {
    blue: 'border-blue-100 bg-blue-50/40 text-blue-700',
    violet: 'border-violet-100 bg-violet-50/50 text-violet-700',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-700'
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${tones[tone] || tones.blue}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-wider opacity-75">{label}</div>
        <div className="mt-0.5 text-sm font-black text-slate-900">{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function MeetingTimelineViewer({ meeting }: { meeting: MeetingData }) {
  const isConference = meeting?.kind === 'active_conference';
  const eventName = isConference ? 'конференция' : 'совещание';
  const participants = Array.isArray(meeting?.participants) ? meeting.participants : [];
  const invitees = participants.filter(participant => !participant.initiator);
  const connected = participants.filter(participant => participant.status === 'connected');
  const missed = invitees.filter(participant => participant.status !== 'connected');
  const createdAt = meeting?.createdAt ? new Date(meeting.createdAt).toLocaleString('ru-RU') : 'время не определено';

  return (
    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-xs">
      <div className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-violet-600">Ход телефонной {isConference ? 'конференции' : 'совещания'}</div>
      <div className="space-y-2">
        <Step icon={UsersRound} label="Создание" title={`Инициатор ${meeting.initiatorExt} создал ${eventName}`} tone="violet">
          <div className="mt-1 text-xs text-slate-500">{createdAt}</div>
        </Step>
        <Step icon={Send} label="Приглашения" title="Отправлены приглашения">
          <div className="mt-2 flex flex-wrap gap-1.5">{invitees.map(participant => <span key={participant.number} className="rounded-lg border border-blue-100 bg-white px-2 py-1 font-mono text-[11px] font-bold text-slate-700">{participant.number}</span>)}</div>
        </Step>
        {participants.map(participant => {
          const state = participantState(participant);
          const StatusIcon = participant.initiator ? Mic2 : state.icon;
          const StateIcon = state.icon;
          return (
            <Step key={participant.number} icon={StatusIcon} label={participant.initiator ? 'Инициатор' : 'Участник'} title={`Внутренний номер ${participant.number}`}>
              <div className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold ${state.className}`}><StateIcon className="h-3.5 w-3.5" />{state.label}</div>
            </Step>
          );
        })}
        <Step icon={AudioLines} label="Запись" title={meeting.recordingFile ? `Запись ${isConference ? 'конференции' : 'совещания'} доступна` : `Запись ${isConference ? 'конференции' : 'совещания'} отсутствует`} tone="violet">
          <div className="mt-1 text-xs text-slate-500">Длительность: {durationText(meeting.durationSec)}</div>
        </Step>
        <Step icon={Flag} label="Завершение" title={`${isConference ? 'Конференция' : 'Совещание'} завершено`} tone="emerald">
          <div className="mt-1 text-xs text-slate-600">Участвовали: {connected.map(item => item.number).join(', ') || '—'} · Пропустили: {missed.map(item => item.number).join(', ') || '—'}</div>
        </Step>
      </div>
    </div>
  );
}
