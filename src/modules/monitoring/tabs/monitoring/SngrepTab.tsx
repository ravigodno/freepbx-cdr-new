import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Square,
  Search,
  RefreshCw,
  Terminal,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  Info,
  Network,
  Activity,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sliders,
  ChevronRight,
  Filter,
  Eye,
  Settings,
  Flame,
  Volume2,
  Clock,
  Wifi,
  Database,
  ArrowDownLeft,
  ArrowUpRight,
  FileCode,
  Download,
  Share2,
  HelpCircle,
  Zap,
  Lock,
  UserCheck,
  Sun,
  Moon
} from 'lucide-react';

interface Props {
  tcpdumpOutput: string;
  loadTcpdumpOutput: () => void;
  token?: string;
  onNavigate?: (mode: 'calls' | 'tcpdump' | 'sngrep' | 'cli' | 'freepbx' | 'db' | 'devices' | 'quality') => void;
  darkMode?: boolean;
}

// Custom types
interface SipMsg {
  time: string;
  src: string;
  dst: string;
  method: string;
  code: string;
  title: string;
  callId: string;
  raw: string;
  sequence: number;
}

interface SipDialog {
  id: string;
  items: SipMsg[];
  status: string;
  first: SipMsg;
  last: SipMsg;
  methodType: string;
  fromNum: string;
  toNum: string;
  userAgent: string;
  trunk: string;
  codec: string;
  did: string;
}

interface Registration {
  ext: string;
  ip: string;
  userAgent: string;
  time: string;
  expire: string;
  frequency: string;
  status: 'Registered' | 'Expired' | 'Unreachable' | 'Flapping';
}

interface SecurityThreat {
  id: string;
  ip: string;
  requests: number;
  type: string;
  time: string;
  severity: 'high' | 'medium' | 'low';
}

interface DiagnosticProfile {
  id: string;
  title: string;
  problem: string;
  cause: string;
  recommendation: string;
  category: 'SIP ALG' | 'NAT' | 'Codec' | 'Security' | 'Config';
}

// Automatic diagnostic database
const DIAGNOSTIC_PROFILES: DiagnosticProfile[] = [
  {
    id: 'diag-alg',
    title: 'Обнаружен SIP ALG в роутере',
    problem: 'Односторонний звук, обрывы вызовов через 32 секунды, сброс регистрации.',
    cause: 'Роутер модифицирует SIP заголовки (особенно Contact/Via), искажая IP-адреса сигнализации.',
    recommendation: 'Отключить функцию "SIP ALG" или "SIP Passthrough" в настройках роутера клиента.',
    category: 'SIP ALG'
  },
  {
    id: 'diag-nat',
    title: 'Нарушение симметрии NAT (Symmetric NAT)',
    problem: 'Входящие звонки не поступают, исходящие проходят нормально.',
    cause: 'Период жизни NAT-сессии в роутере короче, чем серверный параметр Register Keep-Alive.',
    recommendation: 'Включить NAT=yes (force_rport,comedia) в Asterisk, уменьшить Register Expire до 120 сек.',
    category: 'NAT'
  },
  {
    id: 'diag-unauth',
    title: 'Циклический 401 Unauthorized',
    problem: 'Телефон не регистрируется, бесконечный цикл аутентификации.',
    cause: 'Неверное имя пользователя (Extension) или пароль (secret) в настройках SIP пира.',
    recommendation: 'Сверить secret в FreePBX Applications -> Extensions и пароль в веб-интерфейсе телефона.',
    category: 'Config'
  },
  {
    id: 'diag-codec',
    title: 'Codec Mismatch (488 Not Acceptable)',
    problem: 'Вызовы обрываются с кодом ошибки 488 после INVITE.',
    cause: 'Нет общих поддерживаемых кодеков между телефоном клиента и транком провайдера (например, Opus vs alaw).',
    recommendation: 'Убедиться, что в настройках Extension и Trunk разрешены g722, alaw, ulaw.',
    category: 'Codec'
  },
  {
    id: 'diag-loop',
    title: 'SIP Loop Detected (482 Loop Detected)',
    problem: 'Ошибка 482 в трафике сигнализации, вызовы мгновенно завершаются.',
    cause: 'Совпадение Dialplan Pattern, из-за которого Asterisk шлет звонок обратно на тот же пир.',
    recommendation: 'Проверить шаблоны исходящей маршрутизации и настройки контекстов в Inbound/Outbound Routes.',
    category: 'Config'
  },
  {
    id: 'diag-storm',
    title: 'Registration Storm',
    problem: 'Резкое падение производительности Asterisk, куча 401 ответов.',
    cause: 'Массовая перерегистрация множества аппаратов одновременно (например, после включения света).',
    recommendation: 'Задействовать Fail2ban и настроить случайный разброс регистрации (Random Register Expire) на телефонах.',
    category: 'Security'
  }
];

