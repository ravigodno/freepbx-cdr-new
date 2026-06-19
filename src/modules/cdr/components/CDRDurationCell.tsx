import React from 'react';

interface Props {
  duration: number;
  billsec: number;
  formatSeconds: (sec: number) => string;
}

function DurationIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`${className} fill-current`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <path d="M320 64C267 64 224 107 224 160L224 288C224 341 267 384 320 384C373 384 416 341 416 288L416 160C416 107 373 64 320 64zM176 248C176 234.7 165.3 224 152 224C138.7 224 128 234.7 128 248L128 288C128 385.9 201.3 466.7 296 478.5L296 528L248 528C234.7 528 224 538.7 224 552C224 565.3 234.7 576 248 576L392 576C405.3 576 416 565.3 416 552C416 538.7 405.3 528 392 528L344 528L344 478.5C438.7 466.7 512 385.9 512 288L512 248C512 234.7 501.3 224 488 224C474.7 224 464 234.7 464 248L464 288C464 367.5 399.5 432 320 432C240.5 432 176 367.5 176 288L176 248z"/>
    </svg>
  );
}

function TalkIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`${className} fill-current`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <path d="M224 160C224 107 267 64 320 64C370.3 64 411.6 102.7 415.7 152L360 152C346.7 152 336 162.7 336 176C336 189.3 346.7 200 360 200L416 200L416 248L360 248C346.7 248 336 258.7 336 272C336 285.3 346.7 296 360 296L415.7 296C411.6 345.3 370.4 384 320 384C267 384 224 341 224 288L224 160zM152 224C165.3 224 176 234.7 176 248L176 288C176 367.5 240.5 432 320 432C399.5 432 464 367.5 464 288L464 248C464 234.7 474.7 224 488 224C501.3 224 512 234.7 512 248L512 288C512 385.9 438.7 466.7 344 478.5L344 528L392 528C405.3 528 416 538.7 416 552C416 565.3 405.3 576 392 576L248 576C234.7 576 224 565.3 224 552C224 538.7 234.7 528 248 528L296 528L296 478.5C201.3 466.7 128 385.9 128 288L128 248C128 234.7 138.7 224 152 224z"/>
    </svg>
  );
}

export function CDRDurationCell({ duration, billsec, formatSeconds }: Props) {
  return (
    <td className="py-4 px-4 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5" title="Длительность">
          <DurationIcon className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatSeconds(duration)}</span>
        </div>
        <div className="flex items-center gap-1.5" title="Разговор">
          <TalkIcon className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatSeconds(billsec)}</span>
        </div>
      </div>
    </td>
  );
}

export default CDRDurationCell;
