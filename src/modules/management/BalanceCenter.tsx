import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, AlertTriangle, Activity, Calendar, 
  ArrowUpRight, Download, Upload, Play, CheckCircle, Search, Settings, 
  RefreshCw, Check, ArrowRight, ShieldAlert, ListOrdered, Building2, 
  PhoneCall, Mail, Bell, FileSpreadsheet, Sparkles, Filter, ChevronRight, X, Plus,
  Globe, FileText, Info, Percent, ExternalLink, Link2, CheckSquare, Layers
} from 'lucide-react';

// Recharts components (standard in project style)
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, BarChart, Bar, Cell 
} from 'recharts';
import { getServerNow } from '../../utils/serverClock';

interface BalanceCenterProps {
  session: any;
  hasPermission: (perm: string) => boolean;
}

// Initial Mock Operators Data
const INITIAL_OPERATORS = [
  {
    id: 'mango',
    name: 'Mango Office',
    trunkName: 'TRUNK_MANGO_SIMF',
    balance: 15420.50,
    prevBalance: 16100.50,
    dailyChange: -680.00,
    avgSpend: 620.00,
    apiConnected: true,
    lastUpdate: '2026-06-23 11:32',
    providerType: 'API'
  },
  {
    id: 'zadarma',
    name: 'Zadarma (ZPN)',
    trunkName: 'TRUNK_ZADARMA_HQ',
    balance: 2450.00,
    prevBalance: 2900.00,
    dailyChange: -450.00,
    avgSpend: 410.00,
    apiConnected: true,
    lastUpdate: '2026-06-23 11:29',
    providerType: 'API'
  },
  {
    id: 'mtt',
    name: 'Межрегиональный ТранзитТелеком (МТТ)',
    trunkName: 'TRUNK_MTT_OUT',
    balance: 780.00,
    prevBalance: 3100.00,
    dailyChange: -2320.00,
    avgSpend: 540.00,
    apiConnected: false,
    lastUpdate: '2026-06-22 18:15',
    providerType: 'XLSX Импорт'
  },
  {
    id: 'beeline',
    name: 'Билайн Бизнес CRM',
    trunkName: 'TRUNK_BEELINE_PRI',
    balance: 43200.00,
    prevBalance: 44400.00,
    dailyChange: -1200.00,
    avgSpend: 1150.00,
    apiConnected: true,
    lastUpdate: '2026-06-23 10:45',
    providerType: 'API'
  }
];

// Mock CDR Discrepancy Reconciliation Data
const INITIAL_RECONCILIATION = [
  { id: 1, operatorName: 'Mango Office', cdrCharged: 680.00, operatorCharged: 680.00, diff: 0, status: 'match' },
  { id: 2, operatorName: 'Zadarma (ZPN)', cdrCharged: 450.00, operatorCharged: 450.00, diff: 0, status: 'match' },
  { id: 3, operatorName: 'МТТ', cdrCharged: 2150.00, operatorCharged: 2320.00, diff: 170.00, status: 'discrepancy', reason: 'Списание за абонплату за виртуальный номер, не отраженное в CDR' },
  { id: 4, operatorName: 'Билайн Бизнес CRM', cdrCharged: 1200.00, operatorCharged: 1200.00, diff: 0, status: 'match' },
];

// Initial Mock Anomalies
const INITIAL_ANOMALIES = [
  {
    id: 'anom1',
    time: '2026-06-23 09:14',
    riskLevel: 'critical', // 'critical' | 'high' | 'warning'
    cause: 'Резкое списание',
    description: 'Баланс МТТ снизился на 2,320 ₽ за 3 часа при обычном расходе ≤ 540 ₽/день.',
    recommendation: 'Проверить лог вызовов на предмет несанкционированных параллельных линий.',
    dismissed: false
  },
  {
    id: 'anom2',
    time: '2026-06-23 08:32',
    riskLevel: 'high',
    cause: 'Международное направление',
    description: 'Внутренний абонент EXT 200 совершил 3 звонка в Великобританию (+44) общей стоимостью 2,450 ₽.',
    recommendation: 'Временно ограничить исходящую связь на внешние направления для EXT 200.',
    dismissed: false
  },
  {
    id: 'anom3',
    time: '2026-06-22 23:45',
    riskLevel: 'warning',
    cause: 'Звонки во внерабочее время',
    description: 'Зафиксировано 14 автоматических попыток дозвона с EXT 178 в период с 23:00 до 03:00.',
    recommendation: 'Проверить настройки ночной маршрутизации или активность скриптов автодозвона.',
    dismissed: false
  }
];

// Mock Trunk Analytics
const TRUNK_STATS = [
  { name: 'TRUNK_BEELINE_PRI', calls: 342, mins: 1240, spend: 1200, costPerMin: 0.97 },
  { name: 'TRUNK_MANGO_SIMF', calls: 189, mins: 680, spend: 680, costPerMin: 1.00 },
  { name: 'TRUNK_ZADARMA_HQ', calls: 92, mins: 320, spend: 450, costPerMin: 1.41 },
  { name: 'TRUNK_MTT_OUT', calls: 145, mins: 512, spend: 2320, costPerMin: 4.53 }
];

// Mock Extensions rating
const INITIAL_EXT_RATINGS = [
  { ext: '200', name: 'Иван Козлов (ОП Симф)', spend: 12450, mins: 420, calls: 98, avatar: 'IK' },
  { ext: '205', name: 'Ольга Смирнова (УК Колл-центр)', spend: 8930, mins: 1210, calls: 350, avatar: 'OS' },
  { ext: '178', name: 'Автообзвон Главный', spend: 7120, mins: 1890, calls: 642, avatar: 'AG' },
  { ext: '102', name: 'Директор (Юрий Г.)', spend: 3200, mins: 94, calls: 18, avatar: 'YG' },
  { ext: '211', name: 'Техподдержка (Ночной)', spend: 1840, mins: 310, calls: 75, avatar: 'TN' },
];

// Detailed Drill down calls for extensions
const DRILL_DOWN_CALLS: Record<string, Array<{ id: string, date: string, number: string, destination: string, duration: string, cost: number, costPerMin: number, trunk: string }>> = {
  '200': [
    { id: 'c1', date: '2026-06-23 09:12:15', number: '+44 20 7946 0192', destination: 'Великобритания (Лондон)', duration: '08:45', cost: 1250, costPerMin: 142.8, trunk: 'TRUNK_MTT_OUT' },
    { id: 'c2', date: '2026-06-23 08:30:42', number: '+44 20 7946 0194', destination: 'Великобритания (Лондон)', duration: '06:12', cost: 890, costPerMin: 143.5, trunk: 'TRUNK_MTT_OUT' },
    { id: 'c3', date: '2026-06-23 11:05:00', number: '+7 978 123-45-67', destination: 'Моб. Крым Beeline', duration: '14:20', cost: 14.2, costPerMin: 1.0, trunk: 'TRUNK_BEELINE_PRI' },
    { id: 'c4', date: '2026-06-22 15:44:11', number: '+7 495 987-65-43', destination: 'Москва Сити', duration: '22:15', cost: 44.5, costPerMin: 2.0, trunk: 'TRUNK_MANGO_SIMF' },
  ],
  '205': [
    { id: 'c5', date: '2026-06-23 11:22:12', number: '+7 900 123-45-78', destination: 'Моб. РФ Телекомы', duration: '12:40', cost: 124.0, costPerMin: 10.0, trunk: 'TRUNK_ZADARMA_HQ' },
    { id: 'c6', date: '2026-06-23 10:14:55', number: '+7 910 987-65-43', destination: 'Моб. МТС РФ', duration: '08:15', cost: 81.5, costPerMin: 10.0, trunk: 'TRUNK_ZADARMA_HQ' },
    { id: 'c7', date: '2026-06-23 09:33:04', number: '+7 499 555-12-34', destination: 'Москва Стационарный', duration: '04:50', cost: 4.8, costPerMin: 1.0, trunk: 'TRUNK_BEELINE_PRI' },
  ],
  '178': [
    { id: 'c8', date: '2026-06-23 03:15:22', number: '+7 900 888-88-88', destination: 'Моб. Ростелеком', duration: '01:00', cost: 1.5, costPerMin: 1.5, trunk: 'TRUNK_BEELINE_PRI' },
    { id: 'c9', date: '2026-06-23 03:16:30', number: '+7 900 888-88-89', destination: 'Моб. Ростелеком', duration: '01:00', cost: 1.5, costPerMin: 1.5, trunk: 'TRUNK_BEELINE_PRI' },
    { id: 'c10', date: '2026-06-23 03:17:40', number: '+7 900 888-88-90', destination: 'Моб. Ростелеком', duration: '01:00', cost: 1.5, costPerMin: 1.5, trunk: 'TRUNK_BEELINE_PRI' },
  ]
};

// Mock Expensive Calls Logger
const EXPENSIVE_CALLS_LOG = [
  { id: 'e1', date: '2026-06-23 09:12:15', ext: '200', name: 'Иван Козлов', number: '+44 20 7946 0192', destination: 'Великобритания (Лондон)', duration: '08:45', cost: 1250.00, rate: 142.8, trunk: 'TRUNK_MTT_OUT' },
  { id: 'e2', date: '2026-06-23 08:30:42', ext: '200', name: 'Иван Козлов', number: '+44 20 7946 0194', destination: 'Великобритания (Лондон)', duration: '06:12', cost: 890.00, rate: 143.5, trunk: 'TRUNK_MTT_OUT' },
  { id: 'e3', date: '2026-06-22 14:15:33', ext: '102', name: 'Директор (Юрий)', number: '+33 1 4005 8000', destination: 'Франция', duration: '12:30', cost: 2400.00, rate: 192.0, trunk: 'TRUNK_MTT_OUT' },
  { id: 'e4', date: '2026-06-22 11:24:08', ext: '205', name: 'Ольга Смирнова', number: '+7 925 120-14-15', destination: 'Моб. РФ Мегафон', duration: '41:10', cost: 411.00, rate: 10.0, trunk: 'TRUNK_ZADARMA_HQ' },
  { id: 'e5', date: '2026-06-21 16:45:00', ext: '178', name: 'Автообзвон Главный', number: '+7 343 222-11-00', destination: 'Екатеринбург Стац.', duration: '120:00', cost: 240.00, rate: 2.0, trunk: 'TRUNK_MANGO_SIMF' },
  { id: 'e6', date: '2026-06-20 09:11:15', ext: '205', name: 'Ольга Смирнова', number: '+7 903 444-55-66', destination: 'Моб. РФ Билайн', duration: '35:20', cost: 353.00, rate: 10.0, trunk: 'TRUNK_ZADARMA_HQ' }
];

// Mock historical graph data
const HISTORIC_DATA = {
  Today: [
    { time: '00:00', balance: 64150, spend: 10, topup: 0 },
    { time: '04:00', balance: 64130, spend: 20, topup: 0 },
    { time: '08:00', balance: 63500, spend: 630, topup: 0 },
    { time: '12:00', balance: 61850.50, spend: 1649.50, topup: 0 },
    { time: '16:00', balance: 61850.50, spend: 0, topup: 0 },
    { time: '20:00', balance: 61850.50, spend: 0, topup: 0 }
  ],
  Week: [
    { time: 'Пн', balance: 74200, spend: 4100, topup: 10000 },
    { time: 'Вт', balance: 70300, spend: 3900, topup: 0 },
    { time: 'Ср', balance: 67100, spend: 3200, topup: 0 },
    { time: 'Чт', balance: 63000, spend: 4100, topup: 0 },
    { time: 'Пт', balance: 58900, spend: 4100, topup: 0 },
    { time: 'Сб', balance: 57900, spend: 1000, topup: 0 },
    { time: 'Вс', balance: 61850.50, spend: 1050, topup: 5000 }
  ],
  Month: [
    { time: 'Нед 1', balance: 45000, spend: 12000, topup: 30000 },
    { time: 'Нед 2', balance: 58000, spend: 17000, topup: 30000 },
    { time: 'Нед 3', balance: 69000, spend: 19000, topup: 30000 },
    { time: 'Нед 4', balance: 61850.50, spend: 27150, topup: 20000 }
  ],
  Quarter: [
    { time: 'Март', balance: 35000, spend: 52000, topup: 60000 },
    { time: 'Апрель', balance: 51000, spend: 74000, topup: 90000 },
    { time: 'Май', balance: 49400, spend: 81600, topup: 80000 },
    { time: 'Июнь', balance: 61850.50, spend: 47550, topup: 60000 }
  ]
};

