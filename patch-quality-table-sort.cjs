const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/modules/monitoring/tabs/monitoring/QualityTab.tsx');

if (!fs.existsSync(filePath)) {
  console.error('Не найден файл:', filePath);
  process.exit(1);
}

let code = fs.readFileSync(filePath, 'utf8');

const backupPath = filePath + '.bak-quality-sort';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, code);
  console.log('Backup создан:', backupPath);
}

if (!code.includes('type QualitySortKey')) {
  code = code.replace(
`interface TelemetryAlert {
  id: string;
  time: string;
  ext: string;
  name: string;
  ip: string;
  type: string;
  value: string;
  severity: 'Предупреждение' | 'Критично';
}`,
`interface TelemetryAlert {
  id: string;
  time: string;
  ext: string;
  name: string;
  ip: string;
  type: string;
  value: string;
  severity: 'Предупреждение' | 'Критично';
}

type QualitySortKey = 'ext' | 'name' | 'ip' | 'type' | 'userAgent' | 'latency' | 'jitter' | 'rtpLoss' | 'mos' | 'status';
type QualitySortDirection = 'asc' | 'desc';`
  );
}

if (!code.includes('const [qualitySort, setQualitySort]')) {
  code = code.replace(
`  const [deviceListTab, setDeviceListTab] = useState<'trunks' | 'devices'>('trunks');`,
`  const [deviceListTab, setDeviceListTab] = useState<'trunks' | 'devices'>('trunks');
  const [qualitySort, setQualitySort] = useState<{ key: QualitySortKey; direction: QualitySortDirection }>({
    key: 'ext',
    direction: 'asc'
  });`
  );
}

code = code.replace(
`  const visibleQualityDevices = deviceListTab === 'trunks' ? filteredTrunks : filteredExtensions;`,
`  const qualitySortCollator = useMemo(() => new Intl.Collator('ru-RU', {
    numeric: true,
    sensitivity: 'base'
  }), []);

  const getQualityStatusRank = (status: QualityDevice['status']) => {
    if (status === 'Отлично') return 1;
    if (status === 'Хорошо') return 2;
    if (status === 'Предупреждение') return 3;
    if (status === 'Критично') return 4;
    if (status === 'Offline') return 5;
    return 99;
  };

  const getQualitySortValue = (device: QualityDevice, key: QualitySortKey): string | number => {
    if (key === 'status') return getQualityStatusRank(device.status);
    const value = device[key];
    if (typeof value === 'number') return value;
    return String(value ?? '').trim();
  };

  const handleQualitySort = (key: QualitySortKey) => {
    setQualitySort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderQualitySortableHeader = (key: QualitySortKey, label: string, align: 'left' | 'right' = 'left') => {
    const isActive = qualitySort.key === key;
    const arrow = isActive ? (qualitySort.direction === 'asc' ? '▲' : '▼') : '↕';

    return (
      <th className={\`px-4 py-3 \${align === 'right' ? 'text-right' : ''}\`}>
        <button
          type="button"
          onClick={() => handleQualitySort(key)}
          className={\`group inline-flex items-center gap-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 \${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500'}\`}
          title={\`Сортировать: \${label}\`}
        >
          <span>{label}</span>
          <span className={\`text-[9px] leading-none \${isActive ? 'opacity-100' : 'opacity-35 group-hover:opacity-80'}\`}>
            {arrow}
          </span>
        </button>
      </th>
    );
  };

  const visibleQualityDevices = useMemo(() => {
    const source = deviceListTab === 'trunks' ? filteredTrunks : filteredExtensions;
    const sorted = [...source].sort((a, b) => {
      const aValue = getQualitySortValue(a, qualitySort.key);
      const bValue = getQualitySortValue(b, qualitySort.key);

      let result = 0;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        result = aValue - bValue;
      } else {
        result = qualitySortCollator.compare(String(aValue), String(bValue));
      }

      return qualitySort.direction === 'asc' ? result : -result;
    });

    return sorted;
  }, [deviceListTab, filteredTrunks, filteredExtensions, qualitySort, qualitySortCollator]);`
);

code = code.replace(
`                    <th className="px-4 py-3">EXT</th>
                    <th className="px-4 py-3">Устройство</th>
                    <th className="px-4 py-3">IP Адрес</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">User-Agent</th>
                    <th className="px-4 py-3">Задержка</th>
                    <th className="px-4 py-3">Джиттер</th>
                    <th className="px-4 py-3">Потери RTP</th>
                    <th className="px-4 py-3">MOS</th>
                    <th className="px-4 py-3">Статус</th>`,
`                    {renderQualitySortableHeader('ext', 'EXT')}
                    {renderQualitySortableHeader('name', 'Устройство')}
                    {renderQualitySortableHeader('ip', 'IP Адрес')}
                    {renderQualitySortableHeader('type', 'Тип')}
                    {renderQualitySortableHeader('userAgent', 'User-Agent')}
                    {renderQualitySortableHeader('latency', 'Задержка')}
                    {renderQualitySortableHeader('jitter', 'Джиттер')}
                    {renderQualitySortableHeader('rtpLoss', 'Потери RTP')}
                    {renderQualitySortableHeader('mos', 'MOS')}
                    {renderQualitySortableHeader('status', 'Статус')}`
);

fs.writeFileSync(filePath, code);

console.log('Готово: добавлена сортировка таблицы качества связи по клику на заголовки.');
