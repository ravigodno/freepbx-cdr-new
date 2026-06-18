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
import CDRTimeCell from './CDRTimeCell';
import CDRRecordingCell from './CDRRecordingCell';
import CDRCallerCell from './CDRCallerCell';
import CDRCalleeCell from './CDRCalleeCell';

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
              <CDRTimeCell
                calldate={call.calldate}
                uniqueid={call.uniqueid}
                isIncoming={isIncoming}
                isOutgoing={isOutgoing}
                isAdmin={session?.role === 'admin'}
                fetchChronology={fetchChronology}
              />

              {/* Column 2: WHO CALLED (Кто звонил) */}
              <CDRCallerCell
                callerName={callerName}
                callerType={callerType}
                displayedSrc={displayedSrc}
                copiedNumber={copiedNumber}
                isFound={isFound}
                handleCopy={handleCopy}
                triggerClickToCall={triggerClickToCall}
                openAddFromCall={openAddFromCall}
              />

              {/* Column 3: Callee display (Куда звонил) */}
              <CDRCalleeCell
                call={call}
                calleeName={calleeName}
                calleeType={calleeType}
                displayedDst={displayedDst}
                isFoundDst={isFoundDst}
                triggerClickToCall={triggerClickToCall}
                openAddFromCall={openAddFromCall}
              />

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
              <CDRRecordingCell
                call={call}
                playingCallId={playingCallId}
                isAudioPaused={isAudioPaused}
                playRecording={playRecording}
              />

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
