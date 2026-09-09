import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Headphones, Loader2, Phone, X } from 'lucide-react';

export type CallDeviceMode = 'desk_phone' | 'browser_headset';

interface UnifiedDialerProps {
  sidebarExpanded?: boolean;
  extension: string;
  mode: CallDeviceMode;
  canCall: boolean;
  isCalling: boolean;
  headsetReady: boolean;
  onDeskPhoneCall: (number: string) => Promise<void> | void;
  onHeadsetCall: (number: string) => Promise<void> | void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

const normalizeDialInput = (value: string) => {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  return prefix + trimmed.replace(/\D/g, '');
};

export default function UnifiedDialer({ sidebarExpanded, extension, mode, canCall, isCalling, headsetReady, onDeskPhoneCall, onHeadsetCall }: UnifiedDialerProps) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKeyDown = (event:KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [open]);

  const cleaned = normalizeDialInput(number);
  const headsetSelected = mode === 'browser_headset';
  const callDisabled = !canCall || !extension || !cleaned || isCalling || (headsetSelected && !headsetReady);

  const startCall = async () => {
    if (callDisabled) return;
    await (headsetSelected ? onHeadsetCall(cleaned) : onDeskPhoneCall(cleaned));
  };

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      disabled={!canCall}
      className={typeof sidebarExpanded === 'boolean'
        ? `flex items-center ${sidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50`
        : 'inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'}
      aria-label="Телефон"
      data-unsaved-ignore
      title="Открыть телефон"
    >
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="5" height="18" rx="2" />
        <path d="M8 5h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6" />
        <path d="M12 8h5v3h-5zM12 15h.01M17 15h.01M12 18h.01M17 18h.01" />
      </svg>
      {sidebarExpanded !== false && <span className="text-xs font-semibold truncate">{sidebarExpanded === undefined ? 'Набрать' : 'Телефон'}</span>}
    </button>

    {open && createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Телефон">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-700 bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Телефон</h3>
            <p className="mt-1 text-[11px] text-slate-500">Внутренний номер: <span className="font-mono font-bold">{extension || 'не задан'}</span></p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={number}
              onChange={event => setNumber(normalizeDialInput(event.target.value).slice(0, 32))}
              onKeyDown={event => { if (event.key === 'Enter') void startCall(); }}
              inputMode="tel"
              placeholder="Введите номер"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-center font-mono text-xl font-bold tracking-wide text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button type="button" onClick={() => setNumber(value => value.slice(0, -1))} className="rounded-xl border border-slate-200 p-3 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Удалить цифру"><Delete className="h-5 w-5" /></button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map(key => <button key={key} type="button" onClick={() => setNumber(value => `${value}${key}`.slice(0, 32))} className="rounded-xl border border-slate-200 bg-slate-50 py-3 font-mono text-lg font-black text-slate-800 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">{key}</button>)}
          </div>

          {headsetSelected && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {headsetReady ? 'Гарнитура зарегистрирована на АТС и готова к звонку.' : 'Гарнитура выбрана, но WebRTC-профиль не подключён. PBXPuls не переключит вызов на телефон без вашего подтверждения.'}
          </div>}
          {!extension && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">Назначьте пользователю внутренний SIP-номер.</div>}

          <button type="button" onClick={() => void startCall()} disabled={callDisabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">
            {isCalling ? <Loader2 className="h-5 w-5 animate-spin" /> : headsetSelected ? <Headphones className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            {headsetSelected ? (headsetReady ? 'Позвонить через гарнитуру' : 'WebRTC пока недоступен') : 'Позвонить через телефон'}
          </button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
