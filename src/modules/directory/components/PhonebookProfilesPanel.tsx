import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Copy, KeyRound, Pencil, Plus, Power, RefreshCw, Save, Trash2, X } from 'lucide-react';

type Filters = {
  organization: string;
  department: string;
  type: string;
  includeInternalExtension: boolean;
};

type Profile = {
  id: number;
  name: string;
  slug: string;
  format: 'grandstream' | 'yealink';
  scope: 'shared' | 'personal_combined';
  ownerUserId?: string | null;
  username: string;
  filters: Filters;
  maxEntries: number;
  active: boolean;
  lastAccessAt?: string | null;
};

type Owner = { id: string; label: string };
type Credentials = { url: string; username: string; password: string };
type Draft = {
  name: string;
  format: Profile['format'];
  scope: Profile['scope'];
  ownerUserId: string;
  username: string;
  filters: Filters;
  maxEntries: number;
};

const emptyFilters = (): Filters => ({
  organization: '',
  department: '',
  type: '',
  includeInternalExtension: true
});

const initialDraft = (): Draft => ({
  name: 'Общая телефонная книга',
  format: 'grandstream',
  scope: 'shared',
  ownerUserId: '',
  username: 'phonebook',
  filters: emptyFilters(),
  maxEntries: 2000
});

