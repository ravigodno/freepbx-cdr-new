import React, { useState } from 'react';
import RussianDatePicker, { toLocalDateInputValue } from '../common/RussianDatePicker';

type Row = Record<string, any>;

function dateAndTimeToSql(d: Date | null, time: string) {
  if (!d) return '';
  const [hhRaw, miRaw] = String(time || '00:00').split(':');
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(hhRaw || '00').padStart(2, '0');
  const mi = String(miRaw || '00').padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
}

function dateToSql(d: Date | null) {
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
}

function toCsv(rows: Row[]) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

export default function DbExplorerTab() {

  const formatTime = (d) => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  };

  const formatRu = (d) => {
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
  };

  const setQuickPeriod = (mode) => {
    const now = new Date();
    let start = new Date();

    if (mode === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(),0,0,0);
      setStartTime('00:00');
      setEndTime(formatTime(now));
    }

    if (mode === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1,0,0,0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1,23,59,0);
      setFromDate(start);
      setToDate(end);
      setStartTime('00:00');
      setEndTime('23:59');
      return;
    }

    if (mode === '1h') {
      start = new Date(now.getTime() - 3600*1000);
    }

    if (mode === '24h') {
      start = new Date(now.getTime() - 24*3600*1000);
    }

    if (mode === '7d') {
      start = new Date(now.getTime() - 7*24*3600*1000);
    }

    if (mode === '30d') {
      start = new Date(now.getTime() - 30*24*3600*1000);
    }

    setFromDate(start);
    setToDate(now);
    setStartTime(formatTime(start));
    setEndTime(formatTime(now));
  };

  const [uid, setUid] = useState('');
  const [number, setNumber] = useState('');
  const [fromDate, setFromDate] = useState<Date | null>(new Date(new Date().setHours(0, 0, 0, 0)));
  const [toDate, setToDate] = useState<Date | null>(new Date());
  const [disposition, setDisposition] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [sql, setSql] = useState('SELECT uniqueid, linkedid, calldate, src, dst, duration, billsec, disposition FROM asteriskcdrdb.cdr ORDER BY calldate DESC LIMIT 50');
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [customTemplates, setCustomTemplates] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pbxpuls_db_custom_templates') || '[]');
    } catch {
      return [];
    }
  });

  const setResult = (data: any) => {
    if (!data.success) {
      setMessage(data.error || 'Ошибка запроса');
      return;
    }
    const resultRows = data.rows || [];
    setRows(resultRows);
    setColumns(data.columns || (resultRows[0] ? Object.keys(resultRows[0]) : []));
    setMessage(`Найдено строк: ${data.count ?? resultRows.length}`);
  };

  const searchByUid = async () => {
    if (!uid.trim()) return setMessage('Укажи uniqueid или linkedid');
    const res = await fetch('/api/db-explorer/cdr/by-uid/' + encodeURIComponent(uid.trim()));
    setResult(await res.json());
  };

  const searchCdr = async () => {
    const p = new URLSearchParams();
    if (fromDate) p.set('from', dateAndTimeToSql(fromDate, startTime));
    if (toDate) p.set('to', dateAndTimeToSql(toDate, endTime));
    if (number) p.set('number', number);
    if (disposition) p.set('disposition', disposition);

    const res = await fetch('/api/db-explorer/cdr/search?' + p.toString());
    setResult(await res.json());
  };

  const runSql = async () => {
    const res = await fetch('/api/db-explorer/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, limit: 300 })
    });
    setResult(await res.json());
  };

  const saveCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'db-explorer-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  const templates = [
    {
      title: 'Последние CDR',
      sql: 'SELECT uniqueid, linkedid, calldate, src, dst, duration, billsec, disposition FROM asteriskcdrdb.cdr ORDER BY calldate DESC LIMIT 100'
    },
    {
      title: 'Поиск по LinkedID',
      sql: "SELECT * FROM asteriskcdrdb.cdr WHERE linkedid = 'ВСТАВЬ_LINKEDID' ORDER BY calldate ASC LIMIT 500"
    },
    {
      title: 'Все пропущенные',
      sql: "SELECT uniqueid, linkedid, calldate, src, dst, duration, billsec, disposition FROM asteriskcdrdb.cdr WHERE disposition = 'NO ANSWER' ORDER BY calldate DESC LIMIT 100"
    },
    {
      title: 'Все отвеченные',
      sql: "SELECT uniqueid, linkedid, calldate, src, dst, duration, billsec, disposition FROM asteriskcdrdb.cdr WHERE disposition = 'ANSWERED' ORDER BY calldate DESC LIMIT 100"
    },
    {
      title: 'Самые длинные разговоры',
      sql: 'SELECT calldate, src, dst, billsec, duration, uniqueid, linkedid FROM asteriskcdrdb.cdr ORDER BY billsec DESC LIMIT 100'
    },
    {
      title: 'Звонки без ответа > 30 сек',
      sql: "SELECT calldate, src, dst, duration, disposition, uniqueid, linkedid FROM asteriskcdrdb.cdr WHERE disposition = 'NO ANSWER' AND duration > 30 ORDER BY calldate DESC LIMIT 100"
    },
    {
      title: 'Записи разговоров',
      sql: "SELECT calldate, src, dst, disposition, recordingfile, uniqueid, linkedid FROM asteriskcdrdb.cdr WHERE recordingfile <> '' ORDER BY calldate DESC LIMIT 100"
    },
    {
      title: 'Записи за сегодня',
      sql: "SELECT calldate, src, dst, recordingfile, uniqueid, linkedid FROM asteriskcdrdb.cdr WHERE recordingfile <> '' AND DATE(calldate) = CURDATE() ORDER BY calldate DESC LIMIT 100"
    },
    {
      title: 'CEL по LinkedID',
      sql: "SELECT eventtime, eventtype, cid_num, exten, context, channame, appname, uniqueid, linkedid FROM asteriskcdrdb.cel WHERE linkedid = 'ВСТАВЬ_LINKEDID' ORDER BY eventtime ASC LIMIT 500"
    },
    {
      title: 'Последние CEL события',
      sql: 'SELECT eventtime, eventtype, cid_num, exten, context, channame, appname, uniqueid, linkedid FROM asteriskcdrdb.cel ORDER BY eventtime DESC LIMIT 200'
    },
    {
      title: 'Переводы звонков CEL',
      sql: "SELECT eventtime, eventtype, cid_num, exten, context, channame, appname, uniqueid, linkedid FROM asteriskcdrdb.cel WHERE eventtype IN ('ATTENDEDTRANSFER','BLINDTRANSFER') ORDER BY eventtime DESC LIMIT 200"
    },
    {
      title: 'CHAN_END события',
      sql: "SELECT eventtime, eventtype, cid_num, exten, context, channame, appname, uniqueid, linkedid FROM asteriskcdrdb.cel WHERE eventtype = 'CHAN_END' ORDER BY eventtime DESC LIMIT 200"
    },
    {
      title: 'Очереди: последние события',
      sql: 'SELECT * FROM asteriskcdrdb.queue_log ORDER BY time DESC LIMIT 300'
    },
    {
      title: 'Очереди: брошенные ABANDON',
      sql: "SELECT * FROM asteriskcdrdb.queue_log WHERE event = 'ABANDON' ORDER BY time DESC LIMIT 300"
    },
    {
      title: 'Очереди: CONNECT',
      sql: "SELECT * FROM asteriskcdrdb.queue_log WHERE event = 'CONNECT' ORDER BY time DESC LIMIT 300"
    },
    {
      title: 'Топ звонящих за сутки',
      sql: "SELECT src, COUNT(*) calls, SUM(billsec) talk_time FROM asteriskcdrdb.cdr WHERE calldate > NOW() - INTERVAL 1 DAY GROUP BY src ORDER BY calls DESC LIMIT 50"
    },
    {
      title: 'Топ направлений за сутки',
      sql: "SELECT dst, COUNT(*) calls, SUM(billsec) talk_time FROM asteriskcdrdb.cdr WHERE calldate > NOW() - INTERVAL 1 DAY GROUP BY dst ORDER BY calls DESC LIMIT 50"
    },
    {
      title: 'Подозрительная активность',
      sql: "SELECT src, COUNT(*) calls FROM asteriskcdrdb.cdr WHERE calldate > NOW() - INTERVAL 1 DAY GROUP BY src HAVING calls > 20 ORDER BY calls DESC LIMIT 50"
    },
    {
      title: 'Все внутренние номера',
      sql: 'SELECT extension, name, voicemail FROM asterisk.users ORDER BY extension LIMIT 300'
    },
    {
      title: 'Устройства FreePBX',
      sql: 'SELECT id, tech, dial, devicetype, user FROM asterisk.devices ORDER BY id LIMIT 300'
    },
    {
      title: 'Chan SIP устройства',
      sql: 'SELECT id, keyword, data FROM asterisk.sip ORDER BY id, keyword LIMIT 500'
    },
    {
      title: 'PJSIP endpoints',
      sql: 'SELECT * FROM asterisk.ps_endpoints LIMIT 300'
    },
    {
      title: 'PJSIP contacts',
      sql: 'SELECT * FROM asterisk.ps_contacts LIMIT 300'
    },
    {
      title: 'PJSIP auths',
      sql: 'SELECT * FROM asterisk.ps_auths LIMIT 300'
    },
    {
      title: 'PJSIP AORs',
      sql: 'SELECT * FROM asterisk.ps_aors LIMIT 300'
    },
    {
      title: 'Все транки',
      sql: 'SELECT * FROM asterisk.trunks LIMIT 300'
    },
    {
      title: 'Входящие маршруты',
      sql: 'SELECT extension, cidnum, destination FROM asterisk.incoming ORDER BY extension LIMIT 300'
    },
    {
      title: 'Очереди FreePBX',
      sql: 'SELECT * FROM asterisk.queues_config LIMIT 300'
    },
    {
      title: 'Детали очередей',
      sql: 'SELECT * FROM asterisk.queues_details LIMIT 500'
    },
    {
      title: 'Outbound routes',
      sql: 'SELECT * FROM asterisk.outbound_routes LIMIT 300'
    },
    {
      title: 'Extensions table',
      sql: 'SELECT * FROM asterisk.extensions LIMIT 500'
    }
  ];

  const allTemplates = [...templates, ...customTemplates];

  const applySelectedTemplate = () => {
    const found = allTemplates.find((t: any) => t.title === selectedTemplate);
    if (found) {
      setSql(found.sql);
      setMessage('Шаблон применён: ' + found.title);
    }
  };

  const saveCustomTemplate = () => {
    const name = customTemplateName.trim();
    if (!name) {
      setMessage('Укажи имя шаблона');
      return;
    }

    if (!sql.trim()) {
      setMessage('SQL пустой');
      return;
    }

    const next = [
      ...customTemplates.filter((t: any) => t.title !== name),
      { title: name, sql }
    ];

    setCustomTemplates(next);
    localStorage.setItem('pbxpuls_db_custom_templates', JSON.stringify(next));
    setSelectedTemplate(name);
    setMessage('Свой шаблон сохранён: ' + name);
  };

  const deleteCustomTemplate = () => {
    if (!selectedTemplate) return;

    const next = customTemplates.filter((t: any) => t.title !== selectedTemplate);
    setCustomTemplates(next);
    localStorage.setItem('pbxpuls_db_custom_templates', JSON.stringify(next));
    setSelectedTemplate('');
    setMessage('Свой шаблон удалён');
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-black">DB Explorer</h3>
        <div className="text-xs text-slate-500 mt-1">
          Безопасный просмотр таблиц FreePBX/Asterisk. Разрешены только SELECT-запросы.
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <div className="2xl:col-span-8 rounded-xl border bg-white p-3 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div>
                <div className="font-black text-xs uppercase">Поиск CDR</div>
                <div className="text-[11px] text-slate-500 mt-1">Фильтр по UID, номеру, статусу, дате и точному времени.</div>
              </div>

              <div className="hidden xl:flex flex-wrap gap-2">
                <button onClick={() => setQuickPeriod('today')} className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-bold">Сегодня</button>
                <button onClick={() => setQuickPeriod('yesterday')} className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-bold">Вчера</button>
                <button onClick={() => setQuickPeriod('1h')} className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-bold">1 час</button>
                <button onClick={() => setQuickPeriod('24h')} className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-bold">24 часа</button>
                <button onClick={() => setQuickPeriod('7d')} className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-bold">7 дней</button>
                <button onClick={() => setQuickPeriod('30d')} className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-bold">30 дней</button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap xl:flex-nowrap items-end gap-2">
            <label className="text-xs font-bold min-w-[160px] flex-1">
              UID / LinkedID
              <input
                value={uid}
                onChange={e => setUid(e.target.value)}
                placeholder="Введите UID или LinkedID"
                className="mt-1 h-10 w-full border border-slate-200 rounded-lg px-2.5 font-mono text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-bold min-w-[190px] flex-1">
              Номер / DID / src / dst
              <input
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="Введите номер, DID, src или dst"
                className="mt-1 h-10 w-full border border-slate-200 rounded-lg px-2.5 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-bold w-[115px]">
              Статус
              <select
                value={disposition}
                onChange={e => setDisposition(e.target.value)}
                className="mt-1 h-10 w-full border border-slate-200 rounded-lg px-2.5 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Любой</option>
                <option value="ANSWERED">ANSWERED</option>
                <option value="NO ANSWER">NO ANSWER</option>
                <option value="BUSY">BUSY</option>
                <option value="FAILED">FAILED</option>
              </select>
            </label>

            <label className="text-xs font-bold w-[128px]">
              С даты
              <div className="mt-1 [&>div>button]:h-10 [&>div>button]:w-full [&>div>button]:min-w-0 [&>div>button]:rounded-lg [&>div>button]:px-2.5">
                <RussianDatePicker
                  value={toLocalDateInputValue(fromDate || new Date())}
                  onChange={(value) => {
                    const [y, m, d] = value.split('-').map(Number);
                    const prev = fromDate || new Date();
                    setFromDate(new Date(y, m - 1, d, prev.getHours(), prev.getMinutes(), 0));
                  }}
                  ariaLabel="С даты"
                />
              </div>
            </label>

            <label className="text-xs font-bold w-[105px]">
              Время с
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="mt-1 h-10 w-full border border-slate-200 rounded-lg px-2.5 text-xs font-mono bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-xs font-bold w-[128px]">
              По дату
              <div className="mt-1 [&>div>button]:h-10 [&>div>button]:w-full [&>div>button]:min-w-0 [&>div>button]:rounded-lg [&>div>button]:px-2.5">
                <RussianDatePicker
                  value={toLocalDateInputValue(toDate || new Date())}
                  onChange={(value) => {
                    const [y, m, d] = value.split('-').map(Number);
                    const prev = toDate || new Date();
                    setToDate(new Date(y, m - 1, d, prev.getHours(), prev.getMinutes(), 0));
                  }}
                  ariaLabel="По дату"
                />
              </div>
            </label>

            <label className="text-xs font-bold w-[105px]">
              Время по
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="mt-1 h-10 w-full border border-slate-200 rounded-lg px-2.5 text-xs font-mono bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div className="flex gap-2 h-10 mb-0">
              <button
                onClick={searchCdr}
                className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm whitespace-nowrap"
              >
                Найти CDR
              </button>

              <button
                onClick={searchByUid}
                className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-sm whitespace-nowrap"
              >
                Найти по UID
              </button>
            </div>
          </div>

          <div className="xl:hidden flex flex-wrap gap-2">
            <button onClick={() => setQuickPeriod('today')} className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">Сегодня</button>
            <button onClick={() => setQuickPeriod('yesterday')} className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">Вчера</button>
            <button onClick={() => setQuickPeriod('1h')} className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">1 час</button>
            <button onClick={() => setQuickPeriod('24h')} className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">24 часа</button>
            <button onClick={() => setQuickPeriod('7d')} className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">7 дней</button>
            <button onClick={() => setQuickPeriod('30d')} className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">30 дней</button>
          </div>
        </div>

        <div className="2xl:col-span-4 rounded-xl border bg-white p-3 space-y-3">
          <div>
            <div className="font-black text-xs uppercase">Шаблоны запросов</div>
            <div className="text-[11px] text-slate-500 mt-1">Выбери шаблон или сохрани текущий SQL.</div>
          </div>

          <label className="text-xs font-bold">
            Шаблон
            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
              <option value="">Выберите шаблон</option>
              {templates.map(t => (
                <option key={t.title} value={t.title}>{t.title}</option>
              ))}
              {customTemplates.length > 0 && (
                <option disabled>──────── Свои шаблоны ────────</option>
              )}
              {customTemplates.map((t: any) => (
                <option key={t.title} value={t.title}>{t.title}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={applySelectedTemplate} className="px-2 py-2 rounded-lg bg-slate-900 text-white text-xs font-black">
              Применить
            </button>

            <button onClick={saveCustomTemplate} className="px-2 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 text-xs font-black">
              Сохранить
            </button>

            <button onClick={deleteCustomTemplate} className="px-2 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-xs font-black">
              Удалить
            </button>
          </div>

          <label className="text-xs font-bold">
            Имя своего шаблона
            <input value={customTemplateName} onChange={e => setCustomTemplateName(e.target.value)} placeholder="Например: звонки транка" className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-2">
        <div className="font-black text-xs uppercase">SELECT запрос</div>
        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          className="w-full h-28 border rounded-lg p-2 font-mono text-xs"
        />

        <div className="flex gap-2">
          <button onClick={runSql} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-black">
            Выполнить SELECT
          </button>

          <button onClick={saveCsv} disabled={!rows.length} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black disabled:opacity-40">
            Скачать CSV
          </button>

          <button onClick={() => { setRows([]); setColumns([]); setMessage('Окно очищено'); }} className="px-3 py-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 text-xs font-black">
            Очистить
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 text-xs font-bold">
          {message}
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-auto max-h-[560px]">
        <table className="w-full text-[11px] font-mono">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              {columns.map(c => (
                <th key={c} className="p-2 text-left whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t hover:bg-blue-50">
                {columns.map(c => (
                  <td key={c} className="p-2 whitespace-nowrap max-w-[420px] truncate" title={String(r[c] ?? '')}>
                    {String(r[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td className="p-8 text-center text-slate-400" colSpan={Math.max(columns.length, 1)}>
                  Нет данных
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
