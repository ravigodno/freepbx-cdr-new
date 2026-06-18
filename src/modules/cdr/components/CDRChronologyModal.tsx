import React from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  Clock,
  Home,
  Loader2,
  Network,
  Pause,
  Play,
  Route,
  Truck,
  XCircle,
} from 'lucide-react';

function formatSecondsShort(value: any) {
  const n = Number(value || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getStepView(leg: any) {
  const disposition = String(leg.disposition || '').toUpperCase();

  if (disposition === 'ANSWERED' && Number(leg.billsec || 0) > 0) {
    return {
      color: 'bg-emerald-600 text-white border-emerald-700',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Ответ',
    };
  }

  if (['NO ANSWER', 'BUSY', 'FAILED'].includes(disposition)) {
    return {
      color: 'bg-rose-600 text-white border-rose-700',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: <XCircle className="h-4 w-4" />,
      label: 'Не отвечен',
    };
  }

  if (leg.actionType === 'ivr') {
    return {
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      icon: <Truck className="h-4 w-4" />,
      label: 'IVR',
    };
  }

  if (leg.actionType === 'voicemail') {
    return {
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <BookOpen className="h-4 w-4" />,
      label: 'Голосовая почта',
    };
  }

  if (leg.actionType === 'ringing') {
    return {
      color: 'bg-sky-50 text-sky-700 border-sky-200',
      badge: 'bg-sky-50 text-sky-700 border-sky-200',
      icon: <Home className="h-4 w-4" />,
      label: 'Вызов',
    };
  }

  return {
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    badge: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: <Network className="h-4 w-4" />,
    label: 'Этап',
  };
}

function getRouteLabel(leg: any) {
  if (leg.actionType === 'ivr') return 'IVR';
  if (leg.actionType === 'voicemail') return 'VOICEMAIL';
  if (leg.lastapp) return String(leg.lastapp).toUpperCase();
  if (leg.dst) return String(leg.dst);
  return 'STEP';
}

interface Props {
  chronologyCallId: string | null;
  chronologyData: any;
  isChronologyLoading: boolean;
  chronologyError: string | null;
  isAudioPaused: boolean;
  playingRecording?: string | null;

  fetchChronology: (uniqueid: string) => void;
  playRecording: (call: any) => void;
  onClose: () => void;
}

export default function CDRChronologyModal({
  chronologyCallId,
  chronologyData,
  isChronologyLoading,
  chronologyError,
  isAudioPaused,
  playingRecording,
  fetchChronology,
  playRecording,
  onClose,
}: Props) {
  if (!chronologyCallId) return null;

  const timeline = chronologyData?.timeline || [];
  const first = timeline[0] || {};
  const answeredLeg = timeline.find((t: any) => t.disposition === 'ANSWERED' && Number(t.billsec || 0) > 0);
  const did = timeline.find((t: any) => t.did)?.did || '—';
  const anyAnswered = Boolean(answeredLeg);
  const totalBillsec = timeline.reduce((sum: number, t: any) => sum + Number(t.billsec || 0), 0);
  const routeItems = timeline.slice(0, 8).map(getRouteLabel);

  return (
    <div className="fixed inset-0 bg-slate-950/40 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl relative max-h-[90vh] flex flex-col font-sans overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-200 p-5 bg-slate-50/80">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Route className="h-5 w-5 text-red-600" />
              Таймлайн прохождения звонка
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5 font-mono">
              ID: {chronologyCallId}
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-105 rounded-lg cursor-pointer transition-colors text-base"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isChronologyLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="h-10 w-10 text-red-600 animate-spin" />
              <p className="text-sm text-slate-600 font-medium">Запрос маршрута прохождения звонка...</p>
            </div>
          )}

          {chronologyError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-red-650 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold">Ошибка получения данных</h5>
                <p className="mt-1">{chronologyError}</p>
                <button
                  onClick={() => fetchChronology(chronologyCallId)}
                  className="mt-3 text-[11px] bg-red-100 hover:bg-red-200 active:scale-95 transition-all text-red-800 font-bold px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer"
                >
                  Попробовать снова
                </button>
              </div>
            </div>
          )}

          {chronologyData && (
            <>
              {chronologyData.routeAnalysis && (
                <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-xs">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-blue-500 mb-3">
                    Маршрут FreePBX
                  </div>

                  <div className="space-y-2">
                    {chronologyData.routeAnalysis.steps?.map((step: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-blue-50/40 border border-blue-100">
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">
                          {idx + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-blue-200 text-blue-700">
                              {step.label}
                            </span>
                            <span className="text-sm font-black text-slate-900">
                              {step.title}
                            </span>
                          </div>

                          <div className="mt-1 text-[11px] text-slate-600 font-mono break-all">
                            {step.pattern && <span>DID/PATTERN: {step.pattern} · </span>}
                            {step.destination && <span>DEST: {step.destination} · </span>}
                            {step.number && <span>NUM: {step.number}</span>}
                          </div>

                          {step.members && step.members.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {step.members.map((m: any) => (
                                <span key={m.extension} className="px-2 py-1 rounded-lg bg-white border border-blue-100 text-[10px] font-bold text-slate-700">
                                  {m.extension} {m.name ? `— ${m.name}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                    Маршрут звонка
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs font-mono">
                      {first.src || 'Внешний номер'}
                    </span>
                    <span className="text-slate-300 font-black">→</span>
                    <span className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs font-mono">
                      DID {did}
                    </span>
                    {routeItems.map((item: string, idx: number) => (
                      <React.Fragment key={`${item}-${idx}`}>
                        <span className="text-slate-300 font-black">→</span>
                        <span className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs">
                          {item}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="mt-4 text-[11px] text-slate-500 font-mono">
                    LinkedID: <span className="font-semibold text-slate-700">{chronologyData.linkedid || '—'}</span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                    Результат
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Статус:</span>
                      <span className={`px-2 py-0.5 rounded-lg border font-black ${
                        anyAnswered
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}>
                        {anyAnswered ? 'ОТВЕЧЕН' : 'НЕ ОТВЕЧЕН'}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Этапов:</span>
                      <span className="font-bold text-slate-800 font-mono">{chronologyData.legsCount || timeline.length}</span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Разговор:</span>
                      <span className="font-bold text-slate-800 font-mono">{formatSecondsShort(totalBillsec)}</span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Ответил:</span>
                      <span className="font-bold text-slate-800 font-mono">
                        {answeredLeg?.dst || answeredLeg?.dstchannel || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Лента событий
                </span>
                <hr className="flex-1 border-slate-200" />
              </div>

              <div className="flow-root">
                <ul className="-mb-8">
                  {timeline.map((leg: any, legIdx: number) => {
                    const isLast = legIdx === timeline.length - 1;
                    const step = getStepView(leg);
                    const isAnswered = leg.disposition === 'ANSWERED' && Number(leg.billsec || 0) > 0;

                    return (
                      <li key={legIdx}>
                        <div className="relative pb-8">
                          {!isLast && (
                            <span className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                          )}

                          <div className="relative flex gap-4 items-start">
                            <span className={`h-10 w-10 rounded-full border flex items-center justify-center ring-4 ring-white shadow-xs shrink-0 ${step.color}`}>
                              {step.icon}
                            </span>

                            <div className="min-w-0 flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                              <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase ${step.badge}`}>
                                      {step.label}
                                    </span>
                                    <h4 className="text-sm font-black text-slate-900">
                                      {leg.title || getRouteLabel(leg)}
                                    </h4>
                                  </div>

                                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                    {leg.description || 'Этап прохождения вызова'}
                                  </p>
                                </div>

                                <div className="text-[10px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded-lg whitespace-nowrap">
                                  {leg.calldate || '—'}
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-[10px]">
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                  <div className="text-slate-400 mb-0.5">Источник</div>
                                  <div className="text-slate-800 font-bold truncate" title={leg.channel || leg.src}>
                                    {leg.src || String(leg.channel || '—').split('-')[0]}
                                  </div>
                                </div>

                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                  <div className="text-slate-400 mb-0.5">Назначение</div>
                                  <div className="text-slate-800 font-bold truncate" title={leg.dstchannel || leg.dst}>
                                    {leg.dst || String(leg.dstchannel || '—').split('-')[0]}
                                  </div>
                                </div>

                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                  <div className="text-slate-400 mb-0.5">Контекст</div>
                                  <div className="text-slate-800 font-bold truncate" title={leg.dcontext}>
                                    {leg.dcontext || '—'}
                                  </div>
                                </div>

                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                  <div className="text-slate-400 mb-0.5">Приложение</div>
                                  <div className="text-slate-800 font-bold truncate" title={leg.lastapp}>
                                    {leg.lastapp || '—'}
                                  </div>
                                </div>

                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                  <div className="text-slate-400 mb-0.5">Статус</div>
                                  <div className={`font-black truncate ${isAnswered ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    {leg.disposition || '—'}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                                <span>
                                  Вызов: <b className="text-slate-800">{formatSecondsShort(leg.duration)}</b>
                                </span>
                                <span>
                                  Разговор: <b className={Number(leg.billsec || 0) > 0 ? 'text-emerald-700' : 'text-slate-500'}>
                                    {formatSecondsShort(leg.billsec)}
                                  </b>
                                </span>
                                {leg.lastdata && (
                                  <span className="truncate max-w-sm" title={leg.lastdata}>
                                    Аргументы: <b className="text-slate-600">{leg.lastdata}</b>
                                  </span>
                                )}
                              </div>

                              {leg.recordingfile && (
                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => playRecording(leg)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all border ${
                                      playingRecording === leg.recordingfile
                                        ? 'bg-red-50 border-red-200 text-red-700'
                                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {playingRecording === leg.recordingfile && !isAudioPaused ? (
                                      <>
                                        <Pause className="h-3 w-3 text-red-600 animate-pulse" />
                                        <span>Играет</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play className="h-3 w-3 text-slate-600" />
                                        <span>Прослушать запись</span>
                                      </>
                                    )}
                                  </button>

                                  <span className="text-[9.5px] text-slate-500 truncate" title={leg.recordingfile}>
                                    {String(leg.recordingfile).split('/').pop()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer shadow-sm active:scale-95 transition-transform"
          >
            Закрыть окно
          </button>
        </div>
      </div>
    </div>
  );
}
