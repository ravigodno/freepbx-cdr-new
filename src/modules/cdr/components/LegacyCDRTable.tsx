import React from 'react';
import { buildCdrRowViewModel } from '../utils/CDRRowHelpers';
import CDRDurationCell from './CDRDurationCell';
import CDRStatusCell from './CDRStatusCell';
import CDRCommentCell from './CDRCommentCell';
import CDRTimeCell from './CDRTimeCell';
import CDRRecordingCell from './CDRRecordingCell';
import CDRCallerCell from './CDRCallerCell';
import CDRCalleeCell from './CDRCalleeCell';
import CDRActionsCell from './CDRActionsCell';

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
          <th className="py-4 px-4 font-bold text-right pr-6">УПРАВЛЕНИЕ</th>
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
              <CDRActionsCell
                call={call}
                isMissed={isMissed}
                isIncoming={isIncoming}
                isFound={isFound}
                displayedSrc={displayedSrc}
                displayedDst={displayedDst}
                callerName={callerName}
                calleeName={calleeName}
                isAdmin={session?.role === 'admin'}
                activeDropdownCallId={activeDropdownCallId}
                openProcessModal={openProcessModal}
                toggleRowDropdown={toggleRowDropdown}
                setActiveDropdownCallId={setActiveDropdownCallId}
                triggerClickToCall={triggerClickToCall}
                openAddFromCall={openAddFromCall}
                fetchChronology={fetchChronology}
              />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
