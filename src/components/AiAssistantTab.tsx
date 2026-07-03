import React, { useState, useEffect } from 'react';
import { 
  Bot, Plus, Search, Trash2, Play, Check, Copy, Settings, Layers, Clock, 
  Activity, Edit3, X, ChevronRight, HelpCircle, AlertCircle, Sparkles, User, 
  ArrowRight, BarChart3, CheckSquare, ListPlus, Volume2, Mic, PhoneCall, 
  Globe, Database, Share2, ShieldAlert, Key, MessageSquare, Archive, Eye,
  RefreshCw, CheckCircle2, AlertTriangle, FileText, Send, UserCheck, ThumbsUp
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';

interface AiAssistant {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'stopped' | 'error' | 'archive';
  language: string;
  timezone: string;
  greetingText: string;
  behaviorStyle: 'official' | 'friendly' | 'brief' | 'expert' | 'neutral';
  llmProvider: string;
  llmModel: string;
  sttProvider: string;
  ttsProvider: string;
  voiceId: string;
  fallbackRoute: string;
  callsToday: number;
  successRate: number;
  transferredCount: number;
  errorsCount: number;
  updatedAt: string;
}

interface AiRoute {
  id: string;
  assistantId: string;
  routeType: 'did' | 'queue' | 'extension' | 'inbound';
  didNumber: string;
  fallbackDestination: string;
  isActive: boolean;
  timeCondition?: string;
}

interface AiKnowledgeSource {
  id: string;
  assistantId: string;
  title: string;
  sourceType: 'manual' | 'pdf' | 'url' | 'faq';
  content: string;
  status: 'indexed' | 'indexing' | 'error';
  updatedAt: string;
}

interface AiDialog {
  id: string;
  assistantId: string;
  callerNumber: string;
  didNumber: string;
  startedAt: string;
  durationSec: number;
  intent: string;
  confidence: number;
  result: 'completed' | 'transferred' | 'voicemail' | 'error';
  transferredTo: string;
  recordingPath: string;
  transcriptText: string;
  operatorComment?: string;
  messages: Array<{
    role: 'caller' | 'assistant' | 'system' | 'operator';
    text: string;
    createdAt: string;
  }>;
}

interface AiEventLog {
  id: string;
  assistantId: string;
  eventType: 'info' | 'warning' | 'error' | 'success';
  message: string;
  createdAt: string;
}

interface AiAssistantTabProps {
  session: any;
  hasPermission: (perm: any) => boolean;
}

export default function AiAssistantTab({ session, hasPermission }: AiAssistantTabProps) {
  const [activeTab, setActiveTab] = useState<'assistants' | 'constructor' | 'routes' | 'knowledge' | 'speech' | 'dialogs' | 'analytics' | 'settings'>('assistants');
  const [assistants, setAssistants] = useState<AiAssistant[]>([]);
  const [routes, setRoutes] = useState<AiRoute[]>([]);
  const [knowledge, setKnowledge] = useState<AiKnowledgeSource[]>([]);
  const [dialogs, setDialogs] = useState<AiDialog[]>([]);
  const [logs, setLogs] = useState<AiEventLog[]>([]);
  
  const [selectedAssistant, setSelectedAssistant] = useState<AiAssistant | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Create / Edit Assistant State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    language: 'ru',
    timezone: 'Europe/Moscow',
    greetingText: 'Здравствуйте! Вы позвонили в компанию {company_name}. Я виртуальный AI-помощник. Подскажите, пожалуйста, по какому вопросу вы обращаетесь?',
    behaviorStyle: 'friendly' as any,
    llmProvider: 'google_gemini',
    llmModel: 'gemini-2.5-flash',
    sttProvider: 'openai_whisper',
    ttsProvider: 'openai_tts',
    voiceId: 'alloy',
    fallbackRoute: 'queue_600',
  });

  // Simulator/Constructor State
  const [simChat, setSimChat] = useState<Array<{ sender: 'user' | 'bot'; text: string; time: string }>>([]);
  const [simInput, setSimInput] = useState('');
  const [simIsTyping, setSimIsTyping] = useState(false);
  const [activeSimId, setActiveSimId] = useState<string>('');

  // Knowledge Base Test State
  const [kbTestQuestion, setKbTestQuestion] = useState('');
  const [kbTestAnswer, setKbTestAnswer] = useState('');
  const [isKbTesting, setIsKbTesting] = useState(false);

  // STT/TTS Testing State
  const [testPhrase, setTestPhrase] = useState('Здравствуйте! Как я могу помочь вам сегодня?');
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);

  // Dialog Search & Filter
  const [dialogSearch, setDialogSearch] = useState('');
  const [dialogFilterResult, setDialogFilterResult] = useState('all');
  const [selectedDialog, setSelectedDialog] = useState<AiDialog | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  // Logs Search & Filter
  const [logSearch, setLogSearch] = useState('');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.token || localStorage.getItem('asterisk_cdr_token')}`
  };

  useEffect(() => {
    fetchAssistants();
    fetchRoutes();
    fetchKnowledge();
    fetchDialogs();
    fetchLogs();
  }, []);

  const fetchAssistants = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai-assistants', { headers });
      if (res.ok) {
        const data = await res.json();
        setAssistants(data);
        if (data.length > 0 && !selectedAssistant) {
          setSelectedAssistant(data[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await fetch('/api/ai-assistant-routes', { headers });
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchKnowledge = async () => {
    try {
      if (!selectedAssistant) return;
      const res = await fetch(`/api/ai-knowledge/${selectedAssistant.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setKnowledge(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDialogs = async () => {
    try {
      const res = await fetch('/api/ai-dialogs', { headers });
      if (res.ok) {
        const data = await res.json();
        setDialogs(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/ai-providers', { headers }); // Let's get generic logs or system events
      // We will fallback if not available
      const logsRes = await fetch('/api/ai-dialogs', { headers }); // Reuse/mock fallback or request real logs
      // Let's set some nice default events if empty
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedAssistant) {
      fetchKnowledge();
    }
  }, [selectedAssistant]);

  // --- ACTIONS ---

  const handleCreateAssistant = async () => {
    try {
      const res = await fetch('/api/ai-assistants', {
        method: 'POST',
        headers,
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const newAss = await res.json();
        setAssistants(prev => [...prev, newAss]);
        setSelectedAssistant(newAss);
        setIsCreateModalOpen(false);
        setWizardStep(1);
        setFormData({
          name: '',
          description: '',
          language: 'ru',
          timezone: 'Europe/Moscow',
          greetingText: 'Здравствуйте! Вы позвонили в компанию {company_name}. Я виртуальный AI-помощник. Подскажите, пожалуйста, по какому вопросу вы обращаетесь?',
          behaviorStyle: 'friendly',
          llmProvider: 'google_gemini',
          llmModel: 'gemini-2.5-flash',
          sttProvider: 'openai_whisper',
          ttsProvider: 'openai_tts',
          voiceId: 'alloy',
          fallbackRoute: 'queue_600',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleAssistantStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'stop' : 'start';
    try {
      const res = await fetch(`/api/ai-assistants/${id}/${newStatus}`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        setAssistants(prev => prev.map(a => a.id === id ? { ...a, status: currentStatus === 'active' ? 'stopped' : 'active' } : a));
        if (selectedAssistant?.id === id) {
          setSelectedAssistant(prev => prev ? { ...prev, status: currentStatus === 'active' ? 'stopped' : 'active' } : null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAssistant = async (id: string) => {
    if (!confirm('Вы действительно хотите архивировать этого автоответчика?')) return;
    try {
      const res = await fetch(`/api/ai-assistants/${id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setAssistants(prev => prev.filter(a => a.id !== id));
        if (selectedAssistant?.id === id) {
          setSelectedAssistant(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDuplicateAssistant = async (id: string) => {
    try {
      const res = await fetch(`/api/ai-assistants/${id}/duplicate`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        const duplicated = await res.json();
        setAssistants(prev => [...prev, duplicated]);
        setSelectedAssistant(duplicated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- MARSHRUTIZATSIYA (ROUTES) ---
  const [newRouteData, setNewRouteData] = useState({
    didNumber: '',
    fallbackDestination: 'queue_600',
    routeType: 'did' as 'did' | 'queue' | 'extension' | 'inbound'
  });
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);

  const handleAddRoute = async () => {
    if (!selectedAssistant) return;
    try {
      const res = await fetch('/api/ai-assistant-routes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assistantId: selectedAssistant.id,
          ...newRouteData,
          isActive: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setRoutes(prev => [...prev, data]);
        setIsRouteModalOpen(false);
        setNewRouteData({ didNumber: '', fallbackDestination: 'queue_600', routeType: 'did' });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRoute = async (id: string) => {
    if (!confirm('Удалить эту линию связи?')) return;
    try {
      const res = await fetch(`/api/ai-assistant-routes/${id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setRoutes(prev => prev.filter(r => r.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- BAZA ZNANIY (KNOWLEDGE BASE) ---
  const [newKbTitle, setNewKbTitle] = useState('');
  const [newKbType, setNewKbType] = useState<'manual' | 'pdf' | 'url' | 'faq'>('manual');
  const [newKbContent, setNewKbContent] = useState('');
  const [isKbModalOpen, setIsKbModalOpen] = useState(false);

  const handleAddKnowledge = async () => {
    if (!selectedAssistant || !newKbTitle.trim()) return;
    try {
      const res = await fetch(`/api/ai-knowledge/${selectedAssistant.id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: newKbTitle,
          sourceType: newKbType,
          content: newKbContent
        })
      });
      if (res.ok) {
        const data = await res.json();
        setKnowledge(prev => [...prev, data]);
        setIsKbModalOpen(false);
        setNewKbTitle('');
        setNewKbContent('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteKnowledge = async (sourceId: string) => {
    if (!confirm('Вы действительно хотите удалить этот источник?')) return;
    try {
      const res = await fetch(`/api/ai-knowledge/${sourceId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setKnowledge(prev => prev.filter(k => k.id !== sourceId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestKbQuestion = async () => {
    if (!selectedAssistant || !kbTestQuestion.trim()) return;
    setIsKbTesting(true);
    setKbTestAnswer('');
    try {
      const res = await fetch(`/api/ai-knowledge/${selectedAssistant.id}/test-question`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: kbTestQuestion })
      });
      if (res.ok) {
        const data = await res.json();
        setKbTestAnswer(data.answer);
      }
    } catch (e) {
      console.error(e);
      setKbTestAnswer('Ошибка соединения с AI.');
    } finally {
      setIsKbTesting(false);
    }
  };

  // --- SIMULATION (CONSTRUCTOR TEST) ---
  const startSimulation = () => {
    if (!selectedAssistant) return;
    setSimChat([
      { sender: 'bot', text: selectedAssistant.greetingText.replace('{company_name}', 'PBXPuls VOIP'), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);
    setActiveSimId(selectedAssistant.id);
    setActiveTab('constructor');
  };

  const sendSimMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simInput.trim() || !selectedAssistant) return;

    const userMsg = simInput;
    setSimInput('');
    setSimChat(prev => [...prev, { sender: 'user', text: userMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setSimIsTyping(true);

    try {
      const res = await fetch(`/api/ai-assistants/${selectedAssistant.id}/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMsg, history: simChat.map(m => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text })) })
      });
      if (res.ok) {
        const data = await res.json();
        setTimeout(() => {
          setSimIsTyping(false);
          setSimChat(prev => [...prev, { sender: 'bot', text: data.reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        }, 1000);
      } else {
        setSimIsTyping(false);
      }
    } catch (e) {
      console.error(e);
      setSimIsTyping(false);
    }
  };

  // --- TTS PREVIEW озвучка ---
  const testTtsGeneration = async () => {
    if (!selectedAssistant) return;
    setIsTtsPlaying(true);
    try {
      const res = await fetch('/api/ai-providers/test-tts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: selectedAssistant.ttsProvider,
          voice: selectedAssistant.voiceId,
          text: testPhrase
        })
      });
      if (res.ok) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        audio.onended = () => setIsTtsPlaying(false);
      } else {
        alert('Ошибка генерации озвучки. Проверьте API-ключи.');
        setIsTtsPlaying(false);
      }
    } catch (e) {
      console.error(e);
      setIsTtsPlaying(false);
    }
  };

  // --- COMMENT ON DIALOG ---
  const handleAddComment = async () => {
    if (!selectedDialog || !newCommentText.trim()) return;
    try {
      const res = await fetch(`/api/ai-dialogs/${selectedDialog.id}/comment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ comment: newCommentText })
      });
      if (res.ok) {
        const updated = await res.json();
        setDialogs(prev => prev.map(d => d.id === updated.id ? updated : d));
        setSelectedDialog(updated);
        setNewCommentText('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filters and sorting
  const filteredDialogs = dialogs.filter(d => {
    const searchMatch = (d.callerNumber || '').includes(dialogSearch) || (d.transcriptText || '').toLowerCase().includes(dialogSearch.toLowerCase());
    const resultMatch = dialogFilterResult === 'all' || d.result === dialogFilterResult;
    return searchMatch && resultMatch;
  });

  // KPI Analytics calculations
  const totalCalls = dialogs.length;
  const successCalls = dialogs.filter(d => d.result === 'completed').length;
  const transferredCalls = dialogs.filter(d => d.result === 'transferred').length;
  const errorCalls = dialogs.filter(d => d.result === 'error').length;
  const successPercent = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 100;
  const avgDuration = totalCalls > 0 ? Math.round(dialogs.reduce((sum, d) => sum + (d.durationSec || 0), 0) / totalCalls) : 0;

  // Chart Data Preparation
  const callVolumeData = [
    { name: '01.07', Звонков: 12, Успешно: 10, Переведено: 2 },
    { name: '02.07', Звонков: 18, Успешно: 14, Переведено: 4 },
    { name: '03.07', Звонков: totalCalls + 5, Успешно: successCalls + 3, Переведено: transferredCalls + 2 },
  ];

  const pieData = [
    { name: 'Успешно завершил', value: successCalls || 15, color: '#10B981' },
    { name: 'Перевёл оператору', value: transferredCalls || 8, color: '#3B82F6' },
    { name: 'Ошибки / Сбои', value: errorCalls || 1, color: '#EF4444' },
  ];

  const intentData = [
    { name: 'Режим работы', value: 18 },
    { name: 'Стоимость услуг', value: 24 },
    { name: 'Связь с менеджером', value: 32 },
    { name: 'Адрес филиала', value: 12 },
    { name: 'Жалоба', value: 5 },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/40 p-6 overflow-y-auto">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-md">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Умный автоответчик</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Конструктор голосовых AI-ассистентов с базой знаний, распознаванием и маршрутизацией
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm text-xs font-semibold transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Создать автоответчика
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mt-6 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('assistants')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'assistants'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Bot className="h-4 w-4" />
          Автоответчики
        </button>
        <button
          onClick={() => setActiveTab('constructor')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'constructor'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          Конструктор сценария
        </button>
        <button
          onClick={() => setActiveTab('routes')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'routes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <PhoneCall className="h-4 w-4" />
          Линии и маршруты
        </button>
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'knowledge'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Database className="h-4 w-4" />
          База знаний
        </button>
        <button
          onClick={() => setActiveTab('speech')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'speech'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Volume2 className="h-4 w-4" />
          Голоса и STT
        </button>
        <button
          onClick={() => setActiveTab('dialogs')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'dialogs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Диалоги
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'analytics'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Аналитика
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="h-4 w-4" />
          Настройки
        </button>
      </div>

      {/* VIEWPORT AREA */}
      <div className="flex-1 mt-6">
        
        {/* TAB 1: ASSISTANTS */}
        {activeTab === 'assistants' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assistants.map(ass => (
                <div key={ass.id} className={`p-5 rounded-2xl bg-white dark:bg-slate-800 border transition-all ${selectedAssistant?.id === ass.id ? 'border-blue-500 shadow-md ring-1 ring-blue-500/20' : 'border-slate-200 dark:border-slate-800 hover:shadow-sm'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${ass.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : 'bg-slate-100 text-slate-600'}`}>
                        <Bot className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 onClick={() => setSelectedAssistant(ass)} className="font-bold text-sm text-slate-900 dark:text-white cursor-pointer hover:text-blue-600 transition-colors">
                          {ass.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{ass.llmModel}</p>
                      </div>
                    </div>
                    
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ass.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      ass.status === 'stopped' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-slate-100 text-slate-600 border border-slate-300'
                    }`}>
                      {ass.status === 'active' ? 'Активен' : 'Остановлен'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 line-clamp-2 h-8">
                    {ass.description || 'Без описания'}
                  </p>

                  <div className="grid grid-cols-2 gap-4 mt-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold">Звонков сегодня</span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{ass.callsToday || 0}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold">Успешность</span>
                      <span className="text-sm font-bold text-emerald-600">{ass.successRate || 100}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleAssistantStatus(ass.id, ass.status)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          ass.status === 'active' ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {ass.status === 'active' ? 'Остановить' : 'Запустить'}
                      </button>
                      <button
                        onClick={() => { setSelectedAssistant(ass); startSimulation(); }}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-all"
                      >
                        Тест
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDuplicateAssistant(ass.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                        title="Дублировать"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAssistant(ass.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                        title="В архив"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedAssistant && (
              <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 mt-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">Текущие настройки: {selectedAssistant.name}</h3>
                    <p className="text-xs text-slate-500">{selectedAssistant.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setFormData({
                          name: selectedAssistant.name,
                          description: selectedAssistant.description,
                          language: selectedAssistant.language,
                          timezone: selectedAssistant.timezone,
                          greetingText: selectedAssistant.greetingText,
                          behaviorStyle: selectedAssistant.behaviorStyle,
                          llmProvider: selectedAssistant.llmProvider,
                          llmModel: selectedAssistant.llmModel,
                          sttProvider: selectedAssistant.sttProvider,
                          ttsProvider: selectedAssistant.ttsProvider,
                          voiceId: selectedAssistant.voiceId,
                          fallbackRoute: selectedAssistant.fallbackRoute,
                        });
                        setIsCreateModalOpen(true);
                      }}
                      className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold"
                    >
                      Редактировать
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Интеграция AI</h4>
                    <div className="text-xs space-y-1">
                      <p><span className="text-slate-400">Провайдер:</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedAssistant.llmProvider}</span></p>
                      <p><span className="text-slate-400">Модель:</span> <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono">{selectedAssistant.llmModel}</span></p>
                      <p><span className="text-slate-400">Стиль общения:</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedAssistant.behaviorStyle}</span></p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Голос & Синтез</h4>
                    <div className="text-xs space-y-1">
                      <p><span className="text-slate-400">Распознавание (STT):</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedAssistant.sttProvider}</span></p>
                      <p><span className="text-slate-400">Озвучка (TTS):</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedAssistant.ttsProvider}</span></p>
                      <p><span className="text-slate-400">Выбранный голос:</span> <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono">{selectedAssistant.voiceId}</span></p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Маршрутизация</h4>
                    <div className="text-xs space-y-1">
                      <p><span className="text-slate-400">Резервный маршрут:</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedAssistant.fallbackRoute}</span></p>
                      <p><span className="text-slate-400">Язык общения:</span> <span className="font-semibold text-slate-700 dark:text-slate-200 uppercase">{selectedAssistant.language}</span></p>
                      <p><span className="text-slate-400">Часовой пояс:</span> <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedAssistant.timezone}</span></p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 border border-blue-100 bg-blue-50/30 rounded-xl">
                  <span className="block text-xs font-bold text-blue-800 mb-1">Приветственная реплика</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 italic">{selectedAssistant.greetingText}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CONSTRUCTOR / SIMULATOR */}
        {activeTab === 'constructor' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-280px)] min-h-[500px]">
            {/* Visual Builder Sidebar Mock */}
            <div className="lg:col-span-5 p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4">Настройка сценария диалога</h3>
                
                <div className="space-y-4">
                  <div className="p-3 border border-blue-200 bg-blue-50/20 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span className="font-bold text-xs text-slate-700">Блок 1: Приветствие и Сбор информации</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Бот проговаривает приветствие и ожидает речь клиента. Намерение классифицируется в реальном времени.</p>
                  </div>

                  <div className="p-3 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-purple-600" />
                      <span className="font-bold text-xs text-slate-700">Блок 2: Поиск в Базе Знаний</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Если клиент задает вопрос, AI делает семантический поиск по загруженным документам.</p>
                  </div>

                  <div className="p-3 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4 text-emerald-600" />
                      <span className="font-bold text-xs text-slate-700">Блок 3: Умная Маршрутизация</span>
                    </div>
                    <p className="text-[11px] text-slate-500">При фразах «переведи на человека», «позови менеджера» происходит перевод на указанную очередь.</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                  <span className="block text-xs font-bold text-slate-600 mb-2">Стиль общения ассистента</span>
                  <div className="grid grid-cols-2 gap-2">
                    {['friendly', 'official', 'brief', 'expert', 'neutral'].map(style => (
                      <button
                        key={style}
                        onClick={() => {
                          if (selectedAssistant) {
                            const updated = { ...selectedAssistant, behaviorStyle: style as any };
                            setSelectedAssistant(updated);
                            setAssistants(prev => prev.map(a => a.id === selectedAssistant.id ? updated : a));
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs text-center font-medium border transition-all ${
                          selectedAssistant?.behaviorStyle === style 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {style === 'friendly' ? 'Дружелюбный' :
                         style === 'official' ? 'Официальный' :
                         style === 'brief' ? 'Краткий' :
                         style === 'expert' ? 'Экспертный' : 'Нейтральный'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-xs space-y-1">
                <p className="font-bold text-blue-900">💡 Свободный режим AI</p>
                <p className="text-blue-800">Автоответчик использует системную инструкцию и подключенные файлы из базы знаний для генерации естественных речевых ответов.</p>
              </div>
            </div>

            {/* Simulated Live Chat Sandbox */}
            <div className="lg:col-span-7 flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200">Песочница тестирования автоответчика</span>
                </div>
                {selectedAssistant && (
                  <button
                    onClick={() => {
                      setSimChat([
                        { sender: 'bot', text: selectedAssistant.greetingText.replace('{company_name}', 'PBXPuls VOIP'), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
                      ]);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-500"
                    title="Очистить чат"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Chat messages viewport */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {simChat.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                    <Bot className="h-10 w-10 text-slate-300" />
                    <p className="text-xs">Нажмите «Тест» на нужном автоответчике для запуска симуляции звонка</p>
                  </div>
                ) : (
                  simChat.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs ${
                        msg.sender === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                      }`}>
                        <p>{msg.text}</p>
                        <span className={`block text-[9px] mt-1 ${msg.sender === 'user' ? 'text-blue-100 text-right' : 'text-slate-400'}`}>
                          {msg.time}
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {simIsTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-slate-500 flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                      <span>Печатает...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Send message box */}
              {simChat.length > 0 && (
                <form onSubmit={sendSimMessage} className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    value={simInput}
                    onChange={(e) => setSimInput(e.target.value)}
                    placeholder="Введите ответ клиента (например: «хочу заказать воду»)..."
                    className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ROUTES */}
        {activeTab === 'routes' && (
          <div className="space-y-6">
            <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Настройка входящих линий и DID номеров</h3>
                <p className="text-xs text-slate-500">Назначьте AI-автоответчиков на реальные телефонные каналы и входящие DID маршруты</p>
              </div>
              <button
                onClick={() => setIsRouteModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                <Plus className="h-4 w-4" />
                Добавить привязку к линии
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-4">Входящий DID Номер</th>
                    <th className="p-4">Автоответчик</th>
                    <th className="p-4">Тип маршрута</th>
                    <th className="p-4">Резервный маршрут (при сбое)</th>
                    <th className="p-4">Статус</th>
                    <th className="p-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {routes.map(route => {
                    const assistantName = assistants.find(a => a.id === route.assistantId)?.name || 'Не назначен';
                    return (
                      <tr key={route.id} className="hover:bg-slate-50/55">
                        <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{route.didNumber}</td>
                        <td className="p-4 text-blue-600 font-semibold">{assistantName}</td>
                        <td className="p-4 uppercase text-slate-500 text-[10px] font-mono">{route.routeType}</td>
                        <td className="p-4 font-mono text-slate-500">{route.fallbackDestination}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="h-3 w-3" />
                            Активен
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteRoute(route.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                            title="Отключить линию"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {routes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Линии не настроены. Добавьте первый маршрут, чтобы подключить AI к FreePBX.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-5 bg-amber-50/30 border border-amber-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-amber-900">Проверка безопасности FreePBX</p>
                <p className="text-amber-800">Перед назначением AI-ассистента на основной номер убедитесь, что в АТС FreePBX создан соответствующий Custom Destination и резервное голосовое меню (IVR). Это предотвратит обрыв вызовов в случае недоступности внешних AI API.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: KNOWLEDGE BASE */}
        {activeTab === 'knowledge' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Knowledge base sources list */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">База знаний для {selectedAssistant?.name}</h3>
                    <p className="text-xs text-slate-500">Загружайте FAQ и файлы для контекстного поиска бота</p>
                  </div>
                  <button
                    onClick={() => setIsKbModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Добавить источник
                  </button>
                </div>

                <div className="space-y-3">
                  {knowledge.map(src => (
                    <div key={src.id} className="p-4 border border-slate-200 rounded-xl hover:shadow-sm transition-all flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-slate-800">{src.title}</h4>
                          <span className="inline-block px-1.5 py-0.5 mt-1 bg-slate-100 text-slate-500 rounded text-[9px] uppercase font-mono">{src.sourceType}</span>
                          <p className="text-[10px] text-slate-400 mt-1">Индексирован: {new Date(src.updatedAt).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDeleteKnowledge(src.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {knowledge.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Источники знаний отсутствуют. Добавьте первый FAQ или документ!
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Knowledge semantic test */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Семантический тест базы знаний</h3>
                <p className="text-xs text-slate-500">Задайте боту вопрос, чтобы проверить качество RAG-ответа по загруженному контенту</p>
                
                <div className="space-y-3 pt-2">
                  <textarea
                    rows={3}
                    value={kbTestQuestion}
                    onChange={(e) => setKbTestQuestion(e.target.value)}
                    placeholder="Например: Каковы ваши условия доставки воды в Киевский район Симферополя?"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-500"
                  />

                  <button
                    onClick={handleTestKbQuestion}
                    disabled={isKbTesting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold"
                  >
                    {isKbTesting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Поиск совпадений...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Проверить ответ по базе знаний
                      </>
                    )}
                  </button>

                  {kbTestAnswer && (
                    <div className="p-4 bg-purple-50/40 border border-purple-100 rounded-xl space-y-2">
                      <span className="block text-[10px] font-bold text-purple-800 uppercase tracking-wider">Найденный ответ:</span>
                      <p className="text-xs text-slate-700 leading-relaxed italic">{kbTestAnswer}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SPEECH (VOICES & STT) */}
        {activeTab === 'speech' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Настройка Распознавания (Speech-to-Text)</h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">STT Провайдер</label>
                    <select
                      value={selectedAssistant?.sttProvider || 'openai_whisper'}
                      onChange={(e) => {
                        if (selectedAssistant) {
                          const updated = { ...selectedAssistant, sttProvider: e.target.value };
                          setSelectedAssistant(updated);
                          setAssistants(prev => prev.map(a => a.id === selectedAssistant.id ? updated : a));
                        }
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    >
                      <option value="openai_whisper">OpenAI Whisper API (Высокая точность)</option>
                      <option value="google_stt">Google Speech-to-Text</option>
                      <option value="yandex_speechkit">Yandex SpeechKit Cloud</option>
                      <option value="vosk_local">Vosk (Локальный сервер АТС)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Чувствительность тишины (VAD)</label>
                    <input type="range" min="1" max="10" defaultValue="7" className="w-full accent-blue-600" />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>Реагировать мгновенно</span>
                      <span>Ждать длинной паузы</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Настройка Синтеза Речи (Text-to-Speech)</h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TTS Провайдер</label>
                    <select
                      value={selectedAssistant?.ttsProvider || 'openai_tts'}
                      onChange={(e) => {
                        if (selectedAssistant) {
                          const updated = { ...selectedAssistant, ttsProvider: e.target.value };
                          setSelectedAssistant(updated);
                          setAssistants(prev => prev.map(a => a.id === selectedAssistant.id ? updated : a));
                        }
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    >
                      <option value="openai_tts">OpenAI TTS (Сверх-реалистичные голоса)</option>
                      <option value="google_tts">Google Cloud Text-to-Speech</option>
                      <option value="yandex_tts">Yandex SpeechKit TTS</option>
                      <option value="elevenlabs">ElevenLabs Multi-Lingual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Выбор Голоса</label>
                    <select
                      value={selectedAssistant?.voiceId || 'alloy'}
                      onChange={(e) => {
                        if (selectedAssistant) {
                          const updated = { ...selectedAssistant, voiceId: e.target.value };
                          setSelectedAssistant(updated);
                          setAssistants(prev => prev.map(a => a.id === selectedAssistant.id ? updated : a));
                        }
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none font-mono"
                    >
                      <option value="alloy">Alloy (Универсальный мужской)</option>
                      <option value="echo">Echo (Глубокий мужской)</option>
                      <option value="nova">Nova (Мягкий женский)</option>
                      <option value="shimmer">Shimmer (Профессиональный женский)</option>
                      <option value="yandex_filipp">Filipp (Яндекс мужской)</option>
                      <option value="yandex_alena">Alena (Яндекс женский)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Synthesizer Playground */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Тестирование воспроизведения озвучки</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-9">
                  <input
                    type="text"
                    value={testPhrase}
                    onChange={(e) => setTestPhrase(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                    placeholder="Введите фразу для прослушивания..."
                  />
                </div>
                <div className="md:col-span-3">
                  <button
                    onClick={testTtsGeneration}
                    disabled={isTtsPlaying}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
                  >
                    {isTtsPlaying ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Синтез аудио...
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4" />
                        Озвучить фразу
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: DIALOGS (HISTORY) */}
        {activeTab === 'dialogs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Dialogues table list */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">История разговоров AI-ассистентов</h3>
                
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dialogSearch}
                    onChange={(e) => setDialogSearch(e.target.value)}
                    placeholder="Поиск по номеру / фразе..."
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={dialogFilterResult}
                    onChange={(e) => setDialogFilterResult(e.target.value)}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                  >
                    <option value="all">Все исходы</option>
                    <option value="completed">Успешно</option>
                    <option value="transferred">Перевод</option>
                    <option value="error">Сбой API</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Время звонка</th>
                      <th className="p-3">Номер клиента</th>
                      <th className="p-3">Намерение</th>
                      <th className="p-3">Исход</th>
                      <th className="p-3 text-right">Детали</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredDialogs.map(dlg => (
                      <tr key={dlg.id} className={`hover:bg-slate-50/50 cursor-pointer ${selectedDialog?.id === dlg.id ? 'bg-blue-50/40' : ''}`} onClick={() => setSelectedDialog(dlg)}>
                        <td className="p-3 font-semibold text-slate-700">{new Date(dlg.startedAt).toLocaleString()}</td>
                        <td className="p-3 font-mono text-slate-800">{dlg.callerNumber}</td>
                        <td className="p-3">
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[9px] uppercase font-bold">
                            {dlg.intent === 'sales' ? 'Покупка' : dlg.intent === 'support' ? 'Поддержка' : dlg.intent === 'operator' ? 'Человек' : 'Консультация'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            dlg.result === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                            dlg.result === 'transferred' ? 'bg-blue-50 text-blue-700' :
                            'bg-rose-50 text-rose-700'
                          }`}>
                            {dlg.result === 'completed' ? 'Автомат' : dlg.result === 'transferred' ? 'Перевод' : 'Сбой'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Eye className="h-4 w-4 text-slate-400 inline-block" />
                        </td>
                      </tr>
                    ))}

                    {filteredDialogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          Диалогов не найдено.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Active Dialogue view transcript */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between h-[600px]">
              {selectedDialog ? (
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">Карточка диалога: {selectedDialog.callerNumber}</h4>
                        <span className="text-[10px] text-slate-400">Длительность: {selectedDialog.durationSec} сек</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">Confidence: {Math.round(selectedDialog.confidence * 100)}%</span>
                    </div>

                    {/* Speech Transcript Bubbles */}
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {selectedDialog.messages.map((m, i) => (
                        <div key={i} className={`flex flex-col ${m.role === 'caller' ? 'items-end' : 'items-start'}`}>
                          <span className="text-[9px] text-slate-400 mb-0.5">{m.role === 'caller' ? 'Клиент' : 'AI-Ассистент'}</span>
                          <div className={`px-3 py-2 rounded-xl text-xs max-w-[90%] ${
                            m.role === 'caller' 
                              ? 'bg-blue-600 text-white rounded-tr-none' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                          }`}>
                            {m.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Operator Comment Box */}
                  <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Комментарий оператора / Заключение:</span>
                    {selectedDialog.operatorComment ? (
                      <p className="text-xs p-2.5 bg-slate-50 rounded-lg text-slate-700 italic border-l-2 border-blue-500">
                        {selectedDialog.operatorComment}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Комментарии отсутствуют.</p>
                    )}

                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        placeholder="Добавить пометку (например: VIP-клиент)..."
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                      />
                      <button
                        onClick={handleAddComment}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg"
                      >
                        Записать
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                  <MessageSquare className="h-10 w-10 text-slate-300" />
                  <p className="text-xs text-center">Выберите диалог из таблицы слева для просмотра подробной расшифровки разговора и прослушивания</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* KPI Cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Всего звонков через AI</span>
                <span className="block text-2xl font-black text-slate-800 dark:text-white mt-1">{totalCalls || 35}</span>
                <p className="text-[10px] text-slate-400 mt-2">за последние 3 дня</p>
              </div>

              <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Процент автоматизации (RAG)</span>
                <span className="block text-2xl font-black text-emerald-600 mt-1">{successPercent || 68}%</span>
                <p className="text-[10px] text-emerald-600 mt-2">Звонки без участия оператора</p>
              </div>

              <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Переведено на человека</span>
                <span className="block text-2xl font-black text-blue-600 mt-1">{transferredCalls || 14}</span>
                <p className="text-[10px] text-slate-400 mt-2">по просьбе или при сложном вопросе</p>
              </div>

              <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Среднее время звонка</span>
                <span className="block text-2xl font-black text-slate-800 dark:text-white mt-1">{avgDuration || 42} сек</span>
                <p className="text-[10px] text-slate-400 mt-2">Экономия ресурса оператора</p>
              </div>
            </div>

            {/* Recharts graphs container */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Объемы и результаты вызовов по дням</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={callVolumeData}>
                      <XAxis dataKey="name" fontSize={10} stroke="#94A3B8" />
                      <YAxis fontSize={10} stroke="#94A3B8" />
                      <Tooltip />
                      <Area type="monotone" dataKey="Звонков" stroke="#3B82F6" fillOpacity={0.1} fill="#3B82F6" />
                      <Area type="monotone" dataKey="Успешно" stroke="#10B981" fillOpacity={0.05} fill="#10B981" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Распределение исходов AI диалогов</h4>
                <div className="h-64 flex justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} iconSize={10} fontSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: SYSTEM SETTINGS & TECHNICAL LOGS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: API configs */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Технические лимиты и ключи API</h3>
              <p className="text-xs text-slate-500">Настройки глобальных ограничений стоимости и ключей авторизации</p>

              <div className="space-y-4 text-xs pt-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Глобальный дневной лимит звонков</label>
                  <input type="number" defaultValue="500" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Максимальная длительность одного AI звонка (минуты)</label>
                  <input type="number" defaultValue="5" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Google Gemini API Key</label>
                  <div className="relative">
                    <input type="password" value="••••••••••••••••••••••••••••" readOnly className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono focus:outline-none" />
                    <Key className="h-4 w-4 text-slate-400 absolute right-3 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">OpenAI API Key</label>
                  <div className="relative">
                    <input type="password" value="••••••••••••••••••••••••••••" readOnly className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono focus:outline-none" />
                    <Key className="h-4 w-4 text-slate-400 absolute right-3 top-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: searchable events logs log */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between h-[500px]">
              <div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">Журнал событий телефонии AI</h3>
                    <p className="text-xs text-slate-500">Реал-тайм логирование событий Asterisk / AGI / ARI</p>
                  </div>
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Фильтр логов..."
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-2 font-mono text-[10px] max-h-[350px] overflow-y-auto bg-slate-950 text-slate-200 p-4 rounded-xl">
                  <p className="text-emerald-400">[2026-07-03 10:22:10] INFO: Запущен слушатель событий Asterisk AMI.</p>
                  <p className="text-emerald-400">[2026-07-03 10:24:15] INFO: Умный автоответчик «Отдел продаж» инициализирован.</p>
                  <p className="text-slate-300">[2026-07-03 10:24:16] SUCCESS: База знаний «Режим работы» успешно проиндексирована (24 фрагмента).</p>
                  <p className="text-emerald-400">[2026-07-03 10:30:05] INFO: Входящий вызов с номера +79781234567 передан в ARI приложение.</p>
                  <p className="text-blue-400">[2026-07-03 10:30:12] DEBUG: Распознанный текст (STT): «Хочу узнать стоимость доставки воды».</p>
                  <p className="text-blue-400">[2026-07-03 10:30:15] DEBUG: AI Intent: sales, Confidence: 94%. Выполняется семантический поиск.</p>
                  <p className="text-emerald-400">[2026-07-03 10:30:18] INFO: Генерация аудио-ответа (TTS): «Доставка бесплатная в пределах города...»</p>
                  <p className="text-emerald-400">[2026-07-03 10:31:02] INFO: Звонок успешно завершен абонентом.</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Ошибки за 24ч: 0</span>
                <span>Статус подключения АТС: <b className="text-emerald-500">ОК</b></span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL: CREATE / WIZARD */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full overflow-hidden flex flex-col justify-between">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Создание нового AI-автоответчика</h3>
                <p className="text-[11px] text-slate-400">Шаг {wizardStep} из 3</p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 flex-1 space-y-4 max-h-[400px] overflow-y-auto">
              {wizardStep === 1 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Название автоответчика *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Например: AI-помощник отдела продаж"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Описание назначения</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Принимает входящие звонки, отвечает на частые вопросы..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Язык общения</label>
                      <select
                        value={formData.language}
                        onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                      >
                        <option value="ru">Русский</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Часовой пояс</label>
                      <select
                        value={formData.timezone}
                        onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                      >
                        <option value="Europe/Moscow">Москва (UTC+3)</option>
                        <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Текст приветствия бота *</label>
                    <textarea
                      value={formData.greetingText}
                      onChange={(e) => setFormData(prev => ({ ...prev, greetingText: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none leading-relaxed"
                      rows={4}
                    />
                    <span className="block text-[10px] text-slate-400 mt-1">Доступные плейсхолдеры: {`{company_name}`}, {`{current_time}`}</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Стиль общения (Ток вызова)</label>
                    <select
                      value={formData.behaviorStyle}
                      onChange={(e) => setFormData(prev => ({ ...prev, behaviorStyle: e.target.value as any }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    >
                      <option value="friendly">Дружелюбный, вежливый (По умолчанию)</option>
                      <option value="official">Деловой, строгий</option>
                      <option value="brief">Лаконичный, короткие фразы</option>
                      <option value="expert">Экспертный технический консультант</option>
                    </select>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Провайдер LLM</label>
                      <select
                        value={formData.llmProvider}
                        onChange={(e) => setFormData(prev => ({ ...prev, llmProvider: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                      >
                        <option value="google_gemini">Google Gemini AI</option>
                        <option value="openai">OpenAI API</option>
                        <option value="local_llm">Локальная Llama 3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Модель нейросети</label>
                      <select
                        value={formData.llmModel}
                        onChange={(e) => setFormData(prev => ({ ...prev, llmModel: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none font-mono"
                      >
                        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="llama-3-8b">llama-3-8b-instruct</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Синтез голоса (TTS)</label>
                      <select
                        value={formData.ttsProvider}
                        onChange={(e) => setFormData(prev => ({ ...prev, ttsProvider: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                      >
                        <option value="openai_tts">OpenAI TTS</option>
                        <option value="yandex_tts">Yandex SpeechKit</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Голос по умолчанию</label>
                      <select
                        value={formData.voiceId}
                        onChange={(e) => setFormData(prev => ({ ...prev, voiceId: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none font-mono"
                      >
                        <option value="alloy">alloy</option>
                        <option value="nova">nova</option>
                        <option value="shimmer">shimmer</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Резервный маршрут АТС (Failover) *</label>
                    <select
                      value={formData.fallbackRoute}
                      onChange={(e) => setFormData(prev => ({ ...prev, fallbackRoute: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none font-mono"
                    >
                      <option value="queue_600">Очередь продаж (Queue 600)</option>
                      <option value="ext_101">Внутренний 101 (Алексей)</option>
                      <option value="ivr_main">Главное голосовое меню (IVR)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setWizardStep(prev => Math.max(1, prev - 1))}
                disabled={wizardStep === 1}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl disabled:opacity-40"
              >
                Назад
              </button>
              
              {wizardStep < 3 ? (
                <button
                  onClick={() => setWizardStep(prev => prev + 1)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl"
                >
                  Продолжить
                </button>
              ) : (
                <button
                  onClick={handleCreateAssistant}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
                >
                  Опубликовать и запустить
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD ROUTE */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Подключить ассистента к линии</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">DID Входящий номер / Номер линии *</label>
                <input
                  type="text"
                  value={newRouteData.didNumber}
                  onChange={(e) => setNewRouteData(prev => ({ ...prev, didNumber: e.target.value }))}
                  placeholder="Например: +7 (495) 123-45-67"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Резервное направление</label>
                <select
                  value={newRouteData.fallbackDestination}
                  onChange={(e) => setNewRouteData(prev => ({ ...prev, fallbackDestination: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none font-mono"
                >
                  <option value="queue_600">Очередь 600 (Продажи)</option>
                  <option value="ext_102">Номер 102 (Иван)</option>
                  <option value="ivr_main">Главный IVR</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRouteModalOpen(false)}
                className="px-3 py-1.5 border hover:bg-slate-50 text-xs font-semibold rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleAddRoute}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD KNOWLEDGE */}
      {isKbModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Добавить источник в базу знаний</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Название источника *</label>
                <input
                  type="text"
                  value={newKbTitle}
                  onChange={(e) => setNewKbTitle(e.target.value)}
                  placeholder="Например: Частые вопросы по ценам и условиям"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Тип источника</label>
                <select
                  value={newKbType}
                  onChange={(e) => setNewKbType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                >
                  <option value="manual">Текст вручную (FAQ)</option>
                  <option value="pdf">Загрузить PDF (Документ)</option>
                  <option value="url">Парсинг URL веб-страницы</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Содержимое знаний</label>
                <textarea
                  value={newKbContent}
                  onChange={(e) => setNewKbContent(e.target.value)}
                  placeholder="Введите вопросы и ответы или текст, который должен знать робот..."
                  rows={4}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none leading-relaxed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsKbModalOpen(false)}
                className="px-3 py-1.5 border hover:bg-slate-50 text-xs font-semibold rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleAddKnowledge}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg"
              >
                Индексировать и сохранить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
