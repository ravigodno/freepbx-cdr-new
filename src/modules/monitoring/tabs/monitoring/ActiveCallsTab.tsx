import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
  Server,
  Shuffle,
  Clock,
  ArrowRight,
  Search,
  Filter,
  X,
  ListFilter,
  CheckCircle,
  AlertTriangle,
  Play,
  Download,
  Database,
  User,
  Cpu,
  FileText,
  Layout,
  MessageSquare,
  Settings,
  Zap,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Terminal,
  Network,
  Sliders,
  Eye,
  Volume2,
  VolumeX,
  FileSpreadsheet,
  AlertOctagon,
  CornerDownRight,
  Split,
  ChevronRight,
  Layers,
  HelpCircle
} from 'lucide-react';

// Props matching src/App.tsx exactly
interface Props {
  liveSessionsData: any;
  liveSearch: string;
  setLiveSearch: (v: string) => void;
}

// Full schema of active call
interface ActiveCall {
  id: string; // uniqueid
  callId: string; // SIP Call-ID
  linkedId: string;
  startTime: string;
  type: 'Inbound' | 'Outbound' | 'Internal';
  caller: string;
  callerName?: string;
  callee: string;
  calleeName?: string;
  did: string;
  trunk: string;
  queue: string;
  operator: string;
  status: 'Ringing' | 'Dialing' | 'Queue' | 'Bridged' | 'Transfer' | 'Hold' | 'Conference' | 'Hangup';
  duration: number; // in seconds
  priority: string;
  application: string;
  appData: string;
  channel: string;
  bridgedChannel: string;
  // RTP analysis
  rtp: {
    source: string;
    destination: string;
    codec: string;
    packetCount: number;
    packetLoss: number;
    jitter: number;
    rtt: number;
    mos: number;
  };
  // SIP Diagnostics
  sip: {
    from: string;
    to: string;
    contact: string;
    via: string;
    sdp: string;
    userAgent: string;
    codecNegotiation: string;
  };
  // Problems analysis
  problems: {
    type: string;
    level: 'warning' | 'error' | 'info';
    cause: string;
    time: string;
    recommendation: string;
  }[];
  // CellTrace entries
  trace: {
    time: string;
    event: string;
    description: string;
    tag?: 'NewChannel' | 'DialBegin' | 'BridgeEnter' | 'BridgeLeave' | 'Hangup' | 'Queue' | 'Routing' | 'Info';
  }[];
  // Transfer analysis details
  transferInfo?: {
    type: 'Blind' | 'Attended';
    parties: string[];
    status: string;
  };
}

// Queue Status record schema
interface QueueStatus {
  queue: string;
  waitingCount: number;
  membersOnline: number;
  membersBusy: number;
  avgWait?: string;
  maxWait?: string;
  sla?: string;
  callers?: {
    callerId: string;
    joinedAt: string;
    waitTime: number;
    priority: number;
  }[];
}

