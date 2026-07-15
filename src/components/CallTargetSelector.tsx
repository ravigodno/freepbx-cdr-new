import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, Loader2, PhoneForwarded, Search, Star, Users, X } from 'lucide-react';
import { callTargetColumnLabels, defaultCallTargetColumns, getCallTargetCellValue, LiveTransferSearch, type LiveTransferResult, type LiveTransferSearchTarget } from './LiveTransferSearch';
import { addCallTarget, callTargetKey, removeCallTarget, type CallTargetSelectorMode } from './callTargetSelection';

export interface ConferenceBackendStatus {
  conferenceAvailable: boolean;
  meetingAvailable: boolean;
  conferenceFromCallAvailable: boolean;
  mechanism: 'confbridge' | 'meetme' | 'ami-originate' | 'unavailable';
  reason: string;
  meetingReason: string;
  checked: Array<{ name: string; available: boolean; detail: string }>;
}

export interface ConsultTransferCapabilities {
  available: boolean;
  mechanism: 'ami-atxfer' | 'hold-originate-redirect' | 'unavailable';
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
  consultStatus?: ConsultTransferCapabilities | null;
  initialTargets?: LiveTransferSearchTarget[];
  directoryVisibleColumns?: string[];
  onUnauthorized?: (response: Response) => void;
  onTransfer?: (target: LiveTransferSearchTarget) => Promise<LiveTransferResult>;
  onConfirm?: (targets: LiveTransferSearchTarget[]) => void | string | Promise<void | string>;
}

const EMPTY_CALL_TARGETS: LiveTransferSearchTarget[] = [];

