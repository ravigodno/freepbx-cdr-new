const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/modules/monitoring/tabs/monitoring/DevicesMapTab.tsx');

if (!fs.existsSync(filePath)) {
  console.error('Не найден файл:', filePath);
  process.exit(1);
}

let code = fs.readFileSync(filePath, 'utf8');

const backupPath = filePath + '.bak-devices-map-sort';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, code);
  console.log('Backup создан:', backupPath);
}

/**
 * 1. Добавляем типы сортировки.
 */
if (!code.includes('type DeviceSortKey')) {
  code = code.replace(
`interface DevicesMapTabProps {
  token: string;
}`,
`interface DevicesMapTabProps {
  token: string;
}

type DeviceSortKey = 'ext' | 'name' | 'tech' | 'ip' | 'equipment' | 'status' | 'ipChanges' | 'regCount';
type DeviceSortDirection = 'asc' | 'desc';`
  );
}

/**
 * 2. Добавляем state сортировки.
 */
if (!code.includes('const [deviceSort, setDeviceSort]')) {
  code = code.replace(
`  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);`,
`  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [deviceSort, setDeviceSort] = useState<{ key: DeviceSortKey; direction: DeviceSortDirection }>({
    key: 'ext',
    direction: 'asc'
  });
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);`
  );
}

/**
 * 3. После filteredDevices добавляем сортировку, collator и render заголовков.
 */
if (!code.includes('const sortedDevices = useMemo')) {
  code = code.replace(
`  }, [devices, selectedTech, selectedStatus, searchQuery]);

  // Selected device registration history filtered`,
`  }, [devices, selectedTech, selectedStatus, searchQuery]);

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
    if (key === 'equipment') return \`\${device.manufacturer || ''} \${device.model || ''} \${device.userAgent || ''}\`.trim();
    if (key === 'status') return getDeviceStatusRank(device.status);
    if (key === 'ip') return device.ip || '';
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
      <th className={\`p-3 \${align === 'right' ? 'text-right' : ''}\`}>
        <button
          type="button"
          onClick={() => handleDeviceSort(key)}
          className={\`group inline-flex items-center gap-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200 \${isActive ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400'}\`}
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

  // Selected device registration history filtered`
  );
}

/**
 * 4. Меняем заголовки таблицы на кликабельные.
 */
code = code.replace(
`                            <th className="p-3">EXT</th>
                            <th className="p-3">Имя</th>
                            <th className="p-3">Технология</th>
                            <th className="p-3">IP Адрес</th>
                            <th className="p-3">Оборудование</th>
                            <th className="p-3">Статус</th>
                            <th className="p-3 text-right">Смены IP</th>
                            <th className="p-3 text-right">Рег-ций</th>`,
`                            {renderDeviceSortableHeader('ext', 'EXT')}
                            {renderDeviceSortableHeader('name', 'Имя')}
                            {renderDeviceSortableHeader('tech', 'Технология')}
                            {renderDeviceSortableHeader('ip', 'IP Адрес')}
                            {renderDeviceSortableHeader('equipment', 'Оборудование')}
                            {renderDeviceSortableHeader('status', 'Статус')}
                            {renderDeviceSortableHeader('ipChanges', 'Смены IP', 'right')}
                            {renderDeviceSortableHeader('regCount', 'Рег-ций', 'right')}`
);

/**
 * 5. Таблица должна выводить sortedDevices вместо filteredDevices.
 */
code = code.replace(
`                          {filteredDevices.length === 0 ? (`,
`                          {sortedDevices.length === 0 ? (`
);

code = code.replace(
`                            filteredDevices.map(dev => (`,
`                            sortedDevices.map(dev => (`
);

/**
 * 6. Экспорт тоже делаем в текущем отсортированном порядке.
 */
code = code.replace(
`    const rows = filteredDevices.map(d => [`,
`    const rows = sortedDevices.map(d => [`
);

code = code.replace(
`    const jsonString = JSON.stringify(filteredDevices, null, 2);`,
`    const jsonString = JSON.stringify(sortedDevices, null, 2);`
);

fs.writeFileSync(filePath, code);

console.log('Готово: добавлена сортировка таблицы Карта IP / SIP устройств АТС.');
