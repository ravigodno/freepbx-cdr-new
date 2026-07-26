const csvColumns = [
  ['Тип контакта', 'type', 'обязательно', 'client / supplier / government / internal'],
  ['Видимость', 'visibility', 'по умолчанию shared', 'shared — общий, private — личный'],
  ['Спам', 'isSpam', 'по умолчанию false', 'true / false / 1 / 0 / yes / no / да / нет'],
  ['Организация', 'organization', 'организация или ФИО', 'ООО Ромашка'],
  ['ФИО', 'fullName', 'организация или ФИО', 'Иван Иванов'],
  ['Должность', 'position', 'опционально', 'директор'],
  ['Основной телефон', 'phone', 'телефон или email', '+79781234567; от 2 до 11 цифр'],
  ['Дополнительный телефон', 'phone2', 'опционально', '365200000'],
  ['Email', 'email', 'телефон или email', 'mail@example.com'],
  ['Сайт', 'website', 'опционально', 'example.com'],
  ['ИНН', 'inn', 'опционально', '9102000000'],
  ['КПП', 'kpp', 'опционально', '910201001'],
  ['ОГРН', 'ogrn', 'опционально', '1234567890123'],
  ['Адрес', 'address', 'опционально', 'Симферополь'],
  ['Комментарий', 'comment', 'опционально', 'источник контакта'],
  ['Отдел', 'department', 'опционально', 'Продажи'],
  ['Группа', 'group', 'опционально', 'Клиенты'],
  ['Теги', 'tags', 'опционально', 'VIP; тендер'],
  ['Внутренний номер', 'internalExtension', 'опционально', '101'],
  ['Связанный внешний номер', 'linkedExternalNumber', 'опционально', '79781234567'],
  ['Ответственный сотрудник', 'responsibleUserId', 'опционально', 'существующий ID пользователя']
] as const;

const csvExample = `type,visibility,isSpam,organization,fullName,position,phone,phone2,email,website,inn,kpp,ogrn,address,comment,department,group,tags,internalExtension,linkedExternalNumber,responsibleUserId
client,shared,false,ООО Ромашка,Иван Иванов,директор,+79781234567,365200000,mail@example.com,example.com,9102000000,910201001,1234567890123,Симферополь,обычный контакт,Продажи,Клиенты,"VIP; тендер",101,79781234567,`;

export default function DirectoryCsvColumnsHelp() {
  const downloadCsvExample = () => {
    const blob = new Blob([`\uFEFF${csvExample}\r\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pbxpuls_directory_import_example.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <details className="mt-4 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/40">
      <summary className="cursor-pointer px-4 py-3 text-xs font-black text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        Описание CSV-столбцов
      </summary>
      <div className="border-t border-blue-100 bg-white p-4">
        <p className="mb-3 text-xs leading-relaxed text-slate-600">
          Названия заголовков регистронезависимы. CSV может использовать запятую, точку с запятой или TAB. Для каждой строки требуется организация или ФИО, а также телефон или email.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Поле</th>
                <th className="px-3 py-2">CSV header</th>
                <th className="px-3 py-2">Обязательность</th>
                <th className="px-3 py-2">Пример</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {csvColumns.map(([label, header, required, example]) => (
                <tr key={header}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{label}</td>
                  <td className="px-3 py-2 font-mono text-blue-700">{header}</td>
                  <td className="px-3 py-2">{required}</td>
                  <td className="px-3 py-2">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mb-2 mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 xl:flex-row xl:items-center">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-amber-900">
            Для корпоративного импорта рекомендуется <code>visibility=shared</code> и пустой <code>responsibleUserId</code>. Неизвестные ID пользователей не сохраняются молча. Поле ответственного не используется для идентификации компании, import job или rollback.
          </p>
          <h5 className="shrink-0 text-xs font-black text-slate-800">Пример CSV</h5>
          <button
            type="button"
            onClick={downloadCsvExample}
            className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Скачать пример CSV
          </button>
        </div>
        <pre className="max-w-full overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100"><code>{csvExample}</code></pre>
      </div>
    </details>
  );
}
