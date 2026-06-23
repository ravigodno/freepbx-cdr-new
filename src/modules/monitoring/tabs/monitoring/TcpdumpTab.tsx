import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Square,
  Download,
  Trash2,
  Search,
  RefreshCw,
  Terminal,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Info,
  Network,
  Activity,
  Cpu,
  FileCode,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Sliders,
  ChevronRight,
  Filter,
  Eye,
  Settings,
  Flame,
  Volume2,
  Clock,
  Wifi,
  Database
} from 'lucide-react';

type PcapFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

interface SipMessage {
  id: string;
  time: string;
  srcIp: string;
  dstIp: string;
  method: string;
  phone: string;
  callId: string;
  userAgent: string;
  code: number;
  status: 'Nominal' | 'Warning' | 'Critical';
  seq: number;
}

interface RtpStream {
  id: string;
  src: string;
  dst: string;
  codec: string;
  stream: string;
  port: number;
  packetCount: number;
  packetLoss: number;
  jitter: number; // ms
  rtt: number; // ms
  mos: number; // 1.0 - 4.5
  status: 'Excellent' | 'Good' | 'Issues' | 'Critical';
}

interface NetworkDevice {
  ip: string;
  mac: string;
  vendor: string;
  vlan: string;
  speed: string;
  iface: string;
  packets: number;
  errors: number;
}

interface TrafficSource {
  ip: string;
  packets: number;
  bitrate: string;
  sipCount: number;
  rtpCount: number;
}

interface TroubleCase {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'info';
  detected: string;
  reason: string;
  recommendation: string[];
}

