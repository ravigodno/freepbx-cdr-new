import React from 'react';
import {PhoneCall} from 'lucide-react';
export function DirectoryPhoneCell({phone,name,onCall}:{phone:string;name:string;onCall:(phone:string,name:string)=>void}) {
 return <div className="flex min-w-0 items-center gap-1 whitespace-nowrap font-mono font-semibold tabular-nums text-slate-800">
  <span className="min-w-0 select-all truncate">{phone}</span>
  <button type="button" onClick={()=>onCall(phone,name)}
   className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-emerald-150 bg-emerald-50 text-emerald-700 shadow-xs transition-colors hover:bg-emerald-100 active:bg-emerald-200"
   title={`Позвонить на ${phone} через SIP/AMI`} aria-label={`Позвонить на ${phone}`}>
   <PhoneCall className="h-3 w-3" />
  </button>
 </div>;
}
