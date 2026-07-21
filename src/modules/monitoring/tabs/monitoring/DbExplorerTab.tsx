import React, { useState, useEffect, useMemo, useRef } from 'react';
import RussianDatePicker, { toLocalDateInputValue } from '../../../../components/common/RussianDatePicker';
import {
  Database,
  Terminal,
  Search,
  Activity,
  ShieldAlert,
  Sliders,
  History,
  FileSpreadsheet,
  FolderTree,
  Network,
  Users,
  Radio,
  Share2,
  FileCode,
  Sparkles,
  HelpCircle,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Filter,
  Eye,
  Info,
  Calendar,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { getServerNow } from '../../../../utils/serverClock';

type Row = Record<string, any>;

const reportsTemplates = [
  { title: 'Топ операторов по обработке входящих', sql: 'SELECT dstchannel as operator, COUNT(*) as calls, SUM(billsec) as seconds FROM asteriskcdrdb.cdr WHERE disposition="ANSWERED" AND dstchannel LIKE "PJSIP/%" GROUP BY dstchannel ORDER BY calls DESC' },
  { title: 'Статистика потерянных вызовов по очередям', sql: 'SELECT queuename, event, COUNT(*) as count FROM asteriskcdrdb.queue_log WHERE event IN ("ABANDON", "EXITWITHTIMEOUT") GROUP BY queuename, event' },
  { title: 'Звонки с ошибкой маршрутизации', sql: 'SELECT calldate, src, dst, lastapp, lastdata FROM asteriskcdrdb.cdr WHERE lastapp = "Congestion" OR lastapp = "ResetCDR" ORDER BY calldate DESC' },
  { title: 'Статистика нарушений SLA очередями', sql: 'SELECT queuename, AVG(CAST(data1 AS UNSIGNED)) as avg_wait_sec FROM asteriskcdrdb.queue_log WHERE event="CONNECT" GROUP BY queuename' }
];

export default function DbExplorerTab({ token }: { token: string }) {
  // Tabs config
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'telephony' | 'analytics' | 'trace' | 'console' | 'diagnostics'>('overview');

  // Database center live read-only snapshot
  const [liveSnapshot, setLiveSnapshot] = useState<any>(null);
  const [liveError, setLiveError] = useState('');
  const emptySystem = { version: '—', uptime: '—', threads: 0, slowQueries: 0, connections: 0, responseTime: '—', totalSize: '—', lastBackup: 'Нет данных' };
  const liveOverview = liveSnapshot?.overview || { databases: [], tables: { asterisk: [], asteriskcdrdb: [], pbxpuls: [] }, system: emptySystem };
  const dbOverviewData = liveOverview;
  const mapAsterisk = liveOverview.tables.asterisk || [];
  const mapCdr = liveOverview.tables.asteriskcdrdb || [];
  const mapPbxpuls = liveOverview.tables.pbxpuls || [];
  const mockExtensions = liveSnapshot?.telephony?.extensions || [];
  const mockSipDevices = liveSnapshot?.telephony?.sipDevices || [];
  const mockPjsipDevices = liveSnapshot?.telephony?.pjsipDevices || [];
  const mockQueues = liveSnapshot?.telephony?.queues || [];
  const mockTrunks = liveSnapshot?.telephony?.trunks || [];
  const mockRoutes = liveSnapshot?.telephony?.routes || [];
  const mockCdrStats = liveSnapshot?.analytics || { totalCalls: 0, incoming: 0, outgoing: 0, answered: 0, avgDuration: 0, byHour: [], byOperator: [], byTrunk: [] };
  const mockDiagnosticsAnomalies = liveSnapshot?.diagnostics?.anomalies || [];
  const mockChangeLogs = liveSnapshot?.diagnostics?.audit || [];
  const [dbState, setDbState] = useState<any>(emptySystem);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search Universal Box
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingUniversal, setIsSearchingUniversal] = useState(false);
  const [universalResults, setUniversalResults] = useState<any[] | null>(null);

  // Telephony tabs selection
  const [telephonySubTab, setTelephonySubTab] = useState<'ext' | 'sip' | 'pjsip' | 'queues' | 'trunks' | 'routes'>('ext');

  // Phone Detective Mode State
  const [detectiveInput, setDetectiveInput] = useState('');
  const [detectiveResult, setDetectiveResult] = useState<any | null>(null);
  const [isDetectiveLoading, setIsDetectiveLoading] = useState(false);

  // SQL Console Setup
  const [sql, setSql] = useState('SELECT uniqueid, linkedid, calldate, src, dst, duration, billsec, disposition FROM asteriskcdrdb.cdr ORDER BY calldate DESC LIMIT 50');
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [consoleMessage, setConsoleMessage] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [sqlHistory, setSqlHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('pbx_sql_console_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Query Builder State
  const [qbTable, setQbTable] = useState('cdr');
  const [qbFields, setQbFields] = useState<string[]>(['*']);
  const [qbFilter, setQbFilter] = useState('');
  const [qbSort, setQbSort] = useState('calldate');
  const [qbSortDir, setQbSortDir] = useState('DESC');

  const loadLiveSnapshot = async () => {
    setIsRefreshing(true);
    setLiveError('');
    try {
      const response = await fetch('/api/db-explorer/live-snapshot', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Не удалось загрузить live snapshot');
      setLiveSnapshot(payload);
      setDbState(payload.overview?.system || emptySystem);
      if (Array.isArray(payload.errors) && payload.errors.length) setLiveError(payload.errors.join(' · '));
    } catch (error: any) {
      setLiveError(error?.message || String(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const triggerRefresh = () => { void loadLiveSnapshot(); };

  useEffect(() => {
    void loadLiveSnapshot();
  }, [token]);

  // Quick SQL templates catalog
  const prebuiltSqlTemplates = useMemo(() => [
    { title: 'Последние 50 CDR', sql: 'SELECT uniqueid, linkedid, calldate, src, dst, duration, billsec, disposition FROM asteriskcdrdb.cdr ORDER BY calldate DESC LIMIT 50' },
    { title: 'События CEL по LinkedID', sql: "SELECT eventtime, eventtype, cid_num, exten, context, channame, appname FROM asteriskcdrdb.cel WHERE linkedid = '171921342.12450' ORDER BY eventtime ASC" },
    { title: 'Топ звонящих номеров (Аналитика)', sql: 'SELECT src, COUNT(*) as calls, SUM(billsec) as talk_sec FROM asteriskcdrdb.cdr WHERE calldate > NOW() - INTERVAL 1 DAY GROUP BY src ORDER BY calls DESC LIMIT 20' },
    { title: 'Спецификация экстеншенов FreePBX', sql: 'SELECT extension, name, voicemail FROM asterisk.users ORDER BY extension LIMIT 100' },
    { title: 'Лист соединений PJSIP', sql: 'SELECT * FROM asterisk.ps_contacts LIMIT 100' },
    { title: 'Сброшенные звонки очередей', sql: 'SELECT time, callid, queuename, agent, event, data1 FROM asteriskcdrdb.queue_log WHERE event = "ABANDON" ORDER BY time DESC LIMIT 50' },
    { title: 'Контакты PBXPuls', sql: 'SELECT id, name, company, phone, email, visibility, type, updated_at FROM pbxpuls.directory_contacts ORDER BY updated_at DESC LIMIT 100' },
    { title: 'События PBXPuls', sql: 'SELECT event_type, severity, source, message, created_at FROM pbxpuls.system_events ORDER BY created_at DESC LIMIT 100' }
  ], []);

  // Sync builder parameters to SQL string.
  useEffect(() => {
    const selectFields = qbFields.join(', ');
    const cdrDbTables = ['cdr', 'cel', 'queue_log', 'recordings'];
    const pbxpulsTables = mapPbxpuls.map(table => table.name);
    const dbPrefix = cdrDbTables.includes(qbTable) ? 'asteriskcdrdb.' : pbxpulsTables.includes(qbTable) ? 'pbxpuls.' : 'asterisk.';
    let built = `SELECT ${selectFields} FROM ${dbPrefix}${qbTable}`;
    if (qbFilter.trim()) {
      built += ` WHERE ${qbFilter}`;
    }
    if (qbSort.trim()) {
      built += ` ORDER BY ${qbSort} ${qbSortDir}`;
    }
    built += ` LIMIT 100`;
    setSql(built);
  }, [qbTable, qbFields, qbFilter, qbSort, qbSortDir]);

  // Execute actual query over API route or mock fallback
  const runSqlConsole = async (customSql?: string) => {
    const activeSql = customSql || sql;
    setConsoleMessage('Выполнение запроса...');
    setRows([]);
    setColumns([]);

    try {
      const res = await fetch('/api/db-explorer/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sql: activeSql,
          limit: 300
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setConsoleMessage(`Ошибка: ${data.error || 'Неизвестная ошибка на сервере'}`);
        return;
      }

      const returnedRows = data.rows || [];
      setRows(returnedRows);
      setColumns(data.columns || (returnedRows[0] ? Object.keys(returnedRows[0]) : []));
      setConsoleMessage(`Запрос выполнен успешно. Найдено записей: ${data.count ?? returnedRows.length}`);

      // Save into Console history
      const historyItem = {
        id: Math.random().toString(36).substring(2, 9),
        sql: activeSql,
        time: getServerNow().toLocaleTimeString(),
        successful: true,
        count: data.count ?? returnedRows.length
      };
      const nextHistory = [historyItem, ...sqlHistory.slice(0, 49)];
      setSqlHistory(nextHistory);
      localStorage.setItem('pbx_sql_console_history', JSON.stringify(nextHistory));
    } catch (err: any) {
      setConsoleMessage(`Превышено время ожидания или ошибка сети: ${err.message || String(err)}`);
    }
  };

  // Handle table click from Database Structure visualization
  const handleTableClick = (db: string, tableName: string) => {
    const query = `SELECT * FROM ${db}.${tableName} LIMIT 100`;
    
    setQbTable(tableName);
    setQbFields(['*']);
    setQbFilter('');
    if (tableName === 'cdr') {
      setQbSort('calldate');
    } else if (tableName === 'cel') {
      setQbSort('eventtime');
    } else {
      setQbSort('');
    }
    
    setSql(query);
    setActiveSubTab('console');
    runSqlConsole(query);
  };

  const handleExport = (format: 'csv' | 'json' | 'sql') => {
    if (!rows || !rows.length) return;
    let content = '';
    let mimeType = 'text/plain';
    let ext = 'txt';

    if (format === 'csv') {
      const headers = columns.join(',');
      const body = rows.map(r => columns.map(c => '"' + String(r[c] ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
      content = headers + '\n' + body;
      mimeType = 'text/csv;charset=utf-8;';
      ext = 'csv';
    } else if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
      mimeType = 'application/json';
      ext = 'json';
    } else if (format === 'sql') {
      content = `-- PBXPULS Database Center SQL Export\n-- Generated as backup or diagnostics\n`;
      rows.forEach(r => {
        const fields = Object.keys(r).join(', ');
        const values = Object.values(r).map(v => typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`).join(', ');
        content += `INSERT INTO exported_table (${fields}) VALUES (${values});\n`;
      });
      mimeType = 'application/sql';
      ext = 'sql';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pbxpuls-db-export-${getServerNow().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Universal Search Processor
  const handleUniversalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearchingUniversal(true);
    const term = searchQuery.trim().toLowerCase();
    try {
      const results: any[] = [];
      
      // Match users / extensions
      mockExtensions.forEach(ext => {
        if (ext.ext.includes(term) || ext.name.toLowerCase().includes(term) || ext.dept.toLowerCase().includes(term)) {
          results.push({ type: 'Extension (Пользователь)', icon: Users, title: `${ext.name} (EXT ${ext.ext})`, details: `Отдел: ${ext.dept} | Технология: ${ext.tech} | Статус: ${ext.status}` });
        }
      });

      // Match trunks
      mockTrunks.forEach(tr => {
        if (tr.name.toLowerCase().includes(term) || tr.host.toLowerCase().includes(term)) {
          results.push({ type: 'Trunk (Внешняя линия)', icon: Radio, title: tr.name, details: `Шлюз/Host: ${tr.host} | Занято линий: ${tr.channels} | Статус: ${tr.status}` });
        }
      });

      // Match routes
      mockRoutes.forEach(r => {
        if (r.name.toLowerCase().includes(term) || r.pattern.includes(term) || r.destination.toLowerCase().includes(term)) {
          results.push({ type: 'Route (Маршрутизация)', icon: Sliders, title: `${r.type} Route: ${r.name}`, details: `Паттерн: ${r.pattern} | Направление назначения: ${r.destination}` });
        }
      });

      if (/^\+?\d+$/.test(term)) {
        const response = await fetch(`/api/db-explorer/cdr/search?number=${encodeURIComponent(term)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
        });
        const payload = await response.json();
        if (response.ok && payload.success) {
          (payload.rows || []).slice(0, 25).forEach((call: any) => results.push({
            type: 'CDR Call Log (Звонок)', icon: Clock,
            title: `${call.src || '—'} → ${call.dst || '—'} (${call.disposition || '—'})`,
            details: `${call.calldate || '—'} | ${call.billsec || 0} сек. | LinkedID: ${call.linkedid || call.uniqueid || '—'}`
          }));
        }
      }

      setUniversalResults(results);
    } catch (error: any) {
      setUniversalResults([{ type: 'Ошибка live-поиска', icon: AlertTriangle, title: error?.message || String(error), details: 'Проверьте доступность read-only источника.' }]);
    } finally {
      setIsSearchingUniversal(false);
    }
  };

  // Phone Detective Processor
  const handlePhoneDetective = async (inputOverride?: string) => {
    const requestedInput = String(inputOverride || detectiveInput).trim();
    if (!requestedInput) return;
    setIsDetectiveLoading(true);
    const term = requestedInput;
    try {
      const isCallId = term.includes('.') || /[^+\d]/.test(term);
      const cdrUrl = isCallId
        ? `/api/db-explorer/cdr/by-uid/${encodeURIComponent(term)}`
        : `/api/db-explorer/cdr/search?number=${encodeURIComponent(term)}`;
      const cdrResponse = await fetch(cdrUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const cdrPayload = await cdrResponse.json();
      if (!cdrResponse.ok || !cdrPayload.success || !(cdrPayload.rows || []).length) throw new Error('CDR для указанного номера/ID не найден');
      const first = cdrPayload.rows[0];
      const linkedid = String(first.linkedid || first.uniqueid || '').replace(/'/g, "''");
      const celSql = `SELECT eventtime, eventtype, cid_num, exten, context, channame, appname, appdata, uniqueid, linkedid FROM asteriskcdrdb.cel WHERE linkedid='${linkedid}' OR uniqueid='${linkedid}' ORDER BY eventtime ASC LIMIT 500`;
      const celResponse = await fetch('/api/db-explorer/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sql: celSql, limit: 500 })
      });
      const celPayload = await celResponse.json();
      const flows = (celPayload.rows || []).map((event: any) => ({
        title: event.eventtype || 'CEL',
        desc: [event.channame, event.context, event.appname, event.appdata].filter(Boolean).join(' · '),
        time: event.eventtime ? new Date(event.eventtime).toLocaleTimeString('ru-RU', { hour12: false }) : '—',
        badge: event.cid_num || event.exten || 'CEL'
      }));
      setDetectiveResult({
        main: {
          caller: first.src || first.cnum || '—', target: first.dst || first.did || '—',
          status: first.disposition || '—', duration: `${first.billsec || 0} сек.`,
          uniqueid: first.linkedid || first.uniqueid || '—', recording: first.recordingfile || 'Нет записи',
          score: 'Нет данных MOS в CDR/CEL', operator: first.dstchannel || '—'
        },
        timeline: flows
      });
    } catch (error: any) {
      setDetectiveResult({ error: error?.message || String(error), timeline: [] });
    } finally {
      setIsDetectiveLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Title + Action bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500 rounded-lg text-white">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Центр баз данных</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Комплексный центр анализа, аудита, поиска и ручной отладки данных MariaDB / FreePBX / Asterisk
              </p>
            </div>
          </div>
        </div>

        {/* Universal instant search box */}
        <form onSubmit={handleUniversalSearch} className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск по всей телефонии (200, DID, номер...)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
          >
            Искать
          </button>
        </form>
      </div>

      {liveError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          Часть live-данных недоступна: {liveError}
        </div>
      )}

      {/* Universal Search Results Flyout */}
      {searchQuery.trim() && universalResults !== null && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-lg border border-indigo-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              Результаты сквозного поиска
            </div>
            <button
              onClick={() => { setSearchQuery(''); setUniversalResults(null); }}
              className="text-xs text-slate-400 hover:text-slate-500 underline"
            >
              Закрыть очистить
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {universalResults.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="flex gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600 hover:border-indigo-200 transition">
                  <div className="p-2 bg-white dark:bg-slate-600 rounded-lg shadow-sm self-start text-slate-500 dark:text-slate-200">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-300">{item.type}</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{item.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-350 mt-1 font-mono">{item.details}</div>
                  </div>
                </div>
              );
            })}
            {universalResults.length === 0 && (
              <div className="col-span-2 text-center text-xs p-6 text-slate-400">Совпадений не обнаружено</div>
            )}
          </div>
        </div>
      )}

      {/* Upper stats dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'СУБД MariaDB', value: dbState.version, icon: Database, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' },
          { label: 'Общий объем', value: dbState.totalSize, icon: FileSpreadsheet, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' },
          { label: 'События CEL', value: `${Number(mapCdr.find((table: any) => table.name === 'cel')?.rows || 0).toLocaleString('ru-RU')} записей`, icon: Activity, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40' },
          { label: 'Время ответа АТС', value: dbState.responseTime, icon: Clock, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40' },
          { label: 'Активные коннекты', value: dbState.connections, icon: Network, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40' },
          { label: 'Медленные запросы', value: `${dbState.slowQueries} шт`, icon: ShieldAlert, color: dbState.slowQueries > 0 ? 'text-red-500 bg-red-50 dark:bg-red-950/40 animate-pulse' : 'text-slate-400 bg-slate-50 dark:bg-slate-900/40' }
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-150 dark:border-slate-700 shadow-xs flex items-center gap-3">
              <div className={`p-2 rounded-lg ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 dark:text-slate-400 uppercase tracking-wider font-semibold">{c.label}</div>
                <div className="text-xs font-bold dark:text-white mt-0.5">{c.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Primary tab switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto gap-1">
        {[
          { id: 'overview', label: 'Обзор БД & Схемы', icon: FolderTree },
          { id: 'telephony', label: 'Таблицы телефонии', icon: Users },
          { id: 'analytics', label: 'Аналитика CDR / CEL', icon: TrendingUp },
          { id: 'trace', label: 'След звонка (CEL Trace)', icon: Share2 },
          { id: 'console', label: 'SQL Консоль / Конструктор', icon: Terminal },
          { id: 'diagnostics', label: 'Диагностика & Аудит', icon: ShieldAlert }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSubTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeSubTab === t.id
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Tab area block */}
      <div className="space-y-4">

        {/* TAB 1: OVERVIEW */}
        {activeSubTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Catalog databases */}
            <div className="lg:col-span-12 space-y-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-750">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-350">
                    Доступные схемы баз данных (Schemas)
                  </h3>
                  <button
                    onClick={triggerRefresh}
                    className="p-1 px-2.5 text-[11px] font-bold text-indigo-600 hover:bg-slate-100 dark:text-indigo-400 dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 transition"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Обновить данные
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {dbOverviewData.databases.map((db, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-150 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-900 transition">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Database className="w-4.5 h-4.5 text-indigo-500" />
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{db.name}</span>
                        </div>
                        <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                          {db.size}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-2 min-h-[2rem] leading-normal">{db.desc}</p>
                      
                      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-600 text-center text-[11px]">
                        <div>
                          <div className="text-slate-400 font-semibold uppercase text-[9px]">Таблиц</div>
                          <div className="font-bold text-slate-800 dark:text-white mt-1">{db.tables}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-semibold uppercase text-[9px]">Записей</div>
                          <div className="font-bold text-slate-800 dark:text-white mt-1">
                            {db.rows > 1000 ? (db.rows / 1000).toFixed(1) + ' k' : db.rows}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-semibold uppercase text-[9px]">Индексов</div>
                          <div className="font-bold text-slate-800 dark:text-white mt-1">{db.indexes}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Physical tables visualization */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xs border border-slate-100 dark:border-slate-750">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-350">
                      Структурная архитектура таблиц телефонии (FreePBX Map)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Кликните на имя таблицы, чтобы просмотреть её содержимое</p>
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-200">asterisk (Настройки)</span>
                      <span className="text-[10px] text-slate-400">MyISAM / InnoDB</span>
                    </div>
                    <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
                      {mapAsterisk.map((tbl, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-750/30 px-2 rounded-lg transition duration-150">
                          <button 
                            onClick={() => handleTableClick('asterisk', tbl.name)}
                            className="flex items-center gap-2 text-left cursor-pointer group focus:outline-none"
                            title="Посмотреть содержимое таблицы"
                            id={`btn-table-asterisk-${tbl.name}`}
                          >
                            <span className="text-slate-400">└─</span>
                            <span className="font-bold text-slate-700 dark:text-white font-mono group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline transition flex items-center gap-1.5">
                              {tbl.name}
                              <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-indigo-505 dark:text-indigo-400 transition-opacity" />
                            </span>
                          </button>
                          <span className="text-[10px] text-slate-400" title={tbl.desc}>{tbl.rows} стр.</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg text-xs font-bold text-indigo-800 dark:text-indigo-200">
                      <span>asteriskcdrdb (Метрики и Колл-трейс)</span>
                      <span className="text-[10px]">Aria / InnoDB</span>
                    </div>
                    <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
                      {mapCdr.map((tbl, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 text-xs hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 px-2 rounded-lg transition duration-150">
                          <button 
                            onClick={() => handleTableClick('asteriskcdrdb', tbl.name)}
                            className="flex items-center gap-2 text-left cursor-pointer group focus:outline-none"
                            title="Посмотреть содержимое таблицы"
                            id={`btn-table-cdr-${tbl.name}`}
                          >
                            <span className="text-slate-400">├─</span>
                            <span className="font-bold text-slate-700 dark:text-white font-mono group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline transition flex items-center gap-1.5">
                              {tbl.name}
                              <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-indigo-505 dark:text-indigo-400 transition-opacity" />
                            </span>
                          </button>
                          <span className="text-[10px] text-slate-400" title={tbl.desc}>
                            {tbl.rows > 1000 ? (tbl.rows / 1000).toFixed(0) + 'k' : tbl.rows} стр.
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-xs font-bold text-emerald-800 dark:text-emerald-200">
                      <span>pbxpuls (Приложение)</span>
                      <span className="text-[10px]">Только чтение</span>
                    </div>
                    <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
                      {mapPbxpuls.map((tbl, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 text-xs hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 px-2 rounded-lg transition duration-150">
                          <button onClick={() => handleTableClick('pbxpuls', tbl.name)} className="flex items-center gap-2 text-left cursor-pointer group focus:outline-none" title="Посмотреть содержимое таблицы">
                            <span className="text-slate-400">├─</span>
                            <span className="font-bold text-slate-700 dark:text-white font-mono group-hover:text-emerald-600 group-hover:underline transition flex items-center gap-1.5">
                              {tbl.name}<Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-emerald-600 transition-opacity" />
                            </span>
                          </button>
                          <span className="text-[10px] text-slate-400" title={tbl.desc}>read-only</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: TELEPHONY TABLES */}
        {activeSubTab === 'telephony' && (
          <div className="space-y-4">
            {/* Horizontal switch inside Telephony Tab */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-xs gap-1">
              {[
                { id: 'ext', label: 'Внутренние (users)', count: mockExtensions.length },
                { id: 'sip', label: 'Chan_SIP (legacy)', count: mockSipDevices.length },
                { id: 'pjsip', label: 'PJSIP Endpoints', count: mockPjsipDevices.length },
                { id: 'queues', label: 'Очереди вызовов', count: mockQueues.length },
                { id: 'trunks', label: 'Транки (Trunks)', count: mockTrunks.length },
                { id: 'routes', label: 'Маршрутизация', count: mockRoutes.length }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setTelephonySubTab(sub.id as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                    telephonySubTab === sub.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-700'
                  }`}
                >
                  {sub.label} <span className="opacity-60 ml-1">({sub.count})</span>
                </button>
              ))}
            </div>

            {/* Sub-tab view: Internal Extensions */}
            {telephonySubTab === 'ext' && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-750">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500">
                      <th className="p-3 text-left">Внутренний (EXT)</th>
                      <th className="p-3 text-left">Имя пользователя</th>
                      <th className="p-3 text-left">Группа / Отдел</th>
                      <th className="p-3 text-left">Драйвер</th>
                      <th className="p-3 text-left">Dial устройства</th>
                      <th className="p-3 text-left">Описание</th>
                      <th className="p-3 text-left">Контекст (context)</th>
                      <th className="p-3 text-left">Состояние</th>
                      <th className="p-3 text-center">Опции</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {mockExtensions.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition font-medium">
                        <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{e.ext}</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{e.name}</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">{e.dept}</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-600">{e.tech}</span></td>
                        <td className="p-3 font-mono text-[11px]">{e.dial || '—'}</td>
                        <td className="p-3 text-slate-500">{e.description || '—'}</td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">{e.context}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            e.status === 'Настроен' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                            'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              e.status === 'Настроен' ? 'bg-emerald-500' : 'bg-red-500'
                            }`} />
                            {e.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => { setDetectiveInput(e.ext); setActiveSubTab('trace'); void handlePhoneDetective(e.ext); }}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 hover:bg-white dark:bg-slate-700 dark:hover:bg-slate-600 shadow-xs text-[10px] font-bold transition"
                            title="Показать полную историю активности"
                          >
                            Детектив
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab view: Chan_SIP legacy */}
            {telephonySubTab === 'sip' && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-750">
                <div className="p-3 text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300 flex items-center gap-2 border-b dark:border-slate-700">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Внимание: chan_sip объявлен устаревшим разработчиками Asterisk 21. Рекомендуется полностью перевести абонентов на PJSIP.</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500">
                      <th className="p-3 text-left">Номер EXT</th>
                      <th className="p-3 text-left">IP Host/Адрес</th>
                      <th className="p-3 text-left">Port</th>
                      <th className="p-3 text-left">Qualify (Ping)</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">ACL (Безопасность)</th>
                      <th className="p-3 text-left">CallerID</th>
                      <th className="p-3 text-left">Контекст</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {mockSipDevices.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition font-mono">
                        <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{s.ext}</td>
                        <td className="p-3">{s.host}</td>
                        <td className="p-3 text-slate-500">{s.port}</td>
                        <td className="p-3 text-emerald-600 font-bold">{s.qualify}</td>
                        <td className="p-3 text-slate-400">{s.type}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">{s.acl || '—'}</span>
                        </td>
                        <td className="p-3 font-sans text-slate-700 dark:text-slate-300">{s.callerid}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">{s.context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab view: PJSIP Devices */}
            {telephonySubTab === 'pjsip' && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-750">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500">
                      <th className="p-3 text-left">Endpoint ID</th>
                      <th className="p-3 text-left">Служебный транспорт</th>
                      <th className="p-3 text-left">Схема аутентификации</th>
                      <th className="p-3 text-left">Ресурс (AOR)</th>
                      <th className="p-3 text-left">CallerID</th>
                      <th className="p-3 text-left">Контекст</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {mockPjsipDevices.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition font-mono">
                        <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{p.endpoint}</td>
                        <td className="p-3 text-slate-500">{p.transport}</td>
                        <td className="p-3 text-slate-400">{p.auth}</td>
                        <td className="p-3 text-blue-600">{p.aor}</td>
                        <td className="p-3 font-sans text-slate-700 dark:text-slate-300">{p.callerid || '—'}</td>
                        <td className="p-3 font-sans text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-xs" title={p.context}>
                          {p.context || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab view: Queues (Очереди) */}
            {telephonySubTab === 'queues' && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-750">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500">
                      <th className="p-3 text-left">UID Очереди</th>
                      <th className="p-3 text-left">Название / Описание</th>
                      <th className="p-3 text-left">Алгоритм распределения (strategy)</th>
                      <th className="p-3 text-left">Интервал агента (timeout)</th>
                      <th className="p-3 text-left">Список операторов</th>
                      <th className="p-3 text-left">CONNECT за 24ч</th>
                      <th className="p-3 text-left">ABANDON/Timeout за 24ч</th>
                      <th className="p-3 text-left">Состояние конфигурации</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {mockQueues.map((q, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                        <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{q.id}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{q.name}</td>
                        <td className="p-3 font-mono text-slate-500">{q.strategy}</td>
                        <td className="p-3 text-slate-600">{q.timeout}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">{q.agents}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{q.connected24h}</td>
                        <td className="p-3 font-bold text-rose-500">{q.abandoned24h}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                            q.agents === 'Нет операторов' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {q.agents === 'Нет операторов' ? 'ВНИМАНИЕ (ПУСТАЯ)' : 'НАСТРОЕНА'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab view: Trunks */}
            {telephonySubTab === 'trunks' && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-750">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500">
                      <th className="p-3 text-left">ID</th>
                      <th className="p-3 text-left">Имя транка</th>
                      <th className="p-3 text-left">Драйвер</th>
                      <th className="p-3 text-left">Адрес шлюза (Host)</th>
                      <th className="p-3 text-left">Входящий контекст (context)</th>
                      <th className="p-3 text-left font-mono">Лимиты каналов</th>
                      <th className="p-3 text-left">Текущее состояние</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {mockTrunks.map((t, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition font-mono">
                        <td className="p-3 font-bold text-slate-400">{t.id}</td>
                        <td className="p-3 font-sans font-bold text-slate-800 dark:text-white">{t.name}</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 uppercase text-slate-500">{t.tech}</span></td>
                        <td className="p-3 text-slate-500">{t.host}</td>
                        <td className="p-3 text-slate-400 text-[11px]">{t.context}</td>
                        <td className="p-3 font-bold text-slate-600">{t.channels}</td>
                        <td className="p-3 font-sans">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === 'Настроен' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700 animate-pulse'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'Настроен' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab view: Routes */}
            {telephonySubTab === 'routes' && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-750">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500">
                      <th className="p-3 text-left">Класс маршрута</th>
                      <th className="p-3 text-left">Название диалплана</th>
                      <th className="p-3 text-left">Шаблон поиска (Dial Pattern / DID)</th>
                      <th className="p-3 text-left font-mono">Приоритет</th>
                      <th className="p-3 text-left">Направление маршрутизации вызова</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {mockRoutes.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.type === 'Inbound' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                          }`}>
                            {r.type === 'Inbound' ? 'ВХОДЯЩИЙ (Inbound)' : 'ИСХОДЯЩИЙ (Outbound)'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800 dark:text-white">{r.name}</td>
                        <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{r.pattern}</td>
                        <td className="p-3 font-mono text-slate-500">{r.priority}</td>
                        <td className="p-3 font-semibold text-slate-700 dark:text-slate-350">{r.destination}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CDR / CEL ANALYTICS */}
        {activeSubTab === 'analytics' && (
          <div className="space-y-4">
            {/* Upper state figures */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: 'Всего соединений', value: mockCdrStats.totalCalls, icon: Activity, change: 'Реальные LinkedID за 24 часа' },
                { label: 'Входящие линии', value: mockCdrStats.incoming, icon: Network, change: `${mockCdrStats.totalCalls ? (mockCdrStats.incoming / mockCdrStats.totalCalls * 100).toFixed(1) : '0.0'}% от звонков` },
                { label: 'Исходящие вызовы', value: mockCdrStats.outgoing, icon: Sliders, change: `${mockCdrStats.totalCalls ? (mockCdrStats.outgoing / mockCdrStats.totalCalls * 100).toFixed(1) : '0.0'}% от звонков` },
                { label: 'Успешно отвечены', value: mockCdrStats.answered, icon: CheckCircle, change: `${mockCdrStats.totalCalls ? (mockCdrStats.answered / mockCdrStats.totalCalls * 100).toFixed(1) : '0.0'}% за 24 часа` },
                { label: 'Средний разговор', value: `${mockCdrStats.avgDuration || 0} сек.`, icon: Clock, change: 'Среднее по отвеченным за 24 часа' }
              ].map((st, i) => (
                <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="text-[10px] uppercase font-bold tracking-wider">{st.label}</span>
                    <st.icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-lg font-black dark:text-white mt-1">{st.value}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">✓ {st.change}</div>
                </div>
              ))}
            </div>

            {/* CDR Graphs Section */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-8 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">График активности звонков по часам (CDR Core)</h3>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                    <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full" /> Входящие
                    <span className="w-2.5 h-2.5 bg-sky-400 rounded-full ml-2" /> Исходящие
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockCdrStats.byHour} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', color: '#fff', borderRadius: '8px', fontSize: '11px' }} />
                      <Area type="monotone" dataKey="входящие" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorInc)" />
                      <Area type="monotone" dataKey="исходящие" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorOut)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Prebuilt reports selection */}
              <div className="xl:col-span-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Быстрые CDR отчёты FreePBX</h3>
                <p className="text-[11px] text-slate-500">Автоматическая генерация аналитических выборок нажатием одной кнопки:</p>

                <div className="space-y-2 mt-2">
                  {reportsTemplates.map((rep, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSql(rep.sql);
                        setActiveSubTab('console');
                        runSqlConsole(rep.sql);
                      }}
                      className="w-full text-left p-3 rounded-xl border border-slate-150 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs transition"
                    >
                      <div className="font-bold text-slate-950 dark:text-white flex items-center justify-between">
                        <span>{rep.title}</span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="text-[10px] text-indigo-500 font-mono mt-1 line-clamp-1">{rep.sql}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Down charts: operators & breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Нагрузка по операторам (Всего обработано вызовов)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockCdrStats.byOperator} margin={{ top: 20, right: 10, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="вызовов" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={35} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Распределение вызовов по шлюзам / транкам</h3>
                <div className="flex h-64 items-center justify-center">
                  <div className="w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mockCdrStats.byTrunk}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {mockCdrStats.byTrunk.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#38bdf8', '#f59e0b'][index % 3]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-1/2 space-y-3 pl-4">
                    {mockCdrStats.byTrunk.map((tr, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#6366f1', '#38bdf8', '#f59e0b'][idx] }} />
                        <div>
                          <p className="text-xs font-bold dark:text-white leading-none">{tr.name}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{tr.value} звонков ({(tr.value / Math.max(1, mockCdrStats.byTrunk.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0)) * 100).toFixed(1)}%)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CALL TRACE & PHONE DETECTIVE */}
        {activeSubTab === 'trace' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Input detective config */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h3 className="text-sm font-bold tracking-tight">Режим ИИ-Детектива</h3>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Укажите любой внутренний номер (EXT), DID входящей линии, номер клиента или UniqueID звонка. Система соберёт полный жизненный след вызова из CDR, CEL и очередей:
              </p>

              <div>
                <label className="text-xs font-bold block mb-1">Идентификатор / Номер</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={detectiveInput}
                    onChange={e => setDetectiveInput(e.target.value)}
                    placeholder="Например: 79201234567, 101"
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => { void handlePhoneDetective(); }}
                    disabled={isDetectiveLoading}
                    className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-40"
                  >
                    🚀 Трассировка
                  </button>
                </div>
              </div>

            </div>

            {/* Trace Timeline outcome */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
                <div className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  Полный хронологический профиль
                </div>
                {detectiveResult?.main && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                    {detectiveResult.main.status}
                  </span>
                )}
              </div>

              {isDetectiveLoading ? (
                <div className="py-24 text-center text-xs text-slate-500 space-y-3">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <div>Синхронизация с журналом CEL, CDR и очередями...</div>
                </div>
              ) : detectiveResult?.error ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                  {detectiveResult.error}
                </div>
              ) : detectiveResult?.main ? (
                <div className="space-y-6">
                  {/* Summary key value cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border">
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">От кого (Src)</div>
                      <div className="text-xs font-bold font-mono dark:text-white mt-1">{detectiveResult.main.caller}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Очередь / DID</div>
                      <div className="text-xs font-bold dark:text-white mt-1">{detectiveResult.main.target}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Общий путь звонка</div>
                      <div className="text-xs font-bold dark:text-white mt-1">{detectiveResult.main.operator}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Длительность</div>
                      <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1">{detectiveResult.main.duration}</div>
                    </div>
                  </div>

                  {/* Vertical Timeline */}
                  <div className="relative border-l-2 border-indigo-100 dark:border-slate-700 ml-4 pl-6 space-y-6">
                    {detectiveResult.timeline.map((step: any, sIdx: number) => (
                      <div key={sIdx} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white dark:border-slate-800 shadow-xs" />
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white">{step.title}</span>
                            <span className="px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold bg-slate-100 dark:bg-slate-600 text-slate-500">
                              {step.badge}
                            </span>
                          </div>
                          <span className="text-[10.5px] font-mono text-slate-400">{step.time}</span>
                        </div>
                        <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">
                          {step.desc}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Smart automated AI recommendations block based on this trace */}
                  <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100/60 dark:border-slate-700/80">
                    <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs mb-2 uppercase">
                      <Sparkles className="w-4 h-4" />
                      ИИ Ассистент PBXPULS: Оценка качества вызова
                    </div>
                    <div className="text-xs leading-normal space-y-1 text-slate-700 dark:text-slate-300">
                      <p>✓ Звонок был доставлен и завершен штатно. Код завершения <span className="font-mono">16 (Normal Clearing)</span> означает спокойный сброс трубки клиентом.</p>
                      <p className="mt-1"><span className="font-bold">Анализ сети:</span> CDR/CEL не содержат достоверных RTP/RTCP-метрик. Для оценки MOS, потерь и джиттера нужны реальные данные сетевого захвата.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center text-xs text-slate-400 space-y-2">
                  <Share2 className="w-8 h-8 mx-auto stroke-1" />
                  <div>Запрос на трассировку не выполнен. Введите номер телефона или UniqueID и нажмите "Трассировка"</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SQL CONSOLE & QUERY BUILDER */}
        {activeSubTab === 'console' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            
            {/* SQL Control console panel */}
            <div className="xl:col-span-8 space-y-4">
              {/* Prebuilt Templates Selection drop */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-705 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Шаблоны системных запросов (Select template)</h3>
                    <p className="text-[11px] text-slate-500 mt-1">Ознакомьтесь и примените готовые запросы к конфигурации телефонии и логам</p>
                  </div>

                  <select
                    value={selectedTemplate}
                    onChange={e => {
                      setSelectedTemplate(e.target.value);
                      const t = prebuiltSqlTemplates.find(tem => tem.title === e.target.value);
                      if (t) setSql(t.sql);
                    }}
                    className="h-9 min-w-[200px] text-xs px-2.5 border border-slate-200 dark:border-slate-650 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                  >
                    <option value="">-- Выбрать шаблон --</option>
                    {prebuiltSqlTemplates.map((t, idx) => (
                      <option key={idx} value={t.title}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SQL Text Area Editor */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-705 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-350">Терминал ручных SQL-запросов</span>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">Только чтение · SELECT</div>
                </div>

                <div className="relative">
                  <textarea
                    value={sql}
                    onChange={e => setSql(e.target.value)}
                    className="w-full h-36 p-3 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs bg-slate-900 text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="SELECT * FROM asteriskcdrdb.cdr ORDER BY calldate DESC LIMIT 10..."
                  />
                  <div className="absolute right-3 bottom-3 text-[10px] font-mono text-emerald-600 bg-slate-950/60 px-1.5 py-0.5 rounded">
                    SQL Console (UTF-8)
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runSqlConsole()}
                    className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Выполнить запрос
                  </button>

                  <button
                    onClick={() => { setRows([]); setColumns([]); setConsoleMessage('Результаты консоли очищены'); }}
                    className="px-3 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border text-slate-600 rounded-lg transition"
                  >
                    Очистить
                  </button>

                  <div className="flex-1" />

                  {rows.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExport('csv')}
                        className="px-3 py-2 text-xs font-bold text-emerald-700 border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Скачать CSV
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        className="px-3 py-2 text-xs font-bold text-indigo-700 border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1"
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        Скачать JSON
                      </button>
                    </div>
                  )}
                </div>

                {consoleMessage && (
                  <div className={`p-3 rounded-lg border text-xs font-bold font-mono ${
                    consoleMessage.includes('Ошибка') 
                      ? 'bg-rose-50 text-rose-700 border-rose-100' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  }`}>
                    {consoleMessage}
                  </div>
                )}
              </div>

              {/* Console Output Table */}
              {rows.length > 0 && (
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-705 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-slate-400">Результат выполнения ({rows.length} строк)</span>
                    <span className="text-[10px] text-slate-400 font-mono">Выполнен в {getServerNow().toLocaleTimeString()}</span>
                  </div>

                  <div className="overflow-x-auto max-h-64 rounded-xl border">
                    <table className="w-full text-[11px] font-mono whitespace-nowrap">
                      <thead className="bg-slate-50 sticky top-0 border-b text-slate-500">
                        <tr>
                          {columns.map(col => (
                            <th key={col} className="p-2.5 text-left font-bold">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                            {columns.map(col => (
                              <td key={col} className="p-2 text-slate-800 dark:text-slate-200" title={String(row[col] ?? '')}>
                                <div className="max-w-[200px] truncate">
                                  {String(row[col] ?? '')}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Config query builder sidebar */}
            <div className="xl:col-span-4 space-y-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-705 shadow-sm space-y-3">
                <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-xs uppercase">
                  <Sliders className="w-4 h-4" />
                  Конструктор SQL без кода
                </div>
                <p className="text-[11.5px] text-slate-500">Сгенерируйте и примените сложный запрос автоматически:</p>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10.5px] uppercase font-bold text-slate-400">1. Целевая таблица</label>
                    <select
                      value={qbTable}
                      onChange={e => {
                        setQbTable(e.target.value);
                        setQbFields(['*']);
                        if (e.target.value === 'cdr') setQbSort('calldate');
                        else if (e.target.value === 'cel') setQbSort('eventtime');
                        else setQbSort('');
                      }}
                      className="mt-1 w-full text-xs p-2 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-505"
                    >
                      <optgroup label="asteriskcdrdb (Логи и Метрики)">
                        {mapCdr.map(t => (
                          <option key={t.name} value={t.name}>{t.name} ({t.desc})</option>
                        ))}
                      </optgroup>
                      <optgroup label="asterisk (Настройки АТС)">
                        {mapAsterisk.map(t => (
                          <option key={t.name} value={t.name}>{t.name} ({t.desc})</option>
                        ))}
                      </optgroup>
                      <optgroup label="pbxpuls (Приложение, только чтение)">
                        {mapPbxpuls.map(t => (
                          <option key={t.name} value={t.name}>{t.name} ({t.desc})</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10.5px] uppercase font-bold text-slate-400">2. Отобразить поля</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {qbTable === 'cdr' ? (
                        ['*', 'calldate', 'src', 'dst', 'duration', 'billsec', 'disposition', 'recordingfile'].map(f => (
                          <button
                            key={f}
                            onClick={() => {
                              if (f === '*') setQbFields(['*']);
                              else {
                                const next = qbFields.filter(x => x !== '*');
                                const active = next.includes(f) ? next.filter(x => x !== f) : [...next, f];
                                setQbFields(active.length === 0 ? ['*'] : active);
                              }
                            }}
                            className={`px-2 py-1 text-[10.5px] rounded border font-mono transition ${
                              qbFields.includes(f) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 hover:bg-slate-100'
                            }`}
                          >
                            {f}
                          </button>
                        ))
                      ) : (
                        ['*', 'id', 'name', 'tech', 'status', 'eventtime', 'eventtype', 'channame'].map(f => (
                          <button
                            key={f}
                            onClick={() => {
                              if (f === '*') setQbFields(['*']);
                              else {
                                const next = qbFields.filter(x => x !== '*');
                                const active = next.includes(f) ? next.filter(x => x !== f) : [...next, f];
                                setQbFields(active.length === 0 ? ['*'] : active);
                              }
                            }}
                            className={`px-2 py-1 text-[10.5px] rounded border font-mono transition ${
                              qbFields.includes(f) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 hover:bg-slate-100'
                            }`}
                          >
                            {f}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] uppercase font-bold text-slate-400">3. Условия WHERE фильтрации</label>
                    <input
                      type="text"
                      value={qbFilter}
                      onChange={e => setQbFilter(e.target.value)}
                      placeholder="Напр: disposition = 'ANSWERED'"
                      className="mt-1 w-full text-xs p-2 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none placeholder-slate-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10.5px] uppercase font-bold text-slate-400">Сортировка</label>
                      <input
                        type="text"
                        value={qbSort}
                        onChange={e => setQbSort(e.target.value)}
                        placeholder="Поле"
                        className="mt-1 w-full text-xs p-2 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] uppercase font-bold text-slate-400">Порядок</label>
                      <select
                        value={qbSortDir}
                        onChange={e => setQbSortDir(e.target.value)}
                        className="mt-1 w-full text-xs p-2 border bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg h-[34px] focus:outline-none"
                      >
                        <option value="DESC">DESC (убывание)</option>
                        <option value="ASC">ASC (возрастание)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Command history selection list */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-705 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-slate-600 font-bold text-xs uppercase">
                    <History className="w-4 h-4" />
                    История запросов консоли
                  </div>
                  {sqlHistory.length > 0 && (
                    <button
                      onClick={() => { setSqlHistory([]); localStorage.removeItem('pbx_sql_console_history'); }}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      Очистить
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {sqlHistory.map((h, i) => (
                    <button
                      key={h.id || i}
                      onClick={() => { setSql(h.sql); runSqlConsole(h.sql); }}
                      className="w-full text-left p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-xs leading-normal border transition flex justify-between items-center"
                    >
                      <span className="font-mono truncate flex-1 text-[11px] text-slate-500">{h.sql}</span>
                      <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">{h.time}</span>
                    </button>
                  ))}
                  {sqlHistory.length === 0 && (
                    <div className="text-center py-6 text-slate-450 text-[11px]">История пока пуста</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: HEALTH DIAGNOSTICS & AUDIT */}
        {activeSubTab === 'diagnostics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Health anomalies checklist */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-500 animate-pulse" />
                  <h3 className="text-sm font-bold tracking-tight">Обнаруженные отклонения и аномалии телефонии</h3>
                </div>
                <span className="text-[10px] bg-red-50 text-red-600 font-bold px-2 py-0.5 rounded">
                  Всего аномалий: {mockDiagnosticsAnomalies.length}
                </span>
              </div>

              <div className="space-y-3">
                {mockDiagnosticsAnomalies.map((an, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border ${
                    an.type === 'danger' 
                      ? 'bg-rose-50/50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/60' 
                      : an.type === 'warning'
                      ? 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/60'
                      : 'bg-indigo-50/50 border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900/60'
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-black">
                      {an.type === 'danger' ? <AlertTriangle className="w-4.5 h-4.5 text-rose-500" /> : <Info className="w-4.5 h-4.5 text-amber-500" />}
                      <span className="dark:text-white">{an.title}</span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-medium">{an.detail}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/80 text-[11px] leading-relaxed">
                      <div>
                        <span className="font-bold text-red-600 dark:text-red-400">Последствия:</span>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">{an.impact}</p>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">Рекомендация:</span>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">{an.rec}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit log logs sidebar */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Журнал изменений конфигурации</h3>
                <p className="text-[11px] text-slate-500 mt-1">Хроника изменений пользователей, маршрутов и очередей в БД FreePBX</p>
              </div>

              <div className="relative border-l border-slate-250 dark:border-slate-700 ml-2 pl-3 space-y-4">
                {mockChangeLogs.map((log, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-slate-350 dark:bg-slate-500" />
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-slate-400">{log.date}</span>
                      <span className="text-[9px] bg-slate-100 dark:bg-slate-600 text-slate-500 px-1 py-0.2 rounded font-bold uppercase">{log.author}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
                      {log.object} → {log.action}
                    </div>
                    <div className="text-[10.5px] text-slate-400 font-mono mt-1 break-all line-clamp-2">
                       {log.previous} ➔ {log.current}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Footer rapid links integration */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Для перехода в другие инструменты диагностики, совершите клик по ссылкам интеграции:
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-250 font-bold flex items-center gap-1">
              Активные звонки <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-250 font-bold flex items-center gap-1">
              Карта IP / SIP устройств <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-250 font-bold flex items-center gap-1">
              Командный центр <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
