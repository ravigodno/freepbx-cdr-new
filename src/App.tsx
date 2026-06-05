import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneCall,
  Settings,
  Play,
  Pause,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Search,
  MessageSquare,
  Filter,
  Clock,
  Volume2,
  Download,
  User,
  LogOut,
  RefreshCw,
  Database,
  FastForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Check,
  UserCheck,
  UserPlus,
  Sliders,
  Upload,
  Globe,
  Network
} from 'lucide-react';
import { CallEntry, DashboardStats, AppSettings, UserRole, DirectoryEntry } from './types';

// Front-end state structures
interface UserSession {
  token: string;
  username: string;
  role: UserRole;
}

export default function App() {
  // Authentication states
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('asterisk_cdr_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return null;
  });
  
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Calls list and filtration states
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);

  // Filter bindings
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('ALL'); // Default focus on full log
  const [searchQuery, setSearchQuery] = useState('');
  const [numberFilter, setNumberFilter] = useState('');

  // Dashboard Stats
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Audio Player states
  const [playingRecording, setPlayingRecording] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0.8);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isAudioPaused, setIsAudioPaused] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Call Process Sidebar / Dialog state
  const [selectedCall, setSelectedCall] = useState<CallEntry | null>(null);
  const [isSavingProcess, setIsSavingProcess] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isProcessedInput, setIsProcessedInput] = useState(true);

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<AppSettings | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDemoClearing, setIsDemoClearing] = useState(false);
  const [isDemoGenerating, setIsDemoGenerating] = useState(false);
  const [demoStatusResult, setDemoStatusResult] = useState<{ success: boolean; message: string } | null>(null);
  const [callsError, setCallsError] = useState<string | null>(null);

  // Global demo indicator (comes from environment config in the server)
  const isDemoModeActive = false;

  // Auto reload timer
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // in seconds
  const [timeToNextRefresh, setTimeToNextRefresh] = useState<number>(30);

  // --- TELEPHONE DIRECTORY STATE & HANDLERS ---
  const [activeView, setActiveView] = useState<'calls' | 'directory'>('calls');
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [isDirFormOpen, setIsDirFormOpen] = useState(false);
  const [editingDirEntry, setEditingDirEntry] = useState<DirectoryEntry | null>(null);
  const [dirName, setDirName] = useState('');
  const [dirNumber, setDirNumber] = useState('');
  const [dirType, setDirType] = useState<'internal' | 'client'>('internal');
  const [dirComment, setDirComment] = useState('');
  const [dirError, setDirError] = useState('');
  const [isSavingDir, setIsSavingDir] = useState(false);
  const [dirSearchQuery, setDirSearchQuery] = useState('');
  const [dirTypeFilter, setDirTypeFilter] = useState<'all' | 'internal' | 'client'>('all');

  // --- ADMIN DIRECTORY IMPORT / EXPORT & NORMALIZATION STATE ---
  const [isAdminPanelExpanded, setIsAdminPanelExpanded] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFileError, setImportFileError] = useState('');
  const [parsedImportEntries, setParsedImportEntries] = useState<any[]>([]);
  const [importOverwriteMode, setImportOverwriteMode] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [isNormalizingDb, setIsNormalizingDb] = useState(false);
  const [normalizedCount, setNormalizedCount] = useState<number | null>(null);

  // Simple CSV / Text Parser
  const handleParseImport = (text: string) => {
    if (!text.trim()) {
      setParsedImportEntries([]);
      setImportFileError('');
      return;
    }
    try {
      const lines = text.split(/\r?\n/);
      const parsed: any[] = [];
      let errCount = 0;

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return; // skip empty lines

        // Split by semicolon, comma or tab
        let parts: string[] = [];
        if (trimmed.includes(';')) {
          parts = trimmed.split(';');
        } else if (trimmed.includes('\t')) {
          parts = trimmed.split('\t');
        } else {
          parts = trimmed.split(',');
        }

        // Clean parts
        const cleanParts = parts.map(p => {
          let s = p.trim();
          // Remove enclosing quotes
          if (s.startsWith('"') && s.endsWith('"')) {
            s = s.substring(1, s.length - 1);
          }
          return s;
        });

        if (cleanParts.length >= 2) {
          // If headers like "имя", "телефон", "номер", skip first line
          const firstCol = cleanParts[0].toLowerCase();
          const secondCol = cleanParts[1].toLowerCase();
          if (index === 0 && (firstCol.includes('имя') || firstCol.includes('name') || secondCol.includes('номер') || secondCol.includes('phone') || secondCol.includes('телефон'))) {
            return;
          }

          let type: 'internal' | 'client' = 'client';
          const typeStr = cleanParts[2]?.toLowerCase() || '';
          if (typeStr.includes('internal') || typeStr.includes('внутр') || cleanParts[1].length <= 4) {
            type = 'internal';
          }

          parsed.push({
            name: cleanParts[0],
            number: cleanParts[1],
            type: type,
            comment: cleanParts[3] || 'Импорт'
          });
        } else {
          errCount++;
        }
      });

      setParsedImportEntries(parsed);
      if (parsed.length === 0) {
        setImportFileError('Не удалось прочесть корректные записи.');
      } else {
        setImportFileError(errCount > 0 ? `Пропущено ${errCount} строк из-за неверного формата.` : '');
      }
    } catch (e: any) {
      setImportFileError('Ошибка парсинга: ' + e.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportText(text);
      handleParseImport(text);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDownloadTemplate = () => {
    try {
      const BOM = "\uFEFF"; // Enable Excel to read Cyrillic names naturally
      let csvContent = BOM + "Имя,Телефон,Тип,Комментарий\r\n";
      csvContent += `"Иванов Иван","79991234567","client","Основной контакт клиена"\r\n`;
      csvContent += `"Техподдержка","103","internal","Внутренний номер отдела"\r\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "shablon_importa_kontaktov.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      alert('Ошибка при скачивании шаблона: ' + e.message);
    }
  };

  const handleExportCSV = () => {
    try {
      const BOM = "\uFEFF"; // Enable Excel to read Cyrillic names naturally
      let csvContent = BOM + "Имя,Телефон,Тип,Комментарий\r\n";
      
      directory.forEach(entry => {
        const cleanName = entry.name.replace(/"/g, '""');
        const cleanNumber = entry.number.replace(/"/g, '""');
        const cleanType = entry.type === 'internal' ? 'internal' : 'client';
        const cleanComment = (entry.comment || '').replace(/"/g, '""');
        csvContent += `"${cleanName}","${cleanNumber}","${cleanType}","${cleanComment}"\r\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `phone_directory_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      alert('Ошибка при экспорте: ' + e.message);
    }
  };

  const handleNormalizeDirectoryDb = async () => {
    if (!window.confirm('Запустить нормализацию всех номеров в справочнике согласно текущим настройкам?')) {
      return;
    }
    setIsNormalizingDb(true);
    setNormalizedCount(null);
    try {
      const resp = await fetch('/api/directory/normalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.token}`
        }
      });
      const data = await resp.json();
      if (resp.ok) {
        setNormalizedCount(data.updatedCount);
        await loadDirectory();
        loadCalls(page);
        setTimeout(() => setNormalizedCount(null), 10000); // clear banner after 10s
      } else {
        alert(data.error || 'Ошибка во время нормализации.');
      }
    } catch (e: any) {
      alert('Сбой связи с сервером.');
    } finally {
      setIsNormalizingDb(false);
    }
  };

  const handleExecuteImport = async () => {
    if (parsedImportEntries.length === 0) return;
    setIsImporting(true);
    try {
      const resp = await fetch('/api/directory/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.token}`
        },
        body: JSON.stringify({
          entries: parsedImportEntries,
          overwrite: importOverwriteMode
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        setImportSuccessCount(data.count);
        setImportText('');
        setParsedImportEntries([]);
        await loadDirectory();
        loadCalls(page);
        setTimeout(() => {
          setImportSuccessCount(null);
          setIsImportOpen(false);
        }, 3000);
      } else {
        setImportFileError(data.error || 'Ошибка при импортировании.');
      }
    } catch (e: any) {
      setImportFileError('Не удалось установить соединение с сервером.');
    } finally {
      setIsImporting(false);
    }
  };

  // --- CLICK-TO-CALL USER EXTENSION & LOG DIALOG ---
  const [onlyMyCalls, setOnlyMyCalls] = useState(false);
  const [myExt, setMyExt] = useState(() => {
    return localStorage.getItem('operator_asterisk_ext') || '101';
  });
  const [isCallingModalOpen, setIsCallingModalOpen] = useState(false);
  const [callingLog, setCallingLog] = useState<string[]>([]);
  const [callingTarget, setCallingTarget] = useState('');
  const [isC2CLoading, setIsC2CLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('operator_asterisk_ext', myExt);
  }, [myExt]);

  const triggerClickToCall = async (targetPhone: string, targetName?: string) => {
    if (!myExt.trim()) {
      alert('Пожалуйста, укажите ваш рабочий внутренний номер перед совершением звонка.');
      return;
    }
    
    // Clean targetPhone - keep only digits and plus
    const cleaned = targetPhone.replace(/[^\d+]/g, '');
    if (!cleaned) {
      alert('Невозможно позвонить на этот номер: неверный формат.');
      return;
    }
    
    setCallingTarget(targetName ? `${targetName} (${cleaned})` : cleaned);
    setCallingLog([
      `[Система] Формирование вызова...`,
      `[Система] Источник звонка (Ваш Ext): ${myExt}`,
      `[Система] Назначение связи: ${cleaned}`,
      `[Система] Отправка запроса на Asterisk AMI сервер...`
    ]);
    setIsCallingModalOpen(true);
    setIsC2CLoading(true);
    
    try {
      const resp = await fetch('/api/click-to-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.token}`
        },
        body: JSON.stringify({
          fromExtension: myExt.trim(),
          toPhoneNumber: cleaned
        })
      });
      
      const data = await resp.json();
      if (resp.ok && data.success) {
        if (data.log && Array.isArray(data.log)) {
          setCallingLog(prev => [...prev, ...data.log, `[Система] Успешно! Звонок поставлен в очередь Originate.`]);
        } else {
          setCallingLog(prev => [...prev, `[Система] Вызов успешно инициирован.`]);
        }
      } else {
        const errorMsg = data.error || 'Неизвестная ошибка на Asterisk AMI сервере';
        if (data.log && Array.isArray(data.log)) {
          setCallingLog(prev => [...prev, ...data.log, `[Система] Ошибка: ${errorMsg}`]);
        } else {
          setCallingLog(prev => [...prev, `[Система] Ошибка: ${errorMsg}`]);
        }
      }
    } catch (err) {
      setCallingLog(prev => [...prev, `[Система] Ошибка сети: не удалось подключиться к серверу.`]);
    } finally {
      setIsC2CLoading(false);
    }
  };

  const loadDirectory = async () => {
    if (!session) return;
    setIsLoadingDirectory(true);
    try {
      const resp = await fetch('/api/directory', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        setDirectory(data);
      }
    } catch (e) {
      console.error('Error loading directory:', e);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  const handleSaveDirEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirName.trim() || !dirNumber.trim()) {
      setDirError('Пожалуйста, заполните поля Имя и Номер.');
      return;
    }
    setDirError('');
    setIsSavingDir(true);

    try {
      const url = editingDirEntry 
        ? `/api/directory/${editingDirEntry.id}`
        : '/api/directory';
      const method = editingDirEntry ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.token}`
        },
        body: JSON.stringify({
          name: dirName,
          number: dirNumber,
          type: dirType,
          comment: dirComment
        })
      });

      const data = await resp.json();
      if (resp.ok) {
        // Refresh contacts locally
        await loadDirectory();
        // Update calls lists since resolved names changed!
        loadCalls(page);
        setIsDirFormOpen(false);
        setEditingDirEntry(null);
        setDirName('');
        setDirNumber('');
        setDirType('internal');
        setDirComment('');
      } else {
        setDirError(data.error || 'Ошибка при сохранении записи.');
      }
    } catch (err) {
      setDirError('Не удалось соединиться с сервером.');
    } finally {
      setIsSavingDir(false);
    }
  };

  const handleDeleteDirEntry = async (id: string) => {
    if (!window.confirm('Вы действительно хотите удалить эту запись из справочника?')) {
      return;
    }
    try {
      const resp = await fetch(`/api/directory/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.token}`
        }
      });
      if (resp.ok) {
        await loadDirectory();
        loadCalls(page);
      } else {
        alert('Не удалось удалить запись из справочника.');
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка при соединении с сервером.');
    }
  };

  const openEditDirEntry = (entry: DirectoryEntry) => {
    setEditingDirEntry(entry);
    setDirName(entry.name);
    setDirNumber(entry.number);
    setDirType(entry.type);
    setDirComment(entry.comment || '');
    setDirError('');
    setIsDirFormOpen(true);
  };

  const openCreateDirEntry = () => {
    setEditingDirEntry(null);
    setDirName('');
    setDirNumber('');
    setDirType('internal');
    setDirComment('');
    setDirError('');
    setIsDirFormOpen(true);
  };

  const openAddFromCall = (number: string, initialName?: string) => {
    setEditingDirEntry(null);
    setDirName(initialName || '');
    setDirNumber(number);
    setDirType('client');
    setDirComment('Добавлен из реестра звонков');
    setDirError('');
    setIsDirFormOpen(true);
  };

  // Fetch Dashboard Stats
  const loadStats = async () => {
    if (!session) return;
    setIsLoadingStats(true);
    try {
      const qParams = new URLSearchParams({
        demo: isDemoModeActive ? 'true' : 'false',
        startDate,
        endDate,
        status: statusFilter,
        search: searchQuery,
        number: numberFilter,
        operatorExt: myExt,
        onlyMyCalls: onlyMyCalls ? 'true' : 'false'
      });
      const resp = await fetch(`/api/stats?${qParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Error fetching dashboard statistics:', e);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch CDR Calls List
  const loadCalls = async (targetPage: number = page) => {
    if (!session) return;
    setIsLoadingCalls(true);
    try {
      const qParams = new URLSearchParams({
        page: targetPage.toString(),
        limit: limit.toString(),
        startDate,
        endDate,
        status: statusFilter,
        search: searchQuery,
        number: numberFilter,
        demo: isDemoModeActive ? 'true' : 'false',
        operatorExt: myExt,
        onlyMyCalls: onlyMyCalls ? 'true' : 'false'
      });

      const resp = await fetch(`/api/calls?${qParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        setCalls(data.calls);
        setTotalCalls(data.total);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
        setCallsError(null);
      } else {
        const errorData = await resp.json();
        console.error('Error parsing CDR call logs:', errorData.error);
        setCallsError(errorData.error || 'Не удалось загрузить реестр вызовов');
      }
    } catch (e: any) {
      console.error('Network failure loading records:', e);
      setCallsError(e.message || 'Сбой сети при загрузке реестра вызовов');
    } finally {
      setIsLoadingCalls(false);
    }
  };

  // Trigger combined data reload
  const reloadData = (targetPage: number = page) => {
    loadCalls(targetPage);
    loadStats();
    loadDirectory();
    setTimeToNextRefresh(autoRefreshInterval);
  };

  // Authentication: Login routine
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Введите имя пользователя и пароль');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });

      const data = await resp.json();

      if (resp.ok && data.token) {
        const nextSession: UserSession = {
          token: data.token,
          username: data.user.username,
          role: data.user.role
        };
        setSession(nextSession);
        localStorage.setItem('asterisk_cdr_session', JSON.stringify(nextSession));
      } else {
        setLoginError(data.error || 'Ошибка входа в систему.');
      }
    } catch (err) {
      setLoginError('Не удалось подключиться к серверу авторизации.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Authentication: Logout
  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('asterisk_cdr_session');
    // Clear audio states
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingRecording(null);
    setPlayingCallId(null);
  };

  // Process / Comment Missed Call
  const handleProcessMissedCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCall || !session) return;

    setIsSavingProcess(true);
    try {
      const resp = await fetch(`/api/calls/${selectedCall.uniqueid}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          comment: commentInput,
          processed: isProcessedInput,
          src: selectedCall.src,
          calldate: selectedCall.calldate
        })
      });

      if (resp.ok) {
        // Optimistically update list or fully reload
        setSelectedCall(null);
        reloadData();
      } else {
        alert('Не удалось записать статус звонка в базу данных.');
      }
    } catch (e) {
      alert('Сбой сетевой отправки статуса вызова.');
    } finally {
      setIsSavingProcess(false);
    }
  };

  // Admin Settings Loader
  const loadAdminSettings = async () => {
    if (!session || session.role !== 'admin') return;
    try {
      const resp = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        setSettings(data);
        setDraftSettings(JSON.parse(JSON.stringify(data)));
      }
    } catch (e) {
      console.error('Error fetching admin system configurations:', e);
    }
  };

  // Admin Settings Submitter
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftSettings || !session || session.role !== 'admin') return;

    setIsSavingSettings(true);
    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(draftSettings)
      });

      if (resp.ok) {
        setIsSettingsOpen(false);
        setDbTestResult(null);
        setSettings(draftSettings);
        alert('Настройки успешно применены! Сервис перезагрузит список CDR.');
        reloadData();
      } else {
        alert('Ошибка при сохранении конфигурационного файла.');
      }
    } catch (e) {
      alert('Произошла ошибка сетевого соединения.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const clearDemoData = async () => {
    if (!session) return;
    setIsDemoClearing(true);
    setDemoStatusResult(null);
    try {
      const resp = await fetch('/api/demo/clear', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      if (resp.ok) {
        setDemoStatusResult({ success: true, message: 'Демонстрационные звонки успешно удалены из памяти!' });
        loadCalls(1);
      } else {
        setDemoStatusResult({ success: false, message: 'Не удалось удалить демо-данные.' });
      }
    } catch (err: any) {
      setDemoStatusResult({ success: false, message: `Ошибка: ${err.message}` });
    } finally {
      setIsDemoClearing(false);
    }
  };

  const generateDemoData = async () => {
    if (!session) return;
    setIsDemoGenerating(true);
    setDemoStatusResult(null);
    try {
      const resp = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      if (resp.ok) {
        setDemoStatusResult({ success: true, message: 'Демонстрационные звонки успешно сгенерированы заново!' });
        loadCalls(1);
      } else {
        setDemoStatusResult({ success: false, message: 'Не удалось сгенерировать демо-данные.' });
      }
    } catch (err: any) {
      setDemoStatusResult({ success: false, message: `Ошибка: ${err.message}` });
    } finally {
      setIsDemoGenerating(false);
    }
  };

  // Connection Test routine
  const testDbConnection = async () => {
    if (!draftSettings || !session) return;
    setIsTestingDb(true);
    setDbTestResult(null);
    
    try {
      // Simulate connection checking API call on Express
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(draftSettings)
      });
      
      if (resp.ok) {
        setDbTestResult({
          success: true,
          message: 'Подключение установлено успешно! MariaDB asteriskcdrdb доступна на чтение.'
        });
      } else {
        setDbTestResult({
          success: false,
          message: 'Не удалось проверить подключение к базе данных. Проверьте хост и доступы.'
        });
      }
    } catch (err: any) {
      setDbTestResult({
        success: false,
        message: `Ошибка сокета: ${err.message || 'сервер недоступен'}`
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  // Launch Recording playback stream
  const playRecording = (call: CallEntry) => {
    if (!session || !call.recordingfile) return;

    setAudioError(null);
    
    if (playingCallId === call.uniqueid) {
      // Handle Toggle Play / Pause
      if (audioRef.current) {
        if (isAudioPaused) {
          audioRef.current.play().catch(e => setAudioError(e.message));
          setIsAudioPaused(false);
        } else {
          audioRef.current.pause();
          setIsAudioPaused(true);
        }
      }
      return;
    }

    setPlayingCallId(call.uniqueid);
    setPlayingRecording(call.recordingfile);
    setIsAudioPaused(false);
    
    // Mount custom source stream
    const audioUrl = `/api/recordings/${encodeURIComponent(call.recordingfile)}`;
    
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.volume = audioVolume;
      audioRef.current.play().catch(err => {
        setAudioError('Не удалось запустить воспроизведение. Возможно файл записи отсутствует или поврежден.');
        setIsAudioPaused(true);
      });
    }
  };

  // Hook-up tracking for Audio HTML5 triggers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setAudioProgress(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration || 0);
    };

    const onEnded = () => {
      setIsAudioPaused(true);
      setAudioProgress(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Sync volume & speed change directly onto audio ref
  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setAudioVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackSpeed(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAudioProgress(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  // Trigger main loads on mount or settings pivot
  useEffect(() => {
    if (session) {
      reloadData(1);
      loadDirectory();
    }
  }, [session, startDate, endDate, statusFilter, isDemoModeActive, onlyMyCalls, myExt]);

  // Handle delay on searching to prevent overwhelming SQL DB
  useEffect(() => {
    if (!session) return;
    const delayDebounceFn = setTimeout(() => {
      reloadData(1);
    }, 550);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, numberFilter]);

  // Auto-refresh interval loops
  useEffect(() => {
    if (!session) return;
    
    const interval = setInterval(() => {
      setTimeToNextRefresh((prev) => {
        if (prev <= 1) {
          loadCalls(page);
          loadStats();
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session, page, autoRefreshInterval, startDate, endDate, statusFilter, isDemoModeActive]);

  // Open Comment Sidebar
  const openProcessModal = (call: CallEntry) => {
    setSelectedCall(call);
    setCommentInput(call.comment || '');
    setIsProcessedInput(call.processed !== undefined ? call.processed : true);
  };

  // Helper template fillers
  const applyPresetComment = (text: string) => {
    setCommentInput(text);
    setIsProcessedInput(true);
  };

  // Format Helper for Duration Displays
  const formatSeconds = (sec: number) => {
    if (!sec) return '00:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Clean Clid name display helper
  const renderClidName = (clid: string, fallbackPhone: string) => {
    if (!clid) return fallbackPhone;
    const match = clid.match(/"([^"]+)"/);
    if (match) return match[1];
    return clid.split('<')[0].trim() || fallbackPhone;
  };

  // Check if string holds a short numeric internal extension
  const isInternalExt = (num: string) => {
    if (!num) return false;
    const digits = num.replace(/\D/g, '');
    return digits.length > 0 && digits.length <= 5 && /^\d+$/.test(num.trim());
  };

  // Helper to extract clean trunk names from SIP channel configurations
  const getTrunkName = (channelStr: string) => {
    if (!channelStr) return '';
    let clean = channelStr.includes('/') ? channelStr.split('/')[1] : channelStr;
    const lastDashIndex = clean.lastIndexOf('-');
    if (lastDashIndex !== -1) {
      const suffix = clean.substring(lastDashIndex + 1);
      if (/^[0-9a-fA-F]{3,}$/.test(suffix) || /^\d+$/.test(suffix)) {
        clean = clean.substring(0, lastDashIndex);
      }
    }
    return clean;
  };

  // Date bounds presets
  const applyPeriodPreset = (daysAgo: number) => {
    const start = new Date();
    start.setDate(start.getDate() - daysAgo);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setPage(1);
  };

  const applyThisMonthPreset = () => {
    const start = new Date();
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    setStartDate(`${year}-${month}-01`);
    setEndDate(new Date().toISOString().split('T')[0]);
    setPage(1);
  };

  if (!session) {
    return (
      <div id="login-container" className="min-h-screen flex items-center justify-center bg-slate-100 p-4 relative overflow-hidden">
        {/* Animated ambient background vectors */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(241,245,249,0.95),rgba(226,232,240,1))] z-0" />
        
        <div className="relative w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-8 shadow-xl z-10">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-red-50 text-red-600 p-3 rounded-full mb-3 border border-red-100 shadow-sm">
              <PhoneMissed className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 text-center tracking-tight font-sans">FreePBX CDR Missed Calls</h1>
            <p className="text-slate-500 text-xs mt-1 text-center font-light">
              Система мониторинга и отработки неотвеченных вызовов VoIP
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1.5">Имя пользователя</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Например, admin..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2.5 px-3.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1.5">Пароль входа</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2.5 px-3.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 active:transform active:scale-[0.99] text-white py-2.5 rounded-lg text-sm font-semibold tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Авторизация...</span>
                </>
              ) : (
                <span>Войти в консоль</span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-slate-200 text-center">
            <span className="text-[10px] text-slate-400 tracking-wider font-mono">
              РАЗРАБОТАНО ДЛЯ INTERNAL LOCAL NETWORKS
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Hidden HTML-5 Audio Node references */}
      <audio ref={audioRef} className="hidden" />

      {/* Top clean unified navigation header */}
      <header className="bg-white border-b border-slate-200 shadow-xs relative z-20 shrink-0 select-none sticky top-0">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 w-full xl:w-auto">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-red-650 to-rose-700 p-2 rounded-xl text-white shadow-md shadow-red-500/10">
                <PhoneMissed className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2 font-sans">
                  Freepbx CDR-NEW
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-normal px-2 py-0.5 rounded-md border border-slate-200">
                    CDR v1.0
                  </span>
                </h1>
                <p className="text-slate-500 text-xs font-light">
                  Интеграционный шлюз Asterisk & FreePBX
                </p>
              </div>
            </div>

            {/* Navigation Tabs aligned horizontally in Header */}
            <div className="flex gap-2 sm:border-l sm:border-slate-200 sm:pl-6 h-10 items-center">
              <button
                onClick={() => setActiveView('calls')}
                className={`h-full px-3.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg active:scale-95 cursor-pointer select-none ${
                  activeView === 'calls'
                    ? 'bg-red-50 text-red-750'
                    : 'text-slate-550 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                Реестр звонков
              </button>
              <button
                onClick={() => {
                  setActiveView('directory');
                  loadDirectory();
                }}
                className={`h-full px-3.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg active:scale-95 cursor-pointer select-none ${
                  activeView === 'directory'
                    ? 'bg-red-50 text-red-750'
                    : 'text-slate-550 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Телефонный справочник
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-end">
            {/* C2C User work extension input (SIP) next to Demo trigger */}
            <div className="flex flex-wrap items-center gap-3.5 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 shadow-xs">
              <div className="flex items-center gap-2 md:border-r md:border-slate-200 md:pr-2.5">
                <span className="text-[10px] font-bold text-slate-550 uppercase tracking-wider flex items-center gap-1 select-none">
                  <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                  Мой SIP:
                </span>
                <input
                  type="text"
                  value={myExt}
                  onChange={(e) => setMyExt(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="101"
                  maxLength={6}
                  className="w-12 bg-white border border-slate-250 rounded py-0.5 px-1.5 text-xs text-slate-900 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-center"
                  title="Введите ваш внутренний добавочный номер. С этого телефона Asterisk начнет дозвон."
                />
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyMyCalls}
                  onChange={(e) => {
                    setOnlyMyCalls(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-slate-300 text-red-650 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-700">Мои звонки</span>
              </label>
            </div>

            {/* Config & Profile actions */}
            <div className="h-8 w-[1px] bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="text-right hidden md:block">
                <div className="text-xs font-semibold text-slate-800">{session.username}</div>
                <div className="text-[10px] text-red-650 font-medium uppercase tracking-wider">{session.role}</div>
              </div>
              
              {session.role === 'admin' && (
                <button
                  onClick={() => {
                    loadAdminSettings();
                    setIsSettingsOpen(true);
                  }}
                  className="p-2 text-slate-500 hover:text-slate-950 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                  title="Настройки подключения FreePBX"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}

              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-red-650 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                title="Выйти"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main UI body section */}
      <main className="flex-1 overflow-y-auto max-w-[1800px] w-full mx-auto p-4 space-y-4">
        {activeView === 'calls' ? (
          <>
            {/* KPI Dashboard cards section */}
            <section id="kpi-dashboard" className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Входящие */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                <span className="text-xs text-slate-500 font-medium tracking-wide">Входящие</span>
                <div className="mt-2 flex items-baseline justify-between">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-cyan-600 font-mono">{stats?.inboundCalls ?? 0}</span>
                  )}
                  <PhoneIncoming className="h-5 w-5 text-cyan-500 self-center" />
                </div>
              </div>

              {/* Исходящие */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                <span className="text-xs text-slate-500 font-medium tracking-wide">Исходящие</span>
                <div className="mt-2 flex items-baseline justify-between">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-indigo-600 font-mono">{stats?.outboundCalls ?? 0}</span>
                  )}
                  <PhoneOutgoing className="h-5 w-5 text-indigo-500 self-center" />
                </div>
              </div>

              {/* Внутренние */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                <span className="text-xs text-slate-500 font-medium tracking-wide">Внутренние</span>
                <div className="mt-2 flex items-baseline justify-between">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-purple-650 font-mono">{stats?.internalCalls ?? 0}</span>
                  )}
                  <Phone className="h-5 w-5 text-purple-500 self-center" />
                </div>
              </div>

              {/* Пропущенные */}
              <div className="bg-white border border-red-100 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                <span className="text-xs text-red-650 font-semibold tracking-wide">Пропущенные</span>
                <div className="mt-2 flex items-baseline justify-between">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-red-600 font-mono">{stats?.missedCalls ?? 0}</span>
                  )}
                  <PhoneMissed className="h-5 w-5 text-red-500/80 self-center" />
                </div>
              </div>

              {/* Обработанные */}
              <div className="bg-white border border-emerald-100 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow" title="Входящие пропущенные, которые перезвонены вовремя по KPI или закрыты вручную">
                <span className="text-xs text-emerald-600 font-semibold tracking-wide flex items-center gap-1">
                  Обработанные
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-emerald-600 font-mono">{stats?.processedCalls ?? 0}</span>
                  )}
                  <CheckCircle className="h-5 w-5 text-emerald-500/80 self-center" />
                </div>
              </div>

              {/* Потерянные */}
              <div className="bg-white border border-amber-150 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow" title="Входящие пропущенные, по которым не совершен звонок клиента/оператора за регламентный срок">
                <span className="text-xs text-amber-650 font-semibold tracking-wide">Потерянные</span>
                <div className="mt-2 flex items-baseline justify-between">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-amber-600 font-mono">{stats?.lostCalls ?? 0}</span>
                  )}
                  <XCircle className="h-5 w-5 text-amber-500/80 self-center" />
                </div>
              </div>
            </section>

        {/* Filters configuration section */}
        <section id="filters-bar" className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-100 pb-3 gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-2 text-slate-705 text-sm font-bold select-none">
                <Filter className="h-4 w-4 text-red-500" />
                <span>Фильтрация звонков</span>
              </div>
              
              <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

              <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                <span className="text-[11px] text-slate-550 font-semibold px-1 select-none">Период:</span>
                <button
                  onClick={() => {
                    setStartDate(new Date().toISOString().split('T')[0]);
                    setEndDate(new Date().toISOString().split('T')[0]);
                    setPage(1);
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                    startDate === new Date().toISOString().split('T')[0] && endDate === new Date().toISOString().split('T')[0]
                      ? 'bg-red-50 text-red-750 font-bold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  Сегодня
                </button>
                <button
                  onClick={() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yStr = yesterday.toISOString().split('T')[0];
                    setStartDate(yStr);
                    setEndDate(yStr);
                    setPage(1);
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                    (() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      const yStr = yesterday.toISOString().split('T')[0];
                      return startDate === yStr && endDate === yStr;
                    })()
                      ? 'bg-red-50 text-red-750 font-bold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  Вчера
                </button>
                <button
                  onClick={() => applyPeriodPreset(7)}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                    (() => {
                      const sev = new Date();
                      sev.setDate(sev.getDate() - 7);
                      const sStr = sev.toISOString().split('T')[0];
                      return startDate === sStr && endDate === new Date().toISOString().split('T')[0];
                    })()
                      ? 'bg-red-50 text-red-750 font-bold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  7 дней
                </button>
                <button
                  onClick={() => applyThisMonthPreset()}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                    (() => {
                      const d = new Date();
                      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
                      return startDate === mStr && endDate === new Date().toISOString().split('T')[0];
                    })()
                      ? 'bg-red-50 text-red-750 font-bold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  Этот месяц
                </button>

                <div className="h-3 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-red-500"
                  />
                  <span className="text-slate-400 text-xs">—</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            </div>
            
            {/* Auto-refresh timer info & Reset Filters button combined */}
            <div className="flex items-center gap-2.5 text-xs text-slate-500 shrink-0 select-none">
              <div className="flex items-center gap-1 font-mono">
                <RefreshCw className="h-3.5 w-3.5 animate-spin-slow text-slate-400" />
                <span>Обновление через {timeToNextRefresh}с</span>
              </div>
              <button
                onClick={() => reloadData()}
                className="hover:text-red-650 hover:bg-slate-200 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md cursor-pointer transition-all font-medium text-xs"
                title="Обновить сейчас"
              >
                Обновить
              </button>
              {(searchQuery || numberFilter || statusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setNumberFilter('');
                    setStatusFilter('ALL');
                    applyPeriodPreset(7);
                  }}
                  className="hover:bg-red-50 bg-red-50/50 border border-red-200 text-red-650 px-2.5 py-1 rounded-md cursor-pointer transition-all font-semibold text-xs"
                  title="Сбросить все фильтры"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search querying */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-slate-550 text-xs font-semibold">Поиск по любой строке</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Имя, номер телефона, ID звонка, комментарий..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-light"
                />
              </div>
            </div>

            {/* Phone search */}
            <div className="space-y-1">
              <label className="text-slate-550 text-xs font-semibold">Номер телефона</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={numberFilter}
                  onChange={(e) => setNumberFilter(e.target.value)}
                  placeholder="Только цифры номера..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-mono"
                />
              </div>
            </div>

            {/* Status quick select */}
            <div className="space-y-1">
              <label className="text-slate-550 text-xs font-semibold">Групповой статус</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all cursor-pointer"
              >
                <option value="ONLY_UNPROCESSED">🔴 Необработанные пропущенные</option>
                <option value="MISSED">❌ Все пропущенные вызовы</option>
                <option value="ONLY_CALLBACKED">📱 Успешные перезвоны (Все)</option>
                <option value="ANSWERED">🟢 Только отвеченные вызовы</option>
                <option value="ALL">📋 Полный лог вызовов (Все)</option>
              </select>
            </div>
          </div>
        </section>

        {/* CDR LOG LIST */}
        <section id="cdr-log" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2">
              <span>История вызовов и статус обработки</span>
              <span className="bg-slate-200 text-slate-700 font-mono text-xs px-2 py-0.5 rounded-full">
                {totalCalls} строк найдено
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            {isLoadingCalls ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-red-500" />
                <span className="text-xs text-slate-500 font-light">Чтение таблиц CDR базы Asterisk...</span>
              </div>
            ) : callsError ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center font-sans bg-rose-50/40 border border-rose-100/70 rounded-xl m-6">
                <AlertCircle className="h-10 w-10 text-rose-500" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-800 leading-normal">Ошибка подключения к базе Asterisk/FreePBX</h3>
                  <p className="text-xs text-rose-650 max-w-lg font-light mt-1">
                    {callsError}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => reloadData(page)} 
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  Повторить попытку
                </button>
              </div>
            ) : calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-2 text-center font-sans">
                <Phone className="h-12 w-12 text-slate-400" />
                <h3 className="text-base font-semibold text-slate-600 leading-normal">Звонки не найдены</h3>
                <p className="text-xs text-slate-500 max-w-sm font-light">
                  Попробуйте настроить фильтрацию, изменить выбранные даты или ввести более мягкий поисковый запрос.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Время вызова / ID</th>
                    <th className="py-3 px-4">Кто звонил</th>
                    <th className="py-3 px-4">Куда звонил</th>
                    <th className="py-3 px-4">Решение (Статус)</th>
                    <th className="py-3 px-4">Запись / Длительность</th>
                    <th className="py-3 px-4">Комментарии операторов</th>
                    <th className="py-3 px-4 text-right">Управление</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-sm">
                  {calls.map((call) => {
                    const dctx = call.dcontext || '';
                    const ch = call.channel || '';
                    const srcVal = (call.src || '').trim();
                    const dstVal = (call.dst || '').trim();

                    // --- 1. CALL TYPE DETECTION ---
                    const isIncoming = dctx.includes('from-trunk') ||
                                       call.dst === '600' ||
                                       (call.did && call.did.length > 0) ||
                                       /^SIP\/[^\/]+-in-/.test(ch) ||
                                       /^PJSIP\/[^\/]+-in-/.test(ch);

                    const isOutgoing = dctx === 'from-internal' && /^[0-9]{7,}$/.test(dstVal);

                    const isInternal = dctx === 'ext-local' && /^[0-9]{2,5}$/.test(srcVal) && /^[0-9]{2,5}$/.test(dstVal);

                    const callDisp = (call.disposition || '').toUpperCase();
                    const isMissed = (callDisp === 'NO ANSWER' || callDisp === 'BUSY' || callDisp === 'FAILED') && (isIncoming || !call.dstchannel);

                    // --- 2. EXTRACT EXTERNAL NUMBER FROM LASTDATA HELPERS ---
                    const extractExternalFromLastdata = (lastdata: string): string => {
                      if (!lastdata) return '';
                      const matches = lastdata.match(/\d{7,15}/g);
                      if (matches && matches.length > 0) {
                        return matches[matches.length - 1];
                      }
                      const simpleMatch = lastdata.match(/\b\d{3,15}\b/);
                      if (simpleMatch) return simpleMatch[0];
                      return '';
                    };

                    const isDstBad = (num: string) => {
                      if (!num) return true;
                      const d = num.trim();
                      if (d === '' || d === 's' || d === 'h' || d === 't') return true;
                      if (isOutgoing && d.length < 7) {
                        return true;
                      }
                      return false;
                    };

                    // --- 3. COLUMN 1: "KTO ZVONIL" (SENDER ENGINE) ---
                    const getCallerNumber = () => {
                      if (isIncoming) {
                        if (srcVal && !isInternalExt(srcVal)) {
                          return srcVal;
                        }
                        if (call.clid) {
                          const match = call.clid.match(/<([^>]+)>/);
                          if (match && match[1].trim()) {
                            return match[1].trim();
                          }
                        }
                        return srcVal;
                      } else {
                        // Outgoing or Internal
                        if (call.cnum && call.cnum.trim()) {
                          return call.cnum.trim();
                        }
                        if (call.src && call.src.trim()) {
                          return call.src.trim();
                        }
                        if (call.channel) {
                          const chExt = getTrunkName(call.channel);
                          if (chExt) return chExt;
                        }
                        return '';
                      }
                    };

                    const displayedSrc = getCallerNumber() || call.src || 'Неизвестно';

                    // --- 4. COLUMN 2: "KUDA ZVONIL" (RECEIVER ENGINE) ---
                    const getCalleeNumber = () => {
                      if (isIncoming) {
                        if (call.dstchannel) {
                          const ext = getTrunkName(call.dstchannel);
                          if (ext && isInternalExt(ext)) {
                            return ext;
                          }
                          if (ext) return ext;
                        }
                        if (call.dst) {
                          return call.dst;
                        }
                        if (call.did) {
                          return call.did;
                        }
                        return '';
                      } else {
                        // Outgoing or Internal
                        if (!isDstBad(dstVal)) {
                          return dstVal;
                        }
                        const lastdata = call.lastdata || '';
                        const parsed = extractExternalFromLastdata(lastdata);
                        if (parsed) return parsed;
                        return dstVal;
                      }
                    };

                    const displayedDst = getCalleeNumber() || call.dst || 'Неизвестно';

                    return (
                      <tr
                        key={call.uniqueid}
                        className={`hover:bg-slate-50/50 transition-colors ${
                          isMissed && !call.processed && !call.wasCallbacked
                            ? 'bg-red-500/[0.015]'
                            : ''
                        }`}
                      >
                        {/* Time & UniqueID */}
                        <td className="py-3 px-4">
                          <div className="text-slate-900 font-semibold flex items-center gap-1.5 text-sm">
                            {isIncoming ? (
                              <span title="Входящий вызов">
                                <PhoneIncoming className="h-3.5 w-3.5 text-cyan-600" />
                              </span>
                            ) : (
                              <span title="Исходящий вызов">
                                <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600" />
                              </span>
                            )}
                            {call.calldate}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5 select-all" title="Asterisk UniqueID">
                            ID: {call.uniqueid}
                          </div>
                        </td>

                        {/* Caller display (Кто звонил) */}
                        <td className="py-3 px-4">
                          {(() => {
                            const dMatch = directory.find(e => e.number.trim() === displayedSrc.trim());
                            const isSrcInternal = isInternalExt(displayedSrc);
                            let callerName = '';
                            let callerType = isSrcInternal ? 'internal' : 'client';
                            let isFound = false;

                            if (dMatch) {
                              callerName = dMatch.name;
                              callerType = dMatch.type;
                              isFound = true;
                            } else {
                              if (isIncoming) {
                                const clidName = renderClidName(call.clid, displayedSrc);
                                if (clidName && clidName.trim() !== '' && clidName !== displayedSrc) {
                                  callerName = clidName;
                                } else {
                                  callerName = isSrcInternal ? `Внутренний ${displayedSrc}` : 'Внешний клиент';
                                }
                              } else {
                                callerName = isSrcInternal ? `Внутренний ${displayedSrc}` : 'Внешний клиент';
                              }
                            }

                            return (
                              <div className="flex flex-col gap-1">
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap text-sm">
                                  <span className={isFound ? "text-red-750 font-bold" : "text-slate-700 font-medium"}>
                                    {callerName}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium select-none ${
                                    callerType === 'internal'
                                      ? 'bg-slate-100 text-slate-650 border border-slate-200'
                                      : 'bg-red-50 text-red-650 border border-slate-150'
                                  }`}>
                                    {callerType === 'internal' ? 'Внутр.' : 'Клиент'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-550 font-mono select-all flex items-center gap-1.5 mt-0.5">
                                  <span className="font-semibold">{displayedSrc}</span>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <button
                                      onClick={() => triggerClickToCall(displayedSrc, callerName)}
                                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 cursor-pointer flex items-center gap-1 transition-all shadow-xs hover:scale-105 active:scale-95 text-[10px] font-semibold"
                                      title={`Позвонить на ${displayedSrc} через SIP/AMI`}
                                    >
                                      <PhoneCall className="h-2.5 w-2.5" />
                                      <span>Позвонить</span>
                                    </button>
                                    {!isFound && (
                                      <button
                                        onClick={() => openAddFromCall(displayedSrc, callerName && !callerName.startsWith('Внешний') && !callerName.startsWith('Внутренний') ? callerName : '')}
                                        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 cursor-pointer flex items-center gap-1 transition-all shadow-xs hover:scale-105 active:scale-95 text-[10px] font-semibold"
                                        title="Добавить в справочник"
                                      >
                                        <UserPlus className="h-2.5 w-2.5" />
                                        <span>Добавить</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Callee display (Куда звонил) */}
                        <td className="py-3 px-4">
                          {(() => {
                            const dstContact = directory.find(e => e.number.trim() === displayedDst.trim());
                            const isDstInternal = isInternalExt(displayedDst);
                            let calleeName = '';
                            let calleeType = isDstInternal ? 'internal' : 'client';
                            let isFound = false;

                            if (dstContact) {
                              calleeName = dstContact.name;
                              calleeType = dstContact.type;
                              isFound = true;
                            } else {
                              calleeName = isDstInternal ? `Внутренний ${displayedDst}` : 'Внешний номер';
                            }

                            return (
                              <div className="flex flex-col gap-1">
                                {/* Row 1: Внутренний 600   DID: 74951234565 */}
                                <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap text-sm">
                                  <span className={isFound ? "text-red-750 font-bold" : "text-slate-700 font-medium"}>
                                    {calleeName}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium select-none ${
                                    calleeType === 'internal'
                                      ? 'bg-slate-100 text-slate-650 border border-slate-200'
                                      : 'bg-red-50 text-red-650 border border-slate-150'
                                  }`}>
                                    {calleeType === 'internal' ? 'Внутр.' : 'Клиент'}
                                  </span>
                                  {call.did && (
                                    <span className="text-[11.5px] text-slate-500 font-mono font-medium ml-2">
                                      DID: {call.did}
                                    </span>
                                  )}
                                  {!isIncoming && call.dstchannel && (() => {
                                    const trunkName = getTrunkName(call.dstchannel);
                                    if (trunkName && !isInternalExt(trunkName)) {
                                      return (
                                        <span className="text-[11px] text-emerald-800 font-mono font-medium ml-2 bg-emerald-50 px-1 py-0.5 rounded" title={`Транк: ${call.dstchannel}`}>
                                          Транк: {trunkName}
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>

                                {/* Row 2: 600 Позвонить Добавить */}
                                <div className="text-[11px] text-slate-550 flex items-center gap-2 mt-0.5">
                                  <span className="font-bold text-slate-800 font-mono select-all text-sm">{displayedDst}</span>
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <button
                                      onClick={() => triggerClickToCall(displayedDst, calleeName)}
                                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 cursor-pointer flex items-center gap-1 transition-all shadow-xs hover:scale-105 active:scale-95 text-[10px] font-semibold"
                                      title={`Позвонить на ${displayedDst} через SIP/AMI`}
                                    >
                                      <PhoneCall className="h-2.5 w-2.5" />
                                      <span>Позвонить</span>
                                    </button>
                                    {!isFound && (
                                      <button
                                        onClick={() => openAddFromCall(displayedDst, calleeName && !calleeName.startsWith('Внешний') && !calleeName.startsWith('Внутренний') ? calleeName : '')}
                                        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 cursor-pointer flex items-center gap-1 transition-all shadow-xs hover:scale-105 active:scale-95 text-[10px] font-semibold"
                                        title="Добавить в справочник"
                                      >
                                        <UserPlus className="h-2.5 w-2.5" />
                                        <span>Добавить</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* CDR Disposition state */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start text-[11px]">
                            {callDisp === 'ANSWERED' && (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10.5px] font-semibold">
                                <CheckCircle className="h-3 w-3" />
                                ОТВЕЧЕН
                              </span>
                            )}
                            {callDisp === 'NO ANSWER' && (
                              <span className="inline-flex items-center gap-1 bg-red-50 text-red-650 border border-red-200 px-2 py-0.5 rounded text-[10.5px] font-semibold">
                                <XCircle className="h-3 w-3" />
                                БЕЗ ОТВЕТА
                              </span>
                            )}
                            {callDisp === 'BUSY' && (
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10.5px] font-semibold">
                                <Clock className="h-3 w-3" />
                                ЗАНЯТО
                              </span>
                            )}
                            {callDisp === 'FAILED' && (
                              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10.5px] font-semibold">
                                <AlertCircle className="h-3 w-3" />
                                СБОЙ
                              </span>
                            )}

                            {/* Callback resolution badge */}
                            {call.wasCallbacked && (
                              <span
                                className={`inline-flex items-center gap-1 border px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${
                                  call.wasKpiResolved
                                    ? 'bg-emerald-55 text-emerald-700 border-emerald-250 font-bold'
                                    : 'bg-amber-50 text-amber-600 border-amber-300 font-medium'
                                }`}
                                title={`Клиенту успешно перезвонили в ${call.callbackTime}. Лимит времени по KPI: ${call.wasKpiResolved ? 'соблюден' : 'превышен!'}`}
                              >
                                📱 ПЕРЕЗВОНЕНО {call.wasKpiResolved ? '(SLA OK)' : '(SLA ПРЕВЫШЕН)'}
                              </span>
                            )}

                            {/* Processed state */}
                            {!call.wasCallbacked && isMissed && (
                              call.processed ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1">
                                  ✓ ОБРАБОТАН
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 animate-pulse">
                                  ⚠ ОЖИДАЕТ
                                </span>
                              )
                            )}
                          </div>
                        </td>

                        {/* Bill sec/durations and record file */}
                        <td className="py-3 px-4">
                          <div className="text-slate-600 text-xs">
                            Длительность: <span className="font-semibold font-mono text-slate-900">{formatSeconds(call.duration)}</span>
                          </div>
                          <div className="text-[11px] text-slate-550">
                            Разговор: {formatSeconds(call.billsec)}
                          </div>
                          
                          {call.recordingfile && (
                            <button
                              onClick={() => playRecording(call)}
                              className={`mt-1.5 inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[10.5px] font-medium border cursor-pointer transition-all ${
                                playingCallId === call.uniqueid
                                  ? 'bg-red-50 border-red-200 text-red-600'
                                  : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50'
                              }`}
                            >
                              {playingCallId === call.uniqueid && !isAudioPaused ? (
                                <>
                                  <Pause className="h-3 w-3" />
                                  <span>Слушать</span>
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3" />
                                  <span>Воспроизвести</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>

                        {/* Comment section */}
                        <td className="py-3 px-4 max-w-xs">
                          {call.comment ? (
                            <div>
                              <p className="text-slate-800 line-clamp-2 bg-slate-50 rounded p-1.5 border border-slate-200 text-xs font-light italic">
                                "{call.comment}"
                              </p>
                              {call.processedBy && (
                                <span className="text-[11px] text-slate-400 mt-1 block">
                                  Автор: {call.processedBy} ({new Date(call.processedAt || '').toLocaleDateString()})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Нет комментариев</span>
                          )}
                        </td>

                        {/* Actions buttons */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isMissed && (
                              <button
                                onClick={() => openProcessModal(call)}
                                className={`px-2.5 py-1.5 rounded-lg border transition-all text-[11px] font-semibold cursor-pointer ${
                                  call.processed
                                    ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-950 hover:bg-slate-50'
                                    : 'bg-gradient-to-r from-red-650 to-rose-700 text-white border-transparent hover:from-red-600 hover:to-rose-650 shadow-sm'
                                }`}
                              >
                                {call.processed ? 'Изменить' : 'Обработать'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Simple pagination footer */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
            <span className="text-slate-550 text-sm font-light">
              Показано <span className="font-semibold text-slate-800">{calls.length}</span> строк из <span className="font-semibold text-slate-800">{totalCalls}</span>
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (page > 1) {
                    setPage(page - 1);
                    loadCalls(page - 1);
                  }
                }}
                disabled={page <= 1 || isLoadingCalls}
                className="p-1 px-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-slate-500 px-2 font-sans text-xs">
                Страница <span className="text-slate-900 font-semibold">{page}</span> из {totalPages}
              </span>

              <button
                onClick={() => {
                  if (page < totalPages) {
                    setPage(page + 1);
                    loadCalls(page + 1);
                  }
                }}
                disabled={page >= totalPages || isLoadingCalls}
                className="p-1 px-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </>
    ) : (
      <section id="directory-panel" className="space-y-4">
        {/* Directory Overview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-xs text-slate-500 font-medium tracking-wide font-sans">Всего контактов</span>
            <div className="mt-2 flex items-baseline justify-between font-sans">
              <span className="text-2xl font-bold text-slate-900 font-mono">{directory.length}</span>
              <BookOpen className="h-5 w-5 text-slate-400 self-center" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-xs text-slate-550 font-medium tracking-wide">Внутренние номера</span>
            <div className="mt-2 flex items-baseline justify-between font-sans">
              <span className="text-2xl font-bold text-slate-900 font-mono">
                {directory.filter(e => e.type === 'internal').length}
              </span>
              <UserCheck className="h-5 w-5 text-indigo-400 self-center" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-xs text-slate-550 font-medium tracking-wide">Телефоны клиентов</span>
            <div className="mt-2 flex items-baseline justify-between font-sans">
              <span className="text-2xl font-bold text-slate-900 font-mono">
                {directory.filter(e => e.type === 'client').length}
              </span>
              <UserCheck className="h-5 w-5 text-red-400 self-center" />
            </div>
          </div>
        </div>

        {/* Admin Directory Controls Panel */}
        {session?.role === 'admin' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm select-none">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setIsAdminPanelExpanded(!isAdminPanelExpanded)}
            >
              <div className="flex items-center gap-2">
                <Sliders className="h-4.5 w-4.5 text-red-650" />
                <h3 className="text-sm font-bold text-slate-800 font-sans">Панель администратора справочника</h3>
                <span className="text-[11px] text-slate-400 font-normal">
                  ({isAdminPanelExpanded ? 'нажмите, чтобы свернуть' : 'нажмите, чтобы развернуть'})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-red-100 text-red-750 font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                  Администратор
                </span>
                {isAdminPanelExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </div>

            {isAdminPanelExpanded && (
              <div className="space-y-3.5 pt-2 border-t border-slate-200">
                <p className="text-xs text-slate-550 font-light max-w-3xl leading-relaxed">
                  Управляйте справочником пакетно: импортируйте контакты из CSV/TXT файлов (скачайте шаблон ниже как образец структуры для Excel), экспортируйте полную базу данных справочника в формат CSV, или запустите глобальный процесс нормализации телефонных номеров по настроенным маскам.
                </p>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-red-650 to-rose-700 hover:from-red-600 hover:to-rose-650 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-all active:scale-95 select-none"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Импорт контактов (массовый)
                  </button>

                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-red-650 rounded-lg text-xs font-semibold cursor-pointer border border-red-200 shadow-xs transition-all active:scale-95 select-none"
                  >
                    <Download className="h-3.5 w-3.5 text-red-550" />
                    Шаблон импорта (CSV Excel)
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-200 shadow-xs transition-all active:scale-95 select-none"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    Экспорт в CSV
                  </button>

                  <button
                    onClick={handleNormalizeDirectoryDb}
                    disabled={isNormalizingDb}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-200 shadow-xs disabled:opacity-50 transition-all active:scale-95 select-none"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isNormalizingDb ? 'animate-spin' : ''}`} />
                    {isNormalizingDb ? 'Выполняется нормализация...' : 'Нормализовать все номера в базе'}
                  </button>
                </div>

                {/* Normalization result banner feedback */}
                {normalizedCount !== null && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-lg text-xs text-emerald-800 flex items-center justify-between font-sans shadow-inner animate-fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4.5 w-4.5 text-emerald-600" />
                      <span>
                        Нормализация успешно завершена! Проверены все записи в справочнике. Число измененных номеров: <strong>{normalizedCount}</strong>.
                      </span>
                    </div>
                    <button onClick={() => setNormalizedCount(null)} className="text-emerald-500 hover:text-emerald-700 text-sm font-semibold select-none cursor-pointer">
                      &times;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Directory toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-stretch sm:items-center">
            {/* Search */}
            <div className="relative min-w-[260px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={dirSearchQuery}
                onChange={(e) => setDirSearchQuery(e.target.value)}
                placeholder="Поиск по имени или номеру..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-light"
              />
            </div>

            {/* Filter Selector */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setDirTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  dirTypeFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-550 hover:text-slate-950'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => setDirTypeFilter('internal')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  dirTypeFilter === 'internal'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-550 hover:text-slate-950'
                }`}
              >
                Внутренние
              </button>
              <button
                onClick={() => setDirTypeFilter('client')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  dirTypeFilter === 'client'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-555 hover:text-slate-950'
                }`}
              >
                Клиенты
              </button>
            </div>
          </div>

          <button
            onClick={openCreateDirEntry}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-red-600 transition-all select-none shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Добавить контакт
          </button>
        </div>

        {/* List Table of directory entries */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse text-left text-xs text-slate-500">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th scope="col" className="py-3 px-4">Имя / Описание</th>
                  <th scope="col" className="py-3 px-4">Номер телефона / Ext</th>
                  <th scope="col" className="py-3 px-4">Тип контакта</th>
                  <th scope="col" className="py-3 px-4">Комментарий / Отдел</th>
                  <th scope="col" className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  let list = [...directory];
                  if (dirTypeFilter !== 'all') {
                    list = list.filter(e => e.type === dirTypeFilter);
                  }
                  if (dirSearchQuery.trim()) {
                    const s = dirSearchQuery.toLowerCase();
                    list = list.filter(e => 
                      e.name.toLowerCase().includes(s) || 
                      e.number.includes(s) || 
                      (e.comment && e.comment.toLowerCase().includes(s))
                    );
                  }

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          {isLoadingDirectory ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                              <span>Загрузка данных справочника...</span>
                            </div>
                          ) : (
                            "Записи не найдены"
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return list.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-sans">
                        {entry.name}
                      </td>
                      <td className="py-3.5 px-4 text-red-800 font-mono font-bold select-all">
                        <div className="flex items-center gap-2">
                          <span>{entry.number}</span>
                          <button
                            onClick={() => triggerClickToCall(entry.number, entry.name)}
                            className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 cursor-pointer flex items-center transition-all shadow-xs hover:scale-105 active:scale-95"
                            title={`Позвонить на ${entry.number} через SIP/AMI`}
                          >
                            <PhoneCall className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
                          entry.type === 'internal'
                            ? 'bg-slate-150 text-slate-650 border-slate-250'
                            : 'bg-red-50 text-red-650 border-red-150'
                        }`}>
                          {entry.type === 'internal' ? 'Внутренний номер' : 'Клиент'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-650">
                        {entry.comment || <span className="text-slate-350 italic">—</span>}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditDirEntry(entry)}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                            title="Редактировать контакт"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDirEntry(entry.id)}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                            title="Удалить контакт"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    )}
      </main>

      {/* FOOTER RECORD PLAYER CONTROL SLIDE OVERLAY */}
      {playingRecording && (
        <footer className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] w-[1100px] max-w-[calc(100vw-30px)] bg-white border border-red-200 rounded-2xl py-3.5 px-4 shadow-2xl">
          <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3.5">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 bg-red-50 rounded-lg border border-red-100 text-red-600 shadow-xs">
                <Volume2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 md:flex-none">
                <div className="text-xs font-semibold text-slate-800 truncate max-w-md" title={playingRecording}>
                  {playingRecording}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Плеер Asterisk Monitor Spooler
                </div>
              </div>
            </div>

            {/* Main playback knobs */}
            <div className="flex items-center gap-3.5 w-full md:flex-1 md:max-w-xl justify-center">
              <button
                onClick={() => {
                  if (audioRef.current) {
                    if (isAudioPaused) {
                      audioRef.current.play().catch(e => setAudioError(e.message));
                      setIsAudioPaused(false);
                    } else {
                      audioRef.current.pause();
                      setIsAudioPaused(true);
                    }
                  }
                }}
                className="p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full transition-transform active:scale-95 cursor-pointer flex items-center justify-center shrink-0 shadow"
              >
                {isAudioPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>

              <span className="text-[10px] text-slate-500 font-mono shrink-0 w-8 text-right">
                {formatSeconds(Math.floor(audioProgress))}
              </span>

              <input
                type="range"
                value={audioProgress}
                min={0}
                max={audioDuration || 100}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-100 border border-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
              />

              <span className="text-[10px] text-slate-500 font-mono shrink-0 w-8">
                {formatSeconds(Math.floor(audioDuration))}
              </span>
            </div>

            {/* Speed adjustments */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={() => changeSpeed(1)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1 ? 'bg-red-50 border border-red-200/50 text-red-655' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.0x
                </button>
                <button
                  onClick={() => changeSpeed(1.25)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1.25 ? 'bg-red-50 border border-red-200/50 text-red-655' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.25x
                </button>
                <button
                  onClick={() => changeSpeed(1.5)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1.5 ? 'bg-red-50 border border-red-200/50 text-red-655' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.5x
                </button>
                <button
                  onClick={() => changeSpeed(2)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 2 ? 'bg-red-50 border border-red-200/50 text-red-655' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  2x
                </button>
              </div>

              <div className="h-6 w-[1px] bg-slate-200" />

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider font-mono">Громкость</span>
                <input
                  type="range"
                  value={audioVolume}
                  min={0}
                  max={1}
                  step={0.1}
                  onChange={changeVolume}
                  className="w-16 h-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>

              <div className="h-6 w-[1px] bg-slate-200" />
              
              <button
                onClick={() => {
                  setPlayingRecording(null);
                  setPlayingCallId(null);
                  if (audioRef.current) audioRef.current.pause();
                }}
                className="text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-1.5 rounded cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>

          {audioError && (
            <div className="max-w-[1800px] mx-auto mt-2 text-center text-red-500 text-xs px-4">
              ⚠ {audioError}
            </div>
          )}
        </footer>
      )}

      {/* CALL PROCESSING / COMMENTING DIALOG MODAL PANEL */}
      {selectedCall && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-red-655" />
                  Обработка пропущенного вызова
                </h3>
                <p className="text-xs text-slate-500 font-light mt-0.5">
                  ID: {selectedCall.uniqueid} / {selectedCall.calldate}
                </p>
              </div>
              <button
                onClick={() => setSelectedCall(null)}
                className="text-slate-400 hover:text-slate-800 p-1 rounded font-sans cursor-pointer text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessMissedCall} className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4 text-xs space-y-2">
                <div className="grid grid-cols-2">
                  <span className="text-slate-500">Клиент / Номер:</span>
                  <span className="font-semibold text-slate-800 text-right">{selectedCall.src}</span>
                </div>
                <div className="grid grid-cols-2">
                  <span className="text-slate-500">Маршрут / Внутренний:</span>
                  <span className="font-semibold text-slate-800 text-right">{selectedCall.dst}</span>
                </div>
                {selectedCall.did && (
                  <div className="grid grid-cols-2">
                    <span className="text-slate-550">DID компании:</span>
                    <span className="font-semibold text-slate-800 text-right font-mono">{selectedCall.did}</span>
                  </div>
                )}
                <div className="grid grid-cols-2">
                  <span className="text-slate-500">Длительность звонка:</span>
                  <span className="font-semibold text-slate-800 text-right font-mono">{formatSeconds(selectedCall.duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="is-processed-checkbox"
                  checked={isProcessedInput}
                  onChange={(e) => setIsProcessedInput(e.target.checked)}
                  className="h-4.5 w-4.5 rounded text-red-600 accent-red-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="is-processed-checkbox" className="text-xs text-slate-700 select-none cursor-pointer font-semibold">
                  Отметить звонок как отработанный / решенный
                </label>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5 font-sans">Комментарий к звонку</label>
                <textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Добавьте подробности разговора, перезвона или причину пропуска звонка..."
                  className="w-full h-24 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 font-sans"
                />
              </div>

              {/* Quick Preset Comment Templates */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-sans">Шаблоны быстрых комментариев:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPresetComment('Клиент перезвонил сам, вопрос решен')}
                    className="text-[10px] bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded cursor-pointer transition-all font-sans"
                  >
                    Перезвонил клиент
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetComment('Успешно перезвонили, проконсультировали')}
                    className="text-[10px] bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded cursor-pointer transition-all font-sans"
                  >
                    Успешный перезвон
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetComment('Не дозвонились операторы, сброс/автоответчик')}
                    className="text-[10px] bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded cursor-pointer transition-all font-sans"
                  >
                    Не дозвонились
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetComment('Ошиблись номером / Спам / Молчали')}
                    className="text-[10px] bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded cursor-pointer transition-all font-sans"
                  >
                    Ошибка/Спам
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedCall(null)}
                  className="text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-4 py-2 rounded-lg cursor-pointer font-sans"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingProcess}
                  className="bg-red-600 hover:bg-red-500 rounded-lg text-xs font-semibold text-white px-4 py-2 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow"
                >
                  {isSavingProcess && <Loader2 className="h-3 w-3 animate-spin" />}
                  Сохранить изменения
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN CONNECTORS / CONFIGURATOR MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-850 rounded-2xl shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden z-50">
            <div className="flex items-start justify-between border-b border-slate-800 p-6 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="h-5 w-5 text-emerald-500" />
                  Параметры интеграции FreePBX
                </h3>
                <p className="text-xs text-slate-400 font-light mt-0.5">
                  Настройки подключения MariaDB asteriskcdrdb
                </p>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setDbTestResult(null);
                }}
                className="text-slate-500 hover:text-white p-1 rounded-md cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {draftSettings ? (
              <form onSubmit={handleSaveSettings} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-4 pr-3 scrollbar-thin">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider">Хост MariaDB / IP</label>
                      <input
                        type="text"
                        value={draftSettings.dbHost}
                        onChange={(e) => setDraftSettings({ ...draftSettings, dbHost: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider">Порт</label>
                      <input
                        type="number"
                        value={draftSettings.dbPort}
                        onChange={(e) => setDraftSettings({ ...draftSettings, dbPort: parseInt(e.target.value, 10) })}
                        className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider">Имя базы данных</label>
                      <input
                        type="text"
                        value={draftSettings.dbName}
                        onChange={(e) => setDraftSettings({ ...draftSettings, dbName: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider font-mono">User (Read-Only)</label>
                      <input
                        type="text"
                        value={draftSettings.dbUser}
                        onChange={(e) => setDraftSettings({ ...draftSettings, dbUser: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider">Пароль базы данных</label>
                    <input
                      type="password"
                      value={draftSettings.dbPass}
                      onChange={(e) => setDraftSettings({ ...draftSettings, dbPass: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                    />
                    <span className="text-[10.5px] text-zinc-500 block mt-1 font-light italic">
                      *Рекомендуется использовать ограниченного read-only пользователя MariaDB Asterisk.
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-slate-455 text-[11px] font-semibold uppercase tracking-wider">Путь к записям разговоров</label>
                    <input
                      type="text"
                      value={draftSettings.recordingsPath}
                      onChange={(e) => setDraftSettings({ ...draftSettings, recordingsPath: e.target.value })}
                      placeholder="/var/spool/asterisk/monitor"
                      className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                      required
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Папка на локальном диске, куда складываются аудио `.wav` или `.mp3` файлы звонков.
                    </span>
                  </div>

                  <div className="border-t border-slate-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                      <Phone className="h-4 w-4 text-emerald-500" />
                      Настройки клик-ту-колл (Asterisk AMI)
                    </h4>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider font-sans">Хост Asterisk AMI / IP</label>
                        <input
                          type="text"
                          value={draftSettings.amiHost || ''}
                          onChange={(e) => setDraftSettings({ ...draftSettings, amiHost: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                          placeholder="например: localhost"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider font-sans">Порт AMI</label>
                        <input
                          type="number"
                          value={draftSettings.amiPort ?? 5038}
                          onChange={(e) => setDraftSettings({ ...draftSettings, amiPort: parseInt(e.target.value, 10) || 5038 })}
                          className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="space-y-1">
                        <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider font-mono">User (AMI Username)</label>
                        <input
                          type="text"
                          value={draftSettings.amiUser || ''}
                          onChange={(e) => setDraftSettings({ ...draftSettings, amiUser: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                          placeholder="clicktocall"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-450 text-[11px] font-semibold uppercase tracking-wider font-sans">Пароль AMI (Secret)</label>
                        <input
                          type="password"
                          value={draftSettings.amiPass || ''}
                          onChange={(e) => setDraftSettings({ ...draftSettings, amiPass: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 mt-3">
                      <label className="text-slate-455 text-[11px] font-semibold uppercase tracking-wider font-sans">Исходящий Контекст (AMI Context)</label>
                      <input
                        type="text"
                        value={draftSettings.amiContext || 'from-internal'}
                        onChange={(e) => setDraftSettings({ ...draftSettings, amiContext: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        placeholder="from-internal"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block font-light">
                        Служебный контекст (по умолчанию: from-internal) для отправки Originate Local/ext@context.
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                      <Sliders className="h-4 w-4 text-emerald-400" />
                      Нормализация телефонных номеров
                    </h4>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2.5 text-xs text-slate-300 font-light cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftSettings.normEnabled ?? true}
                          onChange={(e) => setDraftSettings({ ...draftSettings, normEnabled: e.target.checked })}
                          className="rounded border-slate-800 bg-slate-950 text-emerald-555 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        />
                        <span>Включить автоматическую нормализацию номеров</span>
                      </label>

                      {(draftSettings.normEnabled !== false) && (
                        <div className="pl-6 space-y-2 border-l border-slate-800 mt-2">
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draftSettings.normStripSymbols ?? true}
                              disabled={draftSettings.normDigitsOnly ?? false}
                              onChange={(e) => setDraftSettings({ ...draftSettings, normStripSymbols: e.target.checked })}
                              className="rounded border-slate-800 bg-slate-950 text-emerald-555 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                            />
                            <span>Удалять спецсимволы (оставлять только цифры и "+")</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draftSettings.normReplace8With7 ?? true}
                              onChange={(e) => setDraftSettings({ ...draftSettings, normReplace8With7: e.target.checked })}
                              className="rounded border-slate-800 bg-slate-950 text-emerald-555 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>Заменять ведущую "8" на "7" (для РФ/СНГ номеров)</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draftSettings.normDigitsOnly ?? false}
                              onChange={(e) => {
                                const active = e.target.checked;
                                setDraftSettings({
                                  ...draftSettings,
                                  normDigitsOnly: active,
                                  normStripSymbols: active ? false : (draftSettings.normStripSymbols ?? true)
                                });
                              }}
                              className="rounded border-slate-800 bg-slate-950 text-emerald-555 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>Оставлять только цифры (полностью удалять "+")</span>
                          </label>
                        </div>
                      )}
                      <span className="text-[10px] text-zinc-500 block font-light">
                        Правила применяются на лету при добавлении контактов в справочник, звонках Click-то-Call и импорте из файлов.
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                      <Clock className="h-4 w-4 text-cyan-400" />
                      Нормативы обработки и KPI контроля
                    </h4>
                    <div className="space-y-1">
                      <label className="text-slate-455 text-[11px] font-semibold uppercase tracking-wider font-sans">Лимит времени отзвона по KPI (минут)</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={draftSettings.callbackKpiMinutes ?? 60}
                        onChange={(e) => setDraftSettings({ ...draftSettings, callbackKpiMinutes: parseInt(e.target.value, 10) || 60 })}
                        className="w-full bg-slate-950 border border-slate-830 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                        placeholder="60"
                      />
                      <span className="text-[10px] text-zinc-550 mt-1 block font-light">
                        Если сотрудник перезвонит клиенту (или клиент дозвонится повторно) в течение этого времени, звонок автоматически пометится как выполненный («Обработан») с пометкой автозакрытия.
                      </span>
                    </div>
                  </div>

                  {isDemoModeActive && (
                    <div className="border-t border-slate-800 pt-4 mt-2">
                      <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                        <Sliders className="h-4 w-4 text-amber-500" />
                        Демонстрационный режим
                      </h4>
                      
                      <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 space-y-2.5">
                        <p className="text-[10.5px] text-slate-400 font-light leading-relaxed">
                          Вы работаете с демонстрационными звонками. После настройки подключения к вашей MariaDB Asterisk ниже, приложение переключится на ваши реальные логи АТС автоматически.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400 font-medium">Управление:</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={clearDemoData}
                              disabled={isDemoClearing}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-red-950 hover:bg-red-900 border border-red-850 text-red-300 rounded cursor-pointer disabled:opacity-50 transition-all active:scale-95 flex items-center gap-1"
                              title="Удалить все демонстрационные звонки из памяти"
                            >
                              {isDemoClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              Удалить демо данные
                            </button>
                            
                            <button
                              type="button"
                              onClick={generateDemoData}
                              disabled={isDemoGenerating}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded cursor-pointer disabled:opacity-50 transition-all active:scale-95 flex items-center gap-1"
                              title="Сгенерировать чистый набор демо-звонков заново"
                            >
                              {isDemoGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              Сгенерировать заново
                            </button>
                          </div>
                        </div>

                        {demoStatusResult && (
                          <div className={`p-2 rounded text-[10.5px] border ${
                            demoStatusResult.success 
                              ? 'bg-emerald-950/40 border-emerald-900 text-emerald-400' 
                              : 'bg-red-950/40 border-red-900 text-red-400'
                          }`}>
                            {demoStatusResult.message}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {dbTestResult && (
                    <div className={`p-3.5 border rounded-lg text-xs flex items-start gap-2 ${
                      dbTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/20 text-red-300'
                    }`}>
                      <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${dbTestResult.success ? 'text-emerald-400' : 'text-red-400'}`} />
                      <span>{dbTestResult.message}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-6 pt-4 border-t border-slate-800 bg-slate-900 shrink-0">
                  <button
                    type="button"
                    onClick={testDbConnection}
                    disabled={isTestingDb}
                    className="px-3.5 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-semibold border border-slate-830 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1"
                  >
                    {isTestingDb && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Проверить связь
                  </button>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setDbTestResult(null);
                      }}
                      className="text-xs text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 px-4 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingSettings}
                      className="bg-emerald-650 hover:bg-emerald-550 text-xs font-semibold text-white px-4 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Сохранить и активировать
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="p-10 flex justify-center border-t border-slate-800">
                <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* MASS DIRECTORY IMPORT DIALOG (ADMINS ONLY) */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col z-[60]">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Upload className="h-5 w-5 text-red-650" />
                  Пакетный импорт телефонного справочника
                </h3>
                <p className="text-xs text-slate-500 font-light mt-0.5">
                  Загрузите CSV/TXT-файлы или скопируйте контакты напрямую в поле ввода.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsImportOpen(false);
                  setImportText('');
                  setParsedImportEntries([]);
                  setImportFileError('');
                }}
                className="text-slate-400 hover:text-slate-650 p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
              {importFileError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                  <span>{importFileError}</span>
                </div>
              )}

              {importSuccessCount !== null && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <h4 className="font-bold font-sans">Импорт выполнен успешно!</h4>
                    <p className="mt-0.5">В телефонный справочник добавлено: <strong>{importSuccessCount}</strong> контактов.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-650 text-xs font-bold mb-1">Вариант 1: Загрузить файл контактов</label>
                    <div className="border-2 border-dashed border-slate-200 hover:border-red-400 rounded-xl p-4 text-center transition-all relative">
                      <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <Upload className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
                      <span className="text-slate-700 font-medium block">Выберите или перетащите файл</span>
                      <span className="text-[10px] text-slate-455 block mt-0.5">Форматы: .csv, .txt (Разделитель: запятая или точка с запятой)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-650 text-xs font-bold mb-1">Вариант 2: Вставить текст CSV / Скопировать из Excel</label>
                    <textarea
                      value={importText}
                      onChange={(e) => {
                        setImportText(e.target.value);
                        handleParseImport(e.target.value);
                      }}
                      rows={6}
                      placeholder="Формат: Имя,Номер,Тип(internal/client),Комментарий&#10;Пример:&#10;Иван Петров,79991234567,client,Директор компании&#15;&#10;Бухгалтерия,102,internal,Офисный номер"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 font-mono text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all focus:bg-white resize-none"
                    ></textarea>
                  </div>

                  <div className="p-3 bg-amber-50/70 border border-amber-200 text-amber-900 rounded-xl space-y-1 bg-amber-50">
                    <h5 className="font-bold flex items-center gap-1">Важное примечание:</h5>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-amber-850 font-light">
                      <li>Первая колонка — ФИО / Название, вторая — Номер телефона.</li>
                      <li>Если номер телефона ≤ 4 символов, тип автоматически выставится как "Внутренний".</li>
                      <li>Телефонные номера автоматически очистятся и нормализуются при импорте в соответствии с вашими настройками.</li>
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col h-full bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2 shrink-0">
                    <span className="font-bold text-slate-700">Предпросмотр ({parsedImportEntries.length}):</span>
                    <span className="text-[10px] text-slate-450 uppercase tracking-widest font-bold">Данные к загрузке</span>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[280px] space-y-1.5 pr-1">
                    {parsedImportEntries.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-slate-400 italic font-light p-8">
                        Нет данных для предпросмотра. Пожалуйста, вставьте список контактов или загрузите готовый файл.
                      </div>
                    ) : (
                      parsedImportEntries.map((item, idx) => (
                        <div key={idx} className="bg-white border border-slate-150 rounded-lg p-2 flex items-center justify-between shadow-xs">
                          <div>
                            <div className="font-bold text-slate-800 truncate max-w-[155px]">{item.name}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[155px]">{item.comment}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-red-800 font-bold">{item.number}</div>
                            <span className={`text-[9px] font-semibold px-2 py-0.2 rounded-full border ${
                              item.type === 'internal'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-red-50 text-red-650 border-red-150'
                            }`}>
                              {item.type === 'internal' ? 'Внутр.' : 'Клиент'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-3 mt-3 shrink-0">
                    <label className="text-slate-650 font-bold block mb-1">Режим сохранения контактов:</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={!importOverwriteMode}
                          onChange={() => setImportOverwriteMode(false)}
                          className="text-red-650 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span>Прибавить новые к существующим (Дописать)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 text-red-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importOverwriteMode}
                          onChange={() => {
                            if (window.confirm("ВНИМАНИЕ! Вы выбрали полную перезапись. Весь текущий справочник будет удален и заменен новыми контактами! Вы уверены?")) {
                              setImportOverwriteMode(true);
                            }
                          }}
                          className="text-red-500 focus:ring-red-550 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="font-bold text-red-650 hover:text-red-700">Очистить справочник и записать заново!</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 mt-4 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsImportOpen(false);
                  setImportText('');
                  setParsedImportEntries([]);
                  setImportFileError('');
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-lg text-xs font-semibold cursor-pointer transition-all active:scale-95 select-none"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || parsedImportEntries.length === 0}
                className="flex items-center gap-1 px-4 py-1.5 bg-emerald-650 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-sm select-none"
              >
                {isImporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Выполнить загрузку в базу ({parsedImportEntries.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIRECTORY ADD / EDIT DIALOG */}
      {isDirFormOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-red-650" />
                  {editingDirEntry ? 'Редактировать контакт' : 'Новый контакт'}
                </h3>
                <p className="text-xs text-slate-500 font-light mt-0.5">
                  Справочник номеров подразделений, сотрудников и клиентов
                </p>
              </div>
              <button
                onClick={() => setIsDirFormOpen(false)}
                className="text-slate-400 hover:text-slate-650 p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDirEntry} className="space-y-4">
              {dirError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                  <span>{dirError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-slate-650 text-xs font-semibold">ФИО / Наименование организации *</label>
                <input
                  type="text"
                  required
                  value={dirName}
                  onChange={(e) => setDirName(e.target.value)}
                  placeholder="Например: Иван Смирнов, ООО ГазСбыт..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-light"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-655 text-xs font-semibold">Номер телефона / Внутренний номер *</label>
                <input
                  type="text"
                  required
                  value={dirNumber}
                  onChange={(e) => setDirNumber(e.target.value)}
                  placeholder="Например: 101, 79991234567..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-650 text-xs font-semibold">Категория номера</label>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDirType('internal')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                      dirType === 'internal'
                        ? 'bg-red-50 border-red-200 text-red-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Внутренний номер
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirType('client')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                      dirType === 'client'
                        ? 'bg-red-50 border-red-200 text-red-650'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Клиент
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-650 text-xs font-semibold">Комментарий / Отдел (Дополнительно)</label>
                <input
                  type="text"
                  value={dirComment}
                  onChange={(e) => setDirComment(e.target.value)}
                  placeholder="Например: Отдел разработки, Крупный опт..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-light"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDirFormOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingDir}
                  className="bg-red-600 hover:bg-red-700 text-xs font-semibold text-white px-4 py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1 min-w-[90px]"
                >
                  {isSavingDir && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Сохранить</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLICK-TO-CALL AMI STATUS LOGS DIALOG */}
      {isCallingModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <PhoneCall className={`h-5 w-5 ${isC2CLoading ? 'animate-bounce' : ''}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Инициация звонка (Click-to-Call)</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                    Дозвон: <span className="font-semibold text-emerald-400 font-mono">{callingTarget}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCallingModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-md cursor-pointer transition-all"
                title="Закрыть логи"
              >
                ✕
              </button>
            </div>

            {/* Terminal View style console */}
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 h-60 overflow-y-auto font-mono text-[10.5px] text-slate-350 space-y-1.5 scrollbar-thin">
              {callingLog.map((logLine, idx) => {
                let colorClass = 'text-slate-300';
                if (logLine.includes('[Система]')) colorClass = 'text-zinc-500';
                else if (logLine.includes('[AMI-SIMULATOR]')) colorClass = 'text-amber-500 font-light';
                else if (logLine.includes('Error') || logLine.includes('Ошибка') || logLine.includes('fail')) colorClass = 'text-rose-400 font-bold';
                else if (logLine.includes('Success') || logLine.includes('Успешно') || logLine.includes('успешно') || logLine.includes('подтверждена') || logLine.includes('инициирован')) colorClass = 'text-emerald-400 font-medium';
                
                return (
                  <div key={idx} className={colorClass}>
                    {logLine}
                  </div>
                );
              })}
              {isC2CLoading && (
                <div className="flex items-center gap-2 text-emerald-400 animate-pulse pt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Ожидание ответа от Asterisk Call Manager порт 5038...</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCallingModalOpen(false)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-750 text-slate-300 border border-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-all"
              >
                Закрыть окно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