export function CallTargetSelector(props: Props) {
  if (props.mode === 'transfer') {
    if (!props.onTransfer) return null;
    return <LiveTransferSearch {...props} currentExtension={props.currentExtension || ''} onTransfer={props.onTransfer} directoryVisibleColumns={props.directoryVisibleColumns} />;
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
  consultStatus,
  initialTargets = EMPTY_CALL_TARGETS,
  directoryVisibleColumns = defaultCallTargetColumns,
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
  const [actionMessage, setActionMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useEffect(() => setSelected(initialTargets), [initialTargets]);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      const popup = rootRef.current?.closest('[data-live-call-popup]') as HTMLElement | null;
      const anchor = popup || rootRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - 332));
      const width = popup ? Math.min(rect.width, window.innerWidth - left - 12) : Math.min(520, window.innerWidth - left - 12);
      const top = rect.bottom + 10;
      const maxHeight = Math.max(120, window.innerHeight - rect.bottom - 22);
      setPanelStyle(previous => previous.left === left
        && previous.top === top
        && previous.width === width
        && previous.maxHeight === maxHeight
        ? previous
        : { left, top, width, maxHeight });
      if (popup) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
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
  const isConsult = mode === 'consult';
  const title = isConsult
    ? 'Спросить перед переадресацией'
    : mode === 'conference' ? 'Добавить участников в конференцию' : 'Телефонное совещание';
  const operationAvailable = isConsult
    ? consultStatus?.available === true
    : mode === 'meeting' ? backendStatus?.meetingAvailable === true : backendStatus?.conferenceAvailable === true;
  const unavailableReason = isConsult
    ? consultStatus?.reason
    : mode === 'meeting' ? backendStatus?.meetingReason : backendStatus?.reason;
  const confirm = async () => {
    if (!onConfirm || actionLoading) return;
    setActionLoading(true);
    setError('');
    try {
      const message = await onConfirm(selected);
      if (message) setActionMessage(message);
    } catch (actionError: any) {
      setError(actionError?.message || 'Не удалось выполнить действие');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onMouseDown={event => event.stopPropagation()}>
      <button type="button" disabled={disabled} onClick={() => setOpen(value => !value)} className={buttonClassName} title={title} aria-expanded={open}>
        {isConsult ? <HelpCircle className="h-4 w-4" /> : <Users className="h-4 w-4" />}{triggerLabel && <span>{triggerLabel}</span>}
      </button>
      {open && (
        <div style={panelStyle} className="fixed z-[80] flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div>
              <div className="text-xs font-black text-slate-900">{title}</div>
              <div className="text-[10px] text-slate-400">{isConsult ? 'Выберите одного сотрудника или номер справочника' : mode === 'meeting' ? `Инициатор: Мой SIP / внутренний ${currentExtension || 'не настроен'}` : 'Выберите несколько целей из общего справочника'}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          {actionMessage ? (
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-relaxed text-emerald-800">{actionMessage}</div>
              <div className="flex justify-end"><button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Закрыть</button></div>
            </div>
          ) : <>
          {selected.length > 0 && <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-3">{selected.map(target => (
            <span key={callTargetKey(target)} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
              {target.displayName} · {target.targetNumber}
              <button type="button" onClick={() => setSelected(removeCallTarget(selected, target))}><X className="h-3 w-3" /></button>
            </span>
          ))}</div>}
          {!operationAvailable && <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">{unavailableReason || `Проверка backend ${isConsult ? 'консультационной переадресации' : 'конференций'} ещё не завершена`}</div>}
          {mode === 'conference' && operationAvailable && <div className="mx-3 mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-800">ConfBridge готов. Выберите участников и нажмите «Создать конференцию».</div>}
          <div className="relative px-3 pb-3"><Search className="absolute left-6 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ФИО, компания, телефон, отдел…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-8 text-sm outline-none focus:border-blue-400" />{loading && <Loader2 className="absolute right-6 top-2.5 h-4 w-4 animate-spin text-blue-500" />}</div>
          <div className="min-h-0 flex-1 overflow-auto border-t border-slate-100">
            {!!targets.length && <div className="min-w-max">
              <div className="sticky top-0 z-10 grid bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 shadow-sm" style={{ gridTemplateColumns: `repeat(${directoryVisibleColumns.length}, minmax(140px, 1fr))` }}>
                {directoryVisibleColumns.map(column => <div key={column} className="border-r border-slate-200 px-3 py-2">{callTargetColumnLabels[column] || column}</div>)}
              </div>
            {targets.map(target => {
              const unavailable = (isConsult ? !target.canTransfer : !target.canConference)
                || (mode !== 'meeting' && target.targetType === 'internal' && target.targetNumber === currentExtension);
              return <button key={`${target.id}:${target.targetType}:${target.targetNumber}`} type="button" disabled={unavailable} onClick={() => choose(target)} className="grid w-full border-b border-slate-100 text-left text-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50" style={{ gridTemplateColumns: `repeat(${directoryVisibleColumns.length}, minmax(140px, 1fr))` }}>
                {directoryVisibleColumns.map(column => <span key={column} className={`flex min-w-0 items-center gap-1 border-r border-slate-100 px-3 py-2 ${column === 'phone' ? 'font-mono font-bold text-blue-700' : 'text-slate-700'}`} title={String(getCallTargetCellValue(target, column))}>{column === 'fullName' && target.isFavorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}<span className="truncate">{getCallTargetCellValue(target, column)}</span></span>)}
              </button>;
            })}
            </div>}
            {!loading && !targets.length && <div className="p-5 text-center text-xs text-slate-400">Ничего не найдено</div>}
          </div>
          {error && <div className="px-3 pb-2 text-[11px] font-semibold text-red-600">{error}</div>}
          {isConsult && selected[0] && <div className="border-t border-slate-100 px-3 pt-3 text-xs font-bold text-slate-800">Спросить у <span className="font-mono text-blue-700">{selected[0].targetNumber}</span> — {selected[0].displayName}?</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 p-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Отмена</button>
            <button type="button" disabled={!selected.length || !operationAvailable || actionLoading} onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); void confirm(); }} title={!operationAvailable ? unavailableReason : ''} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneForwarded className="h-3.5 w-3.5" />}{isConsult ? 'Позвонить и поставить клиента на удержание' : mode === 'conference' ? 'Создать конференцию' : 'Создать совещание'}</button>
          </div>
          </>}
        </div>
      )}
    </div>
  );
}
