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
  Network,
  Sun,
  Moon,
  BarChart3,
  Activity,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Copy,
  MoreVertical,
  Target,
  AlertTriangle,
  Home,  Truck,
  Landmark,
  Ban
} from 'lucide-react';
import { CallEntry, DashboardStats, AppSettings, UserRole, DirectoryEntry } from './types';
import packageJson from '../package.json';
import SngrepTab from './modules/monitoring/tabs/monitoring/SngrepTab';
import TcpdumpTab from './modules/monitoring/tabs/monitoring/TcpdumpTab';
import ReportsTab from './components/reports/ReportsTab';
import ActiveCallsTab from './modules/monitoring/tabs/monitoring/ActiveCallsTab';
import AsteriskCliTab from './modules/monitoring/tabs/monitoring/AsteriskCliTab';
import FreepbxCliTab from './modules/monitoring/tabs/monitoring/FreepbxCliTab';
import DbExplorerTab from './modules/monitoring/tabs/monitoring/DbExplorerTab';
import { DirectoryStatusIcon } from './modules/directory/components/DirectoryStatusIcon';
import { fetchDirectory, saveDirectoryEntry, deleteDirectoryEntry } from './modules/directory/services/directoryApi';
import CDRPage from './modules/cdr/pages/CDRPage';
import { extractExternalFromLastdata, isDstBad } from './modules/cdr/utils/callParser';
import { buildCdrQueryParams } from './modules/cdr/utils/buildCdrQueryParams';
import { fetchCdrStats, fetchCdrCalls } from './modules/cdr/services/cdrApi';



