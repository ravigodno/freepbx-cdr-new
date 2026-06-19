import React from 'react';
import { buildCallRouteView } from '../utils/buildCallRouteView';
import CallRouteViewer from './route/CallRouteViewer';
import { AlertCircle, Loader2, Route } from 'lucide-react';

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

  const { routeSteps, resultText, anyAnswered } = buildCallRouteView(chronologyData);

  return (
    <div className="fixed inset-0 bg-slate-950/40 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl relative max-h-[90vh] flex flex-col font-sans overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 bg-slate-50/80">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Route className="h-5 w-5 text-red-600" />
              Таймлайн прохождения звонка
            </h3>
            <span className="text-xs text-slate-500 font-medium font-mono">ID: {chronologyCallId}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors text-base">✕</button>
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
                <button onClick={() => fetchChronology(chronologyCallId)} className="mt-3 text-[11px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer">
                  Попробовать снова
                </button>
              </div>
            </div>
          )}

          {chronologyData && (
            <CallRouteViewer
              routeSteps={routeSteps}
              anyAnswered={anyAnswered}
              resultText={resultText}
            />
          )}
        </div>

        <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer shadow-sm active:scale-95 transition-transform">
            Закрыть окно
          </button>
        </div>
      </div>
    </div>
  );
}
