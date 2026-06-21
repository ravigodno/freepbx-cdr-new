import React, { useEffect, useMemo, useState } from 'react';

type CmdItem = {
  cmd: string;
  desc: string;
  when: string;
  risk: 'safe' | 'careful';
};

const commandGroups: { title: string; commands: CmdItem[] }[] = [
  {
    title: 'Общее',
    commands: [
      { cmd: 'fwconsole --version', desc: 'Показывает версию FreePBX Framework / fwconsole.', when: 'Для проверки версии системы перед обновлением или диагностикой.', risk: 'safe' },
      { cmd: 'fwconsole list', desc: 'Показывает список доступных команд fwconsole.', when: 'Когда нужно посмотреть возможности текущей версии FreePBX.', risk: 'safe' },
      { cmd: 'fwconsole validate', desc: 'Проверяет состояние FreePBX и выводит найденные проблемы.', when: 'Для общей диагностики после изменений или ошибок в интерфейсе.', risk: 'safe' }
    ]
  },
  {
    title: 'Модули',
    commands: [
      { cmd: 'fwconsole ma list', desc: 'Показывает список установленных модулей FreePBX и их состояние.', when: 'Для проверки, включён ли нужный модуль и нет ли disabled/broken.', risk: 'safe' },
      { cmd: 'fwconsole ma listonline', desc: 'Показывает доступные онлайн-модули и версии.', when: 'Для проверки доступных обновлений и модулей в репозитории.', risk: 'safe' },
      { cmd: 'fwconsole ma show ', desc: 'Показывает подробную информацию по конкретному модулю.', when: 'Добавь имя модуля, например framework или core.', risk: 'safe' }
    ]
  },
  {
    title: 'Настройки FreePBX',
    commands: [
      { cmd: 'fwconsole setting', desc: 'Показывает настройки FreePBX Advanced Settings.', when: 'Когда нужно проверить глобальные параметры FreePBX.', risk: 'safe' },
      { cmd: 'fwconsole trunks', desc: 'Показывает информацию по транкам FreePBX, если команда доступна в системе.', when: 'Для диагностики транков и маршрутизации.', risk: 'safe' },
      { cmd: 'fwconsole endpoints', desc: 'Показывает информацию по endpoints, если поддерживается установленными модулями.', when: 'Для проверки внутренних устройств и endpoint-ов.', risk: 'safe' }
    ]
  },
  {
    title: 'Сервис / Состояние',
    commands: [
      { cmd: 'fwconsole pm2 --list', desc: 'Показывает процессы PM2, которыми управляет FreePBX.', when: 'Для диагностики Node/PM2 сервисов FreePBX.', risk: 'safe' },
      { cmd: 'fwconsole job --list', desc: 'Показывает задания планировщика FreePBX.', when: 'Для проверки фоновых задач.', risk: 'safe' },
      { cmd: 'fwconsole notification --list', desc: 'Показывает уведомления FreePBX.', when: 'Когда в панели есть предупреждения или ошибки.', risk: 'safe' }
    ]
  },
  {
    title: 'Сертификаты / Firewall',
    commands: [
      { cmd: 'fwconsole certificates', desc: 'Показывает информацию по сертификатам FreePBX.', when: 'Для диагностики HTTPS, TLS, сертификатов.', risk: 'safe' },
      { cmd: 'fwconsole firewall list', desc: 'Показывает правила/состояние FreePBX Firewall, если модуль установлен.', when: 'Для проверки блокировок и доступа к портам.', risk: 'safe' }
    ]
  },
  {
    title: 'Обслуживание',
    commands: [
      { cmd: 'fwconsole reload', desc: 'Применяет конфигурацию FreePBX и перезагружает dialplan.', when: 'После изменений конфигурации. Может кратковременно повлиять на телефонию.', risk: 'careful' },
      { cmd: 'fwconsole chown', desc: 'Исправляет права на файлы FreePBX.', when: 'Когда есть ошибки прав доступа в FreePBX.', risk: 'careful' },
      { cmd: 'fwconsole restart', desc: 'Перезапускает сервисы FreePBX/Asterisk через fwconsole.', when: 'Только при необходимости. Может повлиять на текущие звонки.', risk: 'careful' },
      { cmd: 'fwconsole stop', desc: 'Останавливает сервисы FreePBX.', when: 'Опасно для рабочей АТС. Использовать только осознанно.', risk: 'careful' },
      { cmd: 'fwconsole start', desc: 'Запускает сервисы FreePBX.', when: 'После остановки сервисов или восстановления.', risk: 'careful' }
    ]
  }
];

