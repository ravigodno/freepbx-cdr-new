import React, { useEffect, useMemo, useState } from 'react';

type PcapFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

function formatBytes(bytes: any) {
  const n = Number(bytes || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export default function TcpdumpTab({ token }: { token: string }) {
  const [iface, setIface] = useState('any');
  const [mode, setMode] = useState('sip');
  const [sipPorts, setSipPorts] = useState('5060,5061,5160');
  const [rtpPorts, setRtpPorts] = useState('20000-40000');
  const [hostFilter, setHostFilter] = useState('');
  const [targetType, setTargetType] = useState('any');
  const [customFilter, setCustomFilter] = useState('');
  const [output, setOutput] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [files, setFiles] = useState<PcapFile[]>([]);
  const [wiresharkIp, setWiresharkIp] = useState('');
  const [wiresharkPort, setWiresharkPort] = useState('9999');

  const bpfFilter = useMemo(() => {
    if (customFilter.trim()) return customFilter.trim();

    const sip = sipPorts
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `port ${p}`)
      .join(' or ');

    const rtp = rtpPorts.trim()
      ? `udp portrange ${rtpPorts.trim()}`
      : '';

    let base = sip;

    if (mode === 'rtp') base = rtp;
    if (mode === 'siprtp') base = [sip, rtp].filter(Boolean).join(' or ');

    const host = hostFilter.trim();

    if (targetType === 'internal-sip' && host) {
      base = `(${sip}) and host ${host}`;
    }

    if (targetType === 'trunk-sip' && host) {
      base = `(${sip}) and host ${host}`;
    }

    if (targetType === 'internal-sip-rtp' && host) {
      base = `(${[sip, rtp].filter(Boolean).join(' or ')}) and host ${host}`;
    }

    if (targetType === 'trunk-sip-rtp' && host) {
      base = `(${[sip, rtp].filter(Boolean).join(' or ')}) and host ${host}`;
    }

    if (targetType === 'any' && host) {
      base = `(${base}) and host ${host}`;
    }

    return base || 'port 5060';
  }, [mode, sipPorts, rtpPorts, hostFilter, customFilter, targetType]);

  const commandPreview = `tcpdump -i ${iface} -s 0 -U -w <file.pcap> ${bpfFilter}`;

  const loadStatus = async () => {
    const res = await fetch('/api/diagnostics/tcpdump/status', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setStatus(data);
  };

  const loadFiles = async () => {
    const res = await fetch('/api/diagnostics/tcpdump/files', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) setFiles(data.files || []);
  };

  const loadOutput = async () => {
    const res = await fetch('/api/diagnostics/tcpdump/output', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) setOutput(data.output || '');
  };

  useEffect(() => {
    loadStatus();
    loadFiles();
    loadOutput();

    const t = setInterval(() => {
      loadStatus();
      loadOutput();
    }, 2000);

    return () => clearInterval(t);
  }, []);

  const startCapture = async () => {
    setMessage('Запускаю tcpdump...');
    const url =
      '/api/diagnostics/tcpdump/start'
      + '?mode=' + encodeURIComponent(mode)
      + '&iface=' + encodeURIComponent(iface)
      + '&filter=' + encodeURIComponent(bpfFilter);

    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    setMessage(data.success ? 'Захват запущен' : 'Ошибка: ' + (data.error || 'tcpdump'));
    await loadStatus();
    await loadFiles();
    setTimeout(loadOutput, 1000);
  };

  const stopCapture = async () => {
    setMessage('Останавливаю tcpdump...');
    const res = await fetch('/api/diagnostics/tcpdump/stop', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    setMessage(data.success ? 'Захват остановлен' : 'Ошибка остановки');
    await loadStatus();
    await loadFiles();
    setTimeout(loadOutput, 1000);
  };

  const clearWindow = () => {
    setOutput('');
    setMessage('Окно вывода очищено');
  };

  const saveOutputToPc = () => {
    const blob = new Blob([output || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'tcpdump-output-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  const startStream = async () => {
    setMessage('Запускаю трансляцию tcpdump...');
    const url =
      '/api/diagnostics/tcpdump/stream/start'
      + '?mode=' + encodeURIComponent(mode)
      + '&iface=' + encodeURIComponent(iface)
      + '&filter=' + encodeURIComponent(bpfFilter)
      + '&host=' + encodeURIComponent(wiresharkIp)
      + '&port=' + encodeURIComponent(wiresharkPort);

    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    setMessage(data.success ? 'Трансляция запущена на ' + wiresharkIp + ':' + wiresharkPort : 'Ошибка: ' + (data.error || 'stream'));
  };

  const stopStream = async () => {
    const res = await fetch('/api/diagnostics/tcpdump/stream/stop', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMessage(data.success ? 'Трансляция остановлена' : 'Ошибка остановки трансляции');
  };

  const Help = ({ text }: { text: string }) => (
    <span
      title={text}
      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-black cursor-help"
    >
      ?
    </span>
  );

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-black">Настройка tcpdump</h3>
        <div className="text-xs text-slate-500 mt-1">
          Выберите параметры как в синтаксисе tcpdump. Команда формируется автоматически.
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">

          <label className="xl:col-span-2 text-xs font-bold">
            Интерфейс <Help text="Сетевой интерфейс. any — слушать все интерфейсы." />
            <select value={iface} onChange={e => setIface(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2">
              <option value="any">any</option>
              <option value="eth0">eth0</option>
              <option value="eth1">eth1</option>
              <option value="ens192">ens192</option>
              <option value="lo">lo</option>
            </select>
          </label>

          <label className="xl:col-span-2 text-xs font-bold">
            Режим <Help text="SIP — сигнализация, RTP — голос, SIP+RTP — оба потока." />
            <select value={mode} onChange={e => setMode(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2">
              <option value="sip">SIP</option>
              <option value="rtp">RTP</option>
              <option value="siprtp">SIP + RTP</option>
            </select>
          </label>

          <label className="xl:col-span-2 text-xs font-bold">
            SIP порты <Help text="Порты SIP. В FreePBX часто 5060, 5061, 5160." />
            <input value={sipPorts} onChange={e => setSipPorts(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2" />
          </label>

          <label className="xl:col-span-2 text-xs font-bold">
            RTP диапазон <Help text="Диапазон RTP для голоса. В FreePBX часто 10000-20000 или 20000-40000." />
            <input value={rtpPorts} onChange={e => setRtpPorts(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2" />
          </label>

          <label className="xl:col-span-2 text-xs font-bold">
            Объект анализа <Help text="Выберите, что анализируем: внутренний SIP-абонент, транк или оба с RTP." />
            <select value={targetType} onChange={e => setTargetType(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2">
              <option value="any">Любой трафик</option>
              <option value="internal-sip">Внутренний SIP абонент</option>
              <option value="internal-sip-rtp">Абонент + RTP</option>
              <option value="trunk-sip">SIP транк / провайдер</option>
              <option value="trunk-sip-rtp">Транк + RTP</option>
            </select>
          </label>

          <label className="xl:col-span-2 text-xs font-bold">
            IP абонента / транка <Help text="IP телефона, шлюза или SIP-провайдера. Например: 192.168.1.222 или 37.139.38.237." />
            <input value={hostFilter} onChange={e => setHostFilter(e.target.value)} placeholder="192.168.1.222" className="mt-1 w-full border rounded-lg px-2 py-2" />
          </label>

          <div className="xl:col-span-2 flex gap-2">
            {!status?.running ? (
              <button onClick={startCapture} className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black">
                START
              </button>
            ) : (
              <button onClick={stopCapture} className="w-full px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-black">
                STOP
              </button>
            )}
          </div>

          <label className="xl:col-span-12 text-xs font-bold">
            Свой BPF-фильтр <Help text="Если заполнено, используется вместо выбранных режимов. Например: host 192.168.1.222 and port 5060" />
            <input
              value={customFilter}
              onChange={e => setCustomFilter(e.target.value)}
              placeholder="host 192.168.1.222 and port 5060"
              className="mt-1 w-full border rounded-lg px-2 py-2 font-mono"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-slate-950 p-3">
        <div className="text-xs font-black text-slate-100 mb-2">Команда tcpdump</div>
        <pre className="text-[12px] text-emerald-100 whitespace-pre-wrap">{commandPreview}</pre>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold">
            IP компьютера с Wireshark
            <input value={wiresharkIp} onChange={e => setWiresharkIp(e.target.value)} placeholder="192.168.1.50" className="mt-1 w-52 border rounded-lg px-2 py-2" />
          </label>

          <label className="text-xs font-bold">
            Порт
            <input value={wiresharkPort} onChange={e => setWiresharkPort(e.target.value)} className="mt-1 w-24 border rounded-lg px-2 py-2" />
          </label>

          <button onClick={startStream} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-black">
            START трансляции
          </button>

          <button onClick={stopStream} className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-xs font-black">
            STOP трансляции
          </button>

          <div className="text-xs text-slate-500">
            На ПК можно слушать поток Wireshark/nc. Например: nc -l -p 9999 &gt; call.pcap
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 text-xs font-bold">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-3">
          <div className="font-black text-xs mb-2">Статус</div>
          <div className="text-xs">Состояние: <b>{status?.running ? 'Запущен' : 'Остановлен'}</b></div>
          <div className="text-xs font-mono break-all">Файл: {status?.file || '—'}</div>
          <div className="text-xs">Старт: {status?.startedAt || '—'}</div>
        </div>

        <div className="rounded-xl border bg-white p-3 max-h-44 overflow-auto">
          <div className="font-black text-xs mb-2">PCAP файлы</div>
          {files.length === 0 ? (
            <div className="text-xs text-slate-400">Файлов пока нет</div>
          ) : files.slice(0, 10).map(f => (
            <div key={f.name} className="flex items-center justify-between gap-2 border-t py-2 text-xs">
              <div className="min-w-0">
                <div className="font-mono truncate">{f.name}</div>
                <div className="text-slate-400">{formatBytes(f.size)} · {new Date(f.modifiedAt).toLocaleString('ru-RU')}</div>
              </div>
              <a href={'/api/diagnostics/tcpdump/download/' + encodeURIComponent(f.name)} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 font-bold">
                Скачать
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-slate-950 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black text-slate-100">Живой вывод tcpdump</div>
          <div className="flex gap-2">
            <button onClick={loadOutput} className="px-2 py-1 rounded bg-slate-800 text-slate-100 text-[11px] font-bold">Обновить</button>
            <button onClick={clearWindow} className="px-2 py-1 rounded bg-slate-800 text-slate-100 text-[11px] font-bold">Сброс окна</button>
            <button onClick={saveOutputToPc} className="px-2 py-1 rounded bg-emerald-800 text-white text-[11px] font-bold">Сохранить TXT</button>
          </div>
        </div>
        <pre className="text-[11px] text-emerald-100 overflow-auto max-h-80 whitespace-pre-wrap font-mono">
{output || 'Запустите tcpdump. Здесь появится живой вывод.'}
        </pre>
      </div>
    </div>
  );
}