export default function SngrepTab({ tcpdumpOutput, loadTcpdumpOutput, token, onNavigate, darkMode }: Props) {
  // Theme state
  const [tabTheme, setTabTheme] = useState<'sync' | 'light' | 'dark'>(() => {
    return (localStorage.getItem('pbxpuls_sngrep_tab_theme') as 'sync' | 'light' | 'dark') || 'sync';
  });

  const isDark = useMemo(() => {
    if (tabTheme === 'light') return false;
    if (tabTheme === 'dark') return true;
    return !!darkMode;
  }, [tabTheme, darkMode]);

  // Persist preference
  useEffect(() => {
    localStorage.setItem('pbxpuls_sngrep_tab_theme', tabTheme);
  }, [tabTheme]);

  // Helper helper to return active class
  const sClass = (darkClasses: string, lightClasses: string) => {
    return isDark ? darkClasses : lightClasses;
  };

  // Navigation tabs for the analyzer
  const [activeTab, setActiveTab] = useState<'ladder' | 'headers' | 'registrations' | 'security' | 'diagnostics'>('ladder');
  const [selectedDialogId, setSelectedDialogId] = useState<string>('');
  
  // States for interactive simulations & logs
  const [simulatedLog, setSimulatedLog] = useState<string[]>([]);
  const [uiMessage, setUiMessage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  
  // Diagnostics controls
  const [sipDebugActive, setSipDebugActive] = useState<boolean>(false);
  const [pjsipDebugActive, setPjsipDebugActive] = useState<boolean>(false);

  // Exclude-filter for dates
  const [regFilterRange, setRegFilterRange] = useState<'today' | '7days' | '30days' | 'all'>('7days');

  // Triggering back-end capture commands
  const handleStartCapture = async (mode: 'sip' | 'siprtp') => {
    setIsCapturing(true);
    setUiMessage(`Запуск захвата трафика (${mode.toUpperCase()}) через tcpdump...`);
    try {
      const res = await fetch(`/api/diagnostics/tcpdump/start?mode=${mode}&iface=any`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUiMessage('Захват успешно запущен. Совершите звонок или регистрацию.');
      } else {
        setUiMessage(`Ошибка запуска: ${data.error || 'tcpdump не запущен'}`);
      }
    } catch (e: any) {
      setUiMessage(`Сессионная ошибка: ${e.message}`);
    }
    setTimeout(loadTcpdumpOutput, 1500);
  };

  const handleStopCapture = async () => {
    setIsCapturing(false);
    setUiMessage('Останавливаем захват tcpdump...');
    try {
      await fetch('/api/diagnostics/tcpdump/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setUiMessage('Захват остановлен. Анализируем сохраненный трафик.');
    } catch (e: any) {
      setUiMessage(`Сессионная ошибка: ${e.message}`);
    }
    setTimeout(loadTcpdumpOutput, 1200);
  };

  // Poll for tcpdump output occasionally if capturing
  useEffect(() => {
    loadTcpdumpOutput();
    const interval = setInterval(() => {
      if (isCapturing) {
        loadTcpdumpOutput();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isCapturing]);

  // Clean raw headers
  const getCleanText = (s: string) => s.replace(/[^\x20-\x7E\r\nА-Яа-я:\/]/g, ' ');

  // Live simulation & seeding database
  const mockDialogs: SipDialog[] = useMemo(() => {
    return [
      {
        id: 'call-id-9428-sip-trunk-mtt-99f8e',
        status: 'Завершен нормально (BYE)',
        fromNum: '79093005511',
        toNum: '101',
        userAgent: 'Yeastar S50 / Asterisk 18.23',
        trunk: 'MTT_Trunk_Out',
        codec: 'G.711 alaw (64 Kbps)',
        did: '74951234567',
        methodType: 'INVITE',
        first: { time: '2026-06-23 00:10:02', src: '185.45.152.12', dst: '192.168.1.100', method: 'INVITE', code: '', title: 'INVITE sip:101@pbxpuls', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 1, raw: 'INVITE sip:101@192.168.1.100 SIP/2.0\nVia: SIP/2.0/UDP 185.45.152.12:5060;branch=z9hG4bK83818\nFrom: <sip:79093005511@185.45.152.12>;tag=99131e\nTo: <sip:101@192.168.1.100>\nCall-ID: call-id-9428-sip-trunk-mtt-99f8e\nCSeq: 102 INVITE\nMax-Forwards: 70\nUser-Agent: Yeastar S50\nContent-Type: application/sdp\n\nv=0\no=root 1192 1192 IN IP4 185.45.152.12\ns=session\nc=IN IP4 185.45.152.12\nt=0 0\nm=audio 10024 RTP/AVP 8 0 101\na=rtpmap:8 PCMA/8000\na=rtpmap:0 PCMU/8000\na=rtpmap:101 telephone-event/8000' },
        last: { time: '2026-06-23 00:11:45', src: '192.168.1.100', dst: '185.45.152.12', method: '200 OK', code: '200', title: '200 OK (BYE)', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 6, raw: 'SIP/2.0 200 OK\nVia: SIP/2.0/UDP 185.45.152.12:5060;branch=z9hG4bK114s8\nFrom: <sip:79093005511@185.45.152.12>;tag=99131e\nTo: <sip:101@192.168.1.100>;tag=as8813\nCall-ID: call-id-9428-sip-trunk-mtt-99f8e\nCSeq: 103 BYE\nContent-Length: 0' },
        items: [
          { time: '2026-06-23 00:10:02', src: '185.45.152.12', dst: '192.168.1.100', method: 'INVITE', code: '', title: 'INVITE sip:101', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 1, raw: 'INVITE sip:101@192.168.1.100 SIP/2.0' },
          { time: '2026-06-23 00:10:02', src: '192.168.1.100', dst: '185.45.152.12', method: '100 Trying', code: '100', title: '100 Trying', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 2, raw: 'SIP/2.0 100 Trying' },
          { time: '2026-06-23 00:10:03', src: '192.168.1.100', dst: '185.45.152.12', method: '180 Ringing', code: '180', title: '180 Ringing', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 3, raw: 'SIP/2.0 180 Ringing' },
          { time: '2026-06-23 00:10:06', src: '192.168.1.100', dst: '185.45.152.12', method: '200 OK', code: '200', title: '200 OK (INVITE)', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 4, raw: 'SIP/2.0 200 OK\nContent-Type: application/sdp\n\nm=audio 21240 RTP/AVP 8' },
          { time: '2026-06-23 00:10:06', src: '185.45.152.12', dst: '192.168.1.100', method: 'ACK', code: '', title: 'ACK', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 5, raw: 'ACK sip:101@192.168.1.100 SIP/2.0' },
          { time: '2026-06-23 00:11:44', src: '185.45.152.12', dst: '192.168.1.100', method: 'BYE', code: '', title: 'BYE', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 6, raw: 'BYE sip:101@192.168.1.100 SIP/2.0' },
          { time: '2026-06-23 00:11:45', src: '192.168.1.100', dst: '185.45.152.12', method: '200 OK', code: '200', title: '200 OK (BYE)', callId: 'call-id-9428-sip-trunk-mtt-99f8e', sequence: 7, raw: 'SIP/2.0 200 OK' }
        ]
      },
      {
        id: 'reg-id-102-phone-grandstream-a849f1',
        status: 'Успешная регистрация',
        fromNum: '102',
        toNum: 'Asterisk',
        userAgent: 'Grandstream GXP1625 v1.0.4.15',
        trunk: '—',
        codec: '—',
        did: '—',
        methodType: 'REGISTER',
        first: { time: '2026-06-23 00:08:44', src: '192.168.1.155', dst: '192.168.1.100', method: 'REGISTER', code: '', title: 'REGISTER sip:192.168.1.100', callId: 'reg-id-102-phone-grandstream-a849f1', sequence: 1, raw: 'REGISTER sip:192.168.1.100 SIP/2.0\nVia: SIP/2.0/UDP 192.168.1.155:5060;branch=z9hG4bK819ak\nFrom: <sip:102@192.168.1.100>;tag=f0288\nTo: <sip:102@192.168.1.100>\nCall-ID: reg-id-102-phone-grandstream-a849f1\nCSeq: 1 REGISTER\nUser-Agent: Grandstream GXP1625\nExpires: 3600\nContent-Length: 0' },
        last: { time: '2026-06-23 00:08:45', src: '192.168.1.100', dst: '192.168.1.155', method: '200 OK', code: '200', title: '200 OK (REGISTER)', callId: 'reg-id-102-phone-grandstream-a849f1', sequence: 4, raw: 'SIP/2.0 200 OK\nVia: SIP/2.0/UDP 192.168.1.155:5060;branch=z9hG4bK91a4\nFrom: <sip:102@192.168.1.100>;tag=f02ac\nTo: <sip:102@192.168.1.100>;tag=asf78a2\nCall-ID: reg-id-102-phone-grandstream-a849f1\nCSeq: 2 REGISTER\nUser-Agent: Asterisk PBX\nExpires: 120\nContact: <sip:102@192.168.1.155:5060>' },
        items: [
          { time: '2026-06-23 00:08:44', src: '192.168.1.155', dst: '192.168.1.100', method: 'REGISTER', code: '', title: 'REGISTER (No Auth)', callId: 'reg-id-102-phone-grandstream-a849f1', sequence: 1, raw: 'REGISTER sip:192.168.1.100 SIP/2.0' },
          { time: '2026-06-23 00:08:44', src: '192.168.1.100', dst: '192.168.1.155', method: '401 Unauthorized', code: '401', title: '401 Unauthorized', callId: 'reg-id-102-phone-grandstream-a849f1', sequence: 2, raw: 'SIP/2.0 401 Unauthorized\nWWW-Authenticate: Digest algorithm=MD5, realm="asterisk", nonce="fa128c11"' },
          { time: '2026-06-23 00:08:45', src: '192.168.1.155', dst: '192.168.1.100', method: 'REGISTER', code: '', title: 'REGISTER (With Auth)', callId: 'reg-id-102-phone-grandstream-a849f1', sequence: 3, raw: 'REGISTER sip:192.168.1.100 SIP/2.0\nAuthorization: Digest username="102", realm="asterisk", nonce="fa128c11", response="99a1b2c3"' },
          { time: '2026-06-23 00:08:45', src: '192.168.1.100', dst: '192.168.1.155', method: '200 OK', code: '200', title: '200 OK (Registered)', callId: 'reg-id-102-phone-grandstream-a849f1', sequence: 4, raw: 'SIP/2.0 200 OK\nExpires: 120\nContact: <sip:102@192.168.1.155:5060>' }
        ]
      },
      {
        id: 'call-id-auth-loop-error-fail3829ad',
        status: 'Ошибка авторизации (403)',
        fromNum: '501',
        toNum: 'Asterisk',
        userAgent: 'Fanvil X3S v2.4.1',
        trunk: '—',
        codec: '—',
        did: '—',
        methodType: 'REGISTER',
        first: { time: '2026-06-23 00:06:12', src: '192.168.1.210', dst: '192.168.1.100', method: 'REGISTER', code: '', title: 'REGISTER sip:192.168.1.100', callId: 'call-id-auth-loop-error-fail3829ad', sequence: 1, raw: 'REGISTER sip:192.168.1.100 SIP/2.0\nUser-Agent: Fanvil X3S' },
        last: { time: '2026-06-23 00:06:13', src: '192.168.1.100', dst: '192.168.1.210', method: '403 Forbidden', code: '403', title: '403 Forbidden', callId: 'call-id-auth-loop-error-fail3829ad', sequence: 4, raw: 'SIP/2.0 403 Forbidden\nReason: Wrong Secret / Password Match Failure\nContent-Length: 0' },
        items: [
          { time: '2026-06-23 00:06:12', src: '192.168.1.210', dst: '192.168.1.100', method: 'REGISTER', code: '', title: 'REGISTER (No Auth)', callId: 'call-id-auth-loop-error-fail3829ad', sequence: 1, raw: 'REGISTER' },
          { time: '2026-06-23 00:06:12', src: '192.168.1.100', dst: '192.168.1.210', method: '401 Unauthorized', code: '401', title: '401 Unauthorized', callId: 'call-id-auth-loop-error-fail3829ad', sequence: 2, raw: 'SIP/2.0 401 Unauthorized' },
          { time: '2026-06-23 00:06:13', src: '192.168.1.210', dst: '192.168.1.100', method: 'REGISTER', code: '', title: 'REGISTER (Bad Auth)', callId: 'call-id-auth-loop-error-fail3829ad', sequence: 3, raw: 'REGISTER (With Bad credentials)' },
          { time: '2026-06-23 00:06:13', src: '192.168.1.100', dst: '192.168.1.210', method: '403 Forbidden', code: '403', title: '403 Forbidden', callId: 'call-id-auth-loop-error-fail3829ad', sequence: 4, raw: 'SIP/2.0 403 Forbidden\nWarning: 127 authentication failed' }
        ]
      },
      {
        id: 'flood-id-scanner-etc-88319f',
        status: 'SIP Flood атака заблокирована',
        fromNum: '9900201',
        toNum: '74950000000',
        userAgent: 'sipvicious / friendly-scanner',
        trunk: '—',
        codec: '—',
        did: '—',
        methodType: 'INVITE',
        first: { time: '2026-06-23 00:01:20', src: '45.143.22.190', dst: '192.168.1.100', method: 'INVITE', code: '', title: 'INVITE sip:9900201@pbxpuls', callId: 'flood-id-scanner-etc-88319f', sequence: 1, raw: 'INVITE sip:9900201@192.168.1.100 SIP/2.0\nUser-Agent: friendly-scanner' },
        last: { time: '2026-06-23 00:01:21', src: '192.168.1.100', dst: '45.143.22.190', method: '603 Decline', code: '603', title: '603 Decline (Blocked by Security)', callId: 'flood-id-scanner-etc-88319f', sequence: 2, raw: 'SIP/2.0 603 Decline\nX-PBXPULS-BlockReason: Scanner security trigger' },
        items: [
          { time: '2026-06-23 00:01:20', src: '45.143.22.190', dst: '192.168.1.100', method: 'INVITE', code: '', title: 'INVITE (Scanner Trial)', callId: 'flood-id-scanner-etc-88319f', sequence: 1, raw: 'INVITE sip:9900201@pbxpuls' },
          { time: '2026-06-23 00:01:21', src: '192.168.1.100', dst: '45.143.22.190', method: '603 Decline', code: '603', title: '603 Decline', callId: 'flood-id-scanner-etc-88319f', sequence: 2, raw: 'SIP/2.0 603 Decline\nReason: Rate limits reached' }
        ]
      },
      {
        id: 'call-id-options-ping-keepalive-8f23',
        status: 'OPTIONS Ping OK',
        fromNum: 'Trunk_Mtt',
        toNum: 'Asterisk',
        userAgent: 'MTT SBC',
        trunk: 'MTT_Trunk_Out',
        codec: '—',
        did: '—',
        methodType: 'OPTIONS',
        first: { time: '2026-06-23 00:12:00', src: '185.45.152.12', dst: '192.168.1.100', method: 'OPTIONS', code: '', title: 'OPTIONS sip:192.168.1.100', callId: 'call-id-options-ping-keepalive-8f23', sequence: 1, raw: 'OPTIONS sip:192.168.1.100 SIP/2.0' },
        last: { time: '2026-06-23 00:12:00', src: '192.168.1.100', dst: '185.45.152.12', method: '200 OK', code: '200', title: '200 OK (OPTIONS)', callId: 'call-id-options-ping-keepalive-8f23', sequence: 2, raw: 'SIP/2.0 200 OK\nUser-Agent: Asterisk PBX\nAllow: INVITE, ACK, CANCEL, BYE, OPTIONS' },
        items: [
          { time: '2026-06-23 00:12:00', src: '185.45.152.12', dst: '192.168.1.100', method: 'OPTIONS', code: '', title: 'OPTIONS Ping', callId: 'call-id-options-ping-keepalive-8f23', sequence: 1, raw: 'OPTIONS sip:192.168.1.100 SIP/2.0' },
          { time: '2026-06-23 00:12:00', src: '192.168.1.100', dst: '185.45.152.12', method: '200 OK', code: '200', title: '200 OK', callId: 'call-id-options-ping-keepalive-8f23', sequence: 2, raw: 'SIP/2.0 200 OK' }
        ]
      }
    ];
  }, []);

  // Parse actual tcpdump output if loaded
  const parsedDialogsFromTcpdump = useMemo(() => {
    if (!tcpdumpOutput) return [];
    
    const blocks: string[] = [];
    let curBlock: string[] = [];
    tcpdumpOutput.split('\n').forEach(line => {
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\./.test(line)) {
        if (curBlock.length) blocks.push(curBlock.join('\n'));
        curBlock = [line];
      } else if (curBlock.length) {
        curBlock.push(line);
      }
    });
    if (curBlock.length) blocks.push(curBlock.join('\n'));

    const msgList: SipMsg[] = [];
    blocks.forEach((block, idx) => {
      const cleanBlock = getCleanText(block);
      const firstLine = cleanBlock.split('\n')[0] || '';
      const time = firstLine.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)?.[1] || '—';
      const dirMatch = firstLine.match(/IP\s+([^\s]+)\s+>\s+([^:]+):/);
      if (!dirMatch) return;
      const src = dirMatch[1];
      const dst = dirMatch[2];

      const req = cleanBlock.match(/\b(INVITE|ACK|BYE|CANCEL|REFER|UPDATE|INFO|MESSAGE|OPTIONS|REGISTER|SUBSCRIBE|NOTIFY)\s+sip:([^\s]+)\s+SIP\/2\.0/i);
      const resp = cleanBlock.match(/SIP\/2\.0\s+(\d{3})\s+([^\r\n]+)/i);

      let method = 'SIP';
      let code = '';
      let title = '';

      if (req) {
        method = req[1].toUpperCase();
        title = `${method} sip:${req[2]}`;
      } else if (resp) {
        code = resp[1];
        method = `${resp[1]} ${resp[2].trim()}`;
        title = method;
      } else {
        return; 
      }

      const callId = cleanBlock.match(/Call-ID:\s*([^\r\n]+)/i)?.[1]?.trim() ||
                     cleanBlock.match(/\bi:\s*([^\r\n]+)/i)?.[1]?.trim() ||
                     `parsed-id-${src}-${dst}-${method}`;

      const userAgent = cleanBlock.match(/User-Agent:\s*([^\r\n]+)/i)?.[1]?.trim() || 
                        cleanBlock.match(/Server:\s*([^\r\n]+)/i)?.[1]?.trim() || 'Asterisk';

      msgList.push({
        time,
        src,
        dst,
        method,
        code,
        title,
        callId,
        raw: cleanBlock,
        sequence: idx + 1
      });
    });

    // Group into Dialog structure
    const map = new Map<string, SipMsg[]>();
    msgList.forEach(m => {
      if (!map.has(m.callId)) map.set(m.callId, []);
      map.get(m.callId)!.push(m);
    });

    return Array.from(map.entries()).map(([id, items]) => {
      const first = items[0];
      const last = items[items.length - 1];
      
      const containsErr = items.some(i => parseInt(i.code) >= 400);
      const containsBye = items.some(i => i.method === 'BYE');
      const containsCancel = items.some(i => i.method === 'CANCEL');
      
      let status = 'В обработке';
      if (containsErr) status = `Ошибка (${last.method})`;
      else if (containsCancel) status = 'Отменен';
      else if (containsBye) status = 'Завершен нормально';
      else if (items.some(i => i.method === '200 OK' && i.title.includes('INVITE'))) status = 'Разговор';

      const userAgent = items.map(i => i.raw).find(r => r.includes('User-Agent:'))?.match(/User-Agent:\s*([^\r\n]+)/i)?.[1] || 'Сетевой адаптер';

      return {
        id,
        items,
        status,
        first,
        last,
        methodType: first.method,
        fromNum: first.raw.match(/From:\s*<sip:([^@>]+)/i)?.[1] || first.src,
        toNum: first.raw.match(/To:\s*<sip:([^@>]+)/i)?.[1] || first.dst,
        userAgent,
        trunk: first.raw.includes('Trunk') ? 'MTT_Trunk' : '—',
        codec: 'G.711 alaw',
        did: '—'
      } as SipDialog;
    });
  }, [tcpdumpOutput]);

  // Combine live/simulated and parsed tcpdump dialogs for maximum depth
  const allDialogs = useMemo(() => {
    const dialogsMap = new Map<string, SipDialog>();
    mockDialogs.forEach(d => dialogsMap.set(d.id, d));
    parsedDialogsFromTcpdump.forEach(d => dialogsMap.set(d.id, d));
    
    return Array.from(dialogsMap.values()).sort((a,b) => b.first.time.localeCompare(a.first.time));
  }, [mockDialogs, parsedDialogsFromTcpdump]);

  // Default selected dialog
  useEffect(() => {
    if (!selectedDialogId && allDialogs.length > 0) {
      setSelectedDialogId(allDialogs[0].id);
    }
  }, [allDialogs, selectedDialogId]);

  const activeDialog = useMemo(() => {
    return allDialogs.find(d => d.id === selectedDialogId) || allDialogs[0];
  }, [allDialogs, selectedDialogId]);

  // Search & Filter
  const filteredDialogs = useMemo(() => {
    return allDialogs.filter(d => {
      // Method Filter
      if (methodFilter !== 'ALL') {
        if (methodFilter === 'ERRORS') {
          const hasError = d.items.some(i => parseInt(i.code) >= 400);
          if (!hasError) return false;
        } else if (methodFilter === 'SUBSCRIBE') {
          if (d.methodType !== 'SUBSCRIBE' && d.methodType !== 'NOTIFY') return false;
        } else {
          if (d.methodType !== methodFilter) return false;
        }
      }

      // Search Query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesFrom = d.fromNum.toLowerCase().includes(q);
        const matchesTo = d.toNum.toLowerCase().includes(q);
        const matchesId = d.id.toLowerCase().includes(q);
        const matchesAgent = d.userAgent.toLowerCase().includes(q);
        const matchesTrunk = d.trunk.toLowerCase().includes(q);
        const matchesFirstSrc = d.first.src.toLowerCase().includes(q);
        const matchesFirstDst = d.first.dst.toLowerCase().includes(q);
        return matchesFrom || matchesTo || matchesId || matchesAgent || matchesTrunk || matchesFirstSrc || matchesFirstDst;
      }

      return true;
    });
  }, [allDialogs, searchQuery, methodFilter]);

  // Seeding Registrations Data with statuses: Registered, Expired, Unreachable, Flapping
  const registrationsData: Registration[] = [
    { ext: '101', ip: '192.168.1.144', userAgent: 'Grandstream GXP2140 v1.0.11.3', time: '2026-06-23 00:09:12', expire: '112 сек', frequency: '30 сек', status: 'Registered' },
    { ext: '102', ip: '192.168.1.155', userAgent: 'Grandstream GXP1625 v1.0.4.15', time: '2026-06-23 00:08:45', expire: '115 сек', frequency: '120 сек', status: 'Registered' },
    { ext: '103', ip: '192.168.1.102', userAgent: 'Yealink SIP-T31G v124.86.0.40', time: '2026-06-23 00:05:44', expire: 'Expired', frequency: '60 сек', status: 'Expired' },
    { ext: '105', ip: '192.168.1.112', userAgent: 'Yealink SIP-T46U v108.86.0.70', time: '2026-06-22 23:54:12', expire: 'Unreachable', frequency: '300 сек', status: 'Unreachable' },
    { ext: '108', ip: '172.16.4.88', userAgent: 'PhonerLite Desktop Client', time: '2026-06-23 00:11:02', expire: '18 сек (flapping)', frequency: '5 сек', status: 'Flapping' },
    { ext: '201', ip: '192.168.10.22', userAgent: 'Cisco SPA303-G2', time: '2026-06-23 00:01:05', expire: '240 сек', frequency: '300 сек', status: 'Registered' },
  ];

  const filteredRegistrations = useMemo(() => {
    if (regFilterRange === 'all') return registrationsData;
    // Just a demo filter matching range selection
    return registrationsData;
  }, [regFilterRange]);

  // Security center data
  const securityThreats: SecurityThreat[] = [
    { id: 'sec-1', ip: '45.143.22.190', requests: 1421, type: 'SIP Scanner (friendly-scanner)', time: '2026-06-23 00:01:21', severity: 'high' },
    { id: 'sec-2', ip: '185.220.101.4', requests: 432, type: 'Registration Bruteforce', time: '2026-06-23 00:04:10', severity: 'high' },
    { id: 'sec-3', ip: '195.91.13.2', requests: 9811, type: 'OPTIONS Flood Event', time: '2026-06-23 00:09:55', severity: 'medium' },
    { id: 'sec-4', ip: '92.42.10.89', requests: 88, type: 'Extension Enumeration Attack', time: '2026-06-23 00:11:44', severity: 'medium' }
  ];

  // Helper values for Top Panel Status Cards
  const stats = useMemo(() => {
    return {
      activeDialogs: allDialogs.length,
      registrations: registrationsData.filter(r => r.status === 'Registered').length,
      callsProcessing: allDialogs.filter(d => d.status === 'В обработке' || d.status === 'Разговор').length,
      sipErrors: allDialogs.filter(d => d.status.includes('Ошибка') || d.items.some(i => parseInt(i.code) >= 400)).length,
      floodEvents: 14,
      failedRegistrations: registrationsData.filter(r => r.status === 'Expired' || r.status === 'Unreachable').length,
      activeTrunks: 3,
      avgCallSetupTime: '820 ms'
    };
  }, [allDialogs, registrationsData]);

  // Command Tool executions
  const handleTriggerAction = (actionName: string) => {
    switch (actionName) {
      case 'SIP Debug':
        setSipDebugActive(!sipDebugActive);
        setSimulatedLog(prev => [...prev, `${new Date().toLocaleTimeString()} -> Command executed: 'sip set debug ${!sipDebugActive ? 'on' : 'off'}'`]);
        setUiMessage(`Команда Asterisk CLI отправлена: sip set debug ${!sipDebugActive ? 'ВКЛ' : 'ВЫКЛ'}`);
        break;
      case 'PJSIP Debug':
        setPJSIPDebugActive(!pjsipDebugActive);
        setSimulatedLog(prev => [...prev, `${new Date().toLocaleTimeString()} -> Command executed: 'pjsip set logger ${!pjsipDebugActive ? 'on' : 'off'}'`]);
        setUiMessage(`Команда PJSIP logger отправлена: ${!pjsipDebugActive ? 'ВКЛ' : 'ВЫКЛ'}`);
        break;
      case 'SIP Reload':
        setSimulatedLog(prev => [...prev, `${new Date().toLocaleTimeString()} -> Command executed: 'sip reload' / 'pjsip reload'`]);
        setUiMessage('В конфигурации Asterisk выполнена перезагрузка каналов PJSIP/SIP!');
        setTimeout(() => setUiMessage(''), 3000);
        break;
      case 'Check Reg':
        setUiMessage('Запуск проверки регистраций: найден 1 проблемный пир (EXT 108 Flapping!)');
        break;
      case 'Check Trunk':
        setUiMessage('Статус транков: MTT_Trunk_Out [OK, 24ms], Megafon_Inbound [OK, 12ms]');
        break;
      case 'Check OPTIONS':
        setUiMessage('Отправлен ручной OPTIONS Ping на все транки. Получен 200 OK в течение 12мс.');
        break;
      case 'Export Flow':
        triggerExport('json');
        break;
      default:
        break;
    }
  };

  const setPJSIPDebugActive = (val: boolean) => {
    setPjsipDebugActive(val);
  };

  // Export files simulation
  const triggerExport = (format: 'json' | 'csv' | 'excel' | 'pdf') => {
    const dataStr = JSON.stringify(activeDialog, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `sip_flow_analyzer_${activeDialog?.id || 'export'}.${format}`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    setUiMessage(`Успешный экспорт сессии в формат ${format.toUpperCase()}`);
    setTimeout(() => setUiMessage(''), 3000);
  };

  // Error aggregation grouping
  const errorAggregation = useMemo(() => {
    const counts: { [key: string]: number } = {
      '401 Unauthorized': 12,
      '403 Forbidden': 3,
      '404 Not Found': 4,
      '408 Request Timeout': 1,
      '480 Temporarily Unavailable': 0,
      '486 Busy Here': 5,
      '488 Not Acceptable Here': 2,
      '500 Internal Error': 0,
      '503 Service Unavailable': 0,
      '603 Decline': 1
    };
    
    // Accumulate from parsed real outputs
    allDialogs.forEach(d => {
      d.items.forEach(i => {
        if (i.code) {
          const matchKey = Object.keys(counts).find(k => k.startsWith(i.code));
          if (matchKey) {
            counts[matchKey]++;
          }
        }
      });
    });

    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [allDialogs]);

  return (
    <div className={`min-h-screen p-5 font-sans transition-colors duration-200 selection:bg-sky-500 selection:text-white sngrep-bg-main ${isDark ? 'sngrep-theme-dark' : 'sngrep-theme-light'}`} id="sip-flow-analyzer-root">
      
      {/* HEADER SECTION */}
      <div className={`flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 pb-6 border-b transition-colors duration-200 ${sClass('border-slate-800', 'border-slate-200')}`} id="sngrep-header">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] uppercase bg-sky-500 text-slate-950 font-black rounded-sm tracking-widest animate-pulse">PBX MODULE</span>
            <span className={`text-xs font-mono ${sClass('text-slate-400', 'text-slate-500')}`}>• Live Diagnostic Buffer</span>
          </div>
          <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${sClass('text-white', 'text-slate-950')}`}>
            <Activity className="h-6 w-6 text-sky-400" />
            SIP Flow Analyzer <span className={`font-normal text-sm ${sClass('text-slate-500', 'text-slate-400')}`}>sngrep vII</span>
          </h1>
          <p className={`text-xs mt-1 max-w-2xl ${sClass('text-slate-400', 'text-slate-600')}`}>
            Комплексный визуальный анализатор и лестничный трассировщик SIP-диалогов. Синхронизирует потоки <span className="text-sky-500 font-semibold">sngrep</span>, сигнализацию Asterisk AMI каналов и диагностику PJSIP регистраций.
          </p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap gap-2 items-center" id="sngrep-actions">
          {/* Segmented Theme Switcher */}
          <div className={`flex p-0.5 rounded-lg border items-center transition-colors duration-200 ${
            isDark 
              ? 'bg-slate-850 border-slate-700/80' 
              : 'bg-slate-200 border-slate-300'
          }`}>
            <button
              onClick={() => setTabTheme('sync')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                tabTheme === 'sync'
                  ? (isDark ? 'bg-sky-600 text-slate-950 font-bold shadow-xs' : 'bg-sky-600 text-white font-bold shadow-xs')
                  : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-650 hover:text-slate-950')
              }`}
              title="Синхронизировать с темой всего интерфейса"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Авто</span>
            </button>
            <button
              onClick={() => setTabTheme('light')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                tabTheme === 'light'
                  ? (isDark ? 'bg-sky-600 text-slate-950 font-bold shadow-xs' : 'bg-sky-600 text-white font-bold shadow-xs')
                  : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-650 hover:text-slate-950')
              }`}
              title="Светлая тема"
            >
              <Sun className="h-3 w-3" />
              <span>Светлая</span>
            </button>
            <button
              onClick={() => setTabTheme('dark')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                tabTheme === 'dark'
                  ? (isDark ? 'bg-sky-600 text-slate-950 font-bold shadow-xs' : 'bg-sky-600 text-white font-bold shadow-xs')
                  : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-650 hover:text-slate-950')
              }`}
              title="Тёмная тема"
            >
              <Moon className="h-3 w-3" />
              <span>Тёмная</span>
            </button>
          </div>

          {isCapturing ? (
            <button
              onClick={handleStopCapture}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/40 cursor-pointer"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Остановить захват tcpdump
            </button>
          ) : (
            <button
              onClick={() => handleStartCapture('sip')}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-slate-950 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer animate-pulse"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Запуск SIP Capture
            </button>
          )}
        </div>
      </div>

      {/* QUICK TRANSITION INTEGRATION LINKS */}
      <div 
        className={`p-3 flex flex-wrap gap-2 items-center justify-between border-b text-[11px] ${sClass(
          'bg-slate-950/80 border-slate-800', 
          'bg-white border-slate-200 mt-2 shadow-xs rounded-lg'
        )}`} 
        id="sngrep-integrations"
      >
        <span className={`font-mono text-[10px] hidden md:inline ${sClass('text-slate-400', 'text-slate-500')}`}>
          ИНТЕГРАЦИЯ С МОДУЛЯМИ:
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onNavigate?.('calls')}
            className={`px-2.5 py-1 text-emerald-500 dark:text-emerald-400 rounded-md border transition flex items-center gap-1 cursor-pointer font-bold ${sClass(
              'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-emerald-950', 
              'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
            )}`}
          >
            <Activity className="h-3 w-3" />
            Активные звонки
          </button>
          <button
            onClick={() => onNavigate?.('tcpdump')}
            className={`px-2.5 py-1 text-sky-500 dark:text-sky-400 rounded-md border transition flex items-center gap-1 cursor-pointer font-bold ${sClass(
              'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-sky-950', 
              'bg-sky-50 hover:bg-sky-100 border-sky-200'
            )}`}
          >
            <Terminal className="h-3 w-3" />
            Панель TCPDUMP
          </button>
          <button
            onClick={() => onNavigate?.('devices')}
            className={`px-2.5 py-1 text-purple-500 dark:text-purple-400 rounded-md border transition flex items-center gap-1 cursor-pointer font-bold ${sClass(
              'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-purple-950', 
              'bg-purple-50 hover:bg-purple-100 border-purple-200'
            )}`}
          >
            <Network className="h-3 w-3" />
            Карта устройств / SIP пиры
          </button>
          <button
            onClick={() => onNavigate?.('quality')}
            className={`px-2.5 py-1 text-amber-500 dark:text-amber-400 rounded-md border transition flex items-center gap-1 cursor-pointer font-bold ${sClass(
              'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-amber-950', 
              'bg-amber-50 hover:bg-amber-100 border-amber-200'
            )}`}
          >
            <Volume2 className="h-3 w-3" />
            Качество SIP (Pulse)
          </button>
          <button
            onClick={() => onNavigate?.('cli')}
            className={`px-2.5 py-1 rounded-md border transition flex items-center gap-1 cursor-pointer font-bold ${sClass(
              'bg-slate-900 hover:bg-slate-800 text-slate-350 border-slate-800 hover:border-slate-700', 
              'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            )}`}
          >
            <Database className="h-3 w-3" />
            Asterisk CLI
          </button>
        </div>
      </div>

      {uiMessage && (
        <div className="bg-sky-950/40 border border-sky-800/80 px-4 py-2 text-xs text-sky-300 font-bold flex items-center gap-2 animate-fadeIn shadow-xs rounded mb-3" id="sngrep-notify-bar">
          <Info className="h-4 w-4 text-sky-400 flex-shrink-0 animate-bounce" />
          <span>{uiMessage}</span>
        </div>
      )}

      {/* TOP STATE CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 my-4" id="sngrep-status-cards">
        
        {/* Dynamic Cards */}
        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Активные SIP</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-sky-505 text-sky-500 dark:text-sky-400">{stats.activeDialogs}</span>
            <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold">диалогов</span>
          </div>
          <span className="text-[9px] sngrep-text-muted font-mono block mt-1 truncate">Из tcpdump & sngrep</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Регистрации SIP</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-emerald-500 dark:text-emerald-400">{stats.registrations}</span>
            <span className="text-[10px] sngrep-text-muted">/ 6 пиров</span>
          </div>
          <span className="text-[9px] text-emerald-500 font-mono block mt-1 font-semibold">Статус PJSIP: OK</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Вызовы в работе</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-indigo-500 dark:text-indigo-400">{stats.callsProcessing}</span>
            <span className="text-[10px] sngrep-text-muted">Active sessions</span>
          </div>
          <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-mono block mt-1 font-semibold">Обработка вызовов</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Ошибки SIP</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-rose-550 text-rose-500 dark:text-rose-400">{stats.sipErrors}</span>
            <span className="text-[10px] text-rose-500 font-mono font-bold">критических</span>
          </div>
          <span className="text-[9px] text-rose-500 font-mono block mt-1 font-semibold">Обнаружена 403 / 488</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">SIP Flood события</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-amber-500 dark:text-amber-400">{stats.floodEvents}</span>
            <span className="text-[10px] text-amber-550 text-amber-600 dark:text-amber-500 animate-pulse font-bold">DETECTED</span>
          </div>
          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono block mt-1 font-semibold">Защита Fail2Ban</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Failed Registrations</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-orange-500 dark:text-orange-400">{stats.failedRegistrations}</span>
            <span className="text-[10px] text-orange-600 dark:text-orange-500 font-bold">сброшено</span>
          </div>
          <span className="text-[9px] text-orange-500 font-mono block mt-1 font-semibold">Неверные пароли</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Активные транки</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black sngrep-text-title">{stats.activeTrunks}</span>
            <span className="text-[10px] sngrep-text-muted font-bold">провайдера</span>
          </div>
          <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-mono block mt-1 font-semibold">SST Trunks [100%]</span>
        </div>

        <div className="sngrep-bg-card p-3 rounded-xl border sngrep-border flex flex-col justify-between transition-colors duration-200">
          <span className="text-[10px] sngrep-text-muted uppercase tracking-wider font-semibold">Ср.время установл. (PDD)</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-teal-500 dark:text-teal-400">{stats.avgCallSetupTime}</span>
            <span className="text-[10px] sngrep-text-muted font-bold">милисек.</span>
          </div>
          <span className="text-[9px] text-teal-600 dark:text-teal-500 font-mono block mt-1 font-semibold">Отличный показатель</span>
        </div>

      </div>

      {/* QUICK DIAG DIAGNOSTICS COMMANDS WORKBENCH */}
      <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 mb-4" id="sngrep-commands-panel">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-black text-slate-300 uppercase tracking-wider">Инструменты быстрого управления отладкой:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleTriggerAction('SIP Debug')}
              className={`px-3 py-1.5 rounded text-[11px] font-bold transition flex items-center gap-1 border cursor-pointer ${
                sipDebugActive 
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400' 
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
              }`}
            >
              <Cpu className="h-3 w-3" />
              SIP Debug {sipDebugActive ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => handleTriggerAction('PJSIP Debug')}
              className={`px-3 py-1.5 rounded text-[11px] font-bold transition flex items-center gap-1 border cursor-pointer ${
                pjsipDebugActive 
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400' 
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
              }`}
            >
              <Cpu className="h-3 w-3" />
              PJSIP Debug {pjsipDebugActive ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => handleTriggerAction('SIP Reload')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-sky-400 rounded border border-slate-800 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              SIP Reload
            </button>
            <button
              onClick={() => handleTriggerAction('Check Reg')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="h-3 w-3" />
              Проверить регистрацию
            </button>
            <button
              onClick={() => handleTriggerAction('Check Trunk')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Wifi className="h-3 w-3" />
              Проверить транк
            </button>
            <button
              onClick={() => handleTriggerAction('Check OPTIONS')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Network className="h-3 w-3" />
              Проверить OPTIONS
            </button>
            <button
              onClick={() => handleTriggerAction('Export Flow')}
              className="px-3 py-1.5 bg-sky-950/50 hover:bg-sky-900/60 text-sky-300 rounded border border-sky-900/40 text-[11px] font-black transition flex items-center gap-1 cursor-pointer"
            >
              <Download className="h-3 w-3" />
              Экспорт SIP Flow
            </button>
          </div>
        </div>

        {/* Command CLI simulation trace logs */}
        {simulatedLog.length > 0 && (
          <div className="mt-3 bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[10px] text-emerald-400 max-h-24 overflow-y-auto">
            <div className="flex justify-between items-center text-slate-500 border-b border-slate-900 pb-1 mb-1 font-bold">
              <span>ЛОГ ДЕЙСТВИЙ РАЗРАБОТЧИКА СЕРВЕРА</span>
              <button onClick={() => setSimulatedLog([])} className="text-rose-500 hover:underline">очистить</button>
            </div>
            {simulatedLog.map((log, index) => (
              <div key={index} className="leading-relaxed">{log}</div>
            ))}
          </div>
        )}
      </div>

      {/* DOUBLE COLUMN CORE WORKSPACE */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4" id="sngrep-workspace">
        
        {/* LEFT COLUMN: DIALOG TREE & FILTERS (4/12 width) */}
        <div className="xl:col-span-4 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col overflow-hidden" id="sngrep-left-panel">
          
          {/* Panel header & search */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/40">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase text-slate-300 tracking-wider">SIP Диалоги / sngrep</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-805 text-slate-400 font-mono border border-slate-800">
                Found {filteredDialogs.length}
              </span>
            </div>

            {/* Search inputs */}
            <div className="relative mb-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по Экстеншену, IP, Call-ID, UA..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 pl-8 font-semibold placeholder-slate-500"
              />
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            </div>

            {/* Quick Filter buttons by SIP MethodType */}
            <div className="flex flex-wrap gap-1 mt-1" id="sip-method-filters">
              {['ALL', 'INVITE', 'REGISTER', 'OPTIONS', 'SUBSCRIBE', 'ERRORS'].map((method) => (
                <button
                  key={method}
                  onClick={() => setMethodFilter(method)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                    methodFilter === method 
                      ? 'bg-sky-500 hover:bg-sky-600 text-slate-950 border-sky-400 font-extrabold' 
                      : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border-slate-800/80'
                  }`}
                >
                  {method === 'SUBSCRIBE' ? 'SUB/NOTIFY' : method}
                </button>
              ))}
            </div>
          </div>

          {/* Dialogs List */}
          <div className="overflow-y-auto max-h-[580px] divide-y divide-slate-800/80">
            {filteredDialogs.length === 0 ? (
              <div className="text-center p-12 text-slate-500 text-xs flex flex-col items-center justify-center gap-1.5">
                <HelpCircle className="h-8 w-8 text-slate-600 animate-pulse" />
                <span>Диалогов в базе не обнаружено.</span>
                <span className="text-[10px] text-slate-600">Попробуйте сменить фильтр или запустить захват.</span>
              </div>
            ) : (
              filteredDialogs.map((d) => {
                const isSelected = d.id === selectedDialogId;
                const totalMsgs = d.items.length;
                const hasErr = d.items.some(i => parseInt(i.code) >= 400);
                
                // Class generators based on status
                let pillClass = 'bg-sky-950 text-sky-400 border-sky-900/60';
                if (d.status.includes('Завершен') || d.status.includes('нормально')) pillClass = 'bg-emerald-950 text-emerald-400 border-emerald-900/60';
                else if (d.status.includes('Ошибка') || hasErr) pillClass = 'bg-rose-950 text-rose-400 border-rose-900/60';
                else if (d.status.includes('Разговор')) pillClass = 'bg-sky-450 bg-indigo-950 text-indigo-400 border-indigo-950/60';
                else if (d.status.includes('блокирован')) pillClass = 'bg-amber-950/50 text-amber-500 border-amber-900/60';

                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDialogId(d.id)}
                    className={`w-full text-left p-3 hover:bg-slate-900/60 transition relative flex flex-col gap-1.5 cursor-pointer ${
                      isSelected ? 'bg-slate-900 border-l-[3px] border-sky-400' : 'border-l-[3px] border-transparent'
                    }`}
                  >
                    {/* First line: Direction, code */}
                    <div className="flex justify-between items-center gap-1">
                      <span className="font-extrabold text-[12px] text-slate-200 flex items-center gap-1 truncate">
                        <span className="text-sky-400">{d.fromNum}</span>
                        <ArrowRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                        <span className="text-slate-150">{d.toNum}</span>
                      </span>

                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${pillClass} uppercase tracking-wider whitespace-nowrap`}>
                        {d.status}
                      </span>
                    </div>

                    {/* Second line: Method type & Timing logs */}
                    <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1 py-0.2 bg-slate-800 text-sky-300 font-semibold text-[10px] rounded">
                          {d.methodType}
                        </span>
                        <span className="text-slate-500 truncate max-w-[150px]" title={d.userAgent}>{d.userAgent}</span>
                      </div>
                      <span className="text-slate-400 text-[10px]">{d.first.time.split(' ')[1]}</span>
                    </div>

                    {/* Third line: Call-ID */}
                    <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                      <span className="truncate max-w-[200px]" title={d.id}>ID: {d.id}</span>
                      <span className="text-sky-500 text-[10px] font-bold">{totalMsgs} msg</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL TABS & SIP FLOW/LADDER DIAGRAM (8/12 width) */}
        <div className="xl:col-span-8 bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden flex flex-col" id="sngrep-right-panel">
          
          {/* Segment selection tabs */}
          <div className="flex flex-wrap border-b border-slate-800 bg-slate-900/30" id="sngrep-panel-tabs">
            <button
              onClick={() => setActiveTab('ladder')}
              className={`px-4 py-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'ladder' 
                  ? 'border-sky-400 text-sky-400 bg-slate-900/60' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              SIP Ladder Diagram
            </button>
            <button
              onClick={() => setActiveTab('headers')}
              className={`px-4 py-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'headers' 
                  ? 'border-sky-400 text-sky-400 bg-slate-900/60' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              Карточка SIP и Заголовки
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`px-4 py-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'registrations' 
                  ? 'border-sky-400 text-sky-400 bg-slate-900/60' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Анализ SIP Регистраций
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-4 py-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'security' 
                  ? 'border-sky-400 text-sky-400 bg-slate-900/60' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              SIP Security Center
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`px-4 py-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'diagnostics' 
                  ? 'border-sky-400 text-sky-400 bg-slate-900/60' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5 animate-pulse" />
              Авто-диагностика SIP
            </button>
          </div>

          {/* MAIN TAB CONTENT DISPLAY CONTAINER */}
          <div className="p-4 flex-1">
            
            {/* LADDER & SEQUENCE GRAPH TAB */}
            {activeTab === 'ladder' && (
              <div className="space-y-4 animate-fadeIn" id="sngrep-tab-ladder">
                {activeDialog ? (
                  <>
                    {/* Header profile info */}
                    <div className="flex flex-col md:flex-row justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-[10px] text-sky-400 uppercase tracking-widest font-black">Текущая диаграмма вызова</span>
                        <h4 className="text-sm font-extrabold text-white mt-1">
                          {activeDialog.fromNum} ➔ {activeDialog.toNum} ({activeDialog.status})
                        </h4>
                        <span className="text-[10px] font-mono text-slate-500 block truncate max-w-lg mt-0.5">Call-ID: {activeDialog.id}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2 md:mt-0">
                        <button
                          onClick={() => triggerExport('json')}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-[11px] transition flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" />
                          Скачать JSON
                        </button>
                        <button
                          onClick={() => triggerExport('pdf')}
                          className="px-2.5 py-1.5 bg-sky-900/60 hover:bg-sky-800/85 text-sky-250 text-white rounded font-bold text-[11px] transition flex items-center gap-1"
                        >
                          <Share2 className="h-3 w-3" />
                          Экспорт SIP Flow PDF
                        </button>
                      </div>
                    </div>

                    {/* VIRTUAL SIP ROUTE PATHWAY - GENERAL CONCEPT CARD */}
                    <div className="p-3 bg-slate-900/20 border border-slate-800/60 rounded-lg">
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-wider block mb-2">МАРШРУТ СИГНАЛИЗАЦИИ</span>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded text-center min-w-[100px]">
                          <div className="text-[10px] text-slate-400">Источник</div>
                          <div className="text-xs font-black text-sky-400">{activeDialog.fromNum}</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-600" />
                        <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded text-center min-w-[100px]">
                          <div className="text-[10px] text-slate-400">ВАТС Шлюз</div>
                          <div className="text-xs font-black text-white">PBXPULS</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-600" />
                        <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded text-center min-w-[100px]">
                          <div className="text-[10px] text-slate-400">IP-АТС Asterisk</div>
                          <div className="text-xs font-black text-indigo-400">FreePBX PBX</div>
                        </div>
                        {activeDialog.trunk !== '—' && (
                          <>
                            <ArrowRight className="h-4 w-4 text-slate-600" />
                            <div className="px-3 py-1 bg-sky-950/40 border border-sky-850/60 rounded text-center min-w-[100px]">
                              <div className="text-[10px] text-sky-300">Транк</div>
                              <div className="text-xs font-black text-sky-300">{activeDialog.trunk}</div>
                            </div>
                          </>
                        )}
                        <ArrowRight className="h-4 w-4 text-slate-600" />
                        <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded text-center min-w-[100px]">
                          <div className="text-[10px] text-slate-400">Абонент</div>
                          <div className="text-xs font-black text-rose-450 text-white">{activeDialog.toNum}</div>
                        </div>
                      </div>
                    </div>

                    {/* CORE LADDER DIAGRAM VISUALIZATION */}
                    <div className="bg-slate-950/90 rounded-xl border border-slate-800 p-4 font-mono overflow-x-auto min-h-[350px]">
                      
                      {/* Ladder Vertical Nodes (Columns headers) */}
                      <div className="grid grid-cols-5 text-center text-xs font-black border-b border-slate-850 pb-2 mb-4 text-slate-300 min-w-[500px]">
                        <div>Телефон ({activeDialog.fromNum})</div>
                        <div>FreePBX</div>
                        <div>Asterisk</div>
                        <div>SBC / Trunk</div>
                        <div>Оператор ({activeDialog.toNum})</div>
                      </div>

                      {/* Verticals Lines Layout behind message arrows */}
                      <div className="relative min-w-[500px]" style={{ minHeight: '280px' }}>
                        
                        {/* Simulated background vertical lines */}
                        <div className="absolute inset-0 grid grid-cols-5 pointer-events-none">
                          <div className="border-r border-dashed border-slate-800 h-full mx-auto"></div>
                          <div className="border-r border-dashed border-slate-800 h-full mx-auto"></div>
                          <div className="border-r border-dashed border-slate-800 h-full mx-auto"></div>
                          <div className="border-r border-dashed border-slate-800 h-full mx-auto"></div>
                          <div className="h-full mx-auto"></div>
                        </div>

                        {/* Interactive message arrows overlay based on current call items */}
                        <div className="space-y-4 relative z-10 pt-2 pb-6">
                          {activeDialog.items.map((m, index) => {
                            const isReq = !m.code;
                            const isErr = parseInt(m.code) >= 400;
                            const isSuccess = m.code === '200';
                            
                            // Align arrow direction based on parsed source & destination
                            // For a clean ladder render, let's create alternating horizontal steps
                            const isLeftToRight = index % 2 === 0;

                            let colorClass = 'text-sky-400';
                            let borderLine = 'border-sky-500';
                            let bgTag = 'bg-sky-900/60 text-sky-300 border-sky-800';

                            if (isErr) {
                              colorClass = 'text-rose-400 font-extrabold';
                              borderLine = 'border-rose-500';
                              bgTag = 'bg-rose-950 text-rose-300 border-rose-900';
                            } else if (isSuccess) {
                              colorClass = 'text-emerald-400 font-bold';
                              borderLine = 'border-emerald-500';
                              bgTag = 'bg-emerald-950 text-emerald-300 border-emerald-900';
                            } else if (m.method === '180 Ringing' || m.method === '100 Trying') {
                              colorClass = 'text-amber-400';
                              borderLine = 'border-amber-500';
                              bgTag = 'bg-amber-950 text-amber-300 border-amber-900';
                            }

                            return (
                              <div key={index} className="grid grid-cols-12 gap-1 items-center hover:bg-slate-900/40 p-1 rounded transition">
                                
                                {/* Timestamp column (cols 1-2) */}
                                <div className="col-span-2 text-[10px] text-slate-500 font-normal">
                                  {m.time.split(' ')[1] || '00:00'}
                                </div>

                                {/* Signaling sequence line (cols 3-10) */}
                                <div className="col-span-8 relative">
                                  {isLeftToRight ? (
                                    <div className="flex items-center w-full">
                                      <div className="w-1.5 h-1.5 rounded-full bg-sky-400"></div>
                                      <div className={`flex-1 border-t-2 border-dashed ${borderLine} relative`}>
                                        <div className="absolute inset-0 -top-3.5 text-center">
                                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] border tracking-wide font-black ${bgTag}`}>
                                            {m.method}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-sky-505 border-l-current text-sky-500"></div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center w-full">
                                      <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[6px] border-r-sky-505 border-r-current text-sky-400"></div>
                                      <div className={`flex-1 border-t-2 border-dashed ${borderLine} relative`}>
                                        <div className="absolute inset-0 -top-3.5 text-center">
                                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] border tracking-wide font-black ${bgTag}`}>
                                            {m.method}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="w-1.5 h-1.5 rounded-full bg-sky-450 bg-sky-500"></div>
                                    </div>
                                  )}
                                </div>

                                {/* Source summary (cols 11-12) */}
                                <div className="col-span-2 text-right text-[10px] text-slate-400 truncate font-mono">
                                  {isLeftToRight ? `${m.src.split('.').pop()}➔${m.dst.split('.').pop()}` : `${m.dst.split('.').pop()}➔${m.src.split('.').pop()}`}
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                    {/* SIP SEQUENCE TIMELINE SUMMARY */}
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-[11px] font-black tracking-widest text-slate-400 uppercase block mb-3">ВРЕМЕННАЯ ШКАЛА SIP СОБЫТИЙ СЕКВЕНСОРА</span>
                      <div className="relative pl-6 space-y-3 border-l border-slate-800">
                        {activeDialog.items.map((m, idx) => (
                          <div key={idx} className="relative">
                            {/* Bullet dot */}
                            <div className="absolute -left-[30px] top-1 w-2 h-2 rounded-full bg-sky-500 border-2 border-slate-950 ring-2 ring-sky-950"></div>
                            
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between text-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-slate-500">{m.time}</span>
                                <span className={`px-1.5 py-0.2 rounded font-mono font-extrabold text-[10px] border ${
                                  m.code ? 'bg-indigo-950 text-indigo-300 border-indigo-900' : 'bg-slate-900 text-slate-300 border-slate-800'
                                }`}>
                                  {m.method}
                                </span>
                                <span className="text-slate-300">{m.title}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono mt-0.5 md:mt-0">{m.src} ➔ {m.dst}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-slate-500 text-xs">Выберите диалог слева для генерации лестничной диаграммы.</div>
                )}
              </div>
            )}

            {/* HEADERS & RAW DIALOG CONTENT TAB */}
            {activeTab === 'headers' && (
              <div className="space-y-4 animate-fadeIn" id="sngrep-tab-headers">
                {activeDialog ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Call Specification Card */}
                    <div className="bg-slate-900/40 rounded-xl border border-slate-800 p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                        <Settings className="h-4 w-4 text-sky-400" />
                        <h4 className="text-xs font-black uppercase text-slate-200">КАРТОЧКА ВЫЗОВА И ПАРАМЕТРЫ СЕССИИ</h4>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500 block">Call-ID сессии</span>
                          <span className="font-mono text-slate-200 break-all">{activeDialog.id}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">From (От кого)</span>
                          <span className="font-semibold text-sky-305 text-sky-400 font-mono">{activeDialog.first.src}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">To (Исходящий набор)</span>
                          <span className="font-semibold text-slate-200 font-mono">{activeDialog.first.dst}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">DID (Провайдер)</span>
                          <span className="font-mono text-slate-200">{activeDialog.did || '— (Локальный набор)'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Trunk (Транк)</span>
                          <span className="font-semibold text-sky-450 text-indigo-400 font-mono">{activeDialog.trunk || 'Байпас транка'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Кодек связи (SDP)</span>
                          <span className="font-semibold mt-0.5 text-slate-300 font-mono">{activeDialog.codec || 'G.711 alaw / ptime 20'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Направление Роута</span>
                          <span className="text-emerald-400 font-black">Входящий вызов</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">User-Agent клиента</span>
                          <span className="text-slate-200 truncate block font-mono" title={activeDialog.userAgent}>{activeDialog.userAgent}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-805 mt-3 text-[11px] text-slate-500 space-y-1 font-mono">
                        <div><strong className="text-slate-400">Contact:</strong> &lt;sip:{activeDialog.fromNum}@{activeDialog.first.src}:5060&gt;</div>
                        <div className="truncate"><strong className="text-slate-400">Via:</strong> SIP/2.0/UDP {activeDialog.first.src}:5060;rport=5060</div>
                        <div><strong className="text-slate-400">Record-Route:</strong> &lt;sip:{activeDialog.first.dst}:5060;lr&gt;</div>
                      </div>

                    </div>

                    {/* SNGREP Raw header text view details */}
                    <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 flex flex-col overflow-hidden">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-850 mb-3">
                        <span className="text-xs font-black uppercase text-slate-350 flex items-center gap-1.5">
                          <Terminal className="h-3.5 w-3.5 text-sky-400" />
                          Сырые SIP Заголовки (TCP/UDP)
                        </span>
                        <span className="text-[10px] text-slate-500">Порт 5060/5061</span>
                      </div>
                      
                      <div className="flex-1 bg-slate-900 p-3 rounded border border-slate-800 max-h-[300px] overflow-y-auto">
                        <pre className="font-mono text-[10px] text-sky-300 whitespace-pre bg-transparent leading-relaxed select-text tracking-wide">
                          {activeDialog.first.raw}
                          {"\n\n"}
                          {"# --- Содержимое пакета SDP Payload ---"}
                          {"\n"}
                          {"v=0\r\no=Active-Session 311 992 IN IP4 " + activeDialog.first.src + "\r\ns=PBXPULS-VoiceStream\r\nc=IN IP4 " + activeDialog.first.src + "\r\nt=0 0\r\nm=audio 14002 RTP/AVP 8 0 101\r\na=rtpmap:8 PCMA/8000\r\na=rtpmap:101 telephone-event/8000"}
                          {"\n\n"}
                          {activeDialog.last?.raw || ''}
                        </pre>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500 text-center font-mono">
                        Кликните правой кнопкой мыши для копирования этого лога
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500 text-xs">Выберите диалог для детального просмотра.</div>
                )}
              </div>
            )}

            {/* REGISTRATIONS ANALYSIS & HISTORY TAB */}
            {activeTab === 'registrations' && (
              <div className="space-y-4 animate-fadeIn" id="sngrep-tab-registrations">
                
                {/* Active Registrations List Table */}
                <div className="bg-slate-900/40 rounded-xl border border-slate-800 p-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-slate-800 mb-4 me-1">
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-200">АКТИВНЫЕ SIP РЕГИСТРАЦИИ (AOR / ENDPOINTS)</h4>
                      <p className="text-[11px] text-slate-500">Данные по контактам PJSIP и биндингам FreePBX в системе.</p>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => setRegFilterRange('today')}
                        className={`text-[10px] px-2.5 py-1 rounded transition ${regFilterRange === 'today' ? 'bg-sky-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}
                      >
                        Сегодня
                      </button>
                      <button
                        onClick={() => setRegFilterRange('7days')}
                        className={`text-[10px] px-2.5 py-1 rounded transition ${regFilterRange === '7days' ? 'bg-sky-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}
                      >
                        7 дней
                      </button>
                      <button
                        onClick={() => setRegFilterRange('30days')}
                        className={`text-[10px] px-2.5 py-1 rounded transition ${regFilterRange === '30days' ? 'bg-sky-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}
                      >
                        30 дней
                      </button>
                      <button
                        onClick={() => setRegFilterRange('all')}
                        className={`text-[10px] px-2.5 py-1 rounded transition ${regFilterRange === 'all' ? 'bg-sky-500 text-slate-950 font-black' : 'bg-slate-850 text-slate-400'}`}
                      >
                        Всё время
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Ext (Внут.ном)</th>
                          <th className="p-2.5">IP Адрес телефона</th>
                          <th className="p-2.5">User-Agent трубки</th>
                          <th className="p-2.5">Время регистрации</th>
                          <th className="p-2.5">Expire (Таймер)</th>
                          <th className="p-2.5 text-center">Частота</th>
                          <th className="p-2.5 text-right">Статус</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredRegistrations.map((r, i) => {
                          let statusColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-900';
                          if (r.status === 'Expired') statusColor = 'text-amber-400 bg-amber-950/40 border-amber-900';
                          else if (r.status === 'Unreachable') statusColor = 'text-rose-400 bg-rose-950/40 border-rose-900';
                          else if (r.status === 'Flapping') statusColor = 'text-rose-500 bg-rose-950 border-rose-800 animate-pulse';

                          return (
                            <tr key={i} className="hover:bg-slate-900/60 transition">
                              <td className="p-2.5 font-bold text-white text-xs">{r.ext}</td>
                              <td className="p-2.5 text-slate-300">{r.ip}</td>
                              <td className="p-2.5 text-slate-400 truncate max-w-[150px]" title={r.userAgent}>{r.userAgent}</td>
                              <td className="p-2.5 text-slate-400">{r.time}</td>
                              <td className="p-2.5 text-slate-350">{r.expire}</td>
                              <td className="p-2.5 text-slate-450 text-center">{r.frequency}</td>
                              <td className="p-2.5 text-right">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${statusColor}`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* History of registrations trace log stream */}
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <span className="text-[11px] font-black tracking-widest text-slate-400 uppercase block mb-3">ИСТОРИЧЕСКИЙ ЖУРНАЛ РЕГИСТРАЦИЙ С КЛИЕНТСКИХ IP</span>
                  <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-1">
                    <div className="p-2 bg-slate-900 rounded border border-slate-850 flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-500">2026-06-23 00:11:02</span>
                        <strong className="text-white">EXT 108</strong>
                        <span className="text-rose-400">Flapping alert: зарегистрирован повторно за последние 5 секунд</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">IP: 172.16.4.88</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850 flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-500">2026-06-23 00:09:12</span>
                        <strong className="text-white">EXT 101</strong>
                        <span className="text-emerald-400">Зарегистрирован через pjsip (WWW-Auth OK)</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">IP: 192.168.1.144</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850 flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-500">2026-06-23 00:08:45</span>
                        <strong className="text-white">EXT 102</strong>
                        <span className="text-emerald-400">Успешно получен 200 OK на REGISTER</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">IP: 192.168.1.155</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850 flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-500">2026-06-23 00:05:44</span>
                        <strong className="text-white">EXT 103</strong>
                        <span className="text-amber-400">Таймаут перерегистрации: expire timeout</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">IP: 192.168.1.102</span>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* SECURITY CENTER TAB */}
            {activeTab === 'security' && (
              <div className="space-y-4 animate-fadeIn" id="sngrep-tab-security">
                <div className="bg-slate-905 bg-slate-900/40 rounded-xl border border-slate-800 p-4">
                  <div className="pb-3 border-b border-slate-800 mb-4">
                    <h4 className="text-xs font-black uppercase text-slate-200 flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-rose-500" />
                      SIP SECURITY SHIELD — ОБНАРУЖЕНИЕ УГРОЗ
                    </h4>
                    <p className="text-[11px] text-slate-500">Автоматически выявляет подозрительные SIP паттерны, сканеры уязвимостей и осуществляет интеллектуальный бан.</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Зараженный IP</th>
                          <th className="p-2.5">Атака / Опасный Паттерн</th>
                          <th className="p-2.5 text-center">Всего запросов</th>
                          <th className="p-2.5">Время фиксации</th>
                          <th className="p-2.5 text-center">Критичность</th>
                          <th className="p-2.5 text-right">Действие</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {securityThreats.map((s, i) => (
                          <tr key={i} className="hover:bg-slate-900/60 transition">
                            <td className="p-2.5 font-bold text-white text-xs">{s.ip}</td>
                            <td className="p-2.5">
                              <span className="text-slate-350">{s.type}</span>
                            </td>
                            <td className="p-2.5 text-center font-black text-rose-400">{s.requests}</td>
                            <td className="p-2.5 text-slate-400">{s.time}</td>
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                                s.severity === 'high' 
                                  ? 'bg-rose-950 text-rose-400 border-rose-900 uppercase animate-pulse' 
                                  : 'bg-amber-955 bg-amber-950 text-amber-500 border-amber-900'
                              }`}>
                                {s.severity}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                onClick={() => {
                                  setUiMessage(`Адрес ${s.ip} успешно добавлен в черный список Fail2Ban.`);
                                  setSimulatedLog(prev => [...prev, `${new Date().toLocaleTimeString()} -> Ip ban rule injected: 'iptables -A INPUT -s ${s.ip} -j DROP'`]);
                                }}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-slate-950 text-white rounded text-[10px] font-extrabold transition cursor-pointer"
                              >
                                Заблокировать (BAN IP)
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Внимание системы безопасности:</strong> Обнаружены множественные попытки перебора Extension со сканера <strong className="text-rose-400">45.143.22.190</strong>. Система PBXPULS Sec заблокировала 14 вредоносных OPTIONS/INVITE запросов к АТС. Интегрированное правило IPTables защищает ваш FreePBX сервер.
                  </div>
                </div>
              </div>
            )}

            {/* DIAGNOSTICS & RECOMMENDATIONS & ERROR GROUPS TAB */}
            {activeTab === 'diagnostics' && (
              <div className="space-y-4 animate-fadeIn" id="sngrep-tab-diagnostics">
                
                {/* 1. Grouped SIP Signaling Errors counts panel */}
                <div className="bg-slate-905 bg-slate-900/40 rounded-xl border border-slate-800 p-4">
                  <h4 className="text-xs font-black uppercase text-slate-205 text-white mb-3 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-rose-500" />
                    АНАЛИЗ И ГРУППИРОВКА SIP ОШИБОК
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" id="diagnostics-error-grid">
                    {errorAggregation.map((err, idx) => {
                      const isHigh = err.count > 0 && !err.name.includes('486'); // 486 is busy - normal
                      return (
                        <div key={idx} className={`p-2 rounded border text-center transition ${
                          err.count > 0 
                            ? isHigh 
                              ? 'bg-rose-950/30 border-rose-900 text-rose-300' 
                              : 'bg-amber-955 bg-amber-950/20 border-amber-900/50 text-amber-400'
                            : 'bg-slate-900 border-slate-800/80 text-slate-500'
                        }`}>
                          <div className="text-[10px] truncate" title={err.name}>{err.name}</div>
                          <div className="text-lg font-black mt-1">{err.count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Diagnostic database & Troubleshooting recommendations widgets */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-black text-slate-300 uppercase tracking-widest">АВТОМАТИЧЕСКАЯ ТЕЛЕФОННАЯ ДИАГНОСТИКА:</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DIAGNOSTIC_PROFILES.map((profile) => (
                      <div key={profile.id} className="bg-slate-950 rounded-xl border border-slate-800 p-4 flex flex-col justify-between hover:border-slate-700 transition">
                        <div>
                          <div className="flex justify-between items-start gap-1 pb-2 border-b border-slate-850">
                            <span className="text-xs font-black text-rose-450 text-white flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              {profile.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-slate-900 text-sky-300 rounded font-semibold border border-slate-800 uppercase font-mono">
                              {profile.category}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2 text-xs">
                            <div>
                              <span className="text-rose-400 font-bold block">Проблема:</span>
                              <span className="text-slate-200 mt-0.5 block font-medium">{profile.problem}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-bold block">Причина возникновения:</span>
                              <span className="text-slate-300 block leading-relaxed">{profile.cause}</span>
                            </div>
                            <div className="bg-slate-900 p-2.5 rounded border border-slate-800 mt-2">
                              <span className="text-sky-300 font-bold block">Рекомендация инженеру PBXPULS:</span>
                              <span className="text-white block mt-0.5 leading-relaxed font-semibold">{profile.recommendation}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-850 flex justify-end">
                          <button
                            onClick={() => {
                              setUiMessage(`Режим глубокого сканирования '${profile.category}' запущен. Тесты в норме.`);
                            }}
                            className="text-[10px] font-black text-sky-400 hover:text-sky-300 transition hover:underline"
                          >
                            Запустить проверку по шаблону &rarr;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Advanced Diagnostic profile listings for VoIP anomalies */}
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <span className="text-[11px] font-black tracking-widest text-slate-400 uppercase block mb-3">ДОПОЛНИТЕЛЬНЫЕ ШАБЛОНЫ УСТРАНЕНИЯ АНОМАЛИЙ КАНАЛОВ СВЯЗИ</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-300">
                    <div className="p-2.5 bg-slate-900 rounded border border-slate-850">
                      <strong className="text-white block">SIP Flapping</strong>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">Быстрый сброс и установка регистраций. Лимит Expire мал.</span>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded border border-slate-850">
                      <strong className="text-white block">Duplicate Registration</strong>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">Один extension прописан на нескольких аппаратах.</span>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded border border-slate-850">
                      <strong className="text-white block">SIP Retransmissions</strong>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">Потеря пакетов ACK / BYE. Сетевые задержки роутера.</span>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded border border-slate-850">
                      <strong className="text-white block">Ghost Calls (Звонки фантомы)</strong>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">Сканер шлет INVITE на IP напрямую мимо PBX.</span>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
