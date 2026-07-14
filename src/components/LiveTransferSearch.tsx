import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, PhoneForwarded, Search, X } from 'lucide-react';
import { getLiveTransferPresenceLabel, type LiveTransferPresence } from './liveTransferPresence';

export type LiveTransferTargetType = 'internal' | 'directory_phone';

export interface LiveTransferSearchTarget {
  id: string;
  label: string;
  displayName: string;
  displayNumber: string;
  targetNumber: string;
  targetType: LiveTransferTargetType;
  numberLabel: string;
  extension: string;
  name: string;
  company: string;
  phone: string;
  phone2: string;
  extraPhone: string;
  department: string;
  position: string;
  comment: string;
  metadataMatches: string[];
  canTransfer: boolean;
  transferDisabledReason: string;
  sipStatus: LiveTransferPresence;
  deviceStatus: LiveTransferPresence;
  deviceType: string;
  source: string;
}

export interface LiveTransferResult {
  success: boolean;
  error?: string;
  targetLabel?: string;
}

interface Props {
  token: string;
  currentExtension: string;
  disabled?: boolean;
  buttonClassName: string;
  onUnauthorized?: (response: Response) => void;
  onTransfer: (target: LiveTransferSearchTarget) => Promise<LiveTransferResult>;
}

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const isInternalExtension = (value: unknown): boolean => {
  return /^\d{2,5}$/.test(String(value ?? '').trim());
};

const presenceClasses: Record<LiveTransferPresence, string> = {
  online: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  offline: 'border-slate-200 bg-slate-50 text-slate-500',
  busy: 'border-amber-200 bg-amber-50 text-amber-700',
  unavailable: 'border-red-200 bg-red-50 text-red-700',
  ringing: 'border-blue-200 bg-blue-50 text-blue-700',
  unknown: 'border-slate-200 bg-white text-slate-400'
};

