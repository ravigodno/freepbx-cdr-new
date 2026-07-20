import React, { useEffect, useMemo, useState } from 'react';
import { getServerNow } from '../../utils/serverClock';

type CmdItem = {
  cmd: string;
  desc: string;
  when: string;
};

const commandGroups: { title: string; commands: CmdItem[] }[] = [
  {
    title: 'Core / Каналы',
    commands: [
      { cmd: 'core show channels', desc: 'Показывает активные каналы Asterisk в обычном виде.', when: 'Когда нужно быстро понять, есть ли сейчас звонки.' },
      { cmd: 'core show channels concise', desc: 'Показывает активные каналы в компактном формате через разделитель !.', when: 'Лучше всего подходит для парсинга и мониторинга.' },
      { cmd: 'core show channels verbose', desc: 'Расширенный список активных каналов с контекстом, приложением и BridgeID.', when: 'Когда нужно подробнее разобрать активный звонок.' },
      { cmd: 'core show channel ', desc: 'Показывает подробную информацию по конкретному каналу.', when: 'Добавь имя канала, например SIP/100-00000001.' },
      { cmd: 'core show calls', desc: 'Показывает количество активных и обработанных вызовов.', when: 'Для быстрой проверки нагрузки.' },
      { cmd: 'core show uptime', desc: 'Показывает время работы Asterisk.', when: 'После перезапусков и диагностики стабильности.' },
      { cmd: 'core show version', desc: 'Показывает версию Asterisk.', when: 'Для проверки совместимости и отчётов.' },
      { cmd: 'core show settings', desc: 'Показывает основные настройки ядра Asterisk.', when: 'Для общей диагностики окружения.' },
      { cmd: 'core show hints', desc: 'Показывает hint-статусы внутренних номеров.', when: 'Для BLF, статусов телефонов и подписок.' }
    ]
  },
  {
    title: 'Chan SIP',
    commands: [
      { cmd: 'sip show peers', desc: 'Показывает SIP peers: телефоны, транки, статус регистрации.', when: 'Главная команда для chan_sip.' },
      { cmd: 'sip show peer ', desc: 'Подробная информация по одному SIP peer.', when: 'Добавь номер или имя транка, например 101.' },
      { cmd: 'sip show registry', desc: 'Показывает регистрации SIP-транков.', when: 'Когда нужно проверить Registered/Rejected/Timeout.' },
      { cmd: 'sip show channels', desc: 'Показывает активные SIP-диалоги.', when: 'Для проверки текущей SIP-сигнализации.' },
      { cmd: 'sip show channel ', desc: 'Подробности конкретного SIP-канала.', when: 'Добавь имя канала.' },
      { cmd: 'sip show settings', desc: 'Настройки chan_sip.', when: 'Для проверки портов, bindaddr, NAT, qualify.' }
    ]
  },
  {
    title: 'PJSIP',
    commands: [
      { cmd: 'pjsip show endpoints', desc: 'Список PJSIP endpoints и их состояние.', when: 'Главная команда для PJSIP.' },
      { cmd: 'pjsip show endpoint ', desc: 'Подробности конкретного PJSIP endpoint.', when: 'Добавь номер endpoint, например 101.' },
      { cmd: 'pjsip show registrations', desc: 'Регистрации PJSIP-транков.', when: 'Для проверки внешних регистраций.' },
      { cmd: 'pjsip show contacts', desc: 'Контакты PJSIP endpoint-ов.', when: 'Проверить IP телефона и статус контакта.' },
      { cmd: 'pjsip show channels', desc: 'Активные PJSIP-каналы.', when: 'Для диагностики активных вызовов на PJSIP.' },
      { cmd: 'pjsip show transports', desc: 'PJSIP transports: UDP/TCP/TLS, bind адреса.', when: 'Для проверки портов и интерфейсов.' }
    ]
  },
  {
    title: 'Очереди / Dialplan',
    commands: [
      { cmd: 'queue show', desc: 'Показывает очереди, операторов, статусы и ожидающих абонентов.', when: 'Для диагностики очередей и групп операторов.' },
      { cmd: 'queue show rules', desc: 'Показывает правила очередей.', when: 'Если используются queue rules.' },
      { cmd: 'dialplan show', desc: 'Показывает dialplan Asterisk.', when: 'Осторожно: вывод может быть большим.' },
      { cmd: 'dialplan show from-internal', desc: 'Показывает контекст внутренних вызовов FreePBX.', when: 'Для проверки исходящих/внутренних маршрутов.' },
      { cmd: 'dialplan show from-trunk', desc: 'Показывает входящий контекст с транков.', when: 'Для проверки входящих вызовов.' },
      { cmd: 'dialplan show cdr-panel-click2call', desc: 'Показывает контекст Click2Call панели.', when: 'Если кнопка звонка не вызывает аппарат.' }
    ]
  },
  {
    title: 'Bridge / RTP',
    commands: [
      { cmd: 'bridge show all', desc: 'Показывает активные bridge в Asterisk.', when: 'Для проверки соединённых каналов разговора.' },
      { cmd: 'bridge show ', desc: 'Подробности конкретного bridge.', when: 'Добавь Bridge ID.' },
      { cmd: 'rtp show settings', desc: 'Показывает RTP-настройки Asterisk.', when: 'Для проверки диапазона RTP портов.' },
      { cmd: 'rtp show channels', desc: 'Показывает RTP-каналы, если доступно в версии Asterisk.', when: 'Для анализа голосового потока.' }
    ]
  },
  {
    title: 'AMI / Manager',
    commands: [
      { cmd: 'manager show connected', desc: 'Показывает активные AMI-подключения.', when: 'Проверить кто подключён к AMI.' },
      { cmd: 'manager show settings', desc: 'Показывает настройки AMI manager.', when: 'Проверка bindaddr, port, enabled.' },
      { cmd: 'manager show users', desc: 'Список AMI-пользователей.', when: 'Проверить наличие пользователя.' },
      { cmd: 'manager show user ', desc: 'Права конкретного AMI-пользователя.', when: 'Добавь имя пользователя, например 999.' }
    ]
  },
  {
    title: 'Модули / Логи',
    commands: [
      { cmd: 'module show', desc: 'Показывает загруженные модули Asterisk.', when: 'Проверить, загружен ли нужный модуль.' },
      { cmd: 'module show like sip', desc: 'Фильтр модулей по sip.', when: 'Проверить chan_sip/pjsip модули.' },
      { cmd: 'module show like pjsip', desc: 'Фильтр модулей по pjsip.', when: 'Проверить PJSIP модули.' },
      { cmd: 'logger show channels', desc: 'Показывает настроенные каналы логирования.', when: 'Понять куда пишутся логи Asterisk.' }
    ]
  },
  {
    title: 'Дополнительно',
    commands: [
      { cmd: 'voicemail show users', desc: 'Показывает пользователей voicemail.', when: 'Диагностика голосовой почты.' },
      { cmd: 'parking show', desc: 'Показывает настройки парковки вызовов.', when: 'Если используются park/pickup.' },
      { cmd: 'features show', desc: 'Показывает feature-коды Asterisk.', when: 'Для проверки transfer, pickup, park.' },
      { cmd: 'confbridge list', desc: 'Показывает активные конференции ConfBridge.', when: 'Диагностика конференций.' },
      { cmd: 'iax2 show peers', desc: 'Показывает IAX2 peers.', when: 'Если используются IAX2-транки.' },
      { cmd: 'database show', desc: 'Показывает AstDB.', when: 'Только для просмотра значений AstDB.' },
      { cmd: 'database showkey ', desc: 'Поиск ключа в AstDB.', when: 'Добавь ключ или часть ключа.' }
    ]
  }
];

