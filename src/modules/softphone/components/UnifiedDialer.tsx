import React, { useEffect, useState } from 'react';
import { Delete, Headphones, Loader2, Phone, PhoneCall, X } from 'lucide-react';

export type CallDeviceMode = 'desk_phone' | 'browser_headset' | 'ask';

interface UnifiedDialerProps {
  extension: string;
  mode: CallDeviceMode;
  canCall: boolean;
  isCalling: boolean;
  headsetReady: boolean;
  onModeChange: (mode: CallDeviceMode) => void;
  onDeskPhoneCall: (number: string) => Promise<void> | void;
  onHeadsetCall: (number: string) => Promise<void> | void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

const normalizeDialInput = (value: string) => {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  return prefix + trimmed.replace(/\D/g, '');
};

export default function UnifiedDialer({ extension, mode, canCall, isCalling, headsetReady, onModeChange, onDeskPhoneCall, onHeadsetCall }: UnifiedDialerProps) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [route, setRoute] = useState<Exclude<CallDeviceMode, 'ask'>>(mode === 'browser_headset' ? 'browser_headset' : 'desk_phone');

  useEffect(() => {
    if (mode !== 'ask') setRoute(mode);
  }, [mode]);

  const cleaned = normalizeDialInput(number);
  const headsetSelected = route === 'browser_headset';
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
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      title="Открыть ручной номеронабиратель"
    >
      <PhoneCall className="h-4 w-4" />
      Набрать
    </button>

    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Номеронабиратель">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-700 bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Номеронабиратель</h3>
            <p className="mt-1 text-[11px] text-slate-500">Внутренний номер: <span className="font-mono font-bold">{extension || 'не задан'}</span></p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['desk_phone', 'Телефон', Phone],
              ['browser_headset', 'Гарнитура', Headphones],
              ['ask', 'Спрашивать', PhoneCall]
            ] as const).map(([value, label, Icon]) => <button
              key={value}
              type="button"
              onClick={() => {
                onModeChange(value);
                if (value !== 'ask') setRoute(value);
              }}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-bold ${mode === value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
            ><Icon className="h-4 w-4" />{label}</button>)}
          </div>

          {mode === 'ask' && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" onClick={() => setRoute('desk_phone')} className={`rounded-lg px-3 py-2 text-xs font-bold ${route === 'desk_phone' ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-500'}`}>Телефон</button>
            <button type="button" onClick={() => setRoute('browser_headset')} className={`rounded-lg px-3 py-2 text-xs font-bold ${route === 'browser_headset' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500'}`}>Гарнитура</button>
          </div>}

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
    </div>}
  </>;
}