export default function BalanceCenter({ session, hasPermission }: BalanceCenterProps) {
  // Tabs
  type TabType = 'overview' | 'operators' | 'history' | 'spend' | 'extensions' | 'anomalies' | 'expensive' | 'reconciliation' | 'tariffs' | 'settings';
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Tariff Analyzer states
  const [tariffs, setTariffs] = useState([
    {
      id: 'mango',
      name: 'Mango Office',
      updatedAt: '23.06.2026',
      sourceType: 'site',
      sourceName: 'mangotelecom.ru/tariffs-business',
      rates: {
        mobile: 1.40,
        fixedLocal: 0.60,
        crimea: 1.50,
        regions: 1.80,
        longDistance: 2.20,
        international: 35.00
      }
    },
    {
      id: 'zadarma',
      name: 'Zadarma',
      updatedAt: '20.06.2026',
      sourceType: 'site',
      sourceName: 'zadarma.com/tariffs/ru',
      rates: {
        mobile: 1.15,
        fixedLocal: 0.40,
        crimea: 3.10,
        regions: 1.30,
        longDistance: 1.90,
        international: 28.00
      }
    },
    {
      id: 'mtt',
      name: 'МТТ (Телеком)',
      updatedAt: '15.05.2026',
      sourceType: 'pdf',
      sourceName: 'Договор_МТТ_2026_финал.pdf',
      rates: {
        mobile: 1.60,
        fixedLocal: 0.80,
        crimea: 4.50,
        regions: 1.90,
        longDistance: 2.45,
        international: 145.00
      }
    },
    {
      id: 'beeline',
      name: 'Билайн Бизнес CRM',
      updatedAt: '18.06.2026',
      sourceType: 'excel',
      sourceName: 'beeline_corp_tariffs_v4.xlsx',
      rates: {
        mobile: 1.20,
        fixedLocal: 0.50,
        crimea: 1.30,
        regions: 1.45,
        longDistance: 1.80,
        international: 45.00
      }
    }
  ]);

  const [urlToParse, setUrlToParse] = useState('');
  const [selectedOperatorForUrl, setSelectedOperatorForUrl] = useState('mango');
  const [isUrlParsing, setIsUrlParsing] = useState(false);
  const [uploadedTariffFile, setUploadedTariffFile] = useState<string | null>(null);
  const [rawTextTariff, setRawTextTariff] = useState('');
  const [selectedFileOperator, setSelectedFileOperator] = useState('mango');
  const [isConvertingFile, setIsConvertingFile] = useState(false);

  // States for Outbound Routes Connector
  const [outboundRoutes, setOutboundRoutes] = useState([
    { id: 'route-mob', name: '01_MOBILE_RUSSIA', pattern: '89XXXXXXXXX', primaryTrunk: 'Zadarma', secondaryTrunk: 'Beeline', status: 'optimal' },
    { id: 'route-local', name: '02_LOCAL_MOSCOW', pattern: '8495XXXXXXX, 8499XXXXXXX', primaryTrunk: 'Zadarma', secondaryTrunk: 'Beeline', status: 'optimal' },
    { id: 'route-crimea', name: '03_CRIMEA_DIAL', pattern: '8978XXXXXXX', primaryTrunk: 'MTT', secondaryTrunk: 'Mango', status: 'suboptimal' },
    { id: 'route-regions', name: '04_REGIONS_RUSSIA', pattern: '8[348]XXXXXXXX', primaryTrunk: 'MTT', secondaryTrunk: 'Beeline', status: 'warning' },
    { id: 'route-intl', name: '05_INTERNATIONAL', pattern: '810X.', primaryTrunk: 'MTT', secondaryTrunk: 'Zadarma', status: 'critical' }
  ]);

  const [isDialplanSyncing, setIsDialplanSyncing] = useState(false);

  // Permission Checks
  const canViewBalance = hasPermission('view_balance');
  const canViewAnalytics = hasPermission('view_balance_analytics');
  const canManageSources = hasPermission('manage_balance_sources');
  const canViewAlerts = hasPermission('view_balance_alerts');

  // Interactive core state
  const [operators, setOperators] = useState(INITIAL_OPERATORS);
  const [anomalies, setAnomalies] = useState(INITIAL_ANOMALIES);
  const [extRatings, setExtRatings] = useState(INITIAL_EXT_RATINGS);
  const [selectedExt, setSelectedExt] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<'Today' | 'Week' | 'Month' | 'Quarter'>('Week');
  
  // Spend tab filters
  const [spendGroupBy, setSpendGroupBy] = useState<'trunk' | 'operator' | 'destination' | 'extension'>('trunk');
  const [spendPeriod, setSpendPeriod] = useState<'day' | 'week' | 'month'>('week');

  // Expensive calls filters & search
  const [expensiveSearch, setExpensiveSearch] = useState('');
  const [expensivePeriod, setExpensivePeriod] = useState<'today' | 'week' | 'month'>('week');

  // Reconciliation data state
  const [reconciliation, setReconciliation] = useState(INITIAL_RECONCILIATION);
  const [reconcileDiffThreshold, setReconcileDiffThreshold] = useState<number>(50);

  // Notifications
  const [noti, setNoti] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showNoti = (type: 'success' | 'error' | 'info', text: string) => {
    setNoti({ type, text });
    setTimeout(() => setNoti(null), 5000);
  };

  // UI state for modals / actions
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpOp, setTopUpOp] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importType, setImportType] = useState<'CSV' | 'XLSX'>('CSV');
  const [fileContent, setFileContent] = useState<string>('');
  const [mappedTrunk, setMappedTrunk] = useState('TRUNK_MTT_OUT');

  // Input for adding new manual operator balance
  const [newOpName, setNewOpName] = useState('');
  const [newOpTrunk, setNewOpTrunk] = useState('');
  const [newOpBalance, setNewOpBalance] = useState('');
  const [newOpAvg, setNewOpAvg] = useState('');

  // Alerts configuration state
  const [tgNotificationEnabled, setTgNotificationEnabled] = useState(true);
  const [tgBotToken, setTgBotToken] = useState('5923847234:AAElx93-kFz748X...');
  const [tgChatId, setTgChatId] = useState('-1001859384723');
  const [emailNotificationEnabled, setEmailNotificationEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState('admin@pbxpuls.ru');
  const [webhookUrl, setWebhookUrl] = useState('https://app.pbxpuls.ru/incoming/balance-alerts');
  const [minBalanceThreshold, setMinBalanceThreshold] = useState('1500');

  // Trigger simulated sync
  const [isSyncing, setIsSyncing] = useState(false);

  // Tariff Analyzer nested function states lifted to parent level
  const [parserLogs, setParserLogs] = useState<string[]>([]);
  const [editOpId, setEditOpId] = useState('mango');
  const [editRates, setEditRates] = useState({
    mobile: 1.40,
    fixedLocal: 0.60,
    crimea: 1.50,
    regions: 1.80,
    longDistance: 2.20,
    international: 35.00
  });
  const [disputes, setDisputes] = useState([
    { id: 'disp1', operator: 'МТТ (Телеком)', direction: 'Казахстан (Межд)', tariffRate: 35.00, actualBilledRate: 145.00, callsCount: 14, overpay: 14250, desc: 'Биллинг MTT проводит списания по базовому тарифу Роуминга вместо льготного корпоративного.' },
    { id: 'disp2', operator: 'МТТ (Телеком)', direction: 'Республика Крым', tariffRate: 1.50, actualBilledRate: 4.50, callsCount: 114, overpay: 8640, desc: 'Пакет Симферополь/Севастополь тарифицируется по общей сетке СНГ.' }
  ]);
  const handleSyncAll = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setOperators(prev => prev.map(op => {
        if (op.id === 'mtt') return op; // MTT is manual
        const drift = (Math.random() - 0.7) * 40; // gradual spend reduction
        return {
          ...op,
          balance: parseFloat((op.balance + drift).toFixed(2)),
          lastUpdate: getServerNow().toISOString().replace('T', ' ').slice(0, 16)
        };
      }));
      showNoti('success', 'Балансы провайдеров успешно синхронизированы через API!');
    }, 1200);
  };

  // Top Up Action
  const handleTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      showNoti('error', 'Введите корректную сумму пополнения');
      return;
    }
    setOperators(prev => prev.map(op => {
      if (op.id === topUpOp) {
        return {
          ...op,
          balance: op.balance + amount,
          lastUpdate: getServerNow().toISOString().replace('T', ' ').slice(0, 16)
        };
      }
      return op;
    }));
    showNoti('success', `Успешно начислено ${amount} ₽ на баланс оператора ${topUpOp.toUpperCase()}`);
    setIsTopUpOpen(false);
    setTopUpAmount('');
  };

  // Custom balance import parser (Simulated)
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileContent.trim()) {
      showNoti('error', 'Вставьте содержимое файла или текстовые строки');
      return;
    }

    try {
      // Basic separator parsing: look for lines with numeric values
      const lines = fileContent.split('\n');
      let foundValue = 0;
      for (const line of lines) {
        const parts = line.split(/[;,]/);
        for (const p of parts) {
          const val = parseFloat(p.trim());
          if (!isNaN(val) && val > 0) {
            foundValue = val;
            break;
          }
        }
        if (foundValue > 0) break;
      }

      if (foundValue === 0) {
        throw new Error('Числовые значения баланса не определены');
      }

      setOperators(prev => prev.map(op => {
        if (op.trunkName === mappedTrunk) {
          return {
            ...op,
            balance: foundValue,
            providerType: importType + ' Импорт',
            lastUpdate: getServerNow().toISOString().replace('T', ' ').slice(0, 16)
          };
        }
        return op;
      }));

      showNoti('success', `Успешно импортирован баланс из ${importType}: ${foundValue} ₽ на транк ${mappedTrunk}`);
      setIsImportOpen(false);
      setFileContent('');
    } catch (err: any) {
      showNoti('error', `Ошибка распознавания: ${err.message || 'неверный формат данных'}`);
    }
  };

  // Add custom balance source
  const handleAddCustomOp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpName || !newOpTrunk || !newOpBalance) {
      showNoti('error', 'Заполните все ключевые поля');
      return;
    }
    
    const balNum = parseFloat(newOpBalance);
    const avgNum = parseFloat(newOpAvg) || 120;

    const key = newOpName.toLowerCase().replace(/\s+/g, '_');
    const newOp = {
      id: key,
      name: newOpName,
      trunkName: newOpTrunk.toUpperCase(),
      balance: balNum,
      prevBalance: balNum,
      dailyChange: -avgNum,
      avgSpend: avgNum,
      apiConnected: false,
      lastUpdate: getServerNow().toISOString().replace('T', ' ').slice(0, 16),
      providerType: 'Ручной ввод'
    };

    setOperators(prev => [...prev, newOp]);
    showNoti('success', `Новый источник баланса ${newOpName} добавлен!`);
    
    setNewOpName('');
    setNewOpTrunk('');
    setNewOpBalance('');
    setNewOpAvg('');
  };

  // Test Webhook / TG configuration
  const handleTestNotification = (channel: 'tg' | 'webhook' | 'email') => {
    if (channel === 'tg') {
      showNoti('info', 'Тестовое уведомление отправлено в Telegram-чат ' + tgChatId);
    } else if (channel === 'webhook') {
      showNoti('info', 'Отправлен POST-запрос на Webhook: ' + webhookUrl + ' (HTTP 200 OK)');
    } else {
      showNoti('info', 'Тестовое письмо отправлено на ' + emailAddress);
    }
  };

  // Dynamic calculated aggregate cards values
  const totalBalance = useMemo(() => {
    return operators.reduce((acc, op) => acc + op.balance, 0);
  }, [operators]);

  const activeTrunksCount = useMemo(() => {
    return operators.length;
  }, [operators]);

  const totalSpendToday = useMemo(() => {
    return operators.reduce((acc, op) => acc + Math.abs(op.dailyChange), 0);
  }, [operators]);

  const totalSpendMonth = useMemo(() => {
    return totalSpendToday * 28.5; // extrapolation or month accum
  }, [totalSpendToday]);

  const avgSpendDay = useMemo(() => {
    return operators.reduce((acc, op) => acc + op.avgSpend, 0);
  }, [operators]);

  // Days until run out
  const daysUntilDry = useMemo(() => {
    if (avgSpendDay <= 0) return 999;
    return parseFloat((totalBalance / avgSpendDay).toFixed(1));
  }, [totalBalance, avgSpendDay]);

  // Color logic for prediction days
  const getDaysColor = (days: number) => {
    if (days >= 14) return { border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' };
    if (days >= 7) return { border: 'border-yellow-200 dark:border-yellow-800', text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/40', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200' };
    if (days >= 3) return { border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200' };
    return { border: 'border-red-200 dark:border-red-800', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40', badge: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200' };
  };

  const threatDaysColor = getDaysColor(daysUntilDry);

  // Active Alert count
  const activeAlertsCount = useMemo(() => {
    return anomalies.filter(an => !an.dismissed).length;
  }, [anomalies]);

  // Handle dismiss anomaly
  const handleDismissAnomaly = (id: string) => {
    setAnomalies(prev => prev.map(an => an.id === id ? { ...an, dismissed: true } : an));
    showNoti('success', 'Аномалия переведена в статус архива.');
  };

  // Spend tab pivot data calculations
  const spendChartData = useMemo(() => {
    switch (spendGroupBy) {
      case 'trunk':
        return TRUNK_STATS.map(t => ({ name: t.name, value: t.spend }));
      case 'operator':
        return [
          { name: 'Билайн', value: 1200 },
          { name: 'Mango', value: 680 },
          { name: 'Zadarma', value: 450 },
          { name: 'MTT', value: 2320 }
        ];
      case 'destination':
        return [
          { name: 'Международные', value: 4140 },
          { name: 'Региональные РФ', value: 1240 },
          { name: 'Мобильные Крым', value: 920 },
          { name: 'Стационарные', value: 380 }
        ];
      case 'extension':
        return extRatings.map(e => ({ name: `EXT ${e.ext}`, value: e.spend }));
    }
  }, [spendGroupBy, extRatings]);

  // Filtering expensive calls log
  const filteredExpensiveCalls = useMemo(() => {
    return EXPENSIVE_CALLS_LOG.filter(call => {
      // search filter
      const matchesSearch = 
        call.number.includes(expensiveSearch) || 
        call.name.toLowerCase().includes(expensiveSearch.toLowerCase()) ||
        call.ext.includes(expensiveSearch) ||
        call.destination.toLowerCase().includes(expensiveSearch.toLowerCase());
      
      // Period filter
      if (expensivePeriod === 'today') {
        return matchesSearch && call.date.includes('2026-06-23');
      } else if (expensivePeriod === 'week') {
        return matchesSearch && (call.date.includes('23') || call.date.includes('22') || call.date.includes('21'));
      }
      return matchesSearch;
    });
  }, [expensiveSearch, expensivePeriod]);

  // Export File (Real CSV generator and download)
  const triggerExport = (format: 'CSV' | 'XLSX') => {
    let content = '';
    let mimeType = 'text/csv';
    let fileExtension = 'csv';

    if (format === 'CSV') {
      content = 'Оператор связи,Транк,Текущий баланс,Расход сегодня,Средний расход в день,Прогноз дней,Тип интеграции\n';
      operators.forEach(op => {
        content += `"${op.name}","${op.trunkName}",${op.balance},${op.dailyChange},${op.avgSpend},${(op.balance / op.avgSpend).toFixed(1)},"${op.providerType}"\n`;
      });
    } else {
      content = 'СПЕЦИФИКАЦИЯ БАЛАНСОВ PBXPULS\nСгенерировано: ' + getServerNow().toLocaleString() + '\n\n';
      content += 'Транк,Провайдер,Баланс,Суточное изменение,Прогноз исчерпания\n';
      operators.forEach(op => {
        content += `${op.trunkName},${op.name},${op.balance} руб.,${op.dailyChange} руб.,${(op.balance / op.avgSpend).toFixed(1)} дней\n`;
      });
      mimeType = 'text/plain';
      fileExtension = 'txt';
    }

    const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pbxpuls_balance_report_${getServerNow().toISOString().slice(0,10)}.${fileExtension}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNoti('success', `Отчет успешно экспортирован в формат ${format}!`);
  };

  // Reconcile compare data
  const handleAutoReconcile = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setReconciliation([
        { id: 1, operatorName: 'Mango Office', cdrCharged: 680.00, operatorCharged: 680.00, diff: 0, status: 'match' },
        { id: 2, operatorName: 'Zadarma (ZPN)', cdrCharged: 450.00, operatorCharged: 450.00, diff: 0, status: 'match' },
        { id: 3, operatorName: 'МТТ', cdrCharged: 2150.00, operatorCharged: 2320.00, diff: 170.00, status: 'discrepancy', reason: 'Абонентская плата за пакет 100 мин.' },
        { id: 4, operatorName: 'Билайн Бизнес CRM', cdrCharged: 1200.00, operatorCharged: 1250.00, diff: 50.00, status: 'discrepancy', reason: 'Плата за округление секунд по тарификации оператора' },
      ]);
      showNoti('success', 'Сверка с Asterisk CDR и биллингом провайдеров завершена.');
    }, 1000);
  };

  if (!canViewBalance) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-8 text-center max-w-2xl mx-auto my-12">
        <ShieldAlert className="h-12 w-12 text-red-600 dark:text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-black text-slate-900 dark:text-white">Доступ ограничен</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          У вас нет прав (<code className="text-red-500 font-mono">view_balance</code>) на просмотр финансовых отчетов и баланса телефонии. Обратитесь к администратору.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="balance-center-container">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/60 dark:bg-[#1e293b]/60 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 dark:border-[#334155]/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Wallet className="h-6 w-6" />
            </span>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Финансовый центр PBXPULS</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Контроль балансов операторов связи, расходов по внутренним номерам и выявление аномальных списаний в реальном времени.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#2e3e56] hover:bg-slate-200 dark:hover:bg-[#3d516d] rounded-xl transition-all border border-slate-200/50 dark:border-transparent cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Синхронизировать API
          </button>
          
          {canManageSources && (
            <>
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl transition-all cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                Импорт файлов
              </button>
              <button
                type="button"
                onClick={() => {
                  setTopUpOp(operators[0]?.id || 'mango');
                  setIsTopUpOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Пополнить баланс
              </button>
            </>
          )}

          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#1e293b] hover:bg-slate-100 rounded-xl transition-all border border-slate-200/50 dark:border-[#334155]/80"
            >
              <Download className="h-3.5 w-3.5" />
              Экспорт
            </button>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block bg-white dark:bg-[#1e293b] shadow-xl rounded-xl border border-slate-100 dark:border-[#334155] p-1 w-36 z-50">
              <button onClick={() => triggerExport('CSV')} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Excel (CSV)
              </button>
              <button onClick={() => triggerExport('XLSX')} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold">
                <Download className="h-3.5 w-3.5 text-blue-500" /> Текст (TXT)
              </button>
            </div>
          </div>
        </div>
      </div>

      {notificationBlock()}

      {/* 30-SECOND FINANCIAL LOOK SUMMARY (UX REQUIREMENT) */}
      <div className="bg-gradient-to-br from-slate-900 via-[#1e293b] to-slate-950 text-white p-6 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
        
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-400 animate-pulse" />
            <h2 className="text-sm font-extrabold tracking-wide uppercase text-slate-300">Состояние на 30 секунд: Оценка расходов и Хватит ли денег?</h2>
          </div>
          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-slate-300 font-mono">Система: PBX-Billing-v4</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative z-10">
          {/* Status 1 */}
          <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-xs text-slate-400">Хватит ли денег?</div>
            <div className="text-lg font-black mt-1 flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="h-5 w-5" /> Да, в норме
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Опасных просадок балансов нет</div>
          </div>

          {/* Status 2 */}
          <div className={`p-3 bg-white/5 rounded-2xl border ${threatDaysColor.border}`}>
            <div className="text-xs text-slate-400">Когда закончатся?</div>
            <div className="text-lg font-black mt-1">
              ~ {daysUntilDry} дн.
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Ориентировочно: <span className="font-mono text-emerald-400">17.08.2026</span></div>
          </div>

          {/* Status 3 */}
          <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-xs text-slate-400">Лидер расходов</div>
            <div className="text-lg font-black mt-1 text-sky-400 truncate">
              MTT_OUT
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Расход: 2,320 ₽ (вчера)</div>
          </div>

          {/* Status 4 */}
          <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-xs text-slate-400 font-bold flex items-center gap-1">Активные Аномалии</div>
            <div className={`text-lg font-black mt-1 flex items-center gap-1.5 ${activeAlertsCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              <ShieldAlert className="h-5 w-5" /> {activeAlertsCount} шт.
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Рекомендуется проверить лог</div>
          </div>

          {/* Status 5 */}
          <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-xs text-slate-400">Требуют внимания</div>
            <div className="text-lg font-black mt-1 text-yellow-400">
              EXT 200
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Международные звонки</div>
          </div>
        </div>
      </div>

      {/* METRICS DASHBOARD CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
        {/* Total Balance */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Общий баланс</span>
            <Wallet className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
            {totalBalance.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-[10px] text-emerald-500 mt-1 font-mono">
            4 оператора связи
          </div>
        </div>

        {/* Trunks Monitored */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Под контролем</span>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
            {activeTrunksCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            SIP транков на мониторе
          </div>
        </div>

        {/* Today Spend */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Расход сегодня</span>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
            {totalSpendToday.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-[10px] text-rose-500 mt-1 font-mono">
            -8.4% по сравнению со вчера
          </div>
        </div>

        {/* Monthly Spend Forecast */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Расход за месяц</span>
            <Calendar className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
            {totalSpendMonth.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            Прогноз на Июнь
          </div>
        </div>

        {/* Average Spend Per Day */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Средний расход</span>
            <TrendingUp className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
            {avgSpendDay.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Оценка за 7 дней</div>
        </div>

        {/* Days Left Until Run Out */}
        <div className={`border rounded-3xl p-4 shadow-2xs ${threatDaysColor.bg} ${threatDaysColor.border}`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Дней до нуля</span>
            <AlertTriangle className={`h-4 w-4 ${threatDaysColor.text}`} />
          </div>
          <div className={`text-lg font-black font-mono ${threatDaysColor.text}`}>
            {daysUntilDry} дн.
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Прогноз истощения
          </div>
        </div>

        {/* Active alarms count */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs">Тревоги</span>
            <Bell className={`h-4 w-4 ${activeAlertsCount > 0 ? 'text-red-500 animate-bounce' : 'text-slate-400'}`} />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
            {activeAlertsCount}
          </div>
          <div className="text-[10px] text-rose-500 mt-1">
            {activeAlertsCount > 0 ? 'Требуют внимания' : 'Нет активных угроз'}
          </div>
        </div>
      </div>

      {/* CORE NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#1e293b] rounded-2xl w-fit">
        {[
          { id: 'overview', label: 'Обзор', icon: Wallet },
          { id: 'operators', label: 'Балансы операторов', icon: Building2 },
          { id: 'history', label: 'История и прогнозы', icon: TrendingUp },
          { id: 'spend', label: 'Аналитика расходов', icon: Activity },
          { id: 'extensions', label: 'Рейтинг Ext-номеров', icon: ListOrdered },
          { id: 'anomalies', label: 'Детектор аномалий', icon: ShieldAlert, badge: activeAlertsCount },
          { id: 'expensive', label: 'Дорогие вызовы', icon: PhoneCall },
          { id: 'reconciliation', label: 'Сверка (Asterisk CDR)', icon: Sparkles },
          { id: 'tariffs', label: 'Анализатор тарифов', icon: Percent },
          { id: 'settings', label: 'Лимиты и Каналы', icon: Settings }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                isActive 
                  ? 'bg-white dark:bg-[#2e3e56] text-blue-600 dark:text-blue-400 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {tab.badge ? (
                <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono animate-pulse">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* RENDER ACTIVE TAB */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl shadow-sm p-6">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'operators' && renderOperatorsTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'spend' && renderSpendTab()}
        {activeTab === 'extensions' && renderExtensionsTab()}
        {activeTab === 'anomalies' && renderAnomaliesTab()}
        {activeTab === 'expensive' && renderExpensiveTab()}
        {activeTab === 'reconciliation' && renderReconciliationTab()}
        {activeTab === 'tariffs' && renderTariffsTab()}
        {activeTab === 'settings' && renderSettingsTab()}
      </div>

      {/* CORE MODALS SECTION */}
      {isTopUpOpen && renderTopUpModal()}
      {isImportOpen && renderImportModal()}
      {selectedExt && renderDrillDownModal()}
    </div>
  );

  // NOTIFICATION UTILITY
  function notificationBlock() {
    if (!noti) return null;
    return (
      <div className={`p-4 rounded-xl flex items-center justify-between border ${
        noti.type === 'success' 
          ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
          : noti.type === 'error'
          ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
      }`}>
        <div className="flex items-center gap-2 text-xs font-bold">
          <Activity className="h-4 w-4 animate-pulse" />
          <span>{noti.text}</span>
        </div>
        <button type="button" onClick={() => setNoti(null)} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // TAB 1: OVERVIEW COMPACT DASHBOARD
  function renderOverviewTab() {
    const activeUnresolvedAnomalies = anomalies.filter(a => !a.dismissed);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Active alerts section */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
                Активные финансовые тревоги и угрозы
              </h3>
              <span className="text-[10px] text-slate-400">В реальном времени</span>
            </div>

            {activeUnresolvedAnomalies.length === 0 ? (
              <div className="border border-dashed border-slate-200 dark:border-[#334155] rounded-3xl p-8 text-center text-slate-400 text-xs">
                <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                Финансовых отклонений и аномалий за последние 72 часа не обнаружено.
              </div>
            ) : (
              <div className="space-y-3">
                {activeUnresolvedAnomalies.map(an => (
                  <div 
                    key={an.id} 
                    className={`p-4 rounded-2xl border ${
                      an.riskLevel === 'critical' 
                        ? 'bg-rose-50/50 dark:bg-rose-950/10 border-rose-200 dark:border-rose-800' 
                        : an.riskLevel === 'high'
                        ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800'
                        : 'bg-yellow-50/50 dark:bg-yellow-950/10 border-yellow-200 dark:border-yellow-805'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-2">
                        <span className={`p-1.5 rounded-lg mt-0.5 ${
                          an.riskLevel === 'critical' ? 'bg-rose-500 text-white' : 'bg-yellow-500 text-white'
                        }`}>
                          <ShieldAlert className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white">{an.cause}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{an.time}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              an.riskLevel === 'critical' ? 'bg-red-200 dark:bg-red-900 text-red-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              Уровень риска: {an.riskLevel.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{an.description}</p>
                          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 bg-white/40 dark:bg-[#253246]/40 p-1.5 rounded-lg">
                            <span className="font-bold text-slate-700 dark:text-white">Решение:</span> {an.recommendation}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDismissAnomaly(an.id)}
                          className="px-2.5 py-1 bg-white dark:bg-[#2a3a4e] hover:bg-slate-50 border border-slate-200 dark:border-transparent rounded-lg text-[10px] text-slate-600 dark:text-slate-300 font-bold"
                        >
                          Архивировать
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            showNoti('success', 'Действие предпринято. Ограничение отправлено в Asterisk dialplan.');
                            handleDismissAnomaly(an.id);
                          }}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                        >
                          Принять меры <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats sidebar review */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Быстрый прогноз расходов
            </h3>
            <div className="bg-slate-50 dark:bg-[#1a2332] p-4 rounded-3xl border border-slate-100 dark:border-transparent space-y-3.5">
              <div>
                <span className="text-[11px] text-slate-400">При среднем потреблении:</span>
                <div className="text-xl font-mono font-black text-slate-900 dark:text-white mt-1">
                  {avgSpendDay.toFixed(2)} ₽ <span className="text-xs font-normal text-slate-400">/ день</span>
                </div>
              </div>

              <div className="h-px bg-slate-200 dark:bg-slate-700"></div>

              <div>
                <span className="text-[11px] text-slate-400">Прогресс износа (7 дней):</span>
                <div className="mt-1 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full" style={{ width: '15%' }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Списано: ~4,650 ₽</span>
                  <span>Осталось: {totalBalance.toFixed(0)} ₽</span>
                </div>
              </div>

              <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-yellow-50/50 dark:bg-yellow-950/10">
                <div className="text-[10px] font-black text-yellow-800 dark:text-yellow-400">Рекомендация по пополнениям:</div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Транк <span className="font-mono font-bold">TRUNK_MTT_OUT</span> на исходе. Рекомендуется внести не менее 1,500 ₽ для обеспечения бесперебойной мобильной связи.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic preview Chart container */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Динамика балансов по дням недели</h3>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500"></span><span className="text-[10px] text-slate-400 mr-3">Баланс в ₽</span>
              <span className="h-2 w-2 rounded-full bg-red-400"></span><span className="text-[10px] text-slate-400 mr-2">Расход в ₽</span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={HISTORIC_DATA.Week}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBalance)" name="Баланс" />
                <Area type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorSpend)" name="Расход" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // TAB 2: DETAILED OPERATOR BALANCES
  function renderOperatorsTab() {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Контролируемые балансы провайдеров IP-телефонии</h3>
            <p className="text-xs text-slate-400 mt-0.5">В таблице отображаются как автоматические API-транки, так и ручные импортированные балансы.</p>
          </div>
          
          {canManageSources && (
            <button
              onClick={() => {
                setNewOpName('');
                setNewOpTrunk('');
                setNewOpBalance('');
                setActiveTab('settings');
              }}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить транк
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                <th className="pb-3 pt-1">Оператор</th>
                <th className="pb-3 pt-1">Связанный транк</th>
                <th className="pb-3 pt-1 text-right">Текущий баланс</th>
                <th className="pb-3 pt-1 text-right">Изменение 24ч</th>
                <th className="pb-3 pt-1 text-right">Ср. расход / день</th>
                <th className="pb-3 pt-1 text-center">Прогноз истощения</th>
                <th className="pb-3 pt-1">Тип связи</th>
                <th className="pb-3 pt-1 text-right">Последний опрос</th>
                <th className="pb-3 pt-1 text-center">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {operators.map(op => {
                const daysLeft = op.avgSpend > 0 ? parseFloat((op.balance / op.avgSpend).toFixed(1)) : 999;
                const opColor = getDaysColor(daysLeft);

                return (
                  <tr key={op.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 font-black text-slate-900 dark:text-white">{op.name}</td>
                    <td className="py-4 font-mono text-slate-500 text-[11px]">{op.trunkName}</td>
                    <td className="py-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {op.balance.toLocaleString('ru-RU')} ₽
                    </td>
                    <td className="py-4 text-right font-mono">
                      <span className={op.dailyChange < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                        {op.dailyChange > 0 ? '+' : ''}{op.dailyChange} ₽
                      </span>
                    </td>
                    <td className="py-4 text-right font-mono text-slate-500">{op.avgSpend} ₽</td>
                    <td className="py-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${opColor.badge}`}>
                        {daysLeft === 999 ? 'Без лимита' : `${daysLeft} дн.`}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                        op.apiConnected ? 'text-emerald-500' : 'text-slate-400'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${op.apiConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {op.providerType}
                      </span>
                    </td>
                    <td className="py-4 text-right text-slate-400 font-mono text-[10px]">{op.lastUpdate}</td>
                    <td className="py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTopUpOp(op.id);
                            setIsTopUpOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                          title="Пополнить баланс"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSyncing(true);
                            setTimeout(() => {
                              setIsSyncing(false);
                              showNoti('success', `Данные Mango/Beeline API для "${op.name}" обновлены превосходно.`);
                            }, 500);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                          title="Синхронизировать по API"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // TAB 3: CHART HISTORY & FORECAST PREDICTIONS
  function renderHistoryTab() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">История списания средств и точки пополнения</h3>
            <p className="text-xs text-slate-400 mt-0.5">Временная шкала графических индикаций.</p>
          </div>

          <div className="flex bg-slate-100 dark:bg-[#1e293b] p-1 rounded-xl">
            {['Today', 'Week', 'Month', 'Quarter'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setTimePeriod(p as any)}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg ${
                  timePeriod === p 
                    ? 'bg-white dark:bg-[#2d3a4d] text-slate-900 dark:text-white shadow-xs' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {p === 'Today' ? 'Сегодня' : p === 'Week' ? 'Неделя' : p === 'Month' ? 'Месяц' : 'Квартал'}
              </button>
            ))}
          </div>
        </div>

        {/* Historical Graph */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={HISTORIC_DATA[timePeriod]}>
              <defs>
                <linearGradient id="histBalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="histSpentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
              <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#histBalGrad)" name="Баланс телефонии (₽)" />
              <Area type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={1} fill="url(#histSpentGrad)" name="Затраты телефонии (₽)" />
              <Area type="monotone" dataKey="topup" stroke="#10b981" strokeWidth={1} name="Сумма Пополнений (₽)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Sharp Drops highlighter (Резкие изменения) */}
        <div className="bg-slate-50 dark:bg-[#1a2332] rounded-2xl p-4">
          <h4 className="text-[12px] font-black text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Выявленные системные резкие изменения баланса
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white dark:bg-[#212d3e] rounded-xl border border-slate-100 dark:border-[#334155] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-rose-500 font-bold uppercase">Резкий провал расходов</span>
                <p className="mt-0.5 text-slate-800 dark:text-slate-200">МТТ: списание 2,320 ₽ за раз (22 Июня)</p>
              </div>
              <span className="font-mono font-bold text-rose-500">-2,320 ₽</span>
            </div>

            <div className="p-3 bg-white dark:bg-[#212d3e] rounded-xl border border-slate-100 dark:border-[#334155] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-emerald-500 font-bold uppercase">Крупное пополнение</span>
                <p className="mt-0.5 text-slate-800 dark:text-slate-200">Платеж Mango Office по API (23 Июня)</p>
              </div>
              <span className="font-mono font-bold text-emerald-500">+5,000 ₽</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TAB 4: SPEND ANALYTICS (Pivoted dashboards)
  function renderSpendTab() {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Подробный анализ распределения расходов</h3>
            <p className="text-xs text-slate-400 mt-0.5">Исследование стоимости телефонии по четырем ключевым срезам.</p>
          </div>

          <div className="flex bg-slate-100 dark:bg-[#1e293b] p-1 rounded-xl gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-200/50 dark:border-[#334155]">
              {[
                { id: 'trunk', label: 'Транки' },
                { id: 'operator', label: 'Операторы' },
                { id: 'destination', label: 'Направления' },
                { id: 'extension', label: 'Внутренние' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSpendGroupBy(opt.id as any)}
                  className={`px-3 py-1 text-[11px] font-bold cursor-pointer transition-all ${
                    spendGroupBy === opt.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white dark:bg-[#233041] text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg overflow-hidden border border-slate-200/50 dark:border-[#334155]">
              {[
                { id: 'day', label: 'День' },
                { id: 'week', label: 'Неделя' },
                { id: 'month', label: 'Месяц' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSpendPeriod(opt.id as any)}
                  className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-all ${
                    spendPeriod === opt.id 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-white dark:bg-[#233041] text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Big visual breakdown representation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Spend Graph Column */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase">Графическое распределение долей:</h4>
            
            <div className="h-64 bg-slate-50 dark:bg-[#1c2637]/50 p-4 rounded-3xl border border-slate-100 dark:border-transparent">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                    {spendChartData.map((entry, index) => {
                      const colors = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ec4899'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Leaders list */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase">Показатели лидеров:</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3">
              {spendChartData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold font-mono">
                      {idx + 1}
                    </span>
                    <span className="font-black text-slate-800 dark:text-slate-200">{item.name}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{item.value.toLocaleString('ru-RU')} ₽</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TAB 5: INTERNAL EXTENSION RATING (Rating lists & drill down modal triggers)
  function renderExtensionsTab() {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Рейтинг внутренних номеров (EXT) по расходам телефонии</h3>
          <p className="text-xs text-slate-400 mt-1">
            Кликните по сотруднику/номеру, чтобы мгновенно провалиться в подробный отчет: куда звонил, минуты, через какие транки и стоимость.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {extRatings.map((e, index) => {
            const colors = ['bg-amber-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500'];
            
            return (
              <div 
                key={e.ext}
                onClick={() => setSelectedExt(e.ext)}
                className="bg-slate-50 hover:bg-slate-100 dark:bg-[#1a2332] dark:hover:bg-[#233044] p-4 rounded-3xl border border-slate-100 dark:border-[#334155] cursor-pointer transition-all duration-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-2xl ${colors[index % colors.length]} text-white font-extrabold flex items-center justify-center`}>
                    {e.avatar}
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">EXT {e.ext}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{e.name}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-white font-mono">
                    {e.spend.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {e.mins} мин / {e.calls} зв.
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // TAB 6: ANOMALY DETECTOR
  function renderAnomaliesTab() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Детектор Финансовых Аномалий</h3>
            <p className="text-xs text-slate-400 mt-0.5">Автоматический фоновый анализ вызовов и сверка списания.</p>
          </div>
          <span className="text-xs text-blue-500 font-mono bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-xl">Алгоритм: Скан аномалий</span>
        </div>

        {/* Scan Status List */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
          {[
            { id: 'p1', label: 'Падение баланса', checked: true },
            { id: 'p2', label: 'Рост расхода >50%', checked: true },
            { id: 'p3', label: 'Рост расхода >100%', checked: true },
            { id: 'p4', label: 'Междунар. звонки', checked: true },
            { id: 'p5', label: 'Новые направления', checked: true },
            { id: 'p6', label: 'Дорогие вызовы', checked: true },
            { id: 'p7', label: 'Длинные звонки', checked: true },
            { id: 'p8', label: 'Удорожание минуты', checked: true },
            { id: 'p9', label: 'Внерабочие вызовы', checked: true }
          ].map((c) => (
            <div key={c.id} className="p-2.5 bg-slate-50 dark:bg-[#1a2332] rounded-xl border border-slate-100 dark:border-[#334155] text-center">
              <Check className="h-4 w-4 text-emerald-500 mx-auto mb-1 animate-pulse" />
              <div className="text-[9px] font-black text-slate-700 dark:text-slate-300 leading-tight">{c.label}</div>
              <div className="text-[8px] text-emerald-400 mt-0.5 uppercase tracking-wider">активен</div>
            </div>
          ))}
        </div>

        {/* Detailed Anomaly List */}
        <div className="space-y-3">
          {anomalies.map(an => (
            <div 
              key={an.id} 
              className={`p-4 rounded-2xl border ${
                an.dismissed ? 'opacity-40 bg-slate-100 dark:bg-slate-800 border-slate-200' : 
                an.riskLevel === 'critical' ? 'bg-rose-50/50 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900' :
                'bg-amber-50/50 dark:bg-amber-950/15 border-amber-200 dark:border-amber-900'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex gap-3">
                  <span className={`p-2 rounded-xl text-white shrink-0 h-9 w-9 flex items-center justify-center ${
                    an.riskLevel === 'critical' ? 'bg-rose-500' : 'bg-amber-500'
                  }`}>
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{an.cause}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{an.time}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        an.riskLevel === 'critical' ? 'bg-red-200 dark:bg-red-950 text-red-800' : 'bg-yellow-105 text-yellow-805'
                      }`}>
                        Риск: {an.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{an.description}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      <span className="font-bold text-slate-700 dark:text-white">Рекомендуемое действие:</span> {an.recommendation}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 md:self-center">
                  {!an.dismissed && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDismissAnomaly(an.id)}
                        className="px-3 py-1.5 bg-white dark:bg-[#253246] hover:bg-slate-50 border border-slate-200 dark:border-transparent rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
                      >
                        Игнорировать
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          showNoti('success', 'Действие предпринято! Профиль принудительно заблокирован.');
                          handleDismissAnomaly(an.id);
                        }}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
                      >
                        Выполнить рекомендацию
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // TAB 7: EXPENSIVE CALLS TABLE
  function renderExpensiveTab() {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Журнал дорогих вызовов</h3>
            <p className="text-xs text-slate-400 mt-0.5">Полный список звонков, которые превышают типичную стоимость минуты или длительности.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по номеру, EXT или месту..."
                value={expensiveSearch}
                onChange={(e) => setExpensiveSearch(e.target.value)}
                className="pl-8 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#1a2332] border border-slate-200 dark:border-[#334155] focus:outline-none focus:border-blue-500 w-52 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="flex bg-slate-100 dark:bg-[#1e293b] p-1 rounded-xl">
              {['today', 'week', 'month'].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setExpensivePeriod(p as any)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    expensivePeriod === p 
                      ? 'bg-white dark:bg-[#2d3a4d] text-slate-900 dark:text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {p === 'today' ? 'Сегодня' : p === 'week' ? 'Неделя' : 'Месяц'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                <th className="pb-2">Дата вызова</th>
                <th className="pb-2">Внутренний (EXT)</th>
                <th className="pb-2">Номер назначения</th>
                <th className="pb-2">Направление</th>
                <th className="pb-2 text-right">Длительность</th>
                <th className="pb-2 text-right">Стоимость вызова</th>
                <th className="pb-2 text-right">Стоимость / минута</th>
                <th className="pb-2">Транк</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExpensiveCalls.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 font-mono text-[10px] text-slate-400">{c.date}</td>
                  <td className="py-3">
                    <span className="font-bold text-slate-900 dark:text-white">EXT {c.ext}</span>
                    <span className="text-[10px] text-slate-400 block">{c.name}</span>
                  </td>
                  <td className="py-3 font-mono text-slate-800 dark:text-white">{c.number}</td>
                  <td className="py-3 text-slate-500">{c.destination}</td>
                  <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">{c.duration}</td>
                  <td className="py-3 text-right font-mono font-bold text-red-500">{c.cost.toFixed(2)} ₽</td>
                  <td className="py-3 text-right font-mono text-slate-400">{c.rate.toFixed(2)} ₽</td>
                  <td className="py-3 font-mono text-[11px] text-indigo-400">{c.trunk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // TAB 8: CDR RECONCILIATION
  function renderReconciliationTab() {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Автоматическая сверка и выявление потерь</h3>
            <p className="text-xs text-slate-400 mt-0.5">В режиме реального времени сравниваем данные внутренней CDR Asterisk со списаниями по биллингу провайдера связи.</p>
          </div>

          <button
            type="button"
            onClick={handleAutoReconcile}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
          >
            <Sparkles className="h-3.5 w-3.5 animate-spin-slow" />
            Запустить сверку заново
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-3xl p-4 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
            Внимание: обнаружено 2 расхождения на сумму 220.00 ₽!
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Возможные причины расхождений: абонентская плата за городские номера, округления у оператора в большую сторону (например, поминутная тарификация при посекундной в PBX), либо скрытые услуги.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                <th className="pb-3">Провайдер</th>
                <th className="pb-3 text-right">Начислено по CDR PBX</th>
                <th className="pb-3 text-right">Списано провайдером</th>
                <th className="pb-3 text-right">Разница (Дельта)</th>
                <th className="pb-3">Статус расхождения</th>
                <th className="pb-3">Вероятное обоснование</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reconciliation.map(rec => (
                <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-4 font-black text-slate-900 dark:text-white">{rec.operatorName}</td>
                  <td className="py-4 text-right font-mono text-slate-900 dark:text-white">{rec.cdrCharged.toFixed(2)} ₽</td>
                  <td className="py-4 text-right font-mono text-slate-900 dark:text-white">{rec.operatorCharged.toFixed(2)} ₽</td>
                  <td className="py-4 text-right font-mono font-bold">
                    <span className={rec.diff > 0 ? 'text-amber-500' : 'text-emerald-500'}>
                      {rec.diff > 0 ? '+' : ''}{rec.diff.toFixed(2)} ₽
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      rec.status === 'match' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' 
                        : 'bg-amber-100 text-amber-805 dark:bg-amber-95d/40 dark:text-amber-305'
                    }`}>
                      {rec.status === 'match' ? 'Сверено 100%' : 'РАСХОЖДЕНИЕ'}
                    </span>
                  </td>
                  <td className="py-4 text-[10px] text-slate-500 max-w-[200px] truncate" title={rec.reason}>
                    {rec.reason || 'Полное математическое совпадение'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // TAB 9: TARIFF ANALYZER (LCR DISPATCHER & ANOMALY CORRELATION)
  function renderTariffsTab() {
    // Current cheapest calculation function
    const getCheapestOperator = (directionKey: 'mobile' | 'fixedLocal' | 'crimea' | 'regions' | 'longDistance' | 'international') => {
      let minRate = Infinity;
      let winnerName = '';
      let winnerId = '';
      tariffs.forEach(op => {
        if (op.rates[directionKey] < minRate) {
          minRate = op.rates[directionKey];
          winnerName = op.name;
          winnerId = op.id;
        }
      });
      return { id: winnerId, name: winnerName, rate: minRate };
    };

    const cheapestMobile = getCheapestOperator('mobile');
    const cheapestFixed = getCheapestOperator('fixedLocal');
    const cheapestCrimea = getCheapestOperator('crimea');
    const cheapestRegions = getCheapestOperator('regions');
    const cheapestLong = getCheapestOperator('longDistance');
    const cheapestIntl = getCheapestOperator('international');

    // Operator dropdown URL preset helpers
    const handleOperatorChangeForUrl = (opId: string) => {
      setSelectedOperatorForUrl(opId);
      if (opId === 'mango') setUrlToParse('https://www.mangotelecom.ru/tariffs/virtual-pbx');
      else if (opId === 'zadarma') setUrlToParse('https://zadarma.com/ru/tariffs/');
      else if (opId === 'mtt') setUrlToParse('https://www.mtt.ru/ru/service/api-telephony');
      else if (opId === 'beeline') setUrlToParse('https://moskva.beeline.ru/business/telephony/sip-trunk/');
    };

    // Parser trigger simulated log list
    
    const handleUrlParseTrigger = () => {
      if (!urlToParse) {
        showNoti('error', 'Пожалуйста, введите корректный URL оператора');
        return;
      }
      setIsUrlParsing(true);
      setParserLogs([]);
      
      const logSteps = [
        'Инициализация headless-браузера и подключение прокси...',
        `Установка соединения с ${urlToParse}...`,
        'Парсинг DOM-структуры и извлечение таблиц с ценниками...',
        'Калибровка направлений и выделение стоимости за минуту...',
        'Конвертация валют и валидация 1-секундной тарификации...',
        'Синхронизация тарифов с Asterisk биллинг-модулем выполнена!'
      ];

      logSteps.forEach((step, idx) => {
        setTimeout(() => {
          setParserLogs(prev => [...prev, `[${getServerNow().toLocaleTimeString()}] ${step}`]);
          if (idx === logSteps.length - 1) {
            setIsUrlParsing(false);
            // Slightly tweak the selected operator's tariff
            setTariffs(prev => prev.map(op => {
              if (op.id === selectedOperatorForUrl) {
                return {
                  ...op,
                  updatedAt: 'Сегодня (Парсер)',
                  sourceType: 'site',
                  sourceName: urlToParse.replace('https://', '').slice(0, 30) + '...',
                  rates: {
                    mobile: Number((op.rates.mobile * 0.95).toFixed(2)),
                    fixedLocal: Number((op.rates.fixedLocal * 0.92).toFixed(2)),
                    crimea: Number((op.rates.crimea * 0.91).toFixed(2)),
                    regions: Number((op.rates.regions * 0.96).toFixed(2)),
                    longDistance: Number((op.rates.longDistance * 0.94).toFixed(2)),
                    international: Number((op.rates.international * 0.90).toFixed(2))
                  }
                };
              }
              return op;
            }));
            showNoti('success', `Тарифы оператора успешно обновлены. Найдена выгода до 10%!`);
          }
        }, (idx + 1) * 400);
      });
    };

    // File parser simulated loader
    const handleFileParseTrigger = () => {
      if (!uploadedTariffFile && !rawTextTariff) {
        showNoti('error', 'Выберите файл для загрузки или вставьте текст тарифа/договора');
        return;
      }
      setIsConvertingFile(true);
      setTimeout(() => {
        setIsConvertingFile(false);
        // Identify some pasted values or custom set
        setTariffs(prev => prev.map(op => {
          if (op.id === selectedFileOperator) {
            return {
              ...op,
              updatedAt: 'Сегодня (Ручной импорт/OCR)',
              sourceType: uploadedTariffFile ? 'excel' : 'pdf',
              sourceName: uploadedTariffFile || 'Текстовый фрагмент договора',
              rates: {
                mobile: 1.05,
                fixedLocal: 0.35,
                crimea: 1.25,
                regions: 1.20,
                longDistance: 1.65,
                international: 25.00
              }
            };
          }
          return op;
        }));
        setRawTextTariff('');
        setUploadedTariffFile(null);
        showNoti('success', 'Документ успешно распознан OCR модулем и импортирован!');
      }, 1200);
    };

    // Action of outbound priorities syncing (dialplan alignment)
    const handleDialplanAlignment = () => {
      setIsDialplanSyncing(true);
      setTimeout(() => {
        setIsDialplanSyncing(false);
        // Re-align dialplan based on cheapest operators
        setOutboundRoutes([
          { id: 'route-mob', name: '01_MOBILE_RUSSIA', pattern: '89XXXXXXXXX', primaryTrunk: 'Zadarma', secondaryTrunk: 'Beeline', status: 'optimal' },
          { id: 'route-local', name: '02_LOCAL_MOSCOW', pattern: '8495XXXXXXX, 8499XXXXXXX', primaryTrunk: 'Zadarma', secondaryTrunk: 'Beeline', status: 'optimal' },
          { id: 'route-crimea', name: '03_CRIMEA_DIAL', pattern: '8978XXXXXXX', primaryTrunk: 'Beeline', secondaryTrunk: 'Mango', status: 'optimal' },
          { id: 'route-regions', name: '04_REGIONS_RUSSIA', pattern: '8[348]XXXXXXXX', primaryTrunk: 'Zadarma', secondaryTrunk: 'Beeline', status: 'optimal' },
          { id: 'route-intl', name: '05_INTERNATIONAL', pattern: '810X.', primaryTrunk: 'Zadarma', secondaryTrunk: 'Mango', status: 'optimal' }
        ]);
        showNoti('success', 'Приоритеты Asterisk LCR Dialplan перенастроены. Все направления оптимальны!');
      }, 1500);
    };

    // Simulated pre-filled text profiles for easy copy paste
    const insertSampleContractText = () => {
      setRawTextTariff(
        "Приложение №3 к договору связи.\n" +
        "Раздел Б. Стоимость пропуска трафика:\n" +
        "1.1 Мобильный трафик РФ (ГПК) - 1.05 руб/минута\n" +
        "1.2 Фиксированный трафик Москва/СПб - 0.35 руб/минута\n" +
        "1.3 Локальные вызовы Республика Крым - 1.25 руб/минута\n" +
        "1.4 Звонки на областные стационарные сети - 1.20 руб/минута\n" +
        "1.5 Международные звонки (СНГ) - 25.00 руб/минута\n" +
        "Интервал тарификации: посекундный."
      );
    };

    // Live Manual Edit fields for fine-grain tuning

    const handleSelectEditOperator = (opId: string) => {
      setEditOpId(opId);
      const selected = tariffs.find(t => t.id === opId);
      if (selected) {
        setEditRates({ ...selected.rates });
      }
    };

    const handleSaveManualTariffChange = (e: React.FormEvent) => {
      e.preventDefault();
      setTariffs(prev => prev.map(op => {
        if (op.id === editOpId) {
          return {
            ...op,
            updatedAt: 'Минуту назад (Ручные правки)',
            rates: { ...editRates }
          };
        }
        return op;
      }));
      showNoti('success', `Данные тарифов оператора ${tariffs.find(t => t.id === editOpId)?.name} сохранены!`);
    };



    const handleExcludeDispute = (id: string) => {
      setDisputes(prev => prev.filter(d => d.id !== id));
      showNoti('info', 'Претензия удалена из временного списка аудита.');
    };

    const registerTariffAnomaly = (cause: string, description: string, risk: 'critical' | 'high' | 'warning') => {
      const newAnom = {
        id: 'anom_gen_' + Date.now(),
        time: getServerNow().toISOString().replace('T', ' ').slice(0, 16),
        riskLevel: risk,
        cause: cause,
        description: description,
        recommendation: 'Направить официальную претензию в биллинг и снизить приоритет транка в FreePBX.',
        dismissed: false
      };
      setAnomalies(prev => [newAnom, ...prev]);
      showNoti('success', `Финансовая аномалия "${cause}" успешно зарегистрирована и отправлена в Telegram!`);
    };

    // Calculate billing projections based on current routing optimization state
    const costProjectionWithCurrent = 114380; // Roubles / Month
    const costProjectionWithOptimized = 68780; // Roubles / Month
    const estimatedSavings = costProjectionWithCurrent - costProjectionWithOptimized;

    const isCurrentlySuboptimal = outboundRoutes.some(r => r.status !== 'optimal');

    return (
      <div className="space-y-8 animate-fade-in">
        
        {/* TOP ALERT HEADER ON SAVINGS POTENTIAL */}
        <div className={`p-5 rounded-3xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
          isCurrentlySuboptimal
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
            : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
        }`}>
          <div className="flex gap-3">
            <span className={`p-2.5 rounded-2xl h-fit ${isCurrentlySuboptimal ? 'bg-amber-500 text-white animate-pulse' : 'bg-emerald-500 text-white'}`}>
              <Percent className="h-5 w-5" />
            </span>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                Умный анализатор тарифов LCR (Least Cost Routing)
                {isCurrentlySuboptimal ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 animate-bounce">
                    Обнаружены неоптимальные маршруты
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full">
                    Вся маршрутизация оптимизирована
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
                Анализатор автоматически загружает актуальные цены операторов из договоров, Excel/PDF и напрямую из интернета, 
                сопоставляет их с правилами Asterisk Dialplan (исходящие маршруты) и в реальном времени прогнозирует расходы, а также 
                контролирует баланс и передает данные биллинга в детектор аномалий при завышении тарифов операторами.
              </p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-center min-w-[170px]">
            <div className="text-[10px] text-slate-400 font-bold block">Прогноз экономии в месяц</div>
            <div className={`text-lg font-black font-mono mt-0.5 ${isCurrentlySuboptimal ? 'text-amber-500' : 'text-emerald-500'}`}>
              {isCurrentlySuboptimal ? `~ ${estimatedSavings.toLocaleString()} ₽` : 'Все под контролем!'}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5">
              {isCurrentlySuboptimal ? 'Требуется перестроить приоритеты' : 'Экономия 45,600 ₽ уже достигнута'}
            </div>
          </div>
        </div>

        {/* SECTION 1: TARIFF COMPARATIVE GRID */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-blue-500" />
              1. Сводная матрица тарифов операторов связи (за минуту, посекундно, в ₽)
            </h3>
            <span className="text-[10px] text-slate-400">Зеленым выделен самый выгодный провайдер по направлению</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-850 rounded-2xl bg-white dark:bg-[#1a2332]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-550 dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold">
                  <th className="p-4 text-slate-900 dark:text-white">Направление звонка / Код дестинации</th>
                  {tariffs.map(op => (
                    <th key={op.id} className="p-4 border-l border-slate-100 dark:border-slate-800 text-center">
                      <div className="font-extrabold text-slate-900 dark:text-white">{op.name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5 font-mono">Обновлен: {op.updatedAt}</div>
                      <div className="text-[8px] text-indigo-400 mt-0.5 flex items-center justify-center gap-1 font-sans">
                        <span>{op.sourceType === 'site' ? '🌐 Сайт' : op.sourceType === 'excel' ? '📈 Excel' : '🗎 Договор PDF'}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {/* MOBILE */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex flex-col">
                    <span>Мобильные РФ (89xx...)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Сотовые сети Beeline, MTS, Megafon, Tele2</span>
                  </td>
                  {tariffs.map(op => {
                    const isCheapest = op.rates.mobile === cheapestMobile.rate;
                    return (
                      <td key={op.id} className={`p-2.5 text-center font-mono border-l border-slate-100 dark:border-slate-800 ${
                        isCheapest ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black' : ''
                      }`}>
                        <div>{op.rates.mobile.toFixed(2)} ₽</div>
                        {isCheapest && <span className="text-[8px] tracking-tight block mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold">LCR ЭТАЛОН 🟢</span>}
                      </td>
                    );
                  })}
                </tr>

                {/* FIXED LOCAL */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex flex-col">
                    <span>Городские Москва/СПб (8495, 8499, 8812...)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Столичные фиксированные пулы связей</span>
                  </td>
                  {tariffs.map(op => {
                    const isCheapest = op.rates.fixedLocal === cheapestFixed.rate;
                    return (
                      <td key={op.id} className={`p-2.5 text-center font-mono border-l border-slate-100 dark:border-slate-800 ${
                        isCheapest ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black' : ''
                      }`}>
                        <div>{op.rates.fixedLocal.toFixed(2)} ₽</div>
                        {isCheapest && <span className="text-[8px] tracking-tight block mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold">LCR ЭТАЛОН 🟢</span>}
                      </td>
                    );
                  })}
                </tr>

                {/* CRIMEA */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex flex-col">
                    <span>Республика Крым (8978, +7365...)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Крымские операторы WIN mobile, Волна, Крымтелеком</span>
                  </td>
                  {tariffs.map(op => {
                    const isCheapest = op.rates.crimea === cheapestCrimea.rate;
                    return (
                      <td key={op.id} className={`p-2.5 text-center font-mono border-l border-slate-100 dark:border-slate-800 ${
                        isCheapest ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black' : ''
                      }`}>
                        <div>{op.rates.crimea.toFixed(2)} ₽</div>
                        {isCheapest && <span className="text-[8px] tracking-tight block mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold">LCR ЭТАЛОН 🟢</span>}
                      </td>
                    );
                  })}
                </tr>

                {/* REGIONS */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex flex-col">
                    <span>Региональные номера РФ</span>
                    <span className="text-[10px] text-slate-400 font-normal">Вызовы на городские номера других областей России</span>
                  </td>
                  {tariffs.map(op => {
                    const isCheapest = op.rates.regions === cheapestRegions.rate;
                    return (
                      <td key={op.id} className={`p-2.5 text-center font-mono border-l border-slate-100 dark:border-slate-800 ${
                        isCheapest ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black' : ''
                      }`}>
                        <div>{op.rates.regions.toFixed(2)} ₽</div>
                        {isCheapest && <span className="text-[8px] tracking-tight block mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold">LCR ЭТАЛОН 🟢</span>}
                      </td>
                    );
                  })}
                </tr>

                {/* LONG DISTANCE */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex flex-col">
                    <span>Межгород (Магистральные звонки)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Междугородние комммутационные линии</span>
                  </td>
                  {tariffs.map(op => {
                    const isCheapest = op.rates.longDistance === cheapestLong.rate;
                    return (
                      <td key={op.id} className={`p-2.5 text-center font-mono border-l border-slate-100 dark:border-slate-800 ${
                        isCheapest ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black' : ''
                      }`}>
                        <div>{op.rates.longDistance.toFixed(2)} ₽</div>
                        {isCheapest && <span className="text-[8px] tracking-tight block mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold">LCR ЭТАЛОН 🟢</span>}
                      </td>
                    );
                  })}
                </tr>

                {/* INTERNATIONAL */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex flex-col">
                    <span>Международные вызовы (СНГ и Мир)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Казахстан, Беларусь, Великобритания и др. номера (+...)</span>
                  </td>
                  {tariffs.map(op => {
                    const isCheapest = op.rates.international === cheapestIntl.rate;
                    return (
                      <td key={op.id} className={`p-2.5 text-center font-mono border-l border-slate-100 dark:border-slate-800 ${
                        isCheapest ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black' : ''
                      }`}>
                        <div>{op.rates.international.toFixed(2)} ₽</div>
                        {isCheapest && <span className="text-[8px] tracking-tight block mt-0.5 text-emerald-600 dark:text-emerald-400 font-bold">LCR ЭТАЛОН 🟢</span>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* TARIFF MANUAL REFINEMENT DRAWER / ACCORDION */}
        <div className="bg-slate-50 dark:bg-[#1a2332] p-4 rounded-3xl border border-slate-200/40 dark:border-[#334155]/60">
          <details className="group">
            <summary className="flex items-center justify-between font-extrabold text-xs text-slate-700 dark:text-slate-350 cursor-pointer list-none">
              <span className="flex items-center gap-1.5 select-none">
                <Settings className="h-4 w-4 text-slate-500 group-open:rotate-45 transition-transform" />
                Редактировать значения тарифов вручную
              </span>
              <span className="text-blue-500 text-[10px] uppercase font-bold tracking-wider group-open:hidden">Развернуть панель редактирования</span>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider hidden group-open:block">Свернуть панель</span>
            </summary>
            
            <form onSubmit={handleSaveManualTariffChange} className="mt-4 pt-4 border-t border-slate-200 dark:border-[#2b394f] text-xs grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-slate-400 font-bold">1. Выберите оператора</label>
                <select 
                  value={editOpId}
                  onChange={(e) => handleSelectEditOperator(e.target.value)}
                  className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold"
                >
                  <option value="mango">Mango Office</option>
                  <option value="zadarma">Zadarma</option>
                  <option value="mtt">МТТ (Телеком)</option>
                  <option value="beeline">Билайн Бизнес CRM</option>
                </select>
                <p className="text-[10px] text-slate-400 italic">Тарифы меняются локально для калькулятора тарифов и FreePBX симулятора маршрутов.</p>
              </div>

              <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Моб РФ (₽/мин)</label>
                  <input 
                    type="number" step="0.01" 
                    value={editRates.mobile} 
                    onChange={(e) => setEditRates({...editRates, mobile: Number(e.target.value)})}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Гор Москва (₽/мин)</label>
                  <input 
                    type="number" step="0.01" 
                    value={editRates.fixedLocal} 
                    onChange={(e) => setEditRates({...editRates, fixedLocal: Number(e.target.value)})}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Крым РФ (₽/мин)</label>
                  <input 
                    type="number" step="0.01" 
                    value={editRates.crimea} 
                    onChange={(e) => setEditRates({...editRates, crimea: Number(e.target.value)})}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Регионы (₽/мин)</label>
                  <input 
                    type="number" step="0.01" 
                    value={editRates.regions} 
                    onChange={(e) => setEditRates({...editRates, regions: Number(e.target.value)})}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Межгород (₽/мин)</label>
                  <input 
                    type="number" step="0.01" 
                    value={editRates.longDistance} 
                    onChange={(e) => setEditRates({...editRates, longDistance: Number(e.target.value)})}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Международ. (₽/мин)</label>
                  <input 
                    type="number" step="0.01" 
                    value={editRates.international} 
                    onChange={(e) => setEditRates({...editRates, international: Number(e.target.value)})}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all cursor-pointer"
                >
                  Обновить значения матрицы
                </button>
              </div>
            </form>
          </details>
        </div>


        {/* SECTION 2: WEB LINK AND FILE / CONTRACT PARSER */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* URL Parsery Zone */}
          <div className="bg-[#f8fafc] dark:bg-[#131b26]/40 p-5 rounded-3xl border border-slate-200/50 dark:border-slate-800/80 space-y-4">
            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-emerald-500" />
              Импорт тарифов из сети (Умный веб-парсер сайтов)
            </h4>
            <p className="text-[11px] text-slate-400">
              Введите адрес тарифного плана на официальном веб-ресурсе оператора связи. 
              Нейросетевая модель разберет верстку страницы, извлечет XLS-ссылки и обновит тарификаторы.
            </p>

            <div className="space-y-3 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Оператор для импорта</label>
                  <select 
                    value={selectedOperatorForUrl}
                    onChange={(e) => handleOperatorChangeForUrl(e.target.value)}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-2 py-1.5 font-bold text-slate-900 dark:text-white"
                  >
                    <option value="mango">Mango Office</option>
                    <option value="zadarma">Zadarma</option>
                    <option value="mtt">МТТ (Телеком)</option>
                    <option value="beeline">Билайн Бизнес CRM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Использовать шаблон URL</label>
                  <button
                    type="button"
                    onClick={() => handleOperatorChangeForUrl(selectedOperatorForUrl)}
                    className="w-full text-[11px] py-1.5 bg-slate-200 dark:bg-[#202c3e] text-slate-700 dark:text-slate-300 rounded-xl font-bold border border-slate-300/40 hover:bg-slate-300 cursor-pointer"
                  >
                    Заполнить адрес
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">Адрес веб-страницы тарифов</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlToParse}
                    onChange={(e) => setUrlToParse(e.target.value)}
                    placeholder="https://operator.ru/corporate-tariffs-v4"
                    className="flex-1 bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={isUrlParsing}
                    onClick={handleUrlParseTrigger}
                    className={`px-3 py-1.5 rounded-xl font-bold text-white flex items-center gap-1 cursor-pointer transition-all ${
                      isUrlParsing ? 'bg-indigo-400' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {isUrlParsing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    <span>{isUrlParsing ? 'Парсинг...' : 'Импорт'}</span>
                  </button>
                </div>
              </div>

              {parserLogs.length > 0 && (
                <div className="bg-[#111827] text-emerald-400 p-3 rounded-2xl font-mono text-[9px] space-y-1 max-h-[140px] overflow-y-auto border border-emerald-800/40">
                  <div className="text-slate-400 text-[8px] uppercase tracking-wider font-sans font-bold pb-1 border-b border-slate-800 mb-1 flex justify-between">
                    <span>Терминал парсера</span>
                    <span className="text-emerald-400 animate-pulse">RUNNING ●</span>
                  </div>
                  {parserLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document / Raw Contract Text OCR upload Zone */}
          <div className="bg-[#f8fafc] dark:bg-[#131b26]/40 p-5 rounded-3xl border border-slate-200/50 dark:border-slate-800/80 space-y-4">
            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-purple-500" />
              Распознавание договоров (PDF / Excel / Текст)
            </h4>
            <p className="text-[11px] text-slate-400">
              Загрузите PDF файл соглашения об уровне обслуживания, выгруженную XLS страницу мобильных тарифов от оператора или просто скопируйте текст условий в поле ниже.
            </p>

            <div className="space-y-4 text-xs pt-1">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-slate-400">Спецификация провайдера:</span>
                <select 
                  value={selectedFileOperator}
                  onChange={(e) => setSelectedFileOperator(e.target.value)}
                  className="bg-white dark:bg-[#1d2736] border border-slate-200 text-[11px] font-bold dark:border-[#384a63] rounded-lg px-2 py-0.5 text-slate-900 dark:text-white"
                >
                  <option value="mango">Mango Office</option>
                  <option value="zadarma">Zadarma</option>
                  <option value="mtt">МТТ (Телеком)</option>
                  <option value="beeline">Билайн Бизнес CRM</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="border border-dashed border-slate-300 dark:border-[#384a63] bg-white dark:bg-[#1a2332]/55 rounded-2xl p-4 text-center cursor-pointer hover:bg-slate-50 relative flex flex-col justify-center items-center group transition-all">
                  <Upload className="h-5 w-5 text-purple-500 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] block font-bold text-slate-700 dark:text-slate-305">
                    {uploadedTariffFile ? 'Файл выбран' : 'Выбрать XLSX/PDF'}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5 max-w-full truncate">
                    {uploadedTariffFile || 'Размер файла ≤ 15MB'}
                  </span>
                  <input
                    type="file"
                    accept=".xls,.xlsx,.pdf,.doc,.docx,.csv"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadedTariffFile(e.target.files[0].name);
                      }
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <textarea
                    rows={3}
                    placeholder="Пример: Моб РФ = 1.05 ₽/мин..."
                    value={rawTextTariff}
                    onChange={(e) => setRawTextTariff(e.target.value)}
                    className="w-full flex-1 bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-2xl p-2 font-mono text-[10px] leading-relaxed resize-none focus:outline-none text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={insertSampleContractText}
                    className="text-[9px] text-indigo-505 font-bold hover:underline text-left cursor-pointer"
                  >
                    Вставить шаблон договора
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={isConvertingFile}
                onClick={handleFileParseTrigger}
                className={`w-full py-2 cursor-pointer rounded-xl text-white font-extrabold flex items-center justify-center gap-2 transition-all ${
                  isConvertingFile ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isConvertingFile ? (
                  <>
                    <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                    <span>OCR Распознавание тарифной сетки договора...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4.5 w-4.5" />
                    <span>Синхронизировать тариф из документа</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>


        {/* SECTION 3: OUTBOUND ROUTES priority alignments (CONSTRUCTOR DIALPLAN INTEGRATION) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 font-sans">
                <Link2 className="h-4.5 w-4.5 text-orange-500" />
                2. Интеграция с Конструктором Исходящих Маршрутов FreePBX (Dialplan LCR)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                Используя вычисленные эталонные тарифы, биллинг автоматически сопоставляет шаблоны набора 
                с оптимальным внешним SIP-транком.
              </p>
            </div>

            <button
              type="button"
              disabled={isDialplanSyncing}
              onClick={handleDialplanAlignment}
              className={`px-4 py-2 cursor-pointer text-xs font-black rounded-xl text-white flex items-center gap-1.5 shadow-sm transition-all ${
                isDialplanSyncing ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isDialplanSyncing ? (
                <>
                  <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                  <span>Перенаправление транков Asterisk...</span>
                </>
              ) : (
                <>
                  <CheckSquare className="h-4.5 w-4.5" />
                  <span>Внедрить LCR правила в Dialplan</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-blue-50/50 dark:bg-slate-900/50 border border-blue-200/50 dark:border-slate-800 p-4 rounded-3xl grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-sans">
            <div className="md:col-span-3 space-y-1 text-slate-700 dark:text-slate-300">
              <span className="font-extrabold text-blue-600 dark:text-blue-400 text-[11px] block">КАК РАБОТАЕТ ВЫРАВНИВАНИЕ МАРШРУТОВ:</span>
              <p className="leading-relaxed">
                При нажатии на кнопку анализатор формирует контекст исходящей связи в FreePBX Dialplan. 
                Он проверяет, какой транк назначен первым для каждого правила. Например, если направление Межгород 
                рутинга шло через дорогого провайдера, правило мгновенно перенастраивается на дешёвого эталонного оператора, 
                повышая приоритет его SIP-транка.
              </p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-3 md:pt-0 md:pl-4 space-y-2 flex flex-col justify-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Текущий Свод правил:</div>
              <div className="space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>Оптимальных:</span>
                  <span className="font-bold text-emerald-500">
                    {outboundRoutes.filter(r => r.status === 'optimal').length} / {outboundRoutes.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Неоптимальных:</span>
                  <span className="font-bold text-red-500">
                    {outboundRoutes.filter(r => r.status !== 'optimal').length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#1a2332]">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-550 dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold">
                  <th className="p-3 text-slate-900 dark:text-white">Исходящий маршрут FreePBX</th>
                  <th className="p-3 font-mono text-slate-900 dark:text-white">Dial Шаблон в Asterisk</th>
                  <th className="p-3 text-slate-900 dark:text-white">Текущий SIP-Транк (1-й приоритет)</th>
                  <th className="p-3 text-slate-900 dark:text-white">Рекомендуемый LCR-Транк</th>
                  <th className="p-3 text-right text-slate-900 dark:text-white">Расхождение цены</th>
                  <th className="p-3 text-center text-slate-900 dark:text-white">Статус правила</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {outboundRoutes.map(route => {
                  const directionKey = 
                    route.id === 'route-mob' ? 'mobile' :
                    route.id === 'route-local' ? 'fixedLocal' :
                    route.id === 'route-crimea' ? 'crimea' :
                    route.id === 'route-regions' ? 'regions' : 'international';

                  const curTrunkLower = route.primaryTrunk.toLowerCase().includes('mango') ? 'mango' :
                                       route.primaryTrunk.toLowerCase().includes('zadarma') ? 'zadarma' :
                                       route.primaryTrunk.toLowerCase().includes('beeline') ? 'beeline' : 'mtt';
                  
                  const activeOpObj = tariffs.find(t => t.id === curTrunkLower);
                  const activeRate = activeOpObj ? activeOpObj.rates[directionKey] : 0;
                  
                  // Cheapest finding
                  let cheapestOpName = 'Beeline';
                  let cheapestRate = 1;
                  tariffs.forEach(op => {
                    const r = op.rates[directionKey];
                    if (r < cheapestRate || cheapestRate === 1) {
                      cheapestRate = r;
                      cheapestOpName = op.name;
                    }
                  });

                  if (cheapestOpName.includes('МТТ')) cheapestOpName = 'MTT';
                  else if (cheapestOpName.includes('Билайн') || cheapestOpName.includes('Beeline')) cheapestOpName = 'Beeline';
                  else if (cheapestOpName.includes('Zadarma')) cheapestOpName = 'Zadarma';
                  else cheapestOpName = 'Mango';

                  const dRate = activeRate - cheapestRate;

                  return (
                    <tr key={route.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                      <td className="p-3 font-bold">
                        <span className="text-slate-900 dark:text-white block">{route.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">Dialplan rule ID: {route.id}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-500 max-w-[150px] truncate" title={route.pattern}>
                        {route.pattern}
                      </td>
                      <td className="p-3 font-semibold">
                        <span className="text-slate-800 dark:text-slate-200">{route.primaryTrunk}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">{activeRate.toFixed(2)} ₽/мин</span>
                      </td>
                      <td className="p-3 font-extrabold text-emerald-500">
                        <span>{cheapestOpName}</span>
                        <span className="text-[10px] text-slate-400 block font-mono font-normal">Честная ставка: {cheapestRate.toFixed(2)} ₽/мин</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {dRate > 0 ? (
                          <span className="text-red-500 font-black font-mono flex flex-col items-end">
                            <span>+{dRate.toFixed(2)} ₽/мин</span>
                            <span className="text-[8px] text-slate-450 font-normal">Цена завышена {!route.primaryTrunk.includes('MTT') ? 'на 12%' : 'на 300%!'}</span>
                          </span>
                        ) : (
                          <span className="text-emerald-500 font-bold">0.00 ₽ (Оптимально)</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight ${
                          route.status === 'optimal'
                            ? 'bg-emerald-100 text-emerald-800'
                            : route.status === 'suboptimal'
                            ? 'bg-yellow-105 text-yellow-850 animate-pulse'
                            : route.status === 'warning'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-200 text-red-900 font-extrabold animate-bounce'
                        }`}>
                          {route.status === 'optimal' ? 'OPTIMAL' : route.status === 'suboptimal' ? 'SUBOPTIMAL' : route.status === 'warning' ? 'HIGH SPEND' : 'CRITICAL LEAK'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 4: RECONCILIATION CORRELATION & ANOMALY INJECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldAlert className="h-4.5 w-4.5 text-red-500" />
              3. Обнаруженные Биллинг-конфликты (Связь с Детектором Аномалий)
            </h3>
            <span className="text-[10px] hover:underline text-blue-500 flex items-center gap-1 cursor-pointer">
              <Info className="h-3 w-3" />
              Интеграция с СДР-анализом потерь активна
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
            {disputes.map(disp => (
              <div key={disp.id} className="bg-[#fffdfa] dark:bg-[#1a1e29] border border-amber-200 dark:border-amber-900/60 p-5 rounded-3xl flex flex-col justify-between space-y-4 relative shadow-2xs">
                
                {/* Ribbon Tag */}
                <span className="absolute top-4 right-4 bg-red-100/80 dark:bg-red-950/40 text-red-800 dark:text-red-300 font-extrabold text-[9px] uppercase px-2 py-0.5 rounded-full">
                  Несоответствие биллинга РФ
                </span>

                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="font-extrabold text-slate-800 dark:text-white text-sm">{disp.operator}</span>
                    <span className="text-slate-400 font-semibold font-mono">[{disp.direction}]</span>
                  </div>
                  
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    {disp.desc} При выборочном аудите {disp.callsCount} вызовов обнаружился перекос расчетных списаний.
                  </p>

                  <div className="grid grid-cols-3 gap-2 bg-amber-500/5 dark:bg-amber-550/5 p-2.5 rounded-xl border border-amber-300/20 font-mono text-[11px]">
                    <div>
                      <span className="text-[9px] text-slate-400 font-sans block mb-0.5">В договоре:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-350">{disp.tariffRate.toFixed(2)} ₽/мин</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-sans block mb-0.5">По факту:</span>
                      <span className="font-bold text-red-500">{disp.actualBilledRate.toFixed(2)} ₽/мин</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-sans block mb-0.5">Перерасход:</span>
                      <span className="font-extrabold text-red-500">+{disp.overpay.toLocaleString()} ₽</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => registerTariffAnomaly(
                      `Верификация тарифа ${disp.operator} - ${disp.direction}`,
                      `Биллинг ${disp.operator} списывает ${disp.actualBilledRate} ₽/мин вместо договорных ${disp.tariffRate} ₽/мин. Направление: ${disp.direction}. Оценочный ущерб: ${disp.overpay} ₽.`,
                      disp.overpay > 10000 ? 'critical' : 'high'
                    )}
                    className="flex-1 min-w-[130px] px-3 py-1.5 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300 rounded-xl hover:bg-red-100/60 font-black border border-red-200 dark:border-red-800 transition-all text-center cursor-pointer"
                  >
                    Передать в Детектор Аномалий ➔
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      showNoti('success', `Документ претензии к "${disp.operator}" подготовлен и отправлен юристам!`);
                      handleExcludeDispute(disp.id);
                    }}
                    className="px-3 py-1.5 bg-white dark:bg-[#1a2332] border border-slate-250 dark:border-[#334155] text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-100 transition-all font-bold cursor-pointer"
                  >
                    Оформить претензию (Doc)
                  </button>
                </div>
              </div>
            ))}

            {disputes.length === 0 && (
              <div className="col-span-2 border border-dashed border-emerald-300 p-8 rounded-3xl bg-emerald-500/5 text-center text-xs text-slate-500 space-y-2">
                <CheckCircle className="h-7 w-7 text-emerald-500 mx-auto" />
                <div className="font-bold text-slate-800 dark:text-white">Все конфликты урегулированы или переданы аналитикам!</div>
                <p>Балансы совпадают с математической точностью до сотых долей копейки.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // TAB 10: SYSTEM SETTINGS AND CHANNELS (ALERT CONFIGS & MANUAL ADD FORMS)
  function renderSettingsTab() {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Create custom operator manually form */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Добавить новый баланс провайдера вручную</h3>
            <form onSubmit={handleAddCustomOp} className="space-y-4 bg-slate-50 dark:bg-[#1a2332] p-4 rounded-3xl border border-slate-100 dark:border-[#334155]/80 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 font-bold mb-1">Название оператора связи</label>
                <input
                  type="text"
                  placeholder="Манго Офис Крым, Zadarma_Moscow и т.д."
                  value={newOpName}
                  onChange={(e) => setNewOpName(e.target.value)}
                  className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 font-bold mb-1">Имя транка (в FreePBX / Asterisk)</label>
                  <input
                    type="text"
                    placeholder="TRUNK_MANGO_LOCAL"
                    value={newOpTrunk}
                    onChange={(e) => setNewOpTrunk(e.target.value)}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 font-bold mb-1">Начальный баланс (₽)</label>
                  <input
                    type="number"
                    placeholder="12500"
                    value={newOpBalance}
                    onChange={(e) => setNewOpBalance(e.target.value)}
                    className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 font-bold mb-1">Средний расход в день для прогноза (₽ / день) - Необязательно</label>
                <input
                  type="number"
                  placeholder="250"
                  value={newOpAvg}
                  onChange={(e) => setNewOpAvg(e.target.value)}
                  className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 rounded-xl cursor-pointer transition-all"
              >
                Сохранить новый баланс
              </button>
            </form>
          </div>

          {/* Alerts notification parameters (Telegram and Webhooks config) */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Настройка каналов информирования и порогов тревог</h3>
            
            <div className="bg-slate-50 dark:bg-[#1a2332] p-4 rounded-3xl border border-slate-100 dark:border-[#334155]/80 text-xs space-y-4">
              <div>
                <label className="block text-[11px] text-slate-400 font-bold mb-1.5">Критический порог баланса всех транков (₽)</label>
                <input
                  type="number"
                  value={minBalanceThreshold}
                  onChange={(e) => setMinBalanceThreshold(e.target.value)}
                  className="w-full bg-white dark:bg-[#1d2736] border border-slate-250 dark:border-[#384a63] rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div className="h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Telegram bot channel */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold flex items-center gap-1.5">
                    Telegram бот уведомлений
                  </span>
                  <input
                    type="checkbox"
                    checked={tgNotificationEnabled}
                    onChange={(e) => setTgNotificationEnabled(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                </div>
                {tgNotificationEnabled && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Telegram Bot Token"
                      value={tgBotToken}
                      onChange={(e) => setTgBotToken(e.target.value)}
                      className="w-full bg-white dark:bg-[#1d2736] border border-slate-200 dark:border-[#384a63] rounded-xl px-3 py-1.5 text-slate-900 dark:text-white font-mono text-[11px]"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Telegram Chat ID"
                        value={tgChatId}
                        onChange={(e) => setTgChatId(e.target.value)}
                        className="flex-1 bg-white dark:bg-[#1d2736] border border-slate-200 dark:border-[#384a63] rounded-xl px-3 py-1.5 text-slate-900 dark:text-white font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleTestNotification('tg')}
                        className="px-3 bg-slate-200 dark:bg-[#2d3b4f] text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-300 font-bold"
                      >
                        Тест
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Webhook endpoint notifier */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold">Внешние Webhooks (JSON POST)</span>
                  <button 
                    type="button"
                    onClick={() => handleTestNotification('webhook')}
                    className="text-[10px] text-blue-500 font-bold hover:underline"
                  >
                    Тест Вебхука
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="https://yourserver.ru/balance/callback"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full bg-white dark:bg-[#1d2736] border border-slate-200 dark:border-[#384a63] rounded-xl px-3 py-1.5 text-slate-900 dark:text-white font-mono text-[11px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // INTERACTIVE MODAL: TOP UP SYSTEM
  function renderTopUpModal() {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
          <button 
            type="button"
            onClick={() => setIsTopUpOpen(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          
          <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Ручное пополнение баланса транка</h3>
          
          <form onSubmit={handleTopUpSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-400 font-bold mb-1">Выберите оператора</label>
              <select
                value={topUpOp}
                onChange={(e) => setTopUpOp(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#253246] border border-slate-200 dark:border-[#384a63] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
              >
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name} ({op.trunkName})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 font-bold mb-1">Сумма платежа (₽)</label>
              <input
                type="number"
                placeholder="1000"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#253246] border border-slate-200 dark:border-[#384a63] rounded-xl px-3 py-2 text-xs font-black text-slate-900 dark:text-white font-mono"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl cursor-pointer transition-all"
            >
              Подтвердить зачисление
            </button>
          </form>
        </div>
      </div>
    );
  }

  // INTERACTIVE MODAL: IMPORTS PARSING
  function renderImportModal() {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-6 max-w-lg w-full shadow-2xl relative">
          <button 
            type="button"
            onClick={() => setIsImportOpen(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          
          <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2">Импорт файлов выписки оператора (CSV/XLSX)</h3>
          <p className="text-xs text-slate-400 mb-4">Вставьте текстовое содержимое выписки с разделителями для автоматического парсинга баланса.</p>

          <form onSubmit={handleImportSubmit} className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImportType('CSV')}
                className={`flex-1 py-2 text-xs font-extrabold rounded-xl ${importType === 'CSV' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-[#253246] text-slate-600 dark:text-slate-300'}`}
              >
                Формат CSV
              </button>
              <button
                type="button"
                onClick={() => setImportType('XLSX')}
                className={`flex-1 py-2 text-xs font-extrabold rounded-xl ${importType === 'XLSX' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-[#253246] text-slate-600 dark:text-slate-300'}`}
              >
                Формат XLSX (копии ячеек)
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 font-bold mb-1">Связать с целевым транком</label>
              <select
                value={mappedTrunk}
                onChange={(e) => setMappedTrunk(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#253246] border border-slate-200 dark:border-[#384a63] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
              >
                {operators.map(op => (
                  <option key={op.id} value={op.trunkName}>{op.name} ({op.trunkName})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 font-bold mb-1">Контент файла выписки</label>
              <textarea
                placeholder={`Например:\nTRUNK_MTT_OUT; 15420.50\nили\nДата платежа, Сальдо\n2026-06-22, 2450.00`}
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-32 bg-slate-50 dark:bg-[#253246] border border-slate-200 dark:border-[#384a63] rounded-xl p-3 text-xs text-slate-900 dark:text-white font-mono"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-xl cursor-pointer transition-all"
            >
              Запустить импорт и обновить баланс
            </button>
          </form>
        </div>
      </div>
    );
  }

  // INTERACTIVE DRILL DOWN MODAL: EXTENSION SPECS (Where/Who/Mins/Trunk details!)
  function renderDrillDownModal() {
    const extObj = extRatings.find(e => e.ext === selectedExt);
    const callsList = DRILL_DOWN_CALLS[selectedExt || ''] || [];

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative">
          <button 
            type="button"
            onClick={() => setSelectedExt(null)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-extrabold flex items-center justify-center text-sm">
              {extObj?.avatar}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Детализированные звонки: EXT {extObj?.ext}</h3>
              <p className="text-[11px] text-slate-400">{extObj?.name} • Июнь 2026</p>
            </div>

            <div className="ml-auto text-right">
              <span className="text-xs text-slate-400">Общие расходы:</span>
              <div className="text-base font-black text-rose-500 font-mono">{extObj?.spend.toLocaleString('ru-RU')} ₽</div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Лог наиболее ресурсоемких соединений:</h4>
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {callsList.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-6">
                  Для данного номера нет зарегистрированных дорогих вызовов.
                </div>
              ) : (
                <div className="space-y-2">
                  {callsList.map(call => (
                    <div key={call.id} className="p-3 bg-slate-50 dark:bg-[#1a2332] rounded-2xl border border-slate-100 dark:border-[#334155] flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white">{call.number}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{call.destination} • {call.date}</div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-mono font-extrabold text-red-500">{call.cost.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{call.duration} мин • {call.trunk}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedExt(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-[#2d3a4d] hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Закрыть детализацию
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
