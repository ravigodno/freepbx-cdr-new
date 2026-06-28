import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Settings, Search, FileText, Layers, Wifi, Check, AlertTriangle, 
  Trash2, RefreshCw, Download, Upload, Play, ArrowLeft, ArrowRight, 
  Lock, Plus, Edit, Undo, Eye, FileSpreadsheet, UserPlus, Users, 
  PhoneForwarded, MapPin, Building2, Server, HelpCircle, ShieldAlert,
  Database, ListPlus, Activity, Wrench
} from 'lucide-react';
import {
  Card,
  InfoCard,
  OperationSummary,
  OperationToolbar as DesignOperationToolbar,
  PreviewTable,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  Toolbar
} from '../../components/ui/DesignSystem';
import { ProvisioningTopNav } from './components/ProvisioningTopNav';
import { ProvisioningOverview } from './components/ProvisioningOverview';
import { ProvisioningPlaceholder } from './components/ProvisioningPlaceholder';
import { MANAGEMENT_SECTIONS, ManagementSectionId } from './components/provisioningSections';
import { ui } from '../../locales/ru';

interface ProvisioningCenterProps {
  session: any;
  hasPermission: (perm: string) => boolean;
}

type ExtensionUiProfile = 'simple' | 'admin' | 'engineer' | 'expert';
type ExtensionFieldGroup = 'basic' | 'sip' | 'recording' | 'followme' | 'voicemail' | 'security' | 'advanced';
type ExtensionWorkspaceTab = 'bulk-update' | 'bulk-create' | 'delete' | 'csv-import';
type OperationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT';
type ActionStatus = 'SUCCESS' | 'WARNING' | 'ERROR' | 'SKIP' | 'CONFLICT';

type OperationPreviewItem = { object: string; action: string; status: ActionStatus; oldValue: any; newValue: any; message: string; diff?: any[]; };
type ProvisioningSectionId = 'extensions' | 'trunks' | 'operator-templates' | 'routes' | 'departments';
type ProvisioningSectionDef = { id: ProvisioningSectionId; label: string; operationTypes: OperationType[] };
type ActiveManagementTab = ManagementSectionId | 'branch' | 'numbering' | 'routes' | 'did' | 'templates' | 'changelog';

type ExtensionUiSettings = { profile: ExtensionUiProfile; visibleFields: Record<string, boolean>; editableFields: Record<string, boolean>; defaultValues: Record<string, any>; fieldGroups: Record<string, boolean>; };

const EXTENSION_GROUP_LABELS: Record<ExtensionFieldGroup, string> = { basic: 'Основное', sip: 'SIP/PJSIP', recording: 'Запись звонков', followme: 'Follow Me', voicemail: 'Voicemail', security: 'Безопасность / IP ACL', advanced: 'Advanced' };

const EXTENSION_FIELD_DEFS: Array<{ key: string; label: string; group: ExtensionFieldGroup; aliases?: string[]; locked?: boolean }> = [
  { key: 'extension', label: 'Extension', group: 'basic', locked: true }, { key: 'name', label: 'Name', group: 'basic', aliases: ['displayName', 'displayname', 'description'] }, { key: 'outboundcid', label: 'Outbound CID', group: 'basic', aliases: ['outboundCid', 'outbound_cid'] }, { key: 'emergency_cid', label: 'Emergency CID', group: 'basic', aliases: ['emergencyCid', 'emergencycid'] }, { key: 'voicemail', label: 'Voicemail', group: 'basic', aliases: ['vm', 'voicemailEnabled', 'vmenabled'] }, { key: 'callwaiting', label: 'Call Waiting', group: 'basic', aliases: ['callWaiting', 'call_waiting', 'callwaiting_enable'] },
  { key: 'tech', label: 'Tech', group: 'sip', aliases: ['technology', 'sipdriver'] }, { key: 'dial', label: 'Dial', group: 'sip', locked: true }, { key: 'devicetype', label: 'Device Type', group: 'sip', aliases: ['deviceType'] }, { key: 'context', label: 'Context', group: 'sip' }, { key: 'transport', label: 'Transport', group: 'sip' }, { key: 'callerid', label: 'CallerID', group: 'sip', aliases: ['callerId'] }, { key: 'dtmfmode', label: 'DTMF Mode', group: 'sip' }, { key: 'qualify', label: 'Qualify', group: 'sip' }, { key: 'qualifyfreq', label: 'Qualify Freq', group: 'sip' }, { key: 'nat', label: 'NAT', group: 'sip' }, { key: 'encryption', label: 'Encryption', group: 'sip' }, { key: 'icesupport', label: 'ICE Support', group: 'sip' }, { key: 'rtcp_mux', label: 'RTCP Mux', group: 'sip' }, { key: 'allow', label: 'Allow', group: 'sip' }, { key: 'disallow', label: 'Disallow', group: 'sip' },
  { key: 'permit', label: 'Permit', group: 'security' }, { key: 'deny', label: 'Deny', group: 'security' }, { key: 'host', label: 'Host', group: 'security' }, { key: 'port', label: 'Port', group: 'security' },
  { key: 'recording_in_external', label: 'Rec In External', group: 'recording' }, { key: 'recording_out_external', label: 'Rec Out External', group: 'recording' }, { key: 'recording_in_internal', label: 'Rec In Internal', group: 'recording' }, { key: 'recording_out_internal', label: 'Rec Out Internal', group: 'recording' }, { key: 'recording_ondemand', label: 'Rec On Demand', group: 'recording' }, { key: 'recording_priority', label: 'Rec Priority', group: 'recording' },
  { key: 'findmefollow_enabled', label: 'FMF Enabled', group: 'followme' }, { key: 'findmefollow_strategy', label: 'FMF Strategy', group: 'followme' }, { key: 'findmefollow_grptime', label: 'FMF Ring Time', group: 'followme' }, { key: 'findmefollow_grplist', label: 'FMF Group List', group: 'followme' }, { key: 'findmefollow_postdest', label: 'FMF Postdest', group: 'followme' },
  { key: 'mailbox', label: 'Mailbox', group: 'voicemail' }, { key: 'vmexten', label: 'VM Exten', group: 'voicemail' },
  { key: 'accountcode', label: 'Account Code', group: 'advanced' }, { key: 'namedcallgroup', label: 'Named Call Group', group: 'advanced' }, { key: 'namedpickupgroup', label: 'Named Pickup Group', group: 'advanced' }, { key: 'sendrpid', label: 'Send RPID', group: 'advanced' }, { key: 'trustrpid', label: 'Trust RPID', group: 'advanced' }, { key: 'sessiontimers', label: 'Session Timers', group: 'advanced' }, { key: 'videosupport', label: 'Video Support', group: 'advanced' }
];

