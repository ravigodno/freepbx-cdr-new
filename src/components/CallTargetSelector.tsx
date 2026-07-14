import React, { useEffect, useRef, useState } from 'react';
import { Loader2, PhoneForwarded, Search, Users, X } from 'lucide-react';
import { LiveTransferSearch, type LiveTransferResult, type LiveTransferSearchTarget } from './LiveTransferSearch';
import { addCallTarget, callTargetKey, removeCallTarget, type CallTargetSelectorMode } from './callTargetSelection';

export interface ConferenceBackendStatus {
  conferenceAvailable: boolean;
  mechanism: 'confbridge' | 'meetme' | 'ami-originate' | 'unavailable';
  reason: string;
  checked: Array<{ name: string; available: boolean; detail: string }>;
}

interface Props {
  mode: CallTargetSelectorMode;
  token: string;
  currentExtension?: string;
  disabled?: boolean;
  buttonClassName: string;
  triggerLabel?: string;
  backendStatus?: ConferenceBackendStatus | null;
  initialTargets?: LiveTransferSearchTarget[];
  onUnauthorized?: (response: Response) => void;
  onTransfer?: (target: LiveTransferSearchTarget) => Promise<LiveTransferResult>;
  onConfirm?: (targets: LiveTransferSearchTarget[]) => void;
}

export function CallTargetSelector(props: Props) {
  if (props.mode === 'transfer') {
    if (!props.onTransfer) return null;
    return <LiveTransferSearch {...props} currentExtension={props.currentExtension || ''} onTransfer={props.onTransfer} />;
  }
  return <MultiCallTargetSelector {...props} />;
}

function MultiCallTargetSelector({
  mode,
  token,
  currentExtension = '',
  disabled = false,
  buttonClassName,
  triggerLabel,
  backendStatus,
  initialTargets = [],
  onUnauthorized,
  onConfirm
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<LiveTransferSearchTarget[]>([]);
  const [selected, setSelected] = useState<LiveTransferSearchTarget[]>(initialTargets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useEffect(() => setSelected(initialTargets), [initialTargets]);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const popup = rootRef.current?.closest('[data-live-call-popup]') as HTMLElement | null;
      const anchor = popup || rootRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - 332));
      const width = popup ? Math.min(rect.width, window.innerWidth - left - 12) : Math.min(520, window.innerWidth - left - 12);
      setPanelStyle({ left, top: rect.bottom + 10, width, maxHeight: Math.max(120, window.innerHeight - rect.bottom - 22) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: '50', excludeExtension: currentExtension });
        const response = await fetch(`/api/directory/extensions/search?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal
        });
        if (response.status === 401) onUnauthorized?.(response);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Поиск временно недоступен');
        setTargets(Array.isArray(data.items) ? data.items : []);
      } catch (requestError: any) {
        if (requestError?.name !== 'AbortError') setError(requestError?.message || 'Поиск временно недоступен');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, currentExtension, token, onUnauthorized]);

  const choose = (target: LiveTransferSearchTarget) => {
    const result = addCallTarget(mode, selected, target, currentExtension);
    setSelected(result.selected);
    setError(result.error);
  };
  const title = mode === 'conference' ? 'Добавить участников в конференцию' : 'Новое телефонное совещание';

  return (
    <div ref={rootRef} className="relative" onMouseDown={event => event.stopPropagation()}>
      <button type="button" disabled={disabled} onClick={() => setOpen(value => !value)} className={buttonClassName} title={title} aria-expanded={open}>
        <Users className="h-4 w-4" />{triggerLabel && <span>{triggerLabel}</span>}
      </button>
      {open && (
        <div style={panelStyle} className="fixed z-[80] flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div><div className="text-xs font-black text-slate-900">{title}</div><div className="text-[10px] text-slate-400">Выберите несколько целей из общего справочника</div></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          {selected.length > 0 && <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-3">{selected.map(target => (
            <span key={callTargetKey(target)} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
              {target.displayName} · {target.targetNumber}
              <button type="button" onClick={() => setSelected(removeCallTarget(selected, target))}><X className="h-3 w-3" /></button>
            </span>
          ))}</div>}
          {!backendStatus?.conferenceAvailable && <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">{backendStatus?.reason || 'Проверка backend конференций ещё не завершена'}</div>}
          <div className="relative px-3 pb-3"><Search className="absolute left-6 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ФИО, компания, телефон, отдел…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-8 text-sm outline-none focus:border-blue-400" />{loading && <Loader2 className="absolute right-6 top-2.5 h-4 w-4 animate-spin text-blue-500" />}</div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 p-2">
            {targets.map(target => {
              const unavailable = !target.canConference || (mode === 'conference' && target.targetType === 'internal' && target.targetNumber === currentExtension);
              return <button key={`${target.id}:${target.targetType}:${target.targetNumber}`} type="button" disabled={unavailable} onClick={() => choose(target)} className="mb-1 flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                <span><span className="block text-xs font-bold text-slate-900">{target.displayName}</span><span className="text-[11px] text-slate-500">{target.numberLabel} · {target.displayNumber || 'без номера'}{target.company ? ` · ${target.company}` : ''}</span></span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{target.targetType === 'internal' ? 'Внутренний' : 'Справочник'}</span>
              </button>;
            })}
            {!loading && !targets.length && <div className="p-5 text-center text-xs text-slate-400">Ничего не найдено</div>}
          </div>
          {error && <div className="px-3 pb-2 text-[11px] font-semibold text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 p-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Отмена</button>
            <button type="button" disabled={!selected.length || !backendStatus?.conferenceAvailable} onClick={() => onConfirm?.(selected)} title={!backendStatus?.conferenceAvailable ? backendStatus?.reason : ''} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><PhoneForwarded className="h-3.5 w-3.5" />{mode === 'conference' ? 'Создать конференцию' : 'Создать совещание'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
