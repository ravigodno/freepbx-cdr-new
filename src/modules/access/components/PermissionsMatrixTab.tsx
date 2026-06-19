import React from 'react';

export default function PermissionsMatrixTab() {
  const rows = [
    ['Все звонки', '✔', '✔', '—'],
    ['Только свои звонки', '✔', '✔', '✔'],
    ['Настройки АТС', '✔', '—', '—'],
    ['Пользователи и роли', '✔', '—', '—'],
    ['Справочник', '✔', '✔', '✔'],
    ['Click2Call лог', '✔', '✔', '—'],
    ['Экспорт Excel', '✔', '✔', '—']
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-4 bg-slate-50 border-b border-slate-200">
        <h4 className="text-sm font-black text-slate-900">
          Матрица доступа
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Руководитель подготовлен для будущего просмотра и экспорта статистики в Excel.
        </p>
      </div>

      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="p-3 text-left">Возможность</th>
            <th>Админ</th>
            <th>Руководитель</th>
            <th>Оператор</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 text-center">
          {rows.map(row => (
            <tr key={row[0]}>
              <td className="p-3 text-left font-bold text-slate-800">
                {row[0]}
              </td>
              <td>{row[1]}</td>
              <td>{row[2]}</td>
              <td>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
