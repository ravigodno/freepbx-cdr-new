import React, { useState } from 'react';
import { UsersRound } from 'lucide-react';
import { createBulkAccessUsers, previewBulkAccessUsers } from '../services/accessApi';
import { AccessRole } from '../types';

interface Props {
  token: string;
  roles: AccessRole[];
  onCreated: () => Promise<void>;
}

type ParsedRow = Record<string, string>;

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function parseRows(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = parseDelimitedLine(lines[0].replace(/^\uFEFF/, ''), delimiter).map(value => value.trim());
  return lines.slice(1).map(line => {
    const values = parseDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

export default function BulkUsersCreatePanel({ token, roles, onCreated }: Props) {
  const [text, setText] = useState('');
  const [sourceRows, setSourceRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    const rows = parseRows(text);
    if (!rows.length) return setError('Добавьте заголовок и хотя бы одну строку пользователя.');
    setBusy(true);
    setError('');
    try {
      const result = await previewBulkAccessUsers(token, rows);
      setSourceRows(rows);
      setPreview(result);
    } catch (err: any) {
      setError(err.message || 'Ошибка preview.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview || preview.errorCount > 0 || !window.confirm(`Создать пользователей: ${preview.readyCount}?`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await createBulkAccessUsers(token, sourceRows);
      await onCreated();
      setPreview({ ...preview, applied: true, createdCount: result.createdCount });
    } catch (err: any) {
      setError(err.message || 'Ошибка создания пользователей.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-blue-600" /><h4 className="text-sm font-black text-slate-900">Массовое создание пользователей</h4></div>
      <p className="mt-1 text-[11px] text-slate-500">CSV, TSV или строки с разделителем «;». Роли: {roles.map(role => role.id).join(', ')}.</p>
      <textarea
        value={text}
        onChange={(event) => { setText(event.target.value); setPreview(null); }}
        rows={7}
        className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs placeholder:text-slate-400"
        placeholder={'fullName,username,password,role,extension,disabled\nИванов Иван Иванович,ivanov,Temp123!,operator,201,false'}
        spellCheck={false}
      />
      <div className="mt-2 grid gap-1 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
        <span><b>fullName</b> — ФИО</span>
        <span><b>username</b> — логин</span>
        <span><b>password</b> — пароль</span>
        <span><b>role</b> — ID роли из списка выше</span>
        <span><b>extension</b> — SIP-номер, только цифры</span>
        <span><b>disabled</b> — <code>false</code>: активен; <code>true</code>: отключён</span>
      </div>
      {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700">{error}</div>}
      {preview && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">Готово: {preview.readyCount} · Ошибки: {preview.errorCount}{preview.applied ? ` · Создано: ${preview.createdCount}` : ''}</div>
          <table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200"><th className="p-2">ФИО</th><th className="p-2">Логин</th><th className="p-2">Роль</th><th className="p-2">SIP</th><th className="p-2">Статус</th></tr></thead>
            <tbody>{(preview.rows || []).map((row: any) => <tr key={`${row.index}-${row.username}`} className="border-b border-slate-100"><td className="p-2">{row.fullName}</td><td className="p-2 font-mono">{row.username}</td><td className="p-2">{row.role}</td><td className="p-2 font-mono">{row.extension || '—'}</td><td className={`p-2 font-bold ${row.errors?.length ? 'text-red-700' : 'text-emerald-700'}`}>{row.errors?.join('; ') || 'Готов'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={runPreview} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Preview</button><button type="button" onClick={apply} disabled={busy || !preview || preview.errorCount > 0 || preview.applied} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Создать</button></div>
    </div>
  );
}