const EXTENSION_UI_PROFILES: Record<ExtensionUiProfile, ExtensionFieldGroup[]> = { simple: ['basic', 'recording'], admin: ['basic', 'recording', 'voicemail', 'followme'], engineer: ['basic', 'recording', 'voicemail', 'followme', 'sip', 'security'], expert: ['basic', 'sip', 'recording', 'followme', 'voicemail', 'security', 'advanced'] };
const SINGLE_RECORDING_OPTIONS = [
  { value: 'force', label: 'Force' },
  { value: 'yes', label: 'Yes' },
  { value: 'dontcare', label: "Don't Care" },
  { value: 'no', label: 'No' },
  { value: 'never', label: 'Never' }
];
const SINGLE_ON_DEMAND_OPTIONS = [
  { value: 'disabled', label: 'Disable' },
  { value: 'enabled', label: 'Enable' },
  { value: 'override', label: 'Override' }
];
const SINGLE_ENABLED_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' }
];
const SINGLE_VOICEMAIL_OPTIONS = [
  { value: 'novm', label: 'Disabled' },
  { value: 'default', label: 'Enabled' }
];
const SINGLE_FOLLOW_ME_STRATEGIES = ['ringallv2-prim', 'ringall', 'hunt', 'memoryhunt', 'firstavailable', 'firstnotonphone', 'random'];
const RECORDING_MODE_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'ondemand', label: 'On Demand' },
  { value: 'never', label: 'Never' }
];
const TABLE_HIDDEN_EXTENSION_FIELDS = new Set([
  'recording_in_external',
  'recording_out_external',
  'recording_in_internal',
  'recording_out_internal',
  'recording_ondemand',
  'recording_priority'
]);
const PREVIEW_COUNT_ITEMS = [
  { key: 'create', label: 'Create', tone: 'success' },
  { key: 'update', label: 'Update', tone: 'info' },
  { key: 'delete', label: 'Delete', tone: 'error' },
  { key: 'skip', label: 'Skip', tone: 'neutral' },
  { key: 'conflict', label: 'Conflict', tone: 'warning' },
  { key: 'error', label: 'Error', tone: 'error' }
] as const;
const EXTENSION_WORKSPACE_TAB_STORAGE_KEY = 'pbxpuls.extensions.workspaceTab';
const MANAGEMENT_ACTIVE_TAB_STORAGE_KEY = 'pbxpuls.management.activeTab';
const PROVISIONING_SECTIONS: ProvisioningSectionDef[] = [
  { id: 'extensions', label: 'Extensions', operationTypes: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'] },
  { id: 'trunks', label: 'Trunks', operationTypes: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'] },
  { id: 'operator-templates', label: 'Operator Templates', operationTypes: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'] },
  { id: 'routes', label: 'Routes', operationTypes: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'] },
  { id: 'departments', label: 'Departments', operationTypes: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'] }
];


const buildExtensionUiSettings = (profile: ExtensionUiProfile = 'admin'): ExtensionUiSettings => { const groups = EXTENSION_UI_PROFILES[profile]; const fieldGroups = Object.fromEntries(Object.keys(EXTENSION_GROUP_LABELS).map(group => [group, groups.includes(group as ExtensionFieldGroup)])); const visibleFields: Record<string, boolean> = {}; const editableFields: Record<string, boolean> = {}; EXTENSION_FIELD_DEFS.forEach(field => { const visible = fieldGroups[field.group] === true; visibleFields[field.key] = visible; editableFields[field.key] = visible && field.locked !== true; }); return { profile, visibleFields, editableFields, defaultValues: {}, fieldGroups }; };

function OperationHeader({ icon: Icon, title, description, meta }: { icon: any; title: string; description: string; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Icon className="h-4 w-4 text-blue-600" />
          {title}
        </h4>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
      {meta}
    </div>
  );
}

function OperationToolbar({ onPreview, onApply, onReset, previewDisabled, applyDisabled, previewLoading, applyLoading }: { onPreview: () => void; onApply: () => void; onReset: () => void; previewDisabled?: boolean; applyDisabled?: boolean; previewLoading?: boolean; applyLoading?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onPreview} disabled={previewDisabled || previewLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60">
        {previewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        Preview
      </button>
      <button type="button" onClick={onApply} disabled={applyDisabled || applyLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400">
        {applyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Apply
      </button>
      <button type="button" onClick={onReset} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
        <Undo className="h-4 w-4" />
        Reset
      </button>
    </div>
  );
}

function OperationSummaryCards({ counts, getBadgeClass }: { counts: Record<string, number>; getBadgeClass: (tone: 'blue' | 'green' | 'slate' | 'amber' | 'rose' | 'indigo') => string }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {PREVIEW_COUNT_ITEMS.map(item => (
        <div key={item.key} className="min-h-[86px] rounded-lg border border-slate-150 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <StatusBadge tone={item.tone as any}>{item.label}</StatusBadge>
          <div className="mt-2 text-2xl font-black text-slate-850 dark:text-white">{counts[item.key] || 0}</div>
        </div>
      ))}
    </div>
  );
}

function OperationPreviewTable({ items, actionClass, summarizeValue, formatDiffValue }: { items: OperationPreviewItem[]; actionClass: (action: string) => string; summarizeValue: (value: any) => string; formatDiffValue: (value: any) => string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
      <table className="w-full min-w-[920px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 dark:bg-slate-800">
          <tr>
            <th className="p-3">Object</th>
            <th className="p-3">Action</th>
            <th className="p-3">Status</th>
            <th className="p-3">Old</th>
            <th className="p-3">New</th>
            <th className="p-3">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, idx) => (
            <tr key={`${item.object || 'row'}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <td className="p-3 font-mono font-black text-slate-850 dark:text-white">{item.object || '-'}</td>
              <td className="p-3"><span className={'rounded-full px-2 py-1 text-[10px] font-black uppercase ' + actionClass(item.action)}>{item.action || '-'}</span></td>
              <td className="p-3"><span className={'rounded-full px-2 py-1 text-[10px] font-black uppercase ' + actionClass(item.status.toLowerCase())}>{item.status}</span></td>
              <td className="p-3 font-mono text-[10px] text-slate-500">{summarizeValue(item.oldValue)}</td>
              <td className="p-3">
                <div className="font-mono text-[10px] text-slate-500">
                  {summarizeValue(item.newValue)}
                  {Array.isArray(item.diff) && item.diff.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.diff.map((diff: any) => (
                        <div key={diff.field} className="rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                          <span className="font-black text-slate-700 dark:text-slate-200">{diff.field}</span>: {formatDiffValue(diff.before)} -&gt; {formatDiffValue(diff.after)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td className="p-3 text-slate-600 dark:text-slate-300">{item.message || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProvisioningCenter({ session, hasPermission }: ProvisioningCenterProps) {
  const token = session?.token || '';
  
  // Tab control
  const [activeTab, setActiveTab] = useState<ActiveManagementTab>(() => {
    if (typeof window === 'undefined') return 'overview';
    const saved = window.localStorage.getItem(MANAGEMENT_ACTIVE_TAB_STORAGE_KEY) as ManagementSectionId | null;
    return MANAGEMENT_SECTIONS.some(section => section.id === saved) ? saved as ManagementSectionId : 'overview';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (MANAGEMENT_SECTIONS.some(section => section.id === activeTab)) {
      window.localStorage.setItem(MANAGEMENT_ACTIVE_TAB_STORAGE_KEY, activeTab);
    }
  }, [activeTab]);

  // Permission Checks (Reactive)
  const canWrite = hasPermission('dangerous_pbx_write');
  const canBulkExt = hasPermission('bulk_extensions');
  const canManageTrunks = hasPermission('manage_trunks');
  const canManageRoutes = hasPermission('manage_outbound_routes');
  const canManageNumbering = hasPermission('manage_numbering_capacity');

  // Unified notifications/messages
  const [noti, setNoti] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showNoti = (type: 'success' | 'error' | 'info', text: string) => {
    setNoti({ type, text });
    setTimeout(() => setNoti(null), 6000);
  };

  // --- RUSSIAN NUMBERING CAPACITY STATE ---
  const [numSearch, setNumSearch] = useState('79781234567');
  const [numSearchResult, setNumSearchResult] = useState<any>(null);
  const [numPages, setNumPages] = useState<any[]>([]);
  const [numMeta, setNumMeta] = useState<any>(null);
  const [numPage, setNumPage] = useState(1);
  const [numLimit] = useState(10);
  const [numTotal, setNumTotal] = useState(0);
  const [numQuery, setNumQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // --- CONFIG / FLOW STATE FOR MAIN BULK WORKFLOWS ---
  // Step pipelines: 'draft' | 'preview' | 'success'
  const [extStep, setExtStep] = useState<'draft' | 'preview' | 'success'>('draft');
  const [trunkStep, setTrunkStep] = useState<'draft' | 'preview' | 'success'>('draft');
  const [routeStep, setRouteStep] = useState<'draft' | 'preview' | 'success'>('draft');
  const [didStep, setDidStep] = useState<'draft' | 'preview' | 'success'>('draft');

  const [isDryRun, setIsDryRun] = useState(false);

  // --- EXTENSIONS MULTI-MODE STATE ---
  const [extMode, setExtMode] = useState<'range' | 'manual' | 'file' | 'edit-active'>('range');
  const [extRangeStart, setExtRangeStart] = useState('200');
  const [extRangeEnd, setExtRangeEnd] = useState('210');
  const [extNamePattern, setExtNamePattern] = useState('Продавец {EXT}');
  const [extManualText, setExtManualText] = useState("300; Иван Иванов; Отдел Продаж\n301; Анна Петрова; Бухгалтерия");
  const [extTech, setExtTech] = useState<'sip' | 'pjsip'>('pjsip');
  const [extVoicemail, setExtVoicemail] = useState(false);
  const [extRecording, setExtRecording] = useState<'always' | 'never' | 'optional'>('always');
  const [extPasswordComplexity, setExtPasswordComplexity] = useState<'strong' | 'simple' | 'pin'>('strong');
  
  // Ext Template selection
  const [extTemplates, setExtTemplates] = useState<any[]>([]);
  const [selectedExtTemplate, setSelectedExtTemplate] = useState('');
  
  // Bulk creation preview outcome
  const [extPreviewData, setExtPreviewData] = useState<any>(null);
  const [extIsLoading, setExtIsLoading] = useState(false);
  const [extFileText, setExtFileText] = useState('');
  const [extFileName, setExtFileName] = useState('');

  // Active extensions inline editor state
  const [activeExtensions, setActiveExtensions] = useState<any[]>([]);
  const [activeExtLoading, setActiveExtLoading] = useState(false);
  const [extensionUiSettings, setExtensionUiSettings] = useState<ExtensionUiSettings>(() => buildExtensionUiSettings('admin'));
  const [extensionUiSettingsLoading, setExtensionUiSettingsLoading] = useState(false);
  const [activeExtSearch, setActiveExtSearch] = useState('');
  const [activeExtTechFilter, setActiveExtTechFilter] = useState<'all' | 'pjsip' | 'sip' | 'unknown'>('all');
  const [activeExtVoicemailFilter, setActiveExtVoicemailFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [activeExtRecordingFilter, setActiveExtRecordingFilter] = useState<'all' | 'always' | 'ondemand' | 'never' | 'unknown'>('all');
  const [activeExtSourceFilter, setActiveExtSourceFilter] = useState<'all' | 'bmo' | 'rest' | 'merged' | 'unknown'>('all');
  const [activeExtStatusFilter, setActiveExtStatusFilter] = useState<'all' | 'loaded' | 'warning' | 'error'>('all');
  const [activeExtSortField, setActiveExtSortField] = useState<'extension' | 'name' | 'tech'>('extension');
  const [activeExtSortDir, setActiveExtSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeExtError, setActiveExtError] = useState('');
  const [activeExtLoadedAt, setActiveExtLoadedAt] = useState('');
  const [activeExtEndpoint, setActiveExtEndpoint] = useState('');
  const [activeExtRawLoading, setActiveExtRawLoading] = useState(false);
  const [activeExtRawData, setActiveExtRawData] = useState<any>(null);
  const [activeExtRawError, setActiveExtRawError] = useState('');
  const [activeExtRawOpen, setActiveExtRawOpen] = useState(false);
  const [selectedExtensionIds, setSelectedExtensionIds] = useState<string[]>([]);
  const [extensionPreviewResult, setExtensionPreviewResult] = useState<any>(null);
  const [extensionPreviewLoading, setExtensionPreviewLoading] = useState(false);
  const [extensionApplyLoading, setExtensionApplyLoading] = useState(false);
  const [extensionApplyResult, setExtensionApplyResult] = useState<any>(null);
  const [extensionWorkspaceTab, setExtensionWorkspaceTabState] = useState<ExtensionWorkspaceTab>(() => {
    if (typeof window === 'undefined') return 'bulk-update';
    const saved = window.localStorage.getItem(EXTENSION_WORKSPACE_TAB_STORAGE_KEY);
    return ['bulk-update', 'bulk-create', 'delete', 'csv-import'].includes(saved || '') ? saved as ExtensionWorkspaceTab : 'bulk-update';
  });
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [createMode, setCreateMode] = useState<'range' | 'manual' | 'csv'>('range');
  const [createStartExt, setCreateStartExt] = useState('200');
  const [createEndExt, setCreateEndExt] = useState('202');
  const [createManualList, setCreateManualList] = useState('');
  const [createCsvText, setCreateCsvText] = useState('');
  const [createNameMask, setCreateNameMask] = useState('User {ext}');
  const [createSecretMode, setCreateSecretMode] = useState<'auto' | 'fixed' | 'mask'>('auto');
  const [createFixedSecret, setCreateFixedSecret] = useState('');
  const [createSecretMask, setCreateSecretMask] = useState('pbx{ext}!');
  const [createConflictMode, setCreateConflictMode] = useState<'fill-missing' | 'strict'>('fill-missing');
  const [createTechnology, setCreateTechnology] = useState<'pjsip' | 'sip'>('pjsip');
  const [createContext, setCreateContext] = useState('from-internal');
  const [createOutboundCid, setCreateOutboundCid] = useState('');
  const [createEmailDomain, setCreateEmailDomain] = useState('');
  const [createVoicemail, setCreateVoicemail] = useState(false);
  const [createRecording, setCreateRecording] = useState('always');
  const [createCallWaiting, setCreateCallWaiting] = useState(true);
  const [createEmergencyCid, setCreateEmergencyCid] = useState('');
  const [createRawJson, setCreateRawJson] = useState('');

  const [updateFields, setUpdateFields] = useState({
    updateDisplayName: false,
    displayName: 'User {ext}',
    updateRecording: false,
    recording: 'always',
    updateVoicemail: false,
    voicemail: false,
    updateCallWaiting: false,
    callWaiting: true,
    updateOutboundCid: false,
    outboundCid: '',
    updateContext: false,
    context: 'from-internal',
    updateEmergencyCid: false,
    emergencyCid: '',
    updateEmailDomain: false,
    emailDomain: '',
    updateRaw: false,
    rawJson: ''
  });
  const [singleExtensionEdit, setSingleExtensionEdit] = useState<any>(null);
  const [singleUpdateFields, setSingleUpdateFields] = useState<Record<string, any>>({
    updateName: false,
    name: '',
    updateOutboundCid: false,
    outboundCid: '',
    updateEmergencyCid: false,
    emergencyCid: '',
    updateVoicemail: false,
    voicemail: 'novm',
    updateCallWaiting: false,
    callWaiting: 'disabled',
    updateRecordingInbound: false,
    recordingInbound: 'always',
    updateRecordingOutbound: false,
    recordingOutbound: 'always',
    updateRecordingInternal: false,
    recordingInternal: 'always',
    updateRecordingInExternal: false,
    recording_in_external: 'dontcare',
    updateRecordingOutExternal: false,
    recording_out_external: 'dontcare',
    updateRecordingInInternal: false,
    recording_in_internal: 'dontcare',
    updateRecordingOutInternal: false,
    recording_out_internal: 'dontcare',
    updateRecordingOndemand: false,
    recording_ondemand: 'disabled',
    updateRecordingPriority: false,
    recording_priority: '10',
    updateFindmefollowEnabled: false,
    findmefollow_enabled: 'disabled',
    updateFindmefollowStrategy: false,
    findmefollow_strategy: 'ringallv2-prim',
    updateFindmefollowGrptime: false,
    findmefollow_grptime: '',
    updateFindmefollowGrplist: false,
    findmefollow_grplist: '',
    updateFindmefollowPostdest: false,
    findmefollow_postdest: '',
    updateRaw: false,
    rawJson: ''
  });
  const [batchMappingText, setBatchMappingText] = useState('');  const [showBatchMapping, setShowBatchMapping] = useState(false);


  const normalizeExtensionUiSettings = (settings: any): ExtensionUiSettings => {
    const profile: ExtensionUiProfile = ['simple', 'admin', 'engineer', 'expert'].includes(settings?.profile) ? settings.profile : 'admin';
    const base = buildExtensionUiSettings(profile);
    return { profile, visibleFields: { ...base.visibleFields, ...(settings?.visibleFields || {}) }, editableFields: { ...base.editableFields, ...(settings?.editableFields || {}) }, defaultValues: settings?.defaultValues || {}, fieldGroups: { ...base.fieldGroups, ...(settings?.fieldGroups || {}) } };
  };
  const loadExtensionUiSettings = async () => { setExtensionUiSettingsLoading(true); try { const res = await fetch('/api/management/extensions/ui-settings', { headers: { Authorization: `Bearer ${token}` } }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || 'Не удалось загрузить настройки Extensions'); setExtensionUiSettings(normalizeExtensionUiSettings(data)); } catch (err: any) { showNoti('error', err.message || 'Ошибка загрузки настроек Extensions'); } finally { setExtensionUiSettingsLoading(false); } };
  const saveExtensionUiSettings = async () => { setExtensionUiSettingsLoading(true); try { const res = await fetch('/api/management/extensions/ui-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(extensionUiSettings) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || 'Не удалось сохранить настройки Extensions'); setExtensionUiSettings(normalizeExtensionUiSettings(data)); showNoti('success', 'Настройки вкладки Extensions сохранены'); } catch (err: any) { showNoti('error', err.message || 'Ошибка сохранения настроек Extensions'); } finally { setExtensionUiSettingsLoading(false); } };
  const applyExtensionUiProfile = (profile: ExtensionUiProfile) => setExtensionUiSettings(prev => ({ ...buildExtensionUiSettings(profile), defaultValues: prev.defaultValues || {} }));
  const setExtensionUiGroup = (group: ExtensionFieldGroup, enabled: boolean) => setExtensionUiSettings(prev => { const next = normalizeExtensionUiSettings({ ...prev, fieldGroups: { ...prev.fieldGroups, [group]: enabled } }); EXTENSION_FIELD_DEFS.filter(field => field.group === group).forEach(field => { next.visibleFields[field.key] = enabled; if (!enabled) next.editableFields[field.key] = false; else if (next.editableFields[field.key] === undefined) next.editableFields[field.key] = field.locked !== true; }); return next; });
  const setExtensionUiField = (kind: 'visibleFields' | 'editableFields', field: string, enabled: boolean) => setExtensionUiSettings(prev => ({ ...prev, [kind]: { ...prev[kind], [field]: enabled } }));
  const setExtensionDefaultValue = (field: string, value: string) => setExtensionUiSettings(prev => ({ ...prev, defaultValues: { ...prev.defaultValues, [field]: value } }));
  const getVisibleExtensionFields = () => EXTENSION_FIELD_DEFS.filter(field => !TABLE_HIDDEN_EXTENSION_FIELDS.has(field.key) && extensionUiSettings.fieldGroups[field.group] !== false && extensionUiSettings.visibleFields[field.key] !== false);
  const getFieldsByGroup = (group: ExtensionFieldGroup) => EXTENSION_FIELD_DEFS.filter(field => field.group === group);
  useEffect(() => { if (token) loadExtensionUiSettings(); }, [token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string || '';
      setExtFileText(text);
      showNoti('success', `Файл ${file.name} успешно загружен! Готов к предпросмотру.`);
    };
    reader.onerror = () => {
      showNoti('error', 'Ошибка при чтении файла');
    };
    reader.readAsText(file);
  };

  const downloadCsvTemplate = () => {
    const headers = "extension,password,name,voicemail,ringtimer,noanswer,recording,outboundcid,sipname,noanswer_cid,busy_cid,chanunavail_cid,noanswer_dest,busy_dest,chanunavail_dest,mohclass,id,tech,dial,devicetype,user,description,emergency_cid,hint_override,cwtone,recording_in_external,recording_out_external,recording_in_internal,recording_out_internal,recording_ondemand,recording_priority,answermode,intercom,cid_masquerade,concurrency_limit,devicedata,accountcode,allow,avpf,callerid,canreinvite,context,defaultuser,deny,disallow,dtmfmode,encryption,force_avp,host,icesupport,namedcallgroup,namedpickupgroup,nat,permit,port,qualify,qualifyfreq,rtcp_mux,secret,sendrpid,sessiontimers,sipdriver,transport,trustrpid,type,user_eq_phone,videosupport,callwaiting_enable,findmefollow_strategy,findmefollow_grptime,findmefollow_grppre,findmefollow_grplist,findmefollow_annmsg_id,findmefollow_postdest,findmefollow_dring,findmefollow_needsconf,findmefollow_remotealert_id,findmefollow_toolate_id,findmefollow_ringing,findmefollow_pre_ring,findmefollow_voicemail,findmefollow_calendar_id,findmefollow_calendar_match,findmefollow_changecid,findmefollow_fixedcid,findmefollow_enabled";
    const sampleRow = '200,,Грунин Константин,novm,20,,"out=always|in=always",,Грунин Константин,,,,,,,,default,200,sip,SIP/200,fixed,200,Грунин Константин,,,,always,always,always,always,yes,10,disabled,disabled,,,sip,rfc2833,,no,dynamic,,from-internal,,,,,force_rport,comedia,,,,60,,,pai,accept,chan_sip,"udp,tcp,tls",yes,friend,no,no,ENABLED,ringallv2-prim,20,,200,,ext-local,200,dest,,,,Ring,7,novm,,,default,,';
    const csvContent = headers + "\n" + sampleRow;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "freepbx_extensions_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCurrentExtensions = async () => {
    try {
      const res = await fetch('/api/management/extensions/export-csv', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Ошибка при выгрузке списка текущих абонентов');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "freepbx_extensions_current.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNoti('success', 'Список текущих абонентов успешно экспортирован!');
    } catch (err: any) {
      showNoti('error', err.message);
    }
  };

  const fetchActiveExtensions = async () => {
    setActiveExtLoading(true);
    setActiveExtError('');
    try {
      const [extensionsRes, settingsRes] = await Promise.all([
        fetch('/api/management/extensions', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)
      ]);

      if (!extensionsRes.ok) {
        const errorText = await extensionsRes.text().catch(() => '');
        throw new Error(errorText || 'Не удалось получить список extensions с АТС');
      }

      const data = await extensionsRes.json();
      if (!Array.isArray(data)) {
        throw new Error('Формат ответа /api/management/extensions не поддерживается');
      }

      if (settingsRes?.ok) {
        const settings = await settingsRes.json().catch(() => ({}));
        setActiveExtEndpoint(settings.freepbxApiUrl ? 'BMO Core + /userman/extensions, fallback /core/users' : (settings.freepbxApiWorkingEndpoint || 'BMO Core'));
      }

      setActiveExtensions(data);
      setSelectedExtensionIds(prev => prev.filter(ext => data.some((item: any) => String(item.extension) === ext)));
      setActiveExtLoadedAt(new Date().toLocaleString());
      showNoti('success', `Загружено ${data.length} extensions с АТС`);
    } catch (err: any) {
      const message = err?.message || 'Ошибка загрузки extensions';
      setActiveExtError(message);
      showNoti('error', message);
    } finally {
      setActiveExtLoading(false);
    }
  };

  const fetchRawExtensionsRest = async () => {
    setActiveExtRawLoading(true);
    setActiveExtRawError('');
    try {
      const res = await fetch('/api/management/extensions/rest-raw', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось получить raw REST ответ');
      setActiveExtRawData(data);
      setActiveExtRawOpen(true);
      showNoti('success', 'Raw REST ответ FreePBX API загружен');
    } catch (err: any) {
      const message = err?.message || 'Ошибка загрузки raw REST ответа';
      setActiveExtRawError(message);
      showNoti('error', message);
    } finally {
      setActiveExtRawLoading(false);
    }
  };
  const applyBatchMapping = () => {
    if (!batchMappingText.trim()) {
      showNoti('info', 'Пожалуйста, введите данные для сопоставления');
      return;
    }
    const lines = batchMappingText.split('\n');
    let matchedCount = 0;
    const updatedExtensions = activeExtensions.map(ext => {
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        let parts: string[] = [];
        if (trimmed.includes(';')) {
          parts = trimmed.split(';');
        } else if (trimmed.includes(',')) {
          parts = trimmed.split(',');
        } else if (trimmed.includes('\t')) {
          parts = trimmed.split('\t');
        } else {
          const spaceIndex = trimmed.indexOf(' ');
          if (spaceIndex !== -1) {
            parts = [trimmed.substring(0, spaceIndex), trimmed.substring(spaceIndex + 1)];
          }
        }

        if (parts.length >= 2) {
          const rawExt = parts[0].trim();
          const name = parts[1].trim();
          if (rawExt === ext.extension) {
            matchedCount++;
            return { ...ext, name };
          }
        }
      }
      return ext;
    });

    setActiveExtensions(updatedExtensions);
    showNoti('success', `Успешно сопоставлено и обновлено имён: ${matchedCount}`);
    setShowBatchMapping(false);
  };

  const updateActiveExtField = (index: number, field: string, value: any) => {
    setActiveExtensions(prev => prev.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const setAllRecording = (value: 'always' | 'never' | 'optional') => {
    setActiveExtensions(prev => prev.map(item => ({ ...item, recording: value })));
    showNoti('success', `Запись звонков изменена на "${value}" для всех абонентов`);
  };

  const setAllFollowMe = (enabled: boolean) => {
    setActiveExtensions(prev => prev.map(item => ({ ...item, findmefollow_enabled: enabled ? 'yes' : 'no' })));
    showNoti('success', `Режим FollowMe изменен на "${enabled ? 'Включено' : 'Выключено'}" для всех абонентов`);
  };

  const setAllVoicemail = (enabled: boolean) => {
    setActiveExtensions(prev => prev.map(item => ({ ...item, voicemail: enabled ? 'yes' : 'no' })));
    showNoti('success', `Голосовая почта изменена на "${enabled ? 'Включена' : 'Выключена'}" для всех абонентов`);
  };

  const getExtField = (ext: any, fields: string[], fallback: any = '') => {
    const sources = [ext, ext?.bulkFields, ext?.raw?.bmo?.user, ext?.raw?.bmo?.device, ext?.raw?.bmo?.summary].filter(Boolean);
    for (const source of sources) {
      for (const field of fields) {
        const value = source?.[field];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
    return fallback;
  };

  const getExtText = (ext: any, fields: string[], fallback = '-') => {
    const value = getExtField(ext, fields, '');
    return value === undefined || value === null || value === '' ? fallback : String(value);
  };

  const getExtBool = (ext: any, fields: string[], defaultValue = false) => {
    const value = getExtField(ext, fields, undefined);
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (['novm', 'none', 'disabled', 'disable', 'false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['yes', 'true', '1', 'on', 'enabled', 'enable', 'active'].includes(normalized)) return true;
    return defaultValue;
  };

  const getExtTech = (ext: any): 'pjsip' | 'sip' | 'unknown' => {
    const raw = String(getExtField(ext, ['tech', 'technology', 'sipdriver'], '') || '').toLowerCase();
    const dial = String(getExtField(ext, ['dial'], '') || '').toLowerCase();
    if (raw.includes('pjsip') || dial.startsWith('pjsip/')) return 'pjsip';
    if (raw.includes('sip') || dial.startsWith('sip/')) return 'sip';
    return 'unknown';
  };

  const getExtRecordingValue = (ext: any) => {
    return getExtField(ext, ['recording', 'recordingPolicy', 'recording_policy'], '');
  };

  const getExtRecordingFlags = (ext: any) => ({
    inExternal: getExtText(ext, ['recording_in_external'], ''),
    outExternal: getExtText(ext, ['recording_out_external'], ''),
    inInternal: getExtText(ext, ['recording_in_internal'], ''),
    outInternal: getExtText(ext, ['recording_out_internal'], ''),
    ondemand: getExtText(ext, ['recording_ondemand'], ''),
    priority: getExtText(ext, ['recording_priority'], '')
  });

  const getExtensionSourceKey = (ext: any): 'bmo' | 'rest' | 'merged' | 'unknown' => {
    const sources = Array.isArray(ext?.raw?.sources) ? ext.raw.sources : [];
    if (sources.length > 1) return 'merged';
    if (sources.includes('/bmo')) return 'bmo';
    if (ext?.sourceStatus === 'loaded-from-pbx' || sources.length === 1) return 'rest';
    return 'unknown';
  };


  const getFieldAliases = (field: { key: string; aliases?: string[] }) => [field.key, ...(field.aliases || [])];
  const getExtensionFieldValue = (ext: any, field: { key: string; aliases?: string[] }) => { if (field.key === 'tech') return getTechLabel(ext); if (field.key === 'voicemail' || field.key === 'callwaiting' || field.key === 'findmefollow_enabled') return getExtBool(ext, getFieldAliases(field)) ? 'Enabled' : 'Disabled'; return getExtText(ext, getFieldAliases(field)); };
  const formatDefaultValue = (field: string) => extensionUiSettings.defaultValues?.[field] ?? '';
  const parseUiRawJson = (raw: string) => { if (!raw.trim()) return {}; try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch (err) { return {}; } };

  const getExtensionStatusKey = (ext: any): 'loaded' | 'warning' | 'error' => {
    if (ext?.sourceStatus === 'error') return 'error';
    if (!ext?.extension) return 'warning';
    return 'loaded';
  };

  const getRecordingKey = (value: any): 'always' | 'ondemand' | 'never' | 'unknown' => {
    const normalized = String(typeof value === 'object' ? getExtRecordingValue(value) : value || '').trim().toLowerCase();
    if (['always', 'force', 'yes', 'enabled', 'record'].some((item) => normalized.includes(item))) return 'always';
    if (['ondemand', 'on demand', 'optional'].some((item) => normalized.includes(item))) return 'ondemand';
    if (['never', 'no', 'disabled', 'none'].some((item) => normalized.includes(item))) return 'never';
    if (typeof value === 'object') {
      const flags = getExtRecordingFlags(value);
      const flagText = [flags.inExternal, flags.outExternal, flags.inInternal, flags.outInternal].join(' ').toLowerCase();
      const ondemand = String(flags.ondemand || '').toLowerCase();
      if (['yes', 'always', 'force', 'enabled'].some((item) => flagText.includes(item))) return 'always';
      if (['ondemand', 'on demand', 'optional', 'enabled', 'yes'].some((item) => ondemand.includes(item))) return 'ondemand';
      if (flagText && ['no', 'never', 'disabled', 'dontcare'].some((item) => flagText.includes(item))) return 'never';
    }
    return 'unknown';
  };

  const getRecordingFieldKey = (value: any, ondemand: any): 'always' | 'ondemand' | 'never' | 'unknown' => {
    const normalized = String(value || '').trim().toLowerCase();
    const ondemandEnabled = ['enabled', 'yes', 'true', '1', 'override', 'optional'].includes(String(ondemand || '').trim().toLowerCase());
    if (['force', 'yes', 'always', 'enabled'].includes(normalized)) return 'always';
    if (['never', 'no', 'disabled'].includes(normalized)) return 'never';
    if (['dontcare', 'optional', 'ondemand'].includes(normalized) && ondemandEnabled) return 'ondemand';
    return 'unknown';
  };
  const getRecordingDirectionKey = (ext: any, direction: 'inbound' | 'outbound' | 'internal'): 'always' | 'ondemand' | 'never' | 'unknown' => {
    const flags = getExtRecordingFlags(ext);
    if (direction === 'inbound') return getRecordingFieldKey(flags.inExternal, flags.ondemand);
    if (direction === 'outbound') return getRecordingFieldKey(flags.outExternal, flags.ondemand);
    const inKey = getRecordingFieldKey(flags.inInternal, flags.ondemand);
    const outKey = getRecordingFieldKey(flags.outInternal, flags.ondemand);
    if (inKey === outKey) return inKey;
    if (inKey === 'always' || outKey === 'always') return 'always';
    if (inKey === 'ondemand' || outKey === 'ondemand') return 'ondemand';
    if (inKey === 'never' && outKey === 'never') return 'never';
    return 'unknown';
  };
  const getRecordingStatusLabel = (key: 'always' | 'ondemand' | 'never' | 'unknown') => {
    if (key === 'always') return 'Always';
    if (key === 'ondemand') return 'On Demand';
    if (key === 'never') return 'Never';
    return 'Unknown';
  };
  const getRecordingDirectionLabel = (ext: any, direction: 'inbound' | 'outbound' | 'internal') => getRecordingStatusLabel(getRecordingDirectionKey(ext, direction));
  const getRecordingStatusBadgeClass = (key: 'always' | 'ondemand' | 'never' | 'unknown') => {
    if (key === 'always') return getBadgeClass('green');
    if (key === 'ondemand') return getBadgeClass('amber');
    if (key === 'never') return getBadgeClass('slate');
    return getBadgeClass('blue');
  };
  const getRecordingDirectionBadgeClass = (ext: any, direction: 'inbound' | 'outbound' | 'internal') => getRecordingStatusBadgeClass(getRecordingDirectionKey(ext, direction));
  const getRecordingDirectionKeys = (ext: any) => [getRecordingDirectionKey(ext, 'inbound'), getRecordingDirectionKey(ext, 'outbound'), getRecordingDirectionKey(ext, 'internal')];
  const recordingModeToBmo = (value: string) => value === 'always' ? 'force' : value === 'ondemand' ? 'dontcare' : value === 'never' ? 'never' : '';
  const buildRecordingRawPatch = (inbound: string, outbound: string, internal: string) => {
    const rawPatch: Record<string, any> = {};
    if (inbound !== 'nochange') rawPatch.recording_in_external = recordingModeToBmo(inbound);
    if (outbound !== 'nochange') rawPatch.recording_out_external = recordingModeToBmo(outbound);
    if (internal !== 'nochange') { rawPatch.recording_in_internal = recordingModeToBmo(internal); rawPatch.recording_out_internal = recordingModeToBmo(internal); }
    const selected = [inbound, outbound, internal].filter((item) => item !== 'nochange');
    if (selected.includes('ondemand')) rawPatch.recording_ondemand = 'enabled';
    else if (selected.length === 3) rawPatch.recording_ondemand = 'disabled';
    return rawPatch;
  };

  const filteredActiveExtensions = useMemo(() => {
    const query = activeExtSearch.trim().toLowerCase();
    const filtered = activeExtensions.filter(ext => {
      const tech = getExtTech(ext);
      const sourceKey = getExtensionSourceKey(ext);
      const statusKey = getExtensionStatusKey(ext);
      const recordingKeys = getRecordingDirectionKeys(ext);
      const matchesTech = activeExtTechFilter === 'all' || tech === activeExtTechFilter;
      const matchesVoicemail = activeExtVoicemailFilter === 'all' || (activeExtVoicemailFilter === 'enabled' ? !!ext.voicemail : !ext.voicemail);
      const matchesRecording = activeExtRecordingFilter === 'all' || recordingKeys.includes(activeExtRecordingFilter);
      const matchesSource = activeExtSourceFilter === 'all' || sourceKey === activeExtSourceFilter;
      const matchesStatus = activeExtStatusFilter === 'all' || statusKey === activeExtStatusFilter;
      const matchesSearch = !query ||
        String(ext.extension || '').toLowerCase().includes(query) ||
        String(ext.name || '').toLowerCase().includes(query) ||
        String(ext.displayName || '').toLowerCase().includes(query) ||
        String(getExtField(ext, ['email', 'email_address'], '') || '').toLowerCase().includes(query) ||
        String(getExtField(ext, ['dial', 'callerid', 'context', 'outboundcid', 'outboundCid'], '') || '').toLowerCase().includes(query);
      return matchesTech && matchesVoicemail && matchesRecording && matchesSource && matchesStatus && matchesSearch;
    });

    const getSortValue = (ext: any) => {
      if (activeExtSortField === 'name') return String(ext.displayName || ext.name || '').toLowerCase();
      if (activeExtSortField === 'tech') return getExtTech(ext);
      return String(ext.extension || '');
    };

    return [...filtered].sort((a, b) => {
      const result = getSortValue(a).localeCompare(getSortValue(b), undefined, { numeric: true });
      return activeExtSortDir === 'asc' ? result : -result;
    });
  }, [activeExtensions, activeExtSearch, activeExtTechFilter, activeExtVoicemailFilter, activeExtRecordingFilter, activeExtSourceFilter, activeExtStatusFilter, activeExtSortField, activeExtSortDir]);

  const activeExtTechCounts = useMemo(() => {
    return activeExtensions.reduce((acc: Record<string, number>, ext) => {
      const tech = getExtTech(ext);
      acc[tech] = (acc[tech] || 0) + 1;
      return acc;
    }, {});
  }, [activeExtensions]);

  const extensionNumberPlan = useMemo(() => {
    const numbers = activeExtensions
      .map((ext: any) => Number(String(ext.extension || '').trim()))
      .filter((value: number) => Number.isInteger(value) && value > 0)
      .sort((a: number, b: number) => a - b);
    const used = new Set(numbers);
    const last = numbers.length ? numbers[numbers.length - 1] : null;
    const findFirstFreeFrom = (start: number) => {
      let candidate = Math.max(1, start);
      while (used.has(candidate)) candidate += 1;
      return candidate;
    };
    const nextFree = last === null ? null : findFirstFreeFrom(last + 1);
    const firstGap = numbers.length ? (() => {
      for (let candidate = numbers[0]; candidate <= (last || numbers[0]); candidate += 1) {
        if (!used.has(candidate)) return candidate;
      }
      return null;
    })() : null;
    const allocateFreeExtensions = (count: number, start = numbers[0] || 1) => {
      const result: number[] = [];
      let candidate = Math.max(1, start);
      while (result.length < count) {
        if (!used.has(candidate)) result.push(candidate);
        candidate += 1;
      }
      return result;
    };
    return { last, nextFree, firstGap, allocateFreeExtensions };
  }, [activeExtensions]);

  const filteredExtensionIds = useMemo(() => filteredActiveExtensions.map(ext => String(ext.extension || '')).filter(Boolean), [filteredActiveExtensions]);
  const allFilteredSelected = filteredExtensionIds.length > 0 && filteredExtensionIds.every(ext => selectedExtensionIds.includes(ext));
  const toggleExtensionSelection = (extension: string) => setSelectedExtensionIds(prev => prev.includes(extension) ? prev.filter(item => item !== extension) : [...prev, extension]);
  const toggleAllFilteredExtensions = () => setSelectedExtensionIds(prev => allFilteredSelected ? prev.filter(ext => !filteredExtensionIds.includes(ext)) : Array.from(new Set([...prev, ...filteredExtensionIds])));
  const setExtensionWorkspaceTab = (tab: ExtensionWorkspaceTab) => {
    setExtensionWorkspaceTabState(tab);
    if (typeof window !== 'undefined') window.localStorage.setItem(EXTENSION_WORKSPACE_TAB_STORAGE_KEY, tab);
  };
  const setUpdateField = (field: string, value: any) => setUpdateFields(prev => ({ ...prev, [field]: value }));
  const setSingleUpdateField = (field: string, value: any) => setSingleUpdateFields(prev => ({ ...prev, [field]: value }));
  const singleValue = (ext: any, fields: string[], fallback = '') => getExtText(ext, fields, fallback);
  const normalizeSingleEnabled = (value: any) => getExtBool({ value }, ['value']) ? 'enabled' : 'disabled';
  const normalizeSingleVoicemail = (ext: any) => getExtBool(ext, ['voicemail', 'vm', 'voicemailEnabled', 'vmenabled']) ? 'default' : 'novm';
  const openSingleExtensionEditor = (ext: any) => {
    if (!ext?.extension) return;
    setSingleExtensionEdit(ext);
    setSingleUpdateFields({
      updateName: false,
      name: ext.displayName || ext.name || '',
      updateOutboundCid: false,
      outboundCid: singleValue(ext, ['outboundCid', 'outboundcid', 'outbound_cid']),
      updateEmergencyCid: false,
      emergencyCid: singleValue(ext, ['emergencyCid', 'emergencycid', 'emergency_cid']),
      updateVoicemail: false,
      voicemail: normalizeSingleVoicemail(ext),
      updateCallWaiting: false,
      callWaiting: getExtBool(ext, ['callWaiting', 'callwaiting', 'call_waiting', 'callwaiting_enable']) ? 'enabled' : 'disabled',
      updateRecordingInbound: false,
      recordingInbound: getRecordingDirectionKey(ext, 'inbound') === 'unknown' ? 'always' : getRecordingDirectionKey(ext, 'inbound'),
      updateRecordingOutbound: false,
      recordingOutbound: getRecordingDirectionKey(ext, 'outbound') === 'unknown' ? 'always' : getRecordingDirectionKey(ext, 'outbound'),
      updateRecordingInternal: false,
      recordingInternal: getRecordingDirectionKey(ext, 'internal') === 'unknown' ? 'always' : getRecordingDirectionKey(ext, 'internal'),
      updateRecordingInExternal: false,
      recording_in_external: singleValue(ext, ['recording_in_external'], 'dontcare').toLowerCase(),
      updateRecordingOutExternal: false,
      recording_out_external: singleValue(ext, ['recording_out_external'], 'dontcare').toLowerCase(),
      updateRecordingInInternal: false,
      recording_in_internal: singleValue(ext, ['recording_in_internal'], 'dontcare').toLowerCase(),
      updateRecordingOutInternal: false,
      recording_out_internal: singleValue(ext, ['recording_out_internal'], 'dontcare').toLowerCase(),
      updateRecordingOndemand: false,
      recording_ondemand: singleValue(ext, ['recording_ondemand'], 'disabled').toLowerCase(),
      updateRecordingPriority: false,
      recording_priority: singleValue(ext, ['recording_priority'], '10'),
      updateFindmefollowEnabled: false,
      findmefollow_enabled: normalizeSingleEnabled(getExtField(ext, ['findmefollow_enabled'], 'disabled')),
      updateFindmefollowStrategy: false,
      findmefollow_strategy: singleValue(ext, ['findmefollow_strategy'], 'ringallv2-prim'),
      updateFindmefollowGrptime: false,
      findmefollow_grptime: singleValue(ext, ['findmefollow_grptime'], ''),
      updateFindmefollowGrplist: false,
      findmefollow_grplist: singleValue(ext, ['findmefollow_grplist'], ''),
      updateFindmefollowPostdest: false,
      findmefollow_postdest: singleValue(ext, ['findmefollow_postdest'], ''),
      updateRaw: false,
      rawJson: ''
    });
  };
  const getExtensionSourceLabel = (ext: any) => {
    const key = getExtensionSourceKey(ext);
    if (key === 'merged') return 'BMO + REST';
    if (key === 'bmo') return 'BMO';
    if (key === 'rest') return 'REST';
    return 'Unknown';
  };
  const getExtensionStatusLabel = (ext: any) => {
    const key = getExtensionStatusKey(ext);
    if (key === 'loaded') return 'Loaded';
    if (key === 'warning') return 'Warning';
    return 'Error';
  };
  const getTechLabel = (value: any) => {
    const normalized = typeof value === 'object' ? getExtTech(value) : String(value || 'unknown').toLowerCase();
    if (normalized === 'pjsip') return 'PJSIP';
    if (normalized === 'sip') return 'SIP';
    return 'Нет данных';
  };
  const getBadgeClass = (tone: 'blue' | 'green' | 'slate' | 'amber' | 'rose' | 'indigo') => {
    const tones: Record<string, string> = {
      blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/40',
      green: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/40',
      slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
      amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40',
      rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/40',
      indigo: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/40'
    };
    return 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase ring-1 ' + tones[tone];
  };
  const getTechBadgeClass = (value: any) => getExtTech(value) === 'pjsip' ? getBadgeClass('blue') : getExtTech(value) === 'sip' ? getBadgeClass('green') : getBadgeClass('slate');
  const getRecordingLabel = (value: any) => {
    const key = getRecordingKey(value);
    if (key === 'always') return 'Always';
    if (key === 'ondemand') return 'On Demand';
    if (key === 'never') return 'Never';
    return 'Нет данных';
  };
  const getRecordingDetail = (ext: any) => {
    const flags = getExtRecordingFlags(ext);
    const parts = [
      flags.inExternal && 'in-ext:' + flags.inExternal,
      flags.outExternal && 'out-ext:' + flags.outExternal,
      flags.inInternal && 'in-int:' + flags.inInternal,
      flags.outInternal && 'out-int:' + flags.outInternal,
      flags.ondemand && 'ondemand:' + flags.ondemand,
      flags.priority && 'priority:' + flags.priority
    ].filter(Boolean);
    return parts.length ? parts.join(' | ') : '';
  };
  const getRecordingBadgeClass = (value: any) => {
    const key = getRecordingKey(value);
    if (key === 'always') return getBadgeClass('green');
    if (key === 'ondemand') return getBadgeClass('indigo');
    if (key === 'never') return getBadgeClass('slate');
    return getBadgeClass('amber');
  };
  const getStatusBadgeClass = (ext: any) => {
    const key = getExtensionStatusKey(ext);
    if (key === 'loaded') return getBadgeClass('green');
    if (key === 'warning') return getBadgeClass('amber');
    return getBadgeClass('rose');
  };
  const getSourceBadgeClass = (ext: any) => getExtensionSourceKey(ext) === 'merged' ? getBadgeClass('indigo') : getExtensionSourceKey(ext) === 'bmo' ? getBadgeClass('green') : getExtensionSourceKey(ext) === 'rest' ? getBadgeClass('blue') : getBadgeClass('slate');
  const getPreviewActionClass = (action: string) => {
    const normalized = String(action || '').toLowerCase();
    if (['create', 'success'].includes(normalized)) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400';
    if (normalized === 'update') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
    if (normalized === 'delete') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400';
    if (normalized === 'skip') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    if (['conflict', 'warning'].includes(normalized)) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400';
    if (normalized === 'error') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  };
  const getPreviewCounts = (counts: any) => {
    const safeCounts = counts || {};
    return {
      create: Number(safeCounts.create || 0),
      update: Number(safeCounts.update || 0),
      delete: Number(safeCounts.delete || 0),
      skip: Number(safeCounts.skip || 0),
      conflict: Number(safeCounts.conflict || 0),
      error: Number(safeCounts.error || 0)
    };
  };
  const formatPreviewCounts = (counts: any) => {
    const safeCounts = getPreviewCounts(counts);
    return PREVIEW_COUNT_ITEMS.map(item => item.label + ': ' + safeCounts[item.key]).join(' · ');
  };
  const renderPreviewSummary = (counts: any) => {
    const safeCounts = getPreviewCounts(counts);
    return <div className="grid grid-cols-2 gap-2 md:grid-cols-6">{PREVIEW_COUNT_ITEMS.map(item => <div key={item.key} className="rounded-lg border border-slate-150 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><span className={getBadgeClass(item.tone as any)}>{item.label}</span><div className="mt-2 text-2xl font-black text-slate-850 dark:text-white">{safeCounts[item.key]}</div></div>)}</div>;
  };
  const summarizePreviewValue = (value: any) => {
    if (!value) return '-';
    const keys = ['name', 'displayName', 'tech', 'context', 'outboundCid', 'outboundcid', 'email', 'recording', 'voicemail', 'callWaiting', 'callwaiting', 'emergencyCid', 'recording_in_external', 'recording_out_external', 'recording_in_internal', 'recording_out_internal', 'recording_ondemand'];
    const parts = keys.filter(key => value[key] !== undefined && value[key] !== '').map(key => key + ': ' + String(value[key]));
    return parts.length ? parts.join(' | ') : JSON.stringify(value).slice(0, 160);
  };
  const canApplyExtensionPreview = () => {
    const type = String(extensionPreviewResult?.type || '');
    if (!extensionPreviewResult?.previewId || extensionApplyLoading) return false;
    if (type === 'delete') return deleteConfirmText.trim() === 'DELETE';
    return ['create', 'update'].includes(type);
  };
  const formatDiffValue = (value: any) => value === undefined || value === null || value === '' ? '-' : String(value);
  const handleExtensionApply = async () => {
    if (!extensionPreviewResult?.previewId) { showNoti('info', 'Сначала сформируйте preview'); return; }
    const type = String(extensionPreviewResult.type || '');
    const counts = getPreviewCounts(extensionPreviewResult.counts);
    const endpoint = type === 'create' ? '/api/management/extensions/create-apply' : type === 'update' ? '/api/management/extensions/update-apply' : type === 'delete' ? '/api/freepbx/extensions/bulk-delete' : '';
    if (!endpoint) { showNoti('error', 'Неизвестный тип preview для Apply'); return; }
    if (type === 'delete' && deleteConfirmText.trim() !== 'DELETE') { showNoti('info', 'Введите DELETE для подтверждения удаления'); return; }
    const ok = window.confirm(['Вы действительно хотите применить изменения?', '', 'Create: ' + counts.create, 'Update: ' + counts.update, 'Delete: ' + counts.delete, 'Skip: ' + counts.skip, 'Conflict: ' + counts.conflict, 'Error: ' + counts.error].join('\n'));
    if (!ok) return;
    setExtensionApplyLoading(true);
    try {
      const body = type === 'delete' ? { previewId: extensionPreviewResult.previewId, dryRun: false } : { previewId: extensionPreviewResult.previewId };
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка Apply Extensions');
      setExtensionApplyResult(data);
      await fetchActiveExtensions();
      const applyOk = data.success === true || data.ok === true;
      showNoti(applyOk ? 'success' : 'error', applyOk ? 'Apply выполнен' : 'Apply завершился с ошибками');
    } catch (err: any) { showNoti('error', err.message || 'Ошибка Apply Extensions'); }
    finally { setExtensionApplyLoading(false); }
  };
  const singleInputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white';
  const setSingleChecked = (field: string, checked: boolean) => setSingleUpdateField(field, checked);
  const renderSingleField = (enabledKey: string, valueKey: string, label: string, control: React.ReactNode) => (
    <label className="space-y-1 text-xs">
      <span className="flex items-center gap-2 font-black uppercase text-slate-500 dark:text-slate-400">
        <input type="checkbox" checked={singleUpdateFields[enabledKey] === true} onChange={e => setSingleChecked(enabledKey, e.target.checked)} className="h-4 w-4 rounded" />
        {label}
      </span>
      {control}
    </label>
  );
  const singleTextInput = (key: string, placeholder = '') => <input value={singleUpdateFields[key] || ''} onChange={e => setSingleUpdateField(key, e.target.value)} placeholder={placeholder} className={singleInputClass} />;
  const singleSelect = (key: string, options: Array<{ value: string; label: string }>) => <select value={singleUpdateFields[key] || ''} onChange={e => setSingleUpdateField(key, e.target.value)} className={singleInputClass}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;

  const renderExtensionApplyResult = () => {
    if (!extensionApplyResult) return null;
    const results = Array.isArray(extensionApplyResult.results) ? extensionApplyResult.results : [];
    const isResultOk = (item: any) => item.success === true || item.ok === true;
    const created = results.filter((item: any) => isResultOk(item) && item.action === 'create').length;
    const updated = results.filter((item: any) => isResultOk(item) && item.action === 'update').length;
    const deleted = results.filter((item: any) => isResultOk(item) && item.action === 'delete').length;
    const skipped = results.filter((item: any) => item.action === 'skip').length;
    const failed = results.filter((item: any) => !isResultOk(item)).length;
    return <>
      <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"><div className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Successfully Applied</div><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5"><div><span className={getBadgeClass('green')}>Created</span><div className="mt-1 text-2xl font-black text-slate-850 dark:text-white">{created}</div></div><div><span className={getBadgeClass('indigo')}>Updated</span><div className="mt-1 text-2xl font-black text-slate-850 dark:text-white">{updated}</div></div><div><span className={getBadgeClass('rose')}>Deleted</span><div className="mt-1 text-2xl font-black text-slate-850 dark:text-white">{deleted}</div></div><div><span className={getBadgeClass('slate')}>Skipped</span><div className="mt-1 text-2xl font-black text-slate-850 dark:text-white">{skipped}</div></div><div><span className={failed ? getBadgeClass('rose') : getBadgeClass('green')}>Failed</span><div className="mt-1 text-2xl font-black text-slate-850 dark:text-white">{failed}</div></div></div></div>
      {extensionApplyResult.reloadRequired === true && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">Изменения применены. Требуется fwconsole reload. Автоматически reload не выполнялся.</div>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th className="p-2">extension</th><th className="p-2">action</th><th className="p-2">success/error</th><th className="p-2">message</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{results.map((item: any, idx: number) => <tr key={(item.extension || 'row') + '-' + idx}><td className="p-2 font-mono font-black text-slate-800 dark:text-white">{item.extension || '-'}</td><td className="p-2"><span className={getPreviewActionClass(item.action || '')}>{item.action || '-'}</span></td><td className="p-2"><span className={isResultOk(item) ? getBadgeClass('green') : getBadgeClass('rose')}>{isResultOk(item) ? 'success' : 'error'}</span></td><td className="p-2 text-slate-600 dark:text-slate-300">{item.message || '-'}</td></tr>)}</tbody></table></div>
    </>;
  };
  const handleCreatePreview = async () => {
    setExtensionPreviewLoading(true);
    try {
      const res = await fetch('/api/management/extensions/create-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: createMode, conflictMode: createConflictMode, startExt: createStartExt, endExt: createEndExt, manualList: createManualList, csvText: createCsvText, nameMask: createNameMask, secretMode: createSecretMode, fixedSecret: createSecretMode === 'fixed' ? createFixedSecret : undefined, secretMask: createSecretMode === 'mask' ? createSecretMask : undefined, technology: createTechnology, context: createContext, outboundCid: createOutboundCid, emailDomain: createEmailDomain, voicemail: createVoicemail, recording: createRecording, callWaiting: createCallWaiting, emergencyCid: createEmergencyCid, rawJson: { ...extensionUiSettings.defaultValues, ...parseUiRawJson(createRawJson) } })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка preview создания');
      setExtensionPreviewResult(data);
      setExtensionApplyResult(null);
      showNoti('success', `Preview создания сформирован: ${data.previewId}`);
    } catch (err: any) { showNoti('error', err.message || 'Ошибка preview создания'); }
    finally { setExtensionPreviewLoading(false); }
  };
  const handleUpdatePreview = async () => {
    if (selectedExtensionIds.length === 0) { showNoti('info', 'Выберите extensions для массового изменения'); return; }
    setExtensionPreviewLoading(true);
    try {
      const res = await fetch('/api/management/extensions/update-preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ selectedExtensions: selectedExtensionIds, patchFields: updateFields }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка preview изменения');
      setExtensionPreviewResult(data);
      setExtensionApplyResult(null);
      showNoti('success', `Preview изменения сформирован: ${data.previewId}`);
    } catch (err: any) { showNoti('error', err.message || 'Ошибка preview изменения'); }
    finally { setExtensionPreviewLoading(false); }
  };
  const buildSingleUpdatePatchFields = () => {
    const rawPatch: Record<string, any> = {};
    const patchFields: Record<string, any> = {
      updateName: singleUpdateFields.updateName === true,
      name: singleUpdateFields.name,
      updateOutboundCid: singleUpdateFields.updateOutboundCid === true,
      outboundCid: singleUpdateFields.outboundCid,
      updateCallWaiting: singleUpdateFields.updateCallWaiting === true,
      callWaiting: singleUpdateFields.callWaiting === 'enabled'
    };
    const addRaw = (enabledKey: string, fieldKey: string) => {
      if (singleUpdateFields[enabledKey] === true) rawPatch[fieldKey] = singleUpdateFields[fieldKey];
    };
    Object.assign(rawPatch, buildRecordingRawPatch(
      singleUpdateFields.updateRecordingInbound === true ? singleUpdateFields.recordingInbound : 'nochange',
      singleUpdateFields.updateRecordingOutbound === true ? singleUpdateFields.recordingOutbound : 'nochange',
      singleUpdateFields.updateRecordingInternal === true ? singleUpdateFields.recordingInternal : 'nochange'
    ));
    addRaw('updateEmergencyCid', 'emergency_cid');
    addRaw('updateVoicemail', 'voicemail');
    addRaw('updateRecordingInExternal', 'recording_in_external');
    addRaw('updateRecordingOutExternal', 'recording_out_external');
    addRaw('updateRecordingInInternal', 'recording_in_internal');
    addRaw('updateRecordingOutInternal', 'recording_out_internal');
    addRaw('updateRecordingOndemand', 'recording_ondemand');
    addRaw('updateRecordingPriority', 'recording_priority');
    addRaw('updateFindmefollowEnabled', 'findmefollow_enabled');
    addRaw('updateFindmefollowStrategy', 'findmefollow_strategy');
    addRaw('updateFindmefollowGrptime', 'findmefollow_grptime');
    addRaw('updateFindmefollowGrplist', 'findmefollow_grplist');
    addRaw('updateFindmefollowPostdest', 'findmefollow_postdest');
    if (Object.keys(rawPatch).length > 0) {
      patchFields.updateRaw = true;
      patchFields.rawJson = JSON.stringify(rawPatch);
    } else {
      patchFields.updateRaw = false;
      patchFields.rawJson = '';
    }
    return patchFields;
  };
  const hasSingleCheckedFields = () => Object.keys(singleUpdateFields).some((key) => key.startsWith('update') && singleUpdateFields[key] === true);
  const handleSingleUpdatePreview = async () => {
    const extension = String(singleExtensionEdit?.extension || '').trim();
    if (!extension) { showNoti('info', 'Выберите extension для редактирования'); return; }
    if (!hasSingleCheckedFields()) { showNoti('info', 'Отметьте хотя бы одно поле для изменения'); return; }
    const patchFields = buildSingleUpdatePatchFields();
    setExtensionPreviewLoading(true);
    try {
      const res = await fetch('/api/management/extensions/update-preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ selectedExtensions: [extension], patchFields }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка preview изменения');
      setExtensionPreviewResult(data);
      setExtensionApplyResult(null);
      showNoti('success', `Preview изменения ${extension} сформирован: ${data.previewId}`);
    } catch (err: any) { showNoti('error', err.message || 'Ошибка preview изменения'); }
    finally { setExtensionPreviewLoading(false); }
  };
  const handleDeletePreview = async () => {
    if (selectedExtensionIds.length === 0) { showNoti('info', 'Выберите extensions в таблице выше'); return; }
    setExtensionPreviewLoading(true);
    try {
      const res = await fetch('/api/freepbx/extensions/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ extensions: selectedExtensionIds, dryRun: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка preview удаления');
      setDeleteConfirmText('');
      setExtensionPreviewResult(data);
      setExtensionApplyResult(null);
      showNoti(data.ok ? 'success' : 'error', data.ok ? `Preview удаления сформирован: ${data.previewId}` : 'Preview удаления содержит ошибки');
    } catch (err: any) { showNoti('error', err.message || 'Ошибка preview удаления'); }
    finally { setExtensionPreviewLoading(false); }
  };

  // MAC Phone assignment List inside extensions
  const [macAssignText, setMacAssignText] = useState("200;805EC0AABB01;Yealink T31P\n201;805EC0AABB02;Yealink T31P");
  const [applyMacs, setApplyMacs] = useState(false);

  // --- TRUNKS WIZARD STATE ---
  const [trunkOperator, setTrunkOperator] = useState('MTT');
  const [trunkName, setTrunkName] = useState('MTT_Trunk_Main');
  const [trunkTech, setTrunkTech] = useState<'sip' | 'pjsip'>('pjsip');
  const [trunkHost, setTrunkHost] = useState('sip.mtt.ru');
  const [trunkPort, setTrunkPort] = useState(5060);
  const [trunkProxy, setTrunkProxy] = useState('');
  const [trunkUser, setTrunkUser] = useState('74951234567');
  const [trunkAuthUser, setTrunkAuthUser] = useState('74951234567_auth');
  const [trunkPassword, setTrunkPassword] = useState('S1pP@ssw0rd!');
  const [trunkMaxChannels, setTrunkMaxChannels] = useState(30);
  const [trunkOutboundCID, setTrunkOutboundCID] = useState('74951234567');
  
  const [trunkTemplates, setTrunkTemplates] = useState<any[]>([]);
  const [selectedTrunkTemplate, setSelectedTrunkTemplate] = useState('');
  const [trunkPreviewData, setTrunkPreviewData] = useState<any>(null);
  const [trunkIsLoading, setTrunkIsLoading] = useState(false);

  // --- OUTBOUND ROUTES STATE ---
  const [routeName, setRouteName] = useState('OUTBOUND_MOBILE_RF');
  const [routeTrunks, setRouteTrunks] = useState<string[]>([]);
  const [routeDialPatterns, setRouteDialPatterns] = useState<string>('79XXXXXXXXX\n89XXXXXXXXX');
  const [routePreviewData, setRoutePreviewData] = useState<any>(null);
  const [routeIsLoading, setRouteIsLoading] = useState(false);
  const [existingTrunksList, setExistingTrunksList] = useState<any[]>([]);

  // --- DID / INBOUND ROUTING STATE ---
  const [didCsvText, setDidCsvText] = useState("74957654321;extension;200;Основная линия\n74957654322;queue;500;Очередь продаж");
  const [didPreviewData, setDidPreviewData] = useState<any>(null);
  const [didIsLoading, setDidIsLoading] = useState(false);

  // --- CHANGELOG / ROLLBACKS ---
  const [changelogs, setChangelogs] = useState<any[]>([]);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // --- BRanch Builder Master state ---
  const [branchName, setBranchName] = useState('Филиал Симферополь');
  const [branchRangeStart, setBranchRangeStart] = useState('500');
  const [branchRangeEnd, setBranchRangeEnd] = useState('515');
  const [branchTrunkOp, setBranchTrunkOp] = useState('МТТ');
  const [branchTrunkHost, setBranchTrunkHost] = useState('sip.mtt.ru');
  const [branchTrunkUser, setBranchTrunkUser] = useState('79781230011');
  const [branchTrunkPass, setBranchTrunkPass] = useState('PassW0rdSimf!');
  const [branchQueues, setBranchQueues] = useState<string>('Продажи, Техподдержка');
  const [branchTimeZone, setBranchTimeZone] = useState('MSK (UTC+3)');
  const [branchResultPreview, setBranchResultPreview] = useState<any>(null);

  // --- COMPANY TEMPLATES STATE ---
  const [selectedCompanyType, setSelectedCompanyType] = useState<string>('');
  const companyTemplates = {
    'small-office': {
      title: 'Малый офис (до 20 сотрудников)',
      extRange: '100-120',
      patterns: '7XXXXXXXXXX\n8XXXXXXXXXX',
      queues: 'Секретариат'
    },
    'call-center': {
      title: 'Колл-центр (до 100 операторов со стереозаписью)',
      extRange: '200-300',
      patterns: '79XXXXXXXXX\n7495XXXXXXX',
      queues: 'Линия-1, Линия-2, Консультации'
    },
    'shop': {
      title: 'Интернет-магазин (сопровождение заказов)',
      extRange: '300-350',
      patterns: '7XXXXXXXXXX\n8800XXXXXXX',
      queues: 'Продажи, Доставка'
    },
    'clinic': {
      title: 'Медицинский центр / Стоматология',
      extRange: '400-430',
      patterns: '7XXXXXXXXXX',
      queues: 'Регистратура, Справка'
    }
  };

  // Pre-load data
  useEffect(() => {
    fetchNumberingDatabase();
    fetchTrunkTemplates();
    fetchExtensionTemplates();
    fetchChangelogs();
    fetchExistingTrunks();
  }, [activeTab]);

  const fetchExistingTrunks = async () => {
    try {
      const res = await fetch('/api/db-explorer/tables', {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Fallback trunks query or config load
      setExistingTrunksList([
        { id: 't1', name: 'RT_Trunk_Main', host: 'rt.ru', tech: 'sip' },
        { id: 't2', name: 'MTT_Trunk_Reserve', host: 'sip.mtt.ru', tech: 'pjsip' }
      ]);
    } catch (e) {}
  };

  const fetchNumberingDatabase = async () => {
    try {
      const searchParam = numQuery ? `&search=${encodeURIComponent(numQuery)}` : '';
      const res = await fetch(`/api/management/numbering-capacity?page=${numPage}&limit=${numLimit}${searchParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setNumPages(json.data);
        setNumMeta(json.meta);
        setNumTotal(json.pagination.total);
      }
    } catch (e) {}
  };

  const fetchTrunkTemplates = async () => {
    try {
      const res = await fetch('/api/management/trunk-templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTrunkTemplates(data);
      }
    } catch (e) {}
  };

  const fetchExtensionTemplates = async () => {
    try {
      const res = await fetch('/api/management/extension-templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setExtTemplates(data);
      }
    } catch (e) {}
  };

  const fetchChangelogs = async () => {
    try {
      const res = await fetch('/api/management/change-log', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setChangelogs(data);
      }
    } catch (e) {}
  };

  // Actions
  const handleOperatorSearch = async () => {
    if (!numSearch) return;
    try {
      const res = await fetch(`/api/management/numbering-capacity/search?phone=${encodeURIComponent(numSearch)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setNumSearchResult(data);
    } catch (e) {
      showNoti('error', 'Ошибка поиска по номерной емкости.');
    }
  };

  const syncNumberingDb = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/management/numbering-capacity/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNoti('success', data.message || 'Синхронизация успешно завершена.');
        fetchNumberingDatabase();
      } else {
        showNoti('error', data.error || 'Ошибка синхронизации.');
      }
    } catch (e) {
      showNoti('error', 'Реестр opendata временно недоступен. Загружен локальный кэш номерной емкости.');
    } finally {
      setIsSyncing(false);
    }
  };

  const importNumberingCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const res = await fetch('/api/management/numbering-capacity/import', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ rawCsv: text })
        });
        const data = await res.json();
        if (data.success) {
          showNoti('success', data.message);
          fetchNumberingDatabase();
        } else {
          showNoti('error', data.error);
        }
      } catch (err) {
        showNoti('error', 'Ошибка парсинга CSV-файла.');
      }
    };
    reader.readAsText(file);
  };

  // Apply extensions template loading
  const handleExtTemplateChange = (id: string) => {
    setSelectedExtTemplate(id);
    const template = extTemplates.find(t => t.id === id);
    if (template) {
      setExtTech(template.tech);
      setExtRecording(template.recording);
      setExtVoicemail(template.voicemail);
      setExtPasswordComplexity(template.passwordPolicy);
    }
  };

  // Preview Extensions
  const handleExtPreview = async () => {
    setExtIsLoading(true);
    try {
      let payload: any = {};
      
      if (extMode === 'range') {
        payload = {
          startExt: extRangeStart,
          endExt: extRangeEnd,
          namePattern: extNamePattern,
          tech: extTech,
          voicemail: extVoicemail,
          recording: extRecording
        };
      } else if (extMode === 'manual') {
        const entries = extManualText.split('\n').map(line => {
          const parts = line.split(';');
          return {
            extension: parts[0]?.trim(),
            name: parts[1]?.trim(),
            department: parts[2]?.trim() || 'Отдел продаж'
          };
        }).filter(x => x.extension);

        payload = { entries };
      } else if (extMode === 'file') {
        if (!extFileText) {
          showNoti('error', 'Пожалуйста, сначала выберите файл CSV для загрузки');
          setExtIsLoading(false);
          return;
        }
        payload = { rawCsv: extFileText };
      } else if (extMode === 'edit-active') {
        if (activeExtensions.length === 0) {
          showNoti('error', 'Список абонентов пуст. Пожалуйста, сначала загрузите их с АТС.');
          setExtIsLoading(false);
          return;
        }
        payload = { entries: activeExtensions };
      }

      const res = await fetch('/api/management/extensions/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mode: extMode, payload })
      });
      const data = await res.json();
      if (data.success) {
        setExtPreviewData(data);
        setExtStep('preview');
      } else {
        showNoti('error', data.error);
      }
    } catch (e) {
      showNoti('error', 'Ошибка составления предпросмотра.');
    } finally {
      setExtIsLoading(false);
    }
  };

  // Apply Extensions
  const handleExtApply = async (dryRunOverride?: boolean) => {
    if (!extPreviewData?.generated) return;
    const dryRun = dryRunOverride !== undefined ? dryRunOverride : isDryRun;

    try {
      const res = await fetch('/api/management/extensions/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          generated: extPreviewData.generated,
          dryRun
        })
      });
      const data = await res.json();
      if (data.success) {
        showNoti('success', data.message);
        if (!dryRun) {
          setExtStep('success');
        }
      } else {
        showNoti('error', data.error);
      }
    } catch (e: any) {
      showNoti('error', 'Произошла непредвиденная ошибка на сервере.');
    }
  };

  // Preset operator templates loaded
  const handleTrunkOperatorChange = (op: string) => {
    setTrunkOperator(op);
    const preset = trunkTemplates.find(t => t.operator === op);
    if (preset) {
      setTrunkName(`${op}_Trunk_Main`);
      setTrunkTech(preset.tech);
      setTrunkHost(preset.host);
      setTrunkPort(preset.port);
      setTrunkProxy(preset.outboundProxy);
      setTrunkMaxChannels(preset.maxChannels);
    } else {
      setTrunkName(`${op}_Trunk_Custom`);
    }
  };

  // Preview Trunks
  const handleTrunkPreview = async () => {
    setTrunkIsLoading(true);
    try {
      const payload = {
        name: trunkName,
        tech: trunkTech,
        host: trunkHost,
        port: trunkPort,
        transport: 'udp',
        username: trunkUser,
        authUsername: trunkAuthUser,
        registrationString: `${trunkUser}:${trunkPassword}@${trunkHost}/${trunkUser}`
      };
      const res = await fetch('/api/management/trunks/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ payload })
      });
      const data = await res.json();
      if (data.success) {
        setTrunkPreviewData(data);
        setTrunkStep('preview');
      } else {
        showNoti('error', data.error);
      }
    } catch (e) {
      showNoti('error', 'Ошибка построения транка.');
    } finally {
      setTrunkIsLoading(false);
    }
  };

  const handleTrunkApply = async (dryRunOverride?: boolean) => {
    if (!trunkPreviewData?.generated) return;
    const dryRun = dryRunOverride !== undefined ? dryRunOverride : isDryRun;

    try {
      const res = await fetch('/api/management/trunks/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          generated: trunkPreviewData.generated,
          dryRun
        })
      });
      const data = await res.json();
      if (data.success) {
        showNoti('success', data.message);
        if (!dryRun) {
          setTrunkStep('success');
        }
      } else {
        showNoti('error', data.error);
      }
    } catch (e) {
      showNoti('error', 'Ошибка применения транка');
    }
  };

  // Outbound routes preview
  const handleRoutePreview = async () => {
    setRouteIsLoading(true);
    try {
      const payload = {
        name: routeName,
        trunks: routeTrunks,
        patterns: routeDialPatterns.split('\n').filter(Boolean)
      };
      const res = await fetch('/api/management/outbound-routes/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ payload })
      });
      const data = await res.json();
      if (data.success) {
        setRoutePreviewData(data);
        setRouteStep('preview');
      }
    } catch (e) {
      showNoti('error', 'Ошибка исходящего маршрутизатора');
    } finally {
      setRouteIsLoading(false);
    }
  };

  const handleRouteApply = async (dryRunOverride?: boolean) => {
    if (!routePreviewData?.generated) return;
    const dryRun = dryRunOverride !== undefined ? dryRunOverride : isDryRun;

    try {
      const res = await fetch('/api/management/outbound-routes/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          generated: routePreviewData.generated,
          dryRun
        })
      });
      const data = await res.json();
      if (data.success) {
        showNoti('success', data.message);
        if (!dryRun) {
          setRouteStep('success');
        }
      }
    } catch (e) {}
  };

  // DID handlers
  const handleDidPreview = async () => {
    setDidIsLoading(true);
    try {
      const entries = didCsvText.split('\n').map(line => {
        const parts = line.split(';');
        return {
          did: parts[0]?.trim(),
          destinationType: parts[1]?.trim() || 'extension',
          destination: parts[2]?.trim() || '200',
          description: parts[3]?.trim() || 'Импортированная CID линия'
        };
      }).filter(x => x.did);

      const res = await fetch('/api/management/did/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ entries })
      });
      const data = await res.json();
      if (data.success) {
        setDidPreviewData(data);
        setDidStep('preview');
      }
    } catch (e) {} finally {
      setDidIsLoading(false);
    }
  };

  const handleDidApply = async (dryRunOverride?: boolean) => {
    if (!didPreviewData?.generated) return;
    const dryRun = dryRunOverride !== undefined ? dryRunOverride : isDryRun;

    try {
      const res = await fetch('/api/management/did/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          generated: didPreviewData.generated,
          dryRun
        })
      });
      const data = await res.json();
      if (data.success) {
        showNoti('success', data.message);
        if (!dryRun) {
          setDidStep('success');
        }
      }
    } catch (e) {}
  };

  // Branch Builder apply
  const handleBranchPreview = () => {
    const start = parseInt(branchRangeStart, 10);
    const end = parseInt(branchRangeEnd, 10);
    if (isNaN(start) || isNaN(end) || start > end) {
      showNoti('error', 'Задан неверный диапазон филиала.');
      return;
    }

    const queuesList = branchQueues.split(',').map(q => q.trim()).filter(Boolean);
    const linesCount = end - start + 1;

    setBranchResultPreview({
      branchName,
      linesCount,
      startExt: branchRangeStart,
      endExt: branchRangeEnd,
      trunkName: `TRUNK_${branchTrunkOp}_${branchName.toUpperCase().replace(/\s+/g, '_')}`,
      queuesList,
      dialPattern: `7978${branchRangeStart.substring(0, 1)}XXXXX`
    });
  };

  const handleBranchDeploy = async () => {
    if (!branchResultPreview) return;
    try {
      // Create Trunk
      const trunkRes = await fetch('/api/management/trunks/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          generated: [{
            name: branchResultPreview.trunkName,
            tech: 'pjsip',
            host: branchTrunkHost
          }],
          dryRun: false
        })
      });

      // Create Extensions
      const generatedExts: any[] = [];
      const start = parseInt(branchResultPreview.startExt, 10);
      const end = parseInt(branchResultPreview.endExt, 10);
      for (let ext = start; ext <= end; ext++) {
        generatedExts.push({
          extension: String(ext),
          name: `Сотрудник ${ext} (${branchResultPreview.branchName})`,
          tech: 'pjsip',
          email: `${ext}@company.ru`,
          recording: 'always'
        });
      }

      await fetch('/api/management/extensions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ generated: generatedExts, dryRun: false })
      });

      // Create outbound path
      await fetch('/api/management/outbound-routes/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          generated: [{
            name: `ROUTE_${branchName.toUpperCase().replace(/\s+/g, '_')}`,
            trunks: [branchResultPreview.trunkName],
            patterns: ['7XXXXXXXXXX']
          }],
          dryRun: false
        })
      });

      showNoti('success', `Филиал ${branchName} успешно развернут под ключ! Создано ${linesCountString(branchResultPreview.linesCount)} экстеншенов, маршрут и PJSIP транк.`);
      setBranchResultPreview(null);
    } catch (e) {
      showNoti('error', 'Ошибка при комплексной активации филиала.');
    }
  };

  // Helper linesCount string formatting
  const linesCountString = (cnt: number) => {
    return `${cnt}`;
  };

  // Rollback Action
  const handleRollback = async (id: string) => {
    setIsRollingBack(true);
    try {
      const res = await fetch('/api/management/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ logId: id })
      });
      const data = await res.json();
      if (data.success) {
        showNoti('success', data.message);
        fetchChangelogs();
      } else {
        showNoti('error', data.error);
      }
    } catch (e: any) {
      showNoti('error', 'Пакетный откат не удался.');
    } finally {
      setIsRollingBack(false);
    }
  };

  // Load custom preset pattern to Routes dial pattern
  const loadNumRangeIntoRoute = (record: any) => {
    const pattern = `7${record.def}${record.start.substring(0, 1)}XXXXXX`;
    setRouteDialPatterns(pattern);
    setActiveTab('routes');
    setRouteName(`ROUTE_RU_${record.operator.toUpperCase()}`);
    showNoti('info', `Паттерн набора ${pattern} загружен из номерной емкости.`);
  };

  // Load design/templates based on industry company profile
  const handleCompanyTemplateSelect = (key: string) => {
    setSelectedCompanyType(key);
    const tmpl = (companyTemplates as any)[key];
    if (tmpl) {
      const parts = tmpl.extRange.split('-');
      setExtRangeStart(parts[0]);
      setExtRangeEnd(parts[1]);
      setExtNamePattern('Менеджер #{EXT}');
      setBranchQueues(tmpl.queues);
      setRouteDialPatterns(tmpl.patterns);
      showNoti('info', `Загружен отраслевой пресет: ${tmpl.title}`);
    }
  };


  const resetExtensionOperationState = () => {
    setExtensionPreviewResult(null);
    setExtensionApplyResult(null);
    setDeleteConfirmText('');
  };
  const normalizePreviewStatus = (item: any): ActionStatus => {
    const rawStatus = String(item?.status || '').trim().toLowerCase();
    const rawAction = String(item?.action || '').trim().toLowerCase();
    if (rawStatus === 'success' || rawAction === 'create' || rawAction === 'update' || rawAction === 'delete') return 'SUCCESS';
    if (rawStatus === 'warning') return 'WARNING';
    if (rawStatus === 'error' || rawAction === 'error') return 'ERROR';
    if (rawStatus === 'conflict' || rawAction === 'conflict') return 'CONFLICT';
    if (rawStatus === 'skip' || rawAction === 'skip') return 'SKIP';
    return 'SUCCESS';
  };
  const normalizeOperationPreviewItems = (items: any[]): OperationPreviewItem[] => items.map((item) => ({
    object: String(item.extension || item.object || item.id || '-'),
    action: String(item.action || '-').toUpperCase(),
    status: normalizePreviewStatus(item),
    oldValue: item.before,
    newValue: item.after,
    message: String(item.message || ''),
    diff: item.diff
  }));
  const renderOperationResult = () => {
    if (!extensionApplyResult) return null;
    return (
      <div className="space-y-3">
        <OperationHeader icon={Check} title="Result" description={extensionApplyResult.message || 'Apply result for the latest preview.'} />
        {renderExtensionApplyResult()}
      </div>
    );
  };

  const renderExtensionsWorkspace = () => {
    const workspaceTabs: Array<{ id: ExtensionWorkspaceTab; label: string; icon: any; operation: OperationType }> = [
      { id: 'bulk-update', label: 'Массовое изменение', icon: Edit, operation: 'UPDATE' },
      { id: 'bulk-create', label: 'Массовое создание', icon: ListPlus, operation: 'CREATE' },
      { id: 'delete', label: 'Удаление', icon: Trash2, operation: 'DELETE' },
      { id: 'csv-import', label: 'CSV / Импорт', icon: FileSpreadsheet, operation: 'IMPORT' }
    ];
    const currentTab = workspaceTabs.find(tab => tab.id === extensionWorkspaceTab) || workspaceTabs[0];
    const selectedHint = selectedExtensionIds.length === 0 ? <p className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-300">Выберите extensions в таблице выше</p> : null;
    const isDeletePreview = String(extensionPreviewResult?.type || '') === 'delete';
    const previewItems = normalizeOperationPreviewItems(Array.isArray(extensionPreviewResult?.items) ? extensionPreviewResult.items : []);
    const previewCounts = getPreviewCounts(extensionPreviewResult?.counts);
    const sectionDef = PROVISIONING_SECTIONS.find(section => section.id === 'extensions');
    const operationMeta = <StatusBadge tone="info">{currentTab.operation}</StatusBadge>;
    const inputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white';

    const previewHandler = currentTab.id === 'bulk-create' ? handleCreatePreview : currentTab.id === 'delete' ? handleDeletePreview : currentTab.id === 'csv-import' ? () => { setCreateMode('csv'); setExtensionWorkspaceTab('bulk-create'); showNoti('info', 'CSV Preview выполняется во вкладке Массовое создание.'); } : handleUpdatePreview;
    const previewDisabled = currentTab.id === 'bulk-update' ? selectedExtensionIds.length === 0 : currentTab.id === 'delete' ? selectedExtensionIds.length === 0 : false;

    const renderOperationParameters = () => {
      if (currentTab.id === 'bulk-update') {
        return (
          <div className="space-y-4">
            <OperationHeader icon={Edit} title="Параметры операции" description="Отметьте поля, которые будут изменены для выбранных extensions." meta={<StatusBadge tone={selectedExtensionIds.length ? 'success' : 'neutral'}>Selected {selectedExtensionIds.length}</StatusBadge>} />
            {selectedHint}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs"><span><input type="checkbox" checked={updateFields.updateDisplayName} onChange={e => setUpdateField('updateDisplayName', e.target.checked)} /> DisplayName mask</span><input value={updateFields.displayName} onChange={e => setUpdateField('displayName', e.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs"><span className="font-black uppercase text-slate-500 dark:text-slate-400">Recording</span><select value={updateFields.updateRecording ? updateFields.recording : 'nochange'} onChange={e => { const value = e.target.value; setUpdateFields(prev => ({ ...prev, updateRecording: value !== 'nochange', recording: value === 'nochange' ? prev.recording : value })); }} className={inputClass}><option value="nochange">Не менять</option><option value="always">Always</option><option value="optional">On Demand</option><option value="never">Never</option></select></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={updateFields.updateVoicemail} disabled onChange={e => setUpdateField('updateVoicemail', e.target.checked)} /> Voicemail <input type="checkbox" checked={updateFields.voicemail} disabled onChange={e => setUpdateField('voicemail', e.target.checked)} /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={updateFields.updateCallWaiting} onChange={e => setUpdateField('updateCallWaiting', e.target.checked)} /> Call Waiting <input type="checkbox" checked={updateFields.callWaiting} onChange={e => setUpdateField('callWaiting', e.target.checked)} /></label>
              <label className="space-y-1 text-xs"><span><input type="checkbox" checked={updateFields.updateOutboundCid} onChange={e => setUpdateField('updateOutboundCid', e.target.checked)} /> Outbound CID</span><input value={updateFields.outboundCid} onChange={e => setUpdateField('outboundCid', e.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs"><span><input type="checkbox" checked={updateFields.updateContext} disabled onChange={e => setUpdateField('updateContext', e.target.checked)} /> Context</span><input value={updateFields.context} disabled onChange={e => setUpdateField('context', e.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs"><span><input type="checkbox" checked={updateFields.updateEmergencyCid} disabled onChange={e => setUpdateField('updateEmergencyCid', e.target.checked)} /> Emergency CID</span><input value={updateFields.emergencyCid} disabled onChange={e => setUpdateField('emergencyCid', e.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs"><span><input type="checkbox" checked={updateFields.updateEmailDomain} disabled onChange={e => setUpdateField('updateEmailDomain', e.target.checked)} /> Email domain</span><input value={updateFields.emailDomain} disabled onChange={e => setUpdateField('emailDomain', e.target.value)} placeholder="example.com" className={inputClass} /></label>
            </div>
            <label className="block space-y-1 text-xs"><span><input type="checkbox" checked={updateFields.updateRaw} disabled onChange={e => setUpdateField('updateRaw', e.target.checked)} /> Raw JSON advanced params</span><textarea value={updateFields.rawJson} disabled onChange={e => setUpdateField('rawJson', e.target.value)} rows={3} className={inputClass + ' font-mono'} /></label>
          </div>
        );
      }

      if (currentTab.id === 'bulk-create') {
        return (
          <div className="space-y-4">
            <OperationHeader icon={ListPlus} title="Параметры операции" description="Range, Manual или CSV с едиными параметрами создания." meta={operationMeta} />
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              <InfoCard label="Последний Extension" value={extensionNumberPlan.last ?? '-'} />
              <InfoCard label="Следующий свободный" value={extensionNumberPlan.nextFree ?? '-'} tone="success" />
              <InfoCard label="Первая свободная дырка" value={extensionNumberPlan.firstGap ?? '-'} tone="warning" />
            </div>
            <div className="rounded-lg border border-slate-150 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60">Доступно локальных шаблонов: <span className="font-black text-slate-850 dark:text-white">{extTemplates.length}</span>. Выбор шаблона останется отдельным расширением.</div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setCreateMode('range')} className={createMode === 'range' ? 'rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-bold text-white' : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}>Range</button><button type="button" onClick={() => setCreateMode('manual')} className={createMode === 'manual' ? 'rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-bold text-white' : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}>Manual</button><button type="button" onClick={() => setCreateMode('csv')} className={createMode === 'csv' ? 'rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-bold text-white' : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}>CSV</button></div>
            {createMode === 'range' ? <div className="grid grid-cols-2 gap-3"><input value={createStartExt} onChange={e => setCreateStartExt(e.target.value)} placeholder="Start" className={inputClass} /><input value={createEndExt} onChange={e => setCreateEndExt(e.target.value)} placeholder="End" className={inputClass} /></div> : createMode === 'manual' ? <textarea value={createManualList} onChange={e => setCreateManualList(e.target.value)} rows={4} placeholder={['200', '201', '202'].join('\n')} className={inputClass + ' font-mono'} /> : <textarea value={createCsvText} onChange={e => setCreateCsvText(e.target.value)} rows={4} placeholder={['extension,name', '200,User 200', '201,User 201'].join('\n')} className={inputClass + ' font-mono'} />}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><input value={createNameMask} onChange={e => setCreateNameMask(e.target.value)} placeholder="Name mask: User {ext}" className={inputClass} /><select value={createSecretMode} onChange={e => setCreateSecretMode(e.target.value as any)} className={inputClass}><option value="auto">Secret auto</option><option value="fixed">Secret fixed</option><option value="mask">Secret mask</option></select>{createSecretMode === 'fixed' && <input value={createFixedSecret} onChange={e => setCreateFixedSecret(e.target.value)} type="password" placeholder="Fixed secret" className={inputClass} />}{createSecretMode === 'mask' && <input value={createSecretMask} onChange={e => setCreateSecretMask(e.target.value)} placeholder="pbx{ext}!" className={inputClass} />}<select value={createConflictMode} onChange={e => setCreateConflictMode(e.target.value as any)} className={inputClass}><option value="fill-missing">Fill Missing</option><option value="strict">Strict</option></select><select value={createTechnology} onChange={e => setCreateTechnology(e.target.value as any)} className={inputClass}><option value="pjsip">PJSIP</option><option value="sip">SIP</option></select><input value={createContext} onChange={e => setCreateContext(e.target.value)} placeholder="Context" className={inputClass} /><input value={createOutboundCid} onChange={e => setCreateOutboundCid(e.target.value)} placeholder="Outbound CID" className={inputClass} /><input value={createEmailDomain} onChange={e => setCreateEmailDomain(e.target.value)} placeholder="Email domain" className={inputClass} /><select value={createRecording} onChange={e => setCreateRecording(e.target.value)} className={inputClass}><option value="always">Recording always</option><option value="optional">Recording on demand</option><option value="never">Recording never</option></select><input value={createEmergencyCid} onChange={e => setCreateEmergencyCid(e.target.value)} placeholder="Emergency CID" className={inputClass} /></div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300"><label className="flex items-center gap-2"><input type="checkbox" checked={createVoicemail} onChange={e => setCreateVoicemail(e.target.checked)} /> Voicemail</label><label className="flex items-center gap-2"><input type="checkbox" checked={createCallWaiting} onChange={e => setCreateCallWaiting(e.target.checked)} /> Call Waiting</label></div>
            <textarea value={createRawJson} onChange={e => setCreateRawJson(e.target.value)} rows={3} placeholder="Raw JSON advanced params" className={inputClass + ' font-mono'} />
          </div>
        );
      }

      if (currentTab.id === 'delete') {
        return (
          <div className="space-y-4">
            <OperationHeader icon={Trash2} title="Параметры операции" description="Preview удаления проверяет extensions на АТС. Apply доступен только после подтверждения DELETE." meta={<StatusBadge tone={selectedExtensionIds.length ? 'error' : 'neutral'}>Selected {selectedExtensionIds.length}</StatusBadge>} />
            {selectedHint}
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">Вы собираетесь удалить {selectedExtensionIds.length} extensions. Это действие может повлиять на маршрутизацию, записи, пользователей и устройства. Автоматический fwconsole reload не выполняется.</div>
            {isDeletePreview && <label className="block max-w-sm space-y-1 text-xs"><span className="font-black uppercase text-slate-500 dark:text-slate-400">Введите DELETE для Apply</span><input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className={inputClass + ' font-mono'} /></label>}
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <OperationHeader icon={FileSpreadsheet} title="Параметры операции" description="CSV / Импорт подготовлен как отдельная операция; текущий CSV create использует общий Preview вкладки Массовое создание." meta={operationMeta} />
          <div className="rounded-lg border border-dashed border-slate-200 p-5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300">Центр CSV / Импорт подготовлен для будущей проверки CSV перед Apply. Для текущего create-preview переключитесь в CSV режим массового создания.</div>
          <Toolbar><PrimaryButton onClick={() => { setCreateMode('csv'); setExtensionWorkspaceTab('bulk-create'); }}><Upload className="h-4 w-4" />CSV Create</PrimaryButton><SecondaryButton onClick={downloadCsvTemplate}><Download className="h-4 w-4" />CSV Template</SecondaryButton></Toolbar>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1">
              {workspaceTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} type="button" onClick={() => setExtensionWorkspaceTab(tab.id)} className={extensionWorkspaceTab === tab.id ? 'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white' : 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}>
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1 text-[10px] font-black uppercase text-slate-400">
              {sectionDef?.operationTypes.map(type => <span key={type} className="rounded-full border border-slate-200 px-2 py-1 dark:border-slate-700">{type}</span>)}
            </div>
          </div>
          <div className="space-y-5 p-5">
            {renderOperationParameters()}
            <DesignOperationToolbar onPreview={previewHandler} onApply={handleExtensionApply} onReset={resetExtensionOperationState} previewDisabled={previewDisabled} applyDisabled={!canApplyExtensionPreview()} previewLoading={extensionPreviewLoading} applyLoading={extensionApplyLoading} />
          </div>
        </Card>

        <Card className="p-5">
          <OperationHeader icon={FileText} title="Preview" description="Единый Preview для Create, Update, Delete, Import и будущих модулей." />
          {extensionPreviewResult ? (
            <div className="mt-4 space-y-4">
              <OperationSummary items={PREVIEW_COUNT_ITEMS.map(item => ({ key: item.key, label: item.label, value: previewCounts[item.key], tone: item.tone as any }))} />
              <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="font-black uppercase text-slate-400">previewId</span><div className="mt-1 break-all font-mono text-slate-800 dark:text-white">{extensionPreviewResult.previewId}</div></div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="font-black uppercase text-slate-400">Operation</span><div className="mt-1 font-black text-slate-800 dark:text-white">{extensionPreviewResult.operation || extensionPreviewResult.type}</div></div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="font-black uppercase text-slate-400">State</span><div className="mt-1 font-black text-slate-800 dark:text-white">{extensionApplyResult ? 'Result ready' : 'Preview ready'}</div></div>
              </div>
              {isDeletePreview && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">Вы собираетесь удалить {previewCounts.delete} extensions. Это действие может повлиять на маршрутизацию, записи, пользователей и устройства.</div>}
              <PreviewTable items={previewItems} actionClass={getPreviewActionClass} summarizeValue={summarizePreviewValue} formatDiffValue={formatDiffValue} />
            </div>
          ) : <div className="mt-4 rounded-lg border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400 dark:border-slate-700">Preview ещё не сформирован.</div>}
        </Card>

        {extensionApplyResult && <Card className="p-5">{renderOperationResult()}</Card>}
      </div>
    );
  };


  return (
    <div className="space-y-6">
      {/* Permissions Guard Banner */}
      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-xl text-amber-900 dark:text-amber-400 text-xs flex gap-3 items-center">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <span className="font-extrabold">Режим чтения / ограничение прав:</span> Личный кабинет оператора лишен мандата <code className="font-bold bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded font-mono">dangerous_pbx_write</code>. Вы можете свободно использовать калькуляторы, импортировать таблицы, составлять структуры филиалов и запускать <span className="underline font-bold">Тестовый Dry Run</span>, но применение финальных изменений заблокировано.
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {noti && (
        <div className={`p-4 rounded-xl border flex items-center gap-2.5 shadow-md animate-fade-in text-xs ${
          noti.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30' :
          noti.type === 'error' ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-900/30' :
          'bg-blue-50 dark:bg-indigo-950/35 text-indigo-800 dark:text-blue-400 border-indigo-200 dark:border-indigo-900/30'
        }`}>
          {noti.type === 'success' && <Check className="w-4 h-4 text-emerald-500" />}
          {noti.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-500" />}
          {noti.type === 'info' && <Eye className="w-4 h-4 text-indigo-505" />}
          <span>{noti.text}</span>
        </div>
      )}

      <div className="space-y-4">
        <Card className="p-2">
          <div className="flex h-9 min-w-0 items-center gap-2">
            <div className="flex shrink-0 items-center gap-2 border-r border-slate-200 px-2 pr-3 dark:border-slate-700">
              <Wrench className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-black text-slate-850 dark:text-white">{ui.management.title}</h3>
            </div>
            <ProvisioningTopNav activeSection={activeTab as ManagementSectionId} onChange={(section) => setActiveTab(section)} />
          </div>
        </Card>

        {/* ACTIVE SCREEN CONTENTS */}
        <div className="min-w-0 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xs border border-slate-100 dark:border-slate-750">
        {activeTab === 'overview' && <ProvisioningOverview extensionsCount={activeExtensions.length} operatorTemplatesCount={trunkTemplates.length} extensionTemplatesCount={extTemplates.length} onNavigate={(section) => setActiveTab(section)} />}
        {activeTab !== 'overview' && activeTab !== 'extensions' && <ProvisioningPlaceholder section={MANAGEMENT_SECTIONS.find(section => section.id === activeTab)!} />}
        
        {/* TAB 1: BRANCH CONSTRUCTOR */}
        {activeTab === 'branch' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-850 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" /> Комплексный запуск новой площадки
                </h3>
                <p className="text-[11px] text-slate-500">Автоматически заведите полный стек телефонии (абонентский пул, очереди, маршруты и транк) за 1 минуту</p>
              </div>

              {/* Company Template selects */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Отраслевой шаблон:</span>
                <select 
                  value={selectedCompanyType} 
                  onChange={e => handleCompanyTemplateSelect(e.target.value)}
                  className="text-xs p-1.5 border rounded bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="">-- Выберите профиль --</option>
                  <option value="small-office">Малый офис</option>
                  <option value="call-center">Колл-центр</option>
                  <option value="shop">Интернет-магазин</option>
                  <option value="clinic">Медицинский центр</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form panel */}
              <div className="space-y-4 lg:col-span-2 bg-slate-50 dark:bg-slate-750/30 p-5 rounded-xl border dark:border-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">Название филиала / площадки</label>
                    <input 
                      type="text" 
                      value={branchName}
                      onChange={e => setBranchName(e.target.value)}
                      placeholder="Филиал Севастополь"
                      className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">Диапазон ОТ</label>
                      <input 
                        type="number" 
                        value={branchRangeStart}
                        onChange={e => setBranchRangeStart(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">Диапазон ДО</label>
                      <input 
                        type="number" 
                        value={branchRangeEnd}
                        onChange={e => setBranchRangeEnd(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Operator info */}
                <div className="border-t border-slate-250 dark:border-slate-700 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">Оператор филиала</label>
                    <select
                      value={branchTrunkOp}
                      onChange={e => {
                        setBranchTrunkOp(e.target.value);
                        if (e.target.value === 'МТТ') setBranchTrunkHost('sip.mtt.ru');
                        else if (e.target.value === 'Манго') setBranchTrunkHost('mango-office.ru');
                        else setBranchTrunkHost('sip.operator.ru');
                      }}
                      className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none animate-fade-in"
                    >
                      <option value="МТТ">МТТ (sip.mtt.ru)</option>
                      <option value="Манго">Манго (mango-office.ru)</option>
                      <option value="Ростелеком">Ростелеком</option>
                      <option value="Билайн">Билайн</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">SIP логин авторизации</label>
                    <input 
                      type="text" 
                      value={branchTrunkUser}
                      onChange={e => setBranchTrunkUser(e.target.value)}
                      className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">SIP Пароль</label>
                    <input 
                      type="text" 
                      value={branchTrunkPass}
                      onChange={e => setBranchTrunkPass(e.target.value)}
                      className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">Очереди вызовов (через запятую)</label>
                    <input 
                      type="text" 
                      value={branchQueues}
                      onChange={e => setBranchQueues(e.target.value)}
                      className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleBranchPreview}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition shrink-0 flex items-center gap-2 cursor-pointer focus:outline-none"
                  >
                    <Eye className="w-4 h-4" /> Построить проект филиала
                  </button>
                </div>
              </div>

              {/* Outcome diagram */}
              <div className="bg-slate-900 text-slate-100 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-4">
                    <Database className="w-4 h-4 text-indigo-400" /> Проектируемая спецификация
                  </h4>

                  {branchResultPreview ? (
                    <div className="space-y-3.5 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium">Объект:</span>{' '}
                        <span className="font-extrabold text-emerald-400">{branchResultPreview.branchName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Абонентский пул:</span>{' '}
                        <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[11px]">
                          {branchResultPreview.startExt} - {branchResultPreview.endExt} (~{branchResultPreview.linesCount} лин.)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Trunk Оператор:</span>{' '}
                        <span className="font-mono text-purple-400 font-bold">{branchTrunkOp}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Имя SIP-транка:</span>{' '}
                        <code className="text-pink-400 text-[11px] block mt-0.5">{branchResultPreview.trunkName}</code>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium font-bold block mb-1">Группы и очереди к созданию:</span>
                        <div className="flex flex-wrap gap-1">
                          {branchResultPreview.queuesList.map((q: string, idx: number) => (
                            <span key={idx} className="bg-slate-800 text-[10px] text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">{q}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 leading-normal border-t border-slate-800 pt-3 flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0" />
                        Будут автоматически построены и связаны Outbound Route со стандартными шаблонами набора.
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 italic text-xs h-48 flex items-center justify-center text-center">
                      Заполните форму параметров филиала слева и нажмите кнопку генерации проекта.
                    </div>
                  )}
                </div>

                {branchResultPreview && (
                  <div className="pt-4 border-t border-slate-800 mt-4">
                    <button
                      onClick={handleBranchDeploy}
                      disabled={!canWrite}
                      className="w-full bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700 text-white font-extrabold text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <Play className="w-4 h-4" /> АКТИВИРОВАТЬ ФИЛИАЛ ПОД КЛЮЧ
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RUSSIAN NUMBERING CAPACITY & DIAL PATTERNS */}
        {activeTab === 'numbering' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-850 dark:text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" /> Реестр Российской Номерной Ёмкости РФ (Мининформсвязь)
                </h3>
                <p className="text-[11px] text-slate-500">Автоматически парсит телефонные DEF-коды мобильных и городских линий для точной маршрутизации звонков</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={syncNumberingDb}
                  disabled={isSyncing}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg transition flex items-center gap-2 focus:outline-none"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Загрузка...' : 'Синхронизировать по API'}
                </button>

                <label className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-650 text-slate-800 dark:text-white text-xs font-bold px-3.5 py-2.5 rounded-lg cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Импорт CSV
                  <input type="file" accept=".csv" onChange={importNumberingCsv} className="hidden" />
                </label>
              </div>
            </div>

            {/* Quick operators analysis panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Search analyzer */}
              <div className="bg-slate-50 dark:bg-slate-750/30 p-5 rounded-xl border dark:border-slate-700">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3.5">
                  Быстрый Робо-Определитель Оператора номера
                </h4>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={numSearch}
                    onChange={e => setNumSearch(e.target.value)}
                    placeholder="Напр: 79781234567"
                    className="flex-1 text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                  />
                  <button
                    onClick={handleOperatorSearch}
                    className="bg-slate-800 dark:bg-indigo-900 text-white text-xs px-4 rounded-lg hover:bg-slate-750"
                  >
                    Анализ
                  </button>
                </div>

                {/* Analysis results */}
                {numSearchResult ? (
                  <div className="mt-4 p-4 rounded-lg bg-white dark:bg-slate-800 border dark:border-slate-700 text-xs space-y-2.5">
                    {numSearchResult.found ? (
                      <>
                        <div className="flex justify-between items-center pb-2 border-b dark:border-slate-700">
                          <span className="text-slate-500">Регион:</span>
                          <span className="font-extrabold text-slate-750 dark:text-white">{numSearchResult.region}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b dark:border-slate-700">
                          <span className="text-slate-500">Оператор связи:</span>
                          <span className="font-extrabold text-blue-600 dark:text-blue-400">{numSearchResult.operator}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b dark:border-slate-700">
                          <span className="text-slate-500">Класс связи:</span>
                          <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                            {numSearchResult.type === 'mobile' ? 'Мобильный (DEF)' : 'Городской (ABC)'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Диапазон пула:</span>
                          <span className="font-mono text-xs">{(numSearchResult.start)} - {(numSearchResult.end)}</span>
                        </div>
                        <div className="pt-2">
                          <button
                            onClick={() => loadNumRangeIntoRoute(numSearchResult)}
                            className="w-full text-center bg-blue-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-blue-600 dark:text-blue-400 text-[10.5px] font-extrabold py-2 rounded-lg transition"
                          >
                            Создать Outbound Route по паттерну
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-rose-500 italic text-[11px] py-1">
                        Номер внесён некорректно или отсутствует в кэше реестра.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-2">Введите полный российский номер (код страны 7/8), чтобы проанализировать оператора.</p>
                )}
              </div>

              {/* Numbering Table View */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Срез активной емкости реестра</h4>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span>Последняя синхронизация:</span>
                    <span className="font-bold text-slate-600 dark:text-indigo-305">
                      {numMeta ? new Date(numMeta.lastSync).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-3 w-3.5 h-3.5 text-slate-400" />
                    <input 
                      type="text" 
                      value={numQuery}
                      onChange={e => {
                        setNumQuery(e.target.value);
                        setNumPage(1);
                      }}
                      onKeyDown={e => e.key === 'Enter' && fetchNumberingDatabase()}
                      placeholder="Быстрый поиск по оператору, DEF-коду или региону..."
                      className="w-full text-xs pl-8 pr-3 py-2 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none h-[34px]"
                    />
                  </div>
                  <button 
                    onClick={fetchNumberingDatabase}
                    className="bg-slate-800 dark:bg-slate-700 text-white text-xs px-4 rounded-lg h-[34px]"
                  >
                    Найти
                  </button>
                </div>

                <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-750/50 text-[10px] text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Ряд</th>
                        <th className="p-2.5">DEF / ABC</th>
                        <th className="p-2.5">Диапазоны</th>
                        <th className="p-2.5">Ёмкость</th>
                        <th className="p-2.5">Оператор</th>
                        <th className="p-2.5">Регион</th>
                        <th className="p-2.5">Клик</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {numPages && numPages.length > 0 ? numPages.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-755/20">
                          <td className="p-2.5 text-slate-400 font-mono text-[10.5px]">{(numPage - 1) * numLimit + i + 1}</td>
                          <td className="p-2.5 font-bold text-slate-700 dark:text-white font-mono">{r.def}</td>
                          <td className="p-2.5 font-mono text-slate-500 text-[11px]">{r.start} - {r.end}</td>
                          <td className="p-2.5 font-mono text-slate-700 dark:text-slate-300">{(r.capacity / 1000).toFixed(0)}k</td>
                          <td className="p-2.5 font-semibold text-blue-600 dark:text-blue-400">{r.operator}</td>
                          <td className="p-2.5 text-slate-500 text-[11px]">{r.region}</td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => loadNumRangeIntoRoute(r)}
                              className="text-slate-400 hover:text-blue-600 focus:outline-none"
                              title="Выбрать паттерн"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 italic">Нет совпадений в текущем реестре</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-[11px] text-slate-400">Всего реестров: <span className="font-bold text-slate-750 dark:text-white">{numTotal}</span></span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={numPage === 1}
                      onClick={() => { setNumPage(numPage - 1); }}
                      className="bg-slate-50 border dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2.5 py-1 rounded-md disabled:opacity-30"
                    >
                      Назад
                    </button>
                    <span className="text-xs px-2.5 py-1 text-slate-700 dark:text-white font-bold">{numPage}</span>
                    <button
                      disabled={numPage * numLimit >= numTotal}
                      onClick={() => { setNumPage(numPage + 1); }}
                      className="bg-slate-50 border dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs px-2.5 py-1 rounded-md disabled:opacity-30"
                    >
                      Вперед
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EXTENSIONS */}
        {activeTab === 'extensions' && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-black text-slate-850 dark:text-white"><Users className="h-5 w-5 text-indigo-500" /> Extensions</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">FreePBX REST inventory, selection and safe preview workspace.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={fetchActiveExtensions} disabled={activeExtLoading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60"><Download className="h-4 w-4" /> Загрузить с АТС</button>
                  <button type="button" onClick={fetchActiveExtensions} disabled={activeExtLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${activeExtLoading ? 'animate-spin' : ''}`} /> Обновить</button>
                  <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><span className={activeExtError ? 'h-2.5 w-2.5 rounded-full bg-rose-500' : activeExtensions.length > 0 ? 'h-2.5 w-2.5 rounded-full bg-emerald-500' : 'h-2.5 w-2.5 rounded-full bg-slate-400'} />{activeExtLoading ? 'Loading' : activeExtError ? 'Disconnected' : activeExtensions.length > 0 ? 'Connected' : 'Disconnected'}{activeExtLoadedAt && <span className="font-normal text-slate-400">{activeExtLoadedAt}</span>}</span>
                  <button type="button" onClick={downloadCurrentExtensions} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><FileSpreadsheet className="h-4 w-4" /> Экспорт CSV</button>
                  <button type="button" onClick={fetchRawExtensionsRest} disabled={activeExtRawLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><Database className="h-4 w-4" /> Raw REST</button>
                  {activeExtRawData && <button type="button" onClick={() => setActiveExtRawOpen(prev => !prev)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">{activeExtRawOpen ? 'Свернуть Raw' : 'Показать Raw'}</button>}
                </div>
              </div>
            </div>
            {activeExtError && <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"><AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" /><span>{activeExtError}</span></div>}
            {activeExtRawError && <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"><AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" /><span>{activeExtRawError}</span></div>}
            {activeExtRawData && activeExtRawOpen && (<div className="space-y-3 rounded-xl border border-slate-150 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400"><Database className="h-4 w-4" /> Raw FreePBX REST API</h4><div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">Secrets masked</span><button type="button" onClick={() => setActiveExtRawOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Закрыть</button></div></div><pre className="max-h-[320px] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">{JSON.stringify(activeExtRawData, null, 2)}</pre></div>)}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(6,minmax(120px,auto))]">
                <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input type="text" placeholder="Поиск: extension, имя, email" value={activeExtSearch} onChange={(e) => setActiveExtSearch(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></div>
                <select value={activeExtTechFilter} onChange={(e) => setActiveExtTechFilter(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="all">Technology</option><option value="pjsip">PJSIP</option><option value="sip">SIP</option><option value="unknown">Unknown</option></select>
                <select value={activeExtVoicemailFilter} onChange={(e) => setActiveExtVoicemailFilter(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="all">Voicemail</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
                <select value={activeExtRecordingFilter} onChange={(e) => setActiveExtRecordingFilter(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="all">Recording</option><option value="always">Always</option><option value="ondemand">On Demand</option><option value="never">Never</option><option value="unknown">Unknown</option></select>
                <select value={activeExtSourceFilter} onChange={(e) => setActiveExtSourceFilter(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="all">Source</option><option value="bmo">BMO</option><option value="rest">REST</option><option value="merged">BMO + REST</option><option value="unknown">Unknown</option></select>
                <select value={activeExtStatusFilter} onChange={(e) => setActiveExtStatusFilter(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="all">Status</option><option value="loaded">Loaded</option><option value="warning">Warning</option><option value="error">Error</option></select>
                <div className="flex gap-2"><select value={activeExtSortField} onChange={(e) => setActiveExtSortField(e.target.value as any)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="extension">Extension</option><option value="name">Name</option><option value="tech">Tech</option></select><button type="button" onClick={() => setActiveExtSortDir(activeExtSortDir === 'asc' ? 'desc' : 'asc')} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{activeExtSortDir === 'asc' ? 'ASC' : 'DESC'}</button></div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[1320px] text-left text-xs"><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800"><tr><th className="w-10 p-3"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFilteredExtensions} className="h-4 w-4 rounded" /></th>{getVisibleExtensionFields().map(field => <th key={field.key} className="p-3">{field.label}</th>)}<th className="p-3">Inbound Recording</th><th className="p-3">Outbound Recording</th><th className="p-3">Internal Recording</th><th className="p-3">Source</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{activeExtLoading ? <tr><td colSpan={getVisibleExtensionFields().length + 6} className="p-12 text-center text-slate-400"><RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-500" />Загрузка extensions с АТС...</td></tr> : filteredActiveExtensions.length > 0 ? filteredActiveExtensions.map((ext, idx) => { const extId = String(ext.extension || ''); const selected = selectedExtensionIds.includes(extId); return <tr key={ext.extension || idx} onClick={() => openSingleExtensionEditor(ext)} className={'cursor-pointer transition ' + (singleExtensionEdit?.extension === extId ? 'bg-amber-50/70 dark:bg-amber-950/20' : selected ? 'bg-blue-50/70 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')}><td className="p-3"><input type="checkbox" checked={selected} onChange={() => toggleExtensionSelection(extId)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded" /></td>{getVisibleExtensionFields().map(field => <td key={field.key} className="p-3"><span className={field.key === 'tech' ? getTechBadgeClass(ext) : 'font-mono text-slate-600 dark:text-slate-300'}>{getExtensionFieldValue(ext, field)}</span></td>)}<td className="p-3"><span className={getRecordingDirectionBadgeClass(ext, 'inbound')}>{getRecordingDirectionLabel(ext, 'inbound')}</span></td><td className="p-3"><span className={getRecordingDirectionBadgeClass(ext, 'outbound')}>{getRecordingDirectionLabel(ext, 'outbound')}</span></td><td className="p-3"><span className={getRecordingDirectionBadgeClass(ext, 'internal')}>{getRecordingDirectionLabel(ext, 'internal')}</span></td><td className="p-3"><span className={getSourceBadgeClass(ext)}>{getExtensionSourceLabel(ext)}</span></td><td className="p-3"><span className={getStatusBadgeClass(ext)}>{getExtensionStatusLabel(ext)}</span></td></tr>; }) : <tr><td colSpan={getVisibleExtensionFields().length + 6} className="p-12 text-center text-slate-400"><Users className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />{activeExtensions.length === 0 ? 'Загрузите extensions с АТС.' : 'Нет extensions под выбранные условия.'}</td></tr>}</tbody></table></div>
            </div>
            {singleExtensionEdit && (
              <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400"><Edit className="h-4 w-4 text-amber-500" /> Редактировать extension</h4>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-black text-slate-850 dark:text-white">{singleExtensionEdit.extension}</span><span className={getTechBadgeClass(singleExtensionEdit)}>{getTechLabel(singleExtensionEdit)}</span><span className={getSourceBadgeClass(singleExtensionEdit)}>{getExtensionSourceLabel(singleExtensionEdit)}</span></div>
                  </div>
                  <Toolbar><SecondaryButton onClick={() => setSingleExtensionEdit(null)}>Закрыть</SecondaryButton><PrimaryButton onClick={handleExtensionApply} disabled={!canApplyExtensionPreview()}>{extensionApplyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Apply</PrimaryButton></Toolbar>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Основное</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {renderSingleField('updateName', 'name', 'Name', singleTextInput('name'))}
                      {renderSingleField('updateOutboundCid', 'outboundCid', 'Outbound CID', singleTextInput('outboundCid'))}
                      {renderSingleField('updateEmergencyCid', 'emergencyCid', 'Emergency CID', singleTextInput('emergencyCid'))}
                      {renderSingleField('updateVoicemail', 'voicemail', 'Voicemail', singleSelect('voicemail', SINGLE_VOICEMAIL_OPTIONS))}
                      {renderSingleField('updateCallWaiting', 'callWaiting', 'Call Waiting', singleSelect('callWaiting', SINGLE_ENABLED_OPTIONS))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Recording Options</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {renderSingleField('updateRecordingInbound', 'recordingInbound', 'Inbound Recording', singleSelect('recordingInbound', RECORDING_MODE_OPTIONS))}
                      {renderSingleField('updateRecordingOutbound', 'recordingOutbound', 'Outbound Recording', singleSelect('recordingOutbound', RECORDING_MODE_OPTIONS))}
                      {renderSingleField('updateRecordingInternal', 'recordingInternal', 'Internal Recording', singleSelect('recordingInternal', RECORDING_MODE_OPTIONS))}
                      {renderSingleField('updateRecordingPriority', 'recording_priority', 'Record Priority', <input type="number" min="0" value={singleUpdateFields.recording_priority || ''} onChange={e => setSingleUpdateField('recording_priority', e.target.value)} className={singleInputClass} />)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Follow Me</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {renderSingleField('updateFindmefollowEnabled', 'findmefollow_enabled', 'findmefollow_enabled', singleSelect('findmefollow_enabled', SINGLE_ENABLED_OPTIONS))}
                      {renderSingleField('updateFindmefollowStrategy', 'findmefollow_strategy', 'findmefollow_strategy', <input list="single-followme-strategies" value={singleUpdateFields.findmefollow_strategy || ''} onChange={e => setSingleUpdateField('findmefollow_strategy', e.target.value)} className={singleInputClass} />)}
                      {renderSingleField('updateFindmefollowGrptime', 'findmefollow_grptime', 'findmefollow_grptime', singleTextInput('findmefollow_grptime'))}
                      {renderSingleField('updateFindmefollowGrplist', 'findmefollow_grplist', 'findmefollow_grplist', singleTextInput('findmefollow_grplist'))}
                      {renderSingleField('updateFindmefollowPostdest', 'findmefollow_postdest', 'findmefollow_postdest', singleTextInput('findmefollow_postdest'))}
                    </div>
                    <datalist id="single-followme-strategies">{SINGLE_FOLLOW_ME_STRATEGIES.map(item => <option key={item} value={item} />)}</datalist>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2"><PrimaryButton onClick={handleSingleUpdatePreview} disabled={extensionPreviewLoading || !hasSingleCheckedFields()}><Eye className="h-4 w-4" />Preview</PrimaryButton><span className="text-xs text-slate-400">Preview использует update-preview с selectedExtensions=[{singleExtensionEdit.extension}]</span></div>
              </div>
            )}
            {renderExtensionsWorkspace()}
          </div>
        )}
        {/* TAB 4: TRUNKS WIZARD */}
        {false && activeTab === 'trunks' && (
          <div className="space-y-6 animate-fade-in">
            {/* Steps indicator */}
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-750/30 p-3.5 rounded-xl border dark:border-slate-700">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wide">Мастер Массового Создания SIP-Транков</span>
              <div className="flex items-center gap-2">
                {[
                  { step: 'draft', label: '1. Настройки' },
                  { step: 'preview', label: '2. Предпросмотр' },
                  { step: 'success', label: '3. Применено' }
                ].map(s => (
                  <span 
                    key={s.step} 
                    className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold ${
                      trunkStep === s.step 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white dark:bg-slate-800 text-slate-400 border dark:border-slate-700'
                    }`}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>

            {trunkStep === 'draft' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Operators preset list */}
                <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-750/30 p-5 rounded-xl border dark:border-slate-700 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Операторы Телефонии</h4>
                  
                  {['MTT', 'Mango', 'UIS', 'Rostelecom', 'Megafon', 'Beeline', 'MTS', 'Telphin', 'Zadarma', 'Gravitel', 'Custom'].map(op => (
                    <button
                      key={op}
                      onClick={() => handleTrunkOperatorChange(op)}
                      className={`w-full text-left p-2.5 text-xs font-bold rounded-lg border transition ${
                        trunkOperator === op 
                          ? 'bg-blue-600 text-white border-indigo-650' 
                          : 'bg-white dark:bg-slate-800 border-slate-100 hover:bg-slate-50 text-slate-700 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {op === 'MTT' ? '📞 МТТ' :
                       op === 'Mango' ? '📞 Манго Офис' :
                       op === 'UIS' ? '📞 UIS' :
                       op === 'Rostelecom' ? '📞 Ростелеком' :
                       op === 'Megafon' ? '📞 Мегафон' :
                       op === 'Beeline' ? '📞 Билайн' :
                       op === 'MTS' ? '📞 МТС' :
                       op === 'Telphin' ? '📞 Телфин' :
                       op === 'Zadarma' ? '📞 Zadarma' :
                       op === 'Gravitel' ? '📞 Гравител' : '⚙️ Custom / Другой'}
                    </button>
                  ))}
                </div>

                {/* Presets Settings Form */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Название SIP-транка (Trunk Name)</label>
                      <input 
                        type="text" 
                        value={trunkName} 
                        onChange={e => setTrunkName(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Технология подключения</label>
                      <select
                        value={trunkTech}
                        onChange={e => setTrunkTech(e.target.value as any)}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      >
                        <option value="pjsip">PJSIP (chan_pjsip)</option>
                        <option value="sip">SIP Legacy (chan_sip)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Хост подключения (SIP Server / IP)</label>
                      <input 
                        type="text" 
                        value={trunkHost} 
                        onChange={e => setTrunkHost(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">SIP порт</label>
                      <input 
                        type="number" 
                        value={trunkPort} 
                        onChange={e => setTrunkPort(parseInt(e.target.value, 10))}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">SIP логин / Номер</label>
                      <input 
                        type="text" 
                        value={trunkUser} 
                        onChange={e => setTrunkUser(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">SIP Authorization Password</label>
                      <input 
                        type="text" 
                        value={trunkPassword} 
                        onChange={e => setTrunkPassword(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Максимум каналов (Max channels limit)</label>
                      <input 
                        type="number" 
                        value={trunkMaxChannels} 
                        onChange={e => setTrunkMaxChannels(parseInt(e.target.value, 10))}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Входящий callerID по умолчанию (CID)</label>
                      <input 
                        type="text" 
                        value={trunkOutboundCID} 
                        onChange={e => setTrunkOutboundCID(e.target.value)}
                        className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t dark:border-slate-700 flex justify-end">
                    <button
                      onClick={handleTrunkPreview}
                      disabled={trunkIsLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-3 rounded-lg flex items-center gap-2"
                    >
                      {trunkIsLoading ? 'Диагностика...' : 'Собрать спецификацию транка'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {trunkStep === 'preview' && trunkPreviewData && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Проверка готовности к заведению</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTrunkStep('draft')}
                      className="bg-slate-100 dark:bg-slate-700 text-slate-750 dark:text-white text-xs px-3.5 py-2 rounded-lg"
                    >
                      Назад
                    </button>
                    <button
                      onClick={() => handleTrunkApply()}
                      disabled={!canWrite && !isDryRun}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2 rounded-lg"
                    >
                      {isDryRun ? 'Тестовая регистрация' : 'СОЗДАТЬ ТРАНК В СИСТЕМЕ'}
                    </button>
                  </div>
                </div>

                {trunkPreviewData.conflicts.length > 0 && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-4 rounded-xl text-rose-800 dark:text-rose-400 text-xs">
                    <p className="font-bold">Обнаружены критические предупреждения по транкам:</p>
                    <ul className="list-disc list-inside mt-1 font-mono text-[10.5px]">
                      {trunkPreviewData.conflicts.map((c: string, idx: number) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Simulated connectivity check panel */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-750/30 p-4 rounded-xl border dark:border-slate-700 text-xs">
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border flex items-center gap-2.5">
                    <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">OPTIONS Ответ</span>
                      <span className="font-bold text-slate-850 dark:text-white">200 OK (SIP)</span>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border flex items-center gap-2.5">
                    <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">DNS Хоста</span>
                      <span className="font-bold text-slate-850 dark:text-white">Успешно разрешен</span>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border flex items-center gap-2.5">
                    <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">AMI регистрация</span>
                      <span className="font-bold text-emerald-500 font-mono">ONLINE</span>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border flex items-center gap-2.5">
                    <Wifi className="w-5 h-5 text-indigo-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Пинг (Задержка)</span>
                      <span className="font-bold text-slate-850 dark:text-white font-mono">22 ms</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-xl p-6 bg-slate-50 dark:bg-slate-900/10 dark:border-slate-700 text-xs space-y-3.5">
                  <h5 className="font-bold text-slate-750 dark:text-white uppercase text-[11px]">Финальная спецификация SIP/PJSIP транка</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-slate-450 block text-[10px] uppercase font-bold">Trunk Name</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">{trunkPreviewData.generated[0].name}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block text-[10px] uppercase font-bold">Хост связи</span>
                      <span className="font-mono font-bold dark:text-white text-xs">{trunkPreviewData.generated[0].host}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block text-[10px] uppercase font-bold">Порт и транспорт</span>
                      <span className="font-mono dark:text-slate-300 text-xs">{trunkPreviewData.generated[0].port} / udp</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block text-[10px] uppercase font-bold">Статус активации</span>
                      <span className="bg-indigo-100 text-indigo-805 dark:bg-indigo-900/40 text-[10px] px-2 py-0.5 rounded-full font-bold">Готов</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {trunkStep === 'success' && (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-850 dark:text-white">Транк успешно добавлен в FreePBX!</h4>
                  <p className="text-xs text-slate-450 mt-1">Опрос OPTIONS подтвердил успешное соединение с внешним SIP proxy.</p>
                </div>
                <div className="pt-2">
                  <button onClick={() => setTrunkStep('draft')} className="bg-blue-600 px-5 py-2 text-xs text-white rounded-lg">Завести еще один</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: OUTBOUND ROUTES */}
        {activeTab === 'routes' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-750/30 p-3.5 rounded-xl border dark:border-slate-700">
              <span className="text-xs font-bold text-slate-705 dark:text-slate-350 uppercase tracking-wide">Массовое Создание Исходящих Маршрутов</span>
              <div className="flex gap-2">
                {[{ step: 'draft', label: '1. Настройки' }, { step: 'preview', label: '2. Спецификация' }, { step: 'success', label: '3. Применено' }].map(s => (
                  <span key={s.step} className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold ${routeStep === s.step ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 border dark:border-slate-700'}`}>{s.label}</span>
                ))}
              </div>
            </div>

            {routeStep === 'draft' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Название маршрута (Route Name)</label>
                    <input 
                      type="text" 
                      value={routeName} 
                      onChange={e => setRouteName(e.target.value)}
                      className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                    />
                  </div>

                  {/* Trunk priority selectors as lists */}
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">Приоритет транков исходящей связи (Trunk Sequence)</label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto border p-3 rounded-lg dark:border-slate-700">
                      {existingTrunksList.map(t => {
                        const isChecked = routeTrunks.includes(t.name);
                        return (
                          <div key={t.id} className="flex items-center gap-2.5 py-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-755/20 rounded">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setRouteTrunks(routeTrunks.filter(x => x !== t.name));
                                } else {
                                  setRouteTrunks([...routeTrunks, t.name]);
                                }
                              }}
                              className="w-4 h-4 cursor-pointer"
                            />
                            <div className="flex-1">
                              <span className="font-bold text-slate-750 dark:text-white">{t.name}</span>
                              <span className="text-[10px] text-slate-400 block">{t.tech} / {t.host}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Dial patterns section */}
                <div className="bg-slate-50 dark:bg-slate-750/30 p-5 rounded-xl border dark:border-slate-700 space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Шаблоны номеров к прослушке (Dial Patterns)</label>
                    <textarea 
                      value={routeDialPatterns}
                      onChange={e => setRouteDialPatterns(e.target.value)}
                      rows={6}
                      placeholder="7978XXXXXXX&#10;7495XXXXXXX"
                      className="w-full text-xs p-2.5 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-mono focus:outline-none"
                    />
                    <p className="text-[9.5px] text-slate-400 leading-normal mt-1 leading-normal">Каждый паттерн набора с новой строки. Символ X обозначает любую цифру от 0 до 9.</p>
                  </div>

                  <div className="pt-2 border-t dark:border-slate-700">
                    <button
                      onClick={handleRoutePreview}
                      disabled={routeIsLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 rounded-lg"
                    >
                      Посмотреть исходящий план
                    </button>
                  </div>
                </div>
              </div>
            )}

            {routeStep === 'preview' && routePreviewData && (
              <div className="space-y-4 text-xs font-sans">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Спецификация стыков набора</h4>
                  <div className="flex gap-2">
                    <button onClick={() => setRouteStep('draft')} className="bg-slate-100 dark:bg-slate-700 text-slate-750 dark:text-white px-3.5 py-2 rounded-lg">Назад</button>
                    <button onClick={() => handleRouteApply()} disabled={!canWrite && !isDryRun} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold">ПРИМЕНИТЬ МАРШРУТЫ</button>
                  </div>
                </div>

                <div className="border rounded-xl p-5 bg-slate-50 dark:bg-slate-755/20 dark:border-slate-700 space-y-3">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Имя Маршрута</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">{routePreviewData.generated[0].name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Применяемые паттерны маски</span>
                    <div className="flex flex-wrap gap-1">
                      {routePreviewData.generated[0].patterns.map((p: string, i: number) => (
                        <span key={i} className="font-mono bg-slate-200 dark:bg-slate-700 text-[10.5px] px-2 py-0.5 rounded">{p}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Связанные транки вызова</span>
                    <span className="font-mono font-bold text-indigo-650 dark:text-blue-400">{routePreviewData.generated[0].trunks.join(' ➔ ') || 'Нет связанных транков (внутренний)'}</span>
                  </div>
                </div>
              </div>
            )}

            {routeStep === 'success' && (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-full flex items-center justify-center mx-auto"><Check className="w-10 h-10" /></div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-850 dark:text-white">Маршрут исходящей связи заведен!</h4>
                  <p className="text-xs text-slate-400">Правила набора в FreePBX успешно перестроены.</p>
                </div>
                <div className="pt-2">
                  <button onClick={() => setRouteStep('draft')} className="bg-blue-600 px-5 py-2 text-xs text-white rounded-lg">Выйти</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: DID / INBOUND ROUTING */}
        {activeTab === 'did' && (
          <div className="space-y-6 animate-fade-in text-xs font-sans">
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-750/30 p-3.5 rounded-xl border dark:border-slate-700">
              <span className="text-xs font-bold text-slate-705 dark:text-slate-350 uppercase tracking-wide">Пакетное заведение входящих линий DID</span>
              <div className="flex gap-2">
                {[{ step: 'draft', label: '1. Настройки' }, { step: 'preview', label: '2. Спецификация' }, { step: 'success', label: '3. Применено' }].map(s => (
                  <span key={s.step} className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold ${didStep === s.step ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 border dark:border-slate-700'}`}>{s.label}</span>
                ))}
              </div>
            </div>

            {didStep === 'draft' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <label className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1">Список DID к заведению (Формат: Внешний_DID; Тип; Назначение; Описание)</label>
                  <textarea 
                    value={didCsvText} 
                    onChange={e => setDidCsvText(e.target.value)}
                    rows={8}
                    placeholder="74957654321;extension;200;Главная продажная линия..."
                    className="w-full text-xs p-3 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-mono focus:outline-none"
                  />
                </div>

                <div className="bg-slate-50 dark:bg-slate-750/30 p-5 rounded-xl border dark:border-slate-700 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Синтаксис назначения DID</h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Каждая строка сопоставляет внешний телефонный DID номер с целевым модулем FreePBX:
                  </p>
                  <div className="space-y-1.5 font-mono text-[10px] text-slate-600 dark:text-slate-455">
                    <div>• <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-red-500">extension</code> - внутренний абонент АТС</div>
                    <div>• <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-red-500">queue</code> - целевая очередь (Call Center)</div>
                    <div>• <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-red-500">ring group</code> - группа вызовов абонентов</div>
                    <div>• <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-red-500">ivr</code> - интерактивное приветственное меню</div>
                  </div>

                  <div className="pt-2 border-t dark:border-slate-700">
                    <button
                      onClick={handleDidPreview}
                      disabled={didIsLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 rounded-lg"
                    >
                      Построить Спецификацию DID
                    </button>
                  </div>
                </div>
              </div>
            )}

            {didStep === 'preview' && didPreviewData && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Спецификация линий DID</h4>
                  <div className="flex gap-2">
                    <button onClick={() => setDidStep('draft')} className="bg-slate-100 dark:bg-slate-700 text-slate-750 dark:text-white px-3.5 py-2 rounded-lg">Назад</button>
                    <button onClick={() => handleDidApply()} disabled={!canWrite && !isDryRun} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg">ПРИМЕНИТЬ DID</button>
                  </div>
                </div>

                <div className="border border-slate-150 dark:border-slate-700 rounded-xl overflow-hidden overflow-y-auto max-h-[350px]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-750 text-[10px] text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Внешний DID</th>
                        <th className="p-2.5">Назначение</th>
                        <th className="p-2.5">Реквизиты назначения</th>
                        <th className="p-2.5">Описание / Метка</th>
                        <th className="p-1.5 text-right">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-mono">
                      {didPreviewData.generated.map((g: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-755/20">
                          <td className="p-2.5 text-indigo-650 dark:text-blue-400 font-bold">{g.did}</td>
                          <td className="p-2.5 font-sans uppercase font-bold text-[10px]">{g.destinationType}</td>
                          <td className="p-2.5 text-slate-700 dark:text-slate-300">{g.destination}</td>
                          <td className="p-2.5 font-sans">{g.description}</td>
                          <td className="p-2.5 text-right">
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full font-bold">{g.status === 'create' ? 'Новый' : 'Обновить'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {didStep === 'success' && (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-full flex items-center justify-center mx-auto"><Check className="w-10 h-10" /></div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-850 dark:text-white">Входящие DID успешно установлены!</h4>
                  <p className="text-xs text-slate-450 mt-1">FreePBX INBOUND-ROUTES успешно скоординированы.</p>
                </div>
                <div className="pt-2">
                  <button onClick={() => setDidStep('draft')} className="bg-blue-600 px-5 py-2 text-xs text-white rounded-lg">Выйти</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: TEMPLATES CONFIG */}
        {activeTab === 'templates' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-850 dark:text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-600" /> Конструктор и Шаблоны операторов связи
                </h3>
                <p className="text-[11px] text-slate-500">Управляйте типовыми техническими конфигурациями для ускорения заведения линий</p>
              </div>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 focus:outline-none">
                <Plus className="w-4 h-4" /> Новый Шаблон
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trunkTemplates.map(t => (
                <div key={t.id} className="p-4 border dark:border-slate-700 rounded-xl space-y-2.5 bg-slate-50/50 dark:bg-slate-755/10">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-sm text-indigo-650 dark:text-blue-400">{t.operator}</span>
                    <span className="bg-white dark:bg-slate-800 text-slate-500 text-[10px] px-2 py-0.5 rounded font-mono uppercase border dark:border-slate-700">{t.tech}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.name}</p>
                  
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-t dark:border-slate-700 pt-2.5">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-sans">SIP SERVER / HOST:</span>
                      <span className="font-bold word-break break-all">{t.host}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-sans">PORT:</span>
                      <span className="font-bold">{t.port} (udp)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 8: CHANGELOGS & ROLLBACKS */}
        {activeTab === 'changelog' && (
          <div className="space-y-6 animate-fade-in text-xs font-sans">
            <div>
              <h3 className="text-sm font-bold text-slate-850 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600 animate-pulse" /> Системный журнал изменений и План Отката (Rollback Center)
              </h3>
              <p className="text-[11px] text-slate-500">Пошаговый аудит всех массовых операций с полной возможностью мгновенного удаления ошибочных пулов</p>
            </div>

            <div className="border rounded-xl border-slate-100 dark:border-slate-700 overflow-hidden overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-750 text-[10px] text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="p-3">Штамп времени</th>
                    <th className="p-3">Инициатор</th>
                    <th className="p-3">Действие / Специфика</th>
                    <th className="p-3">Объектов</th>
                    <th className="p-3">Параметры лога</th>
                    <th className="p-3">Статус</th>
                    <th className="p-3 text-right">Управление</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {changelogs && changelogs.length > 0 ? changelogs.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-755/20 font-mono text-[11px]">
                      <td className="p-3 text-slate-450 font-sans">{new Date(l.timestamp).toLocaleString()}</td>
                      <td className="p-3 font-bold font-sans text-slate-800 dark:text-white">{l.user}</td>
                      <td className="p-3">
                        <span className="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded text-indigo-650 dark:text-blue-400 font-bold">{l.action}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-300">{l.itemCount} шт.</td>
                      <td className="p-3 font-sans max-w-sm leading-normal text-slate-500">{l.details}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          l.status === 'applied' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20' : 'bg-slate-100 text-slate-450 dark:bg-slate-700'
                        }`}>{l.status === 'applied' ? 'Активирован' : 'Откачен'}</span>
                      </td>
                      <td className="p-3 text-right">
                        {l.status === 'applied' && (
                          <button
                            onClick={() => handleRollback(l.id)}
                            disabled={isRollingBack || !canWrite}
                            className="text-red-500 hover:text-red-700 font-bold font-sans flex items-center gap-1 float-right focus:outline-none cursor-pointer disabled:opacity-40"
                          >
                            <Undo className="w-3.5 h-3.5" /> Откатить
                          </button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic font-sans text-xs">Журнал изменений пуст. Заведите первый пул абонентов или транков.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