const quickCommands = commandGroups.flatMap(g => g.commands);

export default function AsteriskCliTab() {
  const [command, setCommand] = useState('core show channels');
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
      const res = await fetch('/api/asterisk/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    const t = setInterval(() => runCommand(command), 3000);
    return () => clearInterval(t);
  }, [autoRefresh, command]);

  const cleanOutput = output
    .replace(/Event: SuccessfulAuth[\s\S]*?Response: Success\r?\nMessage: Command output follows\r?\n/i, '')
    .replace(/^Output:\s?/gm, '')
    .trim();

  const saveTxt = () => {
    const blob = new Blob([cleanOutput || output || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'asterisk-cli-' + getServerNow().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-black">Asterisk CLI</h3>
        <div className="text-xs text-slate-500 mt-1">
          Справочник безопасных диагностических команд Asterisk CLI.
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
          <div className="text-xs font-black text-slate-100">Вывод команды</div>
          <div className="text-[11px] text-slate-400">{executedAt ? new Date(executedAt).toLocaleString('ru-RU') : '—'}</div>
        </div>

        <pre className="text-[11px] text-emerald-100 overflow-auto max-h-[420px] whitespace-pre-wrap font-mono">
{cleanOutput || 'Выберите команду и нажмите «Выполнить».'}
        </pre>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Справочник команд</h4>
            <div className="text-[11px] text-slate-500 mt-1">
              Клик по карточке добавляет команду в поле ввода. Команды reload/restart/shutdown намеренно не включены.
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
                    title="Нажмите, чтобы добавить команду в поле ввода"
                  >
                    <div className="font-mono text-[11px] font-black text-slate-800">{item.cmd}</div>
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