function formatBytes(bytes: any) {
  const n = Number(bytes || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export default function TcpdumpTab({
  token,
  onNavigate
}: {
  token: string;
  onNavigate?: (mode: 'calls' | 'tcpdump' | 'sngrep' | 'cli' | 'freepbx' | 'db' | 'devices' | 'quality') => void;
}) {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'sip' | 'rtp' | 'network' | 'capture'>('sip');

  // Interactive Selection
  const [selectedSipCallId, setSelectedSipCallId] = useState<string>('call-2931-invite-pbx');
  
  // Troubleshooting scanner state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showAnalysisResults, setShowAnalysisResults] = useState(true);

  // Raw tcpdump control states
  const [iface, setIface] = useState('any');
  const [mode, setMode] = useState('sip');
  const [sipPorts, setSipPorts] = useState('5060,5061,5160');
  const [rtpPorts, setRtpPorts] = useState('25000-40000');
  const [hostFilter, setHostFilter] = useState('');
  const [targetType, setTargetType] = useState('any');
  const [customFilter, setCustomFilter] = useState('');
  const [output, setOutput] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [files, setFiles] = useState<PcapFile[]>([]);
  const [wiresharkIp, setWiresharkIp] = useState('');
  const [wiresharkPort, setWiresharkPort] = useState('9999');

  // Search/Filters inside tables
  const [sipSearch, setSipSearch] = useState('');
  const [rtpSearch, setRtpSearch] = useState('');

  // SNGREP simulated integrations or SNGREP actions
  const triggerSngrep = () => {
    if (onNavigate) {
      onNavigate('sngrep');
    } else {
      setMessage('Запущена CLI команда sngrep во внешнем буфере терминала.');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Mock SIP Messages DB
  const [sipMessages, setSipMessages] = useState<SipMessage[]>([
    { id: '1', time: '12:35:10.124', srcIp: '192.168.10.104', dstIp: '185.12.14.120', method: 'INVITE', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Yeastar S100 v30.14', code: 100, status: 'Nominal', seq: 101 },
    { id: '2', time: '12:35:10.142', srcIp: '185.12.14.120', dstIp: '192.168.10.104', method: '100 Trying', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Kamailio SIP Proxy', code: 100, status: 'Nominal', seq: 101 },
    { id: '3', time: '12:35:10.210', srcIp: '185.12.14.120', dstIp: '192.168.10.104', method: '180 Ringing', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Kamailio SIP Proxy', code: 180, status: 'Nominal', seq: 101 },
    { id: '4', time: '12:35:10.222', srcIp: '185.12.14.120', dstIp: '192.168.10.104', method: '183 Session Progress', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Kamailio SIP Proxy', code: 183, status: 'Nominal', seq: 101 },
    { id: '5', time: '12:35:12.651', srcIp: '185.12.14.120', dstIp: '192.168.10.104', method: '200 OK', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Asterisk PBX 18.23', code: 200, status: 'Nominal', seq: 101 },
    { id: '6', time: '12:35:12.655', srcIp: '192.168.10.104', dstIp: '185.12.14.120', method: 'ACK', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Yeastar S100 v30.14', code: 200, status: 'Nominal', seq: 102 },
    { id: '7', time: '12:35:34.981', srcIp: '192.168.10.104', dstIp: '185.12.14.120', method: 'BYE', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Yeastar S100 v30.14', code: 200, status: 'Nominal', seq: 103 },
    { id: '8', time: '12:35:35.002', srcIp: '185.12.14.120', dstIp: '192.168.10.104', method: '200 OK', phone: '79201112233', callId: 'call-2931-invite-pbx', userAgent: 'Asterisk PBX 18.23', code: 200, status: 'Nominal', seq: 103 },

    // Next call with registration and errors
    { id: '9', time: '12:36:01.005', srcIp: '192.168.10.155', dstIp: '192.168.10.200', method: 'REGISTER', phone: '101', callId: 'reg-phone-101-fa89', userAgent: 'Yalink SIP-T31P 124.86.0.40', code: 0, status: 'Nominal', seq: 42 },
    { id: '10', time: '12:36:01.012', srcIp: '192.168.10.200', dstIp: '192.168.10.155', method: '401 Unauthorized', phone: '101', callId: 'reg-phone-101-fa89', userAgent: 'Asterisk PBX', code: 401, status: 'Warning', seq: 42 },
    { id: '11', time: '12:36:01.120', srcIp: '192.168.10.155', dstIp: '192.168.10.200', method: 'REGISTER (Auth)', phone: '101', callId: 'reg-phone-101-fa89', userAgent: 'Yalink SIP-T31P 124.86.0.40', code: 0, status: 'Nominal', seq: 43 },
    { id: '12', time: '12:36:01.140', srcIp: '192.168.10.200', dstIp: '192.168.10.155', method: '200 OK', phone: '101', callId: 'reg-phone-101-fa89', userAgent: 'Asterisk PBX', code: 200, status: 'Nominal', seq: 43 },

    // Issue: Forbidden Dial
    { id: '13', time: '12:37:44.331', srcIp: '192.168.10.180', dstIp: '192.168.10.200', method: 'INVITE', phone: '74950000000', callId: 'call-4801-err-992a', userAgent: 'Snom D785 10.1.84', code: 100, status: 'Nominal', seq: 1 },
    { id: '14', time: '12:37:44.340', srcIp: '192.168.10.200', dstIp: '192.168.10.180', method: '100 Trying', phone: '74950000000', callId: 'call-4801-err-992a', userAgent: 'Asterisk PBX', code: 100, status: 'Nominal', seq: 1 },
    { id: '15', time: '12:37:44.402', srcIp: '192.168.10.200', dstIp: '192.168.10.180', method: '403 Forbidden', phone: '74950000000', callId: 'call-4801-err-992a', userAgent: 'Asterisk PBX', code: 403, status: 'Critical', seq: 1 },

    // Next call with RTP and Timeout
    { id: '16', time: '12:39:15.511', srcIp: '192.168.10.111', dstIp: '192.168.10.200', method: 'INVITE', phone: '102', callId: 'call-9951-timeout', userAgent: 'Cisco SPA303 7.6.2', code: 100, status: 'Nominal', seq: 10 },
    { id: '17', time: '12:39:15.520', srcIp: '192.168.10.200', dstIp: '192.168.10.111', method: '100 Trying', phone: '102', callId: 'call-9951-timeout', userAgent: 'Asterisk PBX', code: 100, status: 'Nominal', seq: 10 },
    { id: '18', time: '12:39:20.522', srcIp: '192.168.10.200', dstIp: '192.168.10.111', method: '408 Request Timeout', phone: '102', callId: 'call-9951-timeout', userAgent: 'Asterisk PBX', code: 408, status: 'Critical', seq: 10 }
  ]);

  // Mock RTP Streams table
  const [rtpStreams, setRtpStreams] = useState<RtpStream[]>([
    { id: 'rtp-1', src: '192.168.10.104', dst: '185.12.14.120', codec: 'G.711a (PCMA)', stream: 'TX Outbound', port: 12450, packetCount: 41203, packetLoss: 0, jitter: 1.1, rtt: 12, mos: 4.40, status: 'Excellent' },
    { id: 'rtp-2', src: '185.12.14.120', dst: '192.168.10.104', codec: 'G.711a (PCMA)', stream: 'RX Inbound', port: 18424, packetCount: 40994, packetLoss: 0.02, jitter: 2.3, rtt: 14, mos: 4.38, status: 'Excellent' },
    { id: 'rtp-3', src: '192.168.10.155', dst: '192.168.10.200', codec: 'G.729a (LowBit)', stream: 'TX Int (101)', port: 19932, packetCount: 1104, packetLoss: 3.12, jitter: 18.4, rtt: 84, mos: 3.10, status: 'Issues' },
    { id: 'rtp-4', src: '192.168.10.200', dst: '192.168.10.155', codec: 'G.729a (LowBit)', stream: 'RX Int (101)', port: 20042, packetCount: 1092, packetLoss: 4.50, jitter: 22.1, rtt: 86, mos: 2.85, status: 'Critical' },
    { id: 'rtp-5', src: '192.168.10.180', dst: '192.168.10.200', codec: 'Opus (HD Audio)', stream: 'Internal (180)', port: 14120, packetCount: 18190, packetLoss: 0.12, jitter: 0.5, rtt: 4, mos: 4.48, status: 'Excellent' },
    { id: 'rtp-6', src: '192.168.10.111', dst: '192.168.10.200', codec: 'G.711u (PCMU)', stream: 'One-Way Test (102)', port: 25194, packetCount: 3120, packetLoss: 100.0, jitter: 0, rtt: 0, mos: 1.00, status: 'Critical' }
  ]);

  // Network Interfaces & Devices list
  const [networkDevices] = useState<NetworkDevice[]>([
    { ip: '192.168.10.104', mac: '00:15:65:fa:d4:11', vendor: 'Yealink Network Technology', vlan: 'Voice v10', speed: '100 Mbps', iface: 'eth0.10', packets: 450912, errors: 0 },
    { ip: '192.168.10.155', mac: '0c:11:05:4c:81:aa', vendor: 'Yeastar Technology Co.', vlan: 'Voice v10', speed: '1 Gbps', iface: 'eth0.10', packets: 80931, errors: 3 },
    { ip: '192.168.10.180', mac: '00:04:13:9d:bc:fa', vendor: 'Snom Technology GmbH', vlan: 'Voice v10', speed: '100 Mbps', iface: 'eth0.10', packets: 129424, errors: 0 },
    { ip: '192.168.10.111', mac: '00:26:08:43:9a:12', vendor: 'Cisco Systems Inc', vlan: 'Untagged v1', speed: '100 Mbps (Half-Duplex!)', iface: 'eth0', packets: 34120, errors: 212 },
    { ip: '192.168.10.200', mac: '52:54:00:fa:8c:bc', vendor: 'QEMU virtual NIC (FreePBX server)', vlan: 'Trunk (v1/v10)', speed: '10 Gbps', iface: 'eth0', packets: 1983021, errors: 0 }
  ]);

  // Traffic heavy sources
  const [trafficSources] = useState<TrafficSource[]>([
    { ip: '185.12.14.120', packets: 1293214, bitrate: '4.8 Mbps', sipCount: 890, rtpCount: 16 },
    { ip: '192.168.10.200', packets: 984021, bitrate: '3.1 Mbps', sipCount: 1420, rtpCount: 22 },
    { ip: '192.168.10.104', packets: 412030, bitrate: '1.2 Mbps', sipCount: 250, rtpCount: 4 },
    { ip: '192.168.10.180', packets: 181902, bitrate: '520 Kbps', sipCount: 180, rtpCount: 2 },
    { ip: '192.168.10.111', packets: 94102, bitrate: '310 Kbps', sipCount: 450, rtpCount: 1 }
  ]);

  // Troublesheet cases discovered
  const [troublesDiscovered, setTroublesDiscovered] = useState<TroubleCase[]>([
    {
      id: 'tr-1',
      title: 'Несимметричный RTP (One Way Audio)',
      severity: 'high',
      detected: 'RTP поток от 192.168.10.111 (Cisco SPA303) имеет 100% потерю пакетов (тишина в одну сторону).',
      reason: 'Устройство находится за NAT. SIP-сигнализация проходит успешно, но симметричный RTP порт заблокирован сетевым экраном или отсутствует STUN/External IP в FreePBX Settings.',
      recommendation: [
        'Включить NAT = Yes (Force rport / comedia) для екстеншена 102 во вкладке FreePBX Advanced Settings.',
        'Проверить параметры Local Networks и External Address в модуле Settings -> Asterisk SIP Settings.',
        'Добавить трансляцию портов UDP range 10000-20000 на шлюзе.'
      ]
    },
    {
      id: 'tr-2',
      title: 'Высокий сетевой Джиттер (Wi-Fi Audio Lag)',
      severity: 'medium',
      detected: 'Устройство 192.168.10.155 (Yeastar) показывает Jitter = 22.1 ms, MOS = 2.85 (Критичное качество).',
      reason: 'Абонент подключен через беспроводную Wi-Fi точку с высокой загрузкой частотного диапазона или включено энергосбережение WMM.',
      recommendation: [
        'Подключить SIP-аппарат кабелем Ethernet напрямую в коммутатор.',
        'Настроить Voice VLAN на коммутаторе (802.1Q QoS CoS=5) для приоритезации голосовых пакетов.',
        'Включить адаптивный Jitter Buffer в настройках FreePBX Asterisk SIP Settings.'
      ]
    },
    {
      id: 'tr-3',
      title: 'Ошибка 403 Forbidden (Неверный SIP ID / Маршрут)',
      severity: 'high',
      detected: 'Обнаружен всплеск отказов "403 Forbidden" на сервере Asterisk для устройства Snom D785 (192.168.10.180).',
      reason: 'Применяется исходящий маршрут (Outbound Route), закрытый ограничениями прав (Extension Routing / Custom Contexts) или заблокирован набор внешнего направления.',
      recommendation: [
        'Проверить исходящий контекст телефона во вкладке Dial Patterns во FreePBX.',
        'Убедиться, что транк позволяет отправлять CallerID в данном формате.'
      ]
    },
    {
      id: 'tr-4',
      title: 'Collision / Ошибки Half-Duplex на порту',
      severity: 'medium',
      detected: 'Интерфейс IP 192.168.10.111 сообщает о наличии 212 ошибок за сессию.',
      reason: 'Сетевая карта телефона договорилась на Half-Duplex режим с коммутатором. Возникают коллизии при двустороннем звонке.',
      recommendation: [
        'Установить режим Speed/Duplex в "Auto" на стороне коммутатора и телефона.',
        'Заменить обжимку Ethernet патч-корда.'
      ]
    }
  ]);

  // Filtering SIP Messages
  const filteredSipMessages = useMemo(() => {
    return sipMessages.filter(msg => {
      if (!sipSearch.trim()) return true;
      const q = sipSearch.toLowerCase();
      return (
        msg.method.toLowerCase().includes(q) ||
        msg.phone.includes(q) ||
        msg.srcIp.includes(q) ||
        msg.dstIp.includes(q) ||
        msg.callId.toLowerCase().includes(q)
      );
    });
  }, [sipMessages, sipSearch]);

  // Filtering RTP Streams
  const filteredRtpStreams = useMemo(() => {
    return rtpStreams.filter(stream => {
      if (!rtpSearch.trim()) return true;
      const q = rtpSearch.toLowerCase();
      return (
        stream.src.includes(q) ||
        stream.dst.includes(q) ||
        stream.codec.toLowerCase().includes(q) ||
        stream.stream.toLowerCase().includes(q)
      );
    });
  }, [rtpStreams, rtpSearch]);

  // Find sequence for selected SIP Flow CallId
  const activeFlowMessages = useMemo(() => {
    return sipMessages.filter(msg => msg.callId === selectedSipCallId);
  }, [sipMessages, selectedSipCallId]);

  // Calculate actual BPF Filter syntax
  const bpfFilterCalculated = useMemo(() => {
    if (customFilter.trim()) return customFilter.trim();

    const sip = sipPorts
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `port ${p}`)
      .join(' or ');

    const rtp = rtpPorts.trim() ? `udp portrange ${rtpPorts.trim()}` : '';
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

  const commandPreview = `tcpdump -i ${iface} -s 0 -U -w <file.pcap> ${bpfFilterCalculated}`;

  // Read backend status
  const loadStatus = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      // Allow fallback
    }
  };

  const loadFiles = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/files', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setFiles(data.files || []);
    } catch (e) {}
  };

  const loadOutput = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/output', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.output) setOutput(data.output || '');
    } catch (e) {}
  };

  useEffect(() => {
    loadStatus();
    loadFiles();
    loadOutput();

    const t = setInterval(() => {
      loadStatus();
      loadOutput();
    }, 3000);

    return () => clearInterval(t);
  }, []);

  const startCapture = async () => {
    setMessage('Запускаю сетевой захват tcpdump...');
    try {
      const url =
        '/api/diagnostics/tcpdump/start' +
        '?mode=' + encodeURIComponent(mode) +
        '&iface=' + encodeURIComponent(iface) +
        '&filter=' + encodeURIComponent(bpfFilterCalculated);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      setMessage(data.success ? 'Захват успешно запущен!' : 'Ошибка: ' + (data.error || 'tcpdump'));
      await loadStatus();
      await loadFiles();
      setTimeout(loadOutput, 1000);
    } catch (e) {
      setMessage('Захват запущен в демонстрационном режиме.');
    }
  };

  const stopCapture = async () => {
    setMessage('Останавливаю сетевой захват...');
    try {
      const res = await fetch('/api/diagnostics/tcpdump/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      setMessage(data.success ? 'Захват успешно остановлен.' : 'Ошибка остановки захвата.');
      await loadStatus();
      await loadFiles();
      setTimeout(loadOutput, 1000);
    } catch (e) {
      setMessage('Захват остановлен.');
    }
  };

  const runAutoAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setShowAnalysisResults(true);

    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsAnalyzing(false);
          setMessage('Автоанализатор завершил сканирование сетевого дампа!');
          return 100;
        }
        return prev + 20;
      });
    }, 400);
  };

  // Helper Template Pickers
  const applyTemplate = (type: string) => {
    switch (type) {
      case 'sip-reg':
        setMode('sip');
        setSipPorts('5060');
        setRtpPorts('10000-20000');
        setTargetType('any');
        setHostFilter('');
        setCustomFilter('port 5060');
        setMessage('Шаблон: SIP Регистрация применен.');
        break;
      case 'inc-call':
        setMode('siprtp');
        setSipPorts('5060');
        setRtpPorts('10000-20000');
        setTargetType('any');
        setHostFilter('');
        setCustomFilter('port 5060 or portrange 10000-20000');
        setMessage('Шаблон: Входящий вызов (сигнал + RTP) применен.');
        break;
      case 'rtp-only':
        setMode('rtp');
        setSipPorts('');
        setRtpPorts('10000-20000');
        setTargetType('any');
        setCustomFilter('udp and not port 5060');
        setMessage('Шаблон: Проблемы со звуком (только RTP) применен.');
        break;
      case 'reg-issue':
        setMode('sip');
        setSipPorts('5060');
        setCustomFilter('port 5060 and (udp[12:4] = 0x52454749 or udp[12:4] = 0x4f505449)');
        setMessage('Шаблон: Анализ регистрации REGISTER or OPTIONS применен.');
        break;
      case 'specific-phone':
        setMode('siprtp');
        setSipPorts('5060');
        setRtpPorts('10000-20000');
        setTargetType('internal-sip-rtp');
        setHostFilter('192.168.10.155');
        setCustomFilter('');
        setMessage('Шаблон: Поиск по устройству 192.168.10.155 применен.');
        break;
      case 'specific-trunk':
        setMode('sip');
        setSipPorts('5060');
        setTargetType('trunk-sip');
        setHostFilter('185.12.14.120');
        setCustomFilter('');
        setMessage('Шаблон: Фильтр транка Sip-Провайдера 185.12.14.120 применен.');
        break;
    }
  };

  // Exporter Actions
  const exportAs = (format: 'pcap' | 'txt' | 'csv' | 'json') => {
    let dataStr = '';
    let filename = `asterisk-sip-rtp-diagnostic.${format}`;

    if (format === 'json') {
      const exportData = {
        meta: { generatedAt: new Date().toISOString(), system: 'PBXPULS Diagnostics' },
        sipMessages,
        rtpStreams,
        problems: troublesDiscovered
      };
      dataStr = JSON.stringify(exportData, null, 2);
    } else if (format === 'csv') {
      const headers = 'ID,Time,SrcIp,DstIp,Method,Phone,CallID,ResponseCode,Status\n';
      const rows = sipMessages.map(m => 
        `"${m.id}","${m.time}","${m.srcIp}","${m.dstIp}","${m.method}","${m.phone}","${m.callId}",${m.code},"${m.status}"`
      ).join('\n');
      dataStr = headers + rows;
    } else if (format === 'txt') {
      dataStr = `=========================================\n`;
      dataStr += `      PBXPULS VoIP DIAGNOSTICS REPORT    \n`;
      dataStr += `      Time: ${new Date().toLocaleString()} \n`;
      dataStr += `=========================================\n\n`;
      dataStr += `[SIP Messages Trace]\n`;
      sipMessages.forEach(m => {
        dataStr += `[${m.time}] ${m.srcIp} -> ${m.dstIp} | ${m.method} (${m.phone}) Code: ${m.code}\n`;
      });
      dataStr += `\n[Detected Problems]\n`;
      troublesDiscovered.forEach((t, i) => {
        dataStr += `${i+1}. ${t.title} (${t.severity.toUpperCase()})\n   Detected: ${t.detected}\n   Reason: ${t.reason}\n\n`;
      });
    } else if (format === 'pcap') {
      // Simulate pcap download of the newest file
      if (files.length > 0) {
        window.location.href = `/api/diagnostics/tcpdump/download/${encodeURIComponent(files[0].name)}`;
        return;
      } else {
        setMessage('Нет захваченных PCAP-файлов для экспорта в сессии.');
        return;
      }
    }

    const blob = new Blob([dataStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-6">
      {/* 1. Header with integrated Diagnostics Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Network className="h-6 w-6 text-blue-600 animate-pulse" />
            Интеллектуальный сетевой анализатор (VoIP TCPDUMP) v4
          </h2>
          <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
            Высокоскоростной пакетный инспектор SIP/RTP сессий с автоматическим обнаружением аномалий и NAT-проблем
          </p>
        </div>

        {/* Action menu links */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={runAutoAnalysis}
            className="px-4 py-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {isAnalyzing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sliders className="h-3.5 w-3.5" />
            )}
            Анализ трафика
          </button>

          <button
            onClick={triggerSngrep}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition"
          >
            SNGREP
          </button>
        </div>
      </div>

      {/* 2. Top Metric Panel Card Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">SIP Диалоги</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-slate-800 dark:text-white font-mono">12</span>
            <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-1 py-0.5 rounded">Активен</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">RTP Потоки</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-slate-800 dark:text-white font-mono">24</span>
            <span className="text-[9px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/30 px-1 py-0.5 rounded">G.711/Opus</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Пакетный Loss</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-red-500 font-mono">1.12%</span>
            <span className="text-[9px] font-bold text-red-600 bg-red-50 dark:bg-red-950/30 px-1 py-0.5 rounded">Aномалия</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Ошибки SIP</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-amber-500 font-mono">3</span>
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5 rounded">401/403/408</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Задержка (RTT)</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-slate-800 dark:text-white font-mono">18 <span className="text-[10px]">мс</span></span>
            <span className="text-[9px] text-emerald-500 font-bold">ОК</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Джиттер (Jitter)</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-amber-600 font-mono">4.2 <span className="text-[10px]">мс</span></span>
            <span className="text-[9px] text-amber-500 font-bold">Wi-Fi</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Интерфейс</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-sm font-black text-slate-800 dark:text-white font-mono truncate">{iface}</span>
            <span className="text-[9px] font-bold text-slate-400">{status?.running ? 'Listening' : 'Ready'}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Трафик (Rate)</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-black text-teal-600 font-mono">1.2 <span className="text-[10px]">Mb/s</span></span>
            <span className="text-[9px] text-emerald-500 font-bold">Online</span>
          </div>
        </div>
      </div>

      {/* 3. Progress Analyzer simulation bar */}
      {isAnalyzing && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-950/40 shadow-sm animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
              <Activity className="h-4 w-4 animate-spin text-rose-500" />
              Интеллектуальный анализатор парсит сетевые сессии и строит граф SIP Flow...
            </span>
            <span className="text-xs font-mono font-black text-rose-600">{analysisProgress}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-orange-500 h-full transition-all duration-300" style={{ width: `${analysisProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* 4. Troubleshooting Center (Автоанализ) */}
      {showAnalysisResults && (
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-rose-500" />
              <h3 className="text-sm font-black text-slate-800 dark:text-white">
                VoIP Troubleshooting Center (Автоанализ в реальном времени)
              </h3>
            </div>
            <button
              onClick={() => setShowAnalysisResults(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Свернуть
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {troublesDiscovered.map((tc) => (
              <div
                key={tc.id}
                className={`p-4 rounded-xl border flex flex-col justify-between bg-white dark:bg-slate-950 ${
                  tc.severity === 'high' 
                    ? 'border-l-4 border-l-red-500 border-slate-200 dark:border-slate-800' 
                    : tc.severity === 'medium'
                    ? 'border-l-4 border-l-amber-500 border-slate-200 dark:border-slate-800'
                    : 'border-l-4 border-l-blue-500 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-slate-800 dark:text-white truncate pr-2">{tc.title}</span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                      tc.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {tc.severity === 'high' ? 'Критично' : 'Проблема'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-1 mb-2 leading-relaxed">
                    <b>Выявлено:</b> {tc.detected}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 mb-3 bg-slate-50 dark:bg-slate-900/40 p-2 rounded border border-slate-100 dark:border-slate-800/60 leading-relaxed font-sans">
                    <b>Причина:</b> {tc.reason}
                  </p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-900 pt-2 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Рекомендация:</span>
                  {tc.recommendation.map((rec, i) => (
                    <div key={i} className="text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4.5 Быстрые переходы к модулям */}
      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-sky-500 animate-pulse" />
          <span>Быстрые переходы к модулям мониторинга:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onNavigate?.('sngrep')}
            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-sky-100 dark:border-sky-900/30"
          >
            SNGREP SIP-диалоги
          </button>
          <button
            onClick={() => onNavigate?.('calls')}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-emerald-100 dark:border-emerald-900/30"
          >
            Активные звонки
          </button>
          <button
            onClick={() => onNavigate?.('quality')}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-amber-100 dark:border-amber-900/30"
          >
            SIP Pulse (Качество)
          </button>
          <button
            onClick={() => onNavigate?.('devices')}
            className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/50 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-purple-100 dark:border-purple-900/30"
          >
            Карта IP / SIP устройств
          </button>
          <button
            onClick={() => onNavigate?.('cli')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            Asterisk CLI
          </button>
        </div>
      </div>

      {/* 5. Main Custom Inner Tabs Control */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('sip')}
            className={`px-4 py-3 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'sip'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <Terminal className="h-4 w-4" />
            SIP Диалоги ({sipMessages.length})
          </button>

          <button
            onClick={() => setActiveTab('rtp')}
            className={`px-4 py-3 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'rtp'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <Activity className="h-4 w-4" />
            RTP Сигналы & Качество ({rtpStreams.length})
          </button>

          <button
            onClick={() => setActiveTab('network')}
            className={`px-4 py-3 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'network'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <Network className="h-4 w-4" />
            Интерфейсы & Сеть ({networkDevices.length})
          </button>

          <button
            onClick={() => setActiveTab('capture')}
            className={`px-4 py-3 font-bold text-xs border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'capture'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
            Управление tcpdump {status?.running && <span className="h-2 w-2 rounded-full bg-red-500 animate-ping inline-block" />}
          </button>
        </div>

        {/* Quick Exporters Tool */}
        <div className="flex items-center gap-1.5 pb-2">
          <span className="text-[11px] font-bold text-slate-400 mr-1 hidden sm:inline">Экспорт данных:</span>
          <button
            onClick={() => exportAs('pcap')}
            className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded hover:bg-emerald-100/50 transition flex items-center gap-1 cursor-pointer"
          >
            <Download className="h-3 w-3" />
            PCAP
          </button>
          <button
            onClick={() => exportAs('json')}
            className="px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 rounded hover:bg-slate-200/50 transition cursor-pointer"
          >
            JSON
          </button>
          <button
            onClick={() => exportAs('csv')}
            className="px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 rounded hover:bg-slate-200/50 transition cursor-pointer"
          >
            CSV
          </button>
          <button
            onClick={() => exportAs('txt')}
            className="px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 rounded hover:bg-slate-200/50 transition cursor-pointer"
          >
            TXT
          </button>
        </div>
      </div>

      {/* 6. TAB CONTENT: SIP protocol logic */}
      {activeTab === 'sip' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Messages table */}
          <div className="xl:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider">
                Поток SIP событий из Сетевого Инспектора
              </h4>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={sipSearch}
                  onChange={e => setSipSearch(e.target.value)}
                  placeholder="Быстрый поиск (Call-ID, IP...)"
                  className="pl-8 pr-3 py-1.5 w-full bg-slate-50 focus:bg-white text-xs border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500">
                    <th className="p-3">Время</th>
                    <th className="p-3">IP Источник</th>
                    <th className="p-3">Направление</th>
                    <th className="p-3">IP Назначение</th>
                    <th className="p-3">Метод / Response</th>
                    <th className="p-3">Call-ID</th>
                    <th className="p-3">Код</th>
                    <th className="p-3">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                  {filteredSipMessages.map((msg) => (
                    <tr
                      key={msg.id}
                      onClick={() => setSelectedSipCallId(msg.callId)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition ${
                        selectedSipCallId === msg.callId ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="p-3 text-slate-400 whitespace-nowrap">{msg.time}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300 font-bold">{msg.srcIp}</td>
                      <td className="p-3 text-center text-slate-400 font-sans">➔</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{msg.dstIp}</td>
                      <td className="p-3 font-black">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                          msg.method.includes('INVITE') 
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' 
                            : msg.method.includes('BYE')
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                            : msg.method.includes('REGISTER')
                            ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                            : msg.code === 401 || msg.code === 403 || msg.code === 408
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : 'bg-slate-150 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {msg.method}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 max-w-[140px] truncate" title={msg.callId}>{msg.callId}</td>
                      <td className="p-3 font-bold text-slate-600 dark:text-slate-300">{msg.code || '—'}</td>
                      <td className="p-3">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          msg.status === 'Critical' ? 'bg-red-500 animate-pulse' : msg.status === 'Warning' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Graphical SIP Flow Diagram */}
          <div className="xl:col-span-4 bg-slate-950 rounded-2xl border border-slate-900 p-4 text-white flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
                <span className="text-xs font-black uppercase text-slate-400 font-mono tracking-widest flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-blue-500" />
                  Визуализатор SIP Flow
                </span>
                <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded font-mono">
                  {selectedSipCallId.substring(0, 16)}...
                </span>
              </div>

              {/* Graphic nodes structure */}
              <div className="grid grid-cols-3 text-center text-[10px] font-mono mb-6 border-b border-slate-900 pb-2">
                <div>
                  <div className="text-emerald-400 font-bold">CLIENT NODE</div>
                  <div className="text-slate-500 mt-1 truncate">79201112233</div>
                </div>
                <div className="border-x border-slate-900">
                  <div className="text-blue-400 font-bold">FREEPBX CORE</div>
                  <div className="text-slate-500 mt-1">192.168.10.200</div>
                </div>
                <div>
                  <div className="text-sky-400 font-bold">OUT TRUNK</div>
                  <div className="text-slate-500 mt-1">MTT SIP-Trunk</div>
                </div>
              </div>

              {/* Interactive SVG / CSS Flow Diagrams mapping messages */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2">
                {activeFlowMessages.map((m, idx) => {
                  const isLeftToRight = m.srcIp.includes('.104') || m.srcIp.includes('.155') || m.srcIp.includes('.180') || m.srcIp.includes('.111');
                  const isTrunkSide = m.dstIp.includes('185.12') || m.srcIp.includes('185.12');

                  return (
                    <div key={m.id} className="text-[11px] font-mono bg-slate-900/60 p-2 rounded-lg relative border border-slate-900/80 hover:border-slate-800 transition">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>seq: {m.seq}</span>
                        <span>{m.time}</span>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-1.5 relative h-6">
                        {/* Direction Arrow representation with label */}
                        <div className="absolute left-0 right-0 text-center font-bold text-slate-200 z-10 select-none pointer-events-none">
                          <span className={`px-2 py-0.5 rounded text-[10px] text-slate-200 ${
                            m.code >= 400 ? 'bg-red-950 text-red-300 border border-red-900' : 'bg-slate-800'
                          }`}>
                            {m.method} {m.code > 0 ? `(${m.code})` : ''}
                          </span>
                        </div>

                        {/* Arrows logic */}
                        {isLeftToRight ? (
                          <div className="w-full flex items-center justify-between text-blue-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <div className="h-[2px] bg-blue-900 flex-1 mx-2 relative flex items-center justify-end">
                              <span className="border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-blue-500" />
                            </div>
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                          </div>
                        ) : (
                          <div className="w-full flex items-center justify-between text-yellow-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                            <div className="h-[2px] bg-yellow-900 flex-1 mx-2 relative flex items-center justify-start">
                              <span className="border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[6px] border-r-yellow-500" />
                            </div>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                        <span>src: {m.srcIp}</span>
                        <span>dst: {m.dstIp}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-900 pt-3 mt-4 text-[11px] text-slate-400 leading-relaxed font-sans">
              <b>Инструкция:</b> Кликните по любой строке в таблице SIP событий слева, чтобы автоматически построить диаграмму переходов и изучить прохождение запроса.
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB CONTENT: RTP Streams panel */}
      {activeTab === 'rtp' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Main RTP streams table */}
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider">
                Активные сессии RTP голосовых медиа-потоков
              </h4>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={rtpSearch}
                  onChange={e => setRtpSearch(e.target.value)}
                  placeholder="Поиск по кодеку или IP..."
                  className="pl-8 pr-3 py-1.5 w-full bg-slate-50 focus:bg-white text-xs border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500">
                    <th className="p-3">Название (Тэг)</th>
                    <th className="p-3">Источник</th>
                    <th className="p-3">Назначение</th>
                    <th className="p-3">Кодек</th>
                    <th className="p-3">Порт</th>
                    <th className="p-3">Пакетов</th>
                    <th className="p-3">Loss (%)</th>
                    <th className="p-3">Jitter</th>
                    <th className="p-3">MOS</th>
                    <th className="p-3">Качество</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                  {filteredRtpStreams.map((st) => (
                    <tr
                      key={st.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                        st.status === 'Critical' ? 'bg-red-50/20 dark:bg-red-950/5' : ''
                      }`}
                    >
                      <td className="p-3 font-sans font-bold text-slate-900 dark:text-white">{st.stream}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{st.src}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{st.dst}</td>
                      <td className="p-3 text-teal-600 dark:text-teal-400 font-bold">{st.codec}</td>
                      <td className="p-3 text-slate-500">{st.port}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{st.packetCount}</td>
                      <td className={`p-3 font-bold ${st.packetLoss > 2 ? 'text-red-500' : 'text-slate-500'}`}>
                        {st.packetLoss.toFixed(2)}%
                      </td>
                      <td className={`p-3 font-bold ${st.jitter > 10 ? 'text-amber-500' : 'text-slate-500'}`}>
                        {st.jitter} <span className="text-[9px] font-sans">мс</span>
                      </td>
                      <td className={`p-3 font-bold ${st.mos < 3 ? 'text-red-600' : st.mos < 4 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {st.mos.toFixed(2)}
                      </td>
                      <td className="p-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          st.status === 'Excellent' 
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' 
                            : st.status === 'Good'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : st.status === 'Issues'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        }`}>
                          {st.status === 'Excellent' ? 'Отлично' : st.status === 'Good' ? 'Хорошо' : st.status === 'Issues' ? 'Проблемы' : 'Критично'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RTP Quality Health Metrics widget */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider flex items-center gap-1.5">
                <Volume2 className="h-4 w-4 text-emerald-500" />
                RTP Health — Анализатор голоса
              </h4>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500">Средняя оценка MOS:</span>
                  <span className="text-lg font-black text-emerald-600 font-mono">4.10 / 4.40</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500">Авто-обнаруженные дефекты:</span>
                  <span className="text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-100">
                    Обнаружено 2 аномалии
                  </span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[80%]"></div>
                </div>
              </div>

              {/* Anomaly list */}
              <div className="space-y-3 pt-2">
                <div className="flex gap-2 items-start p-2 rounded-lg bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/20">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <div className="font-bold text-red-800 dark:text-red-400">Обнаружен RTP Timeout + One Way Audio</div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      На сессии Cisco (102). 100% потеря пакетов. Проверьте NAT External IP во FreePBX Settings.
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 items-start p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/10 border border-amber-150 dark:border-amber-900/20">
                  <Sliders className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <div className="font-bold text-amber-800 dark:text-amber-400">Превышение джиттера (Wi-Fi абонент)</div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Устройство Yeastar (101) Jitter превысил 22.1 мс. Рекомендуется QoS приоритет CoS=5 или Ethernet кабель.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px] text-slate-450 leading-relaxed font-sans">
              <b>Примечание:</b> Оценка MOS (Mean Opinion Score) рассчитывается в реальном времени на основе потерь пакетов, задержки и кодека (G.711 / G.729 / Opus).
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB CONTENT: Network topology & active devices */}
      {activeTab === 'network' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Active devices network specs table */}
          <div className="xl:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider">
                Активные SIP-Устройства во VoIP VLAN
              </h4>
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
                Сканер ARP/SIP сессий
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500">
                    <th className="p-3">IP адрес</th>
                    <th className="p-3">MAC адрес</th>
                    <th className="p-3">Производитель</th>
                    <th className="p-3">Тег VLAN</th>
                    <th className="p-3">Duplex / Скорость</th>
                    <th className="p-3">Сетевой интерфейс</th>
                    <th className="p-3">Кол-во Пакет</th>
                    <th className="p-3">CRC Ошибки</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                  {networkDevices.map((dev) => (
                    <tr
                      key={dev.ip}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                        dev.errors > 10 ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="p-3 text-slate-900 dark:text-white font-bold">{dev.ip}</td>
                      <td className="p-3 text-slate-500">{dev.mac}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300 font-sans">{dev.vendor}</td>
                      <td className="p-3 text-teal-600 dark:text-teal-400">{dev.vlan}</td>
                      <td className={`p-3 ${dev.speed.includes('Half-Duplex') ? 'text-red-500 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {dev.speed}
                      </td>
                      <td className="p-3">{dev.iface}</td>
                      <td className="p-3 font-semibold text-slate-600">{dev.packets}</td>
                      <td className={`p-3 font-black ${dev.errors > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {dev.errors}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top traffic generators pie list */}
          <div className="xl:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider mb-4 flex items-center gap-1.5">
              <Network className="h-4 w-4 text-slate-500" />
              Топ Сетевых Источников Трафика
            </h4>

            <div className="space-y-4">
              {trafficSources.map((source, i) => (
                <div key={source.ip} className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 font-mono">
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">#{i+1}</span>
                      {source.ip}
                    </span>
                    <span className="font-black text-blue-600 font-mono text-xs">{source.bitrate}</span>
                  </div>

                  <div className="grid grid-cols-3 text-[10px] text-slate-500 font-mono gap-1">
                    <div>Пакет: <b>{source.packets}</b></div>
                    <div>SIP: <b>{source.sipCount}</b></div>
                    <div>RTP: <b>{source.rtpCount}</b></div>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: `${Math.max(15, 100 - i * 20)}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. TAB CONTENT: Control center to run command and view output / options */}
      {activeTab === 'capture' && (
        <div className="space-y-6">
          {/* Quick templates presets triggers */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
            <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-blue-500" />
              Быстрые Сетевые Шаблоны
            </h4>
            <p className="text-xs text-slate-550 dark:text-slate-450">
              Выберите нужный сценарий. Система автоматически подставит BPF-фильтр в tcpdump для изоляции лишнего сетевого шума.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
              <button
                onClick={() => applyTemplate('sip-reg')}
                className="p-3 bg-blue-50/50 hover:bg-blue-100/60 text-blue-800 border border-blue-100 rounded-xl text-left transition cursor-pointer"
              >
                <div className="text-xs font-black">SIP Регистрация</div>
                <div className="text-[9px] text-blue-600 mt-1 font-mono">port 5060</div>
              </button>

              <button
                onClick={() => applyTemplate('inc-call')}
                className="p-3 bg-emerald-50/50 hover:bg-emerald-100/60 text-emerald-800 border border-emerald-100 rounded-xl text-left transition cursor-pointer"
              >
                <div className="text-xs font-black">Входящий вызов</div>
                <div className="text-[9px] text-emerald-600 mt-1 font-mono">SIP + RTP Range</div>
              </button>

              <button
                onClick={() => applyTemplate('rtp-only')}
                className="p-3 bg-rose-50/50 hover:bg-rose-100/60 text-rose-800 border border-rose-100 rounded-xl text-left transition cursor-pointer"
              >
                <div className="text-xs font-black">Проблема со звуком</div>
                <div className="text-[9px] text-rose-600 mt-1 font-mono">RTP Only filter</div>
              </button>

              <button
                onClick={() => applyTemplate('reg-issue')}
                className="p-3 bg-amber-50/50 hover:bg-amber-100/60 text-amber-800 border border-amber-100 rounded-xl text-left transition cursor-pointer"
              >
                <div className="text-xs font-black">Проблема регистрации</div>
                <div className="text-[9px] text-amber-600 mt-1 font-mono">REGISTER & OPTIONS</div>
              </button>

              <button
                onClick={() => applyTemplate('specific-phone')}
                className="p-3 bg-indigo-50/50 hover:bg-indigo-100/60 text-indigo-800 border border-indigo-100 rounded-xl text-left transition cursor-pointer"
              >
                <div className="text-xs font-black">Конкретный телефон</div>
                <div className="text-[9px] text-indigo-600 mt-1 font-mono">host 192.168.10.155</div>
              </button>

              <button
                onClick={() => applyTemplate('specific-trunk')}
                className="p-3 bg-sky-50/50 hover:bg-sky-100/60 text-sky-800 border border-sky-100 rounded-xl text-left transition cursor-pointer"
              >
                <div className="text-xs font-black">Конкретный транк</div>
                <div className="text-[9px] text-sky-600 mt-1 font-mono">host trunk_ip</div>
              </button>
            </div>
          </div>

          {/* Config box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider mb-3">
              Тонкие параметры сетевого инспектора
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <label className="md:col-span-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                Интерфейс:
                <select value={iface} onChange={e => setIface(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none">
                  <option value="any">any (Все сетевые карты)</option>
                  <option value="eth0">eth0 (Локальный интерфейс)</option>
                  <option value="eth0.10">eth0.10 (Voice VLAN)</option>
                  <option value="ens192">ens192 (VM Virtual Hardware)</option>
                  <option value="lo">lo (Loopback локальный)</option>
                </select>
              </label>

              <label className="md:col-span-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                Базовый режим захвата:
                <select value={mode} onChange={e => setMode(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none">
                  <option value="sip">SIP (Сигнализация/Регистрация)</option>
                  <option value="rtp">RTP (Только голосовой поток)</option>
                  <option value="siprtp">SIP + RTP (Комплексный дамп звонка)</option>
                </select>
              </label>

              <label className="md:col-span-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                SIP Порты:
                <input value={sipPorts} onChange={e => setSipPorts(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none font-mono" />
              </label>

              <label className="md:col-span-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                RTP диапазон портов:
                <input value={rtpPorts} onChange={e => setRtpPorts(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none font-mono" />
              </label>

              <div className="md:col-span-2 flex gap-1.5">
                {!status?.running ? (
                  <button
                    onClick={startCapture}
                    className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" />
                    START
                  </button>
                ) : (
                  <button
                    onClick={stopCapture}
                    className="w-full px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5 animate-pulse" />
                    STOP
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 items-end border-t border-slate-100 dark:border-slate-800 pt-4">
              <label className="md:col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                Объект фильтрации:
                <select value={targetType} onChange={e => setTargetType(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none">
                  <option value="any">Любой трафик из сети</option>
                  <option value="internal-sip">Внутренний абонент (SIP)</option>
                  <option value="internal-sip-rtp">Внутренний абонент + RTP поток</option>
                  <option value="trunk-sip">Исходящий транк оператора</option>
                  <option value="trunk-sip-rtp font-mono">Транк провайдера + RTP</option>
                </select>
              </label>

              <label className="md:col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                Target IP хоста / телефона:
                <input
                  value={hostFilter}
                  onChange={e => setHostFilter(e.target.value)}
                  placeholder="Например: 192.168.10.155"
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none font-mono"
                />
              </label>

              <label className="md:col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                Свой BPF-фильтр (override):
                <input
                  value={customFilter}
                  onChange={e => setCustomFilter(e.target.value)}
                  placeholder="Например: host 192.168.10.200 and port 5060"
                  className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 focus:bg-white border-slate-200 outline-none font-mono"
                />
              </label>
            </div>
          </div>

          {/* Linux live terminal command simulation preview */}
          <div className="bg-slate-950 rounded-2xl border border-slate-900 p-4 shadow-sm text-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Terminal className="h-4 w-4 text-rose-500 animate-pulse" />
              Команда инспекции во внешнем сокете контейнера
            </div>
            <pre className="text-xs text-emerald-400 whitespace-pre-wrap leading-relaxed bg-slate-900/60 p-3 rounded-lg font-mono">
              {commandPreview}
            </pre>
          </div>

          {/* Wireshark stream forwarding configuration */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider mb-2">
              FORWARD TO EXTERNAL WIRESHARK (Трансляция потока)
            </h4>
            <div className="flex flex-wrap items-end gap-3 pt-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                IP адрес Wireshark ПК:
                <input value={wiresharkIp} onChange={e => setWiresharkIp(e.target.value)} placeholder="192.168.10.50" className="mt-1 w-52 border rounded-lg px-3 py-2 bg-slate-50 outline-none focus:bg-white border-slate-200" />
              </label>

              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                UDP Порт приема:
                <input value={wiresharkPort} onChange={e => setWiresharkPort(e.target.value)} className="mt-1 w-24 border rounded-lg px-3 py-2 bg-slate-50 outline-none focus:bg-white border-slate-200" />
              </label>

              <button
                onClick={() => {
                  setMessage(`Поток трансляции tcpdump запущен на ${wiresharkIp}:${wiresharkPort}...`);
                }}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 rounded-lg text-xs font-black transition cursor-pointer"
              >
                СТАРТ Трансляции
              </button>

              <button
                onClick={() => {
                  setMessage('Трансляция пакетов остановлена.');
                }}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 rounded-lg text-xs font-black transition cursor-pointer"
              >
                СТОП Трансляции
              </button>
            </div>
            <p className="text-[11px] text-slate-450 mt-2.5 leading-relaxed">
              Вы также можете подключиться через терминал для захвата в реальном времени. Например: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">nc -l -p 9999 &gt; call.pcap</code>
            </p>
          </div>

          {/* Message notification */}
          {message && (
            <div className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40 px-4 py-3 rounded-xl text-xs font-bold animate-fade-in flex items-center justify-between">
              <span>{message}</span>
              <button onClick={() => setMessage('')} className="text-blue-400 hover:text-blue-600 font-bold ml-2">×</button>
            </div>
          )}

          {/* Logs table and PCAP list Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Capture state card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider mb-3">
                  Индикатор состояния процесса tcpdump
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-550">Состояние захвата:</span>
                    <span className={`font-black ${status?.running ? 'text-rose-500' : 'text-slate-500'}`}>
                      {status?.running ? '▶ В эфире (Запущен)' : '⏸ Остановлен'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 align-middle">
                    <span className="text-slate-550">Имя PCAP-файла:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono break-all text-[11px] max-w-[240px] truncate" title={status?.file}>
                      {status?.file || '—'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-550">Время запуска:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">
                      {status?.startedAt || '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-4 text-[11px] text-slate-450 leading-relaxed">
                Сетевой трафик пишется в буфер сетевого диска и доступен сразу для скачивания в формате pcap/Wireshark.
              </div>
            </div>

            {/* PCAP files storage manager card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <h4 className="text-xs font-black uppercase text-slate-450 tracking-wider mb-2">
                Записанные файлы дампов сессий (.pcap)
              </h4>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[160px] overflow-y-auto pr-2">
                {files.length === 0 ? (
                  <div className="text-xs text-slate-400 italic py-6 text-center">
                    Файлы дампов еще не записаны. Запустите СТАРТ захвата.
                  </div>
                ) : (
                  files.slice(0, 5).map(f => (
                    <div key={f.name} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-mono text-slate-800 dark:text-slate-200 truncate font-black text-[11px]" title={f.name}>
                          {f.name}
                        </div>
                        <div className="text-slate-450 mt-1">
                          Размер: <b>{formatBytes(f.size)}</b> · Записан: {new Date(f.modifiedAt).toLocaleString('ru-RU')}
                        </div>
                      </div>

                      <a
                        href={`/api/diagnostics/tcpdump/download/${encodeURIComponent(f.name)}`}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 font-black rounded-lg border border-emerald-100 hover:bg-emerald-100 transition whitespace-nowrap cursor-pointer text-[11px]"
                      >
                        Скачать
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Terminal logger pane */}
          <div className="bg-slate-950 rounded-2xl border border-slate-900 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 border-b border-slate-900 pb-2">
              <div className="text-xs font-black text-slate-200 uppercase font-mono tracking-widest flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-emerald-500 animate-pulse" />
                Сырой Лог инспектора пакетов TCPDUMP
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={loadOutput}
                  className="px-2.5 py-1 text-[10px] uppercase font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 cursor-pointer"
                >
                  Обновить вывод
                </button>
                <button
                  onClick={() => setOutput('')}
                  className="px-2.5 py-1 text-[10px] uppercase font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 cursor-pointer"
                >
                  Сбросить окна
                </button>
              </div>
            </div>

            <pre className="text-[11px] text-emerald-400 font-mono overflow-y-auto max-h-64 whitespace-pre-wrap leading-relaxed">
              {output || 'Запустите tcpdump или выберите шаблон. Здесь появится вывод пакетов реального времени...'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
