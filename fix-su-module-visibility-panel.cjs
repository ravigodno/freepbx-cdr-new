const fs = require('fs');

const path = 'src/modules/access/components/PermissionsMatrixTab.tsx';
let s = fs.readFileSync(path, 'utf8');

// 1. Убираем неудачные автоваcтавки панели, если они попали не туда.
s = s.replace(/\n\s*\{renderModuleVisibilityPanel\(\)\}/g, '');

// 2. Проверяем, что типы moduleVisibility есть.
if (!s.includes("type OptionalModuleKey = 'marketing'")) {
  s = s.replace(
    `type PermissionKind = 'tab' | 'feature' | 'su';`,
    `type PermissionKind = 'tab' | 'feature' | 'su';

type OptionalModuleKey = 'marketing' | 'monitoring' | 'management' | 'balance';

const DEFAULT_MODULE_VISIBILITY: Record<OptionalModuleKey, boolean> = {
  marketing: true,
  monitoring: true,
  management: true,
  balance: true
};`
  );
}

// 3. Проверяем useEffect import.
s = s.replace(
  `import React, { useMemo, useState } from 'react';`,
  `import React, { useEffect, useMemo, useState } from 'react';`
);

// 4. Добавляем state и API helpers, если их нет.
if (!s.includes('const [moduleVisibility, setModuleVisibility]')) {
  s = s.replace(
    `  const [newRoleName, setNewRoleName] = useState('');`,
    `  const [newRoleName, setNewRoleName] = useState('');
  const [moduleVisibility, setModuleVisibility] = useState<Record<OptionalModuleKey, boolean>>(DEFAULT_MODULE_VISIBILITY);
  const [moduleVisibilityStatus, setModuleVisibilityStatus] = useState('');`
  );
}

if (!s.includes('const getAuthToken = () =>')) {
  const marker = `  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({`;
  const idx = s.indexOf(marker);
  if (idx === -1) {
    console.error('Не найден openGroups. Покажи начало PermissionsMatrixTab.tsx');
    process.exit(1);
  }

  const endIdx = s.indexOf('  });', idx);
  if (endIdx === -1) {
    console.error('Не найден конец openGroups.');
    process.exit(1);
  }

  const insertAt = endIdx + '  });'.length;

  const helpers = `

  const getAuthToken = () => {
    try {
      const raw = localStorage.getItem('asterisk_cdr_session');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.token || '';
    } catch {
      return '';
    }
  };

  const loadModuleVisibility = async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch('/api/settings/module-visibility', {
        headers: { Authorization: \`Bearer \${token}\` }
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.moduleVisibility) {
        setModuleVisibility({ ...DEFAULT_MODULE_VISIBILITY, ...data.moduleVisibility });
      }
    } catch {
      // Не блокируем матрицу прав, если настройка временно недоступна.
    }
  };

  const saveModuleVisibility = async (nextVisibility: Record<OptionalModuleKey, boolean>) => {
    const token = getAuthToken();
    if (!token || !isSu) return;

    setModuleVisibility(nextVisibility);
    setModuleVisibilityStatus('Сохраняем видимость разделов...');

    try {
      const response = await fetch('/api/settings/module-visibility', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: \`Bearer \${token}\`
        },
        body: JSON.stringify({ moduleVisibility: nextVisibility })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось сохранить видимость разделов');
      }

      setModuleVisibility({ ...DEFAULT_MODULE_VISIBILITY, ...data.moduleVisibility });
      setModuleVisibilityStatus('Видимость разделов сохранена.');
    } catch (error: any) {
      setModuleVisibilityStatus(error?.message || 'Не удалось сохранить видимость разделов');
    }
  };

  useEffect(() => {
    loadModuleVisibility();
  }, []);`;

  s = s.slice(0, insertAt) + helpers + s.slice(insertAt);
}

// 5. Добавляем moduleKey в интерфейс группы.
if (!s.includes('moduleKey?: OptionalModuleKey;')) {
  s = s.replace(
    `  color: 'blue' | 'emerald' | 'sky' | 'slate' | 'red';
  rows: PermissionRow[];`,
    `  color: 'blue' | 'emerald' | 'sky' | 'slate' | 'red';
  moduleKey?: OptionalModuleKey;
  rows: PermissionRow[];`
  );
}

