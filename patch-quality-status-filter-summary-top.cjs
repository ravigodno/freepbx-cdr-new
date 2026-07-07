const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/modules/monitoring/tabs/monitoring/QualityTab.tsx');

if (!fs.existsSync(filePath)) {
  console.error('Не найден файл:', filePath);
  process.exit(1);
}

let code = fs.readFileSync(filePath, 'utf8');

const backupPath = filePath + '.bak-status-filter-summary-top';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, code);
  console.log('Backup создан:', backupPath);
}

/**
 * 1. Добавляем тип фильтра статуса.
 */
if (!code.includes('type QualityStatusFilter')) {
  code = code.replace(
    `type QualitySortDirection = 'asc' | 'desc';`,
    `type QualitySortDirection = 'asc' | 'desc';
type QualityStatusFilter = 'ALL' | QualityDevice['status'];`
  );
}

/**
 * 2. Добавляем state фильтра статуса.
 */
if (!code.includes('const [qualityStatusFilter, setQualityStatusFilter]')) {
  code = code.replace(
    `  const [searchQuery, setSearchQuery] = useState<string>('');`,
    `  const [searchQuery, setSearchQuery] = useState<string>('');
  const [qualityStatusFilter, setQualityStatusFilter] = useState<QualityStatusFilter>('ALL');`
  );
}

/**
 * 3. Фильтруем устройства не только по поиску, но и по статусу.
 */
code = code.replace(
`  // Filtered devices list based on search query
  const filteredDevices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return devices;
    return devices.filter(d => 
      d.ext.includes(q) || 
      d.name.toLowerCase().includes(q) || 
      d.ip.includes(q) ||
      d.userAgent.toLowerCase().includes(q)
    );
  }, [devices, searchQuery]);`,
`  // Filtered devices list based on search query and status
  const filteredDevices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return devices.filter(d => {
      const matchesSearch =
        !q ||
        d.ext.includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.ip.includes(q) ||
        d.userAgent.toLowerCase().includes(q);

      const matchesStatus =
        qualityStatusFilter === 'ALL' ||
        d.status === qualityStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [devices, searchQuery, qualityStatusFilter]);`
);

/**
 * 4. Добавляем счетчики для верхней строки.
 */
if (!code.includes('const qualityVisibleSummary = useMemo')) {
  code = code.replace(
`  const visibleQualityDevices = useMemo(() => {
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
  }, [deviceListTab, filteredTrunks, filteredExtensions, qualitySort, qualitySortCollator]);`,
`  const visibleQualityDevices = useMemo(() => {
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
  }, [deviceListTab, filteredTrunks, filteredExtensions, qualitySort, qualitySortCollator]);

  const qualityVisibleSummary = useMemo(() => {
    const online = visibleQualityDevices.filter(d => d.status !== 'Offline').length;
    const offline = visibleQualityDevices.filter(d => d.status === 'Offline').length;
    return {
      visible: visibleQualityDevices.length,
      online,
      offline,
      totalFound: filteredDevices.length
    };
  }, [visibleQualityDevices, filteredDevices]);`
  );
}

/**
 * 5. Добавляем select статуса рядом с поиском.
 */
code = code.replace(
`              <div className="relative">
                <input
                  type="text"
                  placeholder="Поиск по EXT, IP, Имени..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-64 pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#334155] text-xs font-semibold rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                />
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              </div>`,
`              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  value={qualityStatusFilter}
                  onChange={(e) => setQualityStatusFilter(e.target.value as QualityStatusFilter)}
                  className="w-full sm:w-48 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#334155] text-xs font-bold rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                  title="Фильтр по статусу устройства"
                >
                  <option value="ALL">Все статусы</option>
                  <option value="Отлично">Отлично</option>
                  <option value="Хорошо">Хорошо</option>
                  <option value="Предупреждение">Предупреждение</option>
                  <option value="Критично">Критично</option>
                  <option value="Offline">Offline</option>
                </select>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Поиск по EXT, IP, Имени..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full md:w-64 pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-[#334155] text-xs font-semibold rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                  />
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>`
);

/**
 * 6. Меняем блок табов: справа добавляем верхнюю строку статистики.
 */
code = code.replace(
`            <div className="px-4 pt-4">
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-slate-900/40 p-1">
                <button
                  type="button"
                  onClick={() => setDeviceListTab('trunks')}
                  className={\`px-3 py-1.5 rounded-lg text-xs font-black transition-all \${
                    deviceListTab === 'trunks'
                      ? 'bg-white dark:bg-[#1e293b] text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }\`}
                >
                  Транки ({filteredTrunks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceListTab('devices')}
                  className={\`px-3 py-1.5 rounded-lg text-xs font-black transition-all \${
                    deviceListTab === 'devices'
                      ? 'bg-white dark:bg-[#1e293b] text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }\`}
                >
                  Абоненты ({filteredExtensions.length})
                </button>
              </div>
            </div>`,
`            <div className="px-4 pt-4 pb-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-slate-900/40 p-1">
                <button
                  type="button"
                  onClick={() => setDeviceListTab('trunks')}
                  className={\`px-3 py-1.5 rounded-lg text-xs font-black transition-all \${
                    deviceListTab === 'trunks'
                      ? 'bg-white dark:bg-[#1e293b] text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }\`}
                >
                  Транки ({filteredTrunks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceListTab('devices')}
                  className={\`px-3 py-1.5 rounded-lg text-xs font-black transition-all \${
                    deviceListTab === 'devices'
                      ? 'bg-white dark:bg-[#1e293b] text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }\`}
                >
                  Абоненты ({filteredExtensions.length})
                </button>
              </div>

              <div className="text-[10px] sm:text-xs font-black text-slate-500 dark:text-slate-400 text-left lg:text-right">
                {deviceListTab === 'trunks' ? 'Выведено транков' : 'Выведено абонентов'}: <span className="text-blue-700 dark:text-blue-300">{qualityVisibleSummary.visible}</span>
                <span className="mx-1 text-slate-300">·</span>
                Онлайн <span className="text-emerald-600">{qualityVisibleSummary.online}</span>
                <span className="mx-1 text-slate-300">·</span>
                Офлайн <span className="text-slate-700 dark:text-slate-200">{qualityVisibleSummary.offline}</span>
                <span className="mx-1 text-slate-300">·</span>
                Всего найдено: <span className="text-slate-800 dark:text-white">{qualityVisibleSummary.totalFound}</span>
              </div>
            </div>`
);

/**
 * 7. Убираем нижнюю строку статистики под таблицей.
 */
code = code.replace(
`            
            <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 text-slate-400 text-[10px] font-bold border-t border-slate-200 dark:border-[#334155] text-right">
              {deviceListTab === 'trunks' ? 'Выведено транков' : 'Выведено абонентов'}: {visibleQualityDevices.length} · Всего найдено: {filteredDevices.length}
            </div>`,
''
);

fs.writeFileSync(filePath, code);

console.log('Готово: добавлен фильтр статуса и строка статистики перенесена вверх.');
