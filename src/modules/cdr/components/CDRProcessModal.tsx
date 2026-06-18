import React from 'react';
import { MessageSquare } from 'lucide-react';

interface Props {
  selectedCall: any;
  commentInput: string;
  isProcessedInput: boolean;
  isSavingProcess: boolean;

  setSelectedCall: (call: any | null) => void;
  setCommentInput: (value: string) => void;
  setIsProcessedInput: (value: boolean) => void;

  handleProcessMissedCall: (e: React.FormEvent) => void;
  triggerClickToCall: (phone: string) => void;
  formatSeconds: (sec: number) => string;
}

export default function CDRProcessModal({
  selectedCall,
  commentInput,
  isProcessedInput,
  isSavingProcess,
  setSelectedCall,
  setCommentInput,
  setIsProcessedInput,
  handleProcessMissedCall,
  triggerClickToCall,
  formatSeconds,
}: Props) {
  if (!selectedCall) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/40  flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto font-sans">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-red-600" />
              Обработка пропущенного вызова
            </h3>
            <p className="text-xs text-slate-500 font-light mt-0.5">
              ID: {selectedCall.uniqueid} / {selectedCall.calldate}
            </p>
            {selectedCall.processedBy && (
              <p className="text-xs text-slate-500 font-light mt-1">
                Автор комментария: <span className="font-semibold text-slate-700">{selectedCall.processedBy}</span>
                {selectedCall.processedAt && (
                  <span> / {new Date(selectedCall.processedAt).toLocaleDateString('ru-RU')}</span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={() => setSelectedCall(null)}
            className="text-slate-400 hover:text-slate-800 p-1 rounded font-sans cursor-pointer text-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleProcessMissedCall} className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4 text-xs space-y-2">
            <div className="grid grid-cols-2">
              <span className="text-slate-500">Клиент / Номер:</span>
              <div className="flex items-center justify-end gap-2">
                <span className="font-semibold text-slate-800 text-right">{selectedCall.src}</span>
                <button
                  type="button"
                  onClick={() => triggerClickToCall(selectedCall.src)}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-semibold cursor-pointer"
                >
                  Позвонить
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2">
              <span className="text-slate-500">Маршрут / Внутренний:</span>
              <span className="font-semibold text-slate-800 text-right">{selectedCall.dst}</span>
            </div>

            {selectedCall.did && (
              <div className="grid grid-cols-2">
                <span className="text-slate-550">DID компании:</span>
                <span className="font-semibold text-slate-800 text-right font-mono">{selectedCall.did}</span>
              </div>
            )}

            <div className="grid grid-cols-2">
              <span className="text-slate-500">Длительность звонка:</span>
              <span className="font-semibold text-slate-800 text-right font-mono">
                {formatSeconds(selectedCall.duration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              id="is-processed-checkbox"
              checked={isProcessedInput}
              onChange={(e) => setIsProcessedInput(e.target.checked)}
              className="h-4.5 w-4.5 rounded text-red-600 accent-red-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="is-processed-checkbox" className="text-xs text-slate-700 select-none cursor-pointer font-semibold">
              Отметить звонок как отработанный / решенный
            </label>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5 font-sans">
              Комментарий к звонку
            </label>
            <textarea
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Опишите результат отзвона клиенту или почему звонок не требует отработки..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 h-24 focus:ring-1 focus:ring-red-500 font-sans focus:outline-none focus:bg-white resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSelectedCall(null)}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSavingProcess}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {isSavingProcess ? 'Сохранение...' : 'Сохранить результат'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
