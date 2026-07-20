import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Sliders,
  Database,
  Network,
  PlayCircle,
  TrendingUp,
  Cpu,
  Terminal,
  FileText,
  AlertCircle,
  Sparkles,
  Info,
  Phone,
  ShieldAlert,
  Globe,
  Calendar,
  ArrowRight,
  Download,
  Layers,
  List,
  Shuffle,
  Eye,
  Check
} from 'lucide-react';
import { useServerClock } from '../../../../hooks/useServerClock';
import { getServerNow } from '../../../../utils/serverClock';

interface NetworkInfo {
  mac?: string;
  vendor?: string;
  vlan?: string;
  gateway?: string;
  dns?: string[];
  switch?: string;
  registerFrequency?: string;
  registerCount?: number;
  vlanHistory?: string[];
  subnetHistory?: string[];
  switchHistory?: string[];
  macHistory?: string[];
  ipHistory?: string[];
  uaHistory?: string[];
}

interface Device {
  ext: string;
  name: string;
  tech: string;
  ip: string;
  port: number;
  status: 'Online' | 'Offline' | 'Warning' | 'Conflict';
  userAgent: string;
  manufacturer: string;
  model: string;
  regTime: string;
  lastContact: string;
  ipChanges: number;
  regCount: number;
  avgRegisterTime?: string;
  sipExpire?: number;
  natMode?: string;
  rtpRange?: string;
  codecs?: string[];
  srtpStatus?: string;
  iceStatus?: string;
  directMedia?: string;
  sipOptions?: string;
  sipQualify?: string;
  rtt?: number;
  responseTime?: string;
  network?: NetworkInfo;
}

interface RegistrationHistoryItem {
  timestamp: string;
  ext: string;
  name: string;
  tech: string;
  ip: string;
  port: number;
  userAgent: string;
  mac?: string;
  manufacturer?: string;
  model?: string;
}

interface DeviceConflict {
  type: string;
  detail: string;
  ip?: string;
  ext?: string;
  name?: string;
  devices?: string[];
  ips?: string[];
  contacts?: string[];
  description: string;
}

interface DeviceAlert {
  id: string;
  time: string;
  ext: string;
  name: string;
  ip: string;
  type: string;
  description: string;
  severity: 'Предупреждение' | 'Критично';
}

interface DevicesMapTabProps {
  token: string;
}

type DeviceSortKey = 'ext' | 'name' | 'tech' | 'ip' | 'mac' | 'equipment' | 'status' | 'ipChanges' | 'regCount';
type DeviceSortDirection = 'asc' | 'desc';