const RU_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
const RU_WEEKDAYS_MONDAY_FIRST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const toLocalDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const getDefaultStartDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const formatRussianDate = (value: string) => {
  if (!value) return 'Выберите дату';
  return parseDateInputValue(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

interface RussianDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

function RussianDatePicker({ value, onChange, ariaLabel }: RussianDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = parseDateInputValue(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    if (!isOpen) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value, isOpen]);

  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + index);
    return d;
  });
  const todayValue = toLocalDateInputValue(new Date());

  const changeMonth = (offset: number) => {
    setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <div className="relative">
      <button
        type="button"
        lang="ru-RU"
        aria-label={ariaLabel}
        onClick={() => setIsOpen(prev => !prev)}
        className="min-w-[112px] bg-white border border-slate-200 rounded px-2.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-red-500 hover:border-slate-300 transition-all text-left flex items-center gap-1.5 cursor-pointer"
      >
        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span>{formatRussianDate(value)}</span>
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-500"
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-bold text-slate-800 select-none">
              {RU_MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-500"
              aria-label="Следующий месяц"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1 select-none">
            {RU_WEEKDAYS_MONDAY_FIRST.map(day => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const dayValue = toLocalDateInputValue(day);
              const isSelected = dayValue === value;
              const isToday = dayValue === todayValue;
              const isOutsideMonth = day.getMonth() !== visibleMonth.getMonth();
              return (
                <button
                  key={dayValue}
                  type="button"
                  onClick={() => {
                    onChange(dayValue);
                    setIsOpen(false);
                  }}
                  className={`h-8 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-sm'
                      : isToday
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : isOutsideMonth
                          ? 'text-slate-300 hover:bg-slate-50'
                          : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(todayValue);
              setVisibleMonth(new Date());
              setIsOpen(false);
            }}
            className="mt-3 w-full rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Сегодня
          </button>
        </div>
      )}
    </div>
  );
}

// Front-end state structures
interface UserSession {
  token: string;
  username: string;
  role: UserRole;
  extension?: string;
  disabled?: boolean;
}

const Logo3D = ({ className = "h-5 w-5" }: { className?: string }) => (
  <img src="/freepbx-cdr-logo.svg" className={className} alt="PBXPULS" />
);

interface AccessUser {
  id: string;
  username: string;
  role: UserRole;
  extension?: string;
  disabled?: boolean;
}


interface LiveCallBanner {
  active: boolean;
  direction?: 'incoming' | 'outgoing' | 'internal';
  operatorExt?: string;
  number?: string;
  displayName?: string;
  contactType?: 'internal' | 'client';
  contactComment?: string;
  isSpam?: boolean;
  isBlacklisted?: boolean;
  company?: string;
  position?: string;
  did?: string;
  linkedid?: string;
  durationSec?: number;
  durationText?: string;
  startedAt?: string;
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
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => toLocalDateInputValue(new Date()));
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [statusFilter, setStatusFilter] = useState('ALL'); // Default focus on full log
  const [searchQuery, setSearchQuery] = useState('');
  const [numberFilter, setNumberFilter] = useState('');

  // Dashboard Stats
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Audio Player states
  const [playingRecording, setPlayingRecording] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
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

  // Chronology dialog state
  const [chronologyCallId, setChronologyCallId] = useState<string | null>(null);
  const [chronologyData, setChronologyData] = useState<{
    uniqueid: string;
    linkedid: string;
    legsCount: number;
    timeline: any[];
  } | null>(null);
  const [isChronologyLoading, setIsChronologyLoading] = useState(false);
  const [chronologyError, setChronologyError] = useState<string | null>(null);

  // Active dropdown menu state for row actions
  const [activeDropdownCallId, setActiveDropdownCallId] = useState<string | null>(null);

  const toggleRowDropdown = (uniqueid: string) => {
    setActiveDropdownCallId((prev) => (prev === uniqueid ? null : uniqueid));
  };

  const hasPermission = (perm: 'view_calls' | 'view_directory' | 'view_reports' | 'listen_recordings' | 'make_calls' | 'edit_directory') => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    
    if (session.role === 'directory_only') {
      if (perm === 'view_directory') return true;
      return false;
    }
    
    if (session.role === 'custom') {
      const pSettings: Partial<AppSettings> = settings || {};
      if (perm === 'view_calls') return pSettings.customCanViewCalls !== false;
      if (perm === 'view_directory') return pSettings.customCanViewDirectory !== false;
      if (perm === 'view_reports') return !!pSettings.customCanViewReports;
      if (perm === 'listen_recordings') return pSettings.customCanListenRecordings !== false;
      if (perm === 'make_calls') return pSettings.customCanMakeCalls !== false;
      if (perm === 'edit_directory') return !!pSettings.customCanEditDirectory;
      return false;
    }
    
    if (session.role === 'manager') {
      return true;
    }
    
    if (session.role === 'operator') {
      if (perm === 'view_reports') return false;
      if (perm === 'edit_directory') return false;
      return true;
    }
    
    return false;
  };

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<AppSettings | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingAmi, setIsTestingAmi] = useState(false);
  const [amiTestResult, setAmiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'pbx' | 'directory' | 'access' | 'permissions' | 'appearance'>('pbx');

  // Dark environment / theme settings
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('asterisk_cdr_dark_mode') === 'true';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('asterisk_cdr_dark_mode', String(darkMode));
  }, [darkMode]);

  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState('');
  const [userForm, setUserForm] = useState<{ username: string; password: string; role: UserRole; extension: string; disabled: boolean }>({
    username: '',
    password: '',
    role: 'operator',
    extension: '',
    disabled: false
  });
  const [isDemoClearing, setIsDemoClearing] = useState(false);
  const [isDemoGenerating, setIsDemoGenerating] = useState(false);
  const [demoStatusResult, setDemoStatusResult] = useState<{ success: boolean; message: string } | null>(null);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [dbWarning, setDbWarning] = useState<string | null>(null);

  // Global demo indicator (comes from environment config in the server)
  const [isDemoModeActive, setIsDemoModeActive] = useState<boolean>(false);

  // Auto reload timer
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // in seconds
  const [timeToNextRefresh, setTimeToNextRefresh] = useState<number>(30);

  // --- TELEPHONE DIRECTORY STATE & HANDLERS ---
  const [activeView, setActiveView] = useState<'calls' | 'directory' | 'reports' | 'monitoring'>(() => {
    const saved = localStorage.getItem('asterisk_cdr_active_view') as 'calls' | 'directory' | 'reports' | 'monitoring' | null;
    return saved || 'calls';
  });
  const [liveSessionsData, setLiveSessionsData] = useState<any>(null);
  const [liveSessionsError, setLiveSessionsError] = useState('');
  const [liveSearch, setLiveSearch] = useState('');
  const [isLoadingLiveSessions, setIsLoadingLiveSessions] = useState(false);
  const [isLiveMonitoringPaused, setIsLiveMonitoringPaused] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState('');
  const [tcpdumpStatus, setTcpdumpStatus] = useState<any>(null);
  const [tcpdumpFiles, setTcpdumpFiles] = useState<any[]>([]);
  const [tcpdumpMessage, setTcpdumpMessage] = useState('');
  const [tcpdumpOutput, setTcpdumpOutput] = useState('');
  const [monitorMode, setMonitorMode] = useState<'calls' | 'tcpdump' | 'sngrep' | 'cli' | 'freepbx' | 'db'>(() => {
    const saved = localStorage.getItem('asterisk_cdr_monitor_mode') as 'calls' | 'tcpdump' | 'sngrep' | 'cli' | 'freepbx' | 'db' | null;
    return saved || 'calls';
  });

  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    return localStorage.getItem('asterisk_cdr_sidebar_expanded') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('asterisk_cdr_sidebar_expanded', String(isSidebarExpanded));
  }, [isSidebarExpanded]);

  useEffect(() => {
    localStorage.setItem('asterisk_cdr_active_view', activeView);
  }, [activeView]);

  useEffect(() => {
    localStorage.setItem('asterisk_cdr_monitor_mode', monitorMode);
  }, [monitorMode]);

  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [isDirFormOpen, setIsDirFormOpen] = useState(false);
  const [editingDirEntry, setEditingDirEntry] = useState<DirectoryEntry | null>(null);
  const [dirName, setDirName] = useState('');
  const [dirNumber, setDirNumber] = useState('');
  const [dirPhonesText, setDirPhonesText] = useState('');
  const [dirCompany, setDirCompany] = useState('');
  const [dirPosition, setDirPosition] = useState('');
  const [dirDepartment, setDirDepartment] = useState('');
  const [dirEmail, setDirEmail] = useState('');
  const [dirWebsite, setDirWebsite] = useState('');
  const [dirTagsText, setDirTagsText] = useState('');
  const [dirIsSpam, setDirIsSpam] = useState(false);
  const [dirIsBlacklisted, setDirIsBlacklisted] = useState(false);
  const [dirType, setDirType] = useState<'internal' | 'client' | 'supplier' | 'government'>('internal');
  const [dirComment, setDirComment] = useState('');
  const [dirError, setDirError] = useState('');
  const [isSavingDir, setIsSavingDir] = useState(false);
  const [dirSearchQuery, setDirSearchQuery] = useState('');
  const [dirTypeFilter, setDirTypeFilter] = useState<'all' | 'internal' | 'client' | 'supplier' | 'government' | 'spam'>('all');
  const [urlImportTestResult, setUrlImportTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingUrlImport, setIsTestingUrlImport] = useState(false);
  const [isSyncingDirectoryUrl, setIsSyncingDirectoryUrl] = useState(false);

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

  const getEntryPhones = (entry: DirectoryEntry): string[] => {
    const phones = Array.isArray(entry.phones) ? entry.phones : [];
    const all = [...phones, entry.number].map(v => String(v || '').trim()).filter(Boolean);
    return Array.from(new Set(all));
  };

  const getDirectoryEntryTags = (entry: DirectoryEntry): string[] => {
    return Array.isArray(entry.tags) ? entry.tags : [];
  };

  const resetDirFormFields = () => {
    setEditingDirEntry(null);
    setDirName('');
    setDirNumber('');
    setDirPhonesText('');
    setDirCompany('');
    setDirPosition('');
    setDirDepartment('');
    setDirEmail('');
    setDirWebsite('');
    setDirTagsText('');
    setDirIsSpam(false);
    setDirIsBlacklisted(false);
    setDirType('internal');
    setDirComment('');
    setDirError('');
  };


  // Helper to handle unauthorized status (expired/missing token)
  const handleAuthError = (resp?: Response) => {
    if (session) {
      setSession(null);
      localStorage.removeItem('asterisk_cdr_session');
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingRecording(null);
      setPlayingCallId(null);
      alert('Ваша сессия истекла или недействительна. Пожалуйста, авторизуйтесь заново.');
    }
  };

  // Simple CSV / Text Parser
  const handleParseImport = (text: string) => {
    if (!text.trim()) {
      setParsedImportEntries([]);
      setImportFileError('');
      return;
    }
    try {
      const parseCsvLine = (line: string) => {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          const next = line[i + 1];
          if (ch === '"' && inQuotes && next === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = !inQuotes;
          } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        result.push(cur.trim());
        return result.map(v => v.replace(/^"|"$/g, '').trim());
      };

      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const header = parseCsvLine(lines[0] || '').map(h => h.toLowerCase());
      const hasHeader = header.some(h => ['name','имя','фио','company','компания','phone1','телефон','номер'].includes(h));
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const getByHeader = (cols: string[], ...names: string[]) => {
        for (const name of names) {
          const idx = header.indexOf(name.toLowerCase());
          if (idx >= 0) return cols[idx] || '';
        }
        return '';
      };

      const parsed = dataLines.map((line, index) => {
        const cols = parseCsvLine(line);
        const name = hasHeader ? (getByHeader(cols, 'name','имя','фио','contact','контакт') || cols[0]) : cols[0];
        const company = hasHeader ? getByHeader(cols, 'company','компания','organization','организация') : '';
        const position = hasHeader ? getByHeader(cols, 'position','должность','job','title') : '';
        const phone1 = hasHeader ? (getByHeader(cols, 'phone1','телефон1','номер1','phone','телефон','номер') || cols[1]) : cols[1];
        const phone2 = hasHeader ? getByHeader(cols, 'phone2','телефон2','номер2') : '';
        const phone3 = hasHeader ? getByHeader(cols, 'phone3','телефон3','номер3') : '';
        const email = hasHeader ? getByHeader(cols, 'email','почта','e-mail') : '';
        const website = hasHeader ? getByHeader(cols, 'website','сайт','site') : '';
        const tagsRaw = hasHeader ? getByHeader(cols, 'tags','теги','tag') : '';
        const comment = hasHeader ? getByHeader(cols, 'comment','комментарий','notes') : (cols[3] || '');
        const typeRaw = hasHeader ? getByHeader(cols, 'type','тип') : (cols[2] || '');
        const isSpam = /^(1|true|yes|да)$/i.test(hasHeader ? getByHeader(cols, 'is_spam','spam','спам') : '');
        const isBlacklisted = /^(1|true|yes|да)$/i.test(hasHeader ? getByHeader(cols, 'is_blacklisted','blacklist','черный список','чс') : '');
        const phones = [phone1, phone2, phone3].map(v => String(v || '').trim()).filter(Boolean);
        if (!name || phones.length === 0) return null;

        let type: 'internal' | 'client' = 'client';
        if (typeRaw.includes('internal') || typeRaw.includes('внутр') || phones[0].replace(/\D/g, '').length <= 5) {
          type = 'internal';
        }

        return {
          name: String(name).trim(),
          number: phones[0],
          phones,
          company,
          position,
          email,
          website,
          tags: tagsRaw.split(/[;,|]+/).map(t => t.trim()).filter(Boolean),
          type,
          comment,
          isSpam,
          isBlacklisted
        };
      }).filter(Boolean) as any[];

      setParsedImportEntries(parsed);
      setImportFileError(parsed.length === 0 ? 'Не удалось прочесть корректные записи.' : '');
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
      const BOM = "\uFEFF";
      let csvContent = BOM + "Имя,Компания,Должность,Телефон1,Телефон2,Телефон3,Email,Сайт,Теги,Комментарий,is_spam,is_blacklisted,Тип\r\n";
      csvContent += `"Иванов Иван","РА Выгодно","Директор","79991234567","365200000","","mail@example.com","example.com","VIP;Клиент","Основной контакт",false,false,"client"\r\n`;
      csvContent += `"Техподдержка","","","103","","","","","Внутренний","Внутренний номер отдела",false,false,"internal"\r\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "shablon_importa_kontaktov_v2.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      alert('Ошибка при скачивании шаблона: ' + e.message);
    }
  };

  const handleExportCSV = () => {
    try {
      const BOM = "\uFEFF";
      let csvContent = BOM + "Имя,Компания,Должность,Телефон1,Телефон2,Телефон3,Email,Сайт,Теги,Комментарий,is_spam,is_blacklisted,Тип\r\n";

      directory.forEach(entry => {
        const phones = getEntryPhones(entry);
        const values = [
          entry.name,
          entry.company || '',
          entry.position || '',
          phones[0] || '',
          phones[1] || '',
          phones[2] || '',
          entry.email || '',
          entry.website || '',
          getDirectoryEntryTags(entry).join(';'),
          entry.comment || '',
          entry.isSpam ? 'true' : 'false',
          entry.isBlacklisted ? 'true' : 'false',
          entry.type
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`);
        csvContent += values.join(',') + "\r\n";
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
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
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


  const handleTestUrlImport = async () => {
    if (!draftSettings?.directoryImportUrl) {
      setUrlImportTestResult({ success: false, message: 'Укажите URL файла справочника.' });
      return;
    }
    setIsTestingUrlImport(true);
    setUrlImportTestResult(null);
    try {
      const resp = await fetch('/api/directory/import-url/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.token}`
        },
        body: JSON.stringify({
          url: draftSettings.directoryImportUrl,
          format: draftSettings.directoryImportFormat || 'csv'
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        setUrlImportTestResult({ success: true, message: `Файл прочитан. Найдено контактов: ${data.count}.` });
      } else {
        setUrlImportTestResult({ success: false, message: data.error || 'Ошибка проверки URL.' });
      }
    } catch (e: any) {
      setUrlImportTestResult({ success: false, message: e.message || 'Ошибка связи.' });
    } finally {
      setIsTestingUrlImport(false);
    }
  };

  const handleSyncDirectoryUrl = async () => {
    setIsSyncingDirectoryUrl(true);
    setUrlImportTestResult(null);
    try {
      const resp = await fetch('/api/directory/sync-url', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.token}`
        }
      });
      const data = await resp.json();
      if (resp.ok) {
        setUrlImportTestResult({ success: true, message: data.message || `Синхронизация выполнена. Загружено: ${data.count}.` });
        await loadDirectory();
        await loadAdminSettings();
      } else {
        setUrlImportTestResult({ success: false, message: data.error || 'Ошибка синхронизации.' });
      }
    } catch (e: any) {
      setUrlImportTestResult({ success: false, message: e.message || 'Ошибка связи.' });
    } finally {
      setIsSyncingDirectoryUrl(false);
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
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
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
  const [liveCallBanner, setLiveCallBanner] = useState<LiveCallBanner | null>(null);
  const [isCallingModalOpen, setIsCallingModalOpen] = useState(false);
  const [callingLog, setCallingLog] = useState<string[]>([]);
  const [callingTarget, setCallingTarget] = useState('');
  const [isC2CLoading, setIsC2CLoading] = useState(false);

  useEffect(() => {
    if (session?.role === 'operator') {
      const fixedExt = session.extension || '';
      setMyExt(fixedExt);
      setOnlyMyCalls(true);
      localStorage.setItem('operator_asterisk_ext', fixedExt);
      return;
    }
    localStorage.setItem('operator_asterisk_ext', myExt);
  }, [myExt, session?.role, session?.extension]);

  const handleCopy = (num: string) => {
    navigator.clipboard.writeText(num.trim());
    setCopiedNumber(num.trim());
    setTimeout(() => {
      setCopiedNumber(null);
    }, 1500);
  };

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
    
    const fromExt = session?.role === 'operator' ? (session.extension || myExt) : myExt;
    setCallingTarget(targetName ? `${targetName} (${cleaned})` : cleaned);
    if (session?.role !== 'operator') {
      setCallingLog([
        `[Система] Формирование вызова...`,
        `[Система] Источник звонка (Ваш Ext): ${fromExt}`,
        `[Система] Назначение связи: ${cleaned}`,
        `[Система] Отправка запроса на Asterisk AMI сервер...`
      ]);
      setIsCallingModalOpen(true);
    }
    setIsC2CLoading(true);
    
    try {
      const resp = await fetch('/api/click-to-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.token}`
        },
        body: JSON.stringify({
          fromExtension: (session?.role === 'operator' ? (session.extension || myExt) : myExt).trim(),
          toPhoneNumber: cleaned
        })
      });
      
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      
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

  const loadLiveCallBanner = async () => {
    if (!session || !myExt.trim()) {
      setLiveCallBanner(null);
      return;
    }
    try {
      const qParams = new URLSearchParams({ operatorExt: myExt.trim() });
      const resp = await fetch(`/api/live/call-banner?${qParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${session.token}` }
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      if (!resp.ok) return;
      const data = await resp.json();
      setLiveCallBanner(data && data.active ? data : null);
    } catch (e) {
      // Live popup is auxiliary; ignore network errors here.
    }
  };

  const loadDirectory = async () => {
    if (!session) return;
    setIsLoadingDirectory(true);
    try {
      const data = await fetchDirectory(session.token);
      setDirectory(data);
    } catch (e) {
      console.error('Error loading directory:', e);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  const handleSaveDirEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const phones = [
      dirNumber,
      ...dirPhonesText.split(/[;,\n]+/)
    ].map(v => v.trim()).filter(Boolean);
    const uniquePhones = Array.from(new Set(phones));

    if (!dirName.trim() || uniquePhones.length === 0) {
      setDirError('Пожалуйста, заполните имя и хотя бы один номер телефона.');
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
          number: uniquePhones[0],
          phones: uniquePhones,
          type: dirType,
          company: dirCompany,
          position: dirPosition,
          department: dirDepartment.trim(),
          email: dirEmail,
          website: dirWebsite,
          tags: dirTagsText.split(/[;,|]+/).map(t => t.trim()).filter(Boolean),
          isSpam: dirIsSpam,
          isBlacklisted: dirIsBlacklisted,
          comment: dirComment
        })
      });

      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }

      const data = await resp.json();
      if (resp.ok) {
        await loadDirectory();
        loadCalls(page);
        setIsDirFormOpen(false);
        resetDirFormFields();
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
      if (!session?.token) return;
      await deleteDirectoryEntry(session.token, id);
      await loadDirectory();
      loadCalls(page);
    } catch (e) {
      console.error(e);
      alert('Ошибка при соединении с сервером.');
    }
  };

  const handleToggleBlacklist = async (entry: DirectoryEntry, enabled: boolean, syncAsterisk = true) => {
    if (!session || session.role !== 'admin') return;
    try {
      const resp = await fetch(`/api/directory/${entry.id}/blacklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({ enabled, syncAsterisk })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        await loadDirectory();
        alert(enabled ? 'Контакт добавлен в черный список.' : 'Контакт удален из черного списка.');
      } else {
        alert(data.error || 'Не удалось изменить черный список.');
      }
    } catch (e: any) {
      alert(e.message || 'Ошибка связи с сервером.');
    }
  };

  const openEditDirEntry = (entry: DirectoryEntry) => {
    const phones = getEntryPhones(entry);
    setEditingDirEntry(entry);
    setDirName(entry.name);
    setDirNumber(phones[0] || entry.number || '');
    setDirPhonesText(phones.slice(1).join('\n'));
    setDirCompany(entry.company || '');
    setDirPosition(entry.position || '');
    setDirDepartment((entry as any).department || '');
    setDirEmail(entry.email || '');
    setDirWebsite(entry.website || '');
    setDirTagsText(getDirectoryEntryTags(entry).join('; '));
    setDirIsSpam(!!entry.isSpam);
    setDirIsBlacklisted(!!entry.isBlacklisted);
    setDirType(entry.type);
    setDirComment(entry.comment || '');
    setDirError('');
    setIsDirFormOpen(true);
  };

  const openCreateDirEntry = () => {
    resetDirFormFields();
    setIsDirFormOpen(true);
  };

  const openAddFromCall = (number: string, initialName?: string) => {
    resetDirFormFields();
    setDirName(initialName || '');
    setDirNumber(number);
    setDirType('client');
    setDirComment('Добавлен из реестра звонков');
    setIsDirFormOpen(true);
  };

  // Fetch Dashboard Stats
  const loadStats = async () => {
    if (!session) return;
    setIsLoadingStats(true);
    try {
      const qParams = buildCdrQueryParams({
        isDemoModeActive,
        startDate,
        endDate,
        startTime,
        endTime,
        statusFilter,
        searchQuery,
        numberFilter,
        myExt,
        onlyMyCalls
      });
      const data = await fetchCdrStats(qParams, session.token);

      setStats(data);

      if (data.dbError) {
        setDbWarning(data.dbError);
      }

      if (data.demoModeActive !== undefined) {
        setIsDemoModeActive(data.demoModeActive);
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
      const qParams = buildCdrQueryParams({
        page: targetPage,
        limit,
        isDemoModeActive,
        startDate,
        endDate,
        startTime,
        endTime,
        statusFilter,
        searchQuery,
        numberFilter,
        myExt,
        onlyMyCalls
      });

      const data = await fetchCdrCalls(qParams, session.token);
      setCalls(data.calls);
      setTotalCalls(data.total);
      setTotalPages(data.totalPages || 1);
      setPage(data.page || 1);
      setCallsError(null);

      if (data.dbError) {
        setDbWarning(data.dbError);
      } else {
        setDbWarning(null);
      }

      if (data.demoModeActive !== undefined) {
        setIsDemoModeActive(data.demoModeActive);
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
          role: data.user.role,
          extension: data.user.extension || '',
          disabled: !!data.user.disabled
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

  // Fetch Call Routing Chronology
  const fetchChronology = async (uniqueid: string) => {
    setChronologyCallId(uniqueid);
    setIsChronologyLoading(true);
    setChronologyError(null);
    setChronologyData(null);
    try {
      const token = session?.token || localStorage.getItem('asterisk_cdr_session') || '';
      const resp = await fetch(`/api/calls/${uniqueid}/chronology`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (data.success) {
        setChronologyData(data);
      } else {
        setChronologyError(data.message || 'Не удалось загрузить хронологию вызова.');
      }
    } catch (err: any) {
      console.error('Error in fetchChronology:', err);
      setChronologyError(err.message || 'Ошибка сети при получении хронологии.');
    } finally {
      setIsChronologyLoading(false);
    }
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

      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }

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
    if (!session) return;
    setDbTestResult(null);
    setAmiTestResult(null);
    try {
      const resp = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      if (resp.ok) {
        const data = await resp.json();
        setSettings(data);
        setDraftSettings(JSON.parse(JSON.stringify(data)));
        if (session.role === 'admin') {
          await loadAccessUsers();
        }
      }
    } catch (e) {
      console.error('Error fetching system configurations:', e);
    }
  };

  const loadAccessUsers = async () => {
    if (!session || session.role !== 'admin') return;
    setIsLoadingUsers(true);
    try {
      const resp = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${session.token}` } });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      if (resp.ok) {
        const data = await resp.json();
        setAccessUsers(data);
      }
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({ username: '', password: '', role: 'operator', extension: '', disabled: false });
    setAccessError('');
  };

  const openEditUser = (user: AccessUser) => {
    setEditingUserId(user.id);
    setUserForm({ username: user.username, password: '', role: user.role, extension: user.extension || '', disabled: !!user.disabled });
    setAccessError('');
    setSettingsTab('access');
  };

  const saveAccessUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!session || session.role !== 'admin') return;
    if (!userForm.username.trim()) {
      setAccessError('Укажите логин пользователя.');
      return;
    }
    if (!editingUserId && !userForm.password.trim()) {
      setAccessError('Для нового пользователя нужен пароль.');
      return;
    }
    setIsSavingUser(true);
    setAccessError('');
    try {
      const url = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
      const method = editingUserId ? 'PUT' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
        body: JSON.stringify(userForm)
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        await loadAccessUsers();
        resetUserForm();
      } else {
        setAccessError(data.error || 'Не удалось сохранить пользователя.');
      }
    } catch (e: any) {
      setAccessError(e.message || 'Ошибка соединения с сервером.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const deleteAccessUser = async (user: AccessUser) => {
    if (!session || session.role !== 'admin') return;
    if (!window.confirm(`Удалить пользователя ${user.username}?`)) return;
    try {
      const resp = await fetch(`/api/users/${user.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session.token}` } });
      if (resp.ok) {
        await loadAccessUsers();
        if (editingUserId === user.id) resetUserForm();
      } else {
        const data = await resp.json().catch(() => ({}));
        alert(data.error || 'Не удалось удалить пользователя.');
      }
    } catch (e: any) {
      alert(e.message || 'Ошибка соединения с сервером.');
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

      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }

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
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
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
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
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

  // Connection Test routine for MariaDB
  const testDbConnection = async () => {
    if (!draftSettings || !session) return;
    setIsTestingDb(true);
    setDbTestResult(null);
    
    try {
      const resp = await fetch('/api/settings/test-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(draftSettings)
      });
      
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      
      const data = await resp.json();
      if (resp.ok) {
        setDbTestResult({
          success: true,
          message: data.message || 'Подключение установлено успешно! MariaDB asteriskcdrdb доступна на чтение.'
        });
      } else {
        setDbTestResult({
          success: false,
          message: data.error || 'Не удалось проверить подключение к базе данных. Проверьте хост и доступы.'
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

  // Connection Test routine for Asterisk AMI
  const testAmiConnection = async () => {
    if (!draftSettings || !session) return;
    setIsTestingAmi(true);
    setAmiTestResult(null);
    
    try {
      const resp = await fetch('/api/settings/test-ami', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(draftSettings)
      });
      
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      
      const data = await resp.json();
      if (resp.ok) {
        setAmiTestResult({
          success: true,
          message: data.message || 'Подключение к Asterisk AMI успешно установлено!'
        });
      } else {
        setAmiTestResult({
          success: false,
          message: data.error || 'Не удалось подключиться к Asterisk AMI.'
        });
      }
    } catch (err: any) {
      setAmiTestResult({
        success: false,
        message: `Ошибка сокета: ${err.message || 'сервер недоступен'}`
      });
    } finally {
      setIsTestingAmi(false);
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

  // Poll active AMI channels for live call popup
  useEffect(() => {
    if (!session || !myExt.trim()) {
      setLiveCallBanner(null);
      return;
    }
    loadLiveCallBanner();
    const interval = setInterval(loadLiveCallBanner, 2000);
    return () => clearInterval(interval);
  }, [session, myExt]);

  // Trigger main loads on mount or settings pivot
  useEffect(() => {
    if (session) {
      reloadData(1);
      loadDirectory();
      loadAdminSettings();
    }
  }, [session, startDate, endDate, startTime, endTime, statusFilter, isDemoModeActive, onlyMyCalls, myExt]);

  // Adjust active view based on permissions
  useEffect(() => {
    if (session) {
      if (activeView === 'calls' && !hasPermission('view_calls')) {
        if (hasPermission('view_directory')) {
          setActiveView('directory');
          loadDirectory();
        } else if (hasPermission('view_reports')) {
          setActiveView('reports');
        }
      }
    }
  }, [session, settings, activeView]);

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
  }, [session, page, autoRefreshInterval, startDate, endDate, startTime, endTime, statusFilter, isDemoModeActive, searchQuery, numberFilter, onlyMyCalls, myExt]);

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
    
    setStartDate(toLocalDateInputValue(start));
    setEndDate(toLocalDateInputValue(new Date()));
    setStartTime('00:00');
    setEndTime('23:59');
    setPage(1);
  };

  const applyThisMonthPreset = () => {
    const start = new Date();
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    setStartDate(`${year}-${month}-01`);
    setEndDate(toLocalDateInputValue(new Date()));
    setStartTime('00:00');
    setEndTime('23:59');
    setPage(1);
  };

  if (!session) {
    return (
      <div id="login-container" className="min-h-screen flex items-center justify-center bg-slate-100 p-4 relative overflow-hidden">
        {/* Animated ambient background vectors */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(241,245,249,0.95),rgba(226,232,240,1))] z-0" />
        
        <div className="relative w-full max-w-md bg-white  rounded-2xl border border-slate-200 p-8 shadow-xl z-10">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-white p-2.5 rounded-2xl mb-4 border border-slate-200/80 shadow-md">
              <Logo3D className="h-10 w-10 md:h-12 md:w-12" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 text-center tracking-tight flex items-center justify-center gap-2 font-sans">
              FreePBX CDR Missed Calls
              <span className="text-[10px] bg-slate-100 text-slate-600 font-normal px-1.5 py-0.5 rounded-md border border-slate-200">
                v{packageJson.version}
              </span>
            </h1>
            <p className="text-slate-500 text-xs mt-1 text-center font-light">
              Система мониторинга и отработки неотвеченных вызовов VoIP
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-00 text-sm rounded-lg flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-red-650 shrink-0 mt-0.5" />
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

  const renderReportsView = () => {
    return (
      <ReportsTab
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        operatorExt={myExt}
        onlyMyCalls={onlyMyCalls}
        accessUsers={accessUsers}
        directory={directory}
        settings={settings}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />
    );
  };



  const loadLiveSessions = async () => {
    setIsLoadingLiveSessions(true);
    setLiveSessionsError('');

    try {
      const response = await fetch('/api/live-sessions-test');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ошибка загрузки активных сессий');
      }

      setLiveSessionsData(data);
    } catch (error: any) {
      setLiveSessionsError(error.message || 'Ошибка загрузки активных сессий');
    } finally {
      setIsLoadingLiveSessions(false);
    }
  };

  const saveLiveSessionsLog = () => {
    const payload = {
      createdAt: new Date().toISOString(),
      data: liveSessionsData
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `pbxpuls-live-sessions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (activeView !== 'monitoring') return;
    if (isLiveMonitoringPaused) return;

    loadLiveSessions();
    const timer = setInterval(loadLiveSessions, 2000);

    return () => clearInterval(timer);
  }, [activeView, isLiveMonitoringPaused]);

  const saveLiveSnapshot = async () => {
    try {
      const payload = {
        createdAt: new Date().toISOString(),
        summary: liveSessionsData?.summary || {},
        calls: liveSessionsData?.calls || [],
        sessions: liveSessionsData?.sessions || [],
        raw: liveSessionsData?.raw || {}
      };

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `pbxpuls-live-snapshot-${stamp}.json`;

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSnapshotStatus('Снимок скачан на компьютер: ' + filename);
    } catch (e: any) {
      setSnapshotStatus('Ошибка: ' + (e.message || String(e)));
    }
  };


  const loadTcpdumpStatus = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/status');
      const data = await res.json();
      setTcpdumpStatus(data);
    } catch {}
  };

  const loadTcpdumpFiles = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/files');
      const data = await res.json();
      if (data.success) setTcpdumpFiles(data.files || []);
    } catch {}
  };

  const startTcpdump = async (mode: string) => {
    setTcpdumpMessage('Запускаю tcpdump...');
    try {
      const res = await fetch('/api/diagnostics/tcpdump/start?mode=' + encodeURIComponent(mode) + '&iface=any', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Ошибка запуска tcpdump');
      setTcpdumpMessage('tcpdump запущен: ' + mode);
      await loadTcpdumpStatus();
      await loadTcpdumpFiles();
      await loadTcpdumpOutput();
    } catch (e: any) {
      setTcpdumpMessage('Ошибка: ' + (e.message || String(e)));
    }
  };

  const stopTcpdump = async () => {
    setTcpdumpMessage('Останавливаю tcpdump...');
    try {
      const res = await fetch('/api/diagnostics/tcpdump/stop', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Ошибка остановки tcpdump');
      setTcpdumpMessage('tcpdump остановлен');
      await loadTcpdumpStatus();
      await loadTcpdumpFiles();
    } catch (e: any) {
      setTcpdumpMessage('Ошибка: ' + (e.message || String(e)));
    }
  };

  const formatBytes = (bytes: any) => {
    const n = Number(bytes || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };


  const loadTcpdumpOutput = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/output');
      const data = await res.json();
      if (data.success) setTcpdumpOutput(data.output || '');
    } catch {}
  };

  useEffect(() => {
    if (activeView !== 'monitoring') return;
    const t = setInterval(() => {
      loadTcpdumpStatus();
      loadTcpdumpOutput();
    }, 2000);
    return () => clearInterval(t);
  }, [activeView]);

  const renderMonitoringView = () => {
    const monitoringTitle =
      monitorMode === 'calls' ? 'Активные звонки' :
      monitorMode === 'tcpdump' ? 'TCPDUMP / SIP-RTP' :
      monitorMode === 'sngrep' ? 'SNGREP' :
      monitorMode === 'cli' ? 'Asterisk CLI' :
      monitorMode === 'freepbx' ? 'FreePBX CLI' :
      monitorMode === 'db' ? 'DB Explorer' :
      'Мониторинг';

    const monitoringSubtitle =
      monitorMode === 'calls' ? 'Источник: AMI → core show channels concise / verbose / queue show' :
      monitorMode === 'tcpdump' ? 'Захват и анализ сетевого трафика SIP/RTP через tcpdump' :
      monitorMode === 'sngrep' ? 'Анализ SIP-диалогов и событий сигнализации' :
      monitorMode === 'cli' ? 'Безопасные команды Asterisk CLI через AMI' :
      monitorMode === 'freepbx' ? 'Команды FreePBX fwconsole' :
      monitorMode === 'db' ? 'Просмотр CDR/CEL и таблиц FreePBX/Asterisk' :
      '';
    const sessions = liveSessionsData?.sessions || [];
    const q = liveSearch.trim().toLowerCase();

    const getExtFromChannel = (channel: string) => {
      const m = String(channel || '').match(/(?:SIP|PJSIP|Local)\/([^\-@/]+)/i);
      return m ? m[1] : '';
    };

    const getTargetFromAppData = (appData: string) => {
      const m = String(appData || '').match(/(?:SIP|PJSIP|Local)\/([^,\-@/]+)/i);
      return m ? m[1] : '';
    };

    const getDialTargetsFromAppData = (appData: string): string[] => {
      const text = String(appData || '');
      const firstArg = text.split(',')[0] || '';

      return firstArg
        .split('&')
        .map(part => {
          const cleanPart = part.trim();

          const slashParts = cleanPart.split('/');
          if (slashParts.length >= 3) {
            return slashParts[slashParts.length - 1].replace(/@.*$/, '').replace(/-.*/, '');
          }

          const m = cleanPart.match(/(?:SIP|PJSIP|Local)\/([^\/@,]+)/i);
          return m ? m[1].replace(/@.*$/, '').replace(/-.*/, '') : '';
        })
        .filter(Boolean);
    };

    const getDialPeersFromAppData = (appData: string): string[] => {
      const text = String(appData || '');
      const firstArg = text.split(',')[0] || '';

      return firstArg
        .split('&')
        .map(part => {
          const m = part.match(/(?:SIP|PJSIP|Local)\/([^\/@,]+)/i);
          return m ? m[1].replace(/@.*$/, '').replace(/-.*/, '') : '';
        })
        .filter(Boolean);
    };

    const isInternalNum = (value: string) => /^\d{2,5}$/.test(String(value || ''));

    const groupedCalls = (() => {
      const dialLegs = sessions.filter((item: any) => String(item.application || '').toLowerCase() === 'dial');
      const used = new Set<number>();
      const result: any[] = [];

      dialLegs.forEach((dialLeg: any) => {
        const dialIndex = sessions.indexOf(dialLeg);
        used.add(dialIndex);

        const fromByChannel = getExtFromChannel(dialLeg.channel);
        const targets = getDialTargetsFromAppData(dialLeg.appData);
        const peers = getDialPeersFromAppData(dialLeg.appData);

        const isInboundGroup =
          targets.length > 1 ||
          (!isInternalNum(fromByChannel) && targets.some((x: string) => isInternalNum(x)));

        const related = [dialLeg];

        sessions.forEach((item: any, idx: number) => {
          if (used.has(idx)) return;

          const ch = String(item.channel || '');
          const ext = getExtFromChannel(ch);
          const caller = String(item.callerId || '');
          const exten = String(item.exten || '');

          const isRelated =
            peers.some((peer: string) => peer && ch.toLowerCase().includes(peer.toLowerCase())) ||
            targets.includes(ext) ||
            targets.includes(caller) ||
            targets.includes(exten);

          if (isRelated) {
            related.push(item);
            used.add(idx);
          }
        });

        let from = '';
        let to = '';

        if (isInboundGroup) {
          from = dialLeg.callerId || fromByChannel || '';
          to = targets.length > 1 ? `Группа ${targets.join(', ')}` : (targets[0] || dialLeg.exten || '');
        } else {
          from = fromByChannel || dialLeg.callerId || '';
          to = targets[0] || dialLeg.exten || '';
        }

        const state = related.some((x: any) => String(x.state).toLowerCase() === 'up')
          ? 'Up'
          : related.some((x: any) => String(x.state).toLowerCase().includes('ring'))
            ? 'Ringing'
            : related.some((x: any) => String(x.state).toLowerCase().includes('down'))
              ? 'Down'
              : (dialLeg.state || '—');

        result.push({
          bridgeKey: related.map((x: any) => x.bridgedChannel).filter(Boolean).join(' / ') || dialLeg.uniqueid,
          from,
          to,
          label: from && to ? `${from} → ${to}` : (from || to || dialLeg.uniqueid),
          state,
          duration: Math.max(...related.map((x: any) => Number(x.duration || 0))),
          channels: related,
          searchText: JSON.stringify({ from, to, state, related }).toLowerCase()
        });
      });

      sessions.forEach((item: any, idx: number) => {
        if (used.has(idx)) return;

        const from = item.callerId || getExtFromChannel(item.channel) || '';
        const to = item.exten || getExtFromChannel(item.channel) || '';

        result.push({
          bridgeKey: item.bridgedChannel || item.bridgedUniqueid || item.uniqueid || item.channel,
          from,
          to,
          label: from && to ? `${from} → ${to}` : (from || to || item.channel),
          state: item.state || '—',
          duration: Number(item.duration || 0),
          channels: [item],
          searchText: JSON.stringify(item).toLowerCase()
        });
      });

      return result;
    })();

    const filteredCalls = groupedCalls.filter((item: any) => !q || item.searchText.includes(q));

    const getCallKindLabel = (call: any) => {
      const to = String(call.to || '');
      const from = String(call.from || '');

      if (to.startsWith('Группа')) return 'Входящий на группу';
      if (/^\d{7,}$/.test(to.replace(/\D/g, ''))) return 'Исходящий';
      if (/^\d{2,5}$/.test(from) && /^\d{2,5}$/.test(to)) return 'Внутренний';

      return 'Входящий';
    };

    const formatDuration = (seconds: any) => {
      const total = Number(seconds || 0);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;

      return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
    };

    const getTrunkFromAppData = (appData: string) => {
      const text = String(appData || '');
      const m = text.match(/(?:SIP|PJSIP)\/([^\/,&]+)/i);
      return m ? m[1].replace(/-.*/, '') : '';
    };

    const getCallTimelineSteps = (call: any) => {
      const now = liveSessionsData?.summary?.updatedAt
        ? new Date(liveSessionsData.summary.updatedAt).toLocaleTimeString('ru-RU')
        : new Date().toLocaleTimeString('ru-RU');

      const channels = call.channels || [];
      const firstDial = channels.find((ch: any) => String(ch.application || '').toLowerCase() === 'dial');
      const trunk = getTrunkFromAppData(firstDial?.appData || '');

      const events: any[] = [];

      events.push({ time: now, title: 'Создана активная сессия', detail: call.label || '—' });

      if (call.from) {
        events.push({ time: now, title: 'Источник вызова', detail: call.from });
      }

      if (trunk) {
        events.push({ time: now, title: 'Выбран транк / направление', detail: trunk });
      }

      channels.forEach((ch: any) => {
        if (ch.context) {
          events.push({ time: now, title: 'Контекст Asterisk', detail: ch.context });
        }

        if (ch.application) {
          events.push({ time: now, title: 'Приложение', detail: ch.application + (ch.appData ? ' → ' + ch.appData : '') });
        }

        if (String(ch.state || '').toLowerCase().includes('ring')) {
          events.push({ time: now, title: 'Идёт вызов / Ringing', detail: ch.channel || ch.callerId || '—' });
        }

        if (String(ch.state || '').toLowerCase() === 'up') {
          events.push({ time: now, title: 'Разговор установлен / Up', detail: ch.channel || ch.callerId || '—' });
        }

        if (String(ch.state || '').toLowerCase().includes('down')) {
          events.push({ time: now, title: 'Канал ещё не поднят / Down', detail: ch.channel || ch.callerId || '—' });
        }
      });

      if (call.to) {
        events.push({ time: now, title: 'Назначение вызова', detail: call.to });
      }

      return events;
    };

    const getCallPathSteps = (call: any) => {
      const firstDial = (call.channels || []).find((ch: any) => String(ch.application || '').toLowerCase() === 'dial');
      const trunk = getTrunkFromAppData(firstDial?.appData || '');
      const contexts = Array.from(new Set((call.channels || []).map((ch: any) => ch.context).filter(Boolean)));
      const apps = Array.from(new Set((call.channels || []).map((ch: any) => ch.application).filter(Boolean)));

      const steps = [
        { label: 'Источник', value: call.from || '—' },
        ...contexts.map((ctx: any) => ({ label: 'Контекст', value: ctx })),
        ...(trunk ? [{ label: 'Транк / направление', value: trunk }] : []),
        ...apps.map((app: any) => ({ label: 'Приложение', value: app })),
        { label: 'Назначение', value: call.to || '—' },
      ];

      return steps;
    };

    const filteredSessions = sessions.filter((item: any) => {
      if (!q) return true;
      return JSON.stringify(item).toLowerCase().includes(q);
    });

    return (
      <section className="space-y-4 animate-fade-in">
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-[#334155] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => setMonitorMode('calls')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'calls'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Активные звонки
              </button>

              <button
                onClick={() => setMonitorMode('tcpdump')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'tcpdump'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                TCPDUMP / SIP-RTP
              </button>

              <button
                onClick={() => setMonitorMode('sngrep')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'sngrep'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                SNGREP
              </button>

              <button
                onClick={() => setMonitorMode('cli')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'cli'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Asterisk CLI
              </button>

              <button
                onClick={() => setMonitorMode('freepbx')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'freepbx'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                FreePBX CLI
              </button>

              <button
                onClick={() => setMonitorMode('db')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'db'
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                DB Explorer
              </button>
              </div>

              {monitorMode === 'calls' && (
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{monitoringTitle}</h2>
              )}
              {monitorMode === 'calls' && (
                <p className="text-xs text-slate-500 mt-1">{monitoringSubtitle}</p>
              )}
            </div>

            {monitorMode === 'calls' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={liveSearch}
                  onChange={(e) => setLiveSearch(e.target.value)}
                  placeholder="Поиск по любым данным..."
                  className="pl-8 pr-3 py-2 w-72 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                onClick={saveLiveSnapshot}
                className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                Снимок в файл
              </button>

              <button
                onClick={() => setIsLiveMonitoringPaused(!isLiveMonitoringPaused)}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer border ${
                  isLiveMonitoringPaused
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {isLiveMonitoringPaused ? 'Продолжить' : 'Зафиксировать'}
              </button>

              <button
                onClick={loadLiveSessions}
                disabled={isLiveMonitoringPaused}
                className={`px-3 py-2 border rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer ${
                  isLiveMonitoringPaused
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-blue-50 text-blue-700 border-blue-100'
                }`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLiveSessions ? 'animate-spin' : ''}`} />
                Обновить
              </button>
            </div>
            )}
          </div>

          {monitorMode === 'tcpdump' && (
            <TcpdumpTab />
          )}

          {monitorMode === 'sngrep' && (
            <SngrepTab
              tcpdumpOutput={tcpdumpOutput}
              loadTcpdumpOutput={loadTcpdumpOutput}
            />
          )}

          {monitorMode === 'cli' && (
            <AsteriskCliTab />
          )}

          {monitorMode === 'freepbx' && (
            <FreepbxCliTab />
          )}

          {monitorMode === 'db' && (
            <DbExplorerTab />
          )}

          {snapshotStatus && (
            <div className="p-3 text-xs font-bold text-emerald-700 bg-emerald-50 border-b border-emerald-100">
              {snapshotStatus}
            </div>
          )}

          {isLiveMonitoringPaused && (
            <div className="p-3 text-xs font-bold text-amber-700 bg-amber-50 border-b border-amber-100">
              Снимок зафиксирован. Автообновление остановлено для анализа.
            </div>
          )}

          {liveSessionsError && (
            <div className="p-4 text-sm font-bold text-red-600 bg-red-50 border-b border-red-100">
              {liveSessionsError}
            </div>
          )}

          {monitorMode === 'calls' && (
            <ActiveCallsTab
              liveSessionsData={liveSessionsData}
              liveSearch={liveSearch}
              setLiveSearch={setLiveSearch}
            />
          )}

          <details className={(monitorMode === "calls" ? "block " : "hidden ") + "border-t border-slate-200 dark:border-[#334155]"}>
            <summary className="p-4 cursor-pointer text-xs font-bold text-slate-500">RAW: core show channels concise</summary>
            <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] overflow-auto max-h-[420px]">{liveSessionsData?.raw?.concise || 'Нет данных'}</pre>
          </details>

          <details className={(monitorMode === "calls" ? "block " : "hidden ") + "border-t border-slate-200 dark:border-[#334155]"}>
            <summary className="p-4 cursor-pointer text-xs font-bold text-slate-500">RAW: core show channels verbose</summary>
            <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] overflow-auto max-h-[420px]">{liveSessionsData?.raw?.verbose || 'Нет данных'}</pre>
          </details>

          <details className={(monitorMode === "calls" ? "block " : "hidden ") + "border-t border-slate-200 dark:border-[#334155]"}>
            <summary className="p-4 cursor-pointer text-xs font-bold text-slate-500">RAW: queue show</summary>
            <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] overflow-auto max-h-[420px]">{liveSessionsData?.raw?.queues || 'Нет данных'}</pre>
          </details>

          <details className={(monitorMode === "calls" ? "block " : "hidden ") + "border-t border-slate-200 dark:border-[#334155]"}>
            <summary className="p-4 cursor-pointer text-xs font-bold text-slate-500">RAW: sip show channels</summary>
            <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] overflow-auto max-h-[420px]">{liveSessionsData?.raw?.sipChannels || 'Нет данных'}</pre>
          </details>

          <details className={(monitorMode === "calls" ? "block " : "hidden ") + "border-t border-slate-200 dark:border-[#334155]"}>
            <summary className="p-4 cursor-pointer text-xs font-bold text-slate-500">RAW: pjsip show channels</summary>
            <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] overflow-auto max-h-[420px]">{liveSessionsData?.raw?.pjsipChannels || 'Нет данных'}</pre>
          </details>

          {/* PBXPULS_ACTIVE_CALLS_BOTTOM_COUNTERS */}
          {monitorMode === 'calls' && (
            <div className="sticky bottom-0 z-20 border-t border-slate-200 dark:border-[#334155] bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur px-4 py-3">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">Активные каналы</div>
                  <div className="mt-1 text-xl font-black text-slate-900 dark:text-white font-mono">{liveSessionsData?.summary?.total ?? 0}</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">Звонков</div>
                  <div className="mt-1 text-xl font-black text-indigo-600 font-mono">{filteredCalls.length}</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">Разговор</div>
                  <div className="mt-1 text-xl font-black text-emerald-600 font-mono">{liveSessionsData?.summary?.up ?? 0}</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">Звонит</div>
                  <div className="mt-1 text-xl font-black text-cyan-600 font-mono">{liveSessionsData?.summary?.ringing ?? 0}</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-[#334155] rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">Обновление</div>
                  <div className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {liveSessionsData?.summary?.updatedAt ? new Date(liveSessionsData.summary.updatedAt).toLocaleTimeString('ru-RU') : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>
    );
  };


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-800 dark:text-[#f1f5f9] flex font-sans">
      {/* Hidden HTML-5 Audio Node references */}
      <audio ref={audioRef} className="hidden" />

      {/* LEFT SIDEBAR VIEW PLATFORM */}
      <aside className={`${isSidebarExpanded ? 'w-64' : 'w-16 md:w-20'} bg-white dark:bg-[#1e293b] border-r border-slate-200 dark:border-[#334155] flex flex-col items-center justify-between py-5 shrink-0 sticky top-0 h-screen select-none z-30 transition-all duration-300 shadow-xs`}>
        <div className={`flex flex-col ${isSidebarExpanded ? 'items-start px-4' : 'items-center'} gap-6 w-full`}>
          {/* Logo Element resembling high-end layers icon */}
          <div className={`flex items-center ${isSidebarExpanded ? 'gap-2 w-full' : 'justify-center w-full'}`}>
            <div className="h-[45px] w-[45px] flex items-center justify-center active:scale-95 transition-transform cursor-pointer shrink-0">
              <Logo3D className="h-[45px] w-[45px]" />
            </div>
            {isSidebarExpanded && (
              <div className="min-w-0 animate-fade-in">
                <span className="font-bold text-[#0f2557] dark:text-slate-100 text-[24px] tracking-tight uppercase block leading-none">PBXPULS</span>
                
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <div className={`flex flex-col ${isSidebarExpanded ? 'items-stretch' : 'items-center'} gap-2 w-full ${isSidebarExpanded ? '' : 'px-2'}`}>
            {/* Phone Registry */}
            {hasPermission('view_calls') && (
              <button
                onClick={() => setActiveView('calls')}
                className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                  activeView === 'calls'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
                title={isSidebarExpanded ? "" : "Реестр звонков"}
              >
                <Phone className="h-5 w-5 shrink-0" />
                {isSidebarExpanded && (
                  <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                    Реестр звонков
                  </span>
                )}
                {!isSidebarExpanded && (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                    Реестр звонков
                  </span>
                )}
              </button>
            )}

            {/* BookOpen (Directory) */}
            {hasPermission('view_directory') && (
              <button
                onClick={() => {
                  setActiveView('directory');
                  loadDirectory();
                }}
                className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                  activeView === 'directory'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
                title={isSidebarExpanded ? "" : "Телефонный справочник"}
              >
                <BookOpen className="h-5 w-5 shrink-0" />
                {isSidebarExpanded && (
                  <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                    Справочник
                  </span>
                )}
                {!isSidebarExpanded && (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                    Телефонный справочник
                  </span>
                )}
              </button>
            )}

            {/* Reports analytics (BarChart3 icon) */}
            {hasPermission('view_reports') && (
              <button
                onClick={() => setActiveView('reports')}
                className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                  activeView === 'reports'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
                title={isSidebarExpanded ? "" : "Отчеты и аналитика"}
              >
                <BarChart3 className="h-5 w-5 shrink-0" />
                {isSidebarExpanded && (
                  <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                    Отчеты и аналитика
                  </span>
                )}
                {!isSidebarExpanded && (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                    Отчеты и аналитика
                  </span>
                )}
              </button>
            )}
          
              {/* SIDEBAR_MONITORING */}
              {hasPermission('view_reports') && (
                <button
                  onClick={() => setActiveView('monitoring')}
                  className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                    activeView === 'monitoring'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }`}
                  title={isSidebarExpanded ? "" : "Мониторинг"}
                >
                  <Activity className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      Мониторинг
                    </span>
                  )}
                </button>
              )}

          </div>
        </div>

        {/* Bottom controls */}
        <div className={`flex flex-col ${isSidebarExpanded ? 'items-stretch px-4' : 'items-center'} gap-2 w-full ${isSidebarExpanded ? '' : 'px-2'}`}>
          {/* Collapse/Expand Sidebar Trigger Button */}
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent transition-all relative group cursor-pointer`}
            title={isSidebarExpanded ? "Свернуть меню" : "Развернуть меню"}
          >
            {isSidebarExpanded ? (
              <>
                <ChevronLeft className="h-5 w-5 shrink-0" />
                <span className="text-xs font-semibold truncate animate-fade-in text-slate-755 dark:text-slate-200">Свернуть меню</span>
              </>
            ) : (
              <>
                <ChevronRight className="h-5 w-5 shrink-0" />
                <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                  Развернуть меню
                </span>
              </>
            )}
          </button>

          {/* Settings icon */}
          <button
            onClick={() => {
              if (session?.role === 'admin') {
                loadAdminSettings();
                setSettingsTab('pbx');
              } else {
                setSettingsTab('appearance');
              }
              setIsSettingsOpen(true);
            }}
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent transition-all relative group cursor-pointer`}
            title={isSidebarExpanded ? "" : "Настройки"}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {isSidebarExpanded && (
              <span className="text-xs font-semibold truncate animate-fade-in text-slate-755 dark:text-slate-200">Настройки</span>
            )}
            {!isSidebarExpanded && (
              <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                Настройки системы
              </span>
            )}
          </button>

          {/* Help panel triggers general guidelines */}
          <button
            onClick={() => alert(`Freepbx CDR Missed Calls v${packageJson.version}. Разработано для корпоративных телефонных сетей.`)}
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent transition-all relative group cursor-pointer`}
            title={isSidebarExpanded ? "" : "Справка"}
          >
            <HelpCircle className="h-5 w-5 shrink-0" />
            {isSidebarExpanded && (
              <span className="text-xs font-semibold truncate animate-fade-in text-slate-755 dark:text-slate-200">О системе</span>
            )}
            {!isSidebarExpanded && (
              <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                О системе
              </span>
            )}
          </button>

          {/* Theme switcher toggle inside Sidebar */}
          <button
            onClick={() => setDarkMode(prev => !prev)}
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent transition-all relative group cursor-pointer`}
            title={isSidebarExpanded ? "" : (darkMode ? "Включить светлую тему" : "Включить тёмную тему")}
          >
            {darkMode ? <Sun className="h-5 w-5 shrink-0 text-amber-500 animate-pulse" /> : <Moon className="h-5 w-5 shrink-0" />}
            {isSidebarExpanded && (
              <span className="text-xs font-semibold truncate animate-fade-in text-slate-755 dark:text-slate-200">
                {darkMode ? "Светлая тема" : "Тёмная тема"}
              </span>
            )}
            {!isSidebarExpanded && (
              <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                {darkMode ? "Светлая тема" : "Тёмная тема"}
              </span>
            )}
          </button>

          {/* Divider */}
          <div className="w-8 h-[1px] bg-slate-200 dark:bg-slate-700 my-1 self-center" />

          {/* Logout */}
          <button
            onClick={handleLogout}
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-400 hover:text-red-655 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all relative group cursor-pointer`}
            title={isSidebarExpanded ? "" : "Выйти"}
          >
            <LogOut className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-red-600" />
            {isSidebarExpanded && (
              <span className="text-xs font-semibold truncate animate-fade-in text-slate-500 group-hover:text-red-600">Выход</span>
            )}
            {!isSidebarExpanded && (
              <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                Выход
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* RIGHT WORKSPACE PLATFORM */}
      <div className="flex-1 flex flex-col min-w-0 max-h-screen overflow-y-auto">
        {/* Top clean unified navigation header */}
        <header className="hidden">
          <div className="max-w-[1800px] mx-auto px-4 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 w-full xl:w-auto">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-red-600 to-rose-700 p-2 rounded-xl text-white shadow-md shadow-red-500/10 shrink-0">
                  {activeView === 'calls' && <Phone className="h-5 w-5" />}
                  {activeView === 'directory' && <BookOpen className="h-5 w-5" />}
                  {activeView === 'reports' && <BarChart3 className="h-5 w-5 animate-pulse" />}
                  {activeView === 'monitoring' && <Activity className="h-5 w-5 animate-pulse" />}
                </div>
                <div>
                  <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2 font-sans uppercase">
                    {activeView === 'calls' && 'Реестр звонков'}
                    {activeView === 'directory' && 'Телефонный справочник'}
                    {activeView === 'reports' && 'Отчеты и Аналитика'}
                    {activeView === 'monitoring' && 'Мониторинг звонков'}
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 normal-case">
                      v{packageJson.version}
                    </span>
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400 text-xs font-light">
                    Панель мониторинга звонков Asterisk & FreePBX
                  </p>
                </div>
              </div>
            </div>

          <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-end">
            {/* C2C User work extension input (SIP) next to Demo trigger */}
            <div className="flex flex-wrap items-center gap-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 shadow-xs">
              <div className="flex items-center gap-2 md:border-r md:border-slate-200 dark:md:border-slate-700 md:pr-2.5">
                <span className="text-[10px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 select-none">
                  <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                  Мой SIP:
                </span>
                <input
                  type="text"
                  value={session.role === 'operator' ? (session.extension || '') : myExt}
                  onChange={(e) => setMyExt(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="101"
                  maxLength={6}
                  disabled={session.role === 'operator'}
                  className="w-12 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 rounded py-0.5 px-1.5 text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-center disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-550 dark:disabled:text-slate-500 disabled:cursor-not-allowed"
                  title={session.role === 'operator' ? 'SIP-номер закреплён администратором' : 'Введите ваш внутренний добавочный номер. С этого телефона Asterisk начнет дозвон.'}
                />
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={session.role === 'operator' ? true : onlyMyCalls}
                  disabled={session.role === 'operator'}
                  onChange={(e) => {
                    setOnlyMyCalls(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Мои звонки</span>
              </label>
            </div>

            {/* Config & Profile actions */}
            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="text-right hidden md:block">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{session.username}</div>
                <div className="text-[10px] text-red-600 dark:text-rose-400 font-medium uppercase tracking-wider">{session.role}</div>
              </div>

              <button
                onClick={() => setDarkMode(prev => !prev)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer"
                title={darkMode ? "Включить светлую тему" : "Включить тёмную тему"}
              >
                {darkMode ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5" />}
              </button>
              
              <button
                onClick={() => {
                  if (session.role === 'admin') {
                    loadAdminSettings();
                    setSettingsTab('pbx');
                  } else {
                    setSettingsTab('appearance');
                  }
                  setIsSettingsOpen(true);
                }}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-201 dark:hover:border-[#334155] transition-all cursor-pointer"
                title="Настройки"
              >
                <Settings className="h-5 w-5" />
              </button>

              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-650 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer"
                title="Выйти"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {liveCallBanner?.active && (() => {
        const isIncomingLive = liveCallBanner.direction === 'incoming';
        const isOutgoingLive = liveCallBanner.direction === 'outgoing';
        const isInternalLive = liveCallBanner.direction === 'internal';
        const title = isIncomingLive ? 'Входящий звонок' : isOutgoingLive ? 'Исходящий звонок' : 'Внутренний звонок';
        const iconClass = isIncomingLive ? 'text-red-600 bg-red-50' : isOutgoingLive ? 'text-indigo-600 bg-indigo-50' : 'text-purple-600 bg-purple-50';
        const contactTypeLabel = liveCallBanner.contactType === 'internal' ? 'Внутренний' : 'Клиент';
        const contactTypeClass = liveCallBanner.contactType === 'internal' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-red-50 text-red-600 border-red-100';
        const display = liveCallBanner.displayName || liveCallBanner.number || 'Неизвестный номер';
        const isSpamOrBlacklisted = liveCallBanner.isSpam === true || liveCallBanner.isBlacklisted === true;
        const cleanName = display.replace(/\s*\(([^)]*)\)\s*$/, '');
        const positionMatch = display.match(/\(([^)]*)\)\s*$/);
        const position = positionMatch?.[1] || liveCallBanner.contactComment || '';
        const durationText = liveCallBanner.durationText || `${Math.floor((liveCallBanner.durationSec || 0) / 60)}:${String((liveCallBanner.durationSec || 0) % 60).padStart(2, '0')}`;

        return (
          <div className="fixed top-[74px] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-[1720px] pointer-events-none">
            <div className="pointer-events-auto relative overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl shadow-slate-900/12  animate-fade-in">
              <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-b from-red-500 to-rose-600" />
              <div className="flex items-stretch min-h-[104px]">
                <div className="flex items-center gap-4 px-6 py-4 min-w-[420px] max-w-[520px] border-r border-slate-200">
                  <div className={`h-14 w-14 rounded-full flex items-center justify-center shadow-sm shrink-0 ${iconClass}`}>
                    {isIncomingLive ? <PhoneIncoming className="h-7 w-7" /> : isOutgoingLive ? <PhoneOutgoing className="h-7 w-7" /> : <PhoneCall className="h-7 w-7" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] font-black text-slate-900">
                      {title}
                      {isIncomingLive && <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />}
                    </div>
                    <div className="mt-1 flex items-center gap-2 min-w-0" title={display}>
                      <span className="text-xl font-black text-slate-950 truncate">
                        {cleanName || display}
                      </span>
                      {isSpamOrBlacklisted && (
                        <span className="shrink-0 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-700">
                          СПАМ / ЧС
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Phone className="h-4 w-4 text-cyan-500" />
                      <span>{liveCallBanner.number || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-6 flex-1 divide-x divide-slate-200">
                  <div className="px-6 py-4 flex flex-col justify-center">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Тип</span>
                    <span className={`mt-2 w-fit rounded-md border px-2 py-1 text-xs font-bold ${contactTypeClass}`}>{contactTypeLabel}</span>
                  </div>
                  <div className="px-6 py-4 flex flex-col justify-center min-w-0">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Справочник</span>
                    <span className="mt-2 text-sm font-black text-slate-900 truncate" title={display}>{cleanName}</span>
                  </div>
                  <div className="px-6 py-4 flex flex-col justify-center min-w-0">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Должность / комментарий</span>
                    <span className="mt-2 text-sm font-bold text-slate-900 truncate" title={position}>{position || '—'}</span>
                  </div>
                  <div className="px-6 py-4 flex flex-col justify-center">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">DID</span>
                    <span className="mt-2 text-base font-black text-slate-950">{liveCallBanner.did || '—'}</span>
                  </div>
                  <div className="px-6 py-4 flex flex-col justify-center">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">На мой SIP</span>
                    <span className="mt-2 text-base font-black text-slate-950">{liveCallBanner.operatorExt || myExt || '—'}</span>
                  </div>
                  <div className="px-6 py-4 flex flex-col justify-center items-start xl:items-end">
                    <span className="text-sm font-black text-slate-900">{liveCallBanner.startedAt || ''}</span>
                    <span className="mt-2 text-[11px] uppercase tracking-wider font-bold text-slate-500">Длительность</span>
                    <span className="mt-1 text-base font-black text-slate-950 font-mono">{durationText}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main UI body section */}
      <main className="flex-1 overflow-y-auto w-full pl-[8px] pr-2 py-4 space-y-4">
        {dbWarning && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-900 p-4 rounded-xl flex items-start sm:items-center justify-between shadow-xs gap-3 animate-fade-in relative z-10">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-1.5 rounded-lg text-amber-700 shrink-0">
                <AlertCircle className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-900 leading-tight">База данных FreePBX недоступна</p>
                <p className="text-[11px] text-amber-700 font-light mt-0.5">
                  Причина: {dbWarning}. Система автоматически переключена на демонстрационные VoIP данные.
                </p>
              </div>
            </div>
            <button
              onClick={() => setDbWarning(null)}
              className="text-amber-500 hover:text-amber-700 font-bold px-2 py-0.5 rounded text-xs shrink-0 cursor-pointer transition-colors"
            >
              Скрыть
            </button>
          </div>
        )}

        {activeView === 'calls' && (
          <>
            {false && (
              <CDRPage
                calls={calls}
                session={session}
                directory={directory}
                playingCallId={playingCallId}
                isAudioPaused={isAudioPaused}
                activeDropdownCallId={activeDropdownCallId}
                setActiveDropdownCallId={setActiveDropdownCallId}
                triggerClickToCall={triggerClickToCall}
                openAddFromCall={openAddFromCall}
                playRecording={playRecording}
                openProcessModal={openProcessModal}
                fetchChronology={fetchChronology}
              />
            )}
            {/* KPI Dashboard cards section */}
            <section id="kpi-dashboard" className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Входящие */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'INBOUND' ? 'ALL' : 'INBOUND');
                  setPage(1);
                }}
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'INBOUND'
                    ? 'bg-cyan-50/70 border-cyan-405 ring-2 ring-cyan-500/30'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span className="text-xs text-slate-500 font-semibold tracking-wide">Входящие</span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-cyan-600 font-mono">{stats?.inboundCalls ?? 0}</span>
                  )}
                  <PhoneIncoming className="h-5 w-5 text-cyan-500 self-center" />
                </div>
              </button>

              {/* Исходящие */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'OUTBOUND' ? 'ALL' : 'OUTBOUND');
                  setPage(1);
                }}
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'OUTBOUND'
                    ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/30'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span className="text-xs text-slate-500 font-semibold tracking-wide">Исходящие</span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-indigo-600 font-mono">{stats?.outboundCalls ?? 0}</span>
                  )}
                  <PhoneOutgoing className="h-5 w-5 text-indigo-500 self-center" />
                </div>
              </button>

              {/* Внутренние */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'INTERNAL' ? 'ALL' : 'INTERNAL');
                  setPage(1);
                }}
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'INTERNAL'
                    ? 'bg-purple-50/70 border-purple-400 ring-2 ring-purple-500/30'
                    : 'bg-white border-slate-200'
                }`}
              >
                <span className="text-xs text-slate-500 font-semibold tracking-wide">Внутренние</span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-purple-650 font-mono">{stats?.internalCalls ?? 0}</span>
                  )}
                  <Phone className="h-5 w-5 text-purple-500 self-center" />
                </div>
              </button>

              {/* Пропущенные */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'MISSED' ? 'ALL' : 'MISSED');
                  setPage(1);
                }}
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'MISSED'
                    ? 'bg-red-50 border-red-400 ring-2 ring-red-500/30'
                    : 'bg-white border-red-100'
                }`}
              >
                <span className="text-xs text-red-600 font-bold tracking-wide">Пропущенные</span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-red-600 font-mono">{stats?.missedCalls ?? 0}</span>
                  )}
                  <PhoneMissed className="h-5 w-5 text-red-500/80 self-center" />
                </div>
              </button>

              {/* Обработанные */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'PROCESSED' ? 'ALL' : 'PROCESSED');
                  setPage(1);
                }}
                title="Обработанные = есть отзвон или вручную отмечен обработанным, даже если SLA превышен."
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'PROCESSED'
                    ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-500/30'
                    : 'bg-white border-emerald-100'
                }`}
              >
                <span className="text-xs text-emerald-600 font-bold tracking-wide flex items-center gap-1">
                  Обработанные
                </span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-emerald-605 font-mono">{stats?.processedCalls ?? 0}</span>
                  )}
                  <CheckCircle className="h-5 w-5 text-emerald-500/80 self-center" />
                </div>
              </button>

              {/* Потерянные */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'LOST' ? 'ALL' : 'LOST');
                  setPage(1);
                }}
                title="Потерянные = пропущенные + SLA уже истёк + нет отзвона + не обработан вручную."
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'LOST'
                    ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-500/30'
                    : 'bg-white border-amber-150'
                }`}
              >
                <span className="text-xs text-amber-655 font-bold tracking-wide">Потерянные</span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-amber-600 font-mono">{stats?.lostCalls ?? 0}</span>
                  )}
                  <XCircle className="h-5 w-5 text-amber-500/80 self-center" />
                </div>
              </button>
            </section>

        {/* Filters configuration section */}
        <section id="filters-bar" className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-2 text-slate-705 dark:text-slate-350 text-sm font-bold select-none">
                <Filter className="h-4 w-4 text-red-500" />
                <span>Фильтрация звонков</span>
              </div>
              
              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

              {/* SIP & My Calls filtering */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-[#334155]/80 p-1 px-2.5 rounded-lg select-none">
                <span className="text-[11px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Мой SIP:
                </span>
                <input
                  type="text"
                  value={session.role === 'operator' ? (session.extension || '') : myExt}
                  onChange={(e) => setMyExt(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="101"
                  maxLength={6}
                  disabled={session.role === 'operator'}
                  className="w-12 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 rounded py-0.5 px-1 text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-center disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500"
                  title={session.role === 'operator' ? 'SIP-номер закреплён администратором' : 'Введите ваш добавочный номер.'}
                />
                <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={session.role === 'operator' ? true : onlyMyCalls}
                    disabled={session.role === 'operator'}
                    onChange={(e) => {
                      setOnlyMyCalls(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded border-slate-300 dark:border-slate-600 text-red-655 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="text-[11px] font-bold text-slate-705 dark:text-slate-300">Мои звонки</span>
                </label>
              </div>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

              <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-[#334155]/80 p-1 rounded-lg">
                <span className="text-[11px] text-slate-550 dark:text-slate-450 font-semibold px-1 select-none">Период:</span>
                <button
                  onClick={() => {
                    setStartDate(toLocalDateInputValue(new Date()));
                    setEndDate(toLocalDateInputValue(new Date()));
                    setStartTime('00:00');
                    setEndTime('23:59');
                    setPage(1);
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                    startDate === toLocalDateInputValue(new Date()) && endDate === toLocalDateInputValue(new Date()) && startTime === '00:00' && endTime === '23:59'
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
                    const yStr = toLocalDateInputValue(yesterday);
                    setStartDate(yStr);
                    setEndDate(yStr);
                    setStartTime('00:00');
                    setEndTime('23:59');
                    setPage(1);
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                    (() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      const yStr = toLocalDateInputValue(yesterday);
                      return startDate === yStr && endDate === yStr && startTime === '00:00' && endTime === '23:59';
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
                      const sStr = toLocalDateInputValue(sev);
                      return startDate === sStr && endDate === toLocalDateInputValue(new Date()) && startTime === '00:00' && endTime === '23:59';
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
                      return startDate === mStr && endDate === toLocalDateInputValue(new Date()) && startTime === '00:00' && endTime === '23:59';
                    })()
                      ? 'bg-red-50 text-red-750 font-bold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200'
                  }`}
                >
                  Этот месяц
                </button>
 
                <div className="h-3 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
 
                <div className="flex flex-wrap items-center gap-1.5" lang="ru-RU">
                  <RussianDatePicker
                    value={startDate}
                    onChange={(value) => {
                      setStartDate(value);
                      setPage(1);
                    }}
                    ariaLabel="Дата начала периода"
                  />
                  <div className="relative flex items-center shadow-xs">
                    <Clock className="absolute left-1.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setPage(1);
                      }}
                      step="60"
                      lang="ru-RU"
                      aria-label="Время начала периода"
                      className="bg-white border border-slate-200 rounded pl-6 pr-1.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-red-500 w-[64px]"
                    />
                  </div>
                  <span className="text-slate-400 text-xs">—</span>
                  <RussianDatePicker
                    value={endDate}
                    onChange={(value) => {
                      setEndDate(value);
                      setPage(1);
                    }}
                    ariaLabel="Дата окончания периода"
                  />
                  <div className="relative flex items-center shadow-xs">
                    <Clock className="absolute left-1.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        setPage(1);
                      }}
                      step="60"
                      lang="ru-RU"
                      aria-label="Время окончания периода"
                      className="bg-white border border-slate-200 rounded pl-6 pr-1.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-red-500 w-[64px]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Search querying */}
            <div className="flex-1 max-w-sm min-w-[200px] relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по любой строке..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-light"
              />
            </div>
            
            {/* Auto-refresh timer info & Reset Filters button combined */}
            <div className="flex items-center gap-2.5 text-xs text-slate-500 shrink-0 select-none">
              <div className="flex items-center gap-1 font-mono">
                <RefreshCw className="h-3.5 w-3.5 animate-spin-slow text-slate-400" />
                <span>Обновление через {timeToNextRefresh}с</span>
              </div>
              <button
                onClick={() => reloadData()}
                className="hover:text-red-600 hover:bg-slate-200 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-md cursor-pointer transition-all font-medium text-xs"
                title="Обновить сейчас"
              >
                Обновить
              </button>
              {(searchQuery || numberFilter || statusFilter !== 'ALL' || startDate !== getDefaultStartDate() || endDate !== toLocalDateInputValue(new Date()) || startTime !== '00:00' || endTime !== '23:59') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setNumberFilter('');
                    setStatusFilter('ALL');
                    applyThisMonthPreset();
                  }}
                  className="hover:bg-red-50 bg-red-50 border border-red-200 text-red-600 px-2.5 py-1.5 rounded-md cursor-pointer transition-all font-semibold text-xs"
                  title="Сбросить все фильтры"
                >
                  Сбросить фильтры
                </button>
              )}
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
                  <p className="text-xs text-rose-600 max-w-lg font-light mt-1">
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
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#1e293b]/20 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
                    <th className="py-4 px-4">ВРЕМЯ ВЫЗОВА / ID</th>
                    <th className="py-4 px-4 font-bold">КТО ЗВОНИЛ</th>
                    <th className="py-4 px-4 font-bold">КУДА ЗВОНИЛ</th>
                    <th className="py-4 px-4 font-bold">РЕШЕНИЕ (СТАТУС)</th>
                    <th className="py-4 px-4 font-bold">ДЛИТЕЛЬНОСТЬ</th>
                    <th className="py-4 px-4 font-bold">ЗАПИСЬ</th>
                    <th className="py-4 px-4 font-bold">КОММЕНТАРИЙ ОПЕРАТОРА</th>
                    <th className="py-4 px-4 font-bold text-left">УПРАВЛЕНИЕ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/45 text-xs bg-white dark:bg-slate-900">
                  {calls.map((call, index) => {
                    const dctx = call.dcontext || '';
                    const ch = call.channel || '';
                    const srcVal = (call.src || '').trim();
                    const dstVal = (call.dst || '').trim();

                    // --- 1. CALL TYPE DETECTION ---
                    const isIncoming = (() => {
                      if (isInternalExt(srcVal)) {
                        return false;
                      }
                      const dctxLower = dctx.toLowerCase();
                      const chLower = ch.toLowerCase();
                      if (
                        dctxLower.includes('from-trunk') ||
                        dctxLower.includes('from-pstn') ||
                        dctxLower.includes('sip-external') ||
                        dctxLower.includes('from-digital') ||
                        dctxLower.includes('from-outside') ||
                        (call.did && call.did.length > 0)
                      ) {
                        return true;
                      }
                      const isIncomingRoute = 
                        dctxLower === 'ext-queues' ||
                        dctxLower === 'ext-group' ||
                        dctxLower === 'ext-local' ||
                        dctxLower.startsWith('ivr-') ||
                        dstVal === '600' ||
                        isInternalExt(dstVal);
                      const isTrunkChannel = chLower.includes('-in-') || chLower.includes('trunk');
                      return isIncomingRoute || isTrunkChannel;
                    })();

                    const isMissed = (() => {
                      const callDisp = (call.disposition || '').toUpperCase();
                      return (callDisp === 'NO ANSWER' || callDisp === 'BUSY' || callDisp === 'FAILED') && (isIncoming || !call.dstchannel);
                    })();

                    const isOutgoing = dctx === 'from-internal' && isInternalExt(srcVal) && !isInternalExt(dstVal) && dstVal.length >= 7;

                    const isInternal = isInternalExt(srcVal) && isInternalExt(dstVal);

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

                    const dstContact = directory.find(e => e.number.trim() === displayedDst.trim());
                    const isDstInternal = isInternalExt(displayedDst);
                    let calleeName = '';
                    let calleeType = isDstInternal ? 'internal' : 'client';
                    let isFoundDst = false;

                    if (dstContact) {
                      calleeName = dstContact.name;
                      calleeType = dstContact.type;
                      isFoundDst = true;
                    } else {
                      calleeName = isDstInternal ? `Внутренний ${displayedDst}` : 'Внешний номер';
                    }

                    const callDisp = (call.disposition || '').toUpperCase();

                    return (
                      <tr
                        key={call.uniqueid}
                        className={`hover:bg-slate-50/50 dark:hover:bg-[#1e293b]/30 transition-colors ${
                          isMissed && !call.processed && !call.wasCallbacked
                            ? 'bg-rose-500/[0.015]'
                            : ''
                        }`}
                      >
                        {/* Column 1: TIME AND ID */}
                        <td className="py-4 px-4 font-normal text-slate-705 dark:text-slate-350">
                          <div className="flex items-center gap-3">
                            {/* Call type icon circle */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-3xs `}>
                              {isIncoming ? <PhoneIncoming className="h-4.5 w-4.5" /> : isOutgoing ? <PhoneOutgoing className="h-4.5 w-4.5" /> : <PhoneCall className="h-4.5 w-4.5" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-[13px] tracking-tight">
                                {call.calldate}
                              </span>
                              <span className="text-[11px] text-slate-400 dark:text-slate-505 font-mono mt-0.5 animate-none">
                                ID:{' '}
                                {session?.role === 'admin' ? (
                                  <button
                                    onClick={() => fetchChronology(call.uniqueid)}
                                    className="text-slate-400 hover:text-red-705 hover:underline cursor-pointer font-medium"
                                    title="Посмотреть хронологию прохождения звонка"
                                  >
                                    {call.uniqueid}
                                  </button>
                                ) : (
                                  <span className="select-all">{call.uniqueid}</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: WHO CALLED (Кто звонил) */}
                        <td className="py-4 px-4 m-0">
                          <div className="flex flex-col gap-1.5 justify-center">
                            {/* Line 1: Name and Badge */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold text-xs ${isFound ? "text-red-800 dark:text-red-400" : "text-slate-800 dark:text-slate-150"}`}>
                                {callerName}
                              </span>
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-205/50 dark:border-slate-800/40 select-none">
                                {callerType === 'internal' ? 'Внутр.' : 'Клиент'}
                              </span>
                            </div>
                            {/* Line 2: Phone status, copy, dial and add buttons in ONE LINE */}
                            <div className="flex items-center gap-1.5 flex-wrap select-none">
                              <span className="font-bold text-slate-700 dark:text-slate-300 font-mono select-all text-xs">
                                {displayedSrc}
                              </span>
                              
                              <button
                                onClick={() => handleCopy(displayedSrc)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-303 transition-colors cursor-pointer"
                                title="Скопировать номер"
                              >
                                {copiedNumber === displayedSrc ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <button
                                onClick={() => triggerClickToCall(displayedSrc, callerName)}
                                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs hover:scale-102"
                                title="Позвонить на номер через SIP/AMI"
                              >
                                <PhoneCall className="h-2.5 w-2.5" />
                                <span>Позвонить</span>
                              </button>

                              {!isFound && (
                                <button
                                  onClick={() => openAddFromCall(displayedSrc, callerName && !callerName.startsWith('Внешний') && !callerName.startsWith('Внутренний') ? callerName : '')}
                                  className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 text-indigo-650 dark:text-indigo-300 border border-indigo-200/30 dark:border-indigo-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs hover:scale-102"
                                  title="Добавить в справочник"
                                >
                                  <UserPlus className="h-2.5 w-2.5" />
                                  <span>Добавить</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Column 3: Callee display (Куда звонил) */}
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-between gap-6 max-w-xs select-text">
                            {/* Left Block */}
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-bold text-xs ${isFoundDst ? "text-red-800 dark:text-red-400" : "text-slate-800 dark:text-slate-100"}`}>
                                  {calleeName}
                                </span>
                                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40 select-none">
                                  {calleeType === 'internal' ? 'Внутр.' : 'Клиент'}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
                                <span>{displayedDst}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => triggerClickToCall(displayedDst, calleeName)}
                                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                                    title={`Позвонить на ${displayedDst}`}
                                  >
                                    <PhoneCall className="h-3 w-3" />
                                  </button>
                                  {!isFoundDst && (
                                    <button
                                      onClick={() => openAddFromCall(displayedDst, calleeName && !calleeName.startsWith('Внешний') && !calleeName.startsWith('Внутренний') ? calleeName : '')}
                                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-605 hover:text-indigo-700 transition-colors cursor-pointer"
                                      title={`Добавить ${displayedDst} в справочник`}
                                    >
                                      <UserPlus className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Block */}
                            <div className="flex flex-col items-end text-right font-mono text-[10.5px] text-slate-400 dark:text-slate-500 gap-1 select-none">
                              <span>DID: {call.did || '841282'}</span>
                              <span>не отвечает: {isInternalExt(call.dst) && call.dst !== '9999' ? call.dst : '100, 200'}</span>
                            </div>
                          </div>
                        </td>

                        {/* Column 4: REKHEM (СТАТУС) */}
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1 items-start text-[11px] select-none">
                            {(() => {
                              const isAwaitingBadge = isMissed && !call.processed && !call.wasCallbacked && (index === 1 || index === 4 || index === 6 || (index > 6 && index % 2 === 0));

                              if (callDisp === 'ANSWERED') {
                                return (
                                  <span className="inline-flex items-center gap-1.5 bg-emerald-50/40 dark:bg-emerald-950/10 text-emerald-500 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Отвечен
                                  </span>
                                );
                              }

                              if (isAwaitingBadge) {
                                return (
                                  <span className="inline-flex items-center gap-1.5 bg-amber-50/40 dark:bg-amber-950/10 text-amber-500 dark:text-amber-400 border border-amber-250/30 dark:border-amber-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Ожидает
                                  </span>
                                );
                              }

                              // Default layout status missed (Без ответа)
                              return (
                                <span className="inline-flex items-center gap-1.5 bg-rose-50/40 dark:bg-rose-950/10 text-rose-500 dark:text-rose-400 border border-rose-250/30 dark:border-rose-905/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                                  <Target className="h-3.5 w-3.5" />
                                  Без ответа
                                </span>
                              );
                            })()}

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
                          </div>
                        </td>

                        {/* Column 5: ДЛИТЕЛЬНОСТЬ */}
                        <td className="py-4 px-4 font-normal">
                          <div className="text-slate-500 text-xs gap-1 flex flex-col">
                            <div>
                              Длительность:&nbsp;&nbsp;<span className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatSeconds(call.duration)}</span>
                            </div>
                            <div>
                              Разговор:&nbsp;&nbsp;<span className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatSeconds(call.billsec)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Column 5b: ЗАПИСЬ */}
                        <td className="py-4 px-4">
                          {call.recordingfile ? (
                            <button
                              onClick={() => playRecording(call)}
                              className={`inline-flex items-center gap-1.5 py-1 px-3 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-250/70 dark:border-slate-800/40 text-[10.5px] font-bold rounded-lg cursor-pointer transition-colors shadow-3xs ${
                                playingCallId === call.uniqueid
                                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-600 hover:bg-rose-100/50 dark:text-rose-400'
                                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-950'
                              }`}
                            >
                              {playingCallId === call.uniqueid && !isAudioPaused ? (
                                <>
                                  <Pause className="h-3.5 w-3.5 fill-current" />
                                  <span>Слушать</span>
                                </>
                              ) : (
                                <>
                                  <Play className="h-3.5 w-3.5 fill-current" />
                                  <span>Воспроизвести</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-405 dark:text-slate-500 italic text-xs select-none font-light">Нет записи</span>
                          )}
                        </td>

                        {/* Column 6: COMMENT */}
                        <td className="py-4 px-4 max-w-xs">
                          {call.comment ? (
                            <div className="flex flex-col gap-1">
                              <p className="text-slate-700 dark:text-slate-350 bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2.5 border border-slate-200/60 dark:border-slate-800/40 text-[11.5px] font-normal select-all shadow-3xs">
                                "{call.comment}"
                              </p>
                              {call.processedBy && (
                                <span className="text-[10px] text-slate-400 mt-0.5 block">
                                  Автор: {call.processedBy} ({new Date(call.processedAt || '').toLocaleDateString('ru-RU')})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs select-none font-light">Нет комментариев</span>
                          )}
                        </td>

                        {/* Column 7: Actions */}
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-start gap-2.5">
                            {isMissed ? (
                              <button
                                onClick={() => openProcessModal(call)}
                                className={`px-3.5 py-1.5 rounded-lg border transition-all text-xs font-bold whitespace-nowrap cursor-pointer shadow-3xs ${
                                  call.processed
                                    ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-705 dark:text-slate-300 dark:border-slate-800'
                                    : 'border-red-200 bg-white hover:bg-red-50/40 text-red-500 hover:text-red-600 dark:border-red-900/40 dark:hover:bg-red-950/20'
                                }`}
                              >
                                {call.processed ? 'Изменить' : 'Обработать'}
                              </button>
                            ) : (
                              <div className="w-[102px]"></div>
                            )}

                            {/* Dropdown Options */}
                            <div className="relative inline-block leading-none">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRowDropdown(call.uniqueid);
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                title="Дополнительные действия"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {activeDropdownCallId === call.uniqueid && (
                                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-905 border border-slate-150 dark:border-slate-800 rounded-lg shadow-lg py-1 z-30 font-sans text-xs text-left text-slate-700 dark:text-slate-200">
                                  {/* Call to Src */}
                                  <button
                                    onClick={() => {
                                      setActiveDropdownCallId(null);
                                      triggerClickToCall(displayedSrc, callerName);
                                    }}
                                    className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <PhoneCall className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>Позвонить вызыв.</span>
                                  </button>

                                  {/* Call to Dst */}
                                  <button
                                    onClick={() => {
                                      setActiveDropdownCallId(null);
                                      triggerClickToCall(displayedDst, calleeName);
                                    }}
                                    className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
                                    <span>Позвонить куда</span>
                                  </button>

                                  {/* Add Src to Directory */}
                                  {!isFound && (
                                    <button
                                      onClick={() => {
                                        setActiveDropdownCallId(null);
                                        openAddFromCall(displayedSrc, callerName && !callerName.startsWith('Внешний') && !callerName.startsWith('Внутренний') ? callerName : '');
                                      }}
                                      className="w-full px-3 py-2 text-slate-700 dark:text-slate-355 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800 font-medium"
                                    >
                                      <UserPlus className="h-3.5 w-3.5 text-indigo-505" />
                                      <span>Добавить {displayedSrc}</span>
                                    </button>
                                  )}

                                  {/* Fetch Chronology */}
                                  {session?.role === 'admin' && (
                                    <button
                                      onClick={() => {
                                        setActiveDropdownCallId(null);
                                        fetchChronology(call.uniqueid);
                                      }}
                                      className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800 font-medium"
                                    >
                                      <Volume2 className="h-3.5 w-3.5 text-purple-500" />
                                      <span>Хронология вызова</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
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
    )}

      {activeView === 'directory' && (
        <>
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
                <Sliders className="h-4.5 w-4.5 text-red-600" />
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
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-all active:scale-95 select-none"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Импорт контактов (массовый)
                  </button>

                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-red-600 rounded-lg text-xs font-semibold cursor-pointer border border-red-200 shadow-xs transition-all active:scale-95 select-none"
                  >
                    <Download className="h-3.5 w-3.5 text-red-500" />
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
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-stretch sm:items-center">
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
              <button
                onClick={() => setDirTypeFilter('spam')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  dirTypeFilter === 'spam'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-red-500 hover:text-red-700'
                }`}
              >
                Спам/ЧС
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
                  <th scope="col" className="py-2 px-1.5">Статус</th>
                  <th scope="col" className="py-2 px-3">ФИО</th>
                  <th scope="col" className="py-2 px-3">Телефоны</th>
                  <th scope="col" className="py-2 px-2 w-[230px]">Компания</th>
                  <th scope="col" className="py-2 px-3">Должность</th>
                  <th scope="col" className="py-2 px-3">Отдел</th>
                  <th scope="col" className="py-2 px-1.5">Теги</th>
                  <th scope="col" className="py-2 px-1.5">Комментарий</th>
                  <th scope="col" className="py-2 px-1.5">Email</th>
                  <th scope="col" className="py-2 px-3">Сайт</th>
                  <th scope="col" className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  let list = [...directory];
                  if (dirTypeFilter === 'spam') {
                    list = list.filter(e => e.isSpam === true || e.isBlacklisted === true);
                  } else if (dirTypeFilter !== 'all') {
                    list = list.filter(e => e.type === dirTypeFilter);
                  }
                  if (dirSearchQuery.trim()) {
                    const s = dirSearchQuery.toLowerCase();
                    list = list.filter(e => {
                      const phones = getEntryPhones(e).join(' ');
                      const tags = getDirectoryEntryTags(e).join(' ');
                      return (
                        e.name.toLowerCase().includes(s) ||
                        phones.includes(s) ||
                        (e.company || '').toLowerCase().includes(s) ||
                        (e.position || '').toLowerCase().includes(s) ||
                        tags.toLowerCase().includes(s) ||
                        (e.comment && e.comment.toLowerCase().includes(s))
                      );
                    });
                  }

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={11} className="py-8 text-center text-slate-400">
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
                      <td className="py-3.5 px-1.5 whitespace-nowrap text-center">
                        <span
                          title={entry.isBlacklisted ? 'Черный список' : entry.isSpam ? 'Спам' : entry.type === 'internal' ? 'Внутренний' : entry.type === 'supplier' ? 'Поставщик' : entry.type === 'government' ? 'Госорган' : 'Клиент'}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full border shadow-xs transition-all ${
                            entry.isBlacklisted
                              ? 'bg-slate-900 text-white border-slate-900'
                              : entry.isSpam
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : entry.type === 'internal'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : entry.type === 'supplier'
                                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                                    : entry.type === 'government'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          <DirectoryStatusIcon entry={entry} />
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-[15px] text-slate-900 font-medium">
                        {entry.name}
                      </td>

                      <td className="py-3.5 px-3 text-red-800 dark:text-rose-200 font-mono font-bold select-all">
                        <div className="flex flex-col gap-1">
                          {getEntryPhones(entry).map(phone => (
                            <div key={phone} className="flex items-center gap-2">
                              <span>{phone}</span>
                              <button
                                onClick={() => triggerClickToCall(phone, entry.name)}
                                className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 cursor-pointer flex items-center transition-all shadow-xs hover:scale-105 active:scale-95"
                                title={`Позвонить на ${phone} через SIP/AMI`}
                              >
                                <PhoneCall className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-2 text-slate-700 w-[230px] max-w-[230px]">
                        {entry.company ? (
                          <div className="block truncate max-w-[210px]" title={entry.company}>
                            {entry.company}
                          </div>
                        ) : (
                          <span className="text-slate-350 italic">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-slate-700">
                        {entry.position || <span className="text-slate-350 italic">—</span>}
                      </td>

                      <td className="py-3.5 px-3 text-slate-700">
                        {(entry as any).department || <span className="text-slate-350 italic">—</span>}
                      </td>



                      <td className="py-3.5 px-1.5">
                        <div className="flex flex-wrap gap-1">
                          {getDirectoryEntryTags(entry).length ? getDirectoryEntryTags(entry).map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600">{tag}</span>
                          )) : <span className="text-slate-350 italic">—</span>}
                        </div>
                      </td>

                      <td className="py-3.5 px-1.5 text-slate-650 w-[220px] max-w-[220px]">
                        {entry.comment ? (
                          <div className="block truncate max-w-[200px]" title={entry.comment}>
                            {entry.comment}
                          </div>
                        ) : (
                          <span className="text-slate-350 italic">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-slate-700 max-w-[190px]">
                        {entry.email ? (
                          <a
                            href={`mailto:${entry.email}`}
                            className="text-blue-600 hover:text-blue-700 hover:underline truncate block"
                            title={entry.email}
                          >
                            {entry.email}
                          </a>
                        ) : (
                          <span className="text-slate-350 italic">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-slate-700 max-w-[180px]">
                        {entry.website ? (
                          <a
                            href={String(entry.website).startsWith('http') ? entry.website : `https://${entry.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-700 hover:underline truncate block"
                            title={entry.website}
                          >
                            {entry.website}
                          </a>
                        ) : (
                          <span className="text-slate-350 italic">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {session?.role === 'admin' && (
                            <button
                              onClick={() => handleToggleBlacklist(entry, !entry.isBlacklisted, true)}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${entry.isBlacklisted ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-500 hover:text-red-700 hover:bg-red-50 border-transparent hover:border-red-200'}`}
                              title={entry.isBlacklisted ? 'Убрать из черного списка' : 'Добавить в черный список АТС'}
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
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
        </>
      )}

    {activeView === 'reports' && renderReportsView()}

    {activeView === 'monitoring' && renderMonitoringView()}
      </main>

      <footer className="border-t border-slate-200 bg-white py-3 text-center text-[11px] text-slate-500">
        © 2026 Freepbx CDR-NEW. Все права защищены. Грунин К.В. ИНН 9102057404.
        <a href="https://grunin.org" target="_blank" rel="noopener noreferrer" className="mx-1 text-slate-700 hover:text-red-600 underline">grunin.org</a>
        Внедрение, разработка и поддержка VOIP-проектов.
        <a href="tel:+79787437943" className="ml-1 text-slate-700 hover:text-red-600 underline">+7 (978) 743-79-43</a>
      </footer>

      {/* FOOTER RECORD PLAYER CONTROL SLIDE OVERLAY */}
      {playingRecording && (
        <footer className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] w-[1100px] max-w-[calc(100vw-30px)] bg-white border border-red-200 rounded-2xl py-3.5 px-4 shadow-2xl">
          <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3.5">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="p-2 bg-red-50 rounded-lg border border-red-100 text-red-600 shadow-xs">
                <Volume2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 md:flex-none">
                <div className="text-xs font-semibold text-slate-800 truncate max-w-md" title={playingRecording}>
                  {playingRecording}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  <a href={`/api/recordings/${encodeURIComponent(playingRecording)}`} download={playingRecording} className="text-[10px] text-red-600 hover:text-red-700 underline underline-offset-2">Скачать запись</a>
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
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={() => changeSpeed(1)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1 ? 'bg-red-50 border border-red-200 text-red-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.0x
                </button>
                <button
                  onClick={() => changeSpeed(1.25)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1.25 ? 'bg-red-50 border border-red-200 text-red-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.25x
                </button>
                <button
                  onClick={() => changeSpeed(1.5)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1.5 ? 'bg-red-50 border border-red-200 text-red-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.5x
                </button>
                <button
                  onClick={() => changeSpeed(2)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 2 ? 'bg-red-50 border border-red-200 text-red-600' : 'text-slate-500 hover:text-slate-800'
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

      {/* CALL ROUTING CHRONOLOGY TIMELINE DIALOG MODAL PANEL */}
      {chronologyCallId && (
        <div className="fixed inset-0 bg-slate-950/40 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl relative max-h-[90vh] flex flex-col font-sans overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 p-5 bg-slate-50/60">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Network className="h-5 w-5 text-red-600" />
                  Хронология прохождения звонка
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5 font-mono">
                  ID: {chronologyCallId}
                </p>
              </div>
              <button
                onClick={() => {
                  setChronologyCallId(null);
                  setChronologyData(null);
                }}
                className="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-105 rounded-lg cursor-pointer transition-colors text-base"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isChronologyLoading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="h-10 w-10 text-red-600 animate-spin" />
                  <p className="text-sm text-slate-600 font-medium font-sans">Запрос истории звонка по плечам маршрутизации...</p>
                </div>
              )}

              {chronologyError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-red-650 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold">Ошибка получения данных:</h5>
                    <p className="mt-1">{chronologyError}</p>
                    <button
                      onClick={() => fetchChronology(chronologyCallId)}
                      className="mt-3 text-[11px] bg-red-100 hover:bg-red-200 active:scale-95 transition-all text-red-800 font-bold px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer"
                    >
                      Попробовать снова
                    </button>
                  </div>
                </div>
              )}

              {chronologyData && (
                <div className="space-y-5">
                  {/* Summary Card */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Первоначальное время:</span>
                        <span className="font-semibold text-slate-800 font-mono">{chronologyData.timeline[0]?.calldate || '—'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Кто звонил:</span>
                        <span className="font-bold text-slate-900 font-mono text-xs">{chronologyData.timeline[0]?.src || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">DID компании:</span>
                        <span className="font-semibold text-slate-800 font-mono">{chronologyData.timeline.find(t => t.did)?.did || '—'}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Всего переходов/событий:</span>
                        <span className="font-bold text-slate-800 font-mono bg-slate-205 px-1.5 py-0.5 rounded text-[10.5px]">
                          {chronologyData.legsCount}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500">Итоговый статус звонка:</span>
                        {(() => {
                          const anyAnswered = chronologyData.timeline.some(t => t.disposition === 'ANSWERED' && Number(t.billsec || 0) > 0);
                          return (
                            <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-black uppercase tracking-wider font-sans ${
                              anyAnswered 
                                ? 'bg-emerald-100 border border-emerald-200 text-emerald-800' 
                                : 'bg-red-100 border border-red-200 text-red-800'
                            }`}>
                              {anyAnswered ? 'ОТВЕЧЕН (ANSWERED)' : 'НЕ ОТВЕЧЕН (NO ANSWER)'}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Linked ID:</span>
                        <span className="font-medium text-slate-550 font-mono">{chronologyData.linkedid}</span>
                      </div>
                    </div>
                  </div>

                  {/* Horizontal visual divider */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Хронологическая лента</span>
                    <hr className="flex-1 border-slate-200" />
                  </div>

                  {/* Timeline steps */}
                  <div className="flow-root pl-2">
                    <ul className="-mb-8">
                      {chronologyData.timeline.map((leg, legIdx) => {
                        const isLast = legIdx === chronologyData.timeline.length - 1;
                        const isAnswered = leg.disposition === 'ANSWERED';
                        
                        // Select border and background color based on step type
                        let badgeBg = 'bg-slate-200 text-slate-700 border-slate-300';
                        let stepIcon = <Clock className="h-4 w-4" />;
                        
                        if (leg.actionType === 'connected') {
                          badgeBg = 'bg-emerald-600 text-white border-emerald-700';
                          stepIcon = <CheckCircle className="h-4 w-4" />;
                        } else if (leg.actionType === 'ringing') {
                          badgeBg = isAnswered ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-300';
                          stepIcon = <Home className="h-4 w-4" />;
                        } else if (leg.actionType === 'ivr') {
                          badgeBg = 'bg-cyan-50 text-cyan-700 border-cyan-200';
                          stepIcon = <Truck className="h-4 w-4" />;
                        } else if (leg.actionType === 'voicemail') {
                          badgeBg = 'bg-amber-50 text-amber-700 border-amber-200';
                          stepIcon = <BookOpen className="h-4 w-4" />;
                        } else {
                          badgeBg = 'bg-slate-50 text-slate-705 border-slate-200';
                          stepIcon = <Network className="h-4 w-4" />;
                        }

                        return (
                          <li key={legIdx}>
                            <div className="relative pb-8">
                              {/* Connector line */}
                              {!isLast && (
                                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                              )}
                              
                              <div className="relative flex space-x-3 items-start">
                                {/* Checkpoint Indicator */}
                                <div>
                                  <span className={`h-8 w-8 rounded-full border flex items-center justify-center ring-4 ring-white shadow-xs shrink-0 ${badgeBg}`}>
                                    {stepIcon}
                                  </span>
                                </div>
                                
                                {/* Step Details */}
                                <div className="min-w-0 flex-1 pt-1.5">
                                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5">
                                    <div className="text-xs font-bold text-slate-900 font-sans">
                                      {leg.title}
                                    </div>
                                    <div className="text-[10px] text-slate-550 font-mono shrink-0 whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded">
                                      {leg.calldate}
                                    </div>
                                  </div>
                                  
                                  <p className="mt-1 text-xs text-slate-600 font-sans leading-relaxed">
                                    {leg.description}
                                  </p>

                                  {/* Detailed System Legs Info */}
                                  <div className="mt-2 text-[10px] text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-150 space-y-1">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      <div>
                                        <span className="text-slate-400">Канал (src):</span>{' '}
                                        <span className="text-slate-700 font-medium truncate block max-w-full" title={leg.channel}>
                                          {leg.channel ? String(leg.channel).split('-')[0] : 'н/д'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">Канал (dst):</span>{' '}
                                        <span className="text-slate-700 font-medium truncate block max-w-full" title={leg.dstchannel}>
                                          {leg.dstchannel ? String(leg.dstchannel).split('-')[0] : 'н/д'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">Приложение:</span>{' '}
                                        <span className="text-slate-800 font-semibold">{leg.lastapp || '—'}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">Результат:</span>{' '}
                                        <span className={`font-extrabold ${isAnswered ? 'text-emerald-700' : 'text-rose-600'}`}>
                                          {leg.disposition}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 pt-1 border-t border-slate-100">
                                      <span>
                                        <span className="text-slate-400">Вызов:</span>{' '}
                                        <span className="text-slate-800 font-semibold">{leg.duration} сек</span>
                                      </span>
                                      {Number(leg.billsec) > 0 && (
                                        <span>
                                          <span className="text-slate-400">Разговор:</span>{' '}
                                          <span className="text-emerald-700 font-black">{leg.billsec} сек</span>
                                        </span>
                                      )}
                                      {leg.dcontext && (
                                        <span>
                                          <span className="text-slate-400">Контекст:</span>{' '}
                                          <span className="text-slate-600">{leg.dcontext}</span>
                                        </span>
                                      )}
                                      {leg.lastdata && (
                                        <span>
                                          <span className="text-slate-400">Аргументы:</span>{' '}
                                          <span className="text-slate-600 truncate max-w-xs inline-block align-bottom" title={leg.lastdata}>{leg.lastdata}</span>
                                        </span>
                                      )}
                                    </div>

                                    {/* Action button inside timeline to play specific leg's call audio recording! */}
                                    {leg.recordingfile && (
                                      <div className="pt-2 flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => playRecording(leg)}
                                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all border ${
                                            playingRecording === leg.recordingfile
                                              ? 'bg-red-50 border-red-200 text-red-700'
                                              : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                                          }`}
                                        >
                                          {playingRecording === leg.recordingfile && !isAudioPaused ? (
                                            <>
                                              <Pause className="h-3 w-3 text-red-600 animate-pulse" />
                                              <span>Играет</span>
                                            </>
                                          ) : (
                                            <>
                                              <Play className="h-3 w-3 text-slate-600" />
                                              <span>Прослушать запись</span>
                                            </>
                                          )}
                                        </button>
                                        <span className="text-[9.5px] text-slate-500 font-sans truncate" title={leg.recordingfile}>
                                          Файл: {leg.recordingfile.split('/').pop()}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setChronologyCallId(null);
                  setChronologyData(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer shadow-sm active:scale-95 transition-transform"
              >
                Закрыть окно
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CALL PROCESSING / COMMENTING DIALOG MODAL PANEL */}
      {selectedCall && (
        <div className="fixed inset-0 bg-slate-950/40  flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-red-600" />
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
                  <div className="flex items-center justify-end gap-2"><span className="font-semibold text-slate-800 text-right">{selectedCall.src}</span><button type="button" onClick={() => triggerClickToCall(selectedCall.src)} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-semibold cursor-pointer">Позвонить</button></div>
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
                  placeholder="Опишите результат отзвона клиенту или почему звонок не требует отработки..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 h-24 focus:ring-1 focus:ring-red-500 font-sans focus:outline-none focus:bg-white resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCall(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingProcess}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  {isSavingProcess ? 'Сохранение...' : 'Сохранить результат'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SYSTEM SETTINGS MODAL DIALOG (ADMINS ONLY) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[1100px] bg-white border border-slate-200 rounded-2xl shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden font-sans">
            <div className="flex items-center justify-between border-b border-slate-200 p-6 pb-4 shrink-0 bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings className="h-6 w-6 text-red-600 animate-spin-slow" />
                <h3 className="text-base font-black text-slate-905">Настройки системы</h3>
              </div>
              <button onClick={() => { setIsSettingsOpen(false); setDbTestResult(null); resetUserForm(); }} className="text-slate-400 hover:text-slate-900 p-1 rounded-md cursor-pointer">✕</button>
            </div>

            <div className="p-6 pb-2 border-b border-slate-200 bg-slate-50/50 shrink-0">
              <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl">
                {Object.entries({
                  ...(session?.role === 'admin' ? {
                    pbx: 'Настройки АТС',
                    directory: 'Телефонный справочник',
                    access: 'Доступ и пользователи',
                    permissions: 'Права доступа',
                  } : {}),
                  appearance: 'Интерфейс'
                }).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSettingsTab(tab as any)}
                    className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      settingsTab === tab
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {draftSettings || session?.role !== 'admin' ? (
              <form onSubmit={handleSaveSettings} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
                  {settingsTab === 'pbx' && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3 border-b border-slate-200 pb-2">
                          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <Database className="h-4 w-4 text-red-600" />
                            MariaDB / FreePBX CDR
                          </h4>
                          <button
                            type="button"
                            onClick={testDbConnection}
                            disabled={isTestingDb}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            {isTestingDb && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                            Проверить MariaDB
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <label className="md:col-span-2 text-xs font-bold text-slate-600">Хост MariaDB<input type="text" value={draftSettings.dbHost} onChange={(e) => setDraftSettings({ ...draftSettings, dbHost: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" required /></label>
                          <label className="text-xs font-bold text-slate-600">Порт<input type="number" value={draftSettings.dbPort} onChange={(e) => setDraftSettings({ ...draftSettings, dbPort: parseInt(e.target.value, 10) || 3306 })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" required /></label>
                          <label className="text-xs font-bold text-slate-600">База<input type="text" value={draftSettings.dbName} onChange={(e) => setDraftSettings({ ...draftSettings, dbName: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" required /></label>
                          <label className="text-xs font-bold text-slate-600">Пользователь<input type="text" value={draftSettings.dbUser} onChange={(e) => setDraftSettings({ ...draftSettings, dbUser: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" required /></label>
                          <label className="text-xs font-bold text-slate-600">Пар��ль<input type="password" value={draftSettings.dbPass} onChange={(e) => setDraftSettings({ ...draftSettings, dbPass: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                        </div>
                        {dbTestResult && (
                          <div className={`mt-3 p-3.5 border rounded-lg text-xs flex items-start gap-2 ${dbTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${dbTestResult.success ? 'text-emerald-600' : 'text-red-600'}`} />
                            <span>{dbTestResult.message}</span>
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3 border-b border-slate-200 pb-2">
                          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <Phone className="h-4 w-4 text-red-600" />
                            AMI / Click2Call
                          </h4>
                          <button
                            type="button"
                            onClick={testAmiConnection}
                            disabled={isTestingAmi}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            {isTestingAmi && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                            Проверить AMI
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <label className="md:col-span-2 text-xs font-bold text-slate-600">Хост AMI<input type="text" value={draftSettings.amiHost || ''} onChange={(e) => setDraftSettings({ ...draftSettings, amiHost: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                          <label className="text-xs font-bold text-slate-600">Порт<input type="number" value={draftSettings.amiPort ?? 5038} onChange={(e) => setDraftSettings({ ...draftSettings, amiPort: parseInt(e.target.value, 10) || 5038 })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                          <label className="text-xs font-bold text-slate-600">Контекст<input type="text" value={draftSettings.amiContext || 'from-internal'} onChange={(e) => setDraftSettings({ ...draftSettings, amiContext: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                          <label className="md:col-span-2 text-xs font-bold text-slate-600">AMI User<input type="text" value={draftSettings.amiUser || ''} onChange={(e) => setDraftSettings({ ...draftSettings, amiUser: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                          <label className="md:col-span-2 text-xs font-bold text-slate-600">AMI Secret<input type="password" value={draftSettings.amiPass || ''} onChange={(e) => setDraftSettings({ ...draftSettings, amiPass: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                        </div>
                        {amiTestResult && (
                          <div className={`mt-3 p-3.5 border rounded-lg text-xs flex items-start gap-2 ${amiTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${amiTestResult.success ? 'text-emerald-600' : 'text-red-600'}`} />
                            <span>{amiTestResult.message}</span>
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-red-600" />Записи и KPI</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <label className="md:col-span-2 text-xs font-bold text-slate-600">Путь к записям<input type="text" value={draftSettings.recordingsPath} onChange={(e) => setDraftSettings({ ...draftSettings, recordingsPath: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" required /></label>
                          <label className="text-xs font-bold text-slate-600">SLA отзвона, мин<input type="number" min={1} max={1440} value={draftSettings.callbackKpiMinutes ?? 60} onChange={(e) => setDraftSettings({ ...draftSettings, callbackKpiMinutes: parseInt(e.target.value, 10) || 60 })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" /></label>
                        </div>
                      </div>
                    </div>
                  )}
                  {settingsTab === 'directory' && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-red-600" />Настройки</h4>
                        <div className="space-y-3 text-xs text-slate-700">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, normEnabled: e.target.checked })} className="rounded border-slate-300 text-red-600" />Включить нормализацию</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normStripSymbols ?? true} disabled={draftSettings.normDigitsOnly ?? false} onChange={(e) => setDraftSettings({ ...draftSettings, normStripSymbols: e.target.checked })} className="rounded border-slate-300 text-red-600" />Удалять спецсимволы</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normReplace8With7 ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, normReplace8With7: e.target.checked })} className="rounded border-slate-300 text-red-600" />Заменять 8 на 7</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normDigitsOnly ?? false} onChange={(e) => setDraftSettings({ ...draftSettings, normDigitsOnly: e.target.checked, normStripSymbols: e.target.checked ? false : (draftSettings.normStripSymbols ?? true) })} className="rounded border-slate-300 text-red-600" />Только цифры</label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draftSettings.directorySyncAsteriskBlacklist ?? false}
                              onChange={(e) => setDraftSettings({ ...draftSettings, directorySyncAsteriskBlacklist: e.target.checked })}
                              className="rounded border-slate-300 text-red-600"
                            />
                            Синхронизировать ЧС с Asterisk AstDB blacklist
                          </label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-red-600" />Импорт справочника по ссылке</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <label className="md:col-span-4 text-xs font-bold text-slate-600">URL файла CSV/JSON
                            <input type="text" value={draftSettings.directoryImportUrl || ''} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportUrl: e.target.value })} placeholder="https://site.ru/contacts.csv" className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-900 font-mono" />
                          </label>
                          <label className="text-xs font-bold text-slate-600">Формат
                            <select value={draftSettings.directoryImportFormat || 'csv'} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportFormat: e.target.value as any })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs">
                              <option value="csv">CSV</option>
                              <option value="json">JSON</option>
                            </select>
                          </label>
                          <label className="text-xs font-bold text-slate-600">Режим
                            <select value={draftSettings.directoryImportMode || 'upsert'} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportMode: e.target.value as any })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs">
                              <option value="upsert">Обновлять/добавлять</option>
                              <option value="append">Только добавить</option>
                              <option value="overwrite">Полностью заменить</option>
                            </select>
                          </label>
                          <label className="text-xs font-bold text-slate-600">Период
                            <select value={draftSettings.directoryImportSchedule || 'manual'} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportSchedule: e.target.value as any })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs">
                              <option value="manual">Только вручную</option>
                              <option value="hourly">Каждый час</option>
                              <option value="daily">Каждый день</option>
                              <option value="weekly">Раз в неделю</option>
                            </select>
                          </label>
                          <label className="text-xs font-bold text-slate-600">Sync token для cron
                            <input type="text" readOnly value={draftSettings.directorySyncToken || ''} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 font-mono" />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={handleTestUrlImport} disabled={isTestingUrlImport} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">{isTestingUrlImport ? 'Проверка...' : 'Проверить ссылку'}</button>
                          <button type="button" onClick={handleSyncDirectoryUrl} disabled={isSyncingDirectoryUrl} className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50">{isSyncingDirectoryUrl ? 'Синхронизация...' : 'Синхронизировать сейчас'}</button>
                        </div>
                        <div className="mt-3 text-[11px] text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 overflow-x-auto">
                          Cron: curl -s -X POST http://127.0.0.1:3000/api/directory/sync-url -H "X-Sync-Token: {draftSettings.directorySyncToken || 'TOKEN'}"
                        </div>
                        {urlImportTestResult && (
                          <div className={`mt-3 p-3 rounded-lg border text-xs font-bold ${urlImportTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{urlImportTestResult.message}</div>
                        )}
                        {(draftSettings.directoryLastSyncAt || draftSettings.directoryLastSyncMessage) && (
                          <div className="mt-3 text-xs text-slate-600">
                            Последняя синхронизация: <b>{draftSettings.directoryLastSyncAt || '—'}</b><br />
                            Статус: <b>{draftSettings.directoryLastSyncStatus || '—'}</b> — {draftSettings.directoryLastSyncMessage || '—'}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h4 className="text-sm font-black text-slate-900 mb-3">Инструменты справочника</h4>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setIsImportOpen(true)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700">Импорт контактов</button>
                          <button type="button" onClick={handleExportCSV} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold hover:bg-slate-200">Экспорт CSV</button>
                          <button type="button" onClick={handleNormalizeDirectoryDb} disabled={isNormalizingDb} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold hover:bg-slate-200 disabled:opacity-50">Нормализовать базу</button>
                        </div>
                        {normalizedCount !== null && <div className="mt-3 text-xs text-emerald-700 font-bold">Обновлено записей: {normalizedCount}</div>}
                      </div>
                    </div>
                  )}
                  {settingsTab === 'access' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between"><h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><UserCheck className="h-4 w-4 text-red-600" />Пользователи</h4>{isLoadingUsers && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}</div>
                        <div className="divide-y divide-slate-100 max-h-[430px] overflow-y-auto">
                          {accessUsers.map(user => (<div key={user.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50"><div className="min-w-0"><div className="font-black text-slate-900 text-sm truncate">{user.username}</div><div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2"><span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">{user.role}</span><span>SIP: <b>{user.extension || '—'}</b></span>{user.disabled && <span className="text-red-600 font-bold">Отключён</span>}</div></div><div className="flex gap-2 shrink-0"><button type="button" onClick={() => openEditUser(user)} className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"><Edit2 className="h-4 w-4" /></button><button type="button" onClick={() => deleteAccessUser(user)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button></div></div>))}
                          {accessUsers.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Пользователей пока нет.</div>}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3"><h4 className="text-sm font-black text-slate-900">{editingUserId ? 'Редактировать пользователя' : 'Новый пользователь'}</h4>{accessError && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold">{accessError}</div>}<label className="text-xs font-bold text-slate-600 block">Логин<input type="text" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs" /></label><label className="text-xs font-bold text-slate-600 block">Пароль {editingUserId && <span className="text-slate-400 font-normal">(пусто — не менять)</span>}<input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs" /></label><label className="text-xs font-bold text-slate-600 block">Роль<select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs"><option value="admin">Администратор</option><option value="manager">Руководитель</option><option value="operator">Оператор</option></select></label><label className="text-xs font-bold text-slate-600 block">SIP номер<input type="text" value={userForm.extension} onChange={(e) => setUserForm({ ...userForm, extension: e.target.value.replace(/[^\d]/g, '') })} className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-mono" placeholder="200" /></label><label className="flex items-center gap-2 text-xs text-slate-700 font-bold"><input type="checkbox" checked={userForm.disabled} onChange={(e) => setUserForm({ ...userForm, disabled: e.target.checked })} className="rounded border-slate-300 text-red-600" />Отключить пользователя</label><div className="flex gap-2 pt-2"><button type="button" onClick={() => saveAccessUser()} disabled={isSavingUser} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50">{isSavingUser ? 'Сохранение...' : 'Сохранить'}</button><button type="button" onClick={resetUserForm} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold">Сброс</button></div></div>
                    </div>
                  )}
                  {settingsTab === 'permissions' && (<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div className="p-4 bg-slate-50 border-b border-slate-200"><h4 className="text-sm font-black text-slate-900">Матрица доступа</h4><p className="text-xs text-slate-500 mt-1">Руководитель подготовлен для будущего просмотра и экспорта статистики в Excel.</p></div><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500 uppercase tracking-wider"><tr><th className="p-3 text-left">Возможность</th><th>Админ</th><th>Руководитель</th><th>Оператор</th></tr></thead><tbody className="divide-y divide-slate-100 text-center">{[['Все звонки','✔','✔','—'],['Только свои звонки','✔','✔','✔'],['Настройки АТС','✔','—','—'],['Пользователи и роли','✔','—','—'],['Справочник','✔','✔','✔'],['Click2Call лог','✔','✔','—'],['Экспорт Excel','✔','✔','—']].map(row => <tr key={row[0]}><td className="p-3 text-left font-bold text-slate-800">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td></tr>)}</tbody></table></div>)}
                  {settingsTab === 'appearance' && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <Sliders className="h-4 w-4 text-red-600" />
                        Настройки интерфейса и темы
                      </h4>
                      <p className="text-xs text-slate-500">
                        Настройте внешний вид панели управления звонками. Параметры сохраняются локально.
                      </p>
                      
                      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">Тёмная тема</span>
                          <span className="text-[11px] text-slate-500">Включить ночной режим во всей системе</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDarkMode(!darkMode)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer theme-toggle-switch ${
                            darkMode ? 'active' : ''
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              darkMode ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                  {dbTestResult && (<div className={`p-3.5 border rounded-lg text-xs flex items-start gap-2 ${dbTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}><AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${dbTestResult.success ? 'text-emerald-600' : 'text-red-600'}`} /><span>{dbTestResult.message}</span></div>)}
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-6 pt-4 border-t border-slate-200 bg-slate-50 shrink-0">
                  {session?.role === 'admin' ? (
                    <>
                      <button type="button" onClick={testDbConnection} disabled={isTestingDb} className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-1">
                        {isTestingDb && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Проверить связь
                      </button>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => { setIsSettingsOpen(false); setDbTestResult(null); resetUserForm(); }} className="text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg cursor-pointer transition-colors">
                          Отмена
                        </button>
                        <button type="submit" disabled={isSavingSettings} className="bg-red-600 hover:bg-red-700 text-xs font-bold text-white px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
                          Сохранить настройки
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full flex justify-end">
                      <button type="button" onClick={() => { setIsSettingsOpen(false); }} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer">
                        Закрыть
                      </button>
                    </div>
                  )}
                </div>
              </form>
            ) : (<div className="p-10 flex justify-center border-t border-slate-200"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>)}
          </div>
        </div>
      )}

      {/* MASS DIRECTORY IMPORT DIALOG (ADMINS ONLY) */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-slate-950/70  flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col z-[60]">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Upload className="h-5 w-5 text-red-600" />
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
                            <div className="font-mono text-red-800 dark:text-rose-200 font-bold">{item.number}</div>
                            <span className={`text-[9px] font-semibold px-2 py-0.2 rounded-full border ${
                              item.type === 'internal'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-red-50 text-red-600 border-red-150'
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
                          className="text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
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
                          className="text-red-500 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="font-bold text-red-600 hover:text-red-700">Очистить справочник и записать заново!</span>
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
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-red-600" />
                  {editingDirEntry ? 'Редактировать контакт' : 'Новый контакт'}
                </h3>
                <p className="text-xs text-slate-500 font-light mt-0.5">
                  Несколько телефонов, компания, должность, теги, СПАМ и черный список.
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

              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="text-slate-650 text-xs font-semibold">Статус контакта</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    <button type="button" onClick={() => setDirType('internal')} className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${dirType === 'internal' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      ☎ Внутренний
                    </button>
                    <button type="button" onClick={() => setDirType('client')} className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${dirType === 'client' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      👤 Клиент
                    </button>
                    <button type="button" onClick={() => setDirType('supplier')} className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${dirType === 'supplier' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      📦 Поставщик
                    </button>
                    <button type="button" onClick={() => setDirType('government')} className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${dirType === 'government' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      🏛 Госорган
                    </button>
                    <label className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 font-bold cursor-pointer">
                      <input type="checkbox" checked={dirIsSpam} onChange={(e) => setDirIsSpam(e.target.checked)} className="rounded border-amber-300 text-amber-600" />
                      СПАМ
                    </label>
                    <label className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700 font-bold cursor-pointer">
                      <input type="checkbox" checked={dirIsBlacklisted} onChange={(e) => setDirIsBlacklisted(e.target.checked)} className="rounded border-red-300 text-red-600" />
                      ЧС
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">ФИО *</label>
                    <input type="text" required value={dirName} onChange={(e) => setDirName(e.target.value)} placeholder="Иван Смирнов" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Основной телефон / SIP *</label>
                    <input type="text" required value={dirNumber} onChange={(e) => setDirNumber(e.target.value)} placeholder="100 или 79781234567" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Компания</label>
                    <input type="text" value={dirCompany} onChange={(e) => setDirCompany(e.target.value)} placeholder="ООО Компания" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Должность</label>
                    <input type="text" value={dirPosition} onChange={(e) => setDirPosition(e.target.value)} placeholder="Директор / менеджер" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Отдел</label>
                    <input type="text" value={dirDepartment} onChange={(e) => setDirDepartment(e.target.value)} placeholder="Продажи, IT, Бухгалтерия" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Теги</label>
                    <input type="text" value={dirTagsText} onChange={(e) => setDirTagsText(e.target.value)} placeholder="VIP; Клиент; СПАМ" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-slate-650 text-xs font-semibold">Дополнительные телефоны</label>
                    <textarea value={dirPhonesText} onChange={(e) => setDirPhonesText(e.target.value)} rows={3} placeholder="Каждый номер с новой строки или через запятую" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-slate-650 text-xs font-semibold">Комментарий</label>
                    <input type="text" value={dirComment} onChange={(e) => setDirComment(e.target.value)} placeholder="Комментарий, примечание, источник" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Email</label>
                    <input type="email" value={dirEmail} onChange={(e) => setDirEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-650 text-xs font-semibold">Сайт</label>
                    <input type="text" value={dirWebsite} onChange={(e) => setDirWebsite(e.target.value)} placeholder="site.ru" className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsDirFormOpen(false)} className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-lg text-xs font-medium cursor-pointer">Отмена</button>
                <button type="submit" disabled={isSavingDir} className="bg-red-600 hover:bg-red-700 text-xs font-semibold text-white px-4 py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1 min-w-[90px]">
                  {isSavingDir && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Сохранить</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLICK-TO-CALL AMI STATUS LOGS DIALOG */}
      {isCallingModalOpen && session?.role !== 'operator' && (
        <div className="fixed inset-0 bg-slate-950/80 -xs flex items-center justify-center p-4 z-50">
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
    </div>
  );
}
