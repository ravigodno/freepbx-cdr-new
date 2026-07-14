import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneCall,
  Headphones,
  Mic2,
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
  Home,
  Truck,
  Landmark,
  Ban,
  Wallet,
  Cpu,
  Wrench,
  ShieldCheck,
  Palette,
  Scroll,
  Bot
} from 'lucide-react';
import { CallEntry, DashboardStats, AppSettings, UserRole, DirectoryEntry } from './types';
import ScriptsTab from './components/ScriptsTab';
import AiAssistantTab from './components/AiAssistantTab';
import AIPBXAdminTab from './components/AIPBXAdminTab';
import packageJson from '../package.json';
import SngrepTab from './modules/monitoring/tabs/monitoring/SngrepTab';
import TcpdumpTab from './modules/monitoring/tabs/monitoring/TcpdumpTab';
import ReportsTab from './components/reports/ReportsTab';
import MarketingTab from './components/marketing/MarketingTab';
import { AboutSystemTab } from './components/AboutSystemTab';
import { type LiveTransferResult, type LiveTransferSearchTarget } from './components/LiveTransferSearch';
import { CallTargetSelector, type ConferenceBackendStatus } from './components/CallTargetSelector';
import ActiveCallsTab from './modules/monitoring/tabs/monitoring/ActiveCallsTab';
import { getLiveCallPopupTitle, normalizeLiveCallBannerPayload } from './utils/liveCallBanner';
import CommandCenterTab from './modules/monitoring/tabs/monitoring/CommandCenterTab';
const DbExplorerTab = lazy(() => import('./modules/monitoring/tabs/monitoring/DbExplorerTab'));
import QualityTab from './modules/monitoring/tabs/monitoring/QualityTab';
import DevicesMapTab from './modules/monitoring/tabs/monitoring/DevicesMapTab';
import HealthReportTab from './modules/monitoring/tabs/monitoring/HealthReportTab';
import { DirectoryStatusIcon } from './modules/directory/components/DirectoryStatusIcon';
import { fetchDirectory, fetchDirectoryAll, saveDirectoryEntry, deleteDirectoryEntry, toggleDirectoryBlacklist, toggleDirectorySpam, previewDirectoryImport, fetchDirectoryColumnSettings, saveMyDirectoryColumnSettings, resetMyDirectoryColumnSettings, saveGlobalDirectoryColumnSettings, resetGlobalDirectoryColumnSettings } from './modules/directory/services/directoryApi';
import CDRPage from './modules/cdr/pages/CDRPage';
import LegacyCDRTable from './modules/cdr/components/LegacyCDRTable';
import CDRProcessModal from './modules/cdr/components/CDRProcessModal';
import CDRChronologyModal from './modules/cdr/components/CDRChronologyModal';
import { buildCdrRowViewModel } from './modules/cdr/utils/CDRRowHelpers';
import { buildCdrQueryParams } from './modules/cdr/utils/buildCdrQueryParams';
import { hasUserPermission, PermissionKey } from './modules/access/permissions';
import PermissionsMatrixTab from './modules/access/components/PermissionsMatrixTab';
import AccessUsersTab from './modules/access/components/AccessUsersTab';
import {
  AccessUser,
  AccessRole,
  UserPermissions
} from './modules/access/types';
import {
  fetchAccessUsers,
  saveAccessUserApi,
  deleteAccessUserApi
} from './modules/access/services/accessApi';

import {
  fetchAccessRoles,
  saveAccessRoles
} from './modules/access/services/rolesApi';
import { fetchCdrStats, fetchCdrCalls } from './modules/cdr/services/cdrApi';
import { processCallSubmit } from './modules/cdr/utils/processCallSubmit';
import ProvisioningCenter from './modules/management/ProvisioningCenter';
import {
  AUTH_EXPIRED_LOGIN_MESSAGE,
  addAuthExpiredListener,
  clearStoredAuthSession,
  handleAuthExpiredResponse,
  installAuthExpiredFetchInterceptor,
  resetAuthExpiredHandled
} from './services/apiClient';
const BalanceCenter = lazy(() => import('./modules/management/BalanceCenter'));


type DirectoryRequiredColumnKey = 'type' | 'fullName' | 'phone';
type DirectorySystemColumnKey = 'actions';
type DirectoryOptionalColumnKey =
  | 'visibility'
  | 'isSpam'
  | 'organization'
  | 'position'
  | 'phone2'
  | 'email'
  | 'website'
  | 'inn'
  | 'kpp'
  | 'ogrn'
  | 'address'
  | 'comment'
  | 'department'
  | 'group'
  | 'tags'
  | 'internalExtension'
  | 'linkedExternalNumber'
  | 'responsibleUserId';
type DirectoryColumnKey = DirectoryRequiredColumnKey | DirectoryOptionalColumnKey | DirectorySystemColumnKey;

type ContactSyncProvider = 'google' | 'yandex' | 'mailru' | 'file';

const directoryEntryToMeetingTarget = (entry: DirectoryEntry): LiveTransferSearchTarget | null => {
  if (entry.isSpam || entry.isBlacklisted || (entry as any).hidden || (entry as any).disabled) return null;
  const extension = String(entry.internalExtension || '').replace(/\D/g, '');
  const rawPhone = String(entry.number || entry.phones?.[0] || '').trim();
  const phone = rawPhone.replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7');
  const targetType = /^\d{2,5}$/.test(extension) ? 'internal' : 'directory_phone';
  const targetNumber = targetType === 'internal' ? extension : phone;
  if (!(targetType === 'internal' ? /^\d{2,5}$/.test(targetNumber) : /^\d{6,15}$/.test(targetNumber))) return null;
  const displayName = String(entry.name || entry.company || 'Контакт').trim();
  return {
    id: String(entry.id), label: displayName, displayName, displayNumber: targetNumber, targetNumber, targetType,
    numberLabel: targetType === 'internal' ? 'Внутренний номер' : 'Основной телефон', extension,
    name: displayName, company: String(entry.company || ''), phone: rawPhone, phone2: '', extraPhone: '',
    department: String(entry.department || ''), position: String(entry.position || ''), comment: String(entry.comment || ''),
    metadataMatches: [], canCall: true, canTransfer: true, canConference: true, disabledReason: '', transferDisabledReason: '',
    sipStatus: 'unknown', deviceStatus: 'unknown', deviceType: '', source: 'directory'
  };
};
type ContactFileSourceFormat = 'google_csv' | 'mailru_csv' | 'generic_csv' | 'yandex_vcf' | 'generic_vcf';
type DirectoryPageMode = 'list' | 'import' | 'personal_import' | 'contact_new' | 'contact_edit';
type OnlineContactSyncProvider = Exclude<ContactSyncProvider, 'file'>;
type ContactSyncStatus = 'connected' | 'disconnected' | 'error' | 'not_configured';
type ContactSyncAuthType = 'oauth' | 'carddav' | 'file';
type ContactSyncDirection = 'import_only' | 'export_only' | 'two_way';
type ContactSyncConflictStrategy = 'manual_review' | 'pbxpuls_wins' | 'external_wins' | 'latest_update_wins';

interface ContactSyncProviderAccount {
  id?: string | null;
  provider: ContactSyncProvider;
  status: ContactSyncStatus;
  externalAccountEmail?: string | null;
  authType: ContactSyncAuthType;
  carddavUrl?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  syncDirection?: ContactSyncDirection;
  conflictStrategy?: ContactSyncConflictStrategy;
  configured?: boolean;
}

interface ContactSyncPreviewItem {
  status: 'new' | 'possible_duplicate' | 'invalid' | string;
  externalContactId: string;
  fullName?: string;
  organization?: string;
  position?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  website?: string;
  address?: string;
  comment?: string;
  department?: string;
  group?: string;
  tags?: string;
  visibility?: string;
  type?: string;
  isSpam?: boolean;
  warnings?: string[];
  errors?: string[];
}

interface ContactFilePreviewSummary {
  totalRows: number;
  totalPreviewed: number;
  readyToImport: number;
  invalid: number;
  duplicates: number;
  sourceFormat: ContactFileSourceFormat | '';
  encoding: string;
}

interface CardDavConnectForm {
  email: string;
  appPassword: string;
  carddavUrl: string;
}

interface ContactSyncDiagnosticStep {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
}

interface ContactSyncDiagnosticResult {
  provider: ContactSyncProvider;
  ok: boolean;
  steps: ContactSyncDiagnosticStep[];
}

interface DirectoryColumnConfig {
  key: DirectoryColumnKey;
  label: string;
  required?: boolean;
  system?: boolean;
  className?: string;
}

const DIRECTORY_PAGE_SIZE = 20;
const requiredDirectoryColumns: DirectoryRequiredColumnKey[] = ['type', 'fullName', 'phone'];
const systemDirectoryColumns: DirectorySystemColumnKey[] = ['actions'];
type DirectoryVisibleColumnKey = DirectoryRequiredColumnKey | DirectoryOptionalColumnKey;

type DirectoryColumnSettingsSource = 'user' | 'global' | 'system';
const defaultDirectoryVisibleColumns: DirectoryVisibleColumnKey[] = ['type', 'fullName', 'phone', 'email', 'organization', 'visibility', 'isSpam'];
const directoryContactFormFieldOrder: DirectoryVisibleColumnKey[] = [
  'type',
  'visibility',
  'isSpam',
  'organization',
  'fullName',
  'position',
  'phone',
  'phone2',
  'email',
  'website',
  'inn',
  'kpp',
  'ogrn',
  'address',
  'department',
  'group',
  'tags',
  'internalExtension',
  'linkedExternalNumber',
  'responsibleUserId',
  'comment'
];
const optionalDirectoryColumns: DirectoryColumnConfig[] = [
  { key: 'visibility', label: 'Видимость' },
  { key: 'isSpam', label: 'Спам' },
  { key: 'organization', label: 'Организация', className: 'w-[230px] min-w-[190px] max-w-[230px]' },
  { key: 'position', label: 'Должность' },
  { key: 'phone2', label: 'Доп. телефон' },
  { key: 'email', label: 'Email', className: 'min-w-[160px] max-w-[220px]' },
  { key: 'website', label: 'Сайт', className: 'min-w-[150px] max-w-[200px]' },
  { key: 'inn', label: 'ИНН' },
  { key: 'kpp', label: 'КПП' },
  { key: 'ogrn', label: 'ОГРН' },
  { key: 'address', label: 'Адрес', className: 'min-w-[180px] max-w-[260px]' },
  { key: 'comment', label: 'Комментарий', className: 'min-w-[180px] max-w-[260px]' },
  { key: 'department', label: 'Отдел / группа' },
  { key: 'group', label: 'Группа' },
  { key: 'tags', label: 'Теги', className: 'min-w-[160px]' },
  { key: 'internalExtension', label: 'Внутренний номер' },
  { key: 'linkedExternalNumber', label: 'Связанный внешний номер' },
  { key: 'responsibleUserId', label: 'Ответственный сотрудник' }
];
const requiredDirectoryColumnConfigs: DirectoryColumnConfig[] = [
  { key: 'type', label: 'Тип', required: true, className: 'w-[74px]' },
  { key: 'fullName', label: 'ФИО', required: true, className: 'min-w-[150px]' },
  { key: 'phone', label: 'Телефон', required: true, className: 'min-w-[160px]' }
];
const systemDirectoryColumnConfigs: DirectoryColumnConfig[] = [
  { key: 'actions', label: 'Действия', system: true, className: 'min-w-[132px] text-right' }
];
const directoryColumnConfigs: DirectoryColumnConfig[] = [
  ...requiredDirectoryColumnConfigs,
  ...optionalDirectoryColumns,
  ...systemDirectoryColumnConfigs
];
const optionalDirectoryColumnKeys = optionalDirectoryColumns.map(column => column.key as DirectoryOptionalColumnKey);
const visibleDirectoryColumnKeys = [...requiredDirectoryColumns, ...optionalDirectoryColumnKeys] as DirectoryVisibleColumnKey[];

const sanitizeDirectoryVisibleColumns = (columns: unknown): DirectoryVisibleColumnKey[] => {
  const values = Array.isArray(columns) ? columns : [];
  const sanitized: DirectoryVisibleColumnKey[] = [];
  values.forEach(column => {
    if (visibleDirectoryColumnKeys.includes(column as DirectoryVisibleColumnKey) && !sanitized.includes(column as DirectoryVisibleColumnKey)) {
      sanitized.push(column as DirectoryVisibleColumnKey);
    }
  });
  if (sanitized.length === 0) return defaultDirectoryVisibleColumns;
  return [
    ...requiredDirectoryColumns.filter(column => !sanitized.includes(column)),
    ...sanitized
  ];
};

const loadDirectoryVisibleColumns = (): DirectoryVisibleColumnKey[] => defaultDirectoryVisibleColumns;

const getDirectoryColumnSettingsSourceLabel = (source: DirectoryColumnSettingsSource) => {
  if (source === 'user') return 'личная настройка';
  if (source === 'global') return 'базовая настройка';
  return 'системная настройка';
};

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
        className="min-w-[112px] bg-white border border-slate-200 rounded px-2.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-blue-500 hover:border-slate-300 transition-all text-left flex items-center gap-1.5 cursor-pointer"
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
                      ? 'bg-blue-600 text-white shadow-sm'
                      : isToday
                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
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
  id?: string;
  token: string;
  username: string;
  role: UserRole;
  extension?: string;
  disabled?: boolean;
  permissions?: UserPermissions;
}


const Logo3D = ({
  className = "h-5 w-5",
  logoUrl,
  withText = false,
}: {
  className?: string;
  logoUrl?: string;
  withText?: boolean;
}) => {
  if (logoUrl) {
    return <img src={logoUrl} className={className} alt="PBXPULS" />;
  }

  if (withText) {
    return (
      <div className="flex items-center gap-3 whitespace-nowrap leading-none">
        <img
          src="/brand/pbx_icon.svg"
          className="h-12 w-12 shrink-0"
          alt="PBXPULS"
        />
        <img
          src="/brand/pbx_text.svg"
          className="h-[30px] w-auto shrink-0 block"
          alt="PBXPULS"
        />
      </div>
    );
  }

  return <img src="/brand/pbx_icon.svg" className={className} alt="PBXPULS" />;
};