// 6. Проставляем moduleKey группам.
s = s.replace(
  `    id: 'marketing',
    title: 'Маркетинг',`,
  `    id: 'marketing',
    title: 'Маркетинг',
    moduleKey: 'marketing',`
);

s = s.replace(
  `    id: 'monitoring',
    title: 'Мониторинг',`,
  `    id: 'monitoring',
    title: 'Мониторинг',
    moduleKey: 'monitoring',`
);

s = s.replace(
  `    id: 'management',
    title: 'Управление АТС',`,
  `    id: 'management',
    title: 'Управление АТС',
    moduleKey: 'management',`
);

s = s.replace(
  `    id: 'balance',
    title: 'Баланс',`,
  `    id: 'balance',
    title: 'Баланс',
    moduleKey: 'balance',`
);

// 7. Фильтр групп: SU видит все, остальные не видят отключенные SU модули.
s = s.replace(
  `  const visibleGroups = GROUPS
    .map(group => ({
      ...group,
      rows: group.rows.filter(row => row.kind !== 'su' || isSu || showSuPermissionsToAdmin)
    }))
    .filter(group => group.rows.length > 0);`,
  `  const visibleGroups = GROUPS
    .filter(group => isSu || !group.moduleKey || moduleVisibility[group.moduleKey] !== false)
    .map(group => ({
      ...group,
      rows: group.rows.filter(row => row.kind !== 'su' || isSu || showSuPermissionsToAdmin)
    }))
    .filter(group => group.rows.length > 0);`
);

// 8. Добавляем отдельную SU-панель, если ее нет.
if (!s.includes('const renderModuleVisibilityPanel')) {
  s = s.replace(
    `  const canEditPermission = (permission: PermissionRow) => {`,
    `  const renderModuleVisibilityPanel = () => {
    if (!isSu) return null;

    const labels: Record<OptionalModuleKey, string> = {
      marketing: 'Маркетинг',
      monitoring: 'Мониторинг',
      management: 'Управление АТС',
      balance: 'Баланс'
    };

    return (
      <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="text-sm font-black text-indigo-900">Видимость разделов системы</div>
        <p className="mt-1 text-xs leading-relaxed text-indigo-700">
          Настройка доступна только SU. Реестр звонков, Справочник и Отчеты всегда включены.
          Отключенные разделы скрываются из меню и матрицы прав для всех пользователей, кроме SU.
        </p>

        <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Обязательные разделы</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {['Реестр звонков', 'Справочник', 'Отчеты и аналитика'].map(label => (
              <label key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                <input type="checkbox" checked readOnly disabled className="h-3.5 w-3.5 rounded border-slate-300" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Отключаемые разделы</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(labels) as OptionalModuleKey[]).map(moduleKey => (
              <label key={moduleKey} className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">
                <input
                  type="checkbox"
                  checked={moduleVisibility[moduleKey] !== false}
                  onChange={(event) => saveModuleVisibility({ ...moduleVisibility, [moduleKey]: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{labels[moduleKey]}</span>
              </label>
            ))}
          </div>
        </div>

        {moduleVisibilityStatus && (
          <div className="mt-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-800">
            {moduleVisibilityStatus}
          </div>
        )}
      </div>
    );
  };

  const canEditPermission = (permission: PermissionRow) => {`
  );
}

// 9. Вставляем вызов панели прямо перед блоком "Матрица доступа".
// Ищем строку с заголовком "Матрица доступа" и ближайший внешний div перед ней.
if (!s.includes('{renderModuleVisibilityPanel()}')) {
  const titleIdx = s.indexOf('Матрица доступа');
  if (titleIdx === -1) {
    console.error('Не найден текст "Матрица доступа".');
    process.exit(1);
  }

  const beforeTitle = s.slice(0, titleIdx);
  const cardIdx = beforeTitle.lastIndexOf('<div');
  if (cardIdx === -1) {
    console.error('Не найден div перед "Матрица доступа".');
    process.exit(1);
  }

  const lineStart = beforeTitle.lastIndexOf('\n', cardIdx) + 1;
  const indentMatch = s.slice(lineStart, cardIdx).match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '      ';

  s = s.slice(0, lineStart) + `${indent}{renderModuleVisibilityPanel()}\n` + s.slice(lineStart);
}

fs.writeFileSync(path, s);
console.log('OK: SU module visibility panel added before permissions matrix.');
