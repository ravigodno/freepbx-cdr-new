import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, PhoneForwarded, Search, X } from 'lucide-react';

export type LiveTransferPresence = 'online' | 'offline' | 'busy' | 'unknown';

export interface LiveTransferSearchTarget {
  id: string;
  extension: string;
  name: string;
  department: string;
  position: string;
  comment: string;
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

const presenceLabels: Record<LiveTransferPresence, string> = {
  online: 'online',
  offline: 'offline',
  busy: 'busy',
  unknown: 'unknown'
};

const presenceClasses: Record<LiveTransferPresence, string> = {
  online: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  offline: 'border-slate-200 bg-slate-50 text-slate-500',
  busy: 'border-amber-200 bg-amber-50 text-amber-700',
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

  const current = digits(currentExtension);
  const manualExtension = digits(query);
  const canUseManual = isInternalExtension(query) && manualExtension !== current && !targets.some(target => target.extension === manualExtension);

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
        setTargets(Array.isArray(data.items) ? data.items.slice(0, 50) : []);
        setDirectoryAvailable(data.directoryAvailable !== false);
        setActiveIndex(0);
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

  const selectableCount = targets.length + (canUseManual ? 1 : 0);
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
      extension: manualExtension,
      name: 'Внутренний номер',
      department: '',
      position: '',
      comment: '',
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
      setActiveIndex(index => (index + 1) % selectableCount);
      return;
    }
    if (event.key === 'ArrowUp' && selectableCount) {
      event.preventDefault();
      setActiveIndex(index => (index - 1 + selectableCount) % selectableCount);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex < targets.length && targets[activeIndex]) {
        setSelected(targets[activeIndex]);
        setTransferError('');
      } else {
        selectManual();
      }
    }
  };

  const confirmTransfer = async () => {
    if (!selected || transferring) return;
    setTransferring(true);
    setTransferError('');
    const result = await onTransfer(selected);
    setTransferring(false);
    if (!result.success) {
      setTransferError(result.error || 'Не удалось выполнить переадресацию');
      return;
    }
    const label = result.targetLabel || selected.name;
    setSuccessMessage(`Переадресовано на ${selected.extension}${label ? ` ${label}` : ''}`);
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
        <div className="absolute left-10 top-0 z-[80] w-[min(25rem,calc(100vw-4rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div>
              <div className="text-xs font-black text-slate-900">Переадресовать звонок</div>
              <div className="text-[10px] font-semibold text-slate-400">Поиск по номеру, ФИО, отделу или должности</div>
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
                Переадресовать звонок на <span className="font-mono text-blue-700">{selected.extension}</span> — {selected.name}?
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                {(selected.department || selected.position) && <span>{[selected.department, selected.position].filter(Boolean).join(' · ')}</span>}
                <span className={`rounded-full border px-2 py-0.5 font-bold ${presenceClasses[selectedStatus]}`}>{presenceLabels[selectedStatus]}</span>
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
                    placeholder="Номер, ФИО, отдел, должность…"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    role="combobox"
                    aria-expanded="true"
                    aria-autocomplete="list"
                  />
                  {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border-t border-slate-100 p-2" role="listbox">
                {loading && !targets.length ? (
                  <div className="px-3 py-6 text-center text-xs font-semibold text-slate-400">Поиск…</div>
                ) : targets.length || canUseManual ? (
                  <>
                    {targets.map((target, index) => {
                      const status = target.sipStatus !== 'unknown' ? target.sipStatus : target.deviceStatus;
                      return (
                        <button
                          key={`${target.id}-${target.extension}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => { setSelected(target); setTransferError(''); }}
                          className={`mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition last:mb-0 ${index === activeIndex ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'}`}
                        >
                          <span className="w-16 shrink-0 font-mono text-base font-black text-blue-700">{target.extension}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black text-slate-900">{target.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{[target.department, target.position].filter(Boolean).join(' · ') || target.comment || 'Внутренний сотрудник'}</span>
                            {target.deviceType && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{target.deviceType}</span>}
                          </span>
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${presenceClasses[status]}`}>{presenceLabels[status]}</span>
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
                    <div className="mt-1 text-[10px] text-slate-400">Введите внутренний номер вручную</div>
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
