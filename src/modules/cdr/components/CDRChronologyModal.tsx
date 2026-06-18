import React from 'react';
import {
  AlertCircle,
  Loader2,
  Route,
} from 'lucide-react';

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
  fetchChronology,
  onClose,
}: Props) {
  if (!chronologyCallId) return null;

  const timeline = chronologyData?.timeline || [];
  const first = timeline[0] || {};
  const answeredLeg = timeline.find((t: any) =>
    String(t.disposition || '').toUpperCase() === 'ANSWERED' &&
    Number(t.billsec || 0) > 0
  );
  const anyAnswered = Boolean(answeredLeg);

  const firstStepNumber =
    chronologyData?.routeAnalysis?.steps?.[0]?.number ||
    first.cnum ||
    first.src ||
    '—';

  const calledNumber =
    answeredLeg?.dst ||
    first.dst ||
    chronologyData?.routeAnalysis?.steps?.[0]?.destination ||
    '—';

  return (
    <div className="fixed inset-0 bg-slate-950/40 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl relative max-h-[90vh] flex flex-col font-sans overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 bg-slate-50/80">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Route className="h-5 w-5 text-red-600" />
              Таймлайн прохождения звонка
            </h3>
            <span className="text-xs text-slate-500 font-medium font-mono">
              ID: {chronologyCallId}
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors text-base"
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

          {chronologyData?.routeAnalysis && (
            <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-xs">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-blue-500 mb-3">
                Маршрут звонка
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
                        {step.pattern && <span>PATTERN: {step.pattern} · </span>}
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

                <div className={`flex items-start gap-3 p-3 rounded-xl border ${
                  anyAnswered ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
                }`}>
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">
                    {(chronologyData.routeAnalysis.steps?.length || 0) + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-white ${
                        anyAnswered ? 'bg-emerald-600' : 'bg-red-600'
                      }`}>
                        Результат
                      </span>
                      <span className={`text-sm font-black ${anyAnswered ? 'text-emerald-700' : 'text-red-700'}`}>
                        {anyAnswered ? 'Ответил' : 'Не ответил'}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-700">
                      {anyAnswered
                        ? `Номер ${calledNumber} ответил на вызов с внутреннего номера ${firstStepNumber}.`
                        : `Номер ${calledNumber} не ответил на вызов с внутреннего номера ${firstStepNumber}.`
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
