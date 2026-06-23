import React, { useMemo } from 'react';

type Props = {
  liveSessionsData: any;
  liveSearch: string;
  setLiveSearch: (v: string) => void;
};

function durationFmt(sec: any) {
  const s = Number(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function extFromChannel(ch: string) {
  return String(ch || '')
    .replace(/^SIP\//, '')
    .replace(/^PJSIP\//, '')
    .replace(/^Local\//, '')
    .split('-')[0]
    .split('@')[0];
}

function parseDialData(data: string) {
  const s = String(data || '');

  // SIP/841282-in/79788101210,300,...
  const m1 = s.match(/(?:SIP|PJSIP)\/([^,\/]+)\/([^,\s]+)/i);
  if (m1) return { peer: m1[1], target: m1[2] };

  // SIP/100,,...
  const m2 = s.match(/(?:SIP|PJSIP)\/([^,\s]+)/i);
  if (m2) return { peer: m2[1], target: m2[1] };

  return { peer: '', target: '' };
}

function realBridge(r: any) {
  const b = r.bridgedUniqueid || r.bridge || r.bridgeId || r.bridgedChannel || '';
  return String(b || '');
}

function isRealBridgeId(v: string) {
  // настоящий bridge обычно UUID, а не маленькая цифра 9/10/11
  return /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i.test(v);
}

function detectState(records: any[]) {
  const states = records.map(r => String(r.state || '').toLowerCase());

  if (states.some(s => s === 'up')) {
    return ['Разговор', 'bg-emerald-50 text-emerald-700 border-emerald-100'];
  }

  if (states.some(s => s.includes('ring'))) {
    return ['Звонит', 'bg-amber-50 text-amber-700 border-amber-100'];
  }

  if (states.some(s => s === 'down')) {
    return ['Завершён', 'bg-rose-50 text-rose-700 border-rose-100'];
  }

  return ['Активен', 'bg-slate-50 text-slate-700 border-slate-200'];
}

function buildGroups(rows: any[]) {
  const used = new Set<number>();
  const result: any[] = [];

  rows.forEach((r, idx) => {
    if (used.has(idx)) return;

    const app = String(r.application || '').toLowerCase();
    const data = String(r.appData || '');

    if (app === 'dial') {
      const { peer, target } = parseDialData(data);
      const from = extFromChannel(r.channel) || r.callerId || '—';
      const to = target || r.exten || '—';

      const records = [r];
      used.add(idx);

      rows.forEach((x, j) => {
        if (used.has(j)) return;

        const xch = String(x.channel || '').toLowerCase();
        const xcaller = String(x.callerId || '');
        const xexten = String(x.exten || '');

        const related =
          (peer && xch.includes(peer.toLowerCase())) ||
          (target && (xcaller === target || xexten === target)) ||
          (from && xcaller === from);

        if (related) {
          records.push(x);
          used.add(j);
        }
      });

      result.push({
        key: records.map(x => x.uniqueid || x.channel).join('|'),
        bridge: records.map(realBridge).find(isRealBridgeId) || records.map(realBridge).find(Boolean) || '',
        from,
        to,
        records
      });
    }
  });

  rows.forEach((r, idx) => {
    if (used.has(idx)) return;

    result.push({
      key: r.uniqueid || r.channel || String(idx),
      bridge: realBridge(r),
      from: extFromChannel(r.channel) || r.callerId || '—',
      to: r.exten || r.callerId || '—',
      records: [r]
    });
  });

  return result;
}

export default function ActiveCallsTab({ liveSessionsData, liveSearch, setLiveSearch }: Props) {
  const rows = liveSessionsData?.sessions || [];

  const filtered = rows.filter((r: any) => {
    if (!liveSearch) return true;
    return JSON.stringify(r).toLowerCase().includes(liveSearch.toLowerCase());
  });

  const groups = useMemo(() => buildGroups(filtered), [filtered]);

  const clickFilter = (v: any) => {
    const text = String(v || '').trim();
    if (text) setLiveSearch(text);
  };

  return (
    <div className="p-4 space-y-4">
      {groups.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-center text-slate-400">
          Активных звонков сейчас нет
        </div>
      )}

      {groups.map((g) => {
        const [status, statusClass] = detectState(g.records);
        const duration = Math.max(...g.records.map((r: any) => Number(r.duration || 0)), 0);
        const bridgeText = g.bridge || '[нет]';

        return (
          <div key={g.key} className="rounded-xl border bg-white overflow-hidden">
            <div className="p-3 bg-slate-50 border-b flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black">
                  ☎ {g.from} → {g.to}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`px-2 py-0.5 rounded-full border font-black ${statusClass}`}>
                    {status}
                  </span>

                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-mono">
                    Длительность: {durationFmt(duration)}
                  </span>

                  <span
                    onClick={() => clickFilter(bridgeText)}
                    className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-mono cursor-pointer"
                  >
                    Bridge: {bridgeText}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-bold">
                Каналов: {g.records.length}
              </div>
            </div>

            <details open className="border-b">
              <summary className="px-3 py-2 cursor-pointer text-xs font-black text-slate-600 bg-white">
                Каналы звонка
              </summary>

              <div className="overflow-x-auto">
                <table className="w-full text-[12px] font-mono">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-2 text-left">Channel</th>
                      <th className="p-2 text-left">Context</th>
                      <th className="p-2 text-left">Priority</th>
                      <th className="p-2 text-left">State</th>
                      <th className="p-2 text-left">App</th>
                      <th className="p-2 text-left">CallerID</th>
                      <th className="p-2 text-left">Duration</th>
                      <th className="p-2 text-left">Bridge</th>
                      <th className="p-2 text-left">UniqueID</th>
                    </tr>
                  </thead>

                  <tbody>
                    {g.records.map((r: any, idx: number) => (
                      <tr key={idx} className="border-t hover:bg-blue-50">
                        <td onClick={() => clickFilter(r.channel)} className="p-2 cursor-pointer">{r.channel}</td>
                        <td onClick={() => clickFilter(r.context)} className="p-2 cursor-pointer">{r.context}</td>
                        <td onClick={() => clickFilter(r.priority)} className="p-2 cursor-pointer">{r.priority}</td>
                        <td onClick={() => clickFilter(r.state)} className={`p-2 cursor-pointer font-black ${
                          String(r.state).toLowerCase() === 'up'
                            ? 'bg-emerald-100 text-emerald-800'
                            : String(r.state).toLowerCase().includes('ring')
                              ? 'bg-amber-100 text-amber-800'
                              : String(r.state).toLowerCase() === 'down'
                                ? 'bg-rose-100 text-rose-800'
                                : ''
                        }`}>
                          {r.state}
                        </td>
                        <td onClick={() => clickFilter(r.application)} className="p-2 cursor-pointer">{r.application}</td>
                        <td onClick={() => clickFilter(r.callerId)} className="p-2 cursor-pointer">{r.callerId}</td>
                        <td className="p-2">{durationFmt(r.duration)}</td>
                        <td onClick={() => clickFilter(realBridge(r))} className="p-2 cursor-pointer">{realBridge(r) || '—'}</td>
                        <td onClick={() => clickFilter(r.uniqueid)} className="p-2 cursor-pointer">{r.uniqueid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details>
              <summary className="px-3 py-2 cursor-pointer text-xs font-black text-slate-600 bg-white">
                Технические детали / AppData
              </summary>

              <div className="p-3 space-y-2 bg-slate-950 text-emerald-100 text-[11px] font-mono overflow-auto">
                {g.records.map((r: any, idx: number) => (
                  <pre key={idx} className="whitespace-pre-wrap border-b border-slate-800 pb-2">
{`Channel: ${r.channel || '—'}
Context: ${r.context || '—'}
Priority: ${r.priority || '—'}
State: ${r.state || '—'}
App: ${r.application || '—'}
AppData: ${r.appData || '—'}
CallerID: ${r.callerId || '—'}
Bridge: ${realBridge(r) || '—'}
UniqueID: ${r.uniqueid || '—'}
Raw: ${r.raw || '—'}`}
                  </pre>
                ))}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
