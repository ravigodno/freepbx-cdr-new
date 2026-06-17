import React from 'react';
import { DirectoryRow } from './DirectoryRow';

type Props = {
  list: any[];
  getEntryPhones: (entry: any) => string[];
  triggerClickToCall: (phone: string, name: string) => void;
};

export function DirectoryTable({
  list,
  getEntryPhones,
  triggerClickToCall
}: Props) {

  if (!list.length) {
    return (
      <div className="py-8 text-center text-slate-400">
        Записи не найдены
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
        <tr>
          <th className="py-2 px-3">Статус</th>
          <th className="py-2 px-3">ФИО</th>
          <th className="py-2 px-3">Телефоны</th>
          <th className="py-2 px-3">Компания</th>
          <th className="py-2 px-3">Должность</th>
          <th className="py-2 px-3">Подразделение</th>
          <th className="py-2 px-3">Теги</th>
          <th className="py-2 px-3">Комментарий</th>
          <th className="py-2 px-3">Email</th>
          <th className="py-2 px-3">Сайт</th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-100">
        {list.map((entry) => (
          <DirectoryRow
            key={entry.id}
            entry={entry}
            getEntryPhones={getEntryPhones}
            triggerClickToCall={triggerClickToCall}
          />
        ))}
      </tbody>
    </table>
  );
}