// Formatting helpers
function durationFmt(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

export default function ActiveCallsTab({ liveSessionsData, liveSearch, setLiveSearch }: Props) {
  // 1. Core State
  const [isSimulatorMode, setIsSimulatorMode] = useState<boolean>(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'trace' | 'sip_rtp' | 'queue_transfer' | 'problems' | 'cel_cdr'>('trace');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Inbound' | 'Outbound' | 'Internal'>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  // Real terminal active Asterisk raw command selection
  const [selectedRawCmd, setSelectedRawCmd] = useState<'concise' | 'verbose' | 'queues' | 'pjsip' | 'sip'>('concise');

  const getRawCmdOutput = () => {
    if (!liveSessionsData?.raw) return '';
    const raw = liveSessionsData.raw;
    if (selectedRawCmd === 'concise') return raw.concise || '';
    if (selectedRawCmd === 'verbose') return raw.verbose || '';
    if (selectedRawCmd === 'queues') return raw.queues || '';
    if (selectedRawCmd === 'pjsip') return raw.pjsipChannels || '';
    if (selectedRawCmd === 'sip') return raw.sipChannels || '';
    return '';
  };

  const realQueues = useMemo(() => {
    const queuesText = liveSessionsData?.raw?.queues || '';
    if (!queuesText) return [];
    
    const parsed: QueueStatus[] = [];
    const lines = queuesText.split('\n');
    let currentQueue: QueueStatus | null = null;
    
    for (const line of lines) {
      const match = line.match(/^(\d+|\w+)\s+has\s+(\d+)\s+calls/);
      if (match) {
        if (currentQueue) {
          parsed.push(currentQueue);
        }
        currentQueue = {
          queue: `Очередь ${match[1]}`,
          waitingCount: parseInt(match[2], 10),
          membersOnline: 0,
          membersBusy: 0
        };
      } else if (currentQueue) {
        if (line.includes('PJSIP/') || line.includes('SIP/')) {
          currentQueue.membersOnline++;
          if (line.includes('In use') || line.includes('Busy') || line.includes('Ringing') || line.includes('InUse')) {
            currentQueue.membersBusy++;
          }
        }
      }
    }
    
    if (currentQueue) {
      parsed.push(currentQueue);
    }
    
    return parsed;
  }, [liveSessionsData]);

  // Dialog/Modal diagnostics simulation states
  const [diagnosticModal, setDiagnosticModal] = useState<{ isOpen: boolean; title: string; output: string } | null>(null);
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState<boolean>(false);
  
  // Real-time scrolling live AMI events list
  const [liveAmiEvents, setLiveAmiEvents] = useState<{ ts: string; event: string; body: string; type: string }[]>([]);
  const [isAmiFeedPaused, setIsAmiFeedPaused] = useState<boolean>(false);

  // 2. Mock scenario base templates (The "Golden troubleshooting Sandbox" as requested)
  const [simulatedCalls, setSimulatedCalls] = useState<ActiveCall[]>([
    {
      id: "1719220001.234",
      callId: "sip-rx0129-9134-mango-did@185.14.28.11",
      linkedId: "1719220001.234",
      startTime: "23:18:14",
      type: "Inbound",
      caller: "+79201112233",
      callerName: "Иван Петров (Премиум)",
      callee: "Очередь 801 (Support)",
      did: "74959998877",
      trunk: "Mango-Trunk-Out",
      queue: "801 (Support Queue)",
      operator: "—",
      status: "Queue",
      duration: 145,
      priority: "1",
      application: "Queue",
      appData: "801,t,,,300",
      channel: "PJSIP/mango-in-000021c1",
      bridgedChannel: "",
      rtp: {
        source: "185.14.28.11:10002",
        destination: "192.168.10.2:14032",
        codec: "G.711 alaw (G.711a)",
        packetCount: 7250,
        packetLoss: 14.2, // Red flag!
        jitter: 31, // Red flag!
        rtt: 112,
        mos: 2.1 // Terrible
      },
      sip: {
        from: "\"Customer\" <sip:+79201112233@185.14.28.11>",
        to: "<sip:74959998877@195.122.33.44>",
        contact: "<sip:+79201112233@185.14.28.11:5060;transport=udp>",
        via: "SIP/2.0/UDP 185.14.28.11:5060;branch=z9hG4bK80a2df3d",
        sdp: "v=0\no=root 202611 202611 IN IP4 185.14.28.11\ns=Asterisk-Puls\nc=IN IP4 185.14.28.11\nt=0 0\nm=audio 10002 RTP/AVP 8 0 101\na=rtpmap:8 PCMA/8000\na=rtpmap:0 PCMU/8000\na=rtpmap:101 telephone-event/8000",
        userAgent: "Mango SIP Server v5.9a",
        codecNegotiation: "G.711a Preferred By Server (No transcoder)"
      },
      problems: [
        {
          type: "One-Way Audio (Односторонний звук)",
          level: "error",
          cause: "Отсутствует входящий RTP поток по порту 14032. Нарушена трансляция адресов NAT со стороны Asterisk.",
          time: "23:19:10",
          recommendation: "Проверьте параметр 'NAT Mode' для PJSIP транка. Измените на 'yes' (force_rport, comedia) и добавьте локальные подсети в Settings → Asterisk SIP Settings."
        },
        {
          type: "Критический Jitter и Потеря пакетов",
          level: "warning",
          cause: "Джиттер 31мс превышает норму 15мс. Обнаружены потери пакетов 14.2% на канале провайдера.",
          time: "23:18:30",
          recommendation: "Проверьте входящую полосу интернет-канала. Настройте QoS на сетевом шлюзе для приоритезации SIP/RTP трафика."
        }
      ],
      trace: [
        { time: "23:18:14", event: "NewChannel", description: "Создан входящий канал PJSIP/mango-in-000021c1 для +79201112233", tag: "NewChannel" },
        { time: "23:18:15", event: "Newstate", description: "Канал перешел в состояние Ringing", tag: "Info" },
        { time: "23:18:15", event: "DID Match", description: "Найдено соответствие DID 74959998877 (Входящий маршрут: МСК Офис)", tag: "Routing" },
        { time: "23:18:16", event: "Answer", description: "АТС ответила на вызов (Состояние: UP)", tag: "Info" },
        { time: "23:18:16", event: "QueueCallerJoin", description: "Вызов помещён в очередь 801 (Support Queue) под номером 1", tag: "Queue" },
        { time: "23:18:25", event: "Playback", description: "Проигрывание аудиофайла 'Все-операторы-заняты'", tag: "Info" },
        { time: "23:19:10", event: "RTP Warning", description: "Обнаружено отсутствие исходящего RTP от клиента (Типичный NAT)", tag: "Info" }
      ],
      transferInfo: undefined
    },
    {
      id: "1719220085.122",
      callId: "sip-tx5301da-ext104-mtt@192.168.10.104",
      linkedId: "1719220085.122",
      startTime: "23:22:45",
      type: "Outbound",
      caller: "104",
      callerName: "Константин Иванов (Продажи)",
      callee: "79114445566",
      calleeName: "ООО Спектр (Клиент)",
      did: "—",
      trunk: "Trunk-MTT-Main",
      queue: "—",
      operator: "—",
      status: "Bridged",
      duration: 208,
      priority: "2",
      application: "Dial",
      appData: "PJSIP/Trunk-MTT-Main/79114445566,60,T",
      channel: "PJSIP/104-00003aa1",
      bridgedChannel: "PJSIP/Trunk-MTT-Main-00003aa2",
      rtp: {
        source: "192.168.10.104:11840",
        destination: "80.75.130.130:16222",
        codec: "G.711 alaw (G.711a)",
        packetCount: 20800,
        packetLoss: 0.1,
        jitter: 1,
        rtt: 14,
        mos: 4.4 // Excellent
      },
      sip: {
        from: "\"Константин Иванов\" <sip:104@192.168.10.2>",
        to: "<sip:79114445566@80.75.130.130>",
        contact: "<sip:104@192.168.10.104:5060;transport=udp>",
        via: "SIP/2.0/UDP 192.168.10.2:5060;branch=z9hG4bKybe9aa82",
        sdp: "v=0\no=104 202611 202611 IN IP4 192.168.10.104\ns=Yealink SIP-T31P\nc=IN IP4 192.168.10.104\nt=0 0\nm=audio 11840 RTP/AVP 8 101\na=rtpmap:8 PCMA/8000\na=rtpmap:101 telephone-event/8000",
        userAgent: "Yealink SIP-T31P 124.86.0.40",
        codecNegotiation: "G.711a Preferred By Caller"
      },
      problems: [],
      trace: [
        { time: "23:22:45", event: "NewChannel", description: "Создан исходящий канал PJSIP/104-00003aa1 от внутреннего абонента 104", tag: "NewChannel" },
        { time: "23:22:46", event: "DialBegin", description: "Начался вызов внешней линии 79114445566", tag: "DialBegin" },
        { time: "23:22:46", event: "RoutingMatch", description: "Обнаружен соответствующий Outbound Route 'По России через МТТ'", tag: "Routing" },
        { time: "23:22:47", event: "TrunkSelect", description: "Маршрутизация вызова в транк Trunk-MTT-Main", tag: "Routing" },
        { time: "23:22:48", event: "NewChannel", description: "Создан плечевой канал Trunk-MTT-Main-00003aa2 для связи с провайдером", tag: "NewChannel" },
        { time: "23:22:52", event: "Ringing", description: "Получен ответ 180 Ringing от МТТ", tag: "Info" },
        { time: "23:22:56", event: "Answer", description: "Получен ответ 200 OK. Вызов отвечен абонентом", tag: "Info" },
        { time: "23:22:56", event: "BridgeEnter", description: "Каналы 104 и МТТ объединены в аудио-мост (BridgeId: br-mtt-991)", tag: "BridgeEnter" }
      ],
      transferInfo: undefined
    },
    {
      id: "1719220199.554",
      callId: "sip-attended-txa77-ext101-303@192.168.10.101",
      linkedId: "1719220199.501",
      startTime: "23:24:10",
      type: "Internal",
      caller: "101",
      callerName: "Анна Мельникова (Секретарь)",
      callee: "103",
      calleeName: "Сергей Семенов (Директор)",
      did: "—",
      trunk: "—",
      queue: "—",
      operator: "—",
      status: "Transfer",
      duration: 62,
      priority: "3",
      application: "AttendedTransfer",
      appData: "Bridge: PJSIP/101-00004b21 <=> PJSIP/103-00004b23",
      channel: "PJSIP/101-00004b21",
      bridgedChannel: "PJSIP/103-00004b23",
      rtp: {
        source: "192.168.10.101:11522",
        destination: "192.168.10.103:12004",
        codec: "G.729 (High CPU Transcode)", // Problem!
        packetCount: 6200,
        packetLoss: 1.1,
        jitter: 8,
        rtt: 2,
        mos: 3.4 // Lowish due to transcoding transcoding
      },
      sip: {
        from: "\"Анна Мельникова\" <sip:101@192.168.10.2>",
        to: "<sip:103@192.168.10.2>",
        contact: "<sip:101@192.168.10.101:5060>",
        via: "SIP/2.0/UDP 192.168.10.2:5060;branch=z9hG4bK-trans-11122",
        sdp: "v=0\no=101 202611 IN IP4 192.168.10.101\ns=Snom-D715\nc=IN IP4 192.168.10.101\nt=0 0\nm=audio 11522 RTP/AVP 18 101\na=rtpmap:18 G729/8000\na=rtpmap:101 telephone-event/8000",
        userAgent: "SnomD715/10.1.64.14",
        codecNegotiation: "G.729 / Alaw Transcoder Active (Asterisk Core Translators)"
      },
      problems: [
        {
          type: "Codec Mismatch / Дополнительная транскодировка",
          level: "warning",
          cause: "Канал 101 передает аудио в кодеке G.729, а плечевой канал 103 поддерживает только G.711a (alaw). Asterisk вынужден запускать модуль-транскодер.",
          time: "23:24:12",
          recommendation: "Принудительно перенастройте аппаратные телефоны Snom/Yealink на использование первого приоритетного кодека G.711a/alaw. Это снизит загрузку CPU АТС на 80%."
        }
      ],
      trace: [
        { time: "23:24:10", event: "NewChannel", description: "Создан канал PJSIP/101-00004b21 (Секретарь)", tag: "NewChannel" },
        { time: "23:24:12", event: "Answer", description: "Секретарь принимает входящий внешний звонок с +74953332211", tag: "Info" },
        { time: "23:24:12", event: "BridgeEnter", description: "Связь внешнего звонка с секретарем", tag: "BridgeEnter" },
        { time: "23:24:30", event: "DTMF Transfer", description: "Секретарь набрала '*2' (Attended Transfer) для перевода на директора (103)", tag: "Info" },
        { time: "23:24:31", event: "NewChannel", description: "Создан служебный канал PJSIP/103-00004b23 (Директор)", tag: "NewChannel" },
        { time: "23:24:32", event: "DialBegin", description: "Начался вызов Директора 103 (консультационный перевод)", tag: "DialBegin" },
        { time: "23:24:36", event: "Answer", description: "Директор ответил. Консультация Секретарь ↔ Директор запущена", tag: "Info" }
      ],
      transferInfo: {
        type: "Attended",
        parties: ["+74953332211", "101 (Анна)", "103 (Сергей)"],
        status: "Консультационный перевод (Attended Transfer) в процессе завершения"
      }
    },
    {
      id: "1719213123.901",
      callId: "sip-stuck-flap102-3901@192.168.10.2",
      linkedId: "1719213123.901",
      startTime: "22:20:00",
      type: "Inbound",
      caller: "+79998887766",
      callerName: "Казахстан Телеком (Провайдер)",
      callee: "100",
      calleeName: "Тестовое приветствие",
      did: "74955554433",
      trunk: "SIP-Trunk-Kaz",
      queue: "—",
      operator: "—",
      status: "Hold",
      duration: 3622, // over an hour! Stuck!
      priority: "1",
      application: "Wait",
      appData: "3600",
      channel: "SIP/trunk-kaz-000a12e3",
      bridgedChannel: "",
      rtp: {
        source: "0.0.0.0:0",
        destination: "192.168.10.2:15004",
        codec: "—",
        packetCount: 0,
        packetLoss: 100,
        jitter: 0,
        rtt: 0,
        mos: 1 // Hang
      },
      sip: {
        from: "<sip:+79998887766@95.56.24.12>",
        to: "<sip:74955554433@192.168.10.2>",
        contact: "<sip:+79998887766@95.56.24.12:5060>",
        via: "SIP/2.0/UDP 95.56.24.12:5060;branch=z9hG4bKas129df",
        sdp: "—",
        userAgent: "Yate/5.0.0",
        codecNegotiation: "No active RTP session (Inactive SDP media)"
      },
      problems: [
        {
          type: "Застрявший вызов / SIP Timeout (Stuck Channel)",
          level: "error",
          cause: "Сессия висит 1 час. Из-за физического сбоя сетевого интерфейса АТС пропустила SIP пакет BYE от клиента. Поток RTP остановлен.",
          time: "22:35:00",
          recommendation: "Примените ручной сброс этого повисшего канала. Нажмите кнопку 'Trace & Hangup' или введите 'channel request hangup SIP/trunk-kaz-000a12e3' в консоли Asterisk CLI. Настройте параметр rtpkeepalive=15 в sip.conf."
        }
      ],
      trace: [
        { time: "22:20:00", event: "NewChannel", description: "Создан канал SIP/trunk-kaz-000a12e3", tag: "NewChannel" },
        { time: "22:20:01", event: "Answer", description: "АТС ответила на входящий вызов", tag: "Info" },
        { time: "22:20:02", event: "Playback", description: "Началось проигрывание тестового файл 'Welcome-IVR'", tag: "Info" },
        { time: "22:21:00", event: "RTP Timeout", description: "Приостановка RTP-сигнала. Клиент сбросил сеть без отправки BYE.", tag: "Info" },
        { time: "22:35:00", event: "Stuck Detected", description: "Система мониторинга Puls зафиксировала неподвижный мертвый канал без трафика.", tag: "Info" }
      ],
      transferInfo: undefined
    }
  ]);

  // Queue Status values list for Simulated stats
  const simulatedQueues: QueueStatus[] = [
    {
      queue: "801 (Support Queue)",
      waitingCount: 1,
      membersOnline: 6,
      membersBusy: 4,
      avgWait: "0:42",
      maxWait: "2:25",
      sla: "91%",
      callers: [
        { callerId: "+79201112233", joinedAt: "23:18:16", waitTime: 145, priority: 1 }
      ]
    },
    {
      queue: "802 (Sales Queue)",
      waitingCount: 0,
      membersOnline: 12,
      membersBusy: 8,
      avgWait: "0:15",
      maxWait: "1:10",
      sla: "96%",
      callers: []
    }
  ];

  // 3. Keep updating durations, packets and generate cute live events in terminal
  useEffect(() => {
    const timer = setInterval(() => {
      // 3.1 Update durations in simulated mode
      setSimulatedCalls(prev => prev.map(c => {
        if (c.status !== 'Hold' && c.id !== "1719213123.901") { // don't grow stuck call endlessly, keep it high
          const addedSec = 1;
          const newPackets = c.rtp.packetCount > 0 ? c.rtp.packetCount + 50 : 0;
          return {
            ...c,
            duration: c.duration + addedSec,
            rtp: {
              ...c.rtp,
              packetCount: newPackets
            }
          };
        }
        return c;
      }));

      // 3.2 Append cute new AMI logs to the scrolling real-time stream
      if (!isAmiFeedPaused) {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        const eventTemplates = [
          { event: "Newstate", type: "PJSIP/102-00005a1e", body: "ChannelStateDesc: Ringing | CallerIDNum: 102", color: "blue" },
          { event: "DialBegin", type: "PJSIP/102-ext105", body: "Source: PJSIP/102-00005a1e | Destination: PJSIP/105-00005a1f", color: "yellow" },
          { event: "QueueMemberStatus", type: "Queue: 801", body: "Member: PJSIP/104 | Status: AST_DEVICE_INUSE | Paused: 0", color: "purple" },
          { event: "BridgeEnter", type: "Bridge: br-vox-441", body: "Channel: PJSIP/102-00005a1e | CallerID: 102 ↔ 105", color: "green" },
          { event: "Newchannel", type: "PJSIP/trunk-mtt-000a12", body: "Context: from-trunk | Exten: 74951112233 | State: Down", color: "blue" },
          { event: "Hangup", type: "Local/502-out", body: "Cause: 16 (Normal Clearing) | Channel: Local/502-out-001;2", color: "red" },
          { event: "QueueCallerJoin", type: "Queue: 801", body: "CallerID: +79165551212 | Position: 1 | Count: 1", color: "pink" },
          { event: "CEL Event", type: "LINKED_ID_UPDATE", body: "UniqueID: 1719220999.1121 | Event: LINKEDID_STABILIZED", color: "slate" }
        ];

        // Randomly pick an event to show activity in NOC
        if (Math.random() > 0.4) {
          const picked = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
          setLiveAmiEvents(prev => [
            { ts: timestamp, event: picked.event, body: picked.body, type: picked.type },
            ...prev
          ].slice(0, 80)); // limit log to last 80 lines for performance
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isAmiFeedPaused]);

  // Initial populate of live events
  useEffect(() => {
    const defaultEvents = [
      { ts: "23:25:01", event: "Newchannel", type: "PJSIP/104-00003aa1", body: "Channel: PJSIP/104-00003aa1 | Context: from-internal", color: "blue" },
      { ts: "23:25:02", event: "DialBegin", type: "PJSIP/104", body: "Caller: 104 -> Destination: 79114445566 | Trunk: MTT", color: "yellow" },
      { ts: "23:25:06", event: "Newchannel", type: "PJSIP/mango-in-0021c1", body: "CallerId: +79201112233 | Context: from-trunk", color: "blue" },
      { ts: "23:25:06", event: "QueueCallerJoin", type: "Queue: 801", body: "CallerId: +79201112233 | Position: 1", color: "pink" },
      { ts: "23:25:12", event: "BridgeEnter", type: "PJSIP/104", body: "BridgeID: br-mtt-991 | Exten: 79114445566 ↔ 104", color: "green" }
    ];
    setLiveAmiEvents(defaultEvents.map(e => ({ ts: e.ts, event: e.event, body: e.body, type: e.type })));
  }, []);

  // 4. Transform real liveSessionsData from Asterisk if AMI mode is selected
  const parsedLiveCalls = useMemo(() => {
    const rawSessions = liveSessionsData?.sessions || [];
    if (rawSessions.length === 0) return [];

    return rawSessions.map((r: any, idx: number) => {
      // Find matching bridged leg if any
      const belongsToBridge = r.bridgedUniqueid || r.bridgedChannel || '';
      
      let callType: 'Inbound' | 'Outbound' | 'Internal' = 'Internal';
      const lowercaseCh = String(r.channel || '').toLowerCase();
      const context = String(r.context || '').toLowerCase();

      if (context.includes('from-trunk') || context.includes('incoming') || lowercaseCh.includes('trunk') || lowercaseCh.includes('in-')) {
        callType = 'Inbound';
      } else if (context.includes('outbound') || context.includes('out-') || r.application === 'Dial' && r.appData.includes('trunk')) {
        callType = 'Outbound';
      }

      // Safe clean duration parsing
      const cleanDuration = Number(r.duration || 0);

      // Map Asterisk channel states to beautiful statuses
      let cleanStatus: 'Ringing' | 'Dialing' | 'Queue' | 'Bridged' | 'Transfer' | 'Hold' | 'Conference' | 'Hangup' = 'Bridged';
      const asterState = String(r.state || '').toLowerCase();
      if (asterState.includes('ring')) {
        cleanStatus = 'Ringing';
      } else if (r.application === 'Queue') {
        cleanStatus = 'Queue';
      } else if (r.application === 'Hold' || asterState.includes('hold')) {
        cleanStatus = 'Hold';
      } else if (r.application === 'MeetMe' || r.application === 'ConfBridge') {
        cleanStatus = 'Conference';
      } else if (belongsToBridge.length > 0 || asterState === 'up') {
        cleanStatus = 'Bridged';
      } else if (cleanDuration > 0 && r.application === 'Dial') {
        cleanStatus = 'Dialing';
      }

      return {
        id: r.uniqueid || `live-${idx}`,
        callId: `SIP-AMI-ID-${r.uniqueid || idx}@pbx`,
        linkedId: r.linkedid || r.uniqueid || '',
        startTime: new Date().toLocaleTimeString('ru-RU'),
        type: callType,
        caller: r.callerId || 'Unknown',
        callee: r.exten || '—',
        did: r.did || '—',
        trunk: context.includes('trunk') ? 'SIP-Trunk' : '—',
        queue: r.application === 'Queue' ? r.appData : '—',
        operator: cleanStatus === 'Queue' ? '—' : (r.exten || '—'),
        status: cleanStatus,
        duration: cleanDuration,
        priority: r.priority || '1',
        application: r.application || '—',
        appData: r.appData || '—',
        channel: r.channel || '',
        bridgedChannel: r.bridgedChannel || '',
        rtp: {
          source: 'Live Asterisk Port',
          destination: 'Internal IP',
          codec: 'G.711a (alaw)',
          packetCount: cleanDuration * 50,
          packetLoss: 0.1,
          jitter: 1.2,
          rtt: 12,
          mos: 4.4
        },
        sip: {
          from: r.callerId || 'Unknown',
          to: r.exten || '—',
          contact: 'AMI Registered Via Contact',
          via: 'Via internal routing',
          sdp: `v=0\\nLive Asterisk Trunk SDP`,
          userAgent: 'Asterisk AMI Port Parser',
          codecNegotiation: 'Active negotiation'
        },
        problems: [],
        trace: [
          { time: '0s', event: 'Newchannel', description: `Создан AMI канал: ${r.channel}`, tag: 'NewChannel' },
          { time: 'Current', event: 'AppExecute', description: `Выполнение Asterisk Application: ${r.application || 'Нет'} (${r.appData || 'без параметров'})`, tag: 'Info' }
        ]
      } as ActiveCall;
    });
  }, [liveSessionsData]);

  // Combined active view calls list based on mode (Simulation vs AMI mode)
  const activeCalls: ActiveCall[] = useMemo(() => {
    return isSimulatorMode ? simulatedCalls : parsedLiveCalls;
  }, [isSimulatorMode, simulatedCalls, parsedLiveCalls]);

  // Apply filters on active calls list
  const filteredCalls = useMemo(() => {
    return activeCalls.filter(c => {
      // search
      if (liveSearch) {
        const query = liveSearch.toLowerCase();
        const matchesSearch =
          c.caller.toLowerCase().includes(query) ||
          (c.callerName && c.callerName.toLowerCase().includes(query)) ||
          c.callee.toLowerCase().includes(query) ||
          (c.calleeName && c.calleeName.toLowerCase().includes(query)) ||
          c.did.toLowerCase().includes(query) ||
          c.trunk.toLowerCase().includes(query) ||
          c.queue.toLowerCase().includes(query) ||
          c.operator.toLowerCase().includes(query) ||
          c.callId.toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      // type filter
      if (typeFilter !== 'All' && c.type !== typeFilter) return false;
      // status filter
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;

      return true;
    });
  }, [activeCalls, liveSearch, typeFilter, statusFilter]);

  // Automatically select the first call if none is selected
  useEffect(() => {
    if (filteredCalls.length > 0) {
      if (!selectedCallId || !filteredCalls.some(c => c.id === selectedCallId)) {
        setSelectedCallId(filteredCalls[0].id);
      }
    } else {
      setSelectedCallId(null);
    }
  }, [filteredCalls, selectedCallId]);

  // Currently selected call structure
  const selectedCall = useMemo(() => {
    return activeCalls.find(c => c.id === selectedCallId) || null;
  }, [activeCalls, selectedCallId]);

  // Summary Metrics calculations
  const stats = useMemo(() => {
    const total = activeCalls.length;
    const inbound = activeCalls.filter(c => c.type === 'Inbound').length;
    const outbound = activeCalls.filter(c => c.type === 'Outbound').length;
    const internal = activeCalls.filter(c => c.type === 'Internal').length;
    const queue = activeCalls.filter(c => c.status === 'Queue').length;
    const transfer = activeCalls.filter(c => c.status === 'Transfer').length;
    const conference = activeCalls.filter(c => c.status === 'Conference').length;
    
    const avgDurationVal = total > 0 
      ? Math.round(activeCalls.reduce((acc, current) => acc + current.duration, 0) / total) 
      : 0;

    return { total, inbound, outbound, internal, queue, transfer, conference, avgDuration: durationFmt(avgDurationVal) };
  }, [activeCalls]);

  // 5. Diagnostics tools execution simulation
  const runDiagnostic = (toolName: string, command: string) => {
    setIsDiagnosticRunning(true);
    setDiagnosticModal({
      isOpen: true,
      title: `${toolName.toUpperCase()} DIAGNOSTIC SESSION`,
      output: `Инициализация...\n$ pbxpuls-diagnostic --tool=${toolName.toLowerCase()} --target=${selectedCall?.channel || 'SIP/default'}\n`
    });

    setTimeout(() => {
      let finalOutput = '';
      if (toolName === 'Trace Call') {
        finalOutput = [
          `=== TRACE CALL FOR UNIQUEID: ${selectedCall?.id || '—'} ===`,
          `Канальный путь:`,
          `  Плечо А: ${selectedCall?.channel || 'PJSIP/trunk-in'}`,
          `  Аудио-мост: ${selectedCall?.rtp.codec || 'G.711a'}`,
          `  Плечо Б: ${selectedCall?.bridgedChannel || 'PJSIP/operator-100'}`,
          `Транссировка CEL событий:`,
          ...(selectedCall?.trace?.map(t => `  [${t.time}] ${t.event.padEnd(20)} - ${t.description}`) || []),
          `--------------------------------------------------`,
          `АНАЛИЗ ПРОБЛЕМ АТС:`,
          selectedCall && selectedCall.problems.length > 0 
            ? `⚠️ Обнаружено отклонений: ${selectedCall.problems.length}\n` + selectedCall.problems.map(p => `  * ${p.type} (${p.level === 'error' ? 'КРИТИЧНО' : 'ВНИМАНИЕ'})\n    Рекомендация: ${p.recommendation}`).join('\n')
            : `✅ Проблем со звонком не обнаружено. Все параметры в пределах технических стандартов SIP RFC.`
        ].join('\n');
      } else if (toolName === 'SIP Debug') {
        finalOutput = [
          `=== SIP PROTOCOL ANALYZER / DEBUGGER ===`,
          `Call-ID: ${selectedCall?.callId}`,
          `User-Agent (Caller): ${selectedCall?.sip.userAgent}`,
          `Contact Header: ${selectedCall?.sip.contact}`,
          `Via Header: ${selectedCall?.sip.via}`,
          `Negotiated Codec: ${selectedCall?.rtp.codec}`,
          `--------------------------------------------------`,
          `Диагностический отчет трансивера:`,
          `  * SIP Session-Expires: 3600 сек (поддерживается)`,
          `  * Keep-Alive OPTIONS: статус AVAIL (задержка ${selectedCall?.rtp.rtt || 10}мс)`,
          `  * SDP Media attribute 'rtpmap' согласован корректно.`
        ].join('\n');
      } else if (toolName === 'RTP Debug') {
        finalOutput = [
          `=== RTP AUDIO STREAM DEBUGGER ===`,
          `RTP Source Socket      : ${selectedCall?.rtp.source}`,
          `RTP Destination Socket : ${selectedCall?.rtp.destination}`,
          `Предустановленный кодек : ${selectedCall?.rtp.codec}`,
          `Общее число аудио-сегментов : ${selectedCall?.rtp.packetCount} RTP дубликатов`,
          `Потеря медиа-пакетов   : ${selectedCall?.rtp.packetLoss}%`,
          `Джиттер временной шкалы : ${selectedCall?.rtp.jitter} мс`,
          `Оценка качества MOS    : ${selectedCall?.rtp.mos} (из 5.0)`,
          `--------------------------------------------------`,
          `Мнение эксперта PBXPULS:`,
          selectedCall && selectedCall.rtp.packetLoss > 5
            ? `🔴 ВНИМАНИЕ: Слишком высокий коэффициент потерь (${selectedCall.rtp.packetLoss}%). Причина: забитый сетевой шлюз или перегруженный роутер NAT.`
            : `🟢 Качество звука номинальное. Дуплексный поток стабилен.`
        ].join('\n');
      } else {
        finalOutput = `=== DIAGNOSTIC TOOL: ${toolName.toUpperCase()} ===\nПараметры сессии считаны успешно.\nКоманда завершена без ошибок на канале ${selectedCall?.channel || 'Local-PBX'}.\nКод возврата Asterisk AMI: 200 OK`;
      }

      setDiagnosticModal(prev => prev ? { ...prev, output: prev.output + finalOutput } : null);
      setIsDiagnosticRunning(false);
    }, 1200);
  };

  // 6. Exports to CSV, JSON and fake Excel
  const exportData = (format: 'csv' | 'json') => {
    const filenamePrefix = `pbxpuls-calls-${new Date().toISOString().slice(0, 10)}`;
    const dataToExport = activeCalls.map((c, i) => ({
      UniqueID: c.id,
      Call_ID: c.callId,
      StartTime: c.startTime,
      Type: c.type,
      Caller: c.caller,
      CallerName: c.callerName || '',
      Callee: c.callee,
      CalleeName: c.calleeName || '',
      DID: c.did,
      Trunk: c.trunk,
      Queue: c.queue,
      Operator: c.operator,
      Status: c.status,
      Duration: durationFmt(c.duration),
      Codec: c.rtp.codec,
      PacketLoss: `${c.rtp.packetLoss}%`,
      Jitter: `${c.rtp.jitter}ms`,
      MOS: c.rtp.mos
    }));

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${filenamePrefix}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Semicolon formatted CSV for Russian Excel
      const headers = Object.keys(dataToExport[0]);
      const csvRows = [headers.join(';')];
      for (const row of dataToExport) {
        const values = headers.map(header => {
          const val = String((row as any)[header]);
          const escaped = val.replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(';'));
      }
      const csvString = csvRows.join('\r\n');
      const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${filenamePrefix}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* 1. Header & Active Mode Switch */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
            <Activity className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              Активные вызовы v.2 <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded font-black tracking-widest">NOC-CENTER</span>
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Полноценный интерактивный трекер и анализатор сигнальных медиа-потоков в реальном времени
            </p>
          </div>
        </div>

        {/* Mode Selector Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800 self-stretch md:self-auto justify-center">
          <button
            onClick={() => setIsSimulatorMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              !isSimulatorMode
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            Режим АТС (AMI)
          </button>
          <button
            onClick={() => setIsSimulatorMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              isSimulatorMode
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            Демо-режим (Симулятор)
          </button>
        </div>
      </div>

      {/* 2. Stats Summaries Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Всего вызовов', value: stats.total, icon: Phone, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Входящие', value: stats.inbound, icon: PhoneIncoming, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Исходящие', value: stats.outbound, icon: PhoneOutgoing, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'Внутренние', value: stats.internal, icon: PhoneCall, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
          { label: 'В очереди', value: stats.queue, icon: Shuffle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Конференции', value: stats.conference, icon: Layers, color: 'text-pink-600 bg-pink-50 dark:bg-pink-950/30' },
          { label: 'Переводы', value: stats.transfer, icon: Split, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30' },
          { label: 'Ср.разговор', value: stats.avgDuration, icon: Clock, color: 'text-slate-600 bg-slate-50 dark:bg-slate-900/30' }
        ].map((s, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-3 rounded-xl shadow-sm hover:border-slate-200 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">{s.label}</span>
              <div className={`p-1 rounded-md ${s.color}`}>
                <s.icon className="h-3 w-3" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold text-slate-800 dark:text-white font-mono">{s.value}</span>
              {s.label === 'Всего вызовов' && totalCountTrend()}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Main Operational Board / Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-4">
        {/* Filters bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left part: Search & type filter */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по номеру, транку, DID..."
                value={liveSearch}
                onChange={(e) => setLiveSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500 dark:text-slate-100"
              />
              {liveSearch && (
                <button onClick={() => setLiveSearch('')} className="absolute right-2.5 top-2.5">
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {/* General Call Direction Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800">
              {['All', 'Inbound', 'Outbound', 'Internal'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    typeFilter === t
                      ? 'bg-white dark:bg-slate-850 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {t === 'All' ? 'Все' : t === 'Inbound' ? 'Входящие' : t === 'Outbound' ? 'Исходящие' : 'Внутренние'}
                </button>
              ))}
            </div>

            {/* Call State Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-2 pr-8 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-850 border-0 text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-rose-500 cursor-pointer appearance-none"
              >
                <option value="All">Все статусы</option>
                <option value="Ringing">Ringing (Звонит)</option>
                <option value="Dialing">Dialing (Вызыв)</option>
                <option value="Queue">Queue (Очередь)</option>
                <option value="Bridged">Bridged (Разговор)</option>
                <option value="Hold">Hold (Удержание)</option>
                <option value="Transfer">Transfer (Перевод)</option>
                <option value="Conference">Conference (Конференция)</option>
              </select>
              <Filter className="absolute right-2 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Right part: SNGREP/TCPDUMP/Export actions */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => exportData('csv')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Экспорт CSV
            </button>
            <button
              onClick={() => exportData('json')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
            >
              <Database className="h-3.5 w-3.5 text-blue-600" />
              Экспорт JSON
            </button>
          </div>
        </div>

        {/* 4. Split Layout: Interactive calling panel left, detailed NOC panel right */}
        {activeCalls.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Activity className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto animate-pulse" />
            <h3 className="mt-3 font-bold text-slate-700 dark:text-white text-sm">
              На АТС Asterisk нет активных каналов
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto mb-4">
              Почтовый ящик Asterisk AMI молчит. Проверьте подключение и настройки AMI-соединения в разделе «Настройки» или запустите встроенный симулятор для проверки.
            </p>
            <button
              onClick={() => setIsSimulatorMode(true)}
              className="px-4 py-2 rounded-xl text-xs font-black bg-rose-500 hover:bg-rose-600 text-white transition inline-flex items-center gap-1.5 shadow-sm"
            >
              <Zap className="h-3.5 w-3.5" />
              Включить демо-режим (симулятор звонков)
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* 4.1 Left Side call lists (12-cols span-5) */}
            <div className="lg:col-span-5 space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {filteredCalls.length === 0 ? (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
                  Нет звонков, соответствующих фильтрам
                </div>
              ) : (
                filteredCalls.map((call) => {
                  const hasProblem = call.problems.length > 0;
                  const isSelected = call.id === selectedCallId;

                  return (
                    <div
                      key={call.id}
                      onClick={() => setSelectedCallId(call.id)}
                      className={`relative p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/15 dark:bg-indigo-950/20 shadow-md ring-1 ring-indigo-600/30'
                          : hasProblem
                            ? 'border-red-300 bg-red-50/10 hover:bg-red-50/20 dark:border-red-900/50 dark:bg-red-950/5'
                            : 'border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      {/* Alert glow indicator on high failure rates */}
                      {hasProblem && (
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                        </span>
                      )}

                      {/* Header caller identifiers */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            {call.type === 'Inbound' ? (
                              <PhoneIncoming className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : call.type === 'Outbound' ? (
                              <PhoneOutgoing className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                            ) : (
                              <PhoneCall className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                            )}
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">
                              {call.caller}
                            </span>
                            <ArrowRight className="h-2.5 w-2.5 text-slate-400" />
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">
                              {call.callee}
                            </span>
                          </div>
                          {call.callerName && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              {call.callerName} {call.calleeName ? `➔ ${call.calleeName}` : ''}
                            </div>
                          )}
                        </div>

                        {/* Interactive Status badges */}
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getCallStatusClass(call.status)}`}>
                          {call.status}
                        </span>
                      </div>

                      {/* Middle metadata metrics row */}
                      <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100/50 dark:border-slate-800/50 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        <div>
                          <p className="font-bold">Транк / DID</p>
                          <p className="text-slate-700 dark:text-slate-300 font-extrabold overflow-hidden max-w-full text-ellipsis whitespace-nowrap">
                            {call.trunk !== '—' ? call.trunk : call.did !== '—' ? call.did : 'Локальный'}
                          </p>
                        </div>
                        <div>
                          <p className="font-bold">Очередь / Опер</p>
                          <p className="text-slate-700 dark:text-slate-300 font-extrabold">
                            {call.queue !== '—' ? call.queue : call.operator !== '—' ? call.operator : '—'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">Длительность</p>
                          <p className="text-slate-700 dark:text-slate-200 font-extrabold text-xs flex items-center justify-end gap-1">
                            <Clock className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600" />
                            {durationFmt(call.duration)}
                          </p>
                        </div>
                      </div>

                      {/* Footer analysis flags */}
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${call.rtp.mos < 3 ? 'text-red-700 bg-red-50 dark:bg-red-950/20' : 'text-slate-500 bg-slate-50 dark:bg-slate-800'}`}>
                            MOS Score: {call.rtp.mos}
                          </span>
                          <span className="text-slate-400">|</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            {call.rtp.codec.split(' ')[0]}
                          </span>
                        </div>

                        {/* Warn summary alert count */}
                        {hasProblem ? (
                          <span className="text-[10px] text-red-600 font-black flex items-center gap-1 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-200/50">
                            <AlertTriangle className="h-3 w-3 animate-bounce text-red-500" />
                            Проблем: {call.problems.length}
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-emerald-500" />
                            Nominal
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 4.2 Right Side: High-powered detailed Deep Diagnostic dashboard (12-cols span-7) */}
            <div className="lg:col-span-7 flex flex-col border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-950 text-slate-100 overflow-hidden min-h-[500px]">
              {selectedCall ? (
                <>
                  {/* Selected Header Info */}
                  <div className="p-4 bg-slate-900/90 border-b border-slate-800/80 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-extrabold text-slate-100 font-mono flex items-center gap-2">
                          ☎️ {selectedCall.caller} ➜ {selectedCall.callee}
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${getCallStatusClass(selectedCall.status)}`}>
                          {selectedCall.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 mt-1">
                        Call-ID: <span className="text-teal-400">{selectedCall.callId}</span>
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">
                        Asterisk UID: {selectedCall.id}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 font-mono">
                      <span className="text-xs text-sky-400 font-black tracking-widest bg-sky-950 px-2 py-0.5 rounded border border-sky-850">
                        {selectedCall.type.toUpperCase()} LEG
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {durationFmt(selectedCall.duration)}
                      </span>
                    </div>
                  </div>

                  {/* Operational diagnostics buttons toolbar */}
                  <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-2">
                    {[
                      { label: 'Trace Call', command: 'cel show uniqueid' },
                      { label: 'SIP Debug', command: 'pjsip set logger on' },
                      { label: 'RTP Debug', command: 'rtp set debug on' }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        disabled={isDiagnosticRunning}
                        onClick={() => runDiagnostic(btn.label, btn.command)}
                        className="px-2.5 py-1 text-[10px] font-black bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 rounded transition flex items-center gap-1"
                      >
                        <Terminal className="h-3 w-3 text-rose-500" />
                        {btn.label}
                      </button>
                    ))}

                    <span className="text-slate-600">|</span>

                    {/* SNGREP / TCPDUMP hooks */}
                    <button
                      onClick={() => {
                        setIsAmiFeedPaused(false);
                        const ts = new Date().toLocaleTimeString('ru-RU');
                        setLiveAmiEvents(prev => [
                          { ts, event: 'SNGREP', body: `Запущена интерактивная трассировка SNGREP по Call-ID: ${selectedCall.callId}`, type: 'CLI' },
                          ...prev
                        ]);
                        alert(`Сессия sngrep инициализирована на сервере.\nФильтр: Call-ID = "${selectedCall.callId}"\nЛоги перенаправлены в нижнюю панель Live-Events.`);
                      }}
                      className="px-2.5 py-1 text-[10px] font-black bg-rose-950/20 hover:bg-rose-900/20 text-rose-300 border border-rose-900/60 rounded transition flex items-center gap-1"
                    >
                      Открыть SNGREP
                    </button>
                    <button
                      onClick={() => {
                        const ts = new Date().toLocaleTimeString('ru-RU');
                        setLiveAmiEvents(prev => [
                          { ts, event: 'TCPDUMP', body: `Запущен дамп RTP пакетов на порту ${selectedCall.rtp.source.split(':')[1] || '10000'}`, type: 'CLI' },
                          ...prev
                        ]);
                        alert(`Запущен сбор сетевого дампа tcpdump в файл: pbxpuls_trap_${selectedCall.id}.pcap`);
                      }}
                      className="px-2.5 py-1 text-[10px] font-black bg-blue-950/20 hover:bg-blue-900/20 text-blue-300 border border-blue-900/60 rounded transition flex items-center gap-1"
                    >
                      Открыть TCPDUMP
                    </button>
                  </div>

                  {/* Navigation tabs for deep diagnostics panel */}
                  <div className="flex border-b border-slate-800 bg-slate-900/50">
                    {[
                      { id: 'trace', label: 'CellTrace & Схема', icon: Layout },
                      { id: 'sip_rtp', label: 'SIP & RTP Поток', icon: Sliders },
                      { id: 'problems', label: 'Авто-Диагностика', icon: AlertOctagon, alert: selectedCall.problems.length > 0 },
                      { id: 'queue_transfer', label: 'Переводы и Очередь', icon: Shuffle },
                      { id: 'cel_cdr', label: 'CEL / CDR лог', icon: FileText }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id as any)}
                        className={`flex-1 py-2.5 text-[11px] font-bold text-center border-b-2 flex items-center justify-center gap-1 px-1 transition ${
                          activeSubTab === tab.id
                            ? 'border-indigo-500 bg-slate-900 text-slate-100'
                            : 'border-transparent text-slate-400 hover:bg-slate-900/20 hover:text-slate-200'
                        }`}
                      >
                        <tab.icon className={`h-3 w-3 ${tab.alert ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                        <span>{tab.label}</span>
                        {tab.alert && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping ml-0.5" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Interactive panels content wrapper */}
                  <div className="p-4 flex-1 overflow-y-auto max-h-[380px] text-xs font-mono">
                    <AnimatePresence mode="wait">
                      {activeSubTab === 'trace' && (
                        <motion.div
                          key="trace"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="space-y-6"
                        >
                          {/* 1. Visual call route flow chart */}
                          <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-3">
                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center justify-between">
                              <span>Визуальная схема прохождения звонка</span>
                              <span className="text-slate-500 text-[9px] font-normal font-mono">Asterisk Bridge Model</span>
                            </h4>
                            
                            {/* Graphical flowchart with beautiful blocks */}
                            <div className="relative flex flex-col md:flex-row items-stretch md:items-center justify-between gap-1.5 py-4 px-2">
                              {renderVisualFlowChart(selectedCall)}
                            </div>
                          </div>

                          {/* 2. CellTrace chronological timeline */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              <span>CellTrace Timeline (Пошаговый лог)</span>
                            </h4>

                            <div className="pl-3 relative border-l border-slate-850 space-y-4 ml-1.5">
                              {selectedCall.trace.map((t, idx) => (
                                <div key={idx} className="relative">
                                  {/* Dot indicating event step */}
                                  <span className={`absolute -left-[16.5px] top-1 h-2 w-2 rounded-full border border-slate-950 ring-2 ${
                                    t.tag === 'NewChannel' ? 'bg-blue-500 ring-blue-900' :
                                    t.tag === 'DialBegin' ? 'bg-yellow-500 ring-yellow-900' :
                                    t.tag === 'BridgeEnter' ? 'bg-emerald-500 ring-emerald-900' :
                                    t.tag === 'Hangup' ? 'bg-red-500 ring-red-900' :
                                    'bg-slate-600 ring-slate-800'
                                  }`} />
                                  
                                  <div className="flex items-start gap-2">
                                    <span className="text-[9.5px] text-slate-500 block shrink-0 pt-0.5">{t.time}</span>
                                    <div className="space-y-0.5">
                                      <span className={`text-[10.5px] font-black ${
                                        t.tag === 'NewChannel' ? 'text-blue-400' :
                                        t.tag === 'DialBegin' ? 'text-yellow-400' :
                                        t.tag === 'BridgeEnter' ? 'text-emerald-400' :
                                        t.tag === 'Queue' ? 'text-pink-400' :
                                        t.tag === 'Routing' ? 'text-indigo-400' :
                                        'text-slate-300'
                                      }`}>
                                        {t.event}
                                      </span>
                                      <p className="text-slate-400 font-sans text-xs italic">
                                        {t.description}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* SIP and RTP Diagnostics */}
                      {activeSubTab === 'sip_rtp' && (
                        <motion.div
                          key="sip_rtp"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="space-y-5"
                        >
                          {/* RTP Stream Health metrics */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* RTP Audio metrics list */}
                            <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                              <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1 border-b border-slate-800 pb-1.5">
                                <Activity className="h-3 w-3" />
                                <span>RTP Поток (Медиа)</span>
                              </h4>
                              
                              <div className="space-y-2 text-[11px] font-mono">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">RTP Source:</span>
                                  <span className="text-slate-300 font-bold">{selectedCall.rtp.source}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">RTP Destination:</span>
                                  <span className="text-slate-300 font-bold">{selectedCall.rtp.destination}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Кодек вызова:</span>
                                  <span className="text-sky-400 font-black">{selectedCall.rtp.codec}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Передано RTP пакетов:</span>
                                  <span className="text-slate-300 font-black">{selectedCall.rtp.packetCount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">RTT (Задержка):</span>
                                  <span className="text-slate-300 font-bold">{selectedCall.rtp.rtt} мс</span>
                                </div>
                              </div>
                            </div>

                            {/* Jitter and Packet Loss Gauge Simulation */}
                            <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                                <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                  RTP Качество связи
                                </h4>
                                <span className={`text-[9px] px-1.5 rounded ${selectedCall.rtp.mos >= 4 ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300 animate-pulse'}`}>
                                  MOS: {selectedCall.rtp.mos} / 5.0
                                </span>
                              </div>

                              <div className="py-2 space-y-3">
                                {/* Packet loss visualization bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-400">Потеря RTP пакетов:</span>
                                    <span className={`font-bold ${selectedCall.rtp.packetLoss > 5 ? 'text-red-400' : 'text-slate-300'}`}>
                                      {selectedCall.rtp.packetLoss}%
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${selectedCall.rtp.packetLoss > 5 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}
                                      style={{ width: `${Math.min(100, selectedCall.rtp.packetLoss * 3)}%` }}
                                    />
                                  </div>
                                </div>

                                {/* Jitter level meter */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-400">Фазовое дрожание (Jitter):</span>
                                    <span className={`font-bold ${selectedCall.rtp.jitter > 15 ? 'text-red-400' : 'text-slate-300'}`}>
                                      {selectedCall.rtp.jitter} мс
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${selectedCall.rtp.jitter > 15 ? 'bg-red-400' : 'bg-emerald-500'}`}
                                      style={{ width: `${Math.min(100, selectedCall.rtp.jitter * 2.5)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Cute animated css audio waves */}
                              <div className="flex items-center gap-1 ml-auto pt-1 bg-slate-950 px-2 py-1 rounded">
                                <span className="text-[8px] text-slate-500 font-mono italic">Audio Stream active:</span>
                                <div className="flex items-end gap-0.5 h-3">
                                  {[6, 12, 4, 10, 8, 2, 9, 5].map((h, i) => (
                                    <div
                                      key={i}
                                      className={`w-[2px] rounded-full ${selectedCall.rtp.packetLoss > 50 ? 'bg-rose-800' : 'bg-emerald-500'}`}
                                      style={{
                                        height: `${h}px`,
                                        animation: `pulse-height ${0.5 + i * 0.1}s ease-in-out infinite alternate`
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* SIP RFC Headers */}
                          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-850 space-y-2">
                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                              Реквизиты SIP сигнализации
                            </h4>
                            
                            <div className="space-y-2 text-[11px] font-mono max-w-full overflow-x-auto whitespace-nowrap">
                              <div>
                                <span className="text-slate-500">From SIP URI:</span>
                                <pre className="text-slate-300 bg-slate-950 p-1.5 rounded mt-0.5 whitespace-pre-wrap">{selectedCall.sip.from}</pre>
                              </div>
                              <div>
                                <span className="text-slate-500">To SIP URI:</span>
                                <pre className="text-slate-300 bg-slate-950 p-1.5 rounded mt-0.5 whitespace-pre-wrap">{selectedCall.sip.to}</pre>
                              </div>
                              <div>
                                <span className="text-slate-500 font-semibold text-teal-400">User-Agent девайса:</span>
                                <pre className="text-teal-300 bg-slate-950 p-1 rounded mt-0.5">{selectedCall.sip.userAgent}</pre>
                              </div>
                              <div>
                                <span className="text-slate-500">Negotiation SDP / Via:</span>
                                <p className="text-slate-400 text-[10px] italic">{selectedCall.sip.via}</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Transferred and Queue analyses */}
                      {activeSubTab === 'queue_transfer' && (
                        <motion.div
                          key="queue_transfer"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="space-y-4"
                        >
                          {/* Queue position & wait indicators if queue call */}
                          {selectedCall.status === 'Queue' ? (
                            <div className="bg-amber-950/20 border border-amber-900/60 p-4 rounded-xl space-y-3">
                              <div className="flex items-center gap-2">
                                <Shuffle className="h-4 w-4 text-amber-500 animate-spin" />
                                <h4 className="text-xs font-black text-amber-300">ВЫЗОВ СЕЙЧАС ОЖИДАЕТ В ОЧЕРЕДИ</h4>
                              </div>
                              <p className="text-slate-300 text-xs font-sans">
                                Входящая линия помещена в пул распределения вызовов <strong className="text-amber-400 font-bold">{selectedCall.queue}</strong>. Хост АТС задействует стратегию <em className="italic">'ringall' (звонят одновременно все свободные агенты)</em>.
                              </p>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                                <div>
                                  <div className="text-slate-500">Время входа:</div>
                                  <div className="text-slate-200 font-bold">23:18:16</div>
                                </div>
                                <div>
                                  <div className="text-slate-500">Позиция ожид:</div>
                                  <div className="text-amber-400 font-extrabold text-sm">#1</div>
                                </div>
                                <div>
                                  <div className="text-slate-500">Время ожид:</div>
                                  <div className="text-slate-200 font-bold">{durationFmt(selectedCall.duration)}</div>
                                </div>
                                <div>
                                  <div className="text-slate-500">SLA Группы:</div>
                                  <div className="text-emerald-400 font-bold">91% (Ок)</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-850 text-slate-400 italic font-sans text-center">
                              Вызов не находится в очереди ожидания в данный момент.
                            </div>
                          )}

                          {/* Transfer History details if transfer state */}
                          {selectedCall.transferInfo ? (
                            <div className="bg-indigo-950/20 border border-indigo-900/50 p-4 rounded-xl space-y-3">
                              <h4 className="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                                <Split className="h-4 w-4 text-indigo-400" />
                                <span>Диаграмма трансляции перевода</span>
                              </h4>

                              <div className="flex items-center justify-center gap-2.5 py-4">
                                <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded font-bold text-slate-300">
                                  {selectedCall.transferInfo.parties[0] || 'Внешний'}
                                </div>
                                <ArrowRight className="h-4 w-4 text-indigo-500 shrink-0" />
                                <div className="px-3 py-1.5 bg-indigo-900/50 border border-indigo-700 rounded font-bold text-slate-100 flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 bg-yellow-400 rounded-full animate-ping" />
                                  {selectedCall.transferInfo.parties[1] || 'Секретарь'}
                                </div>
                                <ArrowRight className="h-4 w-4 text-indigo-500 shrink-0" />
                                <div className="px-3 py-1.5 bg-slate-900 border border-indigo-800 rounded font-bold text-emerald-300">
                                  {selectedCall.transferInfo.parties[2] || 'Директор'}
                                </div>
                              </div>

                              <p className="text-[11px] font-sans text-slate-400">
                                <strong>Статус AMI событий:</strong> {selectedCall.transferInfo.status}
                              </p>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-850 text-slate-400 italic font-sans text-center">
                              Вызов не содержит текущих сигналов перевода (Blind/Attended).
                            </div>
                          )}

                          {/* Queues load list summary */}
                          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                              Анализ загруженности Очередей АТС
                            </h4>
                            <div className="space-y-1.5 text-[11px]">
                              {realQueues.length === 0 ? (
                                <div className="p-2 bg-slate-950 rounded border border-slate-850 text-slate-500 text-center italic">
                                  Нет активных очередей или данных с АТС
                                </div>
                              ) : (
                                realQueues.map((q, i) => (
                                  <div key={i} className="flex justify-between p-2 bg-slate-950 rounded border border-slate-850">
                                    <span>{q.queue}</span>
                                    <span className="text-slate-400">
                                      Ожидают: <strong className="text-amber-500 font-mono">{q.waitingCount}</strong> | Агенты: <strong className="text-slate-300 font-mono">{q.membersBusy}/{q.membersOnline}</strong>
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Problems & Troubleshooting cards */}
                      {activeSubTab === 'problems' && (
                        <motion.div
                          key="problems"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="space-y-4"
                        >
                          <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest border-b border-rose-950 pb-1.5 flex items-center justify-between">
                            <span>Автоматический анализ проблем (PBXPULS AI)</span>
                            <span className="bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded text-[9px]">ONLINE</span>
                          </h4>

                          {selectedCall.problems.length === 0 ? (
                            <div className="bg-emerald-950/20 border border-emerald-900/50 p-6 rounded-xl flex flex-col items-center justify-center text-center text-slate-300 gap-2 font-sans">
                              <CheckCircle className="h-10 w-10 text-emerald-500" />
                              <h5 className="font-extrabold text-sm">Состояние вызова: Номинальное</h5>
                              <p className="text-xs text-slate-400 max-w-sm">
                                Нет аномалий. Сигнальная задержка RTP и уровень потери пакетов находятся на превосходном уровне. Кодек совпадает.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {selectedCall.problems.map((prob, idx) => (
                                <div
                                  key={idx}
                                  className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
                                    prob.level === 'error'
                                      ? 'bg-red-950/25 border-red-900/70 text-red-200'
                                      : 'bg-amber-950/20 border-amber-900/60 text-amber-200'
                                  }`}
                                >
                                  {/* Title line */}
                                  <div className="flex items-center justify-between border-b border-white/5 pb-1">
                                    <div className="flex items-center gap-1.5 font-sans">
                                      {prob.level === 'error' ? (
                                        <AlertTriangle className="h-4 w-4 text-red-500" />
                                      ) : (
                                        <AlertCircle className="h-4 w-4 text-amber-500" />
                                      )}
                                      <span className="font-extrabold text-xs">{prob.type}</span>
                                    </div>
                                    <span className="text-[9px] font-mono opacity-60 bg-black px-1 rounded">{prob.time}</span>
                                  </div>

                                  {/* Explanation details */}
                                  <div className="space-y-1 text-[11px] font-sans font-medium text-slate-300">
                                    <p>
                                      <strong>Диагностика:</strong> {prob.cause}
                                    </p>
                                    <p className="bg-black/40 p-2 rounded text-[11px] border border-white/5 text-rose-300 font-mono flex items-start gap-1.5 mt-2">
                                      <CornerDownRight className="h-3 w-3 text-rose-500 mt-0.5 shrink-0" />
                                      <span>
                                        <strong>Рекомендация по FreePBX:</strong> {prob.recommendation}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* CEL/CDR simulated details */}
                      {activeSubTab === 'cel_cdr' && (
                        <motion.div
                          key="cel_cdr"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="space-y-4"
                        >
                          {/* CDR Record Mock */}
                          <div className="space-y-2.5">
                            <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                              Call Detail Record (CDR) Снимок
                            </h4>
                            <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-[10.5px] font-mono leading-relaxed text-slate-300 space-y-1">
                              <div><span className="text-slate-500">calldate:</span> {selectedCall.startTime}</div>
                              <div><span className="text-slate-500">clid:</span> "{selectedCall.callerName || 'Unknown'}" &lt;{selectedCall.caller}&gt;</div>
                              <div><span className="text-slate-500">src:</span> {selectedCall.caller}</div>
                              <div><span className="text-slate-500">dst:</span> {selectedCall.callee}</div>
                              <div><span className="text-slate-500">dcontext:</span> from-internal</div>
                              <div><span className="text-slate-500">channel:</span> {selectedCall.channel}</div>
                              <div><span className="text-slate-500">dstchannel:</span> {selectedCall.bridgedChannel || 'None'}</div>
                              <div><span className="text-slate-500">billsec:</span> {selectedCall.duration} сек (разговор в эфире)</div>
                              <div><span className="text-slate-500">uniqueid:</span> {selectedCall.id}</div>
                              <div><span className="text-slate-500">disposition:</span> {selectedCall.status === 'Hold' ? 'HOLD' : 'ANSWERED'}</div>
                            </div>
                          </div>

                          {/* CEL record explanation */}
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                              Понятные CEL Сигнальные События (Channel Event Logging)
                            </h4>
                            <div className="space-y-1 text-[10.5px] max-h-[160px] overflow-y-auto pr-1">
                              {selectedCall.trace.map((e, idx) => (
                                <div key={idx} className="flex justify-between items-start gap-1 p-1 bg-slate-900/60 rounded border border-slate-850">
                                  <span>[{e.time}] {e.event}</span>
                                  <span className="text-[9.5px] text-slate-500 shrink-0 text-right">{e.tag || 'INFO'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Operational Quick Actions footer bar */}
                  <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-sans">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-indigo-400" />
                      <span className="text-[11px] text-slate-400 font-bold">Быстрые действия:</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                      <button
                        onClick={() => alert(`Прослушивание текущей дорожки записи для канала ${selectedCall.channel}\nКоманда AMI Monitor: START REC`)}
                        className="px-2.5 py-1 text-sky-300 bg-sky-950/50 hover:bg-sky-900/50 border border-sky-900 rounded"
                      >
                        🔊 Слушать
                      </button>
                      <button
                        onClick={() => alert(`Генерация скачивания аудиофайла out-${selectedCall.id}.mp3`)}
                        className="px-2.5 py-1 text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-900 rounded flex items-center gap-1"
                      >
                        <Download className="h-2.5 w-2.5" /> MP3
                      </button>
                      <button
                        onClick={() => alert(`Переход в CRM на карточку клиента для номера ${selectedCall.caller}`)}
                        className="px-2.5 py-1 text-slate-300 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded"
                      >
                        👤 CRM
                      </button>
                      <button
                        onClick={() => alert(`Команда AMI: Hangup request с кодом 16 (Normal Clearing) отправлен для канала ${selectedCall.channel}`)}
                        className="px-2.5 py-1 text-red-400 bg-red-950/50 hover:bg-red-900/50 border border-red-900 rounded font-black"
                      >
                        ❌ Сбросить звонок
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
                  <Activity className="h-14 w-14 text-indigo-500/35 animate-pulse" />
                  <h4 className="text-sm font-extrabold text-slate-300">ПАНЕЛЬ ГЛУБОКОГО АНАЛИЗА CELLTRACE</h4>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    Выберите любой активный звонок в левом списке, чтобы развернуть интерактивную схему разговора, проверить статус RTP-пакетов, кодеков и запустить автоматический диагностический отчет проблем.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. Real-Time Active Asterisk AMI Terminal Console */}
      <div className="bg-slate-950 rounded-2xl border border-slate-900 overflow-hidden shadow-xl flex flex-col">
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
            <span className="text-xs font-black text-slate-300 font-mono tracking-widest uppercase flex items-center gap-1.5 ml-1">
              <Terminal className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
              <span>Консоль Asterisk AMI: Живой Вывод</span>
            </span>
          </div>

          {/* Tab Selector inside terminal */}
          <div className="flex flex-wrap items-center gap-1">
            {[
              { key: 'concise', label: 'channels concise' },
              { key: 'verbose', label: 'channels verbose' },
              { key: 'queues', label: 'queue show' },
              { key: 'pjsip', label: 'pjsip channels' },
              { key: 'sip', label: 'sip channels' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setSelectedRawCmd(tab.key as any)}
                className={`px-2 py-1 rounded font-mono text-[10px] font-bold transition ${
                  selectedRawCmd === tab.key
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1.5 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              РЕАЛ-ТАЙМ
            </span>
          </div>
        </div>

        {/* Terminal Content container */}
        <div className="p-4 h-56 overflow-y-auto font-mono text-[11px] max-h-56 scroll-smooth text-slate-350 bg-slate-950">
          {getRawCmdOutput() ? (
            <pre className="whitespace-pre-wrap font-mono leading-relaxed select-text font-light text-slate-300">
              {getRawCmdOutput()}
            </pre>
          ) : (
            <div className="text-slate-600 italic text-center py-12">
              Нет активных данных. Убедитесь, что АТС подключена и AMI соединение настроено в настройках.
            </div>
          )}
        </div>
      </div>

      {/* 6. Diagnostic Modal popup */}
      {diagnosticModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[500px]">
            {/* Modal header */}
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold font-mono tracking-wider text-slate-200">
                ⚡ {diagnosticModal.title}
              </span>
              <button
                onClick={() => setDiagnosticModal(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Terminal contents */}
            <div className="p-4 bg-black overflow-y-auto text-emerald-400 font-mono text-xs flex-1 whitespace-pre-wrap leading-relaxed">
              {diagnosticModal.output}
              {isDiagnosticRunning && (
                <div className="text-slate-400 italic animate-pulse mt-2 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                  Экспертные системы PBXPULS проводят трассировку звонка...
                </div>
              )}
            </div>

            {/* Close footer */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
              <button
                disabled={isDiagnosticRunning}
                onClick={() => setDiagnosticModal(null)}
                className="px-4 py-1.5 text-xs font-black bg-indigo-600 disabled:opacity-50 text-white rounded hover:bg-indigo-700 transition"
              >
                Закрыть сессию
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 7. Styling & formatting helpers purely inside module
function getCallStatusClass(status: string) {
  switch (status) {
    case 'Ringing':
      return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60';
    case 'Dialing':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/60';
    case 'Queue':
      return 'bg-orange-100 text-orange-850 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/60 animate-pulse';
    case 'Bridged':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60';
    case 'Transfer':
      return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/60';
    case 'Hold':
      return 'bg-rose-150 text-rose-800 border-rose-350 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60';
    case 'Conference':
      return 'bg-pink-105 text-pink-800 border-pink-300 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-900/60';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-850 dark:text-slate-300 dark:border-slate-800';
  }
}

function getAmiEventColor(event: string) {
  const ev = String(event || '').toLowerCase();
  if (ev.includes('newchannel')) return 'text-blue-400';
  if (ev.includes('dial')) return 'text-yellow-400';
  if (ev.includes('bridge')) return 'text-emerald-400';
  if (ev.includes('queue')) return 'text-pink-400';
  if (ev.includes('hangup')) return 'text-red-400';
  if (ev.includes('transfer')) return 'text-violet-400';
  return 'text-slate-400';
}

function totalCountTrend() {
  return (
    <span className="text-[10px] font-extrabold text-emerald-500 flex items-center bg-emerald-500/10 px-1 py-0.2 rounded font-mono">
      ▲ +1
    </span>
  );
}

// 8. Renders custom horizontal bento block diagram modeling entire caller SIP leg
function renderVisualFlowChart(call: ActiveCall) {
  if (call.type === 'Inbound') {
    return (
      <>
        {/* Client */}
        <div className="flex-1 min-w-[90px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-slate-500 uppercase">Клиент</span>
          <strong className="text-slate-100 font-extrabold text-[11px] overflow-hidden w-full text-ellipsis">{call.caller.substring(0, 12)}</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">RTP Port Out</span>
        </div>

        {/* Arrow element */}
        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-1" />

        {/* DID / Trunk */}
        <div className="flex-1 min-w-[90px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-sky-400 uppercase">Транк / DID</span>
          <strong className="text-sky-300 font-bold text-[10.5px] overflow-hidden w-full text-ellipsis">{call.trunk !== '—' ? call.trunk : call.did}</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">Mango SIP Gate</span>
        </div>

        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-1" />

        {/* Inbound Route rule match */}
        <div className="flex-1 min-w-[90px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-indigo-400 uppercase">Inbound Route</span>
          <strong className="text-indigo-300 font-semibold text-[10.5px]">from-trunk</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">DID Match ok</span>
        </div>

        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-1" />

        {/* Queue matching block if status Queue */}
        {call.status === 'Queue' ? (
          <div className="flex-1 min-w-[90px] border border-amber-800/80 bg-amber-955/15 p-2 rounded-xl flex flex-col items-center justify-center text-center animate-pulse">
            <span className="text-[9px] text-amber-400 uppercase">Очередь</span>
            <strong className="text-amber-300 font-extrabold text-[10.5px]">{call.queue.split(' ')[0]}</strong>
            <span className="text-[8px] text-amber-500 mt-0.5 font-bold">Ожидание #1</span>
          </div>
        ) : (
          <div className="flex-1 min-w-[90px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
            <span className="text-[9px] text-slate-500 uppercase">Очередь</span>
            <strong className="text-slate-400 text-[10.5px]">Пройдена</strong>
            <span className="text-[8px] text-slate-500 mt-0.5">Direct Route</span>
          </div>
        )}

        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-1" />

        {/* Operator connection block */}
        <div className="flex-1 min-w-[90px] border border-indigo-900/60 bg-indigo-950/20 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-emerald-400 uppercase">Оператор</span>
          <strong className="text-emerald-300 font-extrabold text-[11px]">{call.operator !== '—' ? call.operator : 'Поиск...'}</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">{call.status === 'Queue' ? 'Звонок агентам' : 'Активный линк'}</span>
        </div>
      </>
    );
  } else {
    // Outbound flow diagram
    return (
      <>
        {/* Source Extension */}
        <div className="flex-1 min-w-[100px] border border-indigo-900/60 bg-indigo-950/20 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-slate-500 uppercase">Внутр. EXT</span>
          <strong className="text-indigo-300 font-extrabold text-[11px]">{call.caller}</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">SIP Device OK</span>
        </div>

        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-2" />

        {/* Outbound route match */}
        <div className="flex-1 min-w-[105px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-teal-400 uppercase">Outbound Route</span>
          <strong className="text-teal-300 font-bold text-[10.5px]">To-Russia-MTT</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">Dialplan Rule #2</span>
        </div>

        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-2" />

        {/* Trunk gate */}
        <div className="flex-1 min-w-[105px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-indigo-400 uppercase">Trunk</span>
          <strong className="text-indigo-300 font-bold text-[10.5px]">{call.trunk}</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">PJSIP Channel</span>
        </div>

        <ChevronRight className="hidden md:block h-4 w-4 text-slate-600 shrink-0 mx-2" />

        {/* External peer destination */}
        <div className="flex-1 min-w-[100px] border border-slate-800 bg-slate-900 p-2 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-slate-500 uppercase">Внешний номер</span>
          <strong className="text-slate-100 font-extrabold text-[11px] overflow-hidden w-full text-ellipsis">{call.callee}</strong>
          <span className="text-[8px] text-slate-500 mt-0.5">Абонент ответил</span>
        </div>
      </>
    );
  }
}
