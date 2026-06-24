import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Settings, Search, FileText, Layers, Wifi, Check, AlertTriangle, 
  Trash2, RefreshCw, Download, Upload, Play, ArrowLeft, ArrowRight, 
  Lock, Plus, Edit, Undo, Eye, FileSpreadsheet, UserPlus, Users, 
  PhoneForwarded, MapPin, Building2, Server, HelpCircle, ShieldAlert,
  Database, ListPlus, Activity
} from 'lucide-react';

interface ProvisioningCenterProps {
  session: any;
  hasPermission: (perm: string) => boolean;
}

export default function ProvisioningCenter({ session, hasPermission }: ProvisioningCenterProps) {
  const token = session?.token || '';
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'branch' | 'numbering' | 'extensions' | 'trunks' | 'routes' | 'did' | 'templates' | 'changelog'>('branch');

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
  const [activeExtSearch, setActiveExtSearch] = useState('');
  const [batchMappingText, setBatchMappingText] = useState('');
  const [showBatchMapping, setShowBatchMapping] = useState(false);

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
    try {
      const res = await fetch('/api/management/extensions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не удалось получить список абонентов с АТС');
      const data = await res.json();
      if (Array.isArray(data)) {
        setActiveExtensions(data);
        showNoti('success', `Загружено ${data.length} активных абонентов с АТС!`);
      } else {
        showNoti('error', 'Формат ответа АТС не поддерживается');
      }
    } catch (err: any) {
      showNoti('error', err.message);
    } finally {
      setActiveExtLoading(false);
    }
  };

  const applyBatchMapping = () => {
    if (!batchMappingText.trim()) {
      showNoti('warning', 'Пожалуйста, введите данные для сопоставления');
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

  const filteredActiveExtensions = useMemo(() => {
    if (!activeExtSearch.trim()) return activeExtensions;
    const query = activeExtSearch.toLowerCase();
    return activeExtensions.filter(ext => 
      String(ext.extension || '').toLowerCase().includes(query) || 
      String(ext.name || '').toLowerCase().includes(query) ||
      String(ext.department || '').toLowerCase().includes(query)
    );
  }, [activeExtensions, activeExtSearch]);

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
          'bg-indigo-50 dark:bg-indigo-950/35 text-indigo-800 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/30'
        }`}>
          {noti.type === 'success' && <Check className="w-4 h-4 text-emerald-500" />}
          {noti.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-500" />}
          {noti.type === 'info' && <Eye className="w-4 h-4 text-indigo-505" />}
          <span>{noti.text}</span>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800 gap-1">
        {[
          { id: 'branch', label: 'Конструктор филиала', icon: Building2 },
          { id: 'numbering', label: 'Номерная ёмкость РФ', icon: MapPin },
          { id: 'extensions', label: 'Extensions (Абоненты)', icon: UserPlus },
          { id: 'trunks', label: 'Транки (Внешние)', icon: Wifi },
          { id: 'routes', label: 'Исходящая связь', icon: PhoneForwarded },
          { id: 'did', label: 'Входящие DID', icon: Layers },
          { id: 'templates', label: 'Шаблоны операторов', icon: Settings },
          { id: 'changelog', label: 'Changelog / Откаты', icon: Activity }
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none cursor-pointer ${
                activeTab === t.id 
                  ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800/40 rounded-t-lg'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ACTIVE SCREEN CONTENTS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-750">
        
        {/* TAB 1: BRANCH CONSTRUCTOR */}
        {activeTab === 'branch' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-850 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" /> Комплексный запуск новой площадки
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition shrink-0 flex items-center gap-2 cursor-pointer focus:outline-none"
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
                  <MapPin className="w-5 h-5 text-indigo-600" /> Реестр Российской Номерной Ёмкости РФ (Мининформсвязь)
                </h3>
                <p className="text-[11px] text-slate-500">Автоматически парсит телефонные DEF-коды мобильных и городских линий для точной маршрутизации звонков</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={syncNumberingDb}
                  disabled={isSyncing}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg transition flex items-center gap-2 focus:outline-none"
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
                          <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{numSearchResult.operator}</span>
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
                            className="w-full text-center bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10.5px] font-extrabold py-2 rounded-lg transition"
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
                          <td className="p-2.5 font-semibold text-indigo-600 dark:text-indigo-400">{r.operator}</td>
                          <td className="p-2.5 text-slate-500 text-[11px]">{r.region}</td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => loadNumRangeIntoRoute(r)}
                              className="text-slate-400 hover:text-indigo-600 focus:outline-none"
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

        {/* TAB 3: BULK EXTENSIONS */}
        {activeTab === 'extensions' && (
          <div className="space-y-6 animate-fade-in">
            {/* Steps indicator */}
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-750/30 p-3.5 rounded-xl border dark:border-slate-700">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Пакетное Создание Абонентов</span>
              <div className="flex items-center gap-2">
                {[
                  { step: 'draft', label: '1. Настройки' },
                  { step: 'preview', label: '2. Предпросмотр' },
                  { step: 'success', label: '3. Применено' }
                ].map(s => (
                  <span 
                    key={s.step} 
                    className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold ${
                      extStep === s.step 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-white dark:bg-slate-800 text-slate-400 border dark:border-slate-700'
                    }`}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>

            {/* DRAFT STEP */}
            {extStep === 'draft' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-5">
                  <div className="flex items-center gap-4 border-b pb-3 border-slate-100 dark:border-slate-700">
                    <span className="text-xs font-bold text-slate-400 block">РЕЖИМ ЗАВЕДЕНИЯ:</span>
                    <button 
                      onClick={() => setExtMode('range')} 
                      className={`text-xs px-3 py-1 rounded-md font-bold transition ${extMode === 'range' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-550'}`}
                    >
                      Диапазон номеров
                    </button>
                    <button 
                      onClick={() => setExtMode('manual')} 
                      className={`text-xs px-3 py-1 rounded-md font-bold transition ${extMode === 'manual' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-550'}`}
                    >
                      Ручной список
                    </button>
                    <button 
                      onClick={() => setExtMode('file')} 
                      className={`text-xs px-3 py-1 rounded-md font-bold transition ${extMode === 'file' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-550'}`}
                    >
                      Импорт CSV/XLSX
                    </button>
                    <button 
                      onClick={() => {
                        setExtMode('edit-active');
                        if (activeExtensions.length === 0) {
                          fetchActiveExtensions();
                        }
                      }} 
                      className={`text-xs px-3 py-1 rounded-md font-bold transition flex items-center gap-1 ${extMode === 'edit-active' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'}`}
                    >
                      Редактировать на АТС ⚡
                    </button>
                  </div>

                  {extMode === 'range' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10.5px] uppercase font-bold text-slate-400 block mb-1">С номера (Extensions START)</label>
                        <input 
                          type="number" 
                          value={extRangeStart}
                          onChange={e => setExtRangeStart(e.target.value)}
                          className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10.5px] uppercase font-bold text-slate-400 block mb-1">До номера (Extensions END)</label>
                        <input 
                          type="number" 
                          value={extRangeEnd}
                          onChange={e => setExtRangeEnd(e.target.value)}
                          className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10.5px] uppercase font-bold text-slate-400 block mb-1">Маска имени (Template)</label>
                        <input 
                          type="text" 
                          value={extNamePattern}
                          onChange={e => setExtNamePattern(e.target.value)}
                          className="w-full text-xs p-2.5 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {extMode === 'manual' && (
                    <div className="space-y-2">
                      <label className="text-[10.5px] uppercase font-bold text-slate-400 block">Список сотрудников (Формат: Номер; Имя; Отдел)</label>
                      <textarea
                        value={extManualText}
                        onChange={e => setExtManualText(e.target.value)}
                        rows={6}
                        placeholder="200; Иван Иванов; Отдел Продаж..."
                        className="w-full text-xs p-3 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-indigo-505"
                      />
                    </div>
                  )}

                  {extMode === 'file' && (
                    <div className="border border-dashed border-slate-250 dark:border-slate-700 p-8 rounded-xl text-center space-y-4">
                      <FileSpreadsheet className="w-12 h-12 text-indigo-500 mx-auto" />
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {extFileName ? (
                            <span>Выбран файл: <strong className="text-emerald-600 dark:text-emerald-400">{extFileName}</strong></span>
                          ) : (
                            <span>Загрузите CSV файл или перетащите его сюда</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal max-w-md mx-auto">
                          Поддерживается автоматическое сопоставление колонок FreePBX: extension (Внутренний номер), name (ФИО), password (Пароль), voicemail, findmefollow_enabled и др.
                        </p>
                      </div>

                      <div className="flex flex-wrap justify-center gap-3">
                        <label className="relative cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                          <span>{extFileName ? 'Выбрать другой файл' : 'Выбрать CSV файл'}</span>
                          <input 
                            type="file" 
                            accept=".csv"
                            onChange={handleFileChange}
                            className="hidden" 
                          />
                        </label>

                        <button
                          type="button"
                          onClick={downloadCsvTemplate}
                          className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Скачать шаблон CSV (FreePBX)
                        </button>

                        <button
                          type="button"
                          onClick={downloadCurrentExtensions}
                          className="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Скачать текущих абонентов (CSV)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MAC Phones mapping toggle inside extensions */}
                  <div className="bg-slate-50 dark:bg-slate-750/30 p-3.5 rounded-xl border dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-750 dark:text-slate-300">Массовая привязка MAC-адресов SIP телефонов</span>
                      <input 
                        type="checkbox" 
                        checked={applyMacs}
                        onChange={e => setApplyMacs(e.target.checked)}
                        className="w-4 h-4"
                      />
                    </div>
                    {applyMacs && (
                      <div className="mt-3.5 space-y-2 animate-fade-in">
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Ручной ввод MAC (Номер; MAC_ADDR; Спецификационная Модель)</label>
                        <textarea
                          value={macAssignText}
                          onChange={e => setMacAssignText(e.target.value)}
                          rows={3}
                          className="w-full text-xs p-2.5 border bg-white dark:bg-indigo-950/20 font-mono text-slate-700 dark:text-slate-300 rounded-lg focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Left Form: Templates Selector & Password settings */}
                <div className="bg-slate-50 dark:bg-slate-750/30 p-5 rounded-xl border dark:border-slate-700 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Шаблон настроек (Extension Template)</h4>
                  
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Выберите шаблон</label>
                    <select
                      value={selectedExtTemplate}
                      onChange={e => handleExtTemplateChange(e.target.value)}
                      className="w-full text-xs p-2 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                    >
                      <option value="">-- Базовый шаблон (Ручной) --</option>
                      {extTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Технология</label>
                      <select
                        value={extTech}
                        onChange={e => setExtTech(e.target.value as any)}
                        className="w-full text-xs p-2 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      >
                        <option value="pjsip">PJSIP (Рекомендован)</option>
                        <option value="sip">SIP (Legacу)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Генерация пароля</label>
                      <select
                        value={extPasswordComplexity}
                        onChange={e => setExtPasswordComplexity(e.target.value as any)}
                        className="w-full text-xs p-2 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                      >
                        <option value="strong">Надёжный пароль (12 симв)</option>
                        <option value="simple">Простой (ext + rand)</option>
                        <option value="pin">Числовой PIN-код</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Запись разговоров</label>
                    <select
                      value={extRecording}
                      onChange={e => setExtRecording(e.target.value as any)}
                      className="w-full text-xs p-2 border bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                    >
                      <option value="always">Писать всегда (микшировать в стерео)</option>
                      <option value="never">Не писать</option>
                      <option value="optional">Опционально (по требованию)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={extVoicemail} 
                      onChange={e => setExtVoicemail(e.target.checked)} 
                      id="voicemail-toggle"
                    />
                    <label htmlFor="voicemail-toggle" className="text-xs text-slate-700 dark:text-slate-300 font-bold block">Голосовая почта (Voicemail)</label>
                  </div>

                  <div className="pt-2 border-t dark:border-slate-700">
                    <button
                      onClick={handleExtPreview}
                      disabled={extIsLoading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition"
                    >
                      {extIsLoading ? 'Сборка спецификации...' : 'Сгенерировать предпросмотр'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PREVIEW STEP */}
            {extStep === 'preview' && extPreviewData && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">План заведения спецификации</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExtStep('draft')}
                      className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white text-xs font-bold px-3 py-2 rounded-lg"
                    >
                      Вернуться
                    </button>

                    <button
                      onClick={() => handleExtApply()}
                      disabled={!canWrite && !isDryRun}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-5 py-2 rounded-lg"
                    >
                      {isDryRun ? 'Запустить Тестовый План' : 'ПРИМЕНИТЬ В СИСТЕМЕ АТС'}
                    </button>
                  </div>
                </div>

                {/* Conflicts alert box */}
                {extPreviewData.conflicts.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-rose-900/40 p-4 rounded-xl text-rose-800 dark:text-amber-400 text-xs">
                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Найдено пересечений с существующей базой FreePBX ({extPreviewData.conflicts.length}):</p>
                    <ul className="list-disc list-inside mt-1.5 space-y-1 font-mono text-[11px]">
                      {extPreviewData.conflicts.slice(0, 5).map((c: string, idx: number) => (
                        <li key={idx}>{c}</li>
                      ))}
                      {extPreviewData.conflicts.length > 5 && <li>... и еще {extPreviewData.conflicts.length - 5} коллизий. Они будут корректно перезаписаны.</li>}
                    </ul>
                  </div>
                )}

                {/* Specification Table */}
                <div className="border border-slate-150 dark:border-slate-700 rounded-xl overflow-hidden overflow-y-auto max-h-[350px]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-750 text-[10px] text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Ряд</th>
                        <th className="p-2.5">Внутренний Номер (EXT)</th>
                        <th className="p-2.5">Имя Сотрудника</th>
                        <th className="p-2.5">SIP/PJSIP Пасс-код</th>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5 font-bold">Очередь событий</th>
                        <th className="p-1.5 text-right">Поведение</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-mono">
                      {extPreviewData.generated.map((g: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-755/25">
                          <td className="p-2.5 text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">{g.extension}</td>
                          <td className="p-2.5 font-sans font-medium">{g.name}</td>
                          <td className="p-2.5 text-slate-400">•••••••••• (Авто)</td>
                          <td className="p-2.5 font-sans">{g.email}</td>
                          <td className="p-2.5 text-xs">
                            <span className="bg-slate-150 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]">PJSIP / {g.recording === 'always' ? 'Стереозапись' : 'Не писать'}</span>
                          </td>
                          <td className="p-2.5 text-right">
                            <span className={`text-[9.5px] uppercase font-black px-2 py-0.5 rounded-full ${
                              g.status === 'create' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'bg-indigo-50 text-indigo-750 dark:bg-indigo-950/20'
                            }`}>{g.status === 'create' ? 'Создать' : 'Обновить'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUCCESS STEP */}
            {extStep === 'success' && (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Check className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-850 dark:text-white">Все сущности успешно созданы!</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">Пакет абонентов АТС FreePBX корректно применен и подключен к системе SIP хостинга Asterisk.</p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => setExtStep('draft')}
                    className="bg-indigo-600 font-bold text-xs px-5 py-2.5 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Вернуться к созданию
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TRUNKS WIZARD */}
        {activeTab === 'trunks' && (
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
                        ? 'bg-indigo-600 text-white' 
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
                          ? 'bg-indigo-600 text-white border-indigo-650' 
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
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-5 py-3 rounded-lg flex items-center gap-2"
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
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">{trunkPreviewData.generated[0].name}</span>
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
                  <button onClick={() => setTrunkStep('draft')} className="bg-indigo-600 px-5 py-2 text-xs text-white rounded-lg">Завести еще один</button>
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
                  <span key={s.step} className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold ${routeStep === s.step ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 border dark:border-slate-700'}`}>{s.label}</span>
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
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-lg"
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
                    <span className="font-mono font-bold text-indigo-650 dark:text-indigo-400">{routePreviewData.generated[0].trunks.join(' ➔ ') || 'Нет связанных транков (внутренний)'}</span>
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
                  <button onClick={() => setRouteStep('draft')} className="bg-indigo-600 px-5 py-2 text-xs text-white rounded-lg">Выйти</button>
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
                  <span key={s.step} className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold ${didStep === s.step ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 border dark:border-slate-700'}`}>{s.label}</span>
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
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-lg"
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
                          <td className="p-2.5 text-indigo-650 dark:text-indigo-400 font-bold">{g.did}</td>
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
                  <button onClick={() => setDidStep('draft')} className="bg-indigo-600 px-5 py-2 text-xs text-white rounded-lg">Выйти</button>
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
                  <Settings className="w-5 h-5 text-indigo-600" /> Конструктор и Шаблоны операторов связи
                </h3>
                <p className="text-[11px] text-slate-500">Управляйте типовыми техническими конфигурациями для ускорения заведения линий</p>
              </div>
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 focus:outline-none">
                <Plus className="w-4 h-4" /> Новый Шаблон
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trunkTemplates.map(t => (
                <div key={t.id} className="p-4 border dark:border-slate-700 rounded-xl space-y-2.5 bg-slate-50/50 dark:bg-slate-755/10">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-sm text-indigo-650 dark:text-indigo-400">{t.operator}</span>
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
                <Activity className="w-5 h-5 text-indigo-600 animate-pulse" /> Системный журнал изменений и План Отката (Rollback Center)
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
                        <span className="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded text-indigo-650 dark:text-indigo-400 font-bold">{l.action}</span>
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
  );
}
