import React, { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';

type Check = { key: string; status: 'ok' | 'warning' | 'error'; message: string };
type Preview = {
  ready: boolean;
  previewId: string | null;
  profile: { extension: string; websocketUrl: string; sipUri: string; authorizationUsername: string; displayName: string; hasPassword: boolean };
  checks: Check[];
  changes: string[];
};

type Props = { token: string; onConfigured: () => Promise<void> | void };

export default function SoftphoneAutoConfig({ token, onConfigured }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const requestPreview = async () => {
    setLoading(true);
    setMessage('');
    setPreview(null);
    try {
      const response = await fetch('/api/softphone/auto-config/preview', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось проверить настройки АТС');
      setPreview(data);
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось проверить настройки АТС');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!preview?.ready || !preview.previewId) return;
    setApplying(true);
    setMessage('');
    try {
      const response = await fetch('/api/softphone/auto-config/apply', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ previewId: preview.previewId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить WebRTC-профиль');
      setMessage('WebRTC-профиль сохранён. Подключаем гарнитуру…');
      setPreview(null);
      await onConfigured();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось сохранить WebRTC-профиль');
    } finally {
      setApplying(false);
    }
  };

  return <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h5 className="flex items-center gap-2 text-xs font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-blue-600" />Безопасная настройка из АТС</h5>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">PBXPuls проверит назначенный номер, PJSIP/WebRTC и WSS. FreePBX изменён не будет, SIP-секрет скрыт в preview и логах.</p>
      </div>
      <button type="button" onClick={() => void requestPreview()} disabled={loading || applying} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Проверить настройки АТС</button>
    </div>

    {preview && <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-2 text-[10px] text-slate-700 sm:grid-cols-2">
        <div><span className="font-bold">Номер:</span> {preview.profile.extension || '—'}</div>
        <div><span className="font-bold">SIP-логин:</span> {preview.profile.authorizationUsername || '—'}</div>
        <div className="break-all"><span className="font-bold">WSS:</span> {preview.profile.websocketUrl || '—'}</div>
        <div className="break-all"><span className="font-bold">SIP URI:</span> {preview.profile.sipUri || '—'}</div>
        <div><span className="font-bold">SIP-секрет:</span> {preview.profile.hasPassword ? 'найден, значение скрыто' : 'не найден'}</div>
      </div>
      <div className="space-y-1.5">{preview.checks.map(check => <div key={check.key} className={`flex items-start gap-2 text-[10px] ${check.status === 'error' ? 'text-rose-700' : check.status === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`}>{check.status === 'error' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : check.status === 'warning' ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{check.message}</span></div>)}</div>
      <div className="rounded-lg bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-600">{preview.changes.map(item => <div key={item}>• {item}</div>)}</div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">Отмена</button>
        <button type="button" onClick={() => void apply()} disabled={!preview.ready || !preview.previewId || applying} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-45">{applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Применить профиль PBXPuls</button>
      </div>
    </div>}
    {message && <div className="text-[10px] font-semibold text-slate-700">{message}</div>}
  </div>;
}
