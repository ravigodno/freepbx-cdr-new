import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, Search, Trash2, Play, Check, Copy, Archive, Settings, 
  Layers, Clock, Activity, Edit3, X, ChevronRight, CornerDownRight, 
  HelpCircle, AlertCircle, Sparkles, User, ArrowRight, BarChart3, CheckSquare, ListPlus
} from 'lucide-react';
import { CallScript, CallScriptNode, CallScriptVersion, CallScriptRun, CallScriptAssignment } from '../types';

interface ScriptsTabProps {
  session: any;
  hasPermission: (perm: any) => boolean;
}

export default function ScriptsTab({ session, hasPermission }: ScriptsTabProps) {
  const [scripts, setScripts] = useState<CallScript[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'designer' | 'history' | 'analytics' | 'simulator'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Designer State
  const [editingScript, setEditingScript] = useState<CallScript | null>(null);
  const [designerNodes, setDesignerNodes] = useState<CallScriptNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [designerComment, setDesignerComment] = useState('');

  // History State
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);

  // Simulator State
  const [simulatingScript, setSimulatingScript] = useState<CallScript | null>(null);
  const [simulatingNodes, setSimulatingNodes] = useState<CallScriptNode[]>([]);
  const [simCurrentNode, setSimCurrentNode] = useState<CallScriptNode | null>(null);
  const [simHistory, setSimHistory] = useState<string[]>([]); // node IDs visited
  const [simAnswers, setSimAnswers] = useState<Record<string, string>>({}); // stepId -> value
  const [simChecklist, setSimChecklist] = useState<Record<string, Record<string, boolean>>>({}); // stepId -> checklist itemId -> boolean
  const [simRunId, setSimRunId] = useState<string | null>(null);
  const [simComment, setSimComment] = useState('');
  const [simFinished, setSimFinished] = useState(false);
  const [simResults, setSimResults] = useState<any | null>(null);

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newScriptData, setNewScriptData] = useState({
    title: '',
    description: '',
    type: 'universal' as 'inbound' | 'outbound' | 'internal' | 'universal',
    department: '',
    queue: '',
    didNumber: '',
    innerNumbers: '',
    isRequired: false,
    language: 'ru',
    tagsString: ''
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.token || localStorage.getItem('asterisk_cdr_token')}`
  };

  useEffect(() => {
    fetchScripts();
    fetchRuns();
  }, []);

  const fetchScripts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/call-scripts', { headers });
      if (res.ok) {
        const data = await res.json();
        setScripts(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/call-script-runs', { headers });
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScriptData.title.trim()) return;

    try {
      const res = await fetch('/api/call-scripts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...newScriptData,
          tags: newScriptData.tagsString.split(',').map(t => t.trim()).filter(Boolean)
        })
      });

      if (res.ok) {
        const created = await res.json();
        setIsCreateModalOpen(false);
        setNewScriptData({
          title: '',
          description: '',
          type: 'universal',
          department: '',
          queue: '',
          didNumber: '',
          innerNumbers: '',
          isRequired: false,
          language: 'ru',
          tagsString: ''
        });
        fetchScripts();
        // Open in designer directly
        loadScriptInDesigner(created);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadScriptInDesigner = async (script: CallScript) => {
    setEditingScript(script);
    setSelectedNodeId(null);
    setDesignerComment('');
    setActiveTab('designer');

    try {
      // Get versions of this script
      const res = await fetch(`/api/call-scripts/${script.id}/versions`, { headers });
      if (res.ok) {
        const versions: CallScriptVersion[] = await res.json();
        const active = versions.find(v => v.isActive) || versions[0];
        if (active) {
          try {
            const schema = JSON.parse(active.schemaJson);
            setDesignerNodes(schema.nodes || []);
            if (schema.nodes?.length) {
              setSelectedNodeId(schema.nodes[0].id);
            }
          } catch (err) {
            setDesignerNodes([]);
          }
        } else {
          setDesignerNodes([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveDesignerSchema = async () => {
    if (!editingScript) return;
    try {
      const res = await fetch(`/api/call-scripts/${editingScript.id}/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          schemaJson: JSON.stringify({ nodes: designerNodes }),
          comment: designerComment || `Обновление структуры`,
          makeActive: true
        })
      });

      if (res.ok) {
        alert('Версия скрипта успешно сохранена и активирована!');
        setDesignerComment('');
        fetchScripts();
      } else {
        const err = await res.json();
        alert(`Ошибка сохранения: ${err.error || 'Неизвестная ошибка'}`);
      }
    } catch (e: any) {
      alert(`Ошибка сети: ${e.message}`);
    }
  };

  const handleDuplicateScript = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Дублировать этот скрипт?')) return;
    try {
      const res = await fetch(`/api/call-scripts/${id}/duplicate`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        fetchScripts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchiveScript = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Вы уверены, что хотите заархивировать этот скрипт? Он будет скрыт из общего списка.')) return;
    try {
      const res = await fetch(`/api/call-scripts/${id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        fetchScripts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePublishScript = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/call-scripts/${id}/publish`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        fetchScripts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDesignerNodeChange = (updatedNode: CallScriptNode) => {
    setDesignerNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
  };

  const handleAddDesignerNode = () => {
    const newId = 'node_' + Date.now();
    const newNode: CallScriptNode = {
      id: newId,
      type: 'operator_text',
      title: `Новый шаг ${designerNodes.length + 1}`,
      text: 'Текст для оператора...',
      next: ''
    };
    setDesignerNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newId);
  };

  const handleDeleteDesignerNode = (nodeId: string) => {
    if (designerNodes.length <= 1) {
      alert('В скрипте должен быть как минимум один шаг');
      return;
    }
    if (confirm('Удалить этот шаг? Все ссылки на него станут пустыми.')) {
      setDesignerNodes(prev => prev.filter(n => n.id !== nodeId));
      if (selectedNodeId === nodeId) {
        const remaining = designerNodes.filter(n => n.id !== nodeId);
        setSelectedNodeId(remaining[0]?.id || null);
      }
    }
  };

  // --- SIMULATOR CONTROLS ---
  const startSimulation = async (script: CallScript) => {
    setSimulatingScript(script);
    setSimAnswers({});
    setSimChecklist({});
    setSimHistory([]);
    setSimFinished(false);
    setSimComment('');
    setSimResults(null);
    setActiveTab('simulator');

    try {
      const res = await fetch(`/api/call-scripts/${script.id}/versions`, { headers });
      if (res.ok) {
        const versions: CallScriptVersion[] = await res.json();
        const active = versions.find(v => v.isActive) || versions[0];
        if (active) {
          const schema = JSON.parse(active.schemaJson);
          const nodesList = schema.nodes || [];
          setSimulatingNodes(nodesList);
          
          // Start API session
          const runRes = await fetch('/api/call-script-runs/start', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              scriptId: script.id,
              operatorExtension: session?.extension || '101',
              operatorName: session?.username || 'Оператор',
              clientPhone: 'Симуляция'
            })
          });

          if (runRes.ok) {
            const runObj = await runRes.json();
            setSimRunId(runObj.id);
          }

          if (nodesList.length > 0) {
            setSimCurrentNode(nodesList[0]);
            setSimHistory([nodesList[0].id]);
          } else {
            setSimCurrentNode(null);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimOptionSelect = async (nextNodeId: string, optionLabel: string) => {
    if (!simCurrentNode || !simRunId) return;

    // Log step
    await fetch(`/api/call-script-runs/${simRunId}/step`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        stepId: simCurrentNode.id,
        stepTitle: simCurrentNode.title,
        stepType: simCurrentNode.type,
        selectedOption: optionLabel
      })
    });

    const nextNode = simulatingNodes.find(n => n.id === nextNodeId);
    if (nextNode) {
      setSimCurrentNode(nextNode);
      setSimHistory(prev => [...prev, nextNode.id]);
    } else {
      // No next node, or finished
      finishSimulation('success');
    }
  };

  const handleSimNextWithFields = async () => {
    if (!simCurrentNode || !simRunId) return;

    const answer = simAnswers[simCurrentNode.id] || '';
    
    // Log step with answer
    await fetch(`/api/call-script-runs/${simRunId}/step`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        stepId: simCurrentNode.id,
        stepTitle: simCurrentNode.title,
        stepType: simCurrentNode.type,
        answerValue: answer
      })
    });

    if (simCurrentNode.next) {
      const nextNode = simulatingNodes.find(n => n.id === simCurrentNode.next);
      if (nextNode) {
        setSimCurrentNode(nextNode);
        setSimHistory(prev => [...prev, nextNode.id]);
      } else {
        finishSimulation('success');
      }
    } else {
      finishSimulation('success');
    }
  };

  const finishSimulation = async (forcedResult?: string) => {
    if (!simRunId || !simCurrentNode) return;

    const finalResult = forcedResult || (simCurrentNode.type === 'finish' ? (simCurrentNode.resultType || 'success') : 'success');

    try {
      const res = await fetch(`/api/call-script-runs/${simRunId}/finish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: finalResult,
          comment: simComment,
          completed: true
        })
      });

      if (res.ok) {
        const finishedRun = await res.json();
        setSimResults(finishedRun);
        setSimFinished(true);
        fetchRuns();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBackInSim = () => {
    if (simHistory.length <= 1) return;
    const nextHistory = [...simHistory];
    nextHistory.pop(); // remove current
    const previousId = nextHistory[nextHistory.length - 1];
    const previousNode = simulatingNodes.find(n => n.id === previousId);
    if (previousNode) {
      setSimCurrentNode(previousNode);
      setSimHistory(nextHistory);
    }
  };

  // Filter scripts
  const filteredScripts = scripts.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (s.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType ? s.type === selectedType : true;
    const matchesStatus = selectedStatus ? s.status === selectedStatus : true;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate stats for analytics
  const completedRuns = runs.filter(r => r.finishedAt);
  const totalRunsCount = completedRuns.length;
  const successRunsCount = completedRuns.filter(r => r.result === 'success' || r.result === 'resolved').length;
  const refusalRunsCount = completedRuns.filter(r => r.result === 'refusal' || r.result === 'refuse').length;
  const callbackRunsCount = completedRuns.filter(r => r.result === 'callback').length;
  const avgDuration = totalRunsCount > 0 
    ? Math.round(completedRuns.reduce((acc, r) => acc + (r.durationSec || 0), 0) / totalRunsCount) 
    : 0;

  const conversionRate = totalRunsCount > 0 ? Math.round((successRunsCount / totalRunsCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-1" id="scripts_tab_root">
      {/* Tab bar header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-500" />
            Скрипты разговоров
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Интерактивные речевые сценарии, конструктор шагов, контроль прохождения и аналитика конверсии операторов.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'list' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            Все скрипты
          </button>
          <button
            onClick={() => {
              if (editingScript) setActiveTab('designer');
              else alert('Сначала выберите скрипт для редактирования в списке.');
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'designer' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Конструктор {editingScript && `(${editingScript.title.substring(0, 15)}...)`}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'history' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Лог использования
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'analytics' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Аналитика
          </button>
          {hasPermission('manage_scripts') && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/10 flex items-center gap-1.5 transition-all ml-2"
            >
              <Plus className="h-4 w-4" />
              Создать скрипт
            </button>
          )}
        </div>
      </div>

      {/* VIEW: ALL SCRIPTS LIST */}
      {activeTab === 'list' && (
        <div className="flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск скрипта по названию, описанию..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white placeholder-slate-400 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none"
              />
            </div>

            <div>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">Все типы звонков</option>
                <option value="inbound">Входящие звонки</option>
                <option value="outbound">Исходящие звонки</option>
                <option value="internal">Внутренние звонки</option>
                <option value="universal">Универсальные</option>
              </select>
            </div>

            <div>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">Все статусы</option>
                <option value="active">Активные</option>
                <option value="draft">Черновики</option>
              </select>
            </div>
          </div>

          {/* List Content */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Загрузка речевых сценариев...</p>
            </div>
          ) : filteredScripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center px-4">
              <FileText className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Скрипты не найдены</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Попробуйте изменить параметры фильтрации или создать новый скрипт с помощью кнопки сверху.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredScripts.map(script => {
                const isActive = script.status === 'active';
                const typeLabels: Record<string, string> = {
                  inbound: 'Входящие',
                  outbound: 'Исходящие',
                  internal: 'Внутренние',
                  universal: 'Универсальный'
                };
                return (
                  <div 
                    key={script.id}
                    className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2.5 rounded-lg shrink-0 ${
                            isActive 
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                              : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600'
                          }`}>
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {script.title}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                              {script.description || 'Без описания.'}
                            </p>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          isActive 
                            ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' 
                            : 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                        }`}>
                          {isActive ? 'Активен' : 'Черновик'}
                        </span>
                      </div>

                      {/* Meta information tags */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-4">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium">
                          Тип: {typeLabels[script.type] || script.type}
                        </span>
                        {script.queue && (
                          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/25 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium">
                            Очередь: {script.queue}
                          </span>
                        )}
                        {script.department && (
                          <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/25 text-purple-600 dark:text-purple-400 rounded text-[10px] font-medium">
                            Отдел: {script.department}
                          </span>
                        )}
                        {script.didNumber && (
                          <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-950/25 text-orange-600 dark:text-orange-400 rounded text-[10px] font-medium">
                            DID: {script.didNumber}
                          </span>
                        )}
                        {script.tags && script.tags.map((tag, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-slate-500 rounded text-[10px]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 mt-4 pt-4">
                      <div className="text-[10px] text-slate-400">
                        Версия {script.version || 1} • Создан {new Date(script.createdAt || '').toLocaleDateString('ru-RU')}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => startSimulation(script)}
                          title="Протестировать сценарий"
                          className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                        
                        {hasPermission('manage_scripts') && (
                          <>
                            <button
                              onClick={() => loadScriptInDesigner(script)}
                              title="Редактировать структуру шагов"
                              className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => handleDuplicateScript(script.id, e)}
                              title="Дублировать скрипт"
                              className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            {!isActive && (
                              <button
                                onClick={(e) => handlePublishScript(script.id, e)}
                                title="Активировать скрипт"
                                className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleArchiveScript(script.id, e)}
                              title="Архивировать"
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW: SCRIPT DESIGNER & STEP BUILDER */}
      {activeTab === 'designer' && editingScript && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="designer_layout">
          {/* Left panel: Steps List */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col h-[600px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Шаги сценария</h3>
                <p className="text-[10px] text-slate-500">{designerNodes.length} шагов определено</p>
              </div>
              <button
                onClick={handleAddDesignerNode}
                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Plus className="h-4 w-4" /> Добавить
              </button>
            </div>

            {/* List of nodes */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {designerNodes.map((node, index) => {
                const isSelected = selectedNodeId === node.id;
                const nodeTypeColors: Record<string, string> = {
                  operator_text: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700',
                  question: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700',
                  choice: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700',
                  objection: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700',
                  hint: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700',
                  checklist: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700',
                  input_field: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700',
                  finish: 'bg-slate-100 dark:bg-slate-800 text-slate-700'
                };
                
                const nodeTypeNames: Record<string, string> = {
                  operator_text: 'Текст',
                  question: 'Вопрос',
                  choice: 'Выбор',
                  objection: 'Возражение',
                  hint: 'Подсказка',
                  checklist: 'Чеклист',
                  input_field: 'Ввод',
                  finish: 'Конец'
                };

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/10' 
                        : 'border-slate-100 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 w-4">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{node.title || 'Без названия'}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`px-1 rounded text-[8px] font-bold ${nodeTypeColors[node.type] || 'bg-slate-100 text-slate-700'}`}>
                            {nodeTypeNames[node.type] || node.type}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">ID: {node.id}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDesignerNode(node.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom tools for saving version */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-3 flex flex-col gap-2">
              <input
                type="text"
                placeholder="Комментарий к версии..."
                value={designerComment}
                onChange={e => setDesignerComment(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white placeholder-slate-400 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={handleSaveDesignerSchema}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow shadow-blue-500/10 flex items-center justify-center gap-1.5 transition-all"
              >
                <Plus className="h-4 w-4" /> Сохранить и активировать версию
              </button>
            </div>
          </div>

          {/* Right panel: Step Details Form */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col h-[600px] overflow-y-auto">
            {selectedNodeId ? (() => {
              const node = designerNodes.find(n => n.id === selectedNodeId);
              if (!node) return null;

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-white">Параметры шага</h3>
                      <p className="text-xs text-slate-500">Настройка контента, связей и поведения блока</p>
                    </div>
                    <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                      ID: {node.id}
                    </span>
                  </div>

                  {/* Step Title & Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Название шага</label>
                      <input
                        type="text"
                        value={node.title}
                        onChange={e => handleDesignerNodeChange({ ...node, title: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Тип блока</label>
                      <select
                        value={node.type}
                        onChange={e => {
                          const type = e.target.value as any;
                          const updated: CallScriptNode = { ...node, type };
                          if (type === 'choice' && !updated.options) {
                            updated.options = [{ label: 'Вариант 1', next: '' }];
                          }
                          if (type === 'checklist' && !updated.checklistItems) {
                            updated.checklistItems = [{ id: 'item_1', text: 'Пункт чек-листа 1' }];
                          }
                          handleDesignerNodeChange(updated);
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                      >
                        <option value="operator_text">Текст оператора (простой показ)</option>
                        <option value="question">Вопрос клиенту (с ответом)</option>
                        <option value="choice">Варианты ответов (ветвление)</option>
                        <option value="objection">Работа с возражением</option>
                        <option value="hint">Подсказка оператору</option>
                        <option value="checklist">Чек-лист (обязательные пункты)</option>
                        <option value="input_field">Поле ввода анкеты (ФИО, Email, Телефон)</option>
                        <option value="finish">Завершение разговора (фиксация итога)</option>
                      </select>
                    </div>
                  </div>

                  {/* Main Text Content */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {node.type === 'hint' ? 'Текст подсказки' : 'Текст для чтения оператором'}
                      </label>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-blue-500" /> Поддерживает переменные: {"{operator_name}"}
                      </span>
                    </div>
                    <textarea
                      value={node.text || ''}
                      onChange={e => handleDesignerNodeChange({ ...node, text: e.target.value })}
                      rows={4}
                      placeholder="Введите речевой модуль или инструкции..."
                      className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none font-sans leading-relaxed"
                    />
                  </div>

                  {/* Conditional Fields based on Block Type */}
                  
                  {/* TYPE: CHOICE (Branching Options) */}
                  {node.type === 'choice' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Варианты ответов и переходы</h4>
                        <button
                          onClick={() => {
                            const options = [...(node.options || [])];
                            options.push({ label: `Вариант ${options.length + 1}`, next: '' });
                            handleDesignerNodeChange({ ...node, options });
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Добавить вариант
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(node.options || []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                            <input
                              type="text"
                              value={opt.label}
                              placeholder="Текст ответа клиента"
                              onChange={e => {
                                const options = [...(node.options || [])];
                                options[oIdx].label = e.target.value;
                                handleDesignerNodeChange({ ...node, options });
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                            />
                            
                            <span className="text-[10px] text-slate-400 font-mono">→</span>

                            <select
                              value={opt.next}
                              onChange={e => {
                                const options = [...(node.options || [])];
                                options[oIdx].next = e.target.value;
                                handleDesignerNodeChange({ ...node, options });
                              }}
                              className="w-48 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                            >
                              <option value="">Завершить скрипт</option>
                              {designerNodes.filter(n => n.id !== node.id).map(n => (
                                <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                              ))}
                            </select>

                            <button
                              onClick={() => {
                                const options = (node.options || []).filter((_, idx) => idx !== oIdx);
                                handleDesignerNodeChange({ ...node, options });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TYPE: OBJECTION */}
                  {node.type === 'objection' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 pb-1 border-b border-slate-100 dark:border-slate-800">Категория возражения</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Тип возражения</label>
                          <select
                            value={node.objectionType || 'expensive'}
                            onChange={e => handleDesignerNodeChange({ ...node, objectionType: e.target.value as any })}
                            className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                          >
                            <option value="expensive">Дорого / Нет бюджета</option>
                            <option value="think">Я подумаю / Обсудим позже</option>
                            <option value="has_provider">Уже есть поставщик / Работаем с другими</option>
                            <option value="not_interested">Неинтересно / Нет потребности</option>
                            <option value="no_time">Нет времени сейчас говорить</option>
                            <option value="send_info">Вышлите коммерческое предложение</option>
                            <option value="callback_later">Перезвоните через месяц</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Следующий шаг после работы с возражением</label>
                          <select
                            value={node.next || ''}
                            onChange={e => handleDesignerNodeChange({ ...node, next: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                          >
                            <option value="">Завершить скрипт</option>
                            {designerNodes.filter(n => n.id !== node.id).map(n => (
                              <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TYPE: CHECKLIST */}
                  {node.type === 'checklist' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Пункты чек-листа обязательного прохождения</h4>
                        <button
                          onClick={() => {
                            const checklistItems = [...(node.checklistItems || [])];
                            checklistItems.push({ id: 'item_' + Date.now(), text: `Пункт ${checklistItems.length + 1}` });
                            handleDesignerNodeChange({ ...node, checklistItems });
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Добавить пункт
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(node.checklistItems || []).map((item, iIdx) => (
                          <div key={item.id} className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                            <input
                              type="text"
                              value={item.text}
                              onChange={e => {
                                const checklistItems = [...(node.checklistItems || [])];
                                checklistItems[iIdx].text = e.target.value;
                                handleDesignerNodeChange({ ...node, checklistItems });
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                            />
                            <button
                              onClick={() => {
                                const checklistItems = (node.checklistItems || []).filter(itemObj => itemObj.id !== item.id);
                                handleDesignerNodeChange({ ...node, checklistItems });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2">
                        <label className="block text-[10px] text-slate-500 font-bold mb-1">Следующий шаг после чеклиста</label>
                        <select
                          value={node.next || ''}
                          onChange={e => handleDesignerNodeChange({ ...node, next: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                        >
                          <option value="">Завершить скрипт</option>
                          {designerNodes.filter(n => n.id !== node.id).map(n => (
                            <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* TYPE: INPUT_FIELD */}
                  {node.type === 'input_field' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 pb-1 border-b border-slate-100 dark:border-slate-800">Конфигурация сбора данных</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Название собираемого поля</label>
                          <input
                            type="text"
                            value={node.inputFieldName || ''}
                            placeholder="ФИО клиента, Название компании, Скидка и т.д."
                            onChange={e => handleDesignerNodeChange({ ...node, inputFieldName: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Обязательное поле для заполнения</label>
                          <div className="flex items-center h-8">
                            <input
                              type="checkbox"
                              checked={!!node.required}
                              onChange={e => handleDesignerNodeChange({ ...node, required: e.target.checked })}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                            />
                            <span className="ml-2 text-xs text-slate-600 dark:text-slate-300">Да, оператор обязан ввести ответ</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-1">
                        <label className="block text-[10px] text-slate-500 font-bold mb-1">Следующий шаг после ввода</label>
                        <select
                          value={node.next || ''}
                          onChange={e => handleDesignerNodeChange({ ...node, next: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                        >
                          <option value="">Завершить скрипт</option>
                          {designerNodes.filter(n => n.id !== node.id).map(n => (
                            <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* TYPE: FINISH (Termination Node) */}
                  {node.type === 'finish' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 pb-1 border-b border-slate-100 dark:border-slate-800">Результат и финальный статус</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Категория результата звонка</label>
                          <select
                            value={node.resultType || 'success'}
                            onChange={e => handleDesignerNodeChange({ ...node, resultType: e.target.value as any })}
                            className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none"
                          >
                            <option value="success">Успешная продажа / заказ</option>
                            <option value="consultation">Консультация предоставлена</option>
                            <option value="refusal">Отказ / Слив клиента</option>
                            <option value="callback">Назначен перезвон</option>
                            <option value="not_target">Нецелевой звонок / Спам</option>
                            <option value="wrong_number">Ошиблись номером</option>
                            <option value="resolved">Проблема успешно решена</option>
                            <option value="transfer">Перевод на старшего специалиста</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Обязательный комментарий оператора</label>
                          <div className="flex items-center h-8">
                            <input
                              type="checkbox"
                              checked={!!node.commentRequired}
                              onChange={e => handleDesignerNodeChange({ ...node, commentRequired: e.target.checked })}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                            />
                            <span className="ml-2 text-xs text-slate-600 dark:text-slate-300">Обязать ввести комментарий к итогу</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STANDARD LINKING FIELDS FOR SIMPLE BLOCKS */}
                  {['operator_text', 'question', 'hint'].includes(node.type) && (
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <label className="block text-[10px] text-slate-500 font-bold mb-1">Следующий шаг сценария</label>
                      <select
                        value={node.next || ''}
                        onChange={e => handleDesignerNodeChange({ ...node, next: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white outline-none font-sans"
                      >
                        <option value="">Завершить скрипт (Конец)</option>
                        {designerNodes.filter(n => n.id !== node.id).map(n => (
                          <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Layers className="h-10 w-10 text-slate-300 mb-2" />
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Выберите шаг сценария</h4>
                <p className="text-[10px] text-slate-400 max-w-xs mt-1">
                  Нажмите на любой шаг в левой панели для редактирования его полей, вариантов выбора и переходов.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: LOGS & HISTORY */}
      {activeTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="history_layout">
          {/* Runs table logs */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm h-[600px] flex flex-col">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">История прохождений скрипта</h3>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {runs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Clock className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-500">История пуста. Операторы еще не проходили скрипты звонков.</p>
                </div>
              ) : (
                runs.map(run => {
                  const isSelected = selectedRun?.id === run.id;
                  const resultBadgeColors: Record<string, string> = {
                    success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400',
                    resolved: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400',
                    refusal: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400',
                    refuse: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400',
                    callback: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400',
                    transfer: 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/20 dark:text-purple-400'
                  };

                  const resultNames: Record<string, string> = {
                    success: 'Успешно',
                    resolved: 'Решено',
                    refusal: 'Отказ',
                    callback: 'Перезвон',
                    transfer: 'Перевод',
                    consultation: 'Консультация'
                  };

                  return (
                    <div
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/10' 
                          : 'border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-800 dark:text-white truncate max-w-[200px]">
                          {run.scriptTitle}
                        </div>
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${resultBadgeColors[run.result] || 'bg-slate-100 text-slate-700'}`}>
                          {resultNames[run.result] || run.result}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-50 dark:border-slate-800/50 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {run.operatorName} ({run.operatorExtension})
                        </div>
                        <div className="text-right">
                          {new Date(run.startedAt).toLocaleString('ru-RU')}
                        </div>
                        <div>
                          Клиент: {run.clientPhone || 'Не указан'}
                        </div>
                        <div className="text-right">
                          Время: {run.durationSec ? `${run.durationSec} сек` : 'в процессе'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: Step-by-Step Path Audit */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm h-[600px] flex flex-col overflow-y-auto">
            {selectedRun ? (
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-xs font-bold uppercase text-slate-400">Детали прохождения</h3>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{selectedRun.scriptTitle}</h4>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Пошаговая трассировка (аудит пути):</div>
                  
                  <div className="relative border-l border-slate-200 dark:border-slate-800 pl-4 space-y-4 ml-2">
                    {selectedRun.steps && selectedRun.steps.map((step: any, idx: number) => (
                      <div key={step.id} className="relative">
                        <span className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 z-10"></span>
                        
                        <div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Шаг {idx + 1}: {step.stepTitle}
                          </div>
                          
                          {step.selectedOption && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Выбран ответ: <span className="font-semibold text-blue-600 dark:text-blue-400">"{step.selectedOption}"</span>
                            </div>
                          )}

                          {step.answerValue && (
                            <div className="text-[10px] text-slate-500 mt-0.5 bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                              Введенные данные: <span className="font-mono text-slate-800 dark:text-slate-300 font-semibold">{step.answerValue}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="relative">
                      <span className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 z-10"></span>
                      <div>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Финиш сценария
                        </div>
                        {selectedRun.comment && (
                          <div className="text-[10px] text-slate-500 mt-1 bg-slate-50 dark:bg-slate-950 p-2 rounded italic">
                            Комментарий: "{selectedRun.comment}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Clock className="h-10 w-10 text-slate-300 mb-2" />
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Выберите лог для просмотра деталей</h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Нажмите на любое прохождение в левой панели для отображения полного пошагового пути оператора с ответами и таймингами.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: ANALYTICS DASHBOARD */}
      {activeTab === 'analytics' && (
        <div className="space-y-6" id="analytics_dashboard">
          {/* Stats overview row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Всего прохождений</span>
              <div className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{totalRunsCount}</div>
              <p className="text-[10px] text-slate-400 mt-1">За все время использования</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Успешность (Конверсия)</span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{conversionRate}%</div>
              <p className="text-[10px] text-emerald-500 mt-1">Позитивные финалы разговора</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Средняя длительность</span>
              <div className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{avgDuration} сек</div>
              <p className="text-[10px] text-slate-400 mt-1">Прохождения от старта до конца</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Отказы / Сливы</span>
              <div className="text-2xl font-bold text-rose-600 mt-1">{refusalRunsCount}</div>
              <p className="text-[10px] text-rose-500 mt-1">{totalRunsCount > 0 ? Math.round((refusalRunsCount/totalRunsCount)*100) : 0}% от общего числа звонков</p>
            </div>
          </div>

          {/* Visual chart simulations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Статистика результатов звонков</h3>
              
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Успешная продажа / Решение (Success)</span>
                    <span>{successRunsCount} ({totalRunsCount > 0 ? Math.round((successRunsCount/totalRunsCount)*100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${totalRunsCount > 0 ? (successRunsCount/totalRunsCount)*100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Назначен перезвон (Callback)</span>
                    <span>{callbackRunsCount} ({totalRunsCount > 0 ? Math.round((callbackRunsCount/totalRunsCount)*100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${totalRunsCount > 0 ? (callbackRunsCount/totalRunsCount)*100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Отказ клиента / Слив (Refusal)</span>
                    <span>{refusalRunsCount} ({totalRunsCount > 0 ? Math.round((refusalRunsCount/totalRunsCount)*100) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full" style={{ width: `${totalRunsCount > 0 ? (refusalRunsCount/totalRunsCount)*100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Воронка конверсии шагов скрипта (Funnel Drop-offs)</h3>
              
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Шаг 1: Приветствие оператора (Вход в воронку)</span>
                    <span>100%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Шаг 2: Презентация / Выяснение потребностей</span>
                    <span>85%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: '85%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Шаг 3: Работа с возражениями</span>
                    <span>62%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: '62%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold text-slate-700 dark:text-slate-300">
                    <span>Шаг 4: Оформление заказа / Завершение сделки</span>
                    <span>{conversionRate}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${conversionRate}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: INTERACTIVE SIMULATOR (OPERATOR RUN PREVIEW) */}
      {activeTab === 'simulator' && simulatingScript && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm max-w-3xl mx-auto" id="simulator_container">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-5">
            <div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded">Режим симуляции</span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white mt-1.5">{simulatingScript.title}</h3>
            </div>
            
            <button
              onClick={() => {
                if (confirm('Выйти из симуляции? Результаты будут сохранены.')) {
                  finishSimulation('success');
                  setActiveTab('list');
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!simFinished && simCurrentNode ? (
            <div className="space-y-6">
              {/* CURRENT STEP SCREEN DISPLAY */}
              <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-inner">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-900">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                    ШАГ: {simCurrentNode.title}
                  </span>
                  <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                    {simCurrentNode.type}
                  </span>
                </div>

                <div className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed font-sans select-all border-l-4 border-blue-500 pl-4 py-1">
                  {simCurrentNode.text 
                    ? simCurrentNode.text.replace('{operator_name}', session?.username || 'Оператор').replace('{company_name}', 'Наша компания')
                    : 'Текст не заполнен.'
                  }
                </div>
              </div>

              {/* INPUT FIELDS / VALUE COLLECTOR */}
              {simCurrentNode.type === 'input_field' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500">{simCurrentNode.inputFieldName || 'Значение анкеты'}:</label>
                  <input
                    type="text"
                    value={simAnswers[simCurrentNode.id] || ''}
                    placeholder="Введите ответ клиента..."
                    onChange={e => {
                      const textVal = e.target.value;
                      setSimAnswers(prev => ({ ...prev, [simCurrentNode.id]: textVal }));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}

              {/* CHECKLIST ITEMS */}
              {simCurrentNode.type === 'checklist' && (
                <div className="space-y-2 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500 mb-2">Обязательно проговорите эти пункты:</p>
                  {(simCurrentNode.checklistItems || []).map(item => (
                    <label key={item.id} className="flex items-center gap-3 p-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={simChecklist[simCurrentNode.id]?.[item.id] || false}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSimChecklist(prev => ({
                            ...prev,
                            [simCurrentNode.id]: {
                              ...(prev[simCurrentNode.id] || {}),
                              [item.id]: checked
                            }
                          }));
                        }}
                        className="h-4 w-4 text-blue-600 border-slate-300 rounded"
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300">{item.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* TERMINATING COMMENTS FOR FINISH */}
              {simCurrentNode.type === 'finish' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500">Комментарий оператора по итогу разговора:</label>
                  <textarea
                    rows={3}
                    placeholder="Укажите важные детали сделки, договоренности..."
                    value={simComment}
                    onChange={e => setSimComment(e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}

              {/* ACTION BUTTONS (BRANCHING LINKS) */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-5">
                <button
                  onClick={handleBackInSim}
                  disabled={simHistory.length <= 1}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-all"
                >
                  Назад
                </button>

                <div className="flex items-center gap-2">
                  {simCurrentNode.type === 'choice' ? (
                    (simCurrentNode.options || []).map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSimOptionSelect(opt.next, opt.label)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
                      >
                        {opt.label}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ))
                  ) : simCurrentNode.type === 'finish' ? (
                    <button
                      onClick={() => finishSimulation()}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-lg shadow-emerald-500/10 flex items-center gap-1.5 transition-all"
                    >
                      <Check className="h-4 w-4" />
                      Завершить прохождение
                    </button>
                  ) : (
                    <button
                      onClick={handleSimNextWithFields}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-1.5 transition-all"
                    >
                      Продолжить
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800 dark:text-white">Скрипт успешно завершен!</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Данные прохождения зафиксированы в логах аудита. Вы можете ознакомиться с результатами ниже.
                </p>
              </div>

              {simResults && (
                <div className="max-w-md mx-auto bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Результат:</span>
                    <span className="font-bold text-emerald-600 uppercase">{simResults.result}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Длительность:</span>
                    <span className="font-semibold">{simResults.durationSec || 0} секунд</span>
                  </div>
                  {simResults.comment && (
                    <div className="pt-2 border-t border-slate-200/50 mt-1">
                      <span className="text-slate-500 block mb-0.5">Комментарий:</span>
                      <p className="italic text-slate-700 dark:text-slate-300">"{simResults.comment}"</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setActiveTab('list')}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all"
              >
                Вернуться к списку
              </button>
            </div>
          )}
        </div>
      )}

      {/* CREATE SCRIPT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Создание нового речевого сценария</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateScript} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Название скрипта</label>
                <input
                  type="text"
                  required
                  value={newScriptData.title}
                  onChange={e => setNewScriptData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Например: Входящий звонок отдела продаж"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Описание / Цель скрипта</label>
                <textarea
                  value={newScriptData.description}
                  onChange={e => setNewScriptData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Например: Первичное выявление потребностей при входящем запросе..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Тип звонков</label>
                  <select
                    value={newScriptData.type}
                    onChange={e => setNewScriptData(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="universal">Универсальный</option>
                    <option value="inbound">Входящий звонок</option>
                    <option value="outbound">Исходящий звонок</option>
                    <option value="internal">Внутренний звонок</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Очередь (Queue)</label>
                  <input
                    type="text"
                    value={newScriptData.queue}
                    onChange={e => setNewScriptData(prev => ({ ...prev, queue: e.target.value }))}
                    placeholder="Например: 100"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Отдел (Department)</label>
                  <input
                    type="text"
                    value={newScriptData.department}
                    onChange={e => setNewScriptData(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="Например: Sales"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">DID Номер</label>
                  <input
                    type="text"
                    value={newScriptData.didNumber}
                    onChange={e => setNewScriptData(prev => ({ ...prev, didNumber: e.target.value }))}
                    placeholder="Например: +74950000000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Теги (через запятую)</label>
                <input
                  type="text"
                  value={newScriptData.tagsString}
                  onChange={e => setNewScriptData(prev => ({ ...prev, tagsString: e.target.value }))}
                  placeholder="продажи, поддержка, входящий"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isRequired"
                  checked={newScriptData.isRequired}
                  onChange={e => setNewScriptData(prev => ({ ...prev, isRequired: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                />
                <label htmlFor="isRequired" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  Обязателен к прохождению оператором при входящем вызове
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow shadow-blue-500/10 transition-all"
                >
                  Создать и перейти к шагам
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
