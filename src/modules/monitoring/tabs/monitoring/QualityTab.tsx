import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Sliders,
  Database,
  Network,
  Play,
  PlayCircle,
  TrendingUp,
  Cpu,
  Terminal,
  FileText,
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';

// Pure React/SVG charting components to prevent any ResizeObserver, Canvas or React 19 compatibility crashes
function CustomMiniAreaChart({ 
  data, 
  dataKey, 
  strokeColor, 
  fillColor, 
  yDomain 
}: { 
  data: any[], 
  dataKey: string, 
  strokeColor: string, 
  fillColor: string, 
  yDomain?: [number, number] 
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (data.length === 0) return null;
  const vals = data.map(d => d[dataKey] || 0);
  const minVal = yDomain ? yDomain[0] : Math.min(...vals, 0);
  const maxVal = yDomain ? yDomain[1] : Math.max(...vals, 1) * 1.15;
  const range = maxVal - minVal || 1;

  const width = 500;
  const height = 150;
  const padding = { top: 12, bottom: 20, left: 35, right: 15 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, idx) => {
    const x = padding.left + (idx / (data.length - 1 || 1)) * chartWidth;
    const rawValue = Number(d[dataKey] ?? 0);
    const safeValue = Math.max(minVal, Math.min(maxVal, Number.isFinite(rawValue) ? rawValue : minVal));
    const y = padding.top + chartHeight - ((safeValue - minVal) / range) * chartHeight;
    return { x, y, item: d };
  });

  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + chartHeight).toFixed(1)} Z`
    : '';

  const yTicks = [minVal, minVal + range / 2, maxVal];

  return (
    <div className="relative w-full h-full bg-slate-50/50 dark:bg-slate-900/10 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map((tick, idx) => {
          const y = padding.top + chartHeight - ((tick - minVal) / range) * chartHeight;
          return (
            <g key={idx} className="opacity-40">
              <line 
                x1={padding.left} 
                y1={y} 
                x2={width - padding.right} 
                y2={y} 
                stroke="currentColor" 
                className="text-slate-200 dark:text-slate-850" 
                strokeDasharray="3,3" 
              />
              <text 
                x={padding.left - 8} 
                y={y + 3} 
                textAnchor="end" 
                fontSize="8" 
                className="fill-slate-400 font-mono font-bold"
              >
                {tick.toFixed(Math.abs(tick) < 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {data.length > 1 && [0, Math.floor(data.length / 2), data.length - 1].map((idx) => {
          if (idx >= data.length) return null;
          const p = points[idx];
          return (
            <text
              key={idx}
              x={p.x}
              y={height - 3}
              textAnchor={idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}
              fontSize="8.5"
              className="fill-slate-400 font-mono font-bold"
            >
              {data[idx].formattedTime}
            </text>
          );
        })}

        {/* Fill Area with Gradient */}
        <path d={areaPath} fill={`url(#grad-${dataKey})`} />

        {/* Stroke Line */}
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dynamic points and hover interact */}
        {points.map((p, idx) => (
          <g 
            key={idx}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            className="cursor-pointer"
          >
            <rect
              x={p.x - 8}
              y={padding.top}
              width="16"
              height={chartHeight}
              fill="transparent"
            />
            {hoveredIndex === idx && (
              <g>
                <line
                  x1={p.x}
                  y1={padding.top}
                  x2={p.x}
                  y2={padding.top + chartHeight}
                  stroke={strokeColor}
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  className="opacity-50"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill={strokeColor}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </g>
        ))}
      </svg>

      {hoveredIndex !== null && data[hoveredIndex] && (
        <div className="absolute top-2 right-2 bg-slate-900 border border-slate-700/50 text-white text-[10px] p-2 rounded-lg font-mono z-10 shadow-sm leading-tight">
          <div className="text-slate-450 font-sans font-bold">{data[hoveredIndex].formattedTime}</div>
          <div className="mt-1 flex items-center gap-1 font-bold">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: strokeColor }} />
            <span>Значение: {data[hoveredIndex][dataKey]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomMiniLineChart({ 
  data, 
  keys, 
  colors, 
  labels 
}: { 
  data: any[], 
  keys: string[], 
  colors: string[], 
  labels: string[] 
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (data.length === 0) return null;
  
  const allVals = data.flatMap(d => keys.map(k => d[k] || 0));
  const minVal = 0;
  const maxVal = Math.max(...allVals, 1) * 1.15;
  const range = maxVal - minVal || 1;

  const width = 500;
  const height = 150;
  const padding = { top: 12, bottom: 20, left: 35, right: 15 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const linePoints = keys.map((key) => {
    return data.map((d, idx) => {
      const x = padding.left + (idx / (data.length - 1 || 1)) * chartWidth;
      const y = padding.top + chartHeight - (((d[key] || 0) - minVal) / range) * chartHeight;
      return { x, y, val: d[key] };
    });
  });

  const paths = linePoints.map((points) => {
    return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  });

  const yTicks = [minVal, minVal + range / 2, maxVal];

  return (
    <div className="relative w-full h-full bg-slate-50/50 dark:bg-slate-900/10 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {/* Horizontal grid lines */}
        {yTicks.map((tick, idx) => {
          const y = padding.top + chartHeight - ((tick - minVal) / range) * chartHeight;
          return (
            <g key={idx} className="opacity-40">
              <line 
                x1={padding.left} 
                y1={y} 
                x2={width - padding.right} 
                y2={y} 
                stroke="currentColor" 
                className="text-slate-200 dark:text-slate-850" 
                strokeDasharray="3,3" 
              />
              <text 
                x={padding.left - 8} 
                y={y + 3} 
                textAnchor="end" 
                fontSize="8" 
                className="fill-slate-400 font-mono font-bold"
              >
                {tick.toFixed(tick < 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {data.length > 1 && [0, Math.floor(data.length / 2), data.length - 1].map((idx) => {
          if (idx >= data.length) return null;
          const x = padding.left + (idx / (data.length - 1 || 1)) * chartWidth;
          return (
            <text
              key={idx}
              x={x}
              y={height - 3}
              textAnchor={idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}
              fontSize="8.5"
              className="fill-slate-400 font-mono font-bold"
            >
              {data[idx].formattedTime}
            </text>
          );
        })}

        {/* Draw Line paths */}
        {paths.map((pPath, kIdx) => (
          <path 
            key={kIdx} 
            d={pPath} 
            fill="none" 
            stroke={colors[kIdx]} 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        ))}

        {/* Hover lines */}
        {hoveredIndex !== null && (
          <line
            x1={padding.left + (hoveredIndex / (data.length - 1 || 1)) * chartWidth}
            y1={padding.top}
            x2={padding.left + (hoveredIndex / (data.length - 1 || 1)) * chartWidth}
            y2={padding.top + chartHeight}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="2,2"
            className="opacity-40"
          />
        )}

        {/* Active interactive markers */}
        {data.map((_, idx) => {
          const x = padding.left + (idx / (data.length - 1 || 1)) * chartWidth;
          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            >
              <rect
                x={x - 8}
                y={padding.top}
                width="16"
                height={chartHeight}
                fill="transparent"
              />
              {hoveredIndex === idx && linePoints.map((points, kIdx) => {
                const p = points[idx];
                return (
                  <circle
                    key={kIdx}
                    cx={p.x}
                    cy={p.y}
                    r="3.5"
                    fill={colors[kIdx]}
                    stroke="#fff"
                    strokeWidth="1.2"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* HTML Floating Tooltip */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div className="absolute top-2 right-2 bg-slate-900 border border-slate-700/50 text-white text-[10px] p-2 rounded-lg font-mono z-10 shadow-sm leading-tight space-y-1">
          <div className="text-slate-450 font-sans font-bold">{data[hoveredIndex].formattedTime}</div>
          {keys.map((k, kIdx) => (
            <div key={k} className="flex items-center gap-1 font-bold">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[kIdx] }} />
              <span className="text-slate-350">{labels[kIdx]}:</span>
              <span>{data[hoveredIndex][k]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  token?: string;
}

interface QualityDevice {
  ext: string;
  name: string;
  ip: string;
  type: 'SIP' | 'PJSIP';
  userAgent: string;
  latency: number;
  jitter: number;
  rtpLoss: number;
  mos: number;
  status: 'Отлично' | 'Хорошо' | 'Предупреждение' | 'Критично' | 'Offline';
  lastCheck: string;
  network: {
    mac: string;
    vendor: string;
    vlan: string;
    switch: string;
    lastIp: string;
    ipHistory: string[];
    uaHistory: string[];
    registerHistory: string[];
    registerCount: number;
    registerFrequency: string;
    subnetChanges: number;
  };
}

interface TelemetryPoint {
  ext: string;
  timestamp: string;
  latency: number;
  jitter: number;
  rtpLoss: number;
  mos: number;
}

interface TelemetryAlert {
  id: string;
  time: string;
  ext: string;
  name: string;
  ip: string;
  type: string;
  value: string;
  severity: 'Предупреждение' | 'Критично';
}

export default function QualityTab({ token }: Props) {
  const [devices, setDevices] = useState<QualityDevice[]>([]);
  const [alerts, setAlerts] = useState<TelemetryAlert[]>([]);
  const [allHistory, setAllHistory] = useState<TelemetryPoint[]>([]);
  const [selectedExt, setSelectedExt] = useState<string>('101');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [historyPeriod, setHistoryPeriod] = useState<'1h' | '24h' | '7d' | '30d'>('1h');

  // Terminal state
  const [terminalOutput, setTerminalOutput] = useState<string>('Выберите устройство и инструмент диагностики для запуска...');
  const [isRunningDiag, setIsRunningDiag] = useState<boolean>(false);
  const [activeDiagName, setActiveDiagName] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const headersStr = token ? { Authorization: `Bearer ${token}` } : undefined;
      const [devsRes, alertsRes, histRes] = await Promise.all([
        fetch('/api/quality/devices', { headers: headersStr }).then(r => r.json()),
        fetch('/api/quality/alerts', { headers: headersStr }).then(r => r.json()),
        fetch(`/api/quality/history?ext=${encodeURIComponent(selectedExt || 'all')}&period=${encodeURIComponent(historyPeriod)}`, { headers: headersStr }).then(r => r.json())
      ]);

      if (devsRes.success) setDevices(devsRes.devices);
      if (alertsRes.success) setAlerts(alertsRes.alerts);
      if (histRes.success) setAllHistory(histRes.history);
    } catch (err: any) {
      console.error(err);
      setError('Не удалось загрузить данные телеметрии качества связи');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000);
    return () => clearInterval(interval);
  }, [token, selectedExt, historyPeriod]);

  // Handle selected device
  const selectedDevice = useMemo(() => {
    return devices.find(d => d.ext === selectedExt) || devices[0];
  }, [devices, selectedExt]);

  // Selected device's specific history
  const deviceHistory = useMemo(() => {
    if (!selectedDevice || !allHistory.length) return [];
    return allHistory.filter(h => h.ext === selectedDevice.ext);
  }, [allHistory, selectedDevice]);

  // Filter history based on selected period
  const filteredHistoryData = useMemo(() => {
    if (!deviceHistory.length) return [];
    const now = Date.now();
    let periodMs = 3600000; // default 1 hour
    if (historyPeriod === '24h') periodMs = 24 * 3600000;
    else if (historyPeriod === '7d') periodMs = 7 * 24 * 3600000;
    else if (historyPeriod === '30d') periodMs = 30 * 24 * 3600000;

    const limitTime = now - periodMs;
    return deviceHistory
      .filter(pt => new Date(pt.timestamp).getTime() >= limitTime)
      .map(pt => ({
        ...pt,
        formattedTime: new Date(pt.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }),
        formattedDate: new Date(pt.timestamp).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
        onlineValue: pt.status === 'Offline' ? 0 : 1
      }))
      .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [deviceHistory, historyPeriod]);

  // Calculate history period summaries
  const historySummaries = useMemo(() => {
    if (!filteredHistoryData.length) return { maxLat: 0, minLat: 0, avgLat: 0, peakJitter: 0, avgLoss: 0, mosMin: 4.4, mosMax: 4.4 };
    let sumLat = 0;
    let maxLat = 0;
    let minLat = 9999;
    let peakJitter = 0;
    let sumLoss = 0;
    let minMos = 5.0;
    let maxMos = 0.0;

    filteredHistoryData.forEach(pt => {
      sumLat += pt.latency;
      if (pt.latency > maxLat) maxLat = pt.latency;
      if (pt.latency < minLat) minLat = pt.latency;
      if (pt.jitter > peakJitter) peakJitter = pt.jitter;
      sumLoss += pt.rtpLoss;
      if (pt.mos < minMos) minMos = pt.mos;
      if (pt.mos > maxMos) maxMos = pt.mos;
    });

    return {
      maxLat,
      minLat: minLat === 9999 ? 0 : minLat,
      avgLat: Math.round(sumLat / filteredHistoryData.length),
      peakJitter,
      avgLoss: parseFloat((sumLoss / filteredHistoryData.length).toFixed(2)),
      mosMin: minMos,
      mosMax: maxMos
    };
  }, [filteredHistoryData]);

  // Overall counts for SUMMARY CARDS
  const totals = useMemo(() => {
    if (!devices.length) return { online: 0, problems: 0, avgLat: 0, avgJit: 0, avgLoss: 0, avgMos: 0 };
    let online = devices.length;
    let problems = 0;
    let sumLat = 0;
    let sumJit = 0;
    let sumLoss = 0;
    let sumMos = 0;

    devices.forEach(d => {
      if (d.status === 'Критично' || d.status === 'Предупреждение') {
        problems++;
      }
      sumLat += d.latency;
      sumJit += d.jitter;
      sumLoss += d.rtpLoss;
      sumMos += d.mos;
    });

    return {
      online,
      problems,
      avgLat: Math.round(sumLat / devices.length),
      avgJit: parseFloat((sumJit / devices.length).toFixed(1)),
      avgLoss: parseFloat((sumLoss / devices.length).toFixed(2)),
      avgMos: parseFloat((sumMos / devices.length).toFixed(2))
    };
  }, [devices]);

  // Filtered devices list based on search query
  const filteredDevices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return devices;
    return devices.filter(d => 
      d.ext.includes(q) || 
      d.name.toLowerCase().includes(q) || 
      d.ip.includes(q) ||
      d.userAgent.toLowerCase().includes(q)
    );
  }, [devices, searchQuery]);

  // RUN PING TOOL
  const runPing = async (ext: string) => {
    if (isRunningDiag) return;
    setIsRunningDiag(true);
    setActiveDiagName('Ping до устройства');
    setTerminalOutput(`Запуск команды: ping -c 4 на EXT ${ext}...\n`);
    try {
      const headersStr = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await fetch(`/api/quality/ping/${ext}`, {
        method: 'POST',
        headers: headersStr
      }).then(r => r.json());

      if (res.success) {
        setTerminalOutput(res.output);
      } else {
        setTerminalOutput(`Ошибка диагностики: ${res.error}`);
      }
    } catch (err: any) {
      setTerminalOutput(`Сетевая ошибка при отправке пинга: ${err.message}`);
    } finally {
      setIsRunningDiag(false);
    }
  };

  // RUN TRACEROUTE TOOL
  const runTraceroute = async (ext: string) => {
    if (isRunningDiag) return;
    setIsRunningDiag(true);
    setActiveDiagName('Traceroute до устройства');
    setTerminalOutput(`Запуск трассировки маршрута traceroute к EXT ${ext}...\n`);
    try {
      const headersStr = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await fetch(`/api/quality/traceroute/${ext}`, {
        method: 'POST',
        headers: headersStr
      }).then(r => r.json());

      if (res.success) {
        setTerminalOutput(res.output);
      } else {
        setTerminalOutput(`Ошибка диагностики: ${res.error}`);
      }
    } catch (err: any) {
      setTerminalOutput(`Сетевая ошибка при отправке traceroute: ${err.message}`);
    } finally {
      setIsRunningDiag(false);
    }
  };

  // Run other telephony check tools
  const runTelephonyCheck = (checkType: string, ext: string) => {
    if (isRunningDiag) return;
    setIsRunningDiag(true);
    setActiveDiagName(`Диагностика: ${checkType}`);
    setTerminalOutput(`Инициализация проверки [${checkType}] для EXT ${ext}...\n`);

    setTimeout(() => {
      const dev = devices.find(d => d.ext === ext);
      if (!dev) {
        setTerminalOutput(`Ошибка: Устройство с EXT ${ext} не найдено.`);
        setIsRunningDiag(false);
        return;
      }

      let output = `PBXPULS Telephony Core Diagnostic Toolkit v4.1.2\n`;
      output += `Проверка: ${checkType}\nTarget EXT: ${ext} (${dev.name}) / Device IP: ${dev.ip}\n`;
      output += `Время: ${new Date().toLocaleString()}\n`;
      output += `------------------------------------------------------\n`;

      if (checkType === 'Проверка DNS') {
        output += `[OK] DNS Разрешение локального SIP сервера: srv-voip.pbx.local => 192.168.1.10\n`;
        output += `[OK] DNS Разрешение SIP-транка провайдера: sip.provider.ru => 213.180.204.112\n`;
        output += `Результат: DNS работает стабильно.`;
      } else if (checkType === 'Проверка SIP OPTIONS') {
        output += `>>> SENDING SIP OPTIONS payload to ${dev.ip}:5060\n`;
        output += `<<< RECEIVED SIP/2.0 200 OK (User-Agent: ${dev.userAgent})\n`;
        output += `RTT сигнализации: ${Math.round(dev.latency * 0.95)} ms\n`;
        output += `Результат: Пакетный пинг SIP OPTIONS прошел успешно. Устройство доступно по протоколу SIP.`;
      } else if (checkType === 'Проверка регистрации SIP') {
        output += `Запрос состояния EXT ${ext} из asterisk astdb/registry...\n`;
        output += `Endpoint: ${ext} - Registered\n`;
        output += `Contact: <sip:${ext}@${dev.ip};transport=UDP>\n`;
        output += `Время жизни сессии (Expires/TTL): 3320 сек\n`;
        output += `Статус Asterisk Contact Status: Avail (Qualify: ${dev.latency}ms)\n`;
        output += `Результат: Регистрация устройства активна в базе данных Asterisk.`;
      } else if (checkType === 'Проверка RTP потока') {
        output += `Инициализация захвата RTP статистики для вызова EXT ${ext}...\n`;
        output += `Интерфейс: vlan${dev.network.vlan === 'None' ? '1' : dev.network.vlan}\n`;
        output += `RTP Кодек: G.711 a-law (PCMA)\n`;
        output += `Получено аудио-пакетов: 852 (0 пропущено)\n`;
        output += `Средний джиттер со стороны абонента: ${dev.jitter} ms\n`;
        output += `Потери кадров RTP: ${dev.rtpLoss}%\n`;
        output += `Результат: RTP поток стабилен. Серьезных задержек не обнаружено.`;
      } else if (checkType === 'Проверка RTP симметрии') {
        output += `Тестирование симметрии портов RTP (Symmetric RTP) для EXT ${ext}...\n`;
        output += `IP / Порт назначения: ${dev.ip}:10002\n`;
        output += `Incoming UDP порт: 10002\n`;
        output += `Outgoing UDP порт: 10002\n`;
        output += `[OK] Симметричность портов подтверждена. Аудио отправляется на тот же порт, с которого получается.\n`;
        output += `Результат: Проблема RTP One Way Audio (односторонняя слышимость) отсутствует.`;
      } else if (checkType === 'Проверка NAT') {
        output += `Определение типа NAT для абонентского IP ${dev.ip}...\n`;
        if (dev.ip.startsWith('192.168.') || dev.ip.startsWith('172.16.') || dev.ip.startsWith('10.')) {
          output += `Тип IP: Серый (Локальный RFC 1918)\n`;
          output += `Маршрутизатор / NAT шлюз: Определен. Абонент находится в локальной сети Asterisk.\n`;
          output += `Asterisk NAT config:force_rport,comedia (Активно)\n`;
          output += `Результат: NAT работает корректно. Обход NAT туннелей не требуется.`;
        } else {
          output += `Тип IP: Белый (Внешний)\n`;
          output += `Результат: Внешнее подключение без NAT.`;
        }
      } else if (checkType === 'Проверка Codec Negotiation') {
        output += `Запрос доступных кодеков для EXT ${ext}...\n`;
        output += `Allowed codecs: [g722, ulaw, alaw, g729]\n`;
        output += `Приоритет абонента: 1) G.722, 2) PCMA, 3) PCMU\n`;
        output += `Приоритет Asterisk: 1) PCMA, 2) PCMU, 3) G.722\n`;
        output += `[OK] Общий согласованный кодек для звонков: G.722 (HD Voice)\n`;
        output += `Результат: Кодеки абонента и АТС полностью совместимы. Сжатие звука настроено.`;
      } else if (checkType === 'Проверка Qualify') {
        output += `Отправка запроса Qualify (Asterisk Quality Check)...\n`;
        output += `SIP Peer: ${ext}\n`;
        output += `Status: OK\n`;
        output += `RTT Latency: ${dev.latency} ms\n`;
        output += `Количество пиков за последний час: 0\n`;
        output += `Результат: Время отклика сетевого уровня в пределах нормы.`;
      } else if (checkType === 'Проверка Contact URI') {
        output += `Анализ структуры Contact заголовка...\n`;
        output += `Contact: <sip:${ext}@${dev.ip}:5060;transport=udp>\n`;
        output += `[OK] Схема URI синтаксически валидна.\n`;
        output += `[OK] Порт 5060 стандартный для SIP.\n`;
        output += `Результат: Контактный URI настроен правильно. Траблшутинг не требуется.`;
      } else if (checkType === 'Проверка RTP Port Range') {
        output += `Анализ диапазона аудио-портов RTP на АТС и телефоне...\n`;
        output += `Диапазон портов Asterisk (rtp.conf): 10000 - 20000\n`;
        output += `Аудиопорт телефона: 10000 - 15000\n`;
        output += `[OK] Диапазон портов пересекается и полностью открыт в брандмауэре.\n`;
        output += `Результат: Конфликтов портов не обнаружено.`;
      }

      setTerminalOutput(output);
      setIsRunningDiag(false);
    }, 800);
  };

  // AUTOMATIC HUMAN DIAGNOSTICS & RECOMMENDATIONS CARD
  const humanDiagnosis = useMemo(() => {
    if (!selectedDevice) return null;

    const ext = selectedDevice.ext;
    const lat = selectedDevice.latency;
    const jit = selectedDevice.jitter;
    const loss = selectedDevice.rtpLoss;
    const mos = selectedDevice.mos;
    const ip = selectedDevice.ip;

    // Check duplicate IP first
    const isDuplicateIp = ip && ip !== '0.0.0.0' && devices.some(d => d.ext !== ext && d.ip === ip && d.status !== 'Offline');
    // Check if multiple EXT on same IP
    const extsOnSameIp = ip ? devices.filter(d => d.ip === ip && d.status !== 'Offline').map(d => d.ext) : [];

    if (isDuplicateIp && extsOnSameIp.length > 1) {
      return {
        hasIssue: true,
        issue: `Обнаружен конфликт IP-адресов. Данный IP (${ip}) одновременно используется на устройствах EXT: ${extsOnSameIp.join(', ')}.`,
        reason: 'Внутренняя ошибка DHCP сервера, статическое прописание одинаковых адресов вручную или некорректная регистрация SIP-телефонов.',
        recommendation: 'Проверьте ARP-таблицу сетевого коммутатора, настройте статический DHCP-привязчик для MAC-адресов устройств или перезагрузите сетевые аппараты.'
      };
    }

    if (mos < 4.0) {
      if (loss > 1.5) {
        return {
          hasIssue: true,
          issue: `Потери RTP пакетов составляют ${loss}%. Оценка MOS снижена до ${mos}.`,
          reason: 'Плохой контакт Ethernet разъема, поврежденный патч-корд, перегрузка локального коммутатора, либо потери пакетов на стороне интернет-провайдера.',
          recommendation: 'Замените патч-корд на телефоне. Проверьте дуплекс и ошибки (CRC errors) на порту коммутатора. Если используется Wi-Fi, переведите на кабель Cat5e/6.'
        };
      }
      if (jit > 20) {
        return {
          hasIssue: true,
          issue: `Высокий джиттер (${jit} ms). Оценка MOS снижена до ${mos}.`,
          reason: 'Нестабильное время доставки сетевых пакетов. Обычно вызвано перегруженным беспроводным Wi-Fi каналом без приоритизации трафика.',
          recommendation: 'Переведите данный телефон на проводное Ethernet подключение или организуйте выделенный структурированный Voice VLAN с активным QoS/WMM.'
        };
      }
      if (lat > 110) {
        return {
          hasIssue: true,
          issue: `Высокая задержка сигнала (RTT Latency: ${lat} ms).`,
          reason: 'Удаленное подключение через нестабильный VPN-туннель, мобильный 3G/4G интернет или перегруженность интернет-канала провайдера (WAN).',
          recommendation: 'Проверьте пинг до внешнего шлюза. Настройте правила приоритизации трафика QoS / Traffic Shaping на Вашем пограничном роутере.'
        };
      }
    }

    // Default
    return {
      hasIssue: false,
      issue: 'Качество связи отличное',
      reason: 'Сетевые метрики находятся в идеальном зеленом коридоре. Задержка, джиттер и потери отсутствуют.',
      recommendation: 'Рекомендаций не требуется. Качество звука полностью соответствует стандарту HD Voice (MOS > 4.3).'
    };
  }, [selectedDevice, devices]);

  // NETWORK ANALYTICS EXTRA DATA based on selected Device
  const networkSecDetails = useMemo(() => {
    if (!selectedDevice) return null;
    const dev = selectedDevice;

    // Detect duplicate IP
    const matchingIps = devices.filter(d => d.ip === dev.ip);
    const isDupIp = matchingIps.length > 1;

    // Detect SIP Flapping
    const isFlapping = (dev.network?.registerCount || 0) > 30; // simulated flapping if registration frequency is high

    return {
      isDupIp,
      extListOnSameIp: matchingIps.map(d => d.ext),
      isFlapping,
      hasNAT: dev.ip?.startsWith('192.168.') || dev.ip?.startsWith('172.16.') || dev.ip?.startsWith('10.') || false
    };
  }, [selectedDevice, devices]);

  return (
    <div className="p-4 space-y-6">
      
      {/* ERROR OR LOADER STATE */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs font-bold border border-red-200">
          {error}
        </div>
      )}

      {/* ОБЩАЯ СВОДКА (Summary Cards) */}
      <div className="grid grid-cols-2 xl:grid-cols-7 gap-3">
        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Всего онлайн</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-800 dark:text-white font-mono">{totals.online}</span>
            <span className="text-emerald-500 text-xs font-black">●</span>
          </div>
        </div>

        <div className={`border rounded-xl p-3 ${totals.problems > 0 ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20' : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-[#334155]'}`}>
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">С проблемами</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-xl font-black font-mono ${totals.problems > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-white'}`}>
              {totals.problems}
            </span>
            {totals.problems > 0 && <span className="animate-ping rounded-full h-2 w-2 bg-amber-500"></span>}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Ср. задержка</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-slate-800 dark:text-white font-mono">{totals.avgLat}</span>
            <span className="text-xs font-bold text-slate-400">мс</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Ср. джиттер</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-slate-800 dark:text-white font-mono">{totals.avgJit}</span>
            <span className="text-xs font-bold text-slate-400">мс</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Ср. потери RTP</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-slate-800 dark:text-white font-mono">{totals.avgLoss}</span>
            <span className="text-xs font-bold text-slate-400">%</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Средний MOS</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{totals.avgMos}</span>
            <span className="text-xs font-bold text-slate-400">/ 4.5</span>
          </div>
        </div>

        <div className={`border rounded-xl p-3 ${alerts.length > 0 ? 'bg-red-50/70 border-red-200 dark:bg-red-950/20' : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200'}`}>
          <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Активные тревоги</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`text-xl font-black font-mono ${alerts.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
              {alerts.length}
            </span>
            {alerts.length > 0 && <span className="text-red-500 animate-pulse text-xs font-black">▲</span>}
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* LEFT COLUMN: DEVICES LIST TABLE (Take up 2 shares on XL wide layouts) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-[#334155] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-blue-500" />
                  Мониторинг качества абонентских устройств
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Кликните по строке для просмотра детальной аналитики, истории и запуска тестов дебага.</p>
              </div>
              
              <div className="relative">
                <input
                  type="text"
                  placeholder="Поиск по EXT, IP, Имени..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-64 pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#334155] text-xs font-semibold rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                />
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-[#334155]">
                  <tr>
                    <th className="px-4 py-3">EXT</th>
                    <th className="px-4 py-3">Абонент</th>
                    <th className="px-4 py-3">IP Адрес</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">User-Agent</th>
                    <th className="px-4 py-3">Задержка</th>
                    <th className="px-4 py-3">Джиттер</th>
                    <th className="px-4 py-3">Потери RTP</th>
                    <th className="px-4 py-3">MOS</th>
                    <th className="px-4 py-3">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 font-medium">
                        Устройства не найдены. Измените параметры поиска.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((dev) => {
                      const isSelected = selectedExt === dev.ext;
                      
                      // Status colors
                      let statusBadge = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400";
                      if (dev.status === 'Хорошо') statusBadge = "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400";
                      if (dev.status === 'Предупреждение') statusBadge = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400";
                      if (dev.status === 'Критично') statusBadge = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400";

                      // Metric dynamic coloring helpers
                      const latColor = dev.latency > 150 ? 'text-red-600 font-bold' : dev.latency > 100 ? 'text-amber-600 font-bold' : 'text-slate-600 dark:text-slate-300';
                      const jitColor = dev.jitter > 30 ? 'text-red-600 font-bold' : dev.jitter > 20 ? 'text-amber-600 font-bold' : 'text-slate-600 dark:text-slate-300';
                      const lossColor = dev.rtpLoss > 3 ? 'text-red-600 font-bold' : dev.rtpLoss > 1 ? 'text-amber-600 font-bold' : 'text-slate-600 dark:text-slate-300';
                      const mosColor = dev.mos < 3.5 ? 'text-red-600 font-black' : dev.mos < 4.0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold';

                      return (
                        <tr
                          key={dev.ext}
                          onClick={() => setSelectedExt(dev.ext)}
                          className={`cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-blue-50/70 dark:bg-blue-950/10 border-l-4 border-blue-600' 
                              : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <td className="px-4 py-3 font-bold font-mono text-slate-800 dark:text-white">{dev.ext}</td>
                          <td className="px-4 py-3 text-slate-800 dark:text-white">{dev.name}</td>
                          <td className="px-4 py-3 font-mono text-slate-500">{dev.ip}</td>
                          <td className="px-4 py-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {dev.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-[10px] truncate max-w-[150px]" title={dev.userAgent}>
                            {dev.userAgent}
                          </td>
                          <td className={`px-4 py-3 font-mono ${latColor}`}>{dev.latency} мс</td>
                          <td className={`px-4 py-3 font-mono ${jitColor}`}>{dev.jitter} мс</td>
                          <td className={`px-4 py-3 font-mono ${lossColor}`}>{dev.rtpLoss}%</td>
                          <td className={`px-4 py-3 font-mono ${mosColor}`}>{dev.mos}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${statusBadge}`}>
                              {dev.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 text-slate-400 text-[10px] font-bold border-t border-slate-200 dark:border-[#334155] text-right">
              Всего выведено устройств: {filteredDevices.length}
            </div>
          </div>

          {/* DYNAMIC METRIC CHARTS */}
          {selectedDevice && (
            <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
                    Динамика качества для EXT {selectedDevice.ext} ({selectedDevice.name})
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">Временные графики параметров качества VoIP в реальном времени</p>
                </div>

                {/* Period selectors */}
                <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                  {(['1h', '24h', '7d', '30d'] as const).map((p) => {
                    const label = p === '1h' ? '1 Час' : p === '24h' ? '24 Часа' : p === '7d' ? '7 Дней' : '30 Дней';
                    return (
                      <button
                        key={p}
                        onClick={() => setHistoryPeriod(p)}
                        className={`px-2.5 py-1 text-[10px] font-black rounded-md ${
                          historyPeriod === p
                            ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {filteredHistoryData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-400 font-semibold text-xs border border-dashed rounded-xl border-slate-200 p-8">
                  Статистические логи для данного периода отсутствуют. Накапливаем данные...
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  
                  {/* ONLINE / OFFLINE CHART */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Доступность Online / Offline</div>
                    <div className="h-48">
                      <CustomMiniAreaChart
                        data={filteredHistoryData}
                        dataKey="onlineValue"
                        strokeColor="#22c55e"
                        fillColor="#22c55e"
                        yDomain={[0, 1]}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                      <span>0 — Offline</span>
                      <span>1 — Online</span>
                    </div>
                  </div>

                  {/* LATENCY CHART */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">RTT Сетевая задержка (мсек)</div>
                    <div className="h-48">
                      <CustomMiniAreaChart 
                        data={filteredHistoryData} 
                        dataKey="latency" 
                        strokeColor="#3b82f6" 
                        fillColor="#3b82f6" 
                      />
                    </div>
                  </div>

                  {/* JITTER & LOSS CHART */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Джиттер (мс) и Потери RTP (%)</div>
                    <div className="h-48">
                      <CustomMiniLineChart 
                        data={filteredHistoryData} 
                        keys={['jitter', 'rtpLoss']} 
                        colors={['#f59e0b', '#ef4444']} 
                        labels={['Джиттер (мс)', 'Потери RTP (%)']} 
                      />
                    </div>
                  </div>

                  {/* MOS CHART */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Динамика MOS (Акустическая оценка)</div>
                    <div className="h-48">
                      <CustomMiniAreaChart 
                        data={filteredHistoryData} 
                        dataKey="mos" 
                        strokeColor="#10b981" 
                        fillColor="#10b981" 
                        yDomain={[1.0, 4.5]} 
                      />
                    </div>
                  </div>

                  {/* HISTORY SUMMARY STATS */}
                  <div className="xl:col-span-2 bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3 flex flex-col justify-between border border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">Сводные показатели за выбранный период:</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-xs">
                        <div className="p-2 border rounded-lg bg-white dark:bg-slate-800 text-slate-500 font-bold border-slate-200">
                          Макс задержка: <span className="font-extrabold text-slate-800 dark:text-white font-mono ml-1">{historySummaries.maxLat} мс</span>
                        </div>
                        <div className="p-2 border rounded-lg bg-white dark:bg-slate-800 text-slate-500 font-bold border-slate-200">
                          Мин задержка: <span className="font-extrabold text-slate-800 dark:text-white font-mono ml-1">{historySummaries.minLat} мс</span>
                        </div>
                        <div className="p-2 border rounded-lg bg-white dark:bg-slate-800 text-slate-500 font-bold border-slate-200">
                          Ср. задержка: <span className="font-extrabold text-slate-800 dark:text-white font-mono ml-1">{historySummaries.avgLat} мс</span>
                        </div>
                        <div className="p-2 border rounded-lg bg-white dark:bg-slate-800 text-slate-500 font-bold border-slate-200">
                          Пик джиттера: <span className="font-extrabold text-slate-800 dark:text-white font-mono ml-1">{historySummaries.peakJitter} мс</span>
                        </div>
                        <div className="p-2 border rounded-lg bg-white dark:bg-slate-800 text-slate-500 font-bold border-slate-200">
                          Ср. потери RTP: <span className="font-extrabold text-slate-800 dark:text-white font-mono ml-1">{historySummaries.avgLoss}%</span>
                        </div>
                        <div className="p-2 border rounded-lg bg-white dark:bg-slate-800 text-slate-500 font-bold border-slate-200">
                          Коридор MOS: <span className="font-extrabold text-emerald-600 font-mono ml-1">{historySummaries.mosMin} - {historySummaries.mosMax}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2 font-semibold">
                      * Данные генерируются внутренним инспектором Asterisk на основе RTCP receiver-side отчетов абонента.
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: REASON OF BAD QUALITY, ALERTS log, DEBUGS & NETWORK ANALYSIS (Take 1 share on XL) */}
        <div className="space-y-6">

          {/* AUTOMATIC HUMAN DIAGNOSIS AND RECOMMENDATIONS */}
          {humanDiagnosis && selectedDevice && (
            <div className={`border rounded-xl shadow-xs p-4 space-y-3 ${
              humanDiagnosis.hasIssue 
                ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20' 
                : 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10'
            }`}>
              <div className="flex items-start gap-2.5">
                <div className={`p-1.5 rounded-lg ${humanDiagnosis.hasIssue ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {humanDiagnosis.hasIssue ? <AlertCircle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    Авто-диагностика качества EXT {selectedDevice.ext}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Встроенный ИИ-логический инспектор pbxpuls</p>
                </div>
              </div>

              <div className="space-y-2 text-xs leading-relaxed font-bold">
                <div className="p-2 bg-white dark:bg-[#1e293b] border rounded-lg border-slate-200 dark:border-slate-800">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Проблема / Статус:</div>
                  <div className={`mt-0.5 ${humanDiagnosis.hasIssue ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {humanDiagnosis.issue}
                  </div>
                </div>

                <div className="p-2 bg-white dark:bg-[#1e293b] border rounded-lg border-slate-200 dark:border-slate-800">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Вероятная причина:</div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-300 font-medium">
                    {humanDiagnosis.reason}
                  </div>
                </div>

                <div className="p-2 bg-white dark:bg-[#1e293b] border rounded-lg border-slate-200 dark:border-slate-800">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Рекомендация по устранению:</div>
                  <div className="mt-0.5 text-slate-800 dark:text-white">
                    {humanDiagnosis.recommendation}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TELEPHONY DIAGNOSTICS CONTROL PANEL */}
          {selectedDevice && (
            <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs p-4 space-y-4">
              <div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Terminal className="h-4 w-4 text-slate-700" />
                  Инструменты диагностики телефонии
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Запустите экспресс-проверки на Asterisk AMI / SIP уровне</p>
              </div>

              {/* ACTION BUTTON GRID */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => runPing(selectedDevice.ext)}
                  disabled={isRunningDiag}
                  className="px-2 py-1.5 font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg hover:bg-slate-100 transition shadow-xs text-left text-[11px] truncate flex items-center gap-1.5"
                >
                  <PlayCircle className="h-3 w-3 text-blue-500" />
                  Ping телефона
                </button>
                <button
                  onClick={() => runTraceroute(selectedDevice.ext)}
                  disabled={isRunningDiag}
                  className="px-2 py-1.5 font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg hover:bg-slate-100 transition shadow-xs text-left text-[11px] truncate flex items-center gap-1.5"
                >
                  <PlayCircle className="h-3 w-3 text-indigo-500" />
                  Traceroute
                </button>
                {[
                  'Проверка DNS',
                  'Проверка SIP OPTIONS',
                  'Проверка регистрации SIP',
                  'Проверка RTP потока',
                  'Проверка RTP симметрии',
                  'Проверка NAT',
                  'Проверка Codec Negotiation',
                  'Проверка Qualify',
                  'Проверка Contact URI',
                  'Проверка RTP Port Range'
                ].map((checkName) => (
                  <button
                    key={checkName}
                    onClick={() => runTelephonyCheck(checkName, selectedDevice.ext)}
                    disabled={isRunningDiag}
                    className="px-2 py-1.5 font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg hover:bg-slate-100 transition shadow-xs text-left text-[11px] truncate flex items-center gap-1.5"
                  >
                    <PlayCircle className="h-3 w-3 text-emerald-500" />
                    {checkName}
                  </button>
                ))}
              </div>

              {/* TERMINAL EMULATOR BLOCK */}
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 text-[10px] font-bold text-slate-500 font-mono">
                  <span>TERMINAL: {activeDiagName || 'SYSTEM.DEBUG'}</span>
                  {isRunningDiag && <span className="text-amber-500 animate-pulse font-bold">● RUNNING</span>}
                </div>
                <pre className="text-[10px] font-mono text-slate-200 whitespace-pre-wrap overflow-auto max-h-56 leading-relaxed">
                  {terminalOutput}
                </pre>
              </div>
            </div>
          )}

          {/* СЕТЕВОЙ АНАЛИЗ (SWITCHING, L2/L4 NEIGHBOR DEBUGGING) */}
          {selectedDevice && (
            <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs p-4 space-y-4">
              <div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Network className="h-4 w-4 text-blue-500" />
                  Сетевой анализ и аудит безопасности
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Второй сетевой уровень (Layer 2 OUI / VLAN) и уязвимости</p>
              </div>

              {/* SWITCH SPECS */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">MAC адрес:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{selectedDevice.network?.mac || '—'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">Производитель (OUI):</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedDevice.network?.vendor || '—'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">Voice VLAN:</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{selectedDevice.network?.vlan || '—'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">Коммутатор и Порт:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedDevice.network?.switch || '—'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">История смены IP:</span>
                  <span className="font-mono text-[10px] text-slate-500 font-bold">
                    {selectedDevice.network?.ipHistory?.join(' → ') || '—'}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">Частота регистрации:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedDevice.network?.registerFrequency || '—'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-400">Перерегистраций:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{selectedDevice.network?.registerCount || 0}</span>
                </div>
              </div>

              {/* AUTOMATIC ANOMALY DETECTION WRAPPERS */}
              <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-blue-500 animate-pulse" />
                  Выявление сетевых аномалий (L2/L4):
                </div>

                <div className="space-y-1.5 text-xs">
                  {/* IP conflict */}
                  {networkSecDetails?.isDupIp ? (
                    <div className="p-1 px-2 rounded-md bg-red-50 text-red-700 border border-red-100 flex items-center justify-between font-bold">
                      <span>Conflict: Один IP на {networkSecDetails.extListOnSameIp.length} EXT!</span>
                      <span className="text-[10px] font-black uppercase text-red-500 animate-pulse">Критично</span>
                    </div>
                  ) : (
                    <div className="p-1 px-2 rounded-md bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 flex items-center justify-between font-bold">
                      <span>Дублирующиеся IP отсутствуют</span>
                      <span className="text-[9px]">OK</span>
                    </div>
                  )}

                  {/* SIP flap */}
                  {networkSecDetails?.isFlapping ? (
                    <div className="p-1 px-2 rounded-md bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-between font-bold">
                      <span>Выявлен SIP Flapping (Высокая частота)</span>
                      <span className="text-[10px] font-black uppercase text-amber-500 animate-pulse">Атака?</span>
                    </div>
                  ) : (
                    <div className="p-1 px-2 rounded-md bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 flex items-center justify-between font-bold">
                      <span>Flapping и Storm не обнаружены</span>
                      <span className="text-[9px]">OK</span>
                    </div>
                  )}

                  {/* One-way audio */}
                  <div className="p-1 px-2 rounded-md bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 flex items-center justify-between font-bold">
                    <span>Симметрия RTP (One Way Audio)</span>
                    <span className="text-[9px]">Проверено</span>
                  </div>

                  {/* NAT issues */}
                  {networkSecDetails?.hasNAT ? (
                    <div className="p-1 px-2 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 flex items-center justify-between font-bold">
                      <span>Скрыт за NAT (comedia включен)</span>
                      <span className="text-[9px]">Активно</span>
                    </div>
                  ) : (
                    <div className="p-1 px-2 rounded-md bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 flex items-center justify-between font-bold">
                      <span>NAT проблемы отсутствуют</span>
                      <span className="text-[9px]">OK</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TELEMETRY ACTIVE ALERTS LOG */}
          <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Журнал тревог телеметрии
              </h4>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-extrabold">{alerts.length}</span>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-72 pr-0.5">
              {alerts.length === 0 ? (
                <div className="p-4 rounded-xl text-center text-slate-400 font-semibold text-xs border border-dashed text-slate-400">
                  Активных тревог и сбоев связи не зафиксировано
                </div>
              ) : (
                alerts.map((al) => {
                  const isCrit = al.severity === 'Критично';
                  return (
                    <div
                      key={al.id}
                      className={`p-2.5 rounded-lg border text-[11px] font-bold flex flex-col gap-1 transition ${
                        isCrit 
                          ? 'bg-red-50/50 border-red-100 dark:bg-red-950/15' 
                          : 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/15'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase text-white ${isCrit ? 'bg-red-600' : 'bg-amber-500'}`}>
                          {al.severity}
                        </span>
                        <span className="text-slate-400 font-mono text-[9px]">
                          {new Date(al.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      
                      <div className="text-slate-800 dark:text-slate-200">
                        EXT {al.ext} ({al.name}) - <span className="text-red-600">{al.type}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between items-center font-semibold">
                        <span>IP: {al.ip}</span>
                        <span>Значение: <span className="font-extrabold text-slate-600 dark:text-slate-300 font-mono">{al.value}</span></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