export function PhonebookProfilesPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Profile[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const request = useCallback(async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...init.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Операция не выполнена');
    return data;
  }, [token]);

  const load = useCallback(async () => {
    const [profilesData, ownersData] = await Promise.all([
      request('/api/phonebook/profiles'),
      request('/api/phonebook/owners')
    ]);
    setItems(profilesData.items || []);
    setOwners(ownersData.items || []);
  }, [request]);

  useEffect(() => {
    void load().catch(error => setStatus(error.message));
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setDraft(initialDraft());
  };

  const payload = () => ({
    ...draft,
    ownerUserId: draft.scope === 'personal_combined' ? draft.ownerUserId : undefined,
    maxEntries: Number(draft.maxEntries)
  });

  const save = async () => {
    setIsBusy(true);
    setStatus('');
    setCredentials(null);
    try {
      const data = await request(
        editingId ? `/api/phonebook/profiles/${editingId}` : '/api/phonebook/profiles',
        { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload()) }
      );
      if (!editingId) {
        setCredentials(data);
        setStatus('Профиль создан. Сохраните пароль: повторно он не показывается.');
      } else {
        setStatus('Профиль обновлён.');
      }
      resetForm();
      await load();
    } catch (error: any) {
      setStatus(error.message);
    } finally {
      setIsBusy(false);
    }
  };

  const beginEdit = (item: Profile) => {
    setEditingId(item.id);
    setCredentials(null);
    setStatus('');
    setDraft({
      name: item.name,
      format: item.format,
      scope: item.scope,
      ownerUserId: item.ownerUserId || '',
      username: item.username,
      filters: { ...emptyFilters(), ...item.filters },
      maxEntries: item.maxEntries
    });
  };

  const toggleActive = async (item: Profile) => {
    setIsBusy(true);
    try {
      await request(`/api/phonebook/profiles/${item.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active })
      });
      setStatus(item.active ? 'Профиль отключён.' : 'Профиль включён.');
      await load();
    } catch (error: any) {
      setStatus(error.message);
    } finally {
      setIsBusy(false);
    }
  };

  const rotateSecret = async (item: Profile) => {
    if (!window.confirm(`Сменить пароль профиля «${item.name}»? Старый пароль сразу перестанет работать.`)) return;
    setIsBusy(true);
    try {
      const data = await request(`/api/phonebook/profiles/${item.id}/rotate-secret`, { method: 'POST' });
      setCredentials(data);
      setStatus('Пароль изменён. Обновите настройки аппаратов и сохраните новый пароль.');
    } catch (error: any) {
      setStatus(error.message);
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async (item: Profile) => {
    const confirmation = window.prompt(`Удаление отключит URL книги. Для подтверждения введите: ${item.slug}`);
    if (confirmation !== item.slug) return;
    setIsBusy(true);
    try {
      await request(`/api/phonebook/profiles/${item.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation })
      });
      if (editingId === item.id) resetForm();
      setStatus('Профиль удалён.');
      await load();
    } catch (error: any) {
      setStatus(error.message);
    } finally {
      setIsBusy(false);
    }
  };

  const setFilter = (key: keyof Filters, value: string | boolean) => {
    setDraft(current => ({ ...current, filters: { ...current.filters, [key]: value } }));
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const value = `${location.origin}${credentials.url}\n${credentials.username}\n${credentials.password}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('copy command rejected');
      }
      setStatus('URL, логин и пароль скопированы.');
    } catch {
      setStatus('Автоматическое копирование недоступно. Выделите реквизиты и скопируйте их вручную.');
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 h-5 w-5 text-blue-600" />
        <div>
          <h4 className="text-sm font-black text-slate-900">Удалённые телефонные книги SIP</h4>
          <p className="mt-1 text-xs text-slate-500">Grandstream и Yealink XML с отдельными учётными данными. Передавайте URL только по HTTPS.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <b className="text-xs text-slate-800">{editingId ? 'Редактирование профиля' : 'Новый профиль'}</b>
          {editingId && <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" />Отмена</button>}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-[11px] font-bold text-slate-600">Название<input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal" /></label>
          <label className="text-[11px] font-bold text-slate-600">Формат<select value={draft.format} disabled={editingId !== null} onChange={event => setDraft(current => ({ ...current, format: event.target.value as Profile['format'] }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal disabled:bg-slate-100"><option value="grandstream">Grandstream XML</option><option value="yealink">Yealink XML</option></select></label>
          <label className="text-[11px] font-bold text-slate-600">Состав книги<select value={draft.scope} onChange={event => setDraft(current => ({ ...current, scope: event.target.value as Profile['scope'] }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"><option value="shared">Только общие</option><option value="personal_combined">Общие + личные владельца</option></select></label>
          <label className="text-[11px] font-bold text-slate-600">Владелец<select value={draft.ownerUserId} disabled={draft.scope === 'shared'} onChange={event => setDraft(current => ({ ...current, ownerUserId: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal disabled:bg-slate-100"><option value="">Выберите пользователя</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.label}</option>)}</select></label>
          <label className="text-[11px] font-bold text-slate-600">Логин HTTP Basic<input value={draft.username} onChange={event => setDraft(current => ({ ...current, username: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal" /></label>
          <label className="text-[11px] font-bold text-slate-600">Организация<input value={draft.filters.organization} onChange={event => setFilter('organization', event.target.value)} placeholder="Все организации" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal" /></label>
          <label className="text-[11px] font-bold text-slate-600">Отдел<input value={draft.filters.department} onChange={event => setFilter('department', event.target.value)} placeholder="Все отделы" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal" /></label>
          <label className="text-[11px] font-bold text-slate-600">Тип контакта<select value={draft.filters.type} onChange={event => setFilter('type', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"><option value="">Все типы</option><option value="internal">Внутренний</option><option value="client">Клиент</option><option value="supplier">Поставщик</option><option value="government">Госорган</option></select></label>
          <label className="text-[11px] font-bold text-slate-600">Максимум записей<input type="number" min={1} max={2000} value={draft.maxEntries} onChange={event => setDraft(current => ({ ...current, maxEntries: Number(event.target.value) }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal" /></label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.filters.includeInternalExtension} onChange={event => setFilter('includeInternalExtension', event.target.checked)} />Добавлять внутренний номер</label>
          <button type="button" onClick={save} disabled={isBusy || !draft.name.trim() || !draft.username.trim() || (draft.scope === 'personal_combined' && !draft.ownerUserId)} className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingId ? 'Сохранить' : 'Создать профиль'}</button>
        </div>
      </div>

      {status && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-800">{status}</div>}
      {credentials && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950"><div className="font-black"><KeyRound className="mr-1 inline h-4 w-4" />Учётные данные показываются один раз</div><div className="mt-2 break-all font-mono">URL: {location.origin}{credentials.url}<br />Логин: {credentials.username}<br />Пароль: {credentials.password}</div><button type="button" onClick={() => void copyCredentials()} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold"><Copy className="h-3.5 w-3.5" />Копировать</button></div>}

      <div className="mt-4 space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">Профили ещё не созданы.</div>}
        {items.map(item => (
          <div key={item.id} className={`rounded-lg border bg-white px-3 py-3 text-xs ${item.active ? 'border-slate-200' : 'border-slate-200 opacity-65'}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div><b>{item.name}</b><span className="ml-2 text-slate-500">{item.format} · {item.scope === 'shared' ? 'общие' : `личная: ${owners.find(owner => owner.id === item.ownerUserId)?.label || item.ownerUserId}`}</span></div>
                <code className="mt-1 block truncate text-[11px] text-slate-500">/phonebook/{item.format}/{item.slug}.xml</code>
                <span className="mt-1 block text-[10px] text-slate-400">{item.lastAccessAt ? `Последнее обращение: ${new Date(item.lastAccessAt).toLocaleString('ru-RU')}` : 'Аппараты ещё не обращались'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={isBusy} onClick={() => beginEdit(item)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Изменить</button>
                <button type="button" disabled={isBusy} onClick={() => rotateSecret(item)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2.5 py-1.5 font-bold text-amber-700 hover:bg-amber-50"><RefreshCw className="h-3.5 w-3.5" />Пароль</button>
                <button type="button" disabled={isBusy} onClick={() => toggleActive(item)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600 hover:bg-slate-50"><Power className="h-3.5 w-3.5" />{item.active ? 'Отключить' : 'Включить'}</button>
                <button type="button" disabled={isBusy} onClick={() => remove(item)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Удалить</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
