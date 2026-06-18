import React from 'react';
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
  Check,
  Copy,
  UserPlus,
  CheckCircle,
  AlertTriangle,
  Target,
  Pause,
  Play,
  MoreVertical,
  Volume2,
} from 'lucide-react';
import { buildCdrRowViewModel, isInternalExt } from '../utils/CDRRowHelpers';
import CDRDurationCell from './CDRDurationCell';
import CDRStatusCell from './CDRStatusCell';
import CDRCommentCell from './CDRCommentCell';

interface LegacyCDRTableProps {
  calls: any[];
  directory?: any[];
  session?: any;
  copiedNumber?: string | null;
  playingCallId?: string | null;
  isAudioPaused?: boolean;
  activeDropdownCallId?: string | null;
  handleCopy?: (num: string) => void;
  triggerClickToCall?: (targetPhone: string, targetName?: string) => void;
  openAddFromCall?: (number: string, initialName?: string) => void;
  playRecording?: (call: any) => void;
  openProcessModal?: (call: any) => void;
  toggleRowDropdown?: (uniqueid: string) => void;
  fetchChronology?: (uniqueid: string) => void;
  setActiveDropdownCallId?: (id: string | null) => void;
  formatSeconds?: (sec: number) => string;
}

export default function LegacyCDRTable({
  calls = [],
  directory = [],
  session,
  copiedNumber = null,
  playingCallId = null,
  isAudioPaused = false,
  activeDropdownCallId = null,
  handleCopy = () => {},
  triggerClickToCall = () => {},
  openAddFromCall = () => {},
  playRecording = () => {},
  openProcessModal = () => {},
  toggleRowDropdown = () => {},
  fetchChronology = () => {},
  setActiveDropdownCallId = () => {},
  formatSeconds = (sec: number) => {
    const n = Number(sec || 0);
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}: LegacyCDRTableProps) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#1e293b]/20 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
          <th className="py-4 px-4">ВРЕМЯ ВЫЗОВА / ID</th>
          <th className="py-4 px-4 font-bold">КТО ЗВОНИЛ</th>
          <th className="py-4 px-4 font-bold">КУДА ЗВОНИЛ</th>
          <th className="py-4 px-4 font-bold">РЕШЕНИЕ (СТАТУС)</th>
          <th className="py-4 px-4 font-bold">ДЛИТЕЛЬНОСТЬ</th>
          <th className="py-4 px-4 font-bold">ЗАПИСЬ</th>
          <th className="py-4 px-4 font-bold">КОММЕНТАРИЙ ОПЕРАТОРА</th>
          <th className="py-4 px-4 font-bold text-left">УПРАВЛЕНИЕ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/45 text-xs bg-white dark:bg-slate-900">
        {calls.map((call, index) => {
          const rowVm = buildCdrRowViewModel(call, directory);

          const {
            isIncoming,
            isMissed,
            isOutgoing,
            displayedSrc,
            displayedDst,
            callerName,
            callerType,
            isFound,
            calleeName,
            calleeType,
            isFoundDst,
            callDisp,
          } = rowVm;

          return (
            <tr
              key={call.uniqueid}
              className={`hover:bg-slate-50/50 dark:hover:bg-[#1e293b]/30 transition-colors ${
                isMissed && !call.processed && !call.wasCallbacked
                  ? 'bg-rose-500/[0.015]'
                  : ''
              }`}
            >
              {/* Column 1: TIME AND ID */}
              <td className="py-4 px-4 font-normal text-slate-705 dark:text-slate-350">
                <div className="flex items-center gap-3">
                  {/* Call type icon circle */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-3xs `}>
                    {isIncoming ? <PhoneIncoming className="h-4.5 w-4.5" /> : isOutgoing ? <PhoneOutgoing className="h-4.5 w-4.5" /> : <PhoneCall className="h-4.5 w-4.5" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-[13px] tracking-tight">
                      {call.calldate}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-505 font-mono mt-0.5 animate-none">
                      ID:{' '}
                      {session?.role === 'admin' ? (
                        <button
                          onClick={() => fetchChronology(call.uniqueid)}
                          className="text-slate-400 hover:text-red-705 hover:underline cursor-pointer font-medium"
                          title="Посмотреть хронологию прохождения звонка"
                        >
                          {call.uniqueid}
                        </button>
                      ) : (
                        <span className="select-all">{call.uniqueid}</span>
                      )}
                    </span>
                  </div>
                </div>
              </td>

              {/* Column 2: WHO CALLED (Кто звонил) */}
              <td className="py-4 px-4 m-0">
                <div className="flex flex-col gap-1.5 justify-center">
                  {/* Line 1: Name and Badge */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-bold text-xs ${isFound ? "text-red-800 dark:text-red-400" : "text-slate-800 dark:text-slate-150"}`}>
                      {callerName}
                    </span>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-205/50 dark:border-slate-800/40 select-none">
                      {callerType === 'internal' ? 'Внутр.' : 'Клиент'}
                    </span>
                  </div>
                  {/* Line 2: Phone status, copy, dial and add buttons in ONE LINE */}
                  <div className="flex items-center gap-1.5 flex-wrap select-none">
                    <span className="font-bold text-slate-700 dark:text-slate-300 font-mono select-all text-xs">
                      {displayedSrc}
                    </span>
                    
                    <button
                      onClick={() => handleCopy(displayedSrc)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-303 transition-colors cursor-pointer"
                      title="Скопировать номер"
                    >
                      {copiedNumber === displayedSrc ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => triggerClickToCall(displayedSrc, callerName)}
                      className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs hover:scale-102"
                      title="Позвонить на номер через SIP/AMI"
                    >
                      <PhoneCall className="h-2.5 w-2.5" />
                      <span>Позвонить</span>
                    </button>

                    {!isFound && (
                      <button
                        onClick={() => openAddFromCall(displayedSrc, callerName && !callerName.startsWith('Внешний') && !callerName.startsWith('Внутренний') ? callerName : '')}
                        className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 text-indigo-650 dark:text-indigo-300 border border-indigo-200/30 dark:border-indigo-800/40 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs hover:scale-102"
                        title="Добавить в справочник"
                      >
                        <UserPlus className="h-2.5 w-2.5" />
                        <span>Добавить</span>
                      </button>
                    )}
                  </div>
                </div>
              </td>

              {/* Column 3: Callee display (Куда звонил) */}
              <td className="py-4 px-4">
                <div className="flex items-center justify-between gap-6 max-w-xs select-text">
                  {/* Left Block */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-bold text-xs ${isFoundDst ? "text-red-800 dark:text-red-400" : "text-slate-800 dark:text-slate-100"}`}>
                        {calleeName}
                      </span>
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40 select-none">
                        {calleeType === 'internal' ? 'Внутр.' : 'Клиент'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
                      <span>{displayedDst}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => triggerClickToCall(displayedDst, calleeName)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                          title={`Позвонить на ${displayedDst}`}
                        >
                          <PhoneCall className="h-3 w-3" />
                        </button>
                        {!isFoundDst && (
                          <button
                            onClick={() => openAddFromCall(displayedDst, calleeName && !calleeName.startsWith('Внешний') && !calleeName.startsWith('Внутренний') ? calleeName : '')}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-605 hover:text-indigo-700 transition-colors cursor-pointer"
                            title={`Добавить ${displayedDst} в справочник`}
                          >
                            <UserPlus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Block */}
                  <div className="flex flex-col items-end text-right font-mono text-[10.5px] text-slate-400 dark:text-slate-500 gap-1 select-none">
                    <span>DID: {call.did || '841282'}</span>
                    <span>не отвечает: {isInternalExt(call.dst) && call.dst !== '9999' ? call.dst : '100, 200'}</span>
                  </div>
                </div>
              </td>

              {/* Column 4: REKHEM (СТАТУС) */}
              <CDRStatusCell
                isMissed={isMissed}
                callDisp={callDisp}
                processed={call.processed}
                wasCallbacked={call.wasCallbacked}
                wasKpiResolved={call.wasKpiResolved}
                callbackTime={call.callbackTime}
                index={index}
              />

              {/* Column 5: ДЛИТЕЛЬНОСТЬ */}
              <CDRDurationCell
                duration={call.duration}
                billsec={call.billsec}
                formatSeconds={formatSeconds}
              />

              {/* Column 5b: ЗАПИСЬ */}
              <td className="py-4 px-4">
                {call.recordingfile ? (
                  <button
                    onClick={() => playRecording(call)}
                    className={`inline-flex items-center gap-1.5 py-1 px-3 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-250/70 dark:border-slate-800/40 text-[10.5px] font-bold rounded-lg cursor-pointer transition-colors shadow-3xs ${
                      playingCallId === call.uniqueid
                        ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-600 hover:bg-rose-100/50 dark:text-rose-400'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-950'
                    }`}
                  >
                    {playingCallId === call.uniqueid && !isAudioPaused ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        <span>Слушать</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Воспроизвести</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-slate-405 dark:text-slate-500 italic text-xs select-none font-light">Нет записи</span>
                )}
              </td>

              {/* Column 6: COMMENT */}
              <CDRCommentCell
                comment={call.comment}
                processedBy={call.processedBy}
                processedAt={call.processedAt}
              />

              {/* Column 7: Actions */}
              <td className="py-4 px-4">
                <div className="flex items-center justify-start gap-2.5">
                  {isMissed ? (
                    <button
                      onClick={() => openProcessModal(call)}
                      className={`px-3.5 py-1.5 rounded-lg border transition-all text-xs font-bold whitespace-nowrap cursor-pointer shadow-3xs ${
                        call.processed
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-705 dark:text-slate-300 dark:border-slate-800'
                          : 'border-red-200 bg-white hover:bg-red-50/40 text-red-500 hover:text-red-600 dark:border-red-900/40 dark:hover:bg-red-950/20'
                      }`}
                    >
                      {call.processed ? 'Изменить' : 'Обработать'}
                    </button>
                  ) : (
                    <div className="w-[102px]"></div>
                  )}

                  {/* Dropdown Options */}
                  <div className="relative inline-block leading-none">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowDropdown(call.uniqueid);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      title="Дополнительные действия"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {activeDropdownCallId === call.uniqueid && (
                      <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-905 border border-slate-150 dark:border-slate-800 rounded-lg shadow-lg py-1 z-30 font-sans text-xs text-left text-slate-700 dark:text-slate-200">
                        {/* Call to Src */}
                        <button
                          onClick={() => {
                            setActiveDropdownCallId(null);
                            triggerClickToCall(displayedSrc, callerName);
                          }}
                          className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer font-medium"
                        >
                          <PhoneCall className="h-3.5 w-3.5 text-emerald-500" />
                          <span>Позвонить вызыв.</span>
                        </button>

                        {/* Call to Dst */}
                        <button
                          onClick={() => {
                            setActiveDropdownCallId(null);
                            triggerClickToCall(displayedDst, calleeName);
                          }}
                          className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer font-medium"
                        >
                          <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
                          <span>Позвонить куда</span>
                        </button>

                        {/* Add Src to Directory */}
                        {!isFound && (
                          <button
                            onClick={() => {
                              setActiveDropdownCallId(null);
                              openAddFromCall(displayedSrc, callerName && !callerName.startsWith('Внешний') && !callerName.startsWith('Внутренний') ? callerName : '');
                            }}
                            className="w-full px-3 py-2 text-slate-700 dark:text-slate-355 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800 font-medium"
                          >
                            <UserPlus className="h-3.5 w-3.5 text-indigo-505" />
                            <span>Добавить {displayedSrc}</span>
                          </button>
                        )}

                        {/* Fetch Chronology */}
                        {session?.role === 'admin' && (
                          <button
                            onClick={() => {
                              setActiveDropdownCallId(null);
                              fetchChronology(call.uniqueid);
                            }}
                            className="w-full px-3 py-2 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800 font-medium"
                          >
                            <Volume2 className="h-3.5 w-3.5 text-purple-500" />
                            <span>Хронология вызова</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