export function LiveTransferSearch({
  token,
  currentExtension,
  disabled = false,
  buttonClassName,
  onUnauthorized,
  onTransfer
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<LiveTransferSearchTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [directoryAvailable, setDirectoryAvailable] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<LiveTransferSearchTarget | null>(null);
  const [transferError, setTransferError] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const current = digits(currentExtension);
  const manualExtension = digits(query);
  const canUseManual = isInternalExtension(query) && manualExtension !== current
    && !targets.some(target => target.targetType === 'internal' && target.targetNumber === manualExtension);
  const selectableIndexes = useMemo(() => [
    ...targets.map((target, index) => target.canTransfer ? index : -1).filter(index => index >= 0),
    ...(canUseManual ? [targets.length] : [])
  ], [targets, canUseManual]);

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handleOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const updatePosition = () => {
      const popup = rootRef.current?.closest('[data-live-call-popup]') as HTMLElement | null;
      if (popup) {
        const rect = popup.getBoundingClientRect();
        const viewportPadding = 16;
        const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - viewportPadding));
        const width = Math.min(rect.width, window.innerWidth - left - viewportPadding);
        const top = rect.bottom + 10;
        const maxHeight = Math.max(0, window.innerHeight - top - 12);
        setPanelStyle(previous => previous.left === left
          && previous.top === top
          && previous.width === width
          && previous.maxHeight === maxHeight
          ? previous
          : { left, top, width, maxHeight });
      }
      frame = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || selected || successMessage) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          limit: '50',
          excludeExtension: current
        });
        const response = await fetch(`/api/directory/extensions/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal
        });
        if (response.status === 401) {
          onUnauthorizedRef.current?.(response);
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Поиск временно недоступен');
        setDirectoryAvailable(data.directoryAvailable !== false);
        const receivedTargets = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
        setTargets(receivedTargets);
        const firstTransferableIndex = receivedTargets.findIndex((target: LiveTransferSearchTarget) => target.canTransfer === true);
        setActiveIndex(firstTransferableIndex >= 0 ? firstTransferableIndex : 0);
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setTargets([]);
        setDirectoryAvailable(false);
        setSearchError(error?.message || 'Поиск временно недоступен');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, selected, successMessage, current, token]);

  const selectableCount = selectableIndexes.length;
  const selectedStatus = useMemo(() => {
    if (!selected) return 'unknown' as LiveTransferPresence;
    return selected.sipStatus !== 'unknown' ? selected.sipStatus : selected.deviceStatus;
  }, [selected]);

  const resetAndClose = () => {
    setOpen(false);
    setQuery('');
    setTargets([]);
    setSelected(null);
    setSearchError('');
    setTransferError('');
    setSuccessMessage('');
  };

  const selectManual = () => {
    if (!canUseManual) return;
    setSelected({
      id: `manual-${manualExtension}`,
      label: 'Внутренний номер',
      displayName: 'Внутренний номер',
      displayNumber: manualExtension,
      targetNumber: manualExtension,
      targetType: 'internal',
      numberLabel: 'Внутренний номер',
      extension: manualExtension,
      name: 'Внутренний номер',
      department: '',
      position: '',
      comment: '',
      company: '',
      phone: '',
      phone2: '',
      extraPhone: '',
      metadataMatches: [],
      canTransfer: true,
      transferDisabledReason: '',
      sipStatus: 'unknown',
      deviceStatus: 'unknown',
      deviceType: '',
      source: 'manual'
    });
    setTransferError('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      resetAndClose();
      return;
    }
    if (event.key === 'ArrowDown' && selectableCount) {
      event.preventDefault();
      setActiveIndex(index => {
        const currentPosition = selectableIndexes.indexOf(index);
        return selectableIndexes[(currentPosition + 1 + selectableCount) % selectableCount];
      });
      return;
    }
    if (event.key === 'ArrowUp' && selectableCount) {
      event.preventDefault();
      setActiveIndex(index => {
        const currentPosition = selectableIndexes.indexOf(index);
        return selectableIndexes[(currentPosition - 1 + selectableCount) % selectableCount];
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex < targets.length && targets[activeIndex]?.canTransfer) {
        setSelected(targets[activeIndex]);
        setTransferError('');
      } else {
        selectManual();
      }
    }
  };

  const confirmTransfer = async () => {
    const validInternal = selected?.targetType === 'internal' && isInternalExtension(selected.targetNumber);
    const validDirectoryPhone = selected?.targetType === 'directory_phone' && /^\d{6,15}$/.test(selected.targetNumber);
    if (!selected || !selected.canTransfer || (!validInternal && !validDirectoryPhone) || transferring) return;
    setTransferring(true);
    setTransferError('');
    const result = await onTransfer(selected);
    setTransferring(false);
    if (!result.success) {
      setTransferError(result.error || 'Не удалось выполнить переадресацию');
      return;
    }
    const label = result.targetLabel || selected.displayName;
    setSuccessMessage(`Переадресовано на ${selected.targetNumber}${label ? ` — ${label}` : ''}`);
    setSelected(null);
    closeTimerRef.current = window.setTimeout(resetAndClose, 1400);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        className={buttonClassName}
        title="Переадресовать звонок"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <PhoneForwarded className="h-4 w-4" />
      </button>

      {open && (
        <div
          style={panelStyle}
          className="fixed z-[80] flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div>
              <div className="text-xs font-black text-slate-900">Переадресовать звонок</div>
              <div className="text-[10px] font-semibold text-slate-400">Поиск по всем данным справочника</div>
            </div>
            <button type="button" onClick={resetAndClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Закрыть">
              <X className="h-4 w-4" />
            </button>
          </div>

          {successMessage ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm font-bold text-emerald-700">
              <Check className="h-5 w-5" />
              {successMessage}
            </div>
          ) : selected ? (
            <div className="space-y-3 p-4">
              <div className="text-sm font-bold text-slate-900">
                {selected.targetType === 'internal' ? 'Переадресовать звонок на внутренний ' : 'Переадресовать звонок на номер из справочника '}
                <span className="font-mono text-blue-700">{selected.targetNumber}</span> — {selected.displayName}?
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 font-bold text-blue-700">
                  {selected.targetType === 'internal' ? 'Внутренний' : 'Номер из справочника'}
                </span>
                {(selected.company || selected.department || selected.position) && <span>{[selected.company, selected.department, selected.position].filter(Boolean).join(' · ')}</span>}
                {getLiveTransferPresenceLabel(selectedStatus) && (
                  <span className={`rounded-full border px-2 py-0.5 font-bold ${presenceClasses[selectedStatus]}`}>{getLiveTransferPresenceLabel(selectedStatus)}</span>
                )}
              </div>
              {transferError && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-2">
                  <div className="text-xs font-bold text-red-700">Не удалось выполнить переадресацию</div>
                  <div className="mt-0.5 text-[10px] text-red-500">{transferError}</div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={transferring} onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Отмена</button>
                <button type="button" disabled={transferring} onClick={confirmTransfer} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                  {transferring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Переадресовать
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={event => {
                      setQuery(event.target.value);
                      setTargets([]);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="ФИО, компания, телефон, отдел…"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    role="combobox"
                    aria-expanded="true"
                    aria-autocomplete="list"
                  />
                  {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 p-2" role="listbox">
                {loading && !targets.length ? (
                  <div className="px-3 py-6 text-center text-xs font-semibold text-slate-400">Поиск…</div>
                ) : targets.length || canUseManual ? (
                  <>
                    {targets.map((target, index) => {
                      const status = target.sipStatus !== 'unknown' ? target.sipStatus : target.deviceStatus;
                      const statusLabel = getLiveTransferPresenceLabel(status);
                      return (
                        <button
                          key={`${target.id}-${target.targetType}-${target.targetNumber || index}`}
                          type="button"
                          role="option"
                          disabled={!target.canTransfer}
                          aria-disabled={!target.canTransfer}
                          aria-selected={index === activeIndex}
                          onMouseEnter={() => { if (target.canTransfer) setActiveIndex(index); }}
                          onClick={() => { if (target.canTransfer) { setSelected(target); setTransferError(''); } }}
                          className={`mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition last:mb-0 ${!target.canTransfer ? 'cursor-not-allowed bg-slate-50 opacity-70' : index === activeIndex ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'}`}
                        >
                          <span className={`w-32 shrink-0 font-mono text-sm font-black ${target.canTransfer ? 'text-blue-700' : 'text-slate-400'}`}>{target.displayNumber || '—'}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black text-slate-900">{target.displayName}</span>
                            <span className="mt-0.5 block truncate text-[10px] font-bold text-blue-600">
                              {target.targetType === 'internal' ? 'Внутренний' : 'Номер из справочника'} · {target.numberLabel}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{[target.company, target.department, target.position].filter(Boolean).join(' · ') || target.comment || 'Контакт справочника'}</span>
                            {!target.canTransfer && <span className="mt-1 block text-[10px] font-bold text-amber-700">{target.transferDisabledReason || 'Нет внутреннего номера для переадресации'}</span>}
                            {target.deviceType && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{target.deviceType}</span>}
                          </span>
                          {statusLabel && <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${presenceClasses[status]}`}>{statusLabel}</span>}
                        </button>
                      );
                    })}
                    {canUseManual && (
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === targets.length}
                        onMouseEnter={() => setActiveIndex(targets.length)}
                        onClick={selectManual}
                        className={`flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-left ${activeIndex === targets.length ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <span className="text-xs font-bold text-slate-600">Введите номер вручную</span>
                        <span className="font-mono text-base font-black text-blue-700">{manualExtension}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-5 text-center">
                    <div className="text-xs font-bold text-slate-500">Ничего не найдено</div>
                    <div className="mt-1 text-[10px] text-slate-400">Внешний номер можно выбрать только из справочника</div>
                  </div>
                )}
              </div>

              {(searchError || !directoryAvailable) && (
                <div className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
                  Справочник недоступен. Можно ввести внутренний номер вручную.
                  {searchError && <span className="mt-0.5 block text-amber-500">{searchError}</span>}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-[9px] font-semibold text-slate-400">
                <span>↑↓ выбрать · Enter подтвердить · Esc закрыть</span>
                <ChevronDown className="h-3 w-3" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