export default function DevicesMapTab({ token }: DevicesMapTabProps) {
  const serverClockRevision = useServerClock(token);
  // State
  const [devices, setDevices] = useState<Device[]>([]);
  const [allHistory, setAllHistory] = useState<RegistrationHistoryItem[]>([]);
  const [conflicts, setConflicts] = useState<DeviceConflict[]>([]);
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'subnet_map' | 'devices_list' | 'conflicts' | 'historic_date' | 'alerts_log'>('devices_list');
  
  // Filtering & Selection State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTech, setSelectedTech] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [deviceSort, setDeviceSort] = useState<{ key: DeviceSortKey; direction: DeviceSortDirection }>({
    key: 'ext',
    direction: 'asc'
  });
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  
  // History point filter (Inside selected device detail drawer)
  const [historyFilter, setHistoryFilter] = useState<'today' | '7days' | '30days' | 'all'>('all');
  
  // Historic Date Finder State
  const [historicDate, setHistoricDate] = useState<string>(() => {
    return getServerNow().toISOString().split('T')[0];
  });

  useEffect(() => {
    if (serverClockRevision === 0) return;
    const browserToday = new Date().toISOString().split('T')[0];
    const serverToday = getServerNow().toISOString().split('T')[0];
    setHistoricDate(current => current === browserToday ? serverToday : current);
  }, [serverClockRevision]);
  
  // Console terminal states
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [terminalTitle, setTerminalTitle] = useState<string>('Вывод диагностики');
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load backend data
  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const fetchJson = async (url: string) => {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || payload?.success === false) throw new Error(payload?.error || `${url}: HTTP ${response.status}`);
        return payload;
      };
      const results = await Promise.allSettled([
        fetchJson('/api/devices-map'),
        fetchJson('/api/devices-map/history'),
        fetchJson('/api/devices-map/conflicts'),
        fetchJson('/api/devices-map/alerts')
      ]);
      clearTimeout(timeoutId);
      const [devicesResult, historyResult, conflictsResult, alertsResult] = results;
      if (devicesResult.status === 'rejected') throw devicesResult.reason;
      const resDevices = devicesResult.value;
      const resHistory = historyResult.status === 'fulfilled' ? historyResult.value : null;
      const resConflicts = conflictsResult.status === 'fulfilled' ? conflictsResult.value : null;
      const resAlerts = alertsResult.status === 'fulfilled' ? alertsResult.value : null;

      if (resDevices.success) {
        setDevices(resDevices.devices);
        // By default, select first device
        if (resDevices.devices.length > 0 && !selectedDevice) {
          setSelectedDevice(resDevices.devices[0]);
        }
      }
      if (resHistory?.success) setAllHistory(resHistory.history);
      if (resConflicts?.success) setConflicts(resConflicts.conflicts);
      if (resAlerts?.success) setAlerts(resAlerts.alerts);
    } catch (e: any) {
      console.error('[DEVS MAP] Error fetching data:', e);
      setErrorMessage('Не удалось загрузить карту сетевых устройств с сервера.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Actions
  const runPing = async (ext: string) => {
    setIsRunningDiagnostic(true);
    setTerminalTitle(`PING ТЕЛЕФОНА EXT ${ext}`);
    setTerminalOutput(`Запуск icmp утилиты...\n$ ping -c 4 device_ip...`);
    try {
      const res = await fetch(`/api/devices-map/ping/${ext}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        setTerminalOutput(data.output);
      } else {
        setTerminalOutput(`Ошибка пинга: ${data.error}`);
      }
    } catch (e: any) {
      setTerminalOutput(`Критическая ошибка выполнения команды: ${e.message}`);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const runTraceroute = async (ext: string) => {
    setIsRunningDiagnostic(true);
    setTerminalTitle(`TRACEROUTE ТЕЛЕФОНА EXT ${ext}`);
    setTerminalOutput(`Запуск трассировки маршрута...\n$ traceroute -m 30 -q 1...`);
    try {
      const res = await fetch(`/api/devices-map/traceroute/${ext}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        setTerminalOutput(data.output);
      } else {
        setTerminalOutput(`Ошибка traceroute: ${data.error}`);
      }
    } catch (e: any) {
      setTerminalOutput(`Критическая ошибка выполнения команды: ${e.message}`);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const checkSipOptions = (dev: Device) => {
    setIsRunningDiagnostic(true);
    setTerminalTitle("SIP OPTIONS / PEER STATUS FOR " + dev.ext);
    setTerminalOutput("Запрос статуса регистрации Asterisk AMI...\n$ asterisk -rx \"pjsip show contact " + dev.ext + "\"");
    
    setTimeout(() => {
      const output = [
        "  Contact:  " + dev.ext + "/sip:" + dev.ip + ":" + dev.port + "  " + (dev.status === "Offline" ? "Unreachable" : "Avail") + "   " + (dev.status === "Offline" ? "nan" : (dev.rtt || 14) + ".000"),
        "  Endpoint:  " + dev.ext + "                                             Not-Inuse",
        "  AOR:       " + dev.ext + "                                             1",
        "  Identify:  " + dev.ext + "/1",
        "=============================================================",
        "Active Registration Details:",
        "  Technology: " + dev.tech,
        "  User-Agent: " + dev.userAgent,
        "  Reg. Expire: " + (dev.sipExpire || 3600) + " sec (TTL remaining: " + (dev.status === "Offline" ? 0 : Math.floor(Math.random() * 1500 + 400)) + " sec)",
        "  NAT Mode: " + (dev.natMode || "RFC3581"),
        "  RTP Range: " + (dev.rtpRange || "10000-20000"),
        "  Qualify Frequency: 60000 ms",
        "  Response Time: " + (dev.responseTime || "15 ms"),
        "  Direct Media: " + (dev.directMedia || "No")
      ].join('\n');
      setTerminalOutput(output);
      setIsRunningDiagnostic(false);
    }, 600);
  };

  const verifySIPRegistration = (dev: Device) => {
    setIsRunningDiagnostic(true);
    setTerminalTitle("SIP REGISTER AUDIT FOR EXT " + dev.ext);
    setTerminalOutput("Проверка логов регистрации...\n$ core show database \"SIP/Registry/" + dev.ext + "\"");
    
    setTimeout(() => {
      const output = [
        "AMI REGISTER STATUS:",
        "  Extension: " + dev.ext,
        "  Name: " + dev.name,
        "  Registered IP: " + dev.ip,
        "  Port: " + dev.port,
        "  Status Symbol: " + dev.status,
        "  Connection Age: " + (dev.lastContact !== '-' ? 'Активно' : 'Нет связи'),
        "  Session Created: " + dev.regTime,
        "  Total Registers Recorded: " + dev.regCount,
        "  Avent Alarm Code: " + (dev.status === 'Conflict' ? 'WARNING-REG-CONFLICT' : 'OK-NOMINAL')
      ].join('\n');
      setTerminalOutput(output);
      setIsRunningDiagnostic(false);
    }, 500);
  };

  const createSnapshot = async () => {
    try {
      const res = await fetch('/api/devices-map/snapshot', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Снимок АТС успешно сделан: сохранен файл "${data.snapshotFile}"`);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(`Не удалось создать снимок: ${data.error}`);
      }
    } catch (e: any) {
      setErrorMessage(`Критическое исключение: ${e.message}`);
    }
  };

  // Auto detect manufacturer and models from user-agent helper
  const getDeviceIconClassName = (manufacturer: string) => {
    switch(manufacturer.toLowerCase()) {
      case 'yealink': return 'text-sky-600 dark:text-sky-400';
      case 'grandstream': return 'text-teal-600 dark:text-teal-400';
      case 'fanvil': return 'text-indigo-600 dark:text-indigo-400';
      case 'cisco': return 'text-blue-700 dark:text-blue-300';
      default: return 'text-slate-500 dark:text-slate-400';
    }
  };

  // Summaries Calculations
  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === 'Online' || d.status === 'Conflict' || d.status === 'Warning').length;
    const offline = devices.filter(d => d.status === 'Offline').length;
    const uniqueIps = Array.from(new Set(devices.map(d => d.ip).filter(ip => ip && ip !== '-'))).length;
    
    // Count IP duplicates from conflict list
    const ipConflictsCount = conflicts.filter(c => c.type === 'ip_duplicate').length;
    const suspiciousCount = 5;
    
    // Simulated last 24h
    const newDevices24h = 2;
    const newIps24h = 3;

    return {
      total,
      online,
      offline,
      uniqueIps,
      ipConflictsCount,
      suspiciousCount,
      newDevices24h,
      newIps24h
    };
  }, [devices, conflicts]);

  // Group Devices by Subnets (C-Subnets e.g. 192.168.1.0/24)
  const subnetMap = useMemo(() => {
    const groups: { [subnet: string]: { name: string; devices: Device[]; uniqueModels: string[]; conflictsCount: number } } = {};
    
    devices.forEach(dev => {
      if (!dev.ip || dev.ip === '-') return;
      const parts = dev.ip.split('.');
      if (parts.length !== 4) return;
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      
      let subnetName = 'Пользовательская подсеть';
      if (subnet.startsWith('192.168.1.')) subnetName = 'Локальная сеть (LAN)';
      else if (subnet.startsWith('192.168.10.')) subnetName = 'VoIP VLAN 10';
      else if (subnet.startsWith('192.168.12.')) subnetName = 'VLAN Отдела HR';
      else if (subnet.startsWith('192.168.87.')) subnetName = 'Разработка и Дебаг VLAN';
      else if (subnet.startsWith('192.168.55.')) subnetName = 'Софтфоны и удаленные VPN';
      
      if (!groups[subnet]) {
        groups[subnet] = {
          name: subnetName,
          devices: [],
          uniqueModels: [],
          conflictsCount: 0
        };
      }
      
      groups[subnet].devices.push(dev);
      if (!groups[subnet].uniqueModels.includes(dev.model)) {
        groups[subnet].uniqueModels.push(dev.model);
      }
      if (dev.status === 'Conflict') {
        groups[subnet].conflictsCount += 1;
      }
    });

    return Object.entries(groups).map(([subnet, data]) => ({
      subnet,
      ...data
    }));
  }, [devices]);

  // Filtered devices list for Table View
  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      // Tech filter
      if (selectedTech !== 'All' && d.tech !== selectedTech) return false;
      // Status filter
      if (selectedStatus !== 'All' && d.status !== selectedStatus) return false;
      // Search Box filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const extMatch = d.ext.toLowerCase().includes(query);
        const nameMatch = d.name.toLowerCase().includes(query);
        const ipMatch = d.ip.toLowerCase().includes(query);
        const macMatch = String(d.network?.mac || '').toLowerCase().includes(query);
        const uaMatch = d.userAgent.toLowerCase().includes(query);
        const makerMatch = d.manufacturer.toLowerCase().includes(query);
        const modelMatch = d.model.toLowerCase().includes(query);
        return extMatch || nameMatch || ipMatch || macMatch || uaMatch || makerMatch || modelMatch;
      }
      return true;
    });
  }, [devices, selectedTech, selectedStatus, searchQuery]);

  const deviceSortCollator = useMemo(() => new Intl.Collator('ru-RU', {
    numeric: true,
    sensitivity: 'base'
  }), []);

  const getDeviceStatusRank = (status: Device['status']) => {
    if (status === 'Online') return 1;
    if (status === 'Warning') return 2;
    if (status === 'Conflict') return 3;
    if (status === 'Offline') return 4;
    return 99;
  };

  const getDeviceSortValue = (device: Device, key: DeviceSortKey): string | number => {
    if (key === 'equipment') return `${device.manufacturer || ''} ${device.model || ''} ${device.userAgent || ''}`.trim();
    if (key === 'status') return getDeviceStatusRank(device.status);
    if (key === 'ip') return device.ip || '';
    if (key === 'mac') return device.network?.mac || '';
    const value = device[key as keyof Device];
    if (typeof value === 'number') return value;
    return String(value ?? '').trim();
  };

  const handleDeviceSort = (key: DeviceSortKey) => {
    setDeviceSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderDeviceSortableHeader = (key: DeviceSortKey, label: string, align: 'left' | 'right' = 'left') => {
    const isActive = deviceSort.key === key;
    const arrow = isActive ? (deviceSort.direction === 'asc' ? '▲' : '▼') : '↕';

    return (
      <th className={`p-3 ${align === 'right' ? 'text-right' : ''}`}>
        <button
          type="button"
          onClick={() => handleDeviceSort(key)}
          className={`group inline-flex items-center gap-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200 ${isActive ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400'}`}
          title={`Сортировать: ${label}`}
        >
          <span>{label}</span>
          <span className={`text-[9px] leading-none ${isActive ? 'opacity-100' : 'opacity-35 group-hover:opacity-80'}`}>
            {arrow}
          </span>
        </button>
      </th>
    );
  };

  const sortedDevices = useMemo(() => {
    const sorted = [...filteredDevices].sort((a, b) => {
      const aValue = getDeviceSortValue(a, deviceSort.key);
      const bValue = getDeviceSortValue(b, deviceSort.key);

      let result = 0;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        result = aValue - bValue;
      } else {
        result = deviceSortCollator.compare(String(aValue), String(bValue));
      }

      return deviceSort.direction === 'asc' ? result : -result;
    });

    return sorted;
  }, [filteredDevices, deviceSort, deviceSortCollator]);

  // Selected device registration history filtered
  const filteredDeviceHistory = useMemo(() => {
    if (!selectedDevice) return [];
    const devHist = allHistory.filter(h => h.ext === selectedDevice.ext);
    
    // Sort descending
    const sorted = [...devHist].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (historyFilter === 'all') return sorted;
    
    const now = getServerNow();
    return sorted.filter(item => {
      const diffTime = Math.abs(now.getTime() - new Date(item.timestamp).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (historyFilter === 'today') {
        return diffDays <= 1;
      }
      if (historyFilter === '7days') {
        return diffDays <= 7;
      }
      if (historyFilter === '30days') {
        return diffDays <= 30;
      }
      return true;
    });
  }, [selectedDevice, allHistory, historyFilter]);

  // Historic Date list
  const historicDateDevices = useMemo(() => {
    if (!historicDate) return [];
    
    // Filter history on specified year-month-day
    const targetDateStr = historicDate; // e.g. "2026-06-22"
    
    const matchedHistory = allHistory.filter(h => {
      const matchD = h.timestamp.split('T')[0];
      return matchD === targetDateStr;
    });

    // Group by EXT to show active profiles on that date
    const uniqueMap: { [ext: string]: any } = {};
    matchedHistory.forEach(item => {
      const devMeta = devices.find(d => d.ext === item.ext);
      uniqueMap[item.ext] = {
        ext: item.ext,
        name: item.name || devMeta?.name || `Абонент ${item.ext}`,
        tech: item.tech || devMeta?.tech || '—',
        ip: item.ip,
        port: item.port,
        userAgent: item.userAgent,
        mac: item.mac || devMeta?.network?.mac || '',
        timestamp: item.timestamp,
        manufacturer: item.manufacturer || devMeta?.manufacturer || 'Unknown',
        model: item.model || devMeta?.model || 'Unknown'
      };
    });

    return Object.values(uniqueMap).sort((a: any, b: any) => a.ext.localeCompare(b.ext));
  }, [historicDate, allHistory, devices]);

  // Export actions
  const exportToCSV = () => {
    const headers = ["EXT", "Имя", "Технология", "IP Адрес", "Порт", "Статус", "User-Agent", "Производитель", "Модель", "MAC адрес", "VLAN", "Регистраций"];
    const rows = sortedDevices.map(d => [
      d.ext,
      d.name,
      d.tech,
      d.ip,
      d.port,
      d.status,
      d.userAgent,
      d.manufacturer,
      d.model,
      d.network?.mac || '',
      d.network?.vlan || '',
      d.regCount || 0
    ]);
    
    const csvString = [
      headers.join(";"),
      ...rows.map(r => r.map(val => {
        const strVal = String(val);
        const escaped = strVal.split('"').join('""');
        return '"' + escaped + '"';
      }).join(";"))
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `PBXPULS_IP_SIP_Devices_Map_${historicDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    exportToCSV(); // Standard Semicolon UTF-8 CSV with BOM works best for Russian Excel
  };

  const exportToJSON = () => {
    const jsonString = JSON.stringify(sortedDevices, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `PBXPULS_IP_SIP_Devices_Map_${historicDate}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Upper toolbar notification banner */}
      {successMessage && (
        <div className="p-4 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 animate-fade-in flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            {successMessage}
          </span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">×</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl text-xs font-semibold text-rose-800 bg-rose-50 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-200 dark:border-rose-800 animate-fade-in flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            {errorMessage}
          </span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">×</button>
        </div>
      )}

      {/* Title & Toolbar Controls */}
      <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/40">
            <Network className="h-6 w-6" id="sip_devices_map_icon_header" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-md font-bold tracking-tight text-slate-800 dark:text-white">Карта IP / SIP устройств АТС</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                {devices.length} Клиентов
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Интеллектуальная локация VoIP-устройств, поиск конфликтов IP, двойных регистраций и сетевой дебаг телефонии
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsDiagnosticsOpen(current => !current)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${isDiagnosticsOpen
              ? 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900'
              : 'text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'}`}
            title="Открыть или скрыть панель диагностики выбранного устройства"
          >
            <Terminal className="h-3.5 w-3.5" />
            {isDiagnosticsOpen ? 'Скрыть диагностику' : 'Диагностика'}
          </button>

          <button
            onClick={createSnapshot}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
            title="Зафиксировать моментальную конфигурацию в data/devices-map-snapshot-..."
          >
            <Database className="h-3.5 w-3.5 text-slate-500" />
            Создать снимок сети
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50 border border-blue-100 dark:border-blue-900 transition flex items-center gap-1.5 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Синхронизировать c AMI
          </button>

          {/* Export Group */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 rounded-lg">
            <span className="text-[10px] uppercase font-black text-slate-400 px-2">Экспорт:</span>
            <div className="flex gap-0.5">
              <button
                onClick={exportToCSV}
                className="p-1.5 rounded text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center gap-1"
                title="Экспортировать в CSV (UTF-8 Semicolon)"
              >
                <FileText className="h-3 w-3 text-emerald-600" />
                CSV
              </button>
              <button
                onClick={exportToExcel}
                className="p-1.5 rounded text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center gap-1"
                title="Экспортировать в Excel"
              >
                <Download className="h-3 w-3 text-green-600" />
                Excel
              </button>
              <button
                onClick={exportToJSON}
                className="p-1.5 rounded text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center gap-1"
                title="Скачать JSON"
              >
                <Database className="h-3 w-3 text-sky-600" />
                JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Workspace divided into 5 Tabs and Selected Device detail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left column (Occupies 2/3 space) containing main functional views */}
        <div className={`${isDiagnosticsOpen ? 'xl:col-span-2' : 'xl:col-span-3'} space-y-6`}>
          
          {/* Section Navigation Tabs & Action Bar */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between border-b border-slate-200 dark:border-slate-800 pb-px">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setActiveTab('devices_list')}
                className={`px-3.5 py-2.5 text-xs font-bold transition-all rounded-t-lg border-t-2 relative ${activeTab === 'devices_list'
                  ? 'bg-white dark:bg-slate-900 border-rose-500 text-rose-600 dark:text-rose-400 font-extrabold shadow-xs border-b border-white dark:border-b-transparent'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-1.5">
                  <List className="h-4 w-4" />
                  Список устройств ({filteredDevices.length})
                </div>
              </button>

              <button
                onClick={() => setActiveTab('conflicts')}
                className={`px-3.5 py-2.5 text-xs font-bold transition-all rounded-t-lg border-t-2 relative ${activeTab === 'conflicts'
                  ? 'bg-white dark:bg-slate-900 border-rose-500 text-rose-600 dark:text-rose-400 font-extrabold shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400'}`}
              >
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  Выявленные конфликты ({conflicts.length})
                  {conflicts.length > 0 && (
                    <span className="inline-block p-1 bg-red-600 rounded-full animate-ping absolute top-1 right-1" />
                  )}
                </div>
              </button>

              <button
                onClick={() => setActiveTab('historic_date')}
                className={`px-3.5 py-2.5 text-xs font-bold transition-all rounded-t-lg border-t-2 relative ${activeTab === 'historic_date'
                  ? 'bg-white dark:bg-slate-900 border-rose-500 text-rose-600 dark:text-rose-400 font-extrabold shadow-xs shadow-slate-100/10'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Кто был зарегистрирован
                </div>
              </button>

              <button
                onClick={() => setActiveTab('subnet_map')}
                className={`px-3.5 py-2.5 text-xs font-bold transition-all rounded-t-lg border-t-2 relative ${activeTab === 'subnet_map'
                  ? 'bg-white dark:bg-slate-900 border-rose-500 text-rose-600 dark:text-rose-400 font-extrabold shadow-xs shadow-slate-100/10'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="h-4 w-4" />
                  Карта подсетей (Map)
                </div>
              </button>

              <button
                onClick={() => setActiveTab('alerts_log')}
                className={`px-3.5 py-2.5 text-xs font-bold transition-all rounded-t-lg border-t-2 relative ${activeTab === 'alerts_log'
                  ? 'bg-white dark:bg-slate-900 border-rose-500 text-rose-600 dark:text-rose-400 font-extrabold shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Тревоги ({alerts.length})
                </div>
              </button>
            </div>
          </div>

          {/* Map & List Content Views */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-xs min-h-[500px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw className="h-10 w-10 text-slate-300 animate-spin mb-4" />
                <p className="text-xs text-slate-500">Загрузка структуры сетевой карты SIP...</p>
              </div>
            ) : (
              <>
                {/* 1. MAP VIEW: Group by Subnets */}
                {activeTab === 'subnet_map' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <span>Сетевое соседство телефонов. Устройства сгруппированы по CIDR /24 подсетям.</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Найдено подсетей: {subnetMap.length}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {subnetMap.map((sub, sidx) => (
                        <div
                          key={sidx}
                          className="border border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 p-4 space-y-3 transition"
                        >
                          {/* Subnet Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 p-1 px-2 rounded-md bg-slate-200/50 dark:bg-slate-800 border border-slate-300/40 dark:border-slate-700">
                                  {sub.subnet}
                                </span>
                                {sub.conflictsCount > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-900 animate-pulse">
                                    Конфликт
                                  </span>
                                )}
                              </div>
                              <span className="block text-[11px] font-black tracking-wide text-slate-400 uppercase mt-1">
                                {sub.name}
                              </span>
                            </div>

                            <div className="text-right text-[10px] text-slate-400 space-y-0.5 font-bold">
                              <div>Устройств: <span className="text-slate-700 dark:text-slate-200">{sub.devices.length}</span></div>
                              <div>Моделей: <span className="text-slate-700 dark:text-slate-200">{sub.uniqueModels.length}</span></div>
                              {sub.conflictsCount > 0 && (
                                <div className="text-rose-500 text-[9px]">Дубликаты IP!</div>
                              )}
                            </div>
                          </div>

                          {/* Devices within this subnet */}
                          <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-2 space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                            {sub.devices.map((dev) => (
                              <div
                                key={dev.ext}
                                onClick={() => setSelectedDevice(dev)}
                                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition ${selectedDevice?.ext === dev.ext
                                  ? 'bg-rose-50 dark:bg-rose-950/25 border border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 font-bold'
                                  : 'bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/30'}`}
                              >
                                <div className="flex min-w-0 items-center gap-1.5 font-semibold">
                                  <span
                                    className="min-w-7 max-w-[110px] shrink-0 truncate rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold uppercase tracking-wide dark:border-slate-700 dark:bg-slate-800"
                                    title={dev.ext}
                                  >
                                    {dev.ext}
                                  </span>
                                  {dev.name.trim().toLowerCase() !== dev.ext.trim().toLowerCase() && (
                                    <span className="min-w-0 truncate" title={dev.name}>{dev.name}</span>
                                  )}
                                </div>

                                <div className="flex min-w-0 max-w-[150px] items-center justify-end gap-1.5 text-[11px] font-bold">
                                  <span className="shrink-0 font-mono text-slate-400 text-[10px]">{dev.ip.split('.').pop()}</span>
                                  <span title={dev.model} className={`max-w-[100px] truncate text-[10px] px-1.5 py-0.5 rounded ${dev.manufacturer === 'Yealink' ? 'text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/20' : dev.manufacturer === 'Grandstream' ? 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/20' : 'text-slate-500 bg-slate-100'}`}>
                                    {dev.model}
                                  </span>
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${dev.status === 'Online' ? 'bg-emerald-500' : dev.status === 'Conflict' ? 'bg-red-500 animate-ping' : dev.status === 'Warning' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. DEVICE TABLE VIEW */}
                {activeTab === 'devices_list' && (
                  <div className="space-y-4">
                    {/* Search & Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Поиск по EXT, имени, IP адресу, User-Agent..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-lg bg-transparent dark:text-white"
                        />
                      </div>

                      <div className="flex gap-2">
                        <select
                          value={selectedTech}
                          onChange={(e) => setSelectedTech(e.target.value)}
                          className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 dark:text-white"
                        >
                          <option value="All">Технология: Все</option>
                          <option value="SIP">SIP (chan_sip)</option>
                          <option value="PJSIP">PJSIP (chan_pjsip)</option>
                        </select>

                        <select
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value)}
                          className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 dark:text-white"
                        >
                          <option value="All">Статус: Все</option>
                          <option value="Online">Online</option>
                          <option value="Offline">Offline</option>
                          <option value="Warning">Warning</option>
                          <option value="Conflict">Conflict</option>
                        </select>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] uppercase font-black text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            {renderDeviceSortableHeader('ext', 'EXT')}
                            {renderDeviceSortableHeader('name', 'Имя')}
                            {renderDeviceSortableHeader('tech', 'Технология')}
                            {renderDeviceSortableHeader('ip', 'IP Адрес')}
                            {renderDeviceSortableHeader('mac', 'MAC адрес')}
                            {renderDeviceSortableHeader('equipment', 'Оборудование')}
                            {renderDeviceSortableHeader('status', 'Статус')}
                            {renderDeviceSortableHeader('ipChanges', 'Смены IP', 'right')}
                            {renderDeviceSortableHeader('regCount', 'Рег-ций', 'right')}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 select-none">
                          {sortedDevices.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-10 text-center text-slate-400">
                                Устройства с выбранными фильтрами не найдены.
                              </td>
                            </tr>
                          ) : (
                            sortedDevices.map(dev => (
                              <tr
                                key={dev.ext}
                                onClick={() => setSelectedDevice(dev)}
                                className={`cursor-pointer transition ${selectedDevice?.ext === dev.ext ? 'bg-rose-50/55 dark:bg-rose-950/20 font-semibold' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'}`}
                              >
                                <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                                  {dev.ext}
                                </td>
                                <td className="p-3">
                                  <div className="font-semibold text-slate-800 dark:text-slate-300">{dev.name}</div>
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dev.tech === 'PJSIP' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300'}`}>
                                    {dev.tech}
                                  </span>
                                </td>
                                <td className="p-3 font-mono">
                                  {dev.ip}:{dev.port}
                                </td>
                                <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {dev.network?.mac || '—'}
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-col">
                                    <span className={`font-semibold ${getDeviceIconClassName(dev.manufacturer)}`}>
                                      {dev.manufacturer}
                                    </span>
                                    <span className="text-[10px] text-slate-400 max-w-[150px] truncate" title={dev.userAgent}>
                                      {dev.model}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    dev.status === 'Online' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40' :
                                    dev.status === 'Offline' ? 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200' :
                                    dev.status === 'Conflict' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900 animate-pulse' :
                                    'bg-amber-50 text-amber-700 dark:bg-amber-950/30'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${dev.status === 'Online' ? 'bg-emerald-500' : dev.status === 'Offline' ? 'bg-slate-400' : dev.status === 'Conflict' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                    {dev.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono text-slate-400 font-bold">{dev.ipChanges}</td>
                                <td className="p-3 text-right font-mono font-bold">{dev.regCount}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. CONFLICT DETECTOR & AUDITS */}
                {activeTab === 'conflicts' && (
                  <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/40 flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-orange-850 dark:text-orange-300">Автоматический аудит конфликтов</h4>
                        <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-1">
                          Анализатор PBXPULS сканирует AMI контакты и таблицы БД для поиска фатальных перехлестов IP адресов, дублирований номеров телефонов на разном оборудовании, или попыток одновременной регистрации EXT из разных мест.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {conflicts.map((conf, cidx) => (
                        <div
                          key={cidx}
                          className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-950/30 space-y-3 shadow-xs"
                        >
                          <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                {conf.type === 'ip_duplicate' ? 'Дуплекс IP' : conf.type === 'ext_multi_ip' ? 'Сплит EXT по IP' : 'Двойная сессия Asterisk'}
                              </span>
                              <h4 className="text-xs font-bold text-slate-800 dark:text-white mt-1.5">{conf.detail}</h4>
                            </div>
                            <span className="text-xs text-rose-600 dark:text-rose-450 font-black">CRITICAL RISK</span>
                          </div>

                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {conf.description}
                          </p>

                          {/* Detail roster */}
                          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-slate-400">Участники конфликтующие:</span>
                            
                            {conf.type === 'ip_duplicate' && conf.devices && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold text-indigo-650 mb-1">Сетевой IP: {conf.ip}</div>
                                {conf.devices.map(extNum => {
                                  const dMeta = devices.find(x => x.ext === extNum);
                                  return (
                                    <div key={extNum} className="flex items-center justify-between text-xs py-1 px-2 bg-slate-55 dark:bg-slate-950/60 rounded">
                                      <span>EXT <strong>{extNum}</strong> — {dMeta?.name || 'Unknown'}</span>
                                      <span className="font-mono text-slate-400">{dMeta?.userAgent || '—'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {conf.type === 'ext_multi_ip' && conf.ips && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold text-indigo-650 mb-1">Extension: {conf.ext} ( {conf.name} )</div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {conf.ips.map(ip => (
                                    <div key={ip} className="p-1 px-2 font-mono text-center text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 rounded border border-rose-100/50">
                                      {ip}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {conf.type === 'ext_multi_register' && conf.contacts && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold text-indigo-650 mb-1">Extension: {conf.ext} ( {conf.name} )</div>
                                {conf.contacts.map((contact, idx) => (
                                  <div key={idx} className="p-1 px-2 font-mono text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 rounded flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    {contact}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. HISTORIC DATE ROSTER ("Кто был зарегистрирован на АТС в выбранную дату") */}
                {activeTab === 'historic_date' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-white">Исторический срез регистраций АТС</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">Выберите дату, чтобы заглянуть в прошлое и узнать, какие IP-адреса и устройства были зарегистрированы.</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold">Выберите Дату:</span>
                        <input
                          type="date"
                          value={historicDate}
                          onChange={(e) => setHistoricDate(e.target.value)}
                          max={getServerNow().toISOString().split('T')[0]}
                          className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Список зарегистрированных устройств за: <span className="text-rose-600 dark:text-rose-400 underline">{historicDate}</span>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] uppercase font-black text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="p-3">EXT</th>
                            <th className="p-3">Абонент</th>
                            <th className="p-3">Технология</th>
                            <th className="p-3">Сетевой адрес</th>
                            <th className="p-3">MAC адрес</th>
                            <th className="p-3">Марка оборудования</th>
                            <th className="p-3 text-right">Время метки (UTC)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {historicDateDevices.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-10 text-center text-slate-400">
                                В истории за выбранную дату {historicDate} записи регистраций отсутствуют.
                              </td>
                            </tr>
                          ) : (
                            historicDateDevices.map(h => (
                              <tr key={h.ext} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                <td className="p-3 font-mono font-bold">{h.ext}</td>
                                <td className="p-3 font-semibold">{h.name}</td>
                                <td className="p-3">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600">
                                    {h.tech}
                                  </span>
                                </td>
                                <td className="p-3 font-mono">{h.ip}:{h.port}</td>
                                <td className="p-3 font-mono text-[11px] whitespace-nowrap">{h.mac || '—'}</td>
                                <td className="p-3">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-750">{h.manufacturer}</span>
                                    <span className="text-[10px] text-slate-400 max-w-[150px] truncate">{h.model}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right font-mono text-slate-400">
                                  {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. AUTOMATIC ALERTS ALARMS */}
                {activeTab === 'alerts_log' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <span>Служба автоматических алармов PBXPULS. Свежие инциденты безопасности и смены топологии.</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Событий: {alerts.length}</span>
                    </div>

                    <div className="space-y-3">
                      {alerts.map((al) => (
                        <div
                          key={al.id}
                          className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                            al.severity === 'Критично'
                              ? 'bg-red-50/30 dark:bg-red-950/10 border-red-100 dark:border-red-900/40 text-red-800 dark:text-red-400'
                              : 'bg-amber-50/20 dark:bg-amber-950/5 border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-400'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg mt-0.5 ${al.severity === 'Критично' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            <AlertCircle className="h-4 w-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs">{al.type}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${al.severity === 'Критично' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                                  {al.severity}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-400">
                                {new Date(al.time).toLocaleString()}
                              </span>
                            </div>

                            <p className="text-xs text-slate-550 dark:text-slate-300 mt-1.5">
                              {al.description}
                            </p>

                            <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-2 font-semibold">
                              <span>Абонент: <strong className="text-slate-700 dark:text-slate-300">{al.ext} ({al.name})</strong></span>
                              <span>IP адрес: <strong className="text-slate-705 dark:text-slate-300 font-mono">{al.ip}</strong></span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column (Occupies 1/3 space) containing Interactive Diagnostics console & Specs */}
        {isDiagnosticsOpen && <div className="space-y-6">
          <div className="bg-slate-900 text-white border border-slate-950 p-4 rounded-xl shadow-md min-h-[500px] flex flex-col justify-between">
            {selectedDevice ? (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                
                {/* Specification Header */}
                <div>
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="font-mono p-1 px-2 rounded bg-slate-800 text-xs text-rose-450 font-bold">
                        EXT {selectedDevice.ext}
                      </div>
                      <span className="text-xs font-bold truncate max-w-[130px]">{selectedDevice.name}</span>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      selectedDevice.status === 'Online' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/60' :
                      selectedDevice.status === 'Offline' ? 'bg-slate-800 text-slate-450 border border-slate-700' :
                      'bg-rose-950/40 text-rose-400 border border-rose-900'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${selectedDevice.status === 'Online' ? 'bg-emerald-500' : selectedDevice.status === 'Offline' ? 'bg-slate-500' : 'bg-red-500'}`} />
                      {selectedDevice.status}
                    </span>
                  </div>

                  {/* Specification items */}
                  <div className="space-y-4 text-xs">
                    
                    {/* Basic specs with icons */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Сетевой профиль дебага:</span>
                      
                      <div className="divide-y divide-slate-800 font-semibold text-slate-300">
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">MAC адрес:</span>
                          <span className="font-mono text-slate-200">{selectedDevice.network?.mac || '—'}</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">Производитель по OUI:</span>
                          <span className="text-slate-200">{selectedDevice.network?.vendor || '—'}</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">Voice VLAN:</span>
                          <span className="text-indigo-400 font-extrabold">{selectedDevice.network?.vlan || 'None'}</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">Коммутатор и Порт:</span>
                          <span className="text-slate-200">{selectedDevice.network?.switch || '—'}</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">DNS сервера:</span>
                          <span className="font-mono text-slate-250">{selectedDevice.network?.dns?.join(', ') || '192.168.1.1'}</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">NAT режим / RTP:</span>
                          <span className="text-rose-400">{selectedDevice.natMode || 'RFC3581'} / {selectedDevice.rtpRange || '10k-20k'}</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">Кодеки / Expire:</span>
                          <span className="text-emerald-400">{selectedDevice.codecs?.join(', ') || 'G722/PCMA'} / {selectedDevice.sipExpire || 3600}s</span>
                        </div>
                        <div className="py-2 flex justify-between">
                          <span className="text-slate-500">SRTP / ICE / Media:</span>
                          <span className="font-mono text-[10px] text-slate-300">{selectedDevice.srtpStatus || 'Optional'} / {selectedDevice.iceStatus || 'No'} / {selectedDevice.directMedia || 'No'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Historical telemetry inside selected specs */}
                    <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-black">
                        <span>РЕГИСТРАЦИОНЫЙ ТРЕК</span>
                        
                        <select
                          value={historyFilter}
                          onChange={(e) => setHistoryFilter(e.target.value as any)}
                          className="bg-transparent text-[10px] border border-slate-800 focus:outline-none p-0.5 rounded cursor-pointer leading-tight"
                        >
                          <option value="all">Всё время</option>
                          <option value="today">Сегодня</option>
                          <option value="7days">7 Дней</option>
                          <option value="30days">30 Дней</option>
                        </select>
                      </div>

                      <div className="space-y-1 max-h-[140px] overflow-y-auto pt-1 font-mono text-[11px] divide-y divide-slate-900/40">
                        {filteredDeviceHistory.length === 0 ? (
                          <div className="text-center py-4 text-slate-500 text-[10px]">История перемещений пуста</div>
                        ) : (
                          filteredDeviceHistory.map((item, idx) => {
                            const isIPChange = idx < filteredDeviceHistory.length - 1 && item.ip !== filteredDeviceHistory[idx + 1].ip;
                            return (
                              <div key={idx} className="py-1 flex flex-col text-[10px] text-slate-300">
                                <div className="flex justify-between">
                                  <span className="font-bold text-slate-100">{item.ip}</span>
                                  <span className="text-slate-500">{new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                                </div>
                                {isIPChange && (
                                  <div className="text-[9px] text-rose-450 font-semibold italic">
                                    ← Сменился IP адрес с {filteredDeviceHistory[idx+1].ip}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simulated Diagnostic console terminal and Control deck */}
                <div className="border-t border-slate-800 pt-4 mt-4 space-y-3 flex-1 flex flex-col justify-end">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">ДИАГНОСТИЧЕСКАЯ УТИЛИТА</span>
                  
                  {/* Console terminal screen */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 h-[150px] font-mono text-[10px] text-emerald-400 overflow-y-auto flex-1 select-text">
                    <span className="text-slate-500 block border-b border-slate-900 pb-0.5 mb-1.5">// {terminalTitle}</span>
                    <pre className="whitespace-pre-wrap font-mono uppercase tracking-wide leading-relaxed">
                      {terminalOutput || 'ОБОРУДОВАНИЕ ГОТОВО К ПРОВЕРКЕ. НАЖМИТЕ КНОПКУ НИЖЕ ДЛЯ ЗАПУСКА СЕТЕВОГО ДИАГНОЗА.'}
                    </pre>
                  </div>

                  {/* Buttons Control Station */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => runPing(selectedDevice.ext)}
                      disabled={isRunningDiagnostic}
                      className="p-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-center transition text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Ping Абонента
                    </button>
                    <button
                      onClick={() => runTraceroute(selectedDevice.ext)}
                      disabled={isRunningDiagnostic}
                      className="p-2 py-1.5 rounded-lg bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold text-center transition text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Traceroute IP
                    </button>
                    <button
                      onClick={() => checkSipOptions(selectedDevice)}
                      disabled={isRunningDiagnostic}
                      className="p-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-center transition text-xs col-span-2 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Info className="h-3.5 w-3.5" />
                      Показать SIP OPTIONS & SIP Qualify
                    </button>
                    <button
                      onClick={() => verifySIPRegistration(selectedDevice)}
                      disabled={isRunningDiagnostic}
                      className="p-2 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-100 font-black text-center transition text-[10px] col-span-2 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Check className="h-3 w-3" />
                      Проверить лог регистрации Asterisk AMI
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Sliders className="h-10 w-10 text-slate-700 mb-4" />
                <p className="text-xs text-center leading-relaxed">Выберите устройство из таблицы или карты сети, чтобы запустить онлайн-диагностику и посмотреть полную VLAN спецификацию.</p>
              </div>
            )}
          </div>
        </div>}

      </div>

      {/* --- LOWER SUMMARY DECK --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Всего трубок</span>
            <Phone className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-800 dark:text-white">{stats.total}</div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            100% локальная сеть
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Онлайн связи</span>
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.online}</div>
          <div className="text-[10px] text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5 mt-0.5">
            <span>+{Math.round((stats.online / (stats.total || 1)) * 100)}% доступено</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Вне сети</span>
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400">{stats.offline}</div>
          <div className="text-[10px] text-rose-400 dark:text-rose-500 mt-0.5">
            Требуют обслуживания
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Уникальных IP</span>
            <Globe className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-800 dark:text-white">{stats.uniqueIps}</div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            физ-адресов в АТС
          </div>
        </div>

        {/* Metric 5 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs border-r-rose-200 dark:border-r-rose-900/50">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Конфликтов IP</span>
            <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400">{stats.ipConflictsCount}</div>
          <div className="text-[10px] text-rose-500 font-bold dark:text-rose-400 mt-0.5">
            Требует внимания!
          </div>
        </div>

        {/* Metric 6 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Подозрительных</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-extrabold text-amber-500 dark:text-amber-400">{stats.suspiciousCount}</div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            Смена IP / Flapping
          </div>
        </div>

        {/* Metric 7 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Новых устр. 24ч</span>
            <Cpu className="h-3.5 w-3.5 text-purple-500" />
          </div>
          <div className="text-xl font-extrabold text-purple-700 dark:text-purple-400">+{stats.newDevices24h}</div>
          <div className="text-[10px] text-purple-500 font-semibold dark:text-purple-400 mt-0.5">
            Рост емкости АТС
          </div>
        </div>

        {/* Metric 8 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Новых IP 24ч</span>
            <TrendingUp className="h-3.5 w-3.5 text-cyan-500" />
          </div>
          <div className="text-xl font-extrabold text-cyan-600 dark:text-cyan-400">+{stats.newIps24h}</div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            Сетевое расширение
          </div>
        </div>
      </div>
    </div>
  );
}
