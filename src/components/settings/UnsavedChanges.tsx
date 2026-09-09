import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Source = {
  label: string;
  dirty: boolean;
  busy?: boolean;
  save: () => Promise<boolean | 'stay'>;
  discard: () => void;
};
type SourceRef = { current: Source };
const Context = createContext({
  register: (_source: SourceRef): (() => void) => () => {},
  requestNavigation: (action: () => void) => action(),
  hasChanges: (): boolean => false,
  saveChanges: async (): Promise<boolean> => true,
});

// Compare editable snapshots independently of object-key order. Values never leave memory.
export function draftFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

export function useUnsavedSource(source: Source) {
  const context = useContext(Context);
  const latest = useRef(source);
  latest.current = source;
  useLayoutEffect(() => context.register(latest), [context]);
}

export const useUnsavedChanges = () => useContext(Context);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const sources = useRef(new Set<SourceRef>());
  const pending = useRef<(() => void) | null>(null);
  const bypass = useRef(false);
  const manualSave = useRef(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const activeSources = () => [...sources.current].map(source => source.current).filter(source => source.dirty || source.busy);
  const api = useMemo(() => ({
    register(source: SourceRef) {
      sources.current.add(source);
      return () => { sources.current.delete(source); };
    },
    hasChanges: () => activeSources().length > 0,
    async saveChanges() {
      if (manualSave.current || activeSources().some(source => source.busy)) return false;
      manualSave.current = true;
      try {
        for (const source of activeSources()) {
          const result = await source.save();
          if (!result) return false;
          if (result === 'stay') return true;
        }
        return true;
      } finally { manualSave.current = false; }
    },
    requestNavigation(action: () => void) {
      if (!activeSources().length) { action(); return; }
      if (pending.current) return;
      pending.current = action;
      setError('');
      setOpen(true);
    },
  }), []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!bypass.current && api.hasChanges()) { event.preventDefault(); event.returnValue = ''; }
    };
    // Intercept the whole navigation action before its handler can reset a draft or change the URL.
    const navigationClick = (event: MouseEvent) => {
      if (bypass.current || !api.hasChanges() || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>('button, a');
      if (!target || !target.closest('[data-unsaved-navigation]') || target.closest('[data-unsaved-ignore]')) return;
      event.preventDefault();
      event.stopPropagation();
      api.requestNavigation(() => {
        bypass.current = true;
        try { if (target.isConnected) target.click(); } finally { bypass.current = false; }
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigationClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigationClick, true);
    };
  }, [api]);

  const stay = () => { pending.current = null; setOpen(false); setError(''); };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('[data-stay]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!saving) stay(); }
      if (event.key === 'Tab') {
        const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open, saving]);

  const finish = () => { const action = pending.current; stay(); action?.(); };
  const resolve = async (save: boolean) => {
    if (saving) return;
    if (activeSources().some(source => source.busy)) { setError('Дождитесь завершения текущего сохранения.'); return; }
    setSaving(true); setError('');
    try {
      for (const source of activeSources()) {
        if (save) {
          const result = await source.save();
          if (result === 'stay') { stay(); return; }
          if (!result) { setError(`Не удалось сохранить: ${source.label}. Проверьте поля и повторите попытку.`); return; }
        } else source.discard();
      }
      // Clear the synchronous unload guard before replaying navigation (React updates are batched).
      for (const source of sources.current) source.current = { ...source.current, dirty: false, busy: false };
      finish();
    } catch {
      setError('Не удалось сохранить изменения. Вы остались на странице, введённые данные сохранены в форме.');
    } finally { setSaving(false); }
  };

  return <Context.Provider value={api}>
    {children}
    {open && createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-description" aria-busy={saving} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <h3 id="unsaved-title" className="text-base font-bold">Сохранить изменения?</h3>
        <p id="unsaved-description" className="mt-2 text-sm text-slate-600 dark:text-slate-300">Есть несохранённые изменения: {activeSources().map(source => source.label).join(', ')}.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" data-stay disabled={saving} onClick={stay} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Остаться</button>
          <button type="button" disabled={saving} onClick={() => void resolve(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Не сохранять</button>
          <button type="button" disabled={saving} onClick={() => void resolve(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>, document.body)}
  </Context.Provider>;
}