interface LiveCallBanner {
  active: boolean;
  direction?: 'incoming' | 'outgoing' | 'internal';
  operatorExt?: string;
  number?: string;
  callerNumber?: string;
  externalCallerNumber?: string;
  internalCaller?: string;
  sourceNumber?: string;
  destinationNumber?: string;
  dialedNumber?: string;
  targetNumber?: string;
  internalNumber?: string;
  trunkNumber?: string;
  displayNumber?: string;
  displayName?: string;
  subtitle?: string;
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
};

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

  const hasPermission = (perm: PermissionKey) => {
    return hasUserPermission(session, settings, perm);
  };

  const isAdminRole = (role?: string | null) => role === 'admin' || role === 'su';
  const isDirectoryContactImportEnabled = () => settings?.directoryImportEnabled !== false;
  const canOpenPersonalContactImport = () => isDirectoryContactImportEnabled() && (isAdminRole(session?.role) || hasPermission('directory_import_contacts'));
  const getPersonalContactImportUnavailableMessage = () => {
    if (!isDirectoryContactImportEnabled()) return 'Импорт контактов отключен администратором.';
    if (!isAdminRole(session?.role) && !hasPermission('directory_import_contacts')) return 'У вас нет прав на импорт контактов.';
    return '';
  };
  const isContactImportSourceEnabled = (provider: ContactSyncProvider) => {
    if (!isDirectoryContactImportEnabled()) return false;
    if (provider === 'google') return settings?.googleImportEnabled !== false;
    if (provider === 'file') return settings?.fileImportEnabled !== false;
    if (provider === 'yandex') return settings?.yandexCarddavEnabled !== false;
    if (provider === 'mailru') return settings?.mailruCarddavEnabled !== false;
    return false;
  };
  const canShowContactImportSource = (provider: ContactSyncProvider) => isAdminRole(session?.role) || isContactImportSourceEnabled(provider);
  const getContactImportSourceDisabledMessage = (provider: ContactSyncProvider) => {
    if (!isDirectoryContactImportEnabled()) return 'Импорт контактов отключен администратором.';
    if (provider === 'google') return 'Google Contacts импорт отключен администратором.';
    if (provider === 'file') return 'CSV/vCard импорт отключен администратором.';
    if (provider === 'yandex') return 'Расширенное подключение Yandex отключено администратором.';
    if (provider === 'mailru') return 'Расширенное подключение Mail.ru отключено администратором.';
    return 'Источник импорта отключен администратором.';
  };
  const guardContactImportSource = (provider: ContactSyncProvider) => {
    const unavailableMessage = getPersonalContactImportUnavailableMessage();
    if (unavailableMessage) {
      setContactSyncMessage(unavailableMessage);
      return false;
    }
    if (!isContactImportSourceEnabled(provider)) {
      setContactSyncMessage(getContactImportSourceDisabledMessage(provider));
      return false;
    }
    return true;
  };

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<AppSettings | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingAmi, setIsTestingAmi] = useState(false);
  const [amiTestResult, setAmiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingFreePBXApi, setIsTestingFreePBXApi] = useState(false);
  const [freepbxApiTestResult, setFreePBXApiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'pbx' | 'directory' | 'access' | 'permissions' | 'design' | 'appearance'>('pbx');

  // Load public settings for logo and copyright customization
  const [publicSettings, setPublicSettings] = useState<{ customLogoUrl?: string; customCopyright?: string } | null>(null);

  useEffect(() => {
    const fetchPublicSettings = async () => {
      try {
        const resp = await fetch('/api/settings/public');
        if (resp.ok) {
          const data = await resp.json();
          setPublicSettings(data);
        }
      } catch (err) {
        console.error('Failed to load public settings:', err);
      }
    };
    fetchPublicSettings();
  }, []);

  // Dark environment / theme settings
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('asterisk_cdr_dark_mode') === 'true';
  });

  useEffect(() => {
    if (!session) {
      document.documentElement.classList.remove('dark');
      return;
    }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('asterisk_cdr_dark_mode', String(darkMode));
  }, [darkMode, session]);

  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState('');

  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'operator' as UserRole,
    extension: '',
    disabled: false,
    permissions: {}
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
  const [activeView, setActiveView] = useState<'calls' | 'directory' | 'reports' | 'marketing' | 'monitoring' | 'management' | 'balance' | 'settings' | 'about' | 'scripts' | 'ai-assistant' | 'ai-pbx-admin'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === '/management/directory/import') return 'directory';
    if (window.location.pathname === '/directory/import-contacts') return 'directory';
    if (/^\/management\/directory\/contact\/new$/.test(window.location.pathname)) return 'directory';
    if (/^\/management\/directory\/contact\/[^/]+\/edit$/.test(window.location.pathname)) return 'directory';
    if (params.get('tab') === 'marketing' || params.get('yandexOAuth')) return 'marketing';
    const saved = localStorage.getItem('asterisk_cdr_active_view') as 'calls' | 'directory' | 'reports' | 'marketing' | 'monitoring' | 'management' | 'balance' | 'about' | 'scripts' | 'ai-assistant' | 'ai-pbx-admin' | null;
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
  const [monitorMode, setMonitorMode] = useState<'calls' | 'tcpdump' | 'sngrep' | 'cli' | 'freepbx' | 'db' | 'devices' | 'quality'>(() => {
    const saved = localStorage.getItem('asterisk_cdr_monitor_mode') as 'calls' | 'tcpdump' | 'sngrep' | 'cli' | 'freepbx' | 'db' | 'devices' | 'quality' | null;
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
  const [directoryLookup, setDirectoryLookup] = useState<DirectoryEntry[]>([]);
  const [selectedMeetingContactIds, setSelectedMeetingContactIds] = useState<string[]>([]);
  const [conferenceBackendStatus, setConferenceBackendStatus] = useState<ConferenceBackendStatus | null>(null);
  const selectedMeetingTargets = useMemo(() => selectedMeetingContactIds
    .map(id => directory.find(entry => entry.id === id) || directoryLookup.find(entry => entry.id === id))
    .filter((entry): entry is DirectoryEntry => Boolean(entry))
    .map(directoryEntryToMeetingTarget)
    .filter((target): target is LiveTransferSearchTarget => Boolean(target)), [selectedMeetingContactIds, directory, directoryLookup]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [editingDirEntry, setEditingDirEntry] = useState<DirectoryEntry | null>(null);
  const [dirName, setDirName] = useState('');
  const [dirNumber, setDirNumber] = useState('');
  const [dirPhonesText, setDirPhonesText] = useState('');
  const [dirCompany, setDirCompany] = useState('');
  const [dirPosition, setDirPosition] = useState('');
  const [dirDepartment, setDirDepartment] = useState('');
  const [dirEmail, setDirEmail] = useState('');
  const [dirWebsite, setDirWebsite] = useState('');
  const [dirInn, setDirInn] = useState('');
  const [dirKpp, setDirKpp] = useState('');
  const [dirOgrn, setDirOgrn] = useState('');
  const [dirAddress, setDirAddress] = useState('');
  const [dirGroup, setDirGroup] = useState('');
  const [dirInternalExtension, setDirInternalExtension] = useState('');
  const [dirLinkedExternalNumber, setDirLinkedExternalNumber] = useState('');
  const [dirResponsibleUserId, setDirResponsibleUserId] = useState('');
  const [dirTagsText, setDirTagsText] = useState('');
  const [dirIsSpam, setDirIsSpam] = useState(false);
  const [dirIsBlacklisted, setDirIsBlacklisted] = useState(false);
  const [dirType, setDirType] = useState<'internal' | 'client' | 'supplier' | 'government'>('client');
  const [dirVisibility, setDirVisibility] = useState<'shared' | 'private'>('shared');
  const [dirComment, setDirComment] = useState('');
  const [dirError, setDirError] = useState('');
  const [dirNotice, setDirNotice] = useState('');
  const [isSavingDir, setIsSavingDir] = useState(false);
  const [dirSearchQuery, setDirSearchQuery] = useState('');
  const [dirTypeFilter, setDirTypeFilter] = useState<'all' | 'client' | 'supplier' | 'government' | 'internal'>('all');
  const [dirSpamMode, setDirSpamMode] = useState<'all' | 'exclude_spam' | 'only_spam'>('exclude_spam');
  const [dirVisibilityMode, setDirVisibilityMode] = useState<'all' | 'shared_only' | 'private_only' | 'my_private_only' | 'exclude_private' | 'exclude_shared'>('all');
  const [dirPage, setDirPage] = useState(1);
  const [dirPageSize] = useState(DIRECTORY_PAGE_SIZE);
  const [dirTotal, setDirTotal] = useState(0);
  const [dirTotalPages, setDirTotalPages] = useState(1);
  const [dirListError, setDirListError] = useState('');
  const [dirFormShowAllFields, setDirFormShowAllFields] = useState(false);
  const [isDirectoryColumnsPanelOpen, setIsDirectoryColumnsPanelOpen] = useState(false);
  const [selectedDirectoryVisibleColumns, setSelectedDirectoryVisibleColumns] = useState<DirectoryVisibleColumnKey[]>(loadDirectoryVisibleColumns);

  const [directoryColumnSettingsSource, setDirectoryColumnSettingsSource] = useState<DirectoryColumnSettingsSource>('system');
  const [canManageGlobalDirectoryColumns, setCanManageGlobalDirectoryColumns] = useState(false);
  const [directoryColumnSettingsStatus, setDirectoryColumnSettingsStatus] = useState('');
  const [draftDirectoryVisibleColumns, setDraftDirectoryVisibleColumns] = useState<DirectoryVisibleColumnKey[]>(selectedDirectoryVisibleColumns);
  const [directoryPageMode, setDirectoryPageMode] = useState<DirectoryPageMode>(() => {
    if (window.location.pathname === '/management/directory/import') return 'import';
    if (window.location.pathname === '/directory/import-contacts') return 'personal_import';
    if (window.location.pathname === '/management/directory/contact/new') return 'contact_new';
    if (/^\/management\/directory\/contact\/[^/]+\/edit$/.test(window.location.pathname)) return 'contact_edit';
    return 'list';
  });
  const [directoryContactEditId, setDirectoryContactEditId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/management\/directory\/contact\/([^/]+)\/edit$/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [urlImportTestResult, setUrlImportTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingUrlImport, setIsTestingUrlImport] = useState(false);
  const [isSyncingDirectoryUrl, setIsSyncingDirectoryUrl] = useState(false);
  const [contactSyncAccounts, setContactSyncAccounts] = useState<ContactSyncProviderAccount[]>([]);
  const [contactSyncMessage, setContactSyncMessage] = useState('');
  const [contactSyncBusyProvider, setContactSyncBusyProvider] = useState<ContactSyncProvider | null>(null);
  const [cardDavForms, setCardDavForms] = useState<Record<'yandex' | 'mailru', CardDavConnectForm>>({
    yandex: { email: '', appPassword: '', carddavUrl: 'https://carddav.yandex.ru' },
    mailru: { email: '', appPassword: '', carddavUrl: 'https://carddav.mail.ru' }
  });
  const contactFileInputRef = useRef<HTMLInputElement | null>(null);
  const [contactFileName, setContactFileName] = useState('');
  const [contactSyncPreviewItems, setContactSyncPreviewItems] = useState<Record<ContactSyncProvider, ContactSyncPreviewItem[]>>({ google: [], yandex: [], mailru: [], file: [] });
  const [contactSyncSelectedIds, setContactSyncSelectedIds] = useState<Record<ContactSyncProvider, string[]>>({ google: [], yandex: [], mailru: [], file: [] });
  const [contactSyncForceDuplicates, setContactSyncForceDuplicates] = useState<Record<ContactSyncProvider, boolean>>({ google: false, yandex: false, mailru: false, file: false });
  const [contactSyncDiagnostics, setContactSyncDiagnostics] = useState<Partial<Record<ContactSyncProvider, ContactSyncDiagnosticResult>>>({});
  const [contactFileSourceFormat, setContactFileSourceFormat] = useState<ContactFileSourceFormat | ''>('');
  const [contactFileEncoding, setContactFileEncoding] = useState('');
  const [contactFilePreviewSummary, setContactFilePreviewSummary] = useState<ContactFilePreviewSummary | null>(null);

  // --- ADMIN DIRECTORY IMPORT / EXPORT & NORMALIZATION STATE ---
  const [isAdminPanelExpanded, setIsAdminPanelExpanded] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFileError, setImportFileError] = useState('');
  const [parsedImportEntries, setParsedImportEntries] = useState<any[]>([]);
  const [importOverwriteMode, setImportOverwriteMode] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [importDuplicateCount, setImportDuplicateCount] = useState(0);
  const [isNormalizingDb, setIsNormalizingDb] = useState(false);
  const [normalizedCount, setNormalizedCount] = useState<number | null>(null);

  const directoryPhoneValidationMessage = 'Телефон должен содержать от 2 до 11 цифр. Допустимы + в начале, пробелы, дефисы и скобки.';

  const normalizePhoneDigits = (value: string): string => String(value || '').replace(/\D/g, '');

  const validateDirectoryPhoneNumber = (value: string): boolean => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    const digits = normalizePhoneDigits(raw);
    const plusCount = (raw.match(/\+/g) || []).length;
    const allowed = /^\+?[0-9\s\-()]+$/.test(raw);
    const plusOk = plusCount <= 1 && (plusCount === 0 || raw.startsWith('+'));
    return allowed && plusOk && digits.length >= 2 && digits.length <= 11;
  };

  const getDirectoryPhoneValidationErrors = (phones: string[]): string[] => {
    return Array.from(new Set(
      phones
        .map(phone => String(phone || '').trim())
        .filter(Boolean)
        .filter(phone => !validateDirectoryPhoneNumber(phone))
        .map(phone => 'Телефон "' + phone + '" невалиден. ' + directoryPhoneValidationMessage)
    ));
  };

  const parseDirectoryImportBoolean = (value: string, fieldLabel: string): { value: boolean; error?: string } => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return { value: false };
    if (['true', '1', 'yes', 'да'].includes(raw)) return { value: true };
    if (['false', '0', 'no', 'нет'].includes(raw)) return { value: false };
    return { value: false, error: fieldLabel + ': допустимы true/false, 1/0, yes/no, да/нет' };
  };

  const cleanImportedEmail = (value: string): string => {
    const raw = String(value || '').trim();
    const markdownMail = raw.match(/^\[([^\]]+)\]\(mailto:([^\)]+)\)$/i);
    return markdownMail ? markdownMail[2].trim() : raw;
  };

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
    setDirInn('');
    setDirKpp('');
    setDirOgrn('');
    setDirAddress('');
    setDirGroup('');
    setDirInternalExtension('');
    setDirLinkedExternalNumber('');
    setDirResponsibleUserId('');
    setDirTagsText('');
    setDirIsSpam(false);
    setDirIsBlacklisted(false);
    setDirType('client');
    setDirVisibility('shared');
    setDirComment('');
    setDirError('');
    setDirFormShowAllFields(false);
  };


  const showAuthExpiredLogin = useCallback(() => {
    const hadSession = !!localStorage.getItem('asterisk_cdr_session');
    clearStoredAuthSession();
    setSession(null);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingRecording(null);
    setPlayingCallId(null);
    setLoginPassword('');
    // Show expired-session message only when we really had an active session.
    // Do not keep showing it on the login screen after a fresh login attempt.
    setLoginError(hadSession ? AUTH_EXPIRED_LOGIN_MESSAGE : '');
  }, []);

  useEffect(() => {
    installAuthExpiredFetchInterceptor();
    return addAuthExpiredListener(showAuthExpiredLogin);
  }, [showAuthExpiredLogin]);

  // Helper to handle unauthorized status (expired/missing token)
  // Do not logout on generic network errors/timeouts.
  // Logout only when backend really returned 401 Unauthorized.
  const handleAuthError = (resp?: Response) => {
    if (resp && resp.status === 401) {
      handleAuthExpiredResponse(resp);
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
      const hasHeader = header.some(h => ['name','fullname','имя','фио','company','organization','компания','phone','phone1','телефон','номер'].includes(h));
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
        const name = hasHeader ? (getByHeader(cols, 'fullName','fullname','name','имя','фио','contact','контакт') || cols[0]) : cols[0];
        const company = hasHeader ? getByHeader(cols, 'organization','company','компания','организация') : '';
        const position = hasHeader ? getByHeader(cols, 'position','должность','job','title') : '';
        const phone1 = hasHeader ? (getByHeader(cols, 'phone','phone1','телефон1','номер1','телефон','номер') || cols[1]) : cols[1];
        const phone2 = hasHeader ? getByHeader(cols, 'phone2','телефон2','номер2') : '';
        const phone3 = hasHeader ? getByHeader(cols, 'phone3','телефон3','номер3') : '';
        const email = cleanImportedEmail(hasHeader ? getByHeader(cols, 'email','почта','e-mail') : '');
        const website = hasHeader ? getByHeader(cols, 'website','сайт','site') : '';
        const tagsRaw = hasHeader ? getByHeader(cols, 'tags','теги','tag') : '';
        const comment = hasHeader ? getByHeader(cols, 'comment','комментарий','notes') : (cols[3] || '');
        const typeRaw = hasHeader ? getByHeader(cols, 'type','тип') : (cols[2] || '');
        const isSpamRaw = hasHeader ? getByHeader(cols, 'isSpam','is_spam','spam','спам') : '';
        const parsedSpam = parseDirectoryImportBoolean(isSpamRaw, 'isSpam');
        const isSpam = parsedSpam.value;
        const isBlacklisted = /^(1|true|yes|да)$/i.test(hasHeader ? getByHeader(cols, 'is_blacklisted','blacklist','черный список','чс') : '');
        const phones = [phone1, phone2, phone3].map(v => String(v || '').trim()).filter(Boolean);
        if (!(name || company) || (phones.length === 0 && !email)) return null;

        let type: 'internal' | 'client' | 'supplier' | 'government' = 'client';
        const normalizedTypeRaw = String(typeRaw || '').trim().toLowerCase();
        const typeErrors: string[] = [];
        if (!normalizedTypeRaw) {
          if ((phones[0] || '').replace(/\D/g, '').length > 0 && (phones[0] || '').replace(/\D/g, '').length <= 5) type = 'internal';
        } else if (['client', 'клиент'].includes(normalizedTypeRaw)) type = 'client';
        else if (['supplier', 'поставщик'].includes(normalizedTypeRaw)) type = 'supplier';
        else if (['government', 'госорган'].includes(normalizedTypeRaw)) type = 'government';
        else if (['internal', 'внутренний'].includes(normalizedTypeRaw)) type = 'internal';
        else typeErrors.push('type: допустимы client, supplier, government');
        const visibilityRaw = hasHeader ? getByHeader(cols, 'visibility','видимость') : '';
        const normalizedVisibilityRaw = String(visibilityRaw || '').trim().toLowerCase();
        const visibilityErrors: string[] = [];
        const visibility: 'shared' | 'private' = !normalizedVisibilityRaw || normalizedVisibilityRaw === 'shared' || normalizedVisibilityRaw === 'общий'
          ? 'shared'
          : normalizedVisibilityRaw === 'private' || normalizedVisibilityRaw === 'личный'
            ? 'private'
            : 'shared';
        if (normalizedVisibilityRaw && !['shared', 'private', 'общий', 'личный'].includes(normalizedVisibilityRaw)) {
          visibilityErrors.push('visibility: допустимы shared или private');
        }
        const inn = hasHeader ? getByHeader(cols, 'inn','инн') : '';
        const kpp = hasHeader ? getByHeader(cols, 'kpp','кпп') : '';
        const ogrn = hasHeader ? getByHeader(cols, 'ogrn','огрн') : '';
        const address = hasHeader ? getByHeader(cols, 'address','адрес') : '';
        const department = hasHeader ? getByHeader(cols, 'department','отдел') : '';
        const group = hasHeader ? getByHeader(cols, 'group','группа') : '';
        const internalExtension = hasHeader ? getByHeader(cols, 'internalExtension','внутренний номер','extension') : '';
        const linkedExternalNumber = hasHeader ? getByHeader(cols, 'linkedExternalNumber','связанный внешний номер','externalNumber') : '';
        const responsibleUserId = hasHeader ? getByHeader(cols, 'responsibleUserId','ответственный сотрудник','responsible') : '';
        const importErrors = [
          ...typeErrors,
          ...visibilityErrors,
          ...(parsedSpam.error ? [parsedSpam.error] : []),
          ...getDirectoryPhoneValidationErrors([...phones, linkedExternalNumber])
        ];

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
          visibility,
          comment,
          inn,
          kpp,
          ogrn,
          address,
          department,
          group,
          internalExtension,
          linkedExternalNumber,
          responsibleUserId,
          _importErrors: importErrors,
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
    if (!hasPermission('manage_directory_import')) {
      alert('Нет прав на работу с импортом справочника.');
      return;
    }

    try {
      const BOM = "\uFEFF";
      let csvContent = BOM + "type,visibility,isSpam,organization,fullName,position,phone,phone2,email,website,inn,kpp,ogrn,address,comment,department,group,tags,internalExtension,linkedExternalNumber,responsibleUserId\r\n";
      csvContent += "client,shared,false,ООО Ромашка,Иван Иванов,директор,+79781234567,365200000,test@mail.ru,example.com,9102000000,910201001,1234567890123,Симферополь,обычный контакт,Продажи,Клиенты,\"VIP; тендер\",101,79781234567,u1\r\n";
      csvContent += "supplier,private,false,ООО Личный,Петр Петров,менеджер,100,,private@mail.ru,,,,,Севастополь,личный контакт с внутренним номером,Закупки,Поставщики,личный,100,,\r\n";
      csvContent += "government,shared,true,ФНС,Спам Контакт,,99999999999,,spam@mail.ru,,,,,Симферополь,спам-тест,Госорганы,Проверка,спам,,,\r\n";
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "shablon_importa_kontaktov_directory.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      alert('Ошибка при скачивании шаблона: ' + e.message);
    }
  };

  const handleExportCSV = async () => {
    if (!hasPermission('manage_directory_import')) {
      alert('Нет прав на экспорт справочника.');
      return;
    }

    try {
      const exportRows = await fetchDirectoryAll(session?.token || '', {
        q: dirSearchQuery,
        type: dirTypeFilter,
        spamMode: dirSpamMode,
        visibilityMode: dirVisibilityMode
      });
      const BOM = "\uFEFF";
      let csvContent = BOM + "type,visibility,isSpam,organization,fullName,position,phone,phone2,email,website,inn,kpp,ogrn,address,comment,department,group,tags,internalExtension,linkedExternalNumber,responsibleUserId\r\n";

      exportRows.forEach(entry => {
        const phones = getEntryPhones(entry);
        const values = [
          entry.type || 'client',
          entry.visibility === 'private' ? 'private' : 'shared',
          entry.isSpam ? 'true' : 'false',
          entry.company || '',
          entry.name || '',
          entry.position || '',
          phones[0] || '',
          phones[1] || '',
          entry.email || '',
          entry.website || '',
          entry.inn || '',
          entry.kpp || '',
          entry.ogrn || '',
          entry.address || '',
          entry.comment || '',
          entry.department || '',
          entry.group || '',
          getDirectoryEntryTags(entry).join('; '),
          entry.internalExtension || '',
          entry.linkedExternalNumber || '',
          entry.responsibleUserId || ''
        ].map(v => '"' + String(v || '').replace(/"/g, '""') + '"');
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
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Ошибка при экспорте: ' + e.message);
    }
  };

  const handleNormalizeDirectoryDb = async () => {
    if (!hasPermission('manage_directory_import')) {
      alert('Нет прав на нормализацию справочника.');
      return;
    }

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
        await loadDirectory(dirPage);
        await loadDirectoryLookup();
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
    if (!hasPermission('manage_directory_import')) {
      alert('Нет прав на проверку URL-импорта.');
      return;
    }

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
    if (!hasPermission('manage_directory_import')) {
      alert('Нет прав на синхронизацию справочника.');
      return;
    }

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
        setDirPage(1);
        await loadDirectory(1);
        await loadDirectoryLookup();
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


  const contactSyncProviderLabels: Record<ContactSyncProvider, string> = {
    google: 'Google Contacts',
    yandex: 'Yandex Contacts',
    mailru: 'Mail.ru Contacts',
    file: 'CSV/vCard'
  };

  const contactFileSourceFormatLabels: Record<ContactFileSourceFormat, string> = {
    google_csv: 'Google Contacts CSV',
    mailru_csv: 'Mail.ru CSV',
    generic_csv: 'Обычный CSV',
    yandex_vcf: 'vCard',
    generic_vcf: 'vCard'
  };

  const contactFileEncodingLabels: Record<string, string> = {
    utf8: 'UTF-8',
    utf8_bom: 'UTF-8 BOM',
    utf16le: 'UTF-16LE',
    utf16be: 'UTF-16BE',
    windows1251: 'Windows-1251'
  };

  const getContactFileSourceFormatMessage = (sourceFormat: ContactFileSourceFormat | '', encoding = '') => {
    const encodingText = encoding ? ', кодировка ' + (contactFileEncodingLabels[encoding] || encoding) : '';
    if (sourceFormat === 'google_csv') return 'Файл распознан как Google Contacts CSV' + encodingText + '.';
    if (sourceFormat === 'mailru_csv') return 'Файл распознан как Mail.ru CSV' + encodingText + '.';
    if (sourceFormat === 'yandex_vcf' || sourceFormat === 'generic_vcf') return 'Файл распознан как vCard' + encodingText + '.';
    if (sourceFormat === 'generic_csv') return 'Файл распознан как обычный CSV' + encodingText + '.';
    return '';
  };

  const contactSyncDirectionLabels: Record<ContactSyncDirection, string> = {
    import_only: 'Импорт в PBXPuls',
    export_only: 'Выгрузка во внешний сервис',
    two_way: 'Двухсторонняя синхронизация'
  };

  const getContactSyncAccount = (provider: OnlineContactSyncProvider): ContactSyncProviderAccount => {
    return contactSyncAccounts.find(item => item.provider === provider) || {
      provider,
      status: 'disconnected',
      authType: provider === 'google' ? 'oauth' : 'carddav',
      carddavUrl: provider === 'yandex' ? 'https://carddav.yandex.ru' : provider === 'mailru' ? 'https://carddav.mail.ru' : null,
      syncDirection: 'import_only',
      conflictStrategy: 'manual_review',
      configured: provider === 'google' ? false : true
    };
  };

  const loadContactSyncAccounts = useCallback(async () => {
    if (!session?.token) return;
    try {
      const resp = await fetch('/api/directory/sync/accounts', {
        headers: { 'Authorization': 'Bearer ' + session.token }
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      const data = await resp.json();
      if (resp.ok) {
        setContactSyncAccounts(Array.isArray(data.providers) ? data.providers : []);
      } else {
        setContactSyncMessage(data.error || 'Ошибка загрузки подключений синхронизации.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка связи при загрузке синхронизации.');
    }
  }, [session?.token]);

  useEffect(() => {
    if (directoryPageMode === 'personal_import' && canOpenPersonalContactImport()) {
      loadContactSyncAccounts();
    }
  }, [directoryPageMode, loadContactSyncAccounts, settings?.directoryImportEnabled]);

  const handleContactSyncSettingsChange = async (provider: OnlineContactSyncProvider, syncDirection: ContactSyncDirection) => {
    const account = getContactSyncAccount(provider);
    setContactSyncBusyProvider(provider);
    setContactSyncMessage('');
    try {
      const resp = await fetch('/api/directory/sync/' + provider + '/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session?.token
        },
        body: JSON.stringify({
          syncDirection,
          conflictStrategy: account.conflictStrategy || 'manual_review'
        })
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      const data = await resp.json();
      if (resp.ok && data.provider) {
        setContactSyncAccounts(prev => {
          const next = prev.filter(item => item.provider !== provider);
          return [...next, data.provider];
        });
        setContactSyncMessage('Режим синхронизации ' + contactSyncProviderLabels[provider] + ' сохранен: ' + contactSyncDirectionLabels[syncDirection] + '.');
      } else {
        setContactSyncMessage(data.error || 'Не удалось сохранить настройки синхронизации.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка сохранения настроек синхронизации.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const handleGoogleContactsConnect = async () => {
    if (!guardContactImportSource('google')) return;
    setContactSyncBusyProvider('google');
    setContactSyncMessage('');
    try {
      const resp = await fetch('/api/directory/sync/google/connect', {
        headers: { 'Authorization': 'Bearer ' + session?.token }
      });
      const data = await resp.json();
      if (resp.ok && data.url) {
        window.location.href = data.url;
      } else {
        setContactSyncMessage(data.error || 'Google Contacts не настроен администратором.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка подключения Google Contacts.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const handleCardDavConnect = async (provider: 'yandex' | 'mailru') => {
    if (!guardContactImportSource(provider)) return;
    const form = cardDavForms[provider];
    setContactSyncBusyProvider(provider);
    setContactSyncMessage('');
    try {
      const resp = await fetch('/api/directory/sync/' + provider + '/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session?.token
        },
        body: JSON.stringify(form)
      });
      const data = await resp.json();
      if (resp.ok) {
        setCardDavForms(prev => ({ ...prev, [provider]: { ...prev[provider], appPassword: '' } }));
        setContactSyncMessage(contactSyncProviderLabels[provider] + ' подключен.');
        await loadContactSyncAccounts();
      } else {
        setContactSyncMessage(data.error || 'Ошибка подключения ' + contactSyncProviderLabels[provider] + '.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка подключения ' + contactSyncProviderLabels[provider] + '.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const handlePreviewContactSyncImport = async (provider: ContactSyncProvider) => {
    if (!guardContactImportSource(provider)) return;
    setContactSyncBusyProvider(provider);
    setContactSyncMessage('');
    try {
      const resp = await fetch('/api/directory/sync/' + provider + '/preview-import', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session?.token }
      });
      const data = await resp.json();
      if (resp.ok) {
        const items = Array.isArray(data.items) ? data.items : [];
        const invalid = items.filter((item: any) => item.status === 'invalid').length;
        const duplicates = items.filter((item: any) => item.status === 'possible_duplicate').length;
        setContactSyncPreviewItems(prev => ({ ...prev, [provider]: items }));
        setContactSyncSelectedIds(prev => ({ ...prev, [provider]: items.filter((item: any) => item.status === 'new').map((item: any) => String(item.externalContactId || '')).filter(Boolean) }));
        setContactSyncMessage('Предпросмотр ' + contactSyncProviderLabels[provider] + ': ' + (data.totalPreviewed || 0) + ' контактов, дублей: ' + duplicates + ', ошибок: ' + invalid + '.');
      } else {
        setContactSyncPreviewItems(prev => ({ ...prev, [provider]: [] }));
        setContactSyncSelectedIds(prev => ({ ...prev, [provider]: [] }));
        setContactSyncMessage(data.error || 'Предпросмотр ' + contactSyncProviderLabels[provider] + ' недоступен.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка предпросмотра ' + contactSyncProviderLabels[provider] + '.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const getContactFileContentType = (file: File): string => {
    const lowerName = file.name.toLowerCase();
    if (file.type) return file.type;
    if (lowerName.endsWith('.vcf')) return 'text/vcard';
    return 'text/csv';
  };

  const handlePreviewContactFileImport = async (file: File) => {
    if (!guardContactImportSource('file')) return;
    setContactSyncBusyProvider('file');
    setContactSyncMessage('');
    setContactFileName(file.name);
    setContactFileSourceFormat('');
    setContactFileEncoding('');
    setContactFilePreviewSummary(null);
    try {
      const content = await file.arrayBuffer();
      const resp = await fetch('/api/directory/sync/file/preview-import?fileName=' + encodeURIComponent(file.name), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Original-Content-Type': getContactFileContentType(file),
          'Authorization': 'Bearer ' + session?.token
        },
        body: content
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      const data = await resp.json();
      if (resp.ok) {
        const items = Array.isArray(data.items) ? data.items : [];
        const ready = items.filter((item: any) => item.status === 'new').length;
        const invalid = items.filter((item: any) => item.status === 'invalid').length;
        const duplicates = items.filter((item: any) => item.status === 'possible_duplicate').length;
        setContactSyncPreviewItems(prev => ({ ...prev, file: items }));
        setContactSyncSelectedIds(prev => ({ ...prev, file: items.filter((item: any) => item.status === 'new').map((item: any) => String(item.externalContactId || '')).filter(Boolean) }));
        const summary = {
          totalRows: Number(data.totalRows ?? items.length),
          totalPreviewed: Number(data.totalPreviewed ?? items.length),
          readyToImport: Number(data.readyToImport ?? ready),
          invalid: Number(data.invalid ?? invalid),
          duplicates: Number(data.duplicates ?? duplicates),
          sourceFormat: (data.sourceFormat || '') as ContactFileSourceFormat | '',
          encoding: String(data.encoding || '')
        };
        setContactFileSourceFormat(summary.sourceFormat);
        setContactFileEncoding(summary.encoding);
        setContactFilePreviewSummary(summary);
        const sourceFormatMessage = getContactFileSourceFormatMessage(summary.sourceFormat, summary.encoding);
        const invalidMessage = summary.invalid > 0 ? ' Контакты без ФИО или телефона не будут импортированы.' : '';
        setContactSyncMessage((sourceFormatMessage ? sourceFormatMessage + ' ' : '') + 'Предпросмотр: ' + summary.totalPreviewed + ' контактов, готово к импорту: ' + summary.readyToImport + ', ошибок: ' + summary.invalid + ', дублей: ' + summary.duplicates + '.' + invalidMessage);
      } else {
        setContactSyncPreviewItems(prev => ({ ...prev, file: [] }));
        setContactSyncSelectedIds(prev => ({ ...prev, file: [] }));
        setContactFileSourceFormat('');
        setContactFileEncoding('');
        setContactFilePreviewSummary(null);
        setContactSyncMessage(data.error || 'Не удалось разобрать CSV/vCard файл.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка предпросмотра CSV/vCard файла.');
    } finally {
      if (contactFileInputRef.current) contactFileInputRef.current.value = '';
      setContactSyncBusyProvider(null);
    }
  };

  const handleContactFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handlePreviewContactFileImport(file);
  };

  const handleDiagnoseContactSync = async (provider: OnlineContactSyncProvider) => {
    if (!guardContactImportSource(provider)) return;
    setContactSyncBusyProvider(provider);
    setContactSyncMessage('');
    try {
      const resp = await fetch('/api/directory/sync/' + provider + '/diagnose', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session?.token }
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.steps)) {
        setContactSyncDiagnostics(prev => ({ ...prev, [provider]: data }));
        const failed = data.steps.find((step: ContactSyncDiagnosticStep) => step.status === 'error') || data.steps.find((step: ContactSyncDiagnosticStep) => step.status === 'warning');
        const friendlyMessage = data.ok
          ? 'Диагностика ' + contactSyncProviderLabels[provider] + ': подключение работает.'
          : provider === 'google'
            ? 'Диагностика Google Contacts: проверьте настройки Google OAuth или повторите подключение.'
            : (failed?.message || '').includes('не принял логин или пароль')
              ? 'Диагностика ' + contactSyncProviderLabels[provider] + ': сервис не принял логин или пароль приложения. Используйте импорт из файла или проверьте пароль приложения.'
              : 'Диагностика ' + contactSyncProviderLabels[provider] + ': используйте импорт из файла или проверьте параметры расширенного подключения.';
        setContactSyncMessage(friendlyMessage);
      } else {
        setContactSyncDiagnostics(prev => ({
          ...prev,
          [provider]: { provider, ok: false, steps: [{ key: 'diagnose', label: 'Диагностика', status: 'error', message: data.message || data.error || 'Диагностика недоступна' }] }
        }));
        setContactSyncMessage(data.message || data.error || 'Диагностика ' + contactSyncProviderLabels[provider] + ' недоступна.');
      }
    } catch (e: any) {
      setContactSyncDiagnostics(prev => ({
        ...prev,
        [provider]: { provider, ok: false, steps: [{ key: 'diagnose', label: 'Диагностика', status: 'error', message: e.message || 'Ошибка диагностики' }] }
      }));
      setContactSyncMessage(e.message || 'Ошибка диагностики ' + contactSyncProviderLabels[provider] + '.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const canSelectContactSyncItem = (provider: ContactSyncProvider, item: ContactSyncPreviewItem) => {
    if (item.status === 'new') return true;
    if (item.status === 'possible_duplicate') return contactSyncForceDuplicates[provider] === true;
    return false;
  };

  const handleSelectNewContactSyncItems = (provider: ContactSyncProvider) => {
    const ids = (contactSyncPreviewItems[provider] || [])
      .filter(item => item.status === 'new')
      .map(item => String(item.externalContactId || ''))
      .filter(Boolean);
    setContactSyncSelectedIds(prev => ({ ...prev, [provider]: ids }));
  };

  const handleClearContactSyncSelection = (provider: ContactSyncProvider) => {
    setContactSyncSelectedIds(prev => ({ ...prev, [provider]: [] }));
  };

  const handleToggleContactSyncItem = (provider: ContactSyncProvider, item: ContactSyncPreviewItem, checked: boolean) => {
    if (!canSelectContactSyncItem(provider, item)) return;
    const id = String(item.externalContactId || '');
    if (!id) return;
    setContactSyncSelectedIds(prev => {
      const current = prev[provider] || [];
      const next = checked ? Array.from(new Set([...current, id])) : current.filter(value => value !== id);
      return { ...prev, [provider]: next };
    });
  };

  const handleImportSelectedContactSyncItems = async (provider: ContactSyncProvider) => {
    if (!guardContactImportSource(provider)) return;
    const selected = new Set(contactSyncSelectedIds[provider] || []);
    const items = (contactSyncPreviewItems[provider] || []).filter(item => selected.has(String(item.externalContactId || '')) && canSelectContactSyncItem(provider, item));
    if (!items.length) {
      setContactSyncMessage('Выберите контакты для импорта.');
      return;
    }
    setContactSyncBusyProvider(provider);
    setContactSyncMessage('');
    try {
      const resp = await fetch('/api/directory/sync/' + provider + '/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session?.token
        },
        body: JSON.stringify({ items, force: contactSyncForceDuplicates[provider] === true })
      });
      const data = await resp.json();
      if (resp.ok) {
        setContactSyncMessage('Импортировано: ' + (data.imported || 0) + ', пропущено: ' + (data.skipped || 0) + ', ошибок: ' + (data.failed || 0) + '.');
        setContactSyncSelectedIds(prev => ({ ...prev, [provider]: [] }));
        setDirPage(1);
        await loadDirectory(1);
        await loadDirectoryLookup();
      } else {
        setContactSyncMessage(data.error || 'Ошибка импорта ' + contactSyncProviderLabels[provider] + '.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка импорта ' + contactSyncProviderLabels[provider] + '.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const handleDisconnectContactSync = async (provider: OnlineContactSyncProvider) => {
    setContactSyncBusyProvider(provider);
    setContactSyncMessage('');
    try {
      const previewResp = await fetch('/api/directory/sync/' + provider + '/disconnect-preview', {
        headers: { 'Authorization': 'Bearer ' + session?.token }
      });
      const preview = await previewResp.json();
      if (!previewResp.ok) {
        setContactSyncMessage(preview.error || 'Не удалось получить предпросмотр отключения.');
        return;
      }
      const contactsToDelete = Number(preview.contactsToDelete || 0);
      const intro = contactsToDelete > 0
        ? 'Отключение ' + contactSyncProviderLabels[provider] + ' удалит личные контакты, которые были импортированы из ' + contactSyncProviderLabels[provider] + '. Контакты, созданные вручную, общие контакты и контакты из других источников не будут удалены.\n\nБудет удалено: ' + contactsToDelete + ' контактов.'
        : 'Импортированных из этого сервиса контактов не найдено. Будет отключено только подключение ' + contactSyncProviderLabels[provider] + '.';
      if (!window.confirm(intro)) return;
      const resp = await fetch('/api/directory/sync/' + provider + '/disconnect?confirm=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session?.token
        },
        body: JSON.stringify({ confirm: true })
      });
      const data = await resp.json();
      if (resp.ok) {
        setContactSyncMessage(contactSyncProviderLabels[provider] + ' отключен. Удалено контактов: ' + (data.deletedContacts || 0) + '.');
        await loadContactSyncAccounts();
        setDirPage(1);
        await loadDirectory(1);
        await loadDirectoryLookup();
      } else {
        setContactSyncMessage(data.error || 'Ошибка отключения ' + contactSyncProviderLabels[provider] + '.');
      }
    } catch (e: any) {
      setContactSyncMessage(e.message || 'Ошибка отключения ' + contactSyncProviderLabels[provider] + '.');
    } finally {
      setContactSyncBusyProvider(null);
    }
  };

  const handleExecuteImport = async () => {
    if (!hasPermission('manage_directory_import')) {
      alert('Нет прав на импорт справочника.');
      return;
    }

    if (parsedImportEntries.length === 0) return;
    const invalidRows = parsedImportEntries.filter((entry: any) => Array.isArray(entry._importErrors) && entry._importErrors.length > 0);
    if (invalidRows.length) {
      setImportFileError('Исправьте телефоны перед импортом. Строк с ошибками: ' + invalidRows.length + '.');
      return;
    }
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
        setImportPreviewRows([]);
        setImportDuplicateCount(0);
        setDirPage(1);
        await loadDirectory(1);
        await loadDirectoryLookup();
        loadCalls(page);
        setTimeout(() => {
          setImportSuccessCount(null);
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
  const [isLiveTransferLoading, setIsLiveTransferLoading] = useState(false);
  const [isLiveMonitorLoading, setIsLiveMonitorLoading] = useState(false);
  const [liveTransferStatus, setLiveTransferStatus] = useState('');
  const [liveCallBannerPos, setLiveCallBannerPos] = useState(() => {
    try {
      const saved = localStorage.getItem('pbxpuls_live_call_banner_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return parsed;
        }
      }
    } catch {}
    return { x: 16, y: 74 };
  });
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

  const handleCopy = async (num: string, copiedKey?: string) => {
    const value = num.trim();
    if (!value) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedNumber(copiedKey || value);
      setTimeout(() => {
        setCopiedNumber(null);
      }, 1500);
    } catch (error) {
      console.warn('Clipboard copy failed:', error);
      setCopiedNumber(null);
    }
  };

  const triggerClickToCall = async (targetPhone: string, targetName?: string) => {
    if (!hasPermission('make_calls')) {
      alert('Нет прав на совершение звонков.');
      return;
    }

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
    
    const forceOwnCallsByPermission = session?.permissions?.own_calls_only === true;
  const fromExt = (session?.role === 'operator' || forceOwnCallsByPermission) ? (session.extension || myExt) : myExt;
    setCallingTarget(targetName ? `${targetName} (${cleaned})` : cleaned);
    if (session?.role !== 'operator') {
      setCallingLog([
        `[Система] Формирование вызова...`,
        `[Система] Источник звонка (Ваш Ext): ${fromExt}`,
        `[Система] Назначение связи: ${cleaned}`,
        `[Система] Отправка запроса на Asterisk AMI сервер...`
      ]);
      if (session?.permissions?.show_call_modal === true) setIsCallingModalOpen(true);
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
          fromExtension: ((session?.role === 'operator' || session?.permissions?.own_calls_only === true) ? (session.extension || myExt) : myExt).trim(),
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
        headers: { 'Authorization': `Bearer ${session.token}` },
        cache: 'no-store'
      });
      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }
      if (!resp.ok) return;
      const data = await resp.json();
      setLiveCallBanner(normalizeLiveCallBannerPayload(data));
    } catch (e) {
      // Live popup is auxiliary; ignore network errors here.
    }
  };

  const handleLiveCallTransfer = async (target: LiveTransferSearchTarget): Promise<LiveTransferResult> => {
    if (!session || !liveCallBanner?.active || isLiveTransferLoading) {
      return { success: false, error: 'Активный звонок уже завершён или перевод выполняется' };
    }
    const rawTarget = String(target.targetNumber || '').trim();
    const cleanedTarget = rawTarget.replace(/\D/g, '');
    const validInternalTarget = target.targetType === 'internal' && /^\d{2,5}$/.test(rawTarget);
    const validDirectoryPhoneTarget = target.targetType === 'directory_phone'
      && /^\d{6,15}$/.test(rawTarget)
      && target.source !== 'manual';
    if (!target.canTransfer || cleanedTarget !== rawTarget || (!validInternalTarget && !validDirectoryPhoneTarget)) {
      return { success: false, error: target.transferDisabledReason || 'Выберите допустимый номер переадресации' };
    }

    setIsLiveTransferLoading(true);
    setLiveTransferStatus(`Переводим на ${target.targetType === 'internal' ? 'внутренний ' : 'номер справочника '}${cleanedTarget}...`);

    try {
      const resp = await fetch('/api/live/call-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({
          operatorExt: (liveCallBanner.operatorExt || myExt || '').trim(),
          targetId: target.id,
          targetType: target.targetType,
          targetNumber: cleanedTarget,
          targetExtension: target.targetType === 'internal' ? cleanedTarget : undefined
        })
      });

      if (resp.status === 401) {
        handleAuthError(resp);
        return { success: false, error: 'Сессия истекла' };
      }

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        const targetLabel = String(data.targetLabel || target.name || '').trim();
        setLiveTransferStatus(`Переадресовано на ${cleanedTarget}${targetLabel ? ` ${targetLabel}` : ''}`);
        setTimeout(() => setLiveTransferStatus(''), 4000);
        loadLiveCallBanner();
        return { success: true, targetLabel };
      }

      const error = data.error || 'Не удалось выполнить переадресацию';
      setLiveTransferStatus(error);
      return { success: false, error };
    } catch (_error) {
      setLiveTransferStatus('Ошибка сети при переводе звонка');
      return { success: false, error: 'Ошибка сети при переводе звонка' };
    } finally {
      setIsLiveTransferLoading(false);
    }
  };

  const handleLiveCallMonitor = async (mode: 'listen' | 'whisper') => {
    if (!session || !liveCallBanner?.active || isLiveMonitorLoading) return;
    const supervisorExt = ((session.role === 'operator' || session.permissions?.own_calls_only === true) ? (session.extension || myExt) : myExt).trim();
    if (!supervisorExt) {
      setLiveTransferStatus('Укажите ваш внутренний номер');
      return;
    }

    setIsLiveMonitorLoading(true);
    setLiveTransferStatus(mode === 'whisper' ? `Суфлёр: звонок на ${supervisorExt}...` : `Прослушивание: звонок на ${supervisorExt}...`);

    try {
      const resp = await fetch('/api/live/call-monitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({
          mode,
          operatorExt: (liveCallBanner.operatorExt || myExt || '').trim(),
          supervisorExt
        })
      });

      if (resp.status === 401) {
        handleAuthError(resp);
        return;
      }

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        setLiveTransferStatus(mode === 'whisper' ? 'Ответьте на SIP: режим суфлёра' : 'Ответьте на SIP: режим прослушивания');
        setTimeout(() => setLiveTransferStatus(''), 5000);
        return;
      }

      setLiveTransferStatus(data.error || 'Не удалось подключиться к звонку');
    } catch (_error) {
      setLiveTransferStatus('Ошибка сети при подключении к звонку');
    } finally {
      setIsLiveMonitorLoading(false);
    }
  };

  const loadDirectory = async (targetPage = dirPage) => {
    if (!session) return;
    const requestedPage = Math.max(1, Number(targetPage || 1));
    setIsLoadingDirectory(true);
    setDirListError('');
    try {
      const data = await fetchDirectory(session.token, {
        q: dirSearchQuery,
        type: dirTypeFilter,
        spamMode: dirSpamMode,
        visibilityMode: dirVisibilityMode,
        page: requestedPage,
        pageSize: dirPageSize
      });
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      setDirectory(items);
      setDirTotal(Number(data?.total ?? items.length) || 0);
      setDirPage(Number(data?.page ?? requestedPage) || requestedPage);
      setDirTotalPages(Math.max(1, Number(data?.totalPages ?? 1) || 1));
    } catch (e: any) {
      console.error('Error loading directory:', e);
      setDirectory([]);
      setDirTotal(0);
      setDirTotalPages(1);
      setDirListError(e?.message === 'UNAUTHORIZED' ? '' : 'Не удалось загрузить справочник.');
      if (e && (e.message === 'UNAUTHORIZED' || e.message === 'Failed to fetch')) {
        handleAuthError();
      }
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  const loadDirectoryLookup = async () => {
    if (!session) return;
    try {
      const data = await fetchDirectoryAll(session.token, { spamMode: 'all', visibilityMode: 'all' });
      setDirectoryLookup(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e && (e.message === 'UNAUTHORIZED' || e.message === 'Failed to fetch')) {
        handleAuthError();
      }
    }
  };

  const handleSaveDirEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const phones = [
      dirNumber,
      ...dirPhonesText.split(/[;,\n]+/)
    ].map(v => v.trim()).filter(Boolean);
    const uniquePhones = Array.from(new Set(phones));
    const phoneValidationErrors = getDirectoryPhoneValidationErrors([...uniquePhones, dirLinkedExternalNumber]);
    if (phoneValidationErrors.length) {
      setDirError(directoryPhoneValidationMessage);
      return;
    }

    if (!(dirName.trim() || dirCompany.trim()) || (uniquePhones.length === 0 && !dirEmail.trim())) {
      setDirError('Укажите ФИО или организацию и хотя бы один способ связи: телефон или email.');
      return;
    }
    setDirError('');
    setIsSavingDir(true);

    try {
      const payload = {
        name: dirName,
        number: uniquePhones[0] || '',
        phones: uniquePhones,
        type: dirType,
        visibility: dirVisibility,
        company: dirCompany,
        position: dirPosition,
        department: dirDepartment.trim(),
        group: dirGroup.trim(),
        email: dirEmail,
        website: dirWebsite,
        inn: dirInn.trim(),
        kpp: dirKpp.trim(),
        ogrn: dirOgrn.trim(),
        address: dirAddress.trim(),
        internalExtension: dirInternalExtension.trim(),
        linkedExternalNumber: dirLinkedExternalNumber.trim(),
        responsibleUserId: dirResponsibleUserId.trim(),
        tags: dirTagsText.split(/[;,|]+/).map(t => t.trim()).filter(Boolean),
        isSpam: dirIsSpam,
        isBlacklisted: dirIsBlacklisted,
        comment: dirComment
      };

      const data = await saveDirectoryEntry(session?.token || '', payload, editingDirEntry?.id);
      if (data?.error === 'UNAUTHORIZED') {
        handleAuthError();
        return;
      }

      if (data?.success) {
        setDirPage(1);
        await loadDirectory(1);
        await loadDirectoryLookup();
        loadCalls(page);
        const notice = editingDirEntry ? 'Контакт обновлен.' : 'Контакт создан.';
        resetDirFormFields();
        setDirectoryContactEditId(null);
        setDirectoryPageMode('list');
        setActiveView('directory');
        setDirNotice(notice);
        window.history.pushState({}, '', '/');
      } else {
        setDirError(data.error || 'Ошибка при сохранении записи.');
      }
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        handleAuthError();
        return;
      }
      setDirError('Не удалось соединиться с сервером.');
    } finally {
      setIsSavingDir(false);
    }
  };

  const handleDeleteDirEntry = async (id: string) => {
    if (!hasPermission('edit_directory')) {
      alert('Нет прав на удаление записей справочника.');
      return;
    }

    if (!window.confirm('Вы действительно хотите удалить эту запись из справочника?')) {
      return;
    }
    try {
      if (!session?.token) return;
      await deleteDirectoryEntry(session.token, id);
      await loadDirectory(dirPage);
      await loadDirectoryLookup();
      loadCalls(page);
    } catch (e) {
      console.error(e);
      alert('Ошибка при соединении с сервером.');
    }
  };

  const openDirectoryImportPage = () => {
    setDirectoryPageMode('import');
    setActiveView('directory');
    window.history.pushState({}, '', '/management/directory/import');
  };

  const openPersonalContactImportPage = () => {
    setDirectoryPageMode('personal_import');
    setDirectoryContactEditId(null);
    setActiveView('directory');
    if (canOpenPersonalContactImport()) loadContactSyncAccounts();
    window.history.pushState({}, '', '/directory/import-contacts');
  };

  const closeDirectoryImportPage = () => {
    setDirectoryPageMode('list');
    setDirectoryContactEditId(null);
    window.history.pushState({}, '', '/');
  };

  const closeDirectoryContactFormPage = () => {
    resetDirFormFields();
    setDirectoryContactEditId(null);
    setDirectoryPageMode('list');
    setActiveView('directory');
    window.history.pushState({}, '', '/');
  };

  const handlePreviewImport = async () => {
    if (!session?.token || parsedImportEntries.length === 0) return;
    setIsImporting(true);
    setImportFileError('');
    try {
      const data = await previewDirectoryImport(session.token, parsedImportEntries);
      setImportPreviewRows(Array.isArray(data.rows) ? data.rows : []);
      setImportDuplicateCount(Number(data.duplicateCount || 0));
    } catch (e: any) {
      if (e?.message === 'UNAUTHORIZED') {
        handleAuthError();
        return;
      }
      setImportFileError(e.message || 'Не удалось выполнить предпросмотр импорта.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleSpam = async (entry: DirectoryEntry, enabled: boolean) => {
    if (!session) return;
    if (!hasPermission('edit_directory')) {
      alert('Нет прав на изменение справочника.');
      return;
    }
    try {
      await toggleDirectorySpam(session.token, entry.id, enabled);
      await loadDirectory(dirPage);
      await loadDirectoryLookup();
    } catch (e: any) {
      if (e?.message === 'UNAUTHORIZED') {
        handleAuthError();
        return;
      }
      alert(e.message || 'Ошибка при изменении признака спама.');
    }
  };

  const handleToggleBlacklist = async (entry: DirectoryEntry, enabled: boolean, syncAsterisk = true) => {
    if (!session) return;

    if (!hasPermission('manage_blacklist')) {
      alert('Нет прав на управление черным списком.');
      return;
    }

    try {
      await toggleDirectoryBlacklist(session.token, entry.id, enabled, syncAsterisk);
      await loadDirectory(dirPage);
      await loadDirectoryLookup();
      alert(enabled ? 'Контакт добавлен в черный список.' : 'Контакт удален из черного списка.');
    } catch (e: any) {
      alert(e.message || 'Ошибка связи с сервером.');
    }
  };

  const populateDirectoryContactForm = (entry: DirectoryEntry) => {
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
    setDirInn(entry.inn || '');
    setDirKpp(entry.kpp || '');
    setDirOgrn(entry.ogrn || '');
    setDirAddress(entry.address || '');
    setDirGroup(entry.group || '');
    setDirInternalExtension(entry.internalExtension || '');
    setDirLinkedExternalNumber(entry.linkedExternalNumber || '');
    setDirResponsibleUserId(entry.responsibleUserId || '');
    setDirTagsText(getDirectoryEntryTags(entry).join('; '));
    setDirIsSpam(!!entry.isSpam);
    setDirIsBlacklisted(!!entry.isBlacklisted);
    setDirType(entry.type);
    setDirVisibility(entry.visibility === 'private' ? 'private' : 'shared');
    setDirComment(entry.comment || '');
    setDirError('');
    setDirFormShowAllFields(false);
  };

  const openEditDirEntry = (entry: DirectoryEntry) => {
    populateDirectoryContactForm(entry);
    setDirectoryContactEditId(entry.id);
    setDirectoryPageMode('contact_edit');
    setActiveView('directory');
    window.history.pushState({}, '', '/management/directory/contact/' + encodeURIComponent(entry.id) + '/edit');
  };

  const openCreateDirEntry = () => {
    resetDirFormFields();
    setDirectoryContactEditId(null);
    setDirectoryPageMode('contact_new');
    setActiveView('directory');
    window.history.pushState({}, '', '/management/directory/contact/new');
  };

  const openAddFromCall = (number: string, initialName?: string) => {
    resetDirFormFields();
    setDirName(initialName || '');
    setDirNumber(number);
    setDirType('client');
    setDirComment('Добавлен из реестра звонков');
    setDirectoryContactEditId(null);
    setDirectoryPageMode('contact_new');
    setActiveView('directory');
    window.history.pushState({}, '', '/management/directory/contact/new');
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
    } catch (e: any) {
      console.error('Error fetching dashboard statistics:', e);
      if (e && (e.message === 'UNAUTHORIZED' || e.message === 'Failed to fetch')) {
        handleAuthError();
      }
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
      if (e && (e.message === 'UNAUTHORIZED' || e.message === 'Failed to fetch')) {
        handleAuthError();
      }
    } finally {
      setIsLoadingCalls(false);
    }
  };

  // Trigger combined data reload
  const reloadData = (targetPage: number = page) => {
    loadCalls(targetPage);
    loadStats();
    loadDirectoryLookup();
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
        resetAuthExpiredHandled();
        setLoginError('');
        const nextSession: UserSession = {
          id: data.user.id,
          token: data.token,
          username: data.user.username,
          role: data.user.role,
          extension: data.user.extension || '',
          disabled: !!data.user.disabled,
          permissions: data.user.permissions || {}
        };
        localStorage.setItem('asterisk_cdr_session', JSON.stringify(nextSession));
        setSession(nextSession);
        setLoginPassword('');
        setLoginError('');
        return;
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
    clearStoredAuthSession();
    window.location.href = '/';
    return;
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

    if (!hasPermission('process_calls')) {
      alert('Нет ��рав на обработку звонков.');
      return;
    }

    await processCallSubmit({
      selectedCall,
      session,
      commentInput,
      isProcessedInput,
      handleAuthError,
      reloadData,
      setSelectedCall,
      setIsSavingProcess,
    });
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
        if (isAdminRole(session.role)) {
          await Promise.all([
            loadAccessUsers(),
            loadRoles()
          ]);
        }
      }
    } catch (e) {
      console.error('Error fetching system configurations:', e);
    }
  };

  const loadAccessUsers = async () => {
    if (!session || !isAdminRole(session.role)) return;
    setIsLoadingUsers(true);
    try {
      const data = await fetchAccessUsers(session.token);
      setAccessUsers(data);
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  
  const loadRoles = async () => {
    if (!session || !isAdminRole(session.role)) return;

    setIsLoadingRoles(true);

    try {
      const data = await fetchAccessRoles(session.token);
      setRoles(data);

    } catch (e) {
      console.error('Error loading roles:', e);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const saveRoles = async () => {
    if (!session || !isAdminRole(session.role)) return;

    setIsSavingRoles(true);

    try {
      const savedRoles = await saveAccessRoles(session.token, roles);
      setRoles(savedRoles);

      // Dynamically update the current user's active session permissions on save
      const myRole = savedRoles.find((r: any) => r.id === session.role);
      if (myRole) {
        const nextSession = {
          ...session,
          permissions: {
            ...(myRole.permissions || {}),
            ...(session.permissions || {})
          }
        };
        setSession(nextSession);
        localStorage.setItem('asterisk_cdr_session', JSON.stringify(nextSession));
      }
    } catch (e: any) {
      alert(e.message || 'Не удалось сохранить роли.');
    } finally {
      setIsSavingRoles(false);
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({ username: '', password: '', role: 'operator', extension: '', disabled: false, permissions: {} });
    setAccessError('');
  };

  const openEditUser = (user: AccessUser) => {
    setEditingUserId(user.id);
    setUserForm({ username: user.username, password: '', role: user.role as UserRole, extension: user.extension || '', disabled: !!user.disabled, permissions: user.permissions || {} });
    setAccessError('');
    setSettingsTab('access');
  };

  const saveAccessUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!session || !isAdminRole(session.role)) return;
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
      await saveAccessUserApi(session.token, userForm, editingUserId);
      await loadAccessUsers();
      resetUserForm();
    } catch (e: any) {
      setAccessError(e.message || 'Ошибка соединения с сервером.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const deleteAccessUser = async (user: AccessUser) => {
    if (!session || !isAdminRole(session.role)) return;
    if (!window.confirm(`Удалить пользователя ${user.username}?`)) return;
    try {
      await deleteAccessUserApi(session.token, user.id);
      await loadAccessUsers();
      if (editingUserId === user.id) resetUserForm();
    } catch (e: any) {
      alert(e.message || 'Ошибка соединения с сервером.');
    }
  };

  // Admin Settings Submitter
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    if (settingsTab === 'permissions') {
      await saveRoles();
      return;
    }

    if (!draftSettings || !session || !isAdminRole(session.role)) return;

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
        setPublicSettings({
          customLogoUrl: draftSettings.customLogoUrl,
          customCopyright: draftSettings.customCopyright
        });
        setDbTestResult({ success: true, message: 'Настройки успешно применены.' });
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
        setDemoStatusResult({ success: true, message: 'История звонков успешно удалена из памяти!' });
        loadCalls(1);
      } else {
        setDemoStatusResult({ success: false, message: 'Не удалось удалить данные.' });
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
        setDemoStatusResult({ success: true, message: 'История звонков успешно сгенерирована заново!' });
        loadCalls(1);
      } else {
        setDemoStatusResult({ success: false, message: 'Не удалось сгенерировать данные.' });
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

  const testFreePBXApiConnection = async () => {
    if (!draftSettings || !session) return;
    setIsTestingFreePBXApi(true);
    setFreePBXApiTestResult(null);
    try {
      const resp = await fetch('/api/settings/test-freepbx-api', {
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
        setFreePBXApiTestResult({
          success: true,
          message: data.message || 'Подключение к FreePBX API / Extensions успешно установлено!'
        });
      } else {
        setFreePBXApiTestResult({
          success: false,
          message: data.error || 'Не удалось подключиться к FreePBX API.'
        });
      }
    } catch (err: any) {
      setFreePBXApiTestResult({
        success: false,
        message: `Ошибка сокета: ${err.message || 'сервер недоступен'}`
      });
    } finally {
      setIsTestingFreePBXApi(false);
    }
  };

  // Launch Recording playback stream
  const playRecording = (call: CallEntry) => {
    if (!session || !call.recordingfile) return;

    if (!hasPermission('listen_recordings')) {
      setAudioError('Нет прав на прослушивание записей.');
      return;
    }

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
    const audioUrl = `/api/recordings/${encodeURIComponent(call.recordingfile)}?token=${encodeURIComponent(session?.token || '')}`;
    
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

  useEffect(() => {
    if (!session) {
      setConferenceBackendStatus(null);
      return;
    }
    const controller = new AbortController();
    fetch('/api/live-calls/conference/status', {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: 'no-store',
      signal: controller.signal
    }).then(async response => {
      if (response.status === 401) handleAuthError(response);
      const data = await response.json().catch(() => ({}));
      if (response.ok) setConferenceBackendStatus(data as ConferenceBackendStatus);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [session]);

  // Trigger main loads on mount or settings pivot
  useEffect(() => {
    if (session) {
      reloadData(1);
      loadDirectoryLookup();
      loadAdminSettings();
    }
  }, [session, startDate, endDate, startTime, endTime, statusFilter, isDemoModeActive, onlyMyCalls, myExt]);


  useEffect(() => {
    if (!session || activeView !== 'directory' || !['list', 'contact_edit'].includes(directoryPageMode)) return;
    const timer = window.setTimeout(() => {
      loadDirectory(dirPage);
    }, dirSearchQuery ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [session?.token, activeView, directoryPageMode, dirSearchQuery, dirTypeFilter, dirSpamMode, dirVisibilityMode, dirPage, dirPageSize]);

  useEffect(() => {
    if (directoryPageMode !== 'contact_edit' || !directoryContactEditId) return;
    if (editingDirEntry?.id === directoryContactEditId) return;
    const entry = directory.find(item => item.id === directoryContactEditId) || directoryLookup.find(item => item.id === directoryContactEditId);
    if (entry) populateDirectoryContactForm(entry);
  }, [directoryPageMode, directoryContactEditId, directory, directoryLookup, editingDirEntry?.id]);

  const getFirstAllowedActiveView = useCallback((): typeof activeView => {
    if (!session) return 'reports';

    if (hasPermission('view_calls')) return 'calls';
    if (hasPermission('view_directory')) return 'directory';
    if (hasPermission('view_reports')) return 'reports';
    if (hasPermission('view_marketing')) return 'marketing';
    if (hasPermission('view_monitoring')) return 'monitoring';
    if (hasPermission('view_management')) return 'management';
    if (hasPermission('view_balance')) return 'balance';
    if (hasPermission('view_scripts')) return 'scripts';
    if (hasPermission('view_ai_assistant')) return 'ai-assistant';
    if (hasPermission('view_ai_pbx_admin')) return 'ai-pbx-admin';
    if (hasPermission('view_settings') || hasPermission('manage_users') || hasPermission('manage_roles')) return 'settings';

    return 'reports';
  }, [session, settings]);

  const isActiveViewAllowed = useCallback((view: typeof activeView): boolean => {
    if (!session) return false;

    if (view === 'calls') return hasPermission('view_calls');
    if (view === 'directory') return hasPermission('view_directory');
    if (view === 'reports') return hasPermission('view_reports');
    if (view === 'marketing') return hasPermission('view_marketing');
    if (view === 'monitoring') return hasPermission('view_monitoring');
    if (view === 'management') return hasPermission('view_management');
    if (view === 'balance') return hasPermission('view_balance');
    if (view === 'scripts') return hasPermission('view_scripts');
    if (view === 'ai-assistant') return hasPermission('view_ai_assistant');
    if (view === 'ai-pbx-admin') return hasPermission('view_ai_pbx_admin');
    if (view === 'settings') return hasPermission('view_settings') || hasPermission('manage_users') || hasPermission('manage_roles');
    if (view === 'about') return true;

    return false;
  }, [session, settings]);

  useEffect(() => {
    if (!session) return;

    if (!isActiveViewAllowed(activeView)) {
      const nextView = getFirstAllowedActiveView();
      setActiveView(nextView);
      return;
    }

    if (activeView === 'settings' && !isAdminRole(session.role)) {
      if (hasPermission('manage_users')) {
        setSettingsTab('access');
      } else if (hasPermission('manage_roles')) {
        setSettingsTab('permissions');
      } else {
        setSettingsTab('appearance');
      }
    }
  }, [session, activeView, settings, isActiveViewAllowed, getFirstAllowedActiveView]);


  // Adjust active view based on permissions
  useEffect(() => {
    if (session) {
      if (activeView === 'calls' && !hasPermission('view_calls')) {
        if (hasPermission('view_directory')) {
          setActiveView('directory');
          loadDirectory(1);
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
        directory={directoryLookup.length ? directoryLookup : directory}
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
      const response = await fetch('/api/live-sessions', {
        headers: { Authorization: `Bearer ${session?.token || ''}` }
      });
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
      const res = await fetch('/api/diagnostics/tcpdump/status', {
        headers: { Authorization: `Bearer ${session?.token || ''}` }
      });
      const data = await res.json();
      setTcpdumpStatus(data);
    } catch {}
  };

  const loadTcpdumpFiles = async () => {
    try {
      const res = await fetch('/api/diagnostics/tcpdump/files', {
        headers: { Authorization: `Bearer ${session?.token || ''}` }
      });
      const data = await res.json();
      if (data.success) setTcpdumpFiles(data.files || []);
    } catch {}
  };

  const startTcpdump = async (mode: string) => {
    setTcpdumpMessage('Запускаю tcpdump...');
    try {
      const res = await fetch('/api/diagnostics/tcpdump/start?mode=' + encodeURIComponent(mode) + '&iface=any', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.token || ''}` }
      });
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
      const res = await fetch('/api/diagnostics/tcpdump/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.token || ''}` }
      });
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
      const res = await fetch('/api/diagnostics/tcpdump/output', {
        headers: { Authorization: `Bearer ${session?.token || ''}` }
      });
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
      monitorMode === 'cli' ? 'Командный центр' :
      monitorMode === 'db' ? 'DB Explorer' :
      monitorMode === 'devices' ? 'Карта IP / SIP устройств' :
      monitorMode === 'quality' ? 'Качество связи' :
      monitorMode === 'health' ? 'Состояние АТС' :
      monitorMode === 'ai-admin' ? 'AI-администратор АТС' :
      'Мониторинг';

    const monitoringSubtitle =
      monitorMode === 'calls' ? 'Источник: AMI → core show channels concise / verbose / queue show' :
      monitorMode === 'tcpdump' ? 'Захват и анализ сетевого трафика SIP/RTP через tcpdump' :
      monitorMode === 'sngrep' ? 'Анализ SIP-диалогов и событий сигнализации' :
      monitorMode === 'cli' ? 'Единое пространство диагностики, администрирования и справочной информации Asterisk & FreePBX' :
      monitorMode === 'db' ? 'Просмотр CDR/CEL и таблиц FreePBX/Asterisk' :
      monitorMode === 'devices' ? 'Карта регистраций SIP/PJSIP, IP-адресов и конфликтующих устройств' :
      monitorMode === 'quality' ? 'Интегрированная IP/RTP-телеметрия качества связи Asterisk,\nдиагностика джиттера, RTT, потерь пакетов и MOS' :
      monitorMode === 'ai-admin' ? 'AI-консультант администратора для диагностики Asterisk и FreePBX, анализа логов и подготовки команд' :
      monitorMode === 'health' ? 'Health Report сервера FreePBX/Asterisk: железо, диски, сеть, интернет, службы и общее состояние АТС' :
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
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs p-3">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
<div className="mb-3 flex flex-wrap gap-2">
              {hasPermission('view_active_calls') && (
              <button
                onClick={() => setMonitorMode('calls')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'calls'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Активные звонки
              </button>
              )}

              {hasPermission('view_tcpdump') && (
              <button
                onClick={() => setMonitorMode('tcpdump')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'tcpdump'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                TCPDUMP / SIP-RTP
              </button>
              )}

              {hasPermission('view_sngrep') && (
              <button
                onClick={() => setMonitorMode('sngrep')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'sngrep'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                SNGREP
              </button>
              )}

              {hasPermission('view_cli') && (
              <button
                onClick={() => setMonitorMode('cli')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'cli'
                  ? 'bg-slate-900 dark:bg-slate-700 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Командный центр
              </button>
              )}

              {hasPermission('view_cli') && (
              <button
                onClick={() => setMonitorMode('db')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'db'
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                DB Explorer
              </button>
              )}

              {hasPermission('view_sip_devices_map') && (
              <button
                onClick={() => setMonitorMode('devices')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'devices'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Карта IP / SIP устройств
              </button>
              )}

              {hasPermission('view_active_calls') && (
              <button
                onClick={() => setMonitorMode('quality')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'quality'
                  ? 'bg-[#ffe4e6] text-[#9f1239] border-[#fecdd3] dark:bg-rose-950/40 dark:text-rose-400'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Качество связи
              </button>
              )}

              {hasPermission('view_cli') && (
              <button
                onClick={() => setMonitorMode('health')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'health'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                Состояние АТС
              </button>
              )}

              {hasPermission('view_ai_pbx_admin') && (
              <button
                onClick={() => setMonitorMode('ai-admin' as any)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${monitorMode === 'ai-admin'
                  ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300'
                  : 'bg-white text-slate-600 border-slate-200'}`}
              >
                AI-администратор АТС
              </button>
              )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-black text-slate-900 dark:text-white text-left xl:text-right">
                {monitoringTitle}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-left xl:text-right whitespace-pre-line">
                {monitoringSubtitle}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl shadow-xs overflow-hidden">


          {monitorMode === 'tcpdump' && hasPermission('view_tcpdump') && (
            <TcpdumpTab token={session?.token || ''} onNavigate={setMonitorMode} liveSessionsData={liveSessionsData} />
          )}

          {monitorMode === 'sngrep' && hasPermission('view_sngrep') && (
            <SngrepTab
              tcpdumpOutput={tcpdumpOutput}
              loadTcpdumpOutput={loadTcpdumpOutput}
              token={session?.token || ''}
              onNavigate={setMonitorMode}
              darkMode={darkMode}
            />
          )}

          {monitorMode === 'cli' && hasPermission('view_cli') && (
            <CommandCenterTab token={session?.token || ''} onNavigate={setMonitorMode} />
          )}

          {monitorMode === 'db' && hasPermission('view_cli') && (
            <Suspense fallback={<div className="p-8 text-center text-slate-500 font-bold bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">Загрузка базы данных...</div>}>
              <DbExplorerTab token={session?.token || ''} />
            </Suspense>
          )}

          {monitorMode === 'quality' && hasPermission('view_active_calls') && (
            <QualityTab token={session?.token || ''} />
          )}

          {monitorMode === 'health' && hasPermission('view_cli') && (
            <HealthReportTab token={session?.token || ''} />
          )}

          {monitorMode === 'ai-admin' && hasPermission('view_ai_pbx_admin') && (
            <AIPBXAdminTab session={session} hasPermission={hasPermission} />
          )}

          {monitorMode === 'devices' && hasPermission('view_sip_devices_map') && (
            <DevicesMapTab token={session?.token || ''} />
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
            <div className="p-4 text-sm font-bold text-blue-600 bg-blue-50 border-b border-blue-100">
              {liveSessionsError}
            </div>
          )}

          {monitorMode === 'calls' && hasPermission('view_active_calls') && (
            <ActiveCallsTab
              liveSessionsData={liveSessionsData}
              liveSearch={liveSearch}
              setLiveSearch={setLiveSearch}
            />
          )}

        </div>
      </section>
    );
  };


  const effectiveDirectoryColumnConfigs: DirectoryColumnConfig[] = [
    ...selectedDirectoryVisibleColumns
      .map(columnKey => directoryColumnConfigs.find(column => column.key === columnKey))
      .filter((column): column is DirectoryColumnConfig => Boolean(column)),
    ...systemDirectoryColumnConfigs
  ];

  const draftDirectoryOrderConfigs: DirectoryColumnConfig[] = draftDirectoryVisibleColumns
    .map(columnKey => directoryColumnConfigs.find(column => column.key === columnKey))
    .filter((column): column is DirectoryColumnConfig => Boolean(column));

  const formatDirectoryCellText = (value: unknown): string => {
    const text = String(value ?? '').trim();
    return text || '—';
  };

  const getDirectoryTypeLabel = (entry: DirectoryEntry): string => {
    if (entry.type === 'internal') return 'Внутренний';
    if (entry.type === 'supplier') return 'Поставщик';
    if (entry.type === 'government') return 'Госорган';
    return 'Клиент';
  };

  const toggleDraftDirectoryColumn = (columnKey: DirectoryOptionalColumnKey) => {
    setDraftDirectoryVisibleColumns(prev => prev.includes(columnKey)
      ? prev.filter(key => key !== columnKey)
      : [...prev, columnKey]
    );
  };

  const moveDraftDirectoryColumn = (columnKey: DirectoryVisibleColumnKey, direction: -1 | 1) => {
    setDraftDirectoryVisibleColumns(prev => {
      const index = prev.indexOf(columnKey);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const moveDraftDirectoryColumnTo = (columnKey: DirectoryVisibleColumnKey, targetKey: DirectoryVisibleColumnKey) => {
    if (columnKey === targetKey) return;
    setDraftDirectoryVisibleColumns(prev => {
      const fromIndex = prev.indexOf(columnKey);
      const toIndex = prev.indexOf(targetKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const loadDirectoryColumnSettingsFromApi = async () => {
    if (!session?.token) return;
    try {
      const response = await fetchDirectoryColumnSettings(session.token);
      const visibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      setSelectedDirectoryVisibleColumns(visibleColumns);
      setDraftDirectoryVisibleColumns(visibleColumns);
      setDirectoryColumnSettingsSource(response.source || 'system');
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('');
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось загрузить настройки столбцов');
    }
  };

  useEffect(() => {
    if (activeView === 'directory' && session?.token) {
      loadDirectoryColumnSettingsFromApi();
    }
  }, [activeView, session?.token]);

  const saveDirectoryColumnSettings = async () => {
    if (!session?.token) return;
    const visibleColumns = sanitizeDirectoryVisibleColumns(draftDirectoryVisibleColumns);
    try {
      const response = await saveMyDirectoryColumnSettings(session.token, visibleColumns);
      const nextVisibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      setSelectedDirectoryVisibleColumns(nextVisibleColumns);
      setDraftDirectoryVisibleColumns(nextVisibleColumns);
      setDirectoryColumnSettingsSource(response.source || 'user');
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Личные настройки столбцов сохранены.');
      setIsDirectoryColumnsPanelOpen(false);
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сохранить настройки столбцов');
    }
  };

  const resetDirectoryColumnSettings = async () => {
    if (!session?.token) return;
    try {
      const response = await resetMyDirectoryColumnSettings(session.token);
      const nextVisibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      setSelectedDirectoryVisibleColumns(nextVisibleColumns);
      setDraftDirectoryVisibleColumns(nextVisibleColumns);
      setDirectoryColumnSettingsSource(response.source || 'system');
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Личные настройки сброшены.');
      setIsDirectoryColumnsPanelOpen(false);
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сбросить настройки столбцов');
    }
  };

  const saveGlobalDirectoryColumnSettingsForAll = async () => {
    if (!session?.token) return;
    const visibleColumns = sanitizeDirectoryVisibleColumns(draftDirectoryVisibleColumns);
    try {
      const response = await saveGlobalDirectoryColumnSettings(session.token, visibleColumns);
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Базовые настройки столбцов для всех сохранены.');
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сохранить базовые настройки столбцов');
    }
  };

  const resetGlobalDirectoryColumnSettingsForAll = async () => {
    if (!session?.token) return;
    try {
      const response = await resetGlobalDirectoryColumnSettings(session.token);
      const nextVisibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      if (directoryColumnSettingsSource !== 'user') {
        setSelectedDirectoryVisibleColumns(nextVisibleColumns);
        setDraftDirectoryVisibleColumns(nextVisibleColumns);
        setDirectoryColumnSettingsSource(response.source || 'system');
      }
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Базовые настройки столбцов сброшены.');
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сбросить базовые настройки столбцов');
    }
  };

  const renderDirectoryDash = () => <span className="text-slate-350 italic">—</span>;

  const renderDirectoryTextCell = (value: unknown, maxClass = 'max-w-[220px]') => {
    const text = formatDirectoryCellText(value);
    if (text === '—') return renderDirectoryDash();
    return <div className={`truncate break-words ${maxClass}`} title={text}>{text}</div>;
  };

  const renderDirectoryCell = (entry: DirectoryEntry, columnKey: DirectoryColumnKey) => {
    const phones = getEntryPhones(entry);
    const primaryPhone = phones[0] || '';
    const extraPhones = phones.slice(1);

    switch (columnKey) {
      case 'type':
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span
              title={entry.isBlacklisted ? 'Черный список' : entry.isSpam ? 'Спам' : getDirectoryTypeLabel(entry)}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-xs transition-all ${
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
          </div>
        );
      case 'fullName':
        return <span className="text-[15px] font-medium text-slate-900">{entry.name || renderDirectoryDash()}</span>;
      case 'phone':
        return primaryPhone ? (
          <div className="flex items-center gap-2 font-mono font-bold text-blue-800 dark:text-rose-200">
            <span className="select-all">{primaryPhone}</span>
            <button
              onClick={() => triggerClickToCall(primaryPhone, entry.name)}
              className="flex items-center rounded border border-emerald-150 bg-emerald-50 p-1 text-emerald-700 shadow-xs transition-all hover:scale-105 hover:bg-emerald-100 active:scale-95"
              title={`Позвонить на ${primaryPhone} через SIP/AMI`}
            >
              <PhoneCall className="h-3 w-3" />
            </button>
          </div>
        ) : renderDirectoryDash();
      case 'phone2':
        return extraPhones.length ? (
          <div className="flex flex-col gap-1 font-mono font-bold text-blue-800 dark:text-rose-200">
            {extraPhones.map(phone => (
              <div key={phone} className="flex items-center gap-2">
                <span className="select-all">{phone}</span>
                <button
                  onClick={() => triggerClickToCall(phone, entry.name)}
                  className="flex items-center rounded border border-emerald-150 bg-emerald-50 p-1 text-emerald-700 shadow-xs transition-all hover:scale-105 hover:bg-emerald-100 active:scale-95"
                  title={`Позвонить на ${phone} через SIP/AMI`}
                >
                  <PhoneCall className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : renderDirectoryDash();
      case 'visibility':
        return (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${entry.visibility === 'private' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {entry.visibility === 'private' ? 'Личный' : 'Общий'}
          </span>
        );
      case 'isSpam':
        return (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${entry.isSpam ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            {entry.isSpam ? 'Спам' : 'Нет'}
          </span>
        );
      case 'organization':
        return renderDirectoryTextCell(entry.company, 'max-w-[210px]');
      case 'position':
        return renderDirectoryTextCell(entry.position);
      case 'email':
        return entry.email ? (
          <a href={`mailto:${entry.email}`} className="block truncate text-blue-600 hover:text-blue-700 hover:underline" title={entry.email}>{entry.email}</a>
        ) : renderDirectoryDash();
      case 'website':
        return entry.website ? (
          <a href={String(entry.website).startsWith('http') ? entry.website : `https://${entry.website}`} target="_blank" rel="noreferrer" className="block truncate text-blue-600 hover:text-blue-700 hover:underline" title={entry.website}>{entry.website}</a>
        ) : renderDirectoryDash();
      case 'inn':
        return renderDirectoryTextCell(entry.inn, 'max-w-[150px]');
      case 'kpp':
        return renderDirectoryTextCell(entry.kpp, 'max-w-[150px]');
      case 'ogrn':
        return renderDirectoryTextCell(entry.ogrn, 'max-w-[170px]');
      case 'address':
        return renderDirectoryTextCell(entry.address, 'max-w-[240px]');
      case 'comment':
        return renderDirectoryTextCell(entry.comment, 'max-w-[240px]');
      case 'department':
        return renderDirectoryTextCell(entry.department);
      case 'group':
        return renderDirectoryTextCell(entry.group);
      case 'tags':
        return getDirectoryEntryTags(entry).length ? (
          <div className="flex flex-wrap gap-1">
            {getDirectoryEntryTags(entry).map(tag => (
              <span key={tag} className="rounded-full border border-slate-200 bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{tag}</span>
            ))}
          </div>
        ) : renderDirectoryDash();
      case 'internalExtension':
        return renderDirectoryTextCell(entry.internalExtension, 'max-w-[140px]');
      case 'linkedExternalNumber':
        return renderDirectoryTextCell(entry.linkedExternalNumber, 'max-w-[170px]');
      case 'responsibleUserId':
        return renderDirectoryTextCell(entry.responsibleUserId, 'max-w-[170px]');
      case 'actions':
        return (
          <div className="flex items-center justify-end gap-1.5">
            {hasPermission('edit_directory') && (
              <button
                onClick={() => handleToggleSpam(entry, !entry.isSpam)}
                className={`rounded-lg border p-1.5 transition-all cursor-pointer ${entry.isSpam ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 hover:text-amber-700 hover:bg-amber-50 border-transparent hover:border-amber-200'}`}
                title={entry.isSpam ? 'Убрать из спама' : 'Пометить как спам'}
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            )}
            {hasPermission('manage_blacklist') && (
              <button
                onClick={() => handleToggleBlacklist(entry, !entry.isBlacklisted, true)}
                className={`rounded-lg border p-1.5 transition-all cursor-pointer ${entry.isBlacklisted ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-slate-500 hover:text-blue-700 hover:bg-blue-50 border-transparent hover:border-blue-200'}`}
                title={entry.isBlacklisted ? 'Убрать из черного списка' : 'Добавить в черный список АТС'}
              >
                <AlertCircle className="h-3.5 w-3.5" />
              </button>
            )}
            {hasPermission('edit_directory') && (
              <button
                onClick={() => openEditDirEntry(entry)}
                className="rounded-lg border border-transparent p-1.5 text-slate-500 transition-all hover:border-slate-200 hover:bg-slate-100 hover:text-blue-700 cursor-pointer"
                title="Редактировать контакт"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
            {hasPermission('edit_directory') && (
              <button
                onClick={() => handleDeleteDirEntry(entry.id)}
                className="rounded-lg border border-transparent p-1.5 text-slate-500 transition-all hover:border-slate-200 hover:bg-slate-100 hover:text-blue-700 cursor-pointer"
                title="Удалить контакт"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      default:
        return renderDirectoryDash();
    }
  };

  const hasDirectoryFormFieldValue = (fieldKey: DirectoryVisibleColumnKey): boolean => {
    const original = editingDirEntry as any;
    const originalPhones = editingDirEntry ? getEntryPhones(editingDirEntry) : [];
    const originalExtraPhones = originalPhones.slice(1).join('');
    const values: Record<DirectoryVisibleColumnKey, unknown> = {
      type: dirType,
      fullName: dirName || original?.name,
      phone: dirNumber || originalPhones[0] || original?.number,
      visibility: original?.visibility,
      isSpam: dirIsSpam || original?.isSpam,
      organization: dirCompany || original?.company,
      position: dirPosition || original?.position,
      phone2: dirPhonesText || originalExtraPhones,
      email: dirEmail || original?.email,
      website: dirWebsite || original?.website,
      inn: dirInn || original?.inn,
      kpp: dirKpp || original?.kpp,
      ogrn: dirOgrn || original?.ogrn,
      address: dirAddress || original?.address,
      comment: dirComment || original?.comment,
      department: dirDepartment || original?.department,
      group: dirGroup || original?.group,
      tags: dirTagsText || (Array.isArray(original?.tags) ? original.tags.join('; ') : ''),
      internalExtension: dirInternalExtension || original?.internalExtension,
      linkedExternalNumber: dirLinkedExternalNumber || original?.linkedExternalNumber,
      responsibleUserId: dirResponsibleUserId || original?.responsibleUserId
    };
    return String(values[fieldKey] ?? '').trim().length > 0;
  };

  const visibleDirectoryContactFormFields: DirectoryVisibleColumnKey[] = dirFormShowAllFields
    ? directoryContactFormFieldOrder
    : directoryContactFormFieldOrder.filter(fieldKey => {
      if (requiredDirectoryColumns.includes(fieldKey as DirectoryRequiredColumnKey)) return true;
      if (selectedDirectoryVisibleColumns.includes(fieldKey)) return true;
      return !!editingDirEntry && hasDirectoryFormFieldValue(fieldKey);
    });

  const hasDirectoryContactFormField = (fieldKey: DirectoryVisibleColumnKey): boolean => visibleDirectoryContactFormFields.includes(fieldKey);

  const directoryFormInputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const directoryFormMonoInputClass = directoryFormInputClass + ' font-mono';

  const renderDirectoryContactFormField = (fieldKey: DirectoryVisibleColumnKey) => {
    switch (fieldKey) {
      case 'type':
        return (
          <label className="space-y-1 text-xs font-semibold text-slate-650">
            <span>Тип контакта</span>
            <select value={dirType} onChange={(e) => setDirType(e.target.value as typeof dirType)} className={directoryFormInputClass}>
              <option value="client">Клиент</option>
              <option value="supplier">Поставщик</option>
              <option value="government">Госорган</option>
              <option value="internal">Внутренний</option>
            </select>
          </label>
        );
      case 'visibility':
        return (
          <label className="space-y-1 text-xs font-semibold text-slate-650">
            <span>Видимость</span>
            <select value={dirVisibility} onChange={(e) => setDirVisibility(e.target.value as typeof dirVisibility)} className={directoryFormInputClass}>
              <option value="shared">Общий контакт</option>
              <option value="private">Личный контакт</option>
            </select>
          </label>
        );
      case 'isSpam':
        return (
          <label className="flex min-h-[58px] items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            <input type="checkbox" checked={dirIsSpam} onChange={(e) => setDirIsSpam(e.target.checked)} className="rounded border-amber-300 text-amber-600" />
            Спам
          </label>
        );
      case 'organization':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Организация</span><input type="text" value={dirCompany} onChange={(e) => setDirCompany(e.target.value)} placeholder="ООО Компания" className={directoryFormInputClass} /></label>;
      case 'fullName':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>ФИО</span><input type="text" value={dirName} onChange={(e) => setDirName(e.target.value)} placeholder="Иван Смирнов" className={directoryFormInputClass} /></label>;
      case 'position':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Должность</span><input type="text" value={dirPosition} onChange={(e) => setDirPosition(e.target.value)} placeholder="Директор / менеджер" className={directoryFormInputClass} /></label>;
      case 'phone':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Телефон</span><input type="text" value={dirNumber} onChange={(e) => setDirNumber(e.target.value)} placeholder="100 или 79781234567" className={directoryFormMonoInputClass} /></label>;
      case 'phone2':
        return <label className="space-y-1 text-xs font-semibold text-slate-650 md:col-span-2"><span>Доп. телефон</span><textarea value={dirPhonesText} onChange={(e) => setDirPhonesText(e.target.value)} rows={3} placeholder="Каждый номер с новой строки или через запятую" className={directoryFormMonoInputClass} /></label>;
      case 'email':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Email</span><input type="email" value={dirEmail} onChange={(e) => setDirEmail(e.target.value)} className={directoryFormInputClass} /></label>;
      case 'website':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Сайт</span><input type="text" value={dirWebsite} onChange={(e) => setDirWebsite(e.target.value)} placeholder="site.ru" className={directoryFormInputClass} /></label>;
      case 'inn':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>ИНН</span><input type="text" value={dirInn} onChange={(e) => setDirInn(e.target.value)} className={directoryFormMonoInputClass} /></label>;
      case 'kpp':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>КПП</span><input type="text" value={dirKpp} onChange={(e) => setDirKpp(e.target.value)} className={directoryFormMonoInputClass} /></label>;
      case 'ogrn':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>ОГРН</span><input type="text" value={dirOgrn} onChange={(e) => setDirOgrn(e.target.value)} className={directoryFormMonoInputClass} /></label>;
      case 'address':
        return <label className="space-y-1 text-xs font-semibold text-slate-650 md:col-span-2"><span>Адрес</span><input type="text" value={dirAddress} onChange={(e) => setDirAddress(e.target.value)} placeholder="Город, улица, офис" className={directoryFormInputClass} /></label>;
      case 'department':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Отдел / группа</span><input type="text" value={dirDepartment} onChange={(e) => setDirDepartment(e.target.value)} placeholder="Продажи, IT, Бухгалтерия" className={directoryFormInputClass} /></label>;
      case 'group':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Группа</span><input type="text" value={dirGroup} onChange={(e) => setDirGroup(e.target.value)} placeholder="Клиенты, Поставщики" className={directoryFormInputClass} /></label>;
      case 'tags':
        return <label className="space-y-1 text-xs font-semibold text-slate-650 md:col-span-2"><span>Теги</span><input type="text" value={dirTagsText} onChange={(e) => setDirTagsText(e.target.value)} placeholder="VIP; Клиент; тендер" className={directoryFormInputClass} /></label>;
      case 'internalExtension':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Внутренний номер</span><input type="text" value={dirInternalExtension} onChange={(e) => setDirInternalExtension(e.target.value)} placeholder="101" className={directoryFormMonoInputClass} /></label>;
      case 'linkedExternalNumber':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Связанный внешний номер</span><input type="text" value={dirLinkedExternalNumber} onChange={(e) => setDirLinkedExternalNumber(e.target.value)} placeholder="79781234567" className={directoryFormMonoInputClass} /></label>;
      case 'responsibleUserId':
        return <label className="space-y-1 text-xs font-semibold text-slate-650"><span>Ответственный сотрудник</span><input type="text" value={dirResponsibleUserId} onChange={(e) => setDirResponsibleUserId(e.target.value)} placeholder="u1" className={directoryFormInputClass} /></label>;
      case 'comment':
        return <label className="space-y-1 text-xs font-semibold text-slate-650 md:col-span-2"><span>Комментарий</span><textarea value={dirComment} onChange={(e) => setDirComment(e.target.value)} rows={3} placeholder="Комментарий, примечание, источник" className={directoryFormInputClass} /></label>;
      default:
        return null;
    }
  };


  const renderContactSyncProviderCard = (provider: OnlineContactSyncProvider) => {
    const account = getContactSyncAccount(provider);
    const isBusy = contactSyncBusyProvider === provider;
    const isConnected = account.status === 'connected';
    const isGoogle = provider === 'google';
    const isCardDav = provider === 'yandex' || provider === 'mailru';
    const form = isCardDav ? cardDavForms[provider] : null;
    const statusClass = isConnected
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : account.status === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-white text-slate-500';
    const previewItems = contactSyncPreviewItems[provider] || [];
    const selectedIds = contactSyncSelectedIds[provider] || [];
    const selectedCount = previewItems.filter(item => selectedIds.includes(String(item.externalContactId || '')) && canSelectContactSyncItem(provider, item)).length;
    const diagnostic = contactSyncDiagnostics[provider];
    const failedDiagnosticStep = diagnostic?.steps?.find(step => step.status === 'error') || diagnostic?.steps?.find(step => step.status === 'warning');
    const friendlyDiagnosticMessage = diagnostic?.ok
      ? 'Подключение работает. Можно выполнить предпросмотр импорта.'
      : isGoogle
        ? 'Проверьте настройки Google OAuth или повторите подключение.'
        : failedDiagnosticStep?.message?.includes('не принял логин или пароль')
          ? 'Сервис не принял логин или пароль приложения. Используйте импорт из файла или проверьте пароль приложения.'
          : 'Используйте импорт из файла или проверьте параметры расширенного подключения.';
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-650">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Globe className="h-4 w-4 text-blue-600" />
            <span>{contactSyncProviderLabels[provider]}</span>
          </div>
          <span className={'rounded-full border px-2 py-0.5 text-[10px] font-bold ' + statusClass}>
            {account.status}
          </span>
        </div>

        {account.configured === false && (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            {isGoogle ? 'Google Contacts не настроен или отключен администратором' : 'Расширенное подключение отключено администратором'}
          </div>
        )}

        <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
          {isGoogle
            ? 'Подключите Google и импортируйте выбранные контакты в личный справочник PBXPuls.'
            : provider === 'yandex'
              ? 'Рекомендуется экспортировать контакты из Яндекса в CSV/vCard и загрузить файл в PBXPuls.'
              : 'Рекомендуется экспортировать контакты Mail.ru в CSV/vCard и загрузить файл в PBXPuls.'}
        </p>
        <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-800">Импорт в PBXPuls</div>
        {isAdminRole(session?.role) && (
          <div className="mb-2 grid grid-cols-1 gap-1 text-[11px] text-slate-400">
            <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Выгрузка во внешний сервис — скоро</div>
            <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Двухсторонняя синхронизация — скоро</div>
          </div>
        )}
        {isCardDav && (
          <button type="button" onClick={() => contactFileInputRef.current?.click()} disabled={contactSyncBusyProvider === 'file' || settings?.fileImportEnabled === false} className="mb-3 inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />
            {contactSyncBusyProvider === 'file' ? 'Загрузка...' : 'Загрузить файл'}
          </button>
        )}

        {isConnected && (
          <div className="mb-2 space-y-1 text-[11px] text-slate-600">
            <div>Аккаунт: <span className="font-semibold text-slate-800">{account.externalAccountEmail || 'не указан'}</span></div>
            {account.lastError && <div className="text-red-700">Ошибка: {account.lastError}</div>}
          </div>
        )}

        {isCardDav && form && (
          <details className="mt-3 rounded-md border border-slate-200 bg-white p-2">
            <summary className="cursor-pointer text-[11px] font-black text-slate-700">{provider === 'yandex' ? 'Расширенное подключение через пароль приложения' : 'Расширенное подключение через пароль для внешнего приложения'}</summary>
            {!isConnected && (
              <div className="mt-2 space-y-2">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setCardDavForms(prev => ({ ...prev, [provider]: { ...prev[provider], email: e.target.value } }))}
                  placeholder={provider === 'yandex' ? 'Email Яндекс' : 'Email Mail.ru'}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                />
                <input
                  type="password"
                  value={form.appPassword}
                  onChange={(e) => setCardDavForms(prev => ({ ...prev, [provider]: { ...prev[provider], appPassword: e.target.value } }))}
                  placeholder={provider === 'yandex' ? 'Пароль приложения' : 'Пароль для внешнего приложения'}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                />
                <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-slate-600">Дополнительные настройки</summary>
                  <input
                    type="url"
                    value={form.carddavUrl}
                    onChange={(e) => setCardDavForms(prev => ({ ...prev, [provider]: { ...prev[provider], carddavUrl: e.target.value } }))}
                    className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                  />
                </details>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {provider === 'yandex' ? 'Для подключения используйте пароль приложения Яндекса.' : 'Для подключения Mail.ru используйте пароль для внешнего приложения.'}
                </p>
                <button type="button" onClick={() => handleCardDavConnect(provider)} disabled={isBusy || account.configured === false} className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {isBusy ? 'Подключение...' : 'Подключить'}
                </button>
              </div>
            )}
            {isConnected && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => handleDiagnoseContactSync(provider)} disabled={isBusy || account.configured === false} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{isBusy ? 'Проверка...' : 'Проверить подключение'}</button>
                <button type="button" onClick={() => handlePreviewContactSyncImport(provider)} disabled={isBusy || account.configured === false} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Предпросмотр импорта</button>
                <button type="button" onClick={() => handleDisconnectContactSync(provider)} disabled={isBusy} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Отключить</button>
              </div>
            )}
          </details>
        )}

        {isGoogle && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => handleDiagnoseContactSync(provider)} disabled={isBusy || account.configured === false} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{isBusy ? 'Проверка...' : 'Проверить подключение'}</button>
            {!isConnected && (
              <button type="button" onClick={handleGoogleContactsConnect} disabled={isBusy || account.configured === false} className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isBusy ? 'Подключение...' : 'Подключить Google'}
              </button>
            )}
            {isConnected && (
              <>
                <button type="button" onClick={() => handlePreviewContactSyncImport(provider)} disabled={isBusy || account.configured === false} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Предпросмотр импорта</button>
                <button type="button" onClick={() => handleDisconnectContactSync(provider)} disabled={isBusy} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Отключить</button>
              </>
            )}
          </div>
        )}

        {diagnostic && (
          <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
            <div className="text-[11px] font-black uppercase text-slate-500">Диагностика подключения</div>
            <div className={diagnostic.ok ? 'mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800' : 'mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800'}>{friendlyDiagnosticMessage}</div>
            <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer text-[11px] font-bold text-slate-600">Технические детали</summary>
              <div className="mt-2 space-y-1.5">
                {(diagnostic.steps || []).map((step) => {
                  const stepClass = step.status === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : step.status === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-red-200 bg-red-50 text-red-800';
                  const dotClass = step.status === 'ok' ? 'bg-emerald-500' : step.status === 'warning' ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={step.key} className={'rounded-md border px-2 py-1.5 ' + stepClass}>
                      <div className="flex items-start gap-2">
                        <span className={'mt-1 h-2 w-2 shrink-0 rounded-full ' + dotClass}></span>
                        <div className="min-w-0">
                          <div className="font-bold text-[11px]">{step.label}</div>
                          <div className="break-words text-[11px]">{step.message}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        )}

        {previewItems.length > 0 && (
          <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => handleSelectNewContactSyncItems(provider)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">Выбрать все новые</button>
              <button type="button" onClick={() => handleClearContactSyncSelection(provider)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50">Снять выбор</button>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={contactSyncForceDuplicates[provider] === true}
                  onChange={(e) => setContactSyncForceDuplicates(prev => ({ ...prev, [provider]: e.target.checked }))}
                />
                Импортировать возможные дубли как новые
              </label>
              <button type="button" onClick={() => handleImportSelectedContactSyncItems(provider)} disabled={isBusy || selectedCount === 0} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Импортировать выбранные ({selectedCount})</button>
            </div>
            <div className="max-h-72 overflow-auto rounded border border-slate-100">
              <table className="min-w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2">Статус</th>
                    <th className="p-2">ФИО</th>
                    <th className="p-2">Телефон</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Организация</th>
                    <th className="p-2">Проблемы</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((item) => {
                    const id = String(item.externalContactId || '');
                    const isSelectable = canSelectContactSyncItem(provider, item);
                    const isSelected = isSelectable && selectedIds.includes(id);
                    const statusLabel = item.status === 'new' ? 'Новый' : item.status === 'possible_duplicate' ? 'Возможный дубль' : item.status === 'invalid' ? 'Ошибка' : item.status;
                    return (
                      <tr key={id || Math.random()} className="border-t border-slate-100 align-top">
                        <td className="p-2">
                          <input type="checkbox" disabled={!isSelectable} checked={isSelected} onChange={(e) => handleToggleContactSyncItem(provider, item, e.target.checked)} />
                        </td>
                        <td className="p-2 font-semibold text-slate-700">{statusLabel}</td>
                        <td className="p-2 text-slate-800">{item.fullName || '—'}</td>
                        <td className="p-2 font-mono text-slate-700">{item.phone || item.phone2 || '—'}</td>
                        <td className="p-2 text-slate-700">{item.email || '—'}</td>
                        <td className="p-2 text-slate-700">{item.organization || '—'}</td>
                        <td className="p-2 text-slate-500">{[...(item.warnings || []), ...(item.errors || [])].join('; ') || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContactFilePreviewPanel = () => {
    const previewItems = contactSyncPreviewItems.file || [];
    if (!previewItems.length) return null;
    const selectedIds = contactSyncSelectedIds.file || [];
    const selectedCount = previewItems.filter(item => selectedIds.includes(String(item.externalContactId || '')) && canSelectContactSyncItem('file', item)).length;
    const isBusy = contactSyncBusyProvider === 'file';
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-650">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-black text-slate-800">CSV/vCard</div>
            <div className="mt-1 text-[11px] text-slate-500">{contactFileName || 'Файл контактов'}: предпросмотр импорта в личный справочник</div>
            {contactFileSourceFormat && <div className="mt-1 text-[11px] font-bold text-blue-700">{contactFileSourceFormatLabels[contactFileSourceFormat]}{contactFileEncoding ? ' · ' + (contactFileEncodingLabels[contactFileEncoding] || contactFileEncoding) : ''}</div>}
          </div>
          <button type="button" onClick={() => contactFileInputRef.current?.click()} disabled={isBusy || !isContactImportSourceEnabled('file')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />
            Загрузить другой файл
          </button>
        </div>
        {contactFilePreviewSummary && (
          <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
            <div className="font-bold text-slate-800">Всего в файле: {contactFilePreviewSummary.totalRows}. Готово к импорту: {contactFilePreviewSummary.readyToImport}. Ошибок: {contactFilePreviewSummary.invalid}. Дублей: {contactFilePreviewSummary.duplicates}.</div>
            {getContactFileSourceFormatMessage(contactFilePreviewSummary.sourceFormat, contactFilePreviewSummary.encoding) && <div className="mt-1">{getContactFileSourceFormatMessage(contactFilePreviewSummary.sourceFormat, contactFilePreviewSummary.encoding)}</div>}
            {contactFilePreviewSummary.invalid > 0 && <div className="mt-1 text-red-700">Контакты без ФИО или телефона не будут импортированы.</div>}
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => handleSelectNewContactSyncItems('file')} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">Выбрать все новые</button>
          <button type="button" onClick={() => handleClearContactSyncSelection('file')} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50">Снять выбор</button>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={contactSyncForceDuplicates.file === true}
              onChange={(e) => setContactSyncForceDuplicates(prev => ({ ...prev, file: e.target.checked }))}
            />
            Импортировать возможные дубли как новые
          </label>
          <button type="button" onClick={() => handleImportSelectedContactSyncItems('file')} disabled={isBusy || selectedCount === 0 || !isContactImportSourceEnabled('file')} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Импортировать выбранные ({selectedCount})</button>
        </div>
        <div className="max-h-72 overflow-auto rounded border border-slate-100">
          <table className="min-w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                <th className="w-8 p-2"></th>
                <th className="p-2">Статус</th>
                <th className="p-2">ФИО</th>
                <th className="p-2">Телефон</th>
                <th className="p-2">Email</th>
                <th className="p-2">Организация</th>
                <th className="p-2">Проблемы</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.map((item) => {
                const id = String(item.externalContactId || '');
                const isSelectable = canSelectContactSyncItem('file', item);
                const isSelected = isSelectable && selectedIds.includes(id);
                const statusLabel = item.status === 'new' ? 'Новый' : item.status === 'possible_duplicate' ? 'Возможный дубль' : item.status === 'invalid' ? 'Ошибка' : item.status;
                return (
                  <tr key={id || Math.random()} className="border-t border-slate-100 align-top">
                    <td className="p-2"><input type="checkbox" disabled={!isSelectable} checked={isSelected} onChange={(e) => handleToggleContactSyncItem('file', item, e.target.checked)} /></td>
                    <td className="p-2 font-semibold text-slate-700">{statusLabel}</td>
                    <td className="p-2 text-slate-800">{item.fullName || '—'}</td>
                    <td className="p-2 font-mono text-slate-700">{item.phone || item.phone2 || '—'}</td>
                    <td className="p-2 text-slate-700">{item.email || '—'}</td>
                    <td className="p-2 text-slate-700">{item.organization || '—'}</td>
                    <td className="p-2 text-slate-500">{[...(item.warnings || []), ...(item.errors || [])].join('; ') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPersonalContactImportPanel = () => {
    const showFileImport = canShowContactImportSource('file');
    const visibleProviders = (['google', 'yandex', 'mailru'] as OnlineContactSyncProvider[]).filter(provider => canShowContactImportSource(provider));
    const noSourcesVisible = !showFileImport && visibleProviders.length === 0;

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-900">Личный импорт контактов</h4>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Контакты будут импортированы только в ваш личный справочник.</p>
          </div>
          <button type="button" onClick={loadContactSyncAccounts} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50" title="Обновить подключения">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <input ref={contactFileInputRef} type="file" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard" onChange={handleContactFileInputChange} className="hidden" />
        {contactSyncMessage && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">{contactSyncMessage}</div>
        )}
        {noSourcesVisible && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Доступные источники импорта отключены администратором.</div>
        )}
        {showFileImport && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <button type="button" onClick={() => contactFileInputRef.current?.click()} disabled={contactSyncBusyProvider === 'file' || !isContactImportSourceEnabled('file')} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              <Upload className="h-3.5 w-3.5" />
              {contactSyncBusyProvider === 'file' ? 'Загрузка...' : 'Загрузить CSV/vCard'}
            </button>
            <span className="text-[11px] text-slate-500">{isContactImportSourceEnabled('file') ? 'Универсальный импорт для Yandex, Mail.ru и других источников.' : getContactImportSourceDisabledMessage('file')}</span>
          </div>
        )}
        {visibleProviders.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {visibleProviders.map(provider => <React.Fragment key={provider}>{renderContactSyncProviderCard(provider)}</React.Fragment>)}
          </div>
        )}
        {showFileImport && <div className="mt-3">{renderContactFilePreviewPanel()}</div>}
      </div>
    );
  };

  const renderDirectoryContactFormSection = (title: string, fieldKeys: DirectoryVisibleColumnKey[]) => {
    const visibleFields = fieldKeys.filter(hasDirectoryContactFormField);
    if (visibleFields.length === 0) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h4 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{title}</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleFields.map(fieldKey => <React.Fragment key={fieldKey}>{renderDirectoryContactFormField(fieldKey)}</React.Fragment>)}
        </div>
      </div>
    );
  };

  if (!session) {
    return (
      <div id="login-container" className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-sky-50/40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(239,246,255,0.82))]" />

        <div className="absolute inset-x-0 bottom-0 h-[66vh] pointer-events-none overflow-hidden">
          <svg
            className="absolute inset-x-0 bottom-0 h-full w-full"
            viewBox="0 0 1440 520"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,185 C160,135 295,120 440,160 C590,202 690,250 835,214 C1010,170 1138,132 1440,158 L1440,520 L0,520 Z"
              fill="rgba(191, 219, 254, 0.55)"
            />
            <path
              d="M0,250 C175,205 295,208 455,252 C640,304 745,295 910,248 C1090,198 1245,198 1440,232 L1440,520 L0,520 Z"
              fill="rgba(186, 230, 253, 0.52)"
            />
            <path
              d="M0,330 C180,282 345,300 505,332 C690,370 835,355 1025,306 C1200,260 1320,272 1440,315 L1440,520 L0,520 Z"
              fill="rgba(147, 197, 253, 0.42)"
            />
            <path
              d="M0,400 C195,360 360,375 560,410 C755,444 955,430 1140,382 C1280,346 1368,358 1440,382 L1440,520 L0,520 Z"
              fill="rgba(125, 211, 252, 0.34)"
            />
            <path
              d="M0,305 C190,270 360,278 550,318 C760,362 940,348 1130,300 C1265,266 1360,270 1440,288"
              fill="none"
              stroke="rgba(255, 255, 255, 0.70)"
              strokeWidth="2"
            />
            <path
              d="M0,385 C220,350 410,365 610,396 C815,428 980,412 1160,368 C1290,337 1370,340 1440,360"
              fill="none"
              stroke="rgba(255, 255, 255, 0.55)"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="relative z-10 min-h-screen flex flex-col px-6 py-8">
          <header className="flex flex-col items-center text-center pt-14">
            <div className="flex items-center justify-center gap-4">
              <Logo3D className="h-12 w-12" logoUrl={settings?.customLogoUrl || publicSettings?.customLogoUrl} withText />
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-600">
              Мониторинг, аналитика и управление телефонией
            </div>
          </header>

          <main className="flex-1 flex items-center justify-center px-4 -mt-6">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-7 shadow-xl shadow-slate-300/35">
              {loginError && (
                <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="mb-2.5 block text-sm font-black uppercase tracking-wide text-slate-800">
                    Имя пользователя
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Например, admin..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2.5 block text-sm font-black uppercase tracking-wide text-slate-800">
                    Пароль входа
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-3.5 text-base font-black text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-700 hover:to-sky-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Авторизация...
                    </span>
                  ) : (
                    'Войти в консоль'
                  )}
                </button>
              </form>
            </div>
          </main>

          <footer className="pb-3 text-center text-sm text-slate-500">
            <div>{settings?.customCopyright || publicSettings?.customCopyright || "© 2026 PBXPULS. Все права защищены. Грунин К.В. ИНН 9102057404"}</div>
            <div className="mt-2">
              Внедрение, разработка и поддержка VOIP-проектов
              <span className="mx-2">•</span>
              <a href="tel:+79787437943" className="font-semibold text-slate-600 hover:text-blue-600">
                +7 (978) 743-79-43
              </a>
              <span className="mx-2">•</span>
              <a href="https://grunin.org" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">
                grunin.org
              </a>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-800 dark:text-[#f1f5f9] flex font-sans">
      {/* Hidden HTML-5 Audio Node references */}
      <audio ref={audioRef} className="hidden" />

      {/* LEFT SIDEBAR VIEW PLATFORM */}
      <aside className={`${isSidebarExpanded ? 'w-64' : 'w-16 md:w-20'} bg-white dark:bg-[#1e293b] border-r border-slate-200 dark:border-[#334155] flex flex-col items-center justify-between py-5 shrink-0 sticky top-0 h-screen select-none z-30 transition-all duration-300 shadow-xs`}>
        <div className={`flex min-h-0 flex-1 flex-col ${isSidebarExpanded ? 'items-start px-4' : 'items-center'} gap-6 w-full overflow-y-auto overflow-x-hidden pb-3`}>
          {/* Logo Element resembling high-end layers icon */}
          <div className={`flex items-center ${isSidebarExpanded ? 'gap-2 w-full' : 'justify-center w-full'}`}>
            <div className={`${isSidebarExpanded ? "h-[52px] w-full justify-start" : "h-[45px] w-[45px] justify-center"} flex items-center active:scale-95 transition-transform cursor-pointer shrink-0 overflow-hidden`}>
              <Logo3D className="h-[45px] w-[45px]" logoUrl={settings?.customLogoUrl || publicSettings?.customLogoUrl} withText={isSidebarExpanded} /></div>
            {isSidebarExpanded && (
              <div className="min-w-0 animate-fade-in"></div>
            )}
          </div>

          {/* Navigation Items */}
          <div className={`flex flex-col ${isSidebarExpanded ? 'items-stretch' : 'items-center'} gap-2 w-full ${isSidebarExpanded ? '' : 'px-2'} shrink-0`}>
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
                  setDirectoryPageMode('list');
                  window.history.pushState({}, '', '/');
                  setActiveView('directory');
                  loadDirectory(dirPage);
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

            {hasPermission('view_marketing') && (
              <button
                onClick={() => setActiveView('marketing')}
                className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                  activeView === 'marketing'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
                title={isSidebarExpanded ? "" : "Маркетинг"}
              >
                <Target className="h-5 w-5 shrink-0" />
                {isSidebarExpanded && (
                  <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                    Маркетинг
                  </span>
                )}
                {!isSidebarExpanded && (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                    Маркетинг
                  </span>
                )}
              </button>
            )}

              {/* SIDEBAR_MONITORING */}
              {hasPermission('view_monitoring') && (
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
                  {!isSidebarExpanded && (
                    <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                      Мониторинг
                    </span>
                  )}
                </button>
              )}

              {hasPermission('view_management') && (
                <button
                  onClick={() => setActiveView('management')}
                  className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                    activeView === 'management'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }`}
                  title={isSidebarExpanded ? "" : "Управление"}
                >
                  <Wrench className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      Управление
                    </span>
                  )}
                </button>
              )}

              {hasPermission('view_balance') && (
                <button
                  onClick={() => setActiveView('balance')}
                  className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                    activeView === 'balance'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }`}
                  title={isSidebarExpanded ? "" : "Баланс"}
                >
                  <Wallet className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      Баланс
                    </span>
                  )}
                </button>
              )}

              {hasPermission('view_scripts') && (
                <button
                  onClick={() => setActiveView('scripts')}
                  className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                    activeView === 'scripts'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }`}
                  title={isSidebarExpanded ? "" : "Скрипты разговоров"}
                >
                  <Scroll className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      Скрипты разговоров
                    </span>
                  )}
                  {!isSidebarExpanded && (
                    <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                      Скрипты разговоров
                    </span>
                  )}
                </button>
              )}

              {hasPermission('view_ai_assistant') && (
                <button
                  onClick={() => setActiveView('ai-assistant')}
                  className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
                    activeView === 'ai-assistant'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }`}
                  title={isSidebarExpanded ? "" : "AI-автоответчик"}
                >
                  <Bot className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      AI-автоответчик
                    </span>
                  )}
                  {!isSidebarExpanded && (
                    <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                      AI-автоответчик
                    </span>
                  )}
                </button>
              )}


          </div></div>

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
              if (isAdminRole(session?.role)) {
                loadAdminSettings();
                setSettingsTab('pbx');
              } else {
                setSettingsTab('appearance');
              }
              setActiveView('settings');
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
            onClick={() => setActiveView('about')}
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer ${
              activeView === 'about'
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
            }`}
            title={isSidebarExpanded ? "" : "О системе"}
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
            className={`flex items-center ${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl text-slate-400 hover:text-red-655 hover:bg-blue-50 dark:hover:bg-red-950/20 transition-all relative group cursor-pointer`}
            title={isSidebarExpanded ? "" : "Выйти"}
          >
            <LogOut className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-blue-600" />
            {isSidebarExpanded && (
              <span className="text-xs font-semibold truncate animate-fade-in text-slate-500 group-hover:text-blue-600">Выход</span>
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
                <div className="bg-gradient-to-br from-red-600 to-rose-700 p-2 rounded-xl text-white shadow-md shadow-blue-500/20 shrink-0">
                  {activeView === 'calls' && <Phone className="h-5 w-5" />}
                  {activeView === 'directory' && <BookOpen className="h-5 w-5" />}
                  {activeView === 'reports' && <BarChart3 className="h-5 w-5 animate-pulse" />}
                  {activeView === 'marketing' && <Target className="h-5 w-5" />}
                  {activeView === 'monitoring' && <Activity className="h-5 w-5 animate-pulse" />}
                  {activeView === 'management' && <Wrench className="h-5 w-5" />}
                  {activeView === 'balance' && <Wallet className="h-5 w-5" />}
                  {activeView === 'settings' && <Settings className="h-5 w-5" />}
                </div>
                <div>
                  <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2 font-sans uppercase">
                    {activeView === 'calls' && 'Реестр звонков'}
                    {activeView === 'directory' && (directoryPageMode === 'import' ? 'Админский CSV импорт' : directoryPageMode === 'personal_import' ? 'Личный импорт контактов' : directoryPageMode === 'contact_new' ? 'Новый контакт' : directoryPageMode === 'contact_edit' ? 'Редактирование контакта' : 'Телефонный справочник')}
                    {activeView === 'reports' && 'Отчеты и Аналитика'}
                    {activeView === 'marketing' && 'Маркетинг'}
                    {activeView === 'monitoring' && 'Мониторинг звонков'}
                    {activeView === 'management' && 'Управление АТС'}
                    {activeView === 'balance' && 'Баланс операторов'}
                    {activeView === 'settings' && 'Настройки системы'}
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400 text-xs font-light">
                    Панель мониторинга звонков Asterisk & FreePBX
                  </p></div>
              </div></div>

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
                  value={(session.role === 'operator' || session.permissions?.own_calls_only === true) ? (session.extension || '') : myExt}
                  onChange={(e) => setMyExt(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="101"
                  maxLength={6}
                  disabled={session.role === 'operator'}
                  className="w-12 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 rounded py-0.5 px-1.5 text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-center disabled:bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 dark:disabled:bg-slate-800 disabled:text-slate-550 dark:disabled:text-slate-500 disabled:cursor-not-allowed"
                  title={session.role === 'operator' ? 'SIP-номер закреплён администратором' : 'Введите ваш внутренний добавочный номер. С этого телефона Asterisk начнет дозвон.'}
                /></div>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={(session.role === 'operator' || session.permissions?.own_calls_only === true) ? true : onlyMyCalls}
                  disabled={session.role === 'operator'}
                  onChange={(e) => {
                    setOnlyMyCalls(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Мои звонки</span>
              </label></div>

            {/* Config & Profile actions */}
            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="text-right hidden md:block">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{session.username}</div>
                <div className="text-[10px] text-blue-600 dark:text-rose-400 font-medium uppercase tracking-wider">{session.role}</div></div>

              <button
                onClick={() => setDarkMode(prev => !prev)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer"
                title={darkMode ? "Включить светлую тему" : "Включить тёмную тему"}
              >
                {darkMode ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5" />}
              </button>
              
              <button
                onClick={() => {
                  if (isAdminRole(session.role)) {
                    loadAdminSettings();
                    setSettingsTab('pbx');
                  } else {
                    setSettingsTab('appearance');
                  }
                  setActiveView('settings');
                }}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-201 dark:hover:border-[#334155] transition-all cursor-pointer"
                title="Настройки"
              >
                <Settings className="h-5 w-5" />
              </button>

              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer"
                title="Выйти"
              >
                <LogOut className="h-5 w-5" />
              </button>
          </div>
          </div></div>
      </header>

      {liveCallBanner?.active && (() => {
        const handleLiveCallBannerDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
          if (event.button !== 0) return;

          const target = event.target as HTMLElement | null;
          if (target?.closest('button,a,input,textarea,select,summary,details')) return;

          event.preventDefault();

          const padding = 12;
          const bannerWidth = Math.min(window.innerWidth - padding * 2, 1280);
          const bannerHeight = 130;
          const startClientX = event.clientX;
          const startClientY = event.clientY;
          const startX = liveCallBannerPos.x;
          const startY = liveCallBannerPos.y;

          const clamp = (x: number, y: number) => ({
            x: Math.max(padding, Math.min(x, window.innerWidth - bannerWidth - padding)),
            y: Math.max(padding, Math.min(y, window.innerHeight - bannerHeight - padding)),
          });

          const handleMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();

            const next = clamp(
              startX + moveEvent.clientX - startClientX,
              startY + moveEvent.clientY - startClientY
            );

            setLiveCallBannerPos(next);
            localStorage.setItem('pbxpuls_live_call_banner_pos', JSON.stringify(next));
          };

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
          };

          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        };

        const isIncomingLive = liveCallBanner.direction === 'incoming';
        const isOutgoingLive = liveCallBanner.direction === 'outgoing';
        const isInternalLive = liveCallBanner.direction === 'internal';
        const title = getLiveCallPopupTitle(liveCallBanner.direction);
        const iconClass = isIncomingLive ? 'text-blue-600 bg-blue-50' : isOutgoingLive ? 'text-indigo-600 bg-indigo-50' : 'text-purple-600 bg-purple-50';
        const contactTypeLabel = liveCallBanner.contactType === 'internal' ? 'Внутренний' : 'Клиент';
        const contactTypeClass = liveCallBanner.contactType === 'internal' ? 'bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 text-slate-600 border-slate-200' : 'bg-blue-50 text-blue-600 border-blue-100';
        const display = liveCallBanner.displayName || liveCallBanner.displayNumber || 'Неизвестный номер';
        const isSpamOrBlacklisted = liveCallBanner.isSpam === true || liveCallBanner.isBlacklisted === true;
        const cleanName = display.replace(/\s*\(([^)]*)\)\s*$/, '');
        const positionMatch = display.match(/\(([^)]*)\)\s*$/);
        const position = positionMatch?.[1] || liveCallBanner.contactComment || '';
        const durationText = liveCallBanner.durationText || `${Math.floor((liveCallBanner.durationSec || 0) / 60)}:${String((liveCallBanner.durationSec || 0) % 60).padStart(2, '0')}`;
        const canUseLiveMonitorActions = session?.role === 'su' || session?.role === 'admin' || session?.role === 'manager';
        const liveActionButtonClass = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60';
        const routeNumberLabel = isIncomingLive ? 'DID' : isOutgoingLive ? 'Транк' : 'Кому';
        const routeNumber = isIncomingLive ? liveCallBanner.did : isOutgoingLive ? liveCallBanner.trunkNumber : liveCallBanner.destinationNumber;
        const endpointLabel = isIncomingLive ? 'На мой SIP' : 'От внутреннего';
        const endpointNumber = isIncomingLive
          ? (liveCallBanner.destinationNumber || liveCallBanner.internalNumber)
          : (liveCallBanner.internalCaller || liveCallBanner.sourceNumber || liveCallBanner.callerNumber);

        return (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: liveCallBannerPos.x,
              top: liveCallBannerPos.y,
              width: 'min(calc(100vw - 32px), 1280px)',
            }}
          >
            <div
              data-live-call-popup
              onMouseDown={handleLiveCallBannerDragStart}
              className="pointer-events-auto relative overflow-visible rounded-2xl border border-blue-200 bg-white shadow-2xl shadow-slate-900/12 animate-fade-in select-none cursor-grab active:cursor-grabbing"
              title="Перетащить окно звонка"
            >
              <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-b from-blue-500 to-sky-600" />
              <div className="flex items-stretch min-h-[104px]">
                <div className="relative flex items-center gap-4 py-4 pl-20 pr-6 min-w-[420px] max-w-[520px] border-r border-slate-200">
                  <div className="absolute left-4 top-3 bottom-3 z-10 flex flex-col justify-center gap-1">
                    <CallTargetSelector
                      mode="transfer"
                      token={session?.token || ''}
                      currentExtension={liveCallBanner.operatorExt || myExt}
                      disabled={isLiveTransferLoading}
                      buttonClassName={liveActionButtonClass}
                      onUnauthorized={handleAuthError}
                      onTransfer={handleLiveCallTransfer}
                    />
                    <CallTargetSelector
                      mode="conference"
                      token={session?.token || ''}
                      currentExtension={liveCallBanner.operatorExt || myExt}
                      disabled={isLiveTransferLoading}
                      buttonClassName={liveActionButtonClass}
                      backendStatus={conferenceBackendStatus}
                      onUnauthorized={handleAuthError}
                    />
                    {canUseLiveMonitorActions && (
                      <>
                        <button
                          type="button"
                          disabled
                          onClick={() => handleLiveCallMonitor('listen')}
                          className={liveActionButtonClass}
                          title="Прослушивание временно недоступно"
                        >
                          <Headphones className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled
                          onClick={() => handleLiveCallMonitor('whisper')}
                          className={liveActionButtonClass}
                          title="Режим суфлёра временно недоступен"
                        >
                          <Mic2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  <div className={`h-14 w-14 rounded-full flex items-center justify-center shadow-sm shrink-0 ${iconClass}`}>
                    {isIncomingLive ? <PhoneIncoming className="h-7 w-7" /> : isOutgoingLive ? <PhoneOutgoing className="h-7 w-7" /> : <PhoneCall className="h-7 w-7" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] font-black text-slate-900">
                      {title}
                      {isIncomingLive && <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />}
                    </div>
                    <div className="mt-1 flex items-center gap-2 min-w-0" title={display}>
                      <span className="text-xl font-black text-slate-950 truncate">
                        {cleanName || display}
                      </span>
                      {isSpamOrBlacklisted && (
                        <span className="shrink-0 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
                          СПАМ / ЧС
                        </span>
                      )}
                    </div>
                    {liveCallBanner.subtitle && (
                      <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-800">
                        <Phone className="h-4 w-4 text-cyan-500" />
                        <span>{liveCallBanner.subtitle}</span>
                      </div>
                    )}
                  </div></div>

                <div className="grid grid-cols-2 xl:grid-cols-6 flex-1 divide-x divide-slate-200">
                  <div className="px-6 py-4 flex flex-col justify-center">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Тип</span>
                    <span className={`mt-2 w-fit rounded-md border px-2 py-1 text-xs font-bold ${contactTypeClass}`}>{contactTypeLabel}</span></div>
                  <div className="px-6 py-4 flex flex-col justify-center min-w-0">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Справочник</span>
                    <span className="mt-2 text-sm font-black text-slate-900 truncate" title={display}>{cleanName}</span></div>
                  <div className="px-6 py-4 flex flex-col justify-center min-w-0">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Должность / комментарий</span>
                    <span className="mt-2 text-sm font-bold text-slate-900 truncate" title={position}>{position || '—'}</span></div>
                  <div className="px-6 py-4 flex flex-col justify-center">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{routeNumberLabel}</span>
                    <span className="mt-2 text-base font-black text-slate-950">{routeNumber || '—'}</span></div>
                  <div className="px-6 py-4 flex flex-col justify-center">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{endpointLabel}</span>
                    <span className="mt-2 text-base font-black text-slate-950">{endpointNumber || '—'}</span></div>
                  <div className="px-6 py-4 flex flex-col justify-center items-start xl:items-end">
                    <span className="text-sm font-black text-slate-900">{liveCallBanner.startedAt || ''}</span>
                    <span className="mt-2 text-[11px] uppercase tracking-wider font-bold text-slate-500">Длительность</span>
                    <span className="mt-1 text-base font-black text-slate-950 font-mono">{durationText}</span>
                    {liveTransferStatus && (
                      <span className="mt-2 max-w-[220px] text-right text-[11px] font-bold text-slate-500">{liveTransferStatus}</span>
                    )}
                  </div>
                </div></div>
            </div></div>
        );
      })()}

      {/* Main UI body section */}
      <main className="flex-1 overflow-y-auto w-full pl-[8px] pr-2 py-4 space-y-4">
        {dbWarning && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-900 p-4 rounded-xl flex items-start sm:items-center justify-between shadow-xs gap-3 animate-fade-in relative z-10">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-1.5 rounded-lg text-amber-700 shrink-0">
                <AlertCircle className="h-4.5 w-4.5" /></div>
              <div>
                <p className="text-xs font-semibold text-amber-900 leading-tight">База данных FreePBX недоступна</p>
                <p className="text-[11px] text-amber-700 font-light mt-0.5">
                  Причина: {dbWarning}. Подключен резервный буфер мониторинга.
                </p></div>
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
                directory={directoryLookup.length ? directoryLookup : directory}
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
                  <PhoneIncoming className="h-5 w-5 text-cyan-500 self-center" /></div>
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
                  <PhoneOutgoing className="h-5 w-5 text-indigo-500 self-center" /></div>
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
                  <Phone className="h-5 w-5 text-purple-500 self-center" /></div>
              </button>

              {/* Пропущенные */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'MISSED' ? 'ALL' : 'MISSED');
                  setPage(1);
                }}
                className={`text-left p-4 flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border hover:scale-[1.01] active:scale-[0.99] ${
                  statusFilter === 'MISSED'
                    ? 'bg-blue-50 border-red-400 ring-2 ring-red-500/30'
                    : 'bg-white border-blue-100'
                }`}
              >
                <span className="text-xs text-blue-600 font-bold tracking-wide">Пропущенные</span>
                <div className="mt-2 flex items-baseline justify-between w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-2xl font-bold text-blue-600 font-mono">{stats?.missedCalls ?? 0}</span>
                  )}
                  <PhoneMissed className="h-5 w-5 text-red-500/80 self-center" /></div>
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
                <div className="mt-2 flex items-center justify-between gap-2 w-full">
                  {isLoadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-2xl font-bold text-emerald-605 font-mono">{stats?.processedCalls ?? 0}</span>
                      <span className="whitespace-nowrap text-[10px] font-bold text-emerald-600">В SLA: {stats?.processedInSla ?? 0}</span>
                      <span className="whitespace-nowrap text-[10px] font-bold text-rose-600">Позже SLA: {stats?.processedLate ?? 0}</span>
                    </div>
                  )}
                  <CheckCircle className="h-5 w-5 text-emerald-500/80 self-center" /></div>
              </button>

              {/* Потерянные */}
              <button
                onClick={() => {
                  setStatusFilter(statusFilter === 'LOST' ? 'ALL' : 'LOST');
                  setPage(1);
                }}
                title="Потерянные = SLA истёк, а успешного контакта или обработки не было."
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
                  <XCircle className="h-5 w-5 text-amber-500/80 self-center" /></div>
              </button>
            </section>

        {/* Filters configuration section */}
        <section id="filters-bar" className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-xl p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              

              {/* SIP & My Calls filtering */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-[#334155]/80 p-1 px-2.5 rounded-lg select-none">
                <span className="text-[11px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Мой SIP:
                </span>
                <input
                  type="text"
                  value={(session.role === 'operator' || session.permissions?.own_calls_only === true) ? (session.extension || '') : myExt}
                  onChange={(e) => setMyExt(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="101"
                  maxLength={6}
                  disabled={session.role === 'operator'}
                  className="w-12 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 rounded py-0.5 px-1 text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-center disabled:bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 dark:disabled:bg-slate-800 disabled:text-slate-500"
                  title={session.role === 'operator' ? 'SIP-номер закреплён администратором' : 'Введите ваш добавочный номер.'}
                />
                <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(session.role === 'operator' || session.permissions?.own_calls_only === true) ? true : onlyMyCalls}
                    disabled={session.role === 'operator'}
                    onChange={(e) => {
                      setOnlyMyCalls(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded border-slate-300 dark:border-slate-600 text-red-655 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="text-[11px] font-bold text-slate-705 dark:text-slate-300">Мои звонки</span>
                </label></div>


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
                      ? 'bg-blue-50 text-red-750 font-bold'
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
                      ? 'bg-blue-50 text-red-750 font-bold'
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
                      ? 'bg-blue-50 text-red-750 font-bold'
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
                      ? 'bg-blue-50 text-red-750 font-bold'
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
                      className="bg-white border border-slate-200 rounded pl-6 pr-1.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-blue-500 w-[64px]"
                    /></div>
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
                      className="bg-white border border-slate-200 rounded pl-6 pr-1.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-blue-500 w-[64px]"
                    /></div>
                </div></div>
            </div>

            {/* Search querying */}
            <div className="flex-1 max-w-sm min-w-[200px] relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-light"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-red-950/20 transition-colors flex items-center justify-center text-sm font-bold cursor-pointer"
                  title="Очистить поиск"
                  aria-label="Очистить поиск"
                >
                  ×
                </button>
              )}
            </div>
            
            {/* Auto-refresh timer info & Reset Filters button combined */}
            <div className="flex items-center gap-2.5 text-xs text-slate-500 shrink-0 select-none">
              <div className="flex items-center gap-1 font-mono">
                <RefreshCw className="h-3.5 w-3.5 animate-spin-slow text-slate-400" />
                <span>Через {timeToNextRefresh}с</span></div>
              <button
                onClick={() => reloadData()}
                className="hover:text-blue-600 hover:bg-slate-200 bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 border border-slate-200 px-2.5 py-1.5 rounded-md cursor-pointer transition-all font-medium text-xs"
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
                  className="hover:bg-blue-50 bg-blue-50 border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded-md cursor-pointer transition-all font-semibold text-xs"
                  title="Сбросить все фильтры"
                >
                  Сбросить фильтры
                </button>
              )}
            </div></div>
        </section>

        {/* CDR LOG LIST */}
        <section id="cdr-log" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="overflow-x-auto min-h-[400px]">
            {isLoadingCalls ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-red-500" />
                <span className="text-xs text-slate-500 font-light">Чтение таблиц CDR базы Asterisk...</span></div>
            ) : callsError ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center font-sans bg-rose-50/40 border border-rose-100/70 rounded-xl m-6">
                <AlertCircle className="h-10 w-10 text-rose-500" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-800 leading-normal">Ошибка подключения к базе Asterisk/FreePBX</h3>
                  <p className="text-xs text-rose-600 max-w-lg font-light mt-1">
                    {callsError}
                  </p></div>
                <button 
                  type="button"
                  onClick={() => reloadData(page)} 
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
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
                </p></div>
            ) : (
              <>
                <LegacyCDRTable
                  calls={calls}
                  directory={directoryLookup.length ? directoryLookup : directory}
                  session={session}
                  copiedNumber={copiedNumber}
                  playingCallId={playingCallId}
                  isAudioPaused={isAudioPaused}
                  activeDropdownCallId={activeDropdownCallId}
                  handleCopy={handleCopy}
                  triggerClickToCall={triggerClickToCall}
                  openAddFromCall={openAddFromCall}
                  playRecording={playRecording}
                  openProcessModal={openProcessModal}
                  toggleRowDropdown={toggleRowDropdown}
                  fetchChronology={fetchChronology}
                  setActiveDropdownCallId={setActiveDropdownCallId}
                  formatSeconds={formatSeconds}
                />
              </>
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

      {activeView === 'directory' && directoryPageMode === 'personal_import' && (
        <section className="min-w-0 max-w-full space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 break-words text-lg font-black text-slate-900">
                  <Upload className="h-5 w-5 text-blue-600" />
                  Личный импорт контактов
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">Контакты будут импортированы только в ваш личный справочник.</p>
              </div>
              <button type="button" onClick={closeDirectoryImportPage} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Назад в справочник
              </button>
            </div>
          </div>
          {getPersonalContactImportUnavailableMessage() ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900 shadow-sm">
              {getPersonalContactImportUnavailableMessage()}
            </div>
          ) : renderPersonalContactImportPanel()}
        </section>
      )}

      {activeView === 'directory' && (directoryPageMode === 'contact_new' || directoryPageMode === 'contact_edit') && (
        <section className="mx-auto min-w-0 max-w-6xl space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 break-words text-lg font-black text-slate-900">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                  {directoryPageMode === 'contact_edit' ? 'Редактирование контакта' : 'Новый контакт'}
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                  {directoryPageMode === 'contact_edit' ? 'Обновите данные контакта в справочнике PBXPuls.' : 'Создайте контакт в справочнике PBXPuls.'}
                </p>
              </div>
              <button type="button" onClick={closeDirectoryContactFormPage} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Назад к справочнику
              </button>
            </div>
          </div>

          {directoryPageMode === 'contact_edit' && directoryContactEditId && !editingDirEntry ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              {isLoadingDirectory ? 'Загрузка контакта...' : 'Контакт не найден или недоступен для редактирования.'}
            </div>
          ) : (
            <form onSubmit={handleSaveDirEntry} className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm space-y-4">
              {dirError && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-600">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                  <span>{dirError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">
                  Сейчас показано полей: <span className="font-bold text-slate-800">{visibleDirectoryContactFormFields.length}</span>. Actions и ownerUserId в форму не выводятся.
                </div>
                <button
                  type="button"
                  onClick={() => setDirFormShowAllFields(value => !value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  {dirFormShowAllFields ? 'Скрыть дополнительные поля' : 'Показать все поля'}
                </button>
              </div>

              {renderDirectoryContactFormSection('Основное', ['type', 'fullName', 'phone'])}
              {renderDirectoryContactFormSection('Контакты', ['phone2', 'email', 'website'])}
              {renderDirectoryContactFormSection('Организация', ['organization', 'position', 'department', 'group'])}
              {renderDirectoryContactFormSection('Дополнительно', ['inn', 'kpp', 'ogrn', 'address', 'comment', 'tags', 'internalExtension', 'linkedExternalNumber', 'responsibleUserId'])}
              {renderDirectoryContactFormSection('Системные поля / видимость', ['visibility', 'isSpam'])}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                <button type="button" onClick={closeDirectoryContactFormPage} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800">Отмена</button>
                <button type="submit" disabled={isSavingDir} className="flex min-w-[90px] items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {isSavingDir && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Сохранить</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {activeView === 'directory' && directoryPageMode === 'import' && (
        <section className="min-w-0 max-w-full space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 break-words text-lg font-black text-slate-900">
                  <Upload className="h-5 w-5 text-blue-600" />
                  Админский CSV импорт
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                  Загрузите CSV-файл с контактами, проверьте обязательные поля, возможные ошибки и дубли перед сохранением. XLSX предусмотрен архитектурно, текущий импорт выполняется через CSV без новых зависимостей. Если visibility не заполнено, будет shared; если isSpam не заполнено, будет false. Телефон должен содержать от 2 до 11 цифр.
                </p>
              </div>
              <button type="button" onClick={closeDirectoryImportPage} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Назад в справочник
              </button>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-black text-slate-900">Поля файла</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr><th className="px-3 py-2">Поле</th><th className="px-3 py-2">CSV header</th><th className="px-3 py-2">Обязательность</th><th className="px-3 py-2">Пример</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ['Тип контакта', 'type', 'обязательно', 'client / supplier / government'],
                        ['Видимость', 'visibility', 'опционально, по умолчанию shared', 'shared — общий, private — личный'],
                        ['Спам', 'isSpam', 'опционально, по умолчанию false', 'true / false / 1 / 0 / yes / no / да / нет'],
                        ['Организация', 'organization', 'организация или ФИО', 'ООО Ромашка'],
                        ['ФИО', 'fullName', 'организация или ФИО', 'Иван Иванов'],
                        ['Должность', 'position', 'опционально', 'директор'],
                        ['Телефон', 'phone', 'телефон или email', '+79781234567; от 2 до 11 цифр'],
                        ['Доп. телефон', 'phone2', 'опционально', '365200000'],
                        ['Email', 'email', 'телефон или email', 'mail@example.com'],
                        ['Сайт', 'website', 'опционально', 'example.com'],
                        ['ИНН / КПП / ОГРН', 'inn, kpp, ogrn', 'опционально', '9102000000'],
                        ['Адрес', 'address', 'опционально', 'Симферополь'],
                        ['Комментарий', 'comment', 'опционально', 'источник контакта'],
                        ['Отдел / группа', 'department, group', 'опционально', 'Продажи'],
                        ['Теги', 'tags', 'опционально', 'VIP; тендер'],
                        ['Внутренний номер', 'internalExtension', 'опционально', '101'],
                        ['Связанный внешний номер', 'linkedExternalNumber', 'опционально', '7978...'],
                        ['Ответственный сотрудник', 'responsibleUserId', 'опционально', 'u1']
                      ].map(([label, header, required, example]) => (
                        <tr key={label}><td className="px-3 py-2 font-semibold text-slate-800">{label}</td><td className="px-3 py-2 font-mono">{header}</td><td className="px-3 py-2">{required}</td><td className="px-3 py-2">{example}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-slate-900">Пример CSV</h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[11px] text-slate-100">
                  <code className="whitespace-pre">type,visibility,isSpam,organization,fullName,position,phone,phone2,email,website,inn,kpp,ogrn,address,comment,department,group,tags,internalExtension,linkedExternalNumber,responsibleUserId{'\n'}client,shared,false,ООО Ромашка,Иван Иванов,директор,+79781234567,365200000,test@mail.ru,example.com,9102000000,910201001,1234567890123,Симферополь,обычный контакт,Продажи,Клиенты,"VIP; тендер",101,79781234567,u1{'\n'}supplier,private,false,ООО Личный,Петр Петров,менеджер,100,,private@mail.ru,,,,,Севастополь,личный контакт с внутренним номером,Закупки,Поставщики,личный,100,,{'\n'}government,shared,true,ФНС,Спам Контакт,,99999999999,,spam@mail.ru,,,,,Симферополь,спам-тест,Госорганы,Проверка,спам,,,</code>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-black text-slate-900">Загрузка файла</h3>
                {importFileError && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 break-words">{importFileError}</div>}
                {importSuccessCount !== null && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Контакты успешно импортированы: {importSuccessCount}</div>}
                <div className="relative rounded-xl border-2 border-dashed border-slate-200 p-5 text-center hover:border-blue-300">
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  <Upload className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                  <div className="text-xs font-bold text-slate-700">Загрузите CSV или TXT-файл с контактами</div>
                  <div className="mt-1 text-[11px] text-slate-500">CSV/XLSX: XLSX будет добавлен отдельным этапом, сейчас используйте CSV.</div>
                </div>
                <textarea value={importText} onChange={(e) => { setImportText(e.target.value); handleParseImport(e.target.value); }} rows={7} placeholder="Вставьте CSV сюда для предпросмотра" className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-800" />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={handlePreviewImport} disabled={isImporting || parsedImportEntries.length === 0} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Проверить ошибки и дубли</button>
                  <button type="button" onClick={handleExecuteImport} disabled={isImporting || parsedImportEntries.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Импортировать ({parsedImportEntries.length})</button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">Предпросмотр импорта</h3>
                  <span className="text-[11px] text-slate-500">Дубли: {importDuplicateCount}</span>
                </div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {parsedImportEntries.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-400">Нет данных для предпросмотра</div>
                  ) : parsedImportEntries.slice(0, 50).map((item, idx) => {
                    const preview = importPreviewRows.find((row: any) => row.index === idx);
                    const errors = [...(item._importErrors || []), ...(preview?.errors || [])];
                    return (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><div className="truncate font-bold text-slate-900">{item.name || item.company || 'Без имени'}</div><div className="truncate text-slate-500">{item.number || item.email || '—'}</div></div>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.type || 'client'}</span>
                        </div>
                        {errors.length > 0 && <div className="mt-2 text-[11px] text-rose-600">{errors.join('; ')}</div>}
                        {preview?.duplicateId && <div className="mt-2 text-[11px] text-amber-700">Найден возможный дубль: {preview.duplicateName}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeView === 'directory' && directoryPageMode === 'list' && (
        <>
          <section id="directory-panel" className="flex flex-col gap-4">
        {/* Admin Directory Controls Panel */}
        {isAdminRole(session?.role) && (
          <div className="order-last bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm select-none">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setIsAdminPanelExpanded(!isAdminPanelExpanded)}
            >
              <div className="flex items-center gap-2">
                <Sliders className="h-4.5 w-4.5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800 font-sans">Панель администратора справочника</h3>
                <span className="text-[11px] text-slate-400 font-normal">
                  ({isAdminPanelExpanded ? 'нажмите, чтобы свернуть' : 'нажмите, чтобы развернуть'})
                </span></div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-blue-100 text-red-750 font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                  Администратор
                </span>
                {isAdminPanelExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </div></div>

            {isAdminPanelExpanded && (
              <div className="space-y-3.5 pt-2 border-t border-slate-200">
                <p className="text-xs text-slate-550 font-light max-w-3xl leading-relaxed">
                  Управляйте справочником пакетно: импортируйте контакты из CSV/TXT файлов (скачайте шаблон ниже как образец структуры для Excel), экспортируйте полную базу данных справочника в формат CSV, или запустите глобальный процесс нормализации телефонных номеров по настроенным маскам.
                </p>

                <div className="flex flex-wrap gap-2.5">
                  {hasPermission('manage_directory_import') && (
                  <>
                  <button
                    onClick={openDirectoryImportPage}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-all active:scale-95 select-none"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    CSV импорт справочника
                  </button>

                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-blue-600 rounded-lg text-xs font-semibold cursor-pointer border border-blue-200 shadow-xs transition-all active:scale-95 select-none"
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
                  </>
                  )}
                </div>

                {/* Normalization result banner feedback */}
                {normalizedCount !== null && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-lg text-xs text-emerald-800 flex items-center justify-between font-sans shadow-inner animate-fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4.5 w-4.5 text-emerald-600" />
                      <span>
                        Нормализация успешно завершена! Проверены все записи в справочнике. Число измененных номеров: <strong>{normalizedCount}</strong>.
                      </span></div>
                    <button onClick={() => setNormalizedCount(null)} className="text-emerald-500 hover:text-emerald-700 text-sm font-semibold select-none cursor-pointer">
                      &times;
                    </button>
          </div>
                )}
              </div>
            )}
          </div>
        )}

        {dirNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-sm">
            {dirNotice}
          </div>
        )}

        {/* Directory toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex min-w-0 max-w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={dirSearchQuery}
                  onChange={(e) => {
                    setDirSearchQuery(e.target.value);
                    setDirPage(1);
                  }}
                  placeholder="Поиск по справочнику..."
                  className="w-full min-w-0 bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-light"
                />
              </div>

              <div className="flex min-w-0 max-w-full flex-wrap gap-2 md:flex-nowrap">
                <label className="sr-only" htmlFor="directory-type-filter">Тип</label>
                <select
                  id="directory-type-filter"
                  value={dirTypeFilter}
                  onChange={(e) => {
                    setDirTypeFilter(e.target.value as typeof dirTypeFilter);
                    setDirPage(1);
                  }}
                  className="h-9 min-w-[116px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  title="Тип контакта"
                >
                  <option value="all">Тип: Все</option>
                  <option value="client">Тип: Клиенты</option>
                  <option value="internal">Тип: Внутренние</option>
                  <option value="supplier">Тип: Поставщики</option>
                  <option value="government">Тип: Госорганы</option>
                </select>

                <label className="sr-only" htmlFor="directory-spam-filter">Спам</label>
                <select
                  id="directory-spam-filter"
                  value={dirSpamMode}
                  onChange={(e) => {
                    setDirSpamMode(e.target.value as typeof dirSpamMode);
                    setDirPage(1);
                  }}
                  className="h-9 min-w-[130px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  title="Спам"
                >
                  <option value="all">Спам: Все</option>
                  <option value="exclude_spam">Спам: Без спама</option>
                  <option value="only_spam">Спам: Только спам</option>
                </select>

                <label className="sr-only" htmlFor="directory-visibility-filter">Видимость</label>
                <select
                  id="directory-visibility-filter"
                  value={dirVisibilityMode}
                  onChange={(e) => {
                    setDirVisibilityMode(e.target.value as typeof dirVisibilityMode);
                    setDirPage(1);
                  }}
                  className="h-9 min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  title="Видимость"
                >
                  <option value="all">Видимость: {isAdminRole(session?.role) ? 'Все' : 'Все доступные'}</option>
                  <option value="shared_only">Видимость: Общие</option>
                  {isAdminRole(session?.role) && <option value="private_only">Видимость: Все личные</option>}
                  <option value="my_private_only">Видимость: Мои личные</option>
                  <option value="exclude_private">Видимость: Исключить личные</option>
                  <option value="exclude_shared">Видимость: Исключить общие</option>
                </select>
              </div>
            </div>

            {canOpenPersonalContactImport() && (
              <button
                type="button"
                onClick={openPersonalContactImportPage}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-700 shadow-sm transition-all hover:bg-blue-50"
              >
                <Upload className="h-4 w-4" />
                Импорт контактов
              </button>
            )}

            <CallTargetSelector
              mode="meeting"
              token={session?.token || ''}
              currentExtension={myExt}
              disabled={selectedMeetingContactIds.length === 0}
              buttonClassName="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 shadow-sm transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              triggerLabel={`Совещание${selectedMeetingContactIds.length ? ` (${selectedMeetingContactIds.length})` : ''}`}
              backendStatus={conferenceBackendStatus}
              initialTargets={selectedMeetingTargets}
              onUnauthorized={handleAuthError}
            />

            <button
              type="button"
              onClick={() => {
                setDraftDirectoryVisibleColumns(selectedDirectoryVisibleColumns);
                setIsDirectoryColumnsPanelOpen(open => !open);
              }}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              <Sliders className="h-4 w-4" />
              Настроить столбцы
            </button>

            <button
              type="button"
              onClick={openCreateDirEntry}
              className="flex shrink-0 items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-600 transition-all select-none shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Добавить контакт
            </button>
          </div>
        </div>

        {isDirectoryColumnsPanelOpen && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900">Столбцы таблицы</h3>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                  Выберите дополнительные поля и задайте порядок столбцов. Экспорт CSV выгружает полный набор полей, даже если часть столбцов скрыта или изменен порядок таблицы.
                </p>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  Текущий источник столбцов: {getDirectoryColumnSettingsSourceLabel(directoryColumnSettingsSource)}.
                </p>
                {directoryColumnSettingsStatus && (
                  <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">
                    {directoryColumnSettingsStatus}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Показывать столбцы</div>
                <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Обязательные столбцы</div>
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                    {requiredDirectoryColumnConfigs.map(column => (
                      <label key={column.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                        <input type="checkbox" checked readOnly disabled className="h-3.5 w-3.5 shrink-0 rounded border-slate-300" />
                        <span className="min-w-0 truncate">{column.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">Действия всегда отображаются справа.</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Дополнительные столбцы</div>
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    {optionalDirectoryColumns.map(column => (
                      <label key={column.key} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={draftDirectoryVisibleColumns.includes(column.key as DirectoryOptionalColumnKey)}
                          onChange={() => toggleDraftDirectoryColumn(column.key as DirectoryOptionalColumnKey)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="min-w-0 truncate">{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Порядок столбцов</div>
                <p className="mb-3 text-[11px] leading-relaxed text-slate-500">Перетащите столбцы или используйте кнопки вверх/вниз. Действия нельзя переместить: они всегда справа.</p>
                <div className="space-y-2">
                  {draftDirectoryOrderConfigs.map((column, index) => (
                    <div
                      key={column.key}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', column.key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceKey = event.dataTransfer.getData('text/plain') as DirectoryVisibleColumnKey;
                        moveDraftDirectoryColumnTo(sourceKey, column.key as DirectoryVisibleColumnKey);
                      }}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                    >
                      <span className="shrink-0 cursor-grab text-base font-black leading-none text-slate-400" title="Перетащите столбец">≡</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{column.label}</span>
                      {requiredDirectoryColumns.includes(column.key as DirectoryRequiredColumnKey) && (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">обязательный</span>
                      )}
                      <button
                        type="button"
                        onClick={() => moveDraftDirectoryColumn(column.key as DirectoryVisibleColumnKey, -1)}
                        disabled={index === 0}
                        className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Переместить выше"
                      >
                        Вверх
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDraftDirectoryColumn(column.key as DirectoryVisibleColumnKey, 1)}
                        disabled={index === draftDirectoryOrderConfigs.length - 1}
                        className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Переместить ниже"
                      >
                        Вниз
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {canManageGlobalDirectoryColumns && (
                <>
                  <button
                    type="button"
                    onClick={saveGlobalDirectoryColumnSettingsForAll}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    Сохранить как базовые для всех
                  </button>
                  <button
                    type="button"
                    onClick={resetGlobalDirectoryColumnSettingsForAll}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    Сбросить базовые
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={resetDirectoryColumnSettings}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Сбросить мои настройки
              </button>
              <button
                type="button"
                onClick={saveDirectoryColumnSettings}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
              >
                Сохранить мои настройки
              </button>
            </div>
          </div>
        )}

        {/* List Table of directory entries */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-xs text-slate-500">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th scope="col" className="w-10 py-2 px-3">
                    <input
                      type="checkbox"
                      aria-label="Выбрать контакты на странице"
                      checked={directory.length > 0 && directory.every(entry => selectedMeetingContactIds.includes(entry.id))}
                      onChange={event => setSelectedMeetingContactIds(current => event.target.checked
                        ? Array.from(new Set([...current, ...directory.map(entry => entry.id)]))
                        : current.filter(id => !directory.some(entry => entry.id === id)))}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  {effectiveDirectoryColumnConfigs.map(column => (
                    <th key={column.key} scope="col" className={`py-2 px-3 ${column.className || ''}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const list = Array.isArray(directory) ? directory : [];
                  const emptyText = dirSearchQuery.trim() ? 'По запросу ничего не найдено' : 'Контакты не найдены';

                  if (dirListError) {
                    return (
                      <tr>
                        <td colSpan={effectiveDirectoryColumnConfigs.length + 1} className="py-8 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="font-bold text-slate-600">{dirListError}</div>
                            <button type="button" onClick={() => loadDirectory(dirPage)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Повторить</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={effectiveDirectoryColumnConfigs.length + 1} className="py-8 text-center text-slate-400">
                          {isLoadingDirectory ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                              <span>Загрузка данных справочника...</span>
                            </div>
                          ) : (
                            emptyText
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return list.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="w-10 py-3.5 px-3 align-top">
                        <input
                          type="checkbox"
                          aria-label={`Выбрать ${entry.name || entry.company || entry.number || 'контакт'}`}
                          checked={selectedMeetingContactIds.includes(entry.id)}
                          onChange={() => setSelectedMeetingContactIds(current => current.includes(entry.id)
                            ? current.filter(id => id !== entry.id)
                            : [...current, entry.id])}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      {effectiveDirectoryColumnConfigs.map(column => (
                        <td key={column.key} className={`py-3.5 px-3 align-top ${column.key === 'actions' ? 'text-right' : 'text-slate-700'}`}>
                          {renderDirectoryCell(entry, column.key)}
                        </td>
                      ))}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-semibold">
              Страница {dirPage} из {dirTotalPages}. Всего контактов: {dirTotal.toLocaleString('ru-RU')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-500">
                Показано {dirTotal === 0 ? 0 : ((dirPage - 1) * dirPageSize) + 1}-{Math.min(dirPage * dirPageSize, dirTotal)} из {dirTotal.toLocaleString('ru-RU')}
              </span>
              <button
                type="button"
                onClick={() => setDirPage(prev => Math.max(1, prev - 1))}
                disabled={isLoadingDirectory || dirPage <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Назад
              </button>
              <button
                type="button"
                onClick={() => setDirPage(prev => Math.min(dirTotalPages, prev + 1))}
                disabled={isLoadingDirectory || dirPage >= dirTotalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Вперед
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

    {activeView === 'reports' && renderReportsView()}

    {activeView === 'marketing' && hasPermission('view_marketing') && <MarketingTab />}

    {activeView === 'monitoring' && hasPermission('view_monitoring') && renderMonitoringView()}

    {activeView === 'management' && (
      <ProvisioningCenter session={session} hasPermission={hasPermission} />
    )}

    {activeView === 'balance' && (
      <Suspense fallback={<div className="p-8 text-center text-slate-500 font-bold bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">Загрузка модуля баланса...</div>}>
        <BalanceCenter session={session} hasPermission={hasPermission} />
      </Suspense>
    )}

    {activeView === 'scripts' && hasPermission('view_scripts') && (
      <ScriptsTab session={session} hasPermission={hasPermission} />
    )}

    {activeView === 'ai-assistant' && hasPermission('view_ai_assistant') && (
      <AiAssistantTab session={session} hasPermission={hasPermission} />
    )}


      {/* SYSTEM SETTINGS FULL PAGE */}
      {activeView === 'settings' && (
        <section className="min-w-0 max-w-full space-y-4">
          <div className="w-full min-w-0 max-w-full bg-white border border-slate-200 rounded-2xl shadow-sm relative min-h-[calc(100vh-150px)] flex flex-col overflow-hidden font-sans">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6 pb-4 shrink-0 bg-slate-50">
              <div className="flex min-w-0 items-center gap-2">
                <Settings className="h-6 w-6 shrink-0 text-blue-600 animate-spin-slow" />
                <h3 className="min-w-0 break-words text-base font-black text-slate-905">Настройки системы</h3></div>
              <button
                type="button"
                onClick={() => { setActiveView('management'); setDbTestResult(null); resetUserForm(); }}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Назад
              </button>
          </div>

            <div className="min-w-0 max-w-full p-6 pb-2 border-b border-slate-200 bg-slate-50/50 shrink-0">
              <div className="flex min-w-0 max-w-full flex-wrap gap-1.5 p-1 bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 rounded-xl">
                {Object.entries({
                  ...(isAdminRole(session?.role) ? {
                    pbx: 'Настройки АТС',
                    directory: 'Телефонный справочник',
                    access: 'Доступ и пользователи',
                    permissions: 'Права доступа',
                  } : {}),
                  ...(session?.role === 'su' ? {
                    design: 'Дизайн',
                  } : {}),
                  appearance: 'Интерфейс'
                }).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSettingsTab(tab as any)}
                    className={`min-w-0 flex-1 break-words py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      settingsTab === tab
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div></div>

            {draftSettings || !isAdminRole(session?.role) ? (
              <form onSubmit={handleSaveSettings} className="flex-1 flex min-w-0 max-w-full flex-col min-h-0">
                <div className="flex-1 min-w-0 max-w-full p-6 space-y-5 bg-white">
                  {settingsTab === 'pbx' && draftSettings && (
                    <div className="min-w-0 max-w-full space-y-5">
                      <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex min-w-0 flex-col flex-wrap items-stretch justify-between gap-3 border-b border-slate-200 pb-2 sm:flex-row sm:items-center">
                          <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900">
                            <Database className="h-4 w-4 text-blue-600" />
                            MariaDB / FreePBX CDR
                          </h4>
                          <button
                            type="button"
                            onClick={testDbConnection}
                            disabled={isTestingDb}
                            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-transform hover:bg-slate-100 active:scale-95 cursor-pointer"
                          >
                            {isTestingDb && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                            Проверить MariaDB
                          </button>
          </div>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">Хост MariaDB<input type="text" value={draftSettings.dbHost} onChange={(e) => setDraftSettings({ ...draftSettings, dbHost: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" required /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Порт<input type="number" value={draftSettings.dbPort} onChange={(e) => setDraftSettings({ ...draftSettings, dbPort: parseInt(e.target.value, 10) || 3306 })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" required /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">База<input type="text" value={draftSettings.dbName} onChange={(e) => setDraftSettings({ ...draftSettings, dbName: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" required /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Пользователь<input type="text" value={draftSettings.dbUser} onChange={(e) => setDraftSettings({ ...draftSettings, dbUser: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" required /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Пар��ль<input type="password" value={draftSettings.dbPass} onChange={(e) => setDraftSettings({ ...draftSettings, dbPass: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label></div>
                        {dbTestResult && (
                          <div className={`mt-3 p-3.5 border rounded-lg text-xs flex items-start gap-2 ${dbTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                            <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${dbTestResult.success ? 'text-emerald-600' : 'text-blue-600'}`} />
                            <span>{dbTestResult.message}</span></div>
                        )}
                      </div>
                      <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex min-w-0 flex-col flex-wrap items-stretch justify-between gap-3 border-b border-slate-200 pb-2 sm:flex-row sm:items-center">
                          <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900">
                            <Phone className="h-4 w-4 text-blue-600" />
                            AMI / Click2Call
                          </h4>
                          <button
                            type="button"
                            onClick={testAmiConnection}
                            disabled={isTestingAmi}
                            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-transform hover:bg-slate-100 active:scale-95 cursor-pointer"
                          >
                            {isTestingAmi && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                            Проверить AMI
                          </button>
          </div>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">Хост AMI<input type="text" value={draftSettings.amiHost || ''} onChange={(e) => setDraftSettings({ ...draftSettings, amiHost: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Порт<input type="number" value={draftSettings.amiPort ?? 5038} onChange={(e) => setDraftSettings({ ...draftSettings, amiPort: parseInt(e.target.value, 10) || 5038 })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Контекст<input type="text" value={draftSettings.amiContext || 'from-internal'} onChange={(e) => setDraftSettings({ ...draftSettings, amiContext: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label>
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">AMI User<input type="text" value={draftSettings.amiUser || ''} onChange={(e) => setDraftSettings({ ...draftSettings, amiUser: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label>
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">AMI Secret<input type="password" value={draftSettings.amiPass || ''} onChange={(e) => setDraftSettings({ ...draftSettings, amiPass: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label></div>
                        {amiTestResult && (
                          <div className={`mt-3 p-3.5 border rounded-lg text-xs flex items-start gap-2 ${amiTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                            <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${amiTestResult.success ? 'text-emerald-600' : 'text-blue-600'}`} />
                            <span>{amiTestResult.message}</span></div>
                        )}
                      </div>
                      <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="mb-3 flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900"><Clock className="h-4 w-4 shrink-0 text-blue-600" />Записи и KPI</h4>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">Путь к записям<input type="text" value={draftSettings.recordingsPath} onChange={(e) => setDraftSettings({ ...draftSettings, recordingsPath: e.target.value })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" required /></label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Legacy KPI автообработки, мин<input type="number" min={1} max={1440} value={draftSettings.callbackKpiMinutes ?? 60} onChange={(e) => setDraftSettings({ ...draftSettings, callbackKpiMinutes: parseInt(e.target.value, 10) || 60 })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" /></label></div>
                      </div>

                      <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="mb-3 flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900"><ShieldCheck className="h-4 w-4 shrink-0 text-purple-600" />Качество звонков и лидов</h4>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">SLA ответа на входящий звонок, секунд
                            <input type="number" min={5} max={300} value={draftSettings.answerSlaSeconds ?? 20} onChange={(e) => setDraftSettings({ ...draftSettings, answerSlaSeconds: Math.max(5, Math.min(300, parseInt(e.target.value, 10) || 20)) })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" />
                            <span className="mt-1 block max-w-full break-words whitespace-normal text-[11px] font-medium leading-relaxed text-slate-500">За сколько секунд входящий звонок должен быть принят.</span>
                          </label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">SLA перезвона по пропущенному звонку, часов
                            <input type="number" min={1} max={168} value={draftSettings.missedCallCallbackSlaHours ?? 24} onChange={(e) => setDraftSettings({ ...draftSettings, missedCallCallbackSlaHours: Math.max(1, Math.min(168, parseInt(e.target.value, 10) || 24)) })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" />
                            <span className="mt-1 block max-w-full break-words whitespace-normal text-[11px] font-medium leading-relaxed text-slate-500">Если по пропущенному звонку перезвонили в течение этого времени, лид считается спасенным.</span>
                          </label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Окно сопоставления клика с CDR, минут
                            <input type="number" min={1} max={240} value={draftSettings.calltrackingMatchWindowMinutes ?? 30} onChange={(e) => setDraftSettings({ ...draftSettings, calltrackingMatchWindowMinutes: Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 30)) })} className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" />
                            <span className="mt-1 block max-w-full break-words whitespace-normal text-[11px] font-medium leading-relaxed text-slate-500">Сколько минут после клика по телефону PBXPuls ищет звонок в CDR. Это техническое окно атрибуции, не SLA.</span>
                          </label>
                        </div>
                      </div>
                      
                      <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex min-w-0 flex-col flex-wrap items-stretch justify-between gap-3 border-b border-slate-200 pb-2 sm:flex-row sm:items-center">
                          <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900">
                            <Cpu className="h-4 w-4 text-emerald-600" />
                            FreePBX REST API
                          </h4>
                          <button
                            type="button"
                            onClick={testFreePBXApiConnection}
                            disabled={isTestingFreePBXApi}
                            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-transform hover:bg-slate-100 active:scale-95 cursor-pointer animate-pulse-once"
                          >
                            {isTestingFreePBXApi && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                            Проверить FreePBX API
                          </button>
                        </div>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">URL FreePBX REST API
                            <input 
                              type="text" 
                              placeholder="http://your-freepbx/admin/api" 
                              value={draftSettings.freepbxApiUrl || ''} 
                              onChange={(e) => setDraftSettings({ ...draftSettings, freepbxApiUrl: e.target.value })} 
                              className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" 
                            />
                          </label>
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">Client ID
                            <input 
                              type="text" 
                              value={draftSettings.freepbxApiClientId || ''} 
                              onChange={(e) => setDraftSettings({ ...draftSettings, freepbxApiClientId: e.target.value })} 
                              className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" 
                            />
                          </label>
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">Client Secret
                            <input 
                              type="password" 
                              value={draftSettings.freepbxApiClientSecret || ''} 
                              onChange={(e) => setDraftSettings({ ...draftSettings, freepbxApiClientSecret: e.target.value })} 
                              className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" 
                            />
                          </label>
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">API Token / API Key
                            <input 
                              type="password" 
                              value={draftSettings.freepbxApiToken || ''} 
                              onChange={(e) => setDraftSettings({ ...draftSettings, freepbxApiToken: e.target.value })} 
                              className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" 
                            />
                          </label>
                          <label className="min-w-0 max-w-full break-words md:col-span-2 text-xs font-bold text-slate-600">Источник extensions
                            <select
                              value={draftSettings.freepbxExtensionProvider || 'auto'}
                              onChange={(e) => setDraftSettings({ ...draftSettings, freepbxExtensionProvider: e.target.value as AppSettings['freepbxExtensionProvider'] })}
                              className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                            >
                              <option value="auto">Auto</option>
                              <option value="bmo">BMO local</option>
                              <option value="graphql">GraphQL API</option>
                              <option value="database">Database readonly</option>
                              <option value="legacy-rest">Legacy REST</option>
                            </select>
                            <span className="mt-1 block max-w-full break-words whitespace-normal text-[11px] font-medium leading-relaxed text-slate-500">Для FreePBX 17 рекомендуется GraphQL API. Для локальной установки FreePBX 15/16 используйте Auto/BMO. Если API недоступен, можно использовать Database readonly.</span>
                          </label>
                        </div>
                        {freepbxApiTestResult && (
                          <div className={`mt-3 p-3.5 border rounded-lg text-xs flex items-start gap-2 ${freepbxApiTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                            <AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${freepbxApiTestResult.success ? 'text-emerald-600' : 'text-blue-600'}`} />
                            <span>{freepbxApiTestResult.message}</span>
                          </div>
                        )}
                      </div></div>
                  )}
                  {settingsTab === 'directory' && draftSettings && (
                    <div className="space-y-5">
                      <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-600" />Настройки</h4>
                        <div className="space-y-3 text-xs text-slate-700">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, normEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Включить нормализацию</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normStripSymbols ?? true} disabled={draftSettings.normDigitsOnly ?? false} onChange={(e) => setDraftSettings({ ...draftSettings, normStripSymbols: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Удалять спецсимволы</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normReplace8With7 ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, normReplace8With7: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Заменять 8 на 7</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={draftSettings.normDigitsOnly ?? false} onChange={(e) => setDraftSettings({ ...draftSettings, normDigitsOnly: e.target.checked, normStripSymbols: e.target.checked ? false : (draftSettings.normStripSymbols ?? true) })} className="rounded border-slate-300 text-blue-600" />Только цифры</label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draftSettings.directorySyncAsteriskBlacklist ?? false}
                              onChange={(e) => setDraftSettings({ ...draftSettings, directorySyncAsteriskBlacklist: e.target.checked })}
                              className="rounded border-slate-300 text-blue-600"
                            />
                            Синхронизировать ЧС с Asterisk AstDB blacklist
                          </label></div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Upload className="h-4 w-4 text-blue-600" />Настройки импорта</h4>
                        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">Эти настройки только разрешают или запрещают источники импорта. Личные подключения пользователей находятся в Справочник → Импорт контактов.</p>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 md:grid-cols-2">
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={draftSettings.directoryImportEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Импорт справочника по ссылке</label>
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={draftSettings.googleImportEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, googleImportEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Google Contacts import</label>
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={draftSettings.fileImportEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, fileImportEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600" />CSV/vCard import</label>
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={draftSettings.yandexCarddavEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, yandexCarddavEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Yandex advanced import</label>
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={draftSettings.mailruCarddavEnabled ?? true} onChange={(e) => setDraftSettings({ ...draftSettings, mailruCarddavEnabled: e.target.checked })} className="rounded border-slate-300 text-blue-600" />Mail.ru advanced import</label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-blue-600" />Импорт справочника по ссылке</h4>
                        <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="min-w-0 max-w-full break-words md:col-span-4 text-xs font-bold text-slate-600">URL файла CSV/JSON
                            <input type="text" value={draftSettings.directoryImportUrl || ''} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportUrl: e.target.value })} placeholder="https://site.ru/contacts.csv" className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900" />
                          </label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Формат
                            <select value={draftSettings.directoryImportFormat || 'csv'} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportFormat: e.target.value as any })} className="mt-1 w-full min-w-0 max-w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs">
                              <option value="csv">CSV</option>
                              <option value="json">JSON</option>
                            </select>
                          </label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Режим
                            <select value={draftSettings.directoryImportMode || 'upsert'} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportMode: e.target.value as any })} className="mt-1 w-full min-w-0 max-w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs">
                              <option value="upsert">Обновлять/добавлять</option>
                              <option value="append">Только добавить</option>
                              <option value="overwrite">Полностью заменить</option>
                            </select>
                          </label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Период
                            <select value={draftSettings.directoryImportSchedule || 'manual'} onChange={(e) => setDraftSettings({ ...draftSettings, directoryImportSchedule: e.target.value as any })} className="mt-1 w-full min-w-0 max-w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs">
                              <option value="manual">Только вручную</option>
                              <option value="hourly">Каждый час</option>
                              <option value="daily">Каждый день</option>
                              <option value="weekly">Раз в неделю</option>
                            </select>
                          </label>
                          <label className="min-w-0 max-w-full break-words text-xs font-bold text-slate-600">Sync token для cron
                            <input type="text" readOnly value={draftSettings.directorySyncToken || ''} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 font-mono" />
                          </label></div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {hasPermission('manage_directory_import') && (
                          <button type="button" onClick={handleTestUrlImport} disabled={isTestingUrlImport || draftSettings.directoryImportEnabled === false} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">{isTestingUrlImport ? 'Проверка...' : 'Проверить ссылку'}</button>
                          )}
                          {hasPermission('manage_directory_import') && (
                          <button type="button" onClick={handleSyncDirectoryUrl} disabled={isSyncingDirectoryUrl || draftSettings.directoryImportEnabled === false} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50">{isSyncingDirectoryUrl ? 'Синхронизация...' : 'Синхронизировать сейчас'}</button>
                          )}
                        </div>
                        <div className="mt-3 text-[11px] text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 overflow-x-auto">
                          Cron: curl -s -X POST http://127.0.0.1:3000/api/directory/sync-url -H "X-Sync-Token: {draftSettings.directorySyncToken || 'TOKEN'}"
                        </div>
                        {urlImportTestResult && (
                          <div className={`mt-3 p-3 rounded-lg border text-xs font-bold ${urlImportTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>{urlImportTestResult.message}</div>
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
                          {hasPermission('manage_directory_import') && (
                          <button type="button" onClick={openDirectoryImportPage} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">CSV импорт справочника</button>
                          )}
                          {hasPermission('manage_directory_import') && (
                          <button type="button" onClick={handleExportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 text-slate-800 text-xs font-bold hover:bg-slate-200">Экспорт CSV</button>
                          )}
                          {hasPermission('manage_directory_import') && (
                          <button type="button" onClick={handleNormalizeDirectoryDb} disabled={isNormalizingDb} className="px-4 py-2 rounded-lg bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 text-slate-800 text-xs font-bold hover:bg-slate-200 disabled:opacity-50">Нормализовать базу</button>
                          )}
                        </div>
                        {normalizedCount !== null && <div className="mt-3 text-xs text-emerald-700 font-bold">Обновлено записей: {normalizedCount}</div>}
                      </div></div>
                  )}
                  {settingsTab === 'access' && (
                    <AccessUsersTab
                      accessUsers={accessUsers}
                      accessError={accessError}
                      editingUserId={editingUserId}
                      userForm={userForm}
                      isSavingUser={isSavingUser}
                      setUserForm={setUserForm}
                      openEditUser={openEditUser}
                      deleteAccessUser={deleteAccessUser}
                      saveAccessUser={saveAccessUser}
                      resetUserForm={resetUserForm}
                      roles={roles}
                    />
                  )}
                  
                  {settingsTab === 'permissions' && session?.role === 'su' && draftSettings && (
                    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="text-sm font-black text-blue-800">Управление привилегиями SU</div>
                      <p className="mt-1 text-xs text-blue-700">
                        Эти параметры управляют тем, что администратор видит и может менять в матрице доступа.
                      </p>

                      <div className="mt-3 grid gap-2 text-xs font-bold text-blue-900">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draftSettings.showSuRoleToAdmin === true}
                            onChange={(e) => setDraftSettings({ ...draftSettings, showSuRoleToAdmin: e.target.checked })}
                            className="rounded border-blue-300 text-blue-600"
                          />
                          Показывать роль SU администраторам
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draftSettings.showSuPermissionsToAdmin === true}
                            onChange={(e) => setDraftSettings({ ...draftSettings, showSuPermissionsToAdmin: e.target.checked })}
                            className="rounded border-blue-300 text-blue-600"
                          />
                          Показывать служебные SU-права администраторам
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draftSettings.allowAdminEditSuPermissions === true}
                            disabled={draftSettings.showSuPermissionsToAdmin !== true}
                            onChange={(e) => setDraftSettings({ ...draftSettings, allowAdminEditSuPermissions: e.target.checked })}
                            className="rounded border-blue-300 text-blue-600 disabled:opacity-40"
                          />
                          Разрешить администраторам изменять служебные SU-права
                        </label></div>
                    </div>
                  )}

{settingsTab === 'permissions' && (
                    <PermissionsMatrixTab
                      roles={roles}
                      isLoadingRoles={isLoadingRoles}
                      isSavingRoles={isSavingRoles}
                      onRolesChange={setRoles}
                      onSaveRoles={saveRoles}
                      isSu={session?.role === 'su'}
                      showSuPermissionsToAdmin={settings?.showSuPermissionsToAdmin === true}
                      allowAdminEditSuPermissions={settings?.allowAdminEditSuPermissions === true}
                    />
                  )}
                  {settingsTab === 'design' && session?.role === 'su' && draftSettings && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                      <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900">
                        <Palette className="h-4 w-4 text-blue-600" />
                        Брендирование и дизайн системы
                      </h4>
                      <p className="text-xs text-slate-500">
                        Настройте логотип и копирайт для всей системы (доступно только пользователю su).
                      </p>

                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Ссылка на логотип (изображение или SVG)
                          </label>
                          <div className="flex gap-3 items-center">
                            <input
                              type="text"
                              value={draftSettings.customLogoUrl || ''}
                              onChange={(e) => setDraftSettings({ ...draftSettings, customLogoUrl: e.target.value })}
                              placeholder="Например: /freepbx-cdr-logo.svg или URL"
                              className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
                            />
                            <div className="h-10 w-10 flex items-center justify-center bg-white border border-slate-200 rounded-lg p-1 shrink-0 overflow-hidden">
                              <Logo3D className="h-8 w-8 max-h-full max-w-full object-contain" logoUrl={draftSettings.customLogoUrl || '/freepbx-cdr-logo.svg'} />
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Оставьте пустым, чтобы использовать стандартный логотип PBXPULS.
                          </span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Копирайт в подвале (footer)
                          </label>
                          <textarea
                            value={draftSettings.customCopyright || ''}
                            onChange={(e) => setDraftSettings({ ...draftSettings, customCopyright: e.target.value })}
                            placeholder="Например: © 2026 МояКомпания. Все права защищены."
                            rows={2}
                            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-sans focus:border-blue-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Оставьте пустым для отображения стандартного копирайта ИП Грунин К.В.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === 'appearance' && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                      <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-black text-slate-900">
                        <Sliders className="h-4 w-4 text-blue-600" />
                        Настройки интерфейса и темы
                      </h4>
                      <p className="text-xs text-slate-500">
                        Настройте внешний вид панели управления звонками. Параметры сохраняются локально.
                      </p>
                      
                      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">Тёмная тема</span>
                          <span className="text-[11px] text-slate-500">Включить ночной режим во всей системе</span></div>
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
                  {dbTestResult && (<div className={`p-3.5 border rounded-lg text-xs flex items-start gap-2 ${dbTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}><AlertCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${dbTestResult.success ? 'text-emerald-600' : 'text-blue-600'}`} /><span>{dbTestResult.message}</span></div>)}
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-6 pt-4 border-t border-slate-200 bg-slate-50 shrink-0">
                  {isAdminRole(session?.role) ? (
                    <>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => { setIsSettingsOpen(false); setDbTestResult(null); resetUserForm(); }} className="text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg cursor-pointer transition-colors">
                          Отмена
                        </button>
                        <button type="submit" disabled={isSavingSettings} className="bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
                          Сохранить настройки
                        </button>
          </div>
                    </>
                  ) : (
                    <div className="w-full flex justify-end">
                      <button type="button" onClick={() => { setIsSettingsOpen(false); }} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer">
                        Закрыть
                      </button>
          </div>
                  )}
                </div>
              </form>
            ) : (<div className="p-10 flex justify-center border-t border-slate-200"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>)}
          </div>
        </section>
      )}

      {activeView === 'about' && (
        <AboutSystemTab currentVersion={packageJson.version} onNavigate={setActiveView} />
      )}

  </main>

      <footer className="border-t border-slate-200 bg-white py-3 text-center text-[11px] text-slate-500">
        {settings?.customCopyright || publicSettings?.customCopyright || "© 2026 PBXPULS. Все права защищены. Грунин К.В. ИНН 9102057404."}
        <a href="https://grunin.org" target="_blank" rel="noopener noreferrer" className="mx-1 text-slate-700 hover:text-blue-600 underline">grunin.org</a>
        Внедрение, разработка и поддержка VOIP-проектов •
        <a href="tel:+79787437943" className="ml-1 text-slate-700 hover:text-blue-600 underline">+7 (978) 743-79-43</a>
      </footer>

      {/* FOOTER RECORD PLAYER CONTROL SLIDE OVERLAY */}
      {playingRecording && (
        <footer className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] w-[1100px] max-w-[calc(100vw-30px)] bg-white border border-blue-200 rounded-2xl py-3.5 px-4 shadow-2xl">
          <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3.5">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-100 text-blue-600 shadow-xs">
                <Volume2 className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1 md:flex-none">
                <div className="text-xs font-semibold text-slate-800 truncate max-w-md" title={playingRecording}>
                  {playingRecording}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {hasPermission('listen_recordings') && (
                    <a href={`/api/recordings/${encodeURIComponent(playingRecording)}?token=${encodeURIComponent(session?.token || '')}`} download={playingRecording} className="text-[10px] text-blue-600 hover:text-blue-700 underline underline-offset-2">Скачать запись</a>
                  )}
                </div></div>
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
                className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-transform active:scale-95 cursor-pointer flex items-center justify-center shrink-0 shadow"
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
                className="w-full h-1.5 bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 border border-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
              />

              <span className="text-[10px] text-slate-500 font-mono shrink-0 w-8">
                {formatSeconds(Math.floor(audioDuration))}
              </span></div>

            {/* Speed adjustments */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={() => changeSpeed(1)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1 ? 'bg-blue-50 border border-blue-200 text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.0x
                </button>
                <button
                  onClick={() => changeSpeed(1.25)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1.25 ? 'bg-blue-50 border border-blue-200 text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.25x
                </button>
                <button
                  onClick={() => changeSpeed(1.5)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 1.5 ? 'bg-blue-50 border border-blue-200 text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1.5x
                </button>
                <button
                  onClick={() => changeSpeed(2)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                    playbackSpeed === 2 ? 'bg-blue-50 border border-blue-200 text-blue-600' : 'text-slate-500 hover:text-slate-800'
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
                  className="w-16 h-1 bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 hover:bg-slate-200 border border-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                /></div>

              <div className="h-6 w-[1px] bg-slate-200" />
              
              <button
                onClick={() => {
                  setPlayingRecording(null);
                  setPlayingCallId(null);
                  if (audioRef.current) audioRef.current.pause();
                }}
                className="text-xs text-slate-500 hover:text-slate-700 bg-gradient-to-br from-slate-50 via-blue-50/40 to-sky-50/50 hover:bg-slate-200 border border-slate-200 px-2 py-1.5 rounded cursor-pointer"
              >
                Закрыть
              </button>
          </div>
          </div>

          {audioError && (
            <div className="mt-auto border-t border-slate-200 bg-white py-3 text-center text-slate-400 text-[11px] px-4">
              ⚠ {audioError}
            </div>
          )}
        </footer>
      )}

      {/* CALL ROUTING CHRONOLOGY TIMELINE DIALOG MODAL PANEL */}
      <CDRChronologyModal
        chronologyCallId={chronologyCallId}
        chronologyData={chronologyData}
        isChronologyLoading={isChronologyLoading}
        chronologyError={chronologyError}
        isAudioPaused={isAudioPaused}
        playingRecording={playingCallId}
        fetchChronology={fetchChronology}
        playRecording={playRecording}
        onClose={() => {
          setChronologyCallId(null);
          setChronologyData(null);
        }}
      />

      {/* CALL PROCESSING / COMMENTING DIALOG MODAL PANEL */}
      <CDRProcessModal
        selectedCall={selectedCall}
        commentInput={commentInput}
        isProcessedInput={isProcessedInput}
        isSavingProcess={isSavingProcess}
        setSelectedCall={setSelectedCall}
        setCommentInput={setCommentInput}
        setIsProcessedInput={setIsProcessedInput}
        handleProcessMissedCall={handleProcessMissedCall}
        triggerClickToCall={triggerClickToCall}
        formatSeconds={formatSeconds}
      />



      {/* CLICK-TO-CALL AMI STATUS LOGS DIALOG */}
      {isCallingModalOpen && session?.role !== 'operator' && (
        <div className="fixed inset-0 bg-slate-950/80 -xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <PhoneCall className={`h-5 w-5 ${isC2CLoading ? 'animate-bounce' : ''}`} /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Инициация звонка (Click-to-Call)</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                    Дозвон: <span className="font-semibold text-emerald-400 font-mono">{callingTarget}</span>
                  </p></div>
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
                  <span>Ожидание ответа от Asterisk Call Manager порт 5038...</span></div>
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
          </div></div>
      )}
      </div></div>
  );
}
