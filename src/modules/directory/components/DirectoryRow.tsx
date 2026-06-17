import React from 'react';
import { DirectoryStatusIcon } from './DirectoryStatusIcon';
import { DirectoryPhonesCell } from './DirectoryPhonesCell';
import { DirectoryCompanyCell } from './DirectoryCompanyCell';
import { DirectoryPositionCell } from './DirectoryPositionCell';
import { DirectoryDepartmentCell } from './DirectoryDepartmentCell';

type Props = {
  entry: any;
  getEntryPhones: (entry: any) => string[];
  triggerClickToCall: (phone: string, name: string) => void;
};

export function DirectoryRow({
  entry,
  getEntryPhones,
  triggerClickToCall
}: Props) {
  return (
    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
      <td className="py-3 px-3">
        <DirectoryStatusIcon entry={entry} />
      </td>

      <td className="py-3 px-3 font-medium text-slate-900">
        {entry.name}
      </td>

      <DirectoryPhonesCell
        phones={getEntryPhones(entry)}
        contactName={entry.name}
        onCall={triggerClickToCall}
      />

      <DirectoryCompanyCell company={entry.company} />
      <DirectoryPositionCell position={entry.position} />
      <DirectoryDepartmentCell department={entry.department} />

      <td className="py-3 px-3 text-slate-600">
        {(entry.tags || []).map((tag: string) => (
          <span key={tag} className="mr-1 px-2 py-0.5 bg-slate-100 rounded text-[10px]">
            {tag}
          </span>
        ))}
      </td>

      <td className="py-3 px-3 max-w-[220px]">
        <div className="truncate" title={entry.comment || ''}>
          {entry.comment || '—'}
        </div>
      </td>

      <td className="py-3 px-3">
        {entry.email ? (
          <a href={`mailto:${entry.email}`} className="text-blue-600">
            {entry.email}
          </a>
        ) : '—'}
      </td>

      <td className="py-3 px-3">
        {entry.website ? (
          <a
            href={String(entry.website).startsWith('http') ? entry.website : `https://${entry.website}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600"
          >
            link
          </a>
        ) : '—'}
      </td>
    </tr>
  );
}
