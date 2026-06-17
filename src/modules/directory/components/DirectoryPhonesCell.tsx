import React from 'react';
import { PhoneCall } from 'lucide-react';

type Props = {
  phones: string[];
  contactName: string;
  onCall: (phone: string, name: string) => void;
};

export function DirectoryPhonesCell({ phones, contactName, onCall }: Props) {
  return (
    <td className="py-3.5 px-3 text-red-800 dark:text-rose-200 font-mono font-bold select-all">
      <div className="flex flex-col gap-1">
        {phones.map(phone => (
          <div key={phone} className="flex items-center gap-2">
            <span>{phone}</span>
            <button
              onClick={() => onCall(phone, contactName)}
              className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 cursor-pointer flex items-center transition-all shadow-xs hover:scale-105 active:scale-95"
              title={`Позвонить на ${phone} через SIP/AMI`}
            >
              <PhoneCall className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </td>
  );
}
