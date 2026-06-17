import React, { useEffect, useMemo, useState } from 'react';

interface Props {
  tcpdumpOutput: string;
  loadTcpdumpOutput: () => void;
}

type SipMsg = {
  time: string;
  src: string;
  dst: string;
  method: string;
  code: string;
  title: string;
  callId: string;
  raw: string;
};

function cleanText(s: string) {
  return s.replace(/[^\x20-\x7E\r\nА-Яа-я]/g, ' ');
}

function packetBlocks(output: string) {
  const out: string[] = [];
  let cur: string[] = [];

  for (const line of output.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\./.test(line)) {
      if (cur.length) out.push(cur.join('\n'));
      cur = [line];
    } else if (cur.length) {
      cur.push(line);
    }
  }

  if (cur.length) out.push(cur.join('\n'));
  return out;
}

function parseMsg(block: string): SipMsg | null {
  const text = cleanText(block);
  if (/OPTIONS|REGISTER/i.test(text)) return null;

  const first = text.split('\n')[0] || '';

  const time = first.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)?.[1] || '—';
  const dir = first.match(/IP\s+([^\s]+)\s+>\s+([^:]+):/);
  const src = dir?.[1] || '—';
  const dst = dir?.[2] || '—';

  let method = '';
  let code = '';
  let title = '';

  const req = text.match(/\b(INVITE|ACK|BYE|CANCEL|REFER|UPDATE|INFO|MESSAGE)\s+sip:([^\s]+)\s+SIP\/2\.0/i);
  const resp = text.match(/SIP\/2\.0\s+(\d{3})\s+([^\r\n]+)/i);

  if (req) {
    method = req[1].toUpperCase();
    title = method + ' sip:' + req[2];
  } else if (resp) {
    code = resp[1];
    method = resp[1] + ' ' + resp[2].trim();
    title = method;
  } else {
    return null;
  }

  const callId =
    text.match(/Call-ID:\s*([^\r\n]+)/i)?.[1]?.trim() ||
    text.match(/\bi:\s*([^\r\n]+)/i)?.[1]?.trim() ||
    `${src}-${dst}-${text.match(/CSeq:\s*([^\r\n]+)/i)?.[1]?.trim() || method}`;

  return { time, src, dst, method, code, title, callId, raw: first };
}

function statusOf(items: SipMsg[]) {
  const text = items.map(x => x.method).join(' ');

  if (/486|603/.test(text)) return 'Отклонён / занят';
  if (/487|CANCEL/.test(text)) return 'Отменён';
  if (/403|404/.test(text)) return 'Ошибка маршрута';
  if (/BYE/.test(text)) return 'Завершён';
  if (/200 OK/.test(text) && /ACK/.test(text)) return 'Разговор';
  if (/180 Ringing/.test(text)) return 'Звонит';
  if (/INVITE/.test(text)) return 'Вызов';
  return 'SIP';
}

function badgeClass(method: string) {
  if (/200/.test(method)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (/180|183/.test(method)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (/401/.test(method)) return 'bg-slate-50 text-slate-600 border-slate-200';
  if (/403|404|486|487|603|CANCEL/.test(method)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (/INVITE/.test(method)) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function SngrepTab({ tcpdumpOutput, loadTcpdumpOutput }: Props) {
  const [selected, setSelected] = useState<string>('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadTcpdumpOutput();
    const t = setInterval(loadTcpdumpOutput, 2000);
    return () => clearInterval(t);
  }, []);

  const start = async (mode: string) => {
    setMsg('Запускаю захват...');
    const r = await fetch('/api/diagnostics/tcpdump/start?mode=' + mode + '&iface=any', { method: 'POST' });
    const d = await r.json();
    setMsg(d.success ? 'Захват запущен' : 'Ошибка: ' + (d.error || 'tcpdump'));
    setTimeout(loadTcpdumpOutput, 1000);
  };

  const stop = async () => {
    await fetch('/api/diagnostics/tcpdump/stop', { method: 'POST' });
    setMsg('Захват остановлен');
    setTimeout(loadTcpdumpOutput, 1000);
  };

  const dialogs = useMemo(() => {
    const map = new Map<string, SipMsg[]>();

    packetBlocks(tcpdumpOutput || '').forEach(b => {
      const p = parseMsg(b);
      if (!p) return;
      if (!map.has(p.callId)) map.set(p.callId, []);
      map.get(p.callId)!.push(p);
    });

    return Array.from(map.entries()).map(([id, items]) => ({
      id,
      items,
      status: statusOf(items),
      first: items[0],
      last: items[items.length - 1]
    })).reverse();
  }, [tcpdumpOutput]);

  useEffect(() => {
    if (!selected && dialogs[0]) setSelected(dialogs[0].id);
  }, [dialogs.length]);

  const current = dialogs.find(d => d.id === selected) || dialogs[0];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-black">SNGREP — SIP flow</h3>
          <div className="text-xs text-slate-500">Слева диалоги, справа цепочка сообщений.</div>
          {msg && <div className="mt-1 text-xs font-bold text-indigo-700">{msg}</div>}
        </div>

        <div className="flex gap-2">
          <button onClick={() => start('sip')} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border text-xs font-bold">Start SIP</button>
          <button onClick={() => start('siprtp')} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 border text-xs font-bold">SIP+RTP</button>
          <button onClick={stop} className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border text-xs font-bold">Stop</button>
          <button onClick={loadTcpdumpOutput} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border text-xs font-bold">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-4 rounded-xl border bg-white overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b text-xs font-black">SIP диалоги</div>

          {dialogs.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-400">Нажмите Start SIP и сделайте звонок</div>
          )}

          {dialogs.map(d => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`w-full text-left p-3 border-b hover:bg-slate-50 ${selected === d.id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex justify-between gap-2">
                <div className="font-black text-sm">{d.first?.src} → {d.first?.dst}</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white">{d.status}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 font-mono truncate">{d.id}</div>
              <div className="mt-1 text-[11px] text-slate-500">{d.items.length} сообщений · {d.last?.time}</div>
            </button>
          ))}
        </div>

        <div className="col-span-8 rounded-xl border bg-white overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b">
            <div className="font-black text-sm">Flow: {current?.first?.src || '—'} → {current?.first?.dst || '—'}</div>
            <div className="text-[11px] text-slate-500 font-mono truncate">Call-ID: {current?.id || '—'}</div>
          </div>

          <div className="p-4">
            {!current && <div className="text-center text-slate-400 text-xs">Нет выбранного диалога</div>}

            {current?.items.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs mb-2">
                <div className="col-span-2 font-mono text-slate-400">{p.time.split(' ')[1]}</div>
                <div className="col-span-3 font-mono text-right">{p.src}</div>
                <div className="col-span-2 text-center">
                  <span className={`inline-block px-2 py-1 rounded-full border text-[10px] font-black ${badgeClass(p.method)}`}>
                    {p.method}
                  </span>
                </div>
                <div className="col-span-3 font-mono">{p.dst}</div>
                <div className="col-span-2 text-slate-400 font-mono truncate">{p.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