const quickCommands = commandGroups.flatMap(g => g.commands);

export default function FreepbxCliTab({ token }: { token: string }) {
  const [command, setCommand] = useState('fwconsole --version');
  const [output, setOutput] = useState('');
  const [executedAt, setExecutedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return commandGroups;

    return commandGroups
      .map(g => ({
        ...g,
        commands: g.commands.filter(c =>
          c.cmd.toLowerCase().includes(q) ||
          c.desc.toLowerCase().includes(q) ||
          c.when.toLowerCase().includes(q)
        )
      }))
      .filter(g => g.commands.length > 0);
  }, [filter]);

  const runCommand = async (cmd = command) => {
    setLoading(true);

    try {
      const res = await fetch('/api/freepbx/fwconsole', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ command: cmd.trim() })
      });

      const data = await res.json();

      if (!data.success) {
        setOutput(data.error || data.output || 'Ошибка выполнения команды');
      } else {
        setOutput(data.output || '');
        setExecutedAt(data.executedAt || '');
      }
    } catch (e: any) {
      setOutput(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh) return;

    const t = setInterval(() => runCommand(command), 5000);
    return () => clearInterval(t);
  }, [autoRefresh, command]);

  const saveTxt = () => {
    const blob = new Blob([output || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'freepbx-fwconsole-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-black">FreePBX CLI / fwconsole</h3>
        <div className="text-xs text-slate-500 mt-1">
          Справочник команд fwconsole с пояснениями. Опасные команды установки/удаления модулей заблокированы.
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-3">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">
          <label className="xl:col-span-4 text-xs font-bold">
            Быстрый выбор
            <select value={command} onChange={(e) => setCommand(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2 font-mono text-xs">
              {quickCommands.map(item => (
                <option key={item.cmd} value={item.cmd}>{item.cmd}</option>
              ))}
            </select>
          </label>

          <label className="xl:col-span-6 text-xs font-bold">
            Команда
            <input value={command} onChange={(e) => setCommand(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-2 font-mono text-xs" />
          </label>

          <button onClick={() => runCommand(command)} className="xl:col-span-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black">
            {loading ? 'Выполняю...' : 'Выполнить'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`px-2 py-1 rounded border text-[11px] font-bold ${autoRefresh ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
            {autoRefresh ? 'Автообновление: ON' : 'Автообновление: OFF'}
          </button>

          <button onClick={saveTxt} className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-bold">
            Скачать TXT
          </button>

          <button onClick={() => setOutput('')} className="px-2 py-1 rounded bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold">
            Очистить окно
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-slate-950 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black text-slate-100">Вывод fwconsole</div>
          <div className="text-[11px] text-slate-400">{executedAt ? new Date(executedAt).toLocaleString('ru-RU') : '—'}</div>
        </div>

        <pre className="text-[11px] text-emerald-100 overflow-auto max-h-[420px] whitespace-pre-wrap font-mono">
{output || 'Выберите команду и нажмите «Выполнить».'}
        </pre>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Справочник fwconsole</h4>
            <div className="text-[11px] text-slate-500 mt-1">
              Клик по карточке добавляет команду в поле ввода.
            </div>
          </div>

          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Поиск команды или описания..." className="w-72 border rounded-lg px-3 py-2 text-xs" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {filteredGroups.map(group => (
            <div key={group.title} className="rounded-lg border bg-slate-50 overflow-hidden">
              <div className="px-3 py-2 bg-slate-100 text-xs font-black text-slate-700">{group.title}</div>

              <div className="p-2 space-y-2">
                {group.commands.map(item => (
                  <button
                    key={item.cmd}
                    onClick={() => setCommand(item.cmd)}
                    className="w-full text-left p-2 rounded bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-[11px] font-black text-slate-800">{item.cmd}</div>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black border ${
                        item.risk === 'careful'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {item.risk === 'careful' ? 'ОСТОРОЖНО' : 'SAFE'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600">{item.desc}</div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Когда использовать: {item.when}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
