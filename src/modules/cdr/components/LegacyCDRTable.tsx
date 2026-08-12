import React from 'react';
import { Check, CheckCircle, Copy, Globe2, PhoneCall, Target, UserPlus } from 'lucide-react';
import DirectoryTypeIcon from './DirectoryTypeIcon';
import { buildCdrRowViewModel, directoryEntryMatchesNumber } from '../utils/CDRRowHelpers';
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
  siteFormLeads?: any[];
  directory?: any[];
  session?: any;
  copiedNumber?: string | null;
  playingCallId?: string | null;
  isAudioPaused?: boolean;
  activeDropdownCallId?: string | null;
  handleCopy?: (num: string, copiedKey?: string) => void;
  triggerClickToCall?: (targetPhone: string, targetName?: string) => void;
  openAddFromCall?: (number: string, initialName?: string) => void;
  playRecording?: (call: any) => void;
  openProcessModal?: (call: any) => void;
  toggleRowDropdown?: (uniqueid: string) => void;
  fetchChronology?: (uniqueid: string) => void;
  setActiveDropdownCallId?: (id: string | null) => void;
  formatSeconds?: (sec: number) => string;
  showProcessingEvent?: (call: any) => void;
  reloadRegistry?: () => void;
  showLeadCall?: (linkedid: string) => void;
  filterCallsByNumber?: (number: string) => void;
  openDirectoryByName?: (name: string) => void;
  cdrDateTimeFormat?: 'dmy-dash' | 'dmy-short-dash' | 'dmy-dot' | 'dmy-slash' | 'ymd-dash';
  cdrShowSeconds?: boolean;
  cdrUseBrowserTimezone?: boolean;
  cdrHourCycle?: 12 | 24;
  cdrDensity?: 'compact' | 'standard' | 'comfortable';
  cdrTextScale?: 90 | 100 | 110;
  cdrStickyHeader?: boolean;
  cdrStripedRows?: boolean;
}

const formatSiteFormPhone=(value:any)=>{const digits=String(value||'').replace(/\D/g,'');if(digits.length===11&&digits.startsWith('7'))return`+7 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7,9)}-${digits.slice(9)}`;return digits?`+${digits}`:'—'};

export default function LegacyCDRTable({
  calls = [],
  siteFormLeads = [],
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
  showProcessingEvent = () => {},
  reloadRegistry = () => {},
  showLeadCall = () => {},
  filterCallsByNumber = () => {},
  openDirectoryByName = () => {},
  cdrDateTimeFormat = 'dmy-dash',
  cdrShowSeconds = true,
  cdrUseBrowserTimezone = false,
  cdrHourCycle = 24,
  cdrDensity = 'standard',
  cdrTextScale = 100,
  cdrStickyHeader = true,
  cdrStripedRows = true,
  formatSeconds = (sec: number) => {
    const n = Number(sec || 0);
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}: LegacyCDRTableProps) {
  const [expandedLeadIds, setExpandedLeadIds] = React.useState<number[]>([]);
  const canViewFullLead = ['su','admin'].includes(String(session?.role||'')) || session?.permissions?.view_site_form_leads === true;
  const canManageLead = ['su','admin'].includes(String(session?.role||'')) || session?.permissions?.manage_site_form_leads === true;
  const registryRows = [
    ...calls.map(call => ({ kind: 'call' as const, time: new Date(call.calldate).getTime(), call })),
    ...siteFormLeads.map(lead => ({ kind: 'lead' as const, time: new Date(String(lead.created_at).replace(' ', 'T')).getTime(), lead }))
  ].sort((left, right) => right.time - left.time);
  const markLeadSpam = async (leadId: number) => {
    if (!confirm('Отправить заявку в спам? Она исчезнет из реестра и статистики.')) return;
    try {
      const token = session?.token || '';
      const previewResponse = await fetch('/api/site-forms/leads/bulk-preview', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'spam', ids: [leadId] }) });
      const preview = await previewResponse.json();
      if (!previewResponse.ok) throw new Error(preview.error || 'Не удалось проверить заявку');
      const applyResponse = await fetch('/api/site-forms/leads/bulk-apply', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'spam', ids: preview.ids, previewToken: preview.previewToken }) });
      const result = await applyResponse.json();
      if (!applyResponse.ok) throw new Error(result.error || 'Не удалось отправить в спам');
      reloadRegistry();
    } catch (error: any) { alert(error.message || 'Ошибка'); }
  };
  return (
    <table className={`w-full border-collapse text-left cdr-density-${cdrDensity} cdr-text-${cdrTextScale}`}>
      <thead>
        <tr className={`border-b border-slate-200 bg-slate-50/95 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-[#1e293b]/95 dark:text-slate-400 ${cdrStickyHeader ? 'sticky top-0 z-10' : ''}`}>
          <th className="py-4 px-4">ВРЕМЯ ВЫЗОВА / ID</th>
          <th className="py-4 px-4 font-bold">КТО ЗВОНИЛ</th>
          <th className="py-4 px-4 font-bold">КУДА ЗВОНИЛ</th>
          <th className="py-4 px-4 font-bold">СТАТУС</th>
          <th className="py-4 px-4 font-bold">ЗАПИСЬ</th>
          <th className="py-4 px-4 font-bold">ДЛИТЕЛЬНОСТЬ</th>
          <th className="py-4 px-4 font-bold">КОММЕНТАРИЙ</th>
          <th className="py-4 px-4 font-bold">ЗАЯВКА</th>
          <th className="py-4 px-4 font-bold text-right pr-6">УПРАВЛЕНИЕ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/45 text-xs bg-white dark:bg-slate-900">
        {registryRows.map((entry, index) => {
          if (entry.kind === 'lead') {
            const lead = entry.lead, answered = Boolean(lead.first_answered_call_at), answeredLate = answered && ['late','overdue'].includes(String(lead.sla_status)), attempted = Boolean(lead.first_call_at), linkedCallId=String(lead.linked_call_id||''),normalizedPhone=String(lead.phone_normalized||lead.phone_raw||'').replace(/\D/g,''),displayPhone=formatSiteFormPhone(normalizedPhone),copyKey=`site-form-${lead.id}:${normalizedPhone}`;
            return <tr key={`site-form-${lead.id}`} className="bg-blue-50/70 transition-colors hover:bg-blue-100/70 dark:bg-blue-950/15">
              <td className="py-4 px-4 font-normal text-slate-705 dark:text-slate-350"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-3xs text-blue-600" title="Заявка из интернета"><Globe2 className="h-4.5 w-4.5"/></div><div className="flex flex-col"><span className="font-bold text-slate-800 dark:text-slate-200 text-[13px] tracking-tight">{new Date(String(lead.created_at).replace(' ','T')).toLocaleString('ru-RU')}</span><span className="text-[11px] text-slate-400 font-mono mt-0.5">ID: FORM-{lead.id}</span></div></div></td>
              <td className="px-4 py-3"><div className="flex items-center gap-1.5"><DirectoryTypeIcon type="client" className="h-4 w-4 text-slate-700 dark:text-slate-300"/><div className="font-black text-slate-800 dark:text-slate-100">{lead.customer_name||'Неизвестный абонент'}</div></div><div className="mt-1 flex flex-wrap items-center gap-1.5"><button onClick={()=>handleCopy(normalizedPhone,copyKey)} className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title={`Копировать ${displayPhone}`}>{copiedNumber===copyKey?<Check className="h-3.5 w-3.5 text-emerald-500"/>:<Copy className="h-3.5 w-3.5"/>}</button><span className="select-all font-mono font-bold text-slate-700 dark:text-slate-300">{displayPhone}</span><button onClick={()=>triggerClickToCall(normalizedPhone,lead.customer_name||'')} className="flex items-center gap-1 rounded-lg border border-emerald-250/30 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600"><PhoneCall className="h-2.5 w-2.5"/>Позвонить</button><button onClick={()=>openAddFromCall(normalizedPhone,lead.customer_name||'')} className="flex items-center gap-1 rounded-lg border border-indigo-200/30 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-650"><UserPlus className="h-2.5 w-2.5"/>Добавить</button></div></td>
              <td className="max-w-[300px] px-4 py-3"><div className={`${expandedLeadIds.includes(Number(lead.id))?'whitespace-pre-wrap':'line-clamp-2'} text-slate-700 dark:text-slate-200`}>{lead.message||'—'}</div><div className="mt-1 flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">{lead.form_name||'Форма сайта'}</span>{lead.message&&<button onClick={()=>setExpandedLeadIds(current=>current.includes(Number(lead.id))?current.filter(id=>id!==Number(lead.id)):[...current,Number(lead.id)])} className="text-[10px] font-black text-blue-600 hover:underline">{expandedLeadIds.includes(Number(lead.id))?'Свернуть':'Читать полностью'}</button>}</div></td>
              <td className="px-4 py-3"><button disabled={!linkedCallId} onClick={()=>linkedCallId&&showLeadCall(linkedCallId)} title={lead.sla_deadline_at?`SLA до ${new Date(String(lead.sla_deadline_at).replace(' ','T')).toLocaleString('ru-RU')}`:''} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold disabled:cursor-default ${answeredLate?'border-rose-200 bg-rose-50/40 text-rose-600':answered?'border-emerald-200 bg-emerald-50/40 text-emerald-600':lead.sla_status==='overdue'?'border-rose-200 bg-rose-50/40 text-rose-600':attempted?'border-amber-200 bg-amber-50/40 text-amber-600':'border-blue-200 bg-blue-50/40 text-blue-600'}`}>{answered?<CheckCircle className="h-3.5 w-3.5"/>:lead.sla_status==='overdue'?<Target className="h-3.5 w-3.5"/>:attempted?<PhoneCall className="h-3.5 w-3.5"/>:<Globe2 className="h-3.5 w-3.5"/>}{answered?'Обработано':lead.sla_status==='overdue'?'Потеряна':attempted?'Попытка связи':'Новая заявка'}</button></td>
              <td className="px-4 py-3 text-slate-300">—</td><td className="px-4 py-3 text-slate-300">—</td>
              <td className="px-4 py-3"><span className="inline-flex rounded-lg border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-blue-700">С сайта</span></td>
              <td className="px-4 py-3">{canViewFullLead?<a href={`/?tab=marketing&marketingTab=site-forms&leadId=${lead.id}`} className="font-black text-blue-600 hover:underline">Открыть</a>:<span className="text-[10px] font-bold text-slate-400">Реестр</span>}</td>
              <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><button onClick={()=>triggerClickToCall(lead.phone_normalized||lead.phone_raw,lead.customer_name||'')} className="rounded-lg bg-emerald-100 px-2 py-1.5 font-bold text-emerald-700">Позвонить</button>{canManageLead&&<button onClick={()=>void markLeadSpam(Number(lead.id))} className="rounded-lg bg-amber-100 px-2 py-1.5 font-bold text-amber-700">Спам</button>}</div></td>
            </tr>;
          }
          const call = entry.call;
          const handoffDirectoryEntry = call.logicalCall && call.transferTargetExt
            ? directory.find(entry => directoryEntryMatchesNumber(entry, call.transferTargetExt))
            : null;
          const displayCall = handoffDirectoryEntry
            ? { ...call, transferTargetLabel: handoffDirectoryEntry.name || call.transferTargetLabel }
            : call;
          const callLinkId = String(call.linkedid || call.uniqueid || '');
          const relatedLegs = calls.filter((leg: any) => {
            const legLinkId = String(leg.linkedid || leg.uniqueid || '');
            return callLinkId && legLinkId === callLinkId;
          });

          const rowVm = buildCdrRowViewModel(displayCall, directory, relatedLegs);

          const {
            isIncoming,
            isMissed,
            isOutgoing,
            displayedSrc,
            displayedDst,
            callerName,
            callerDirectoryName,
            callerType,
            isFound,
            calleeName,
            calleeDirectoryName,
            calleeType,
            isFoundDst,
            callDisp,
          } = rowVm;

          return (
            <tr
              key={call.uniqueid}
              className={`hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors ${
                isMissed && !call.processed && !call.wasCallbacked
                  ? 'bg-rose-500/[0.015]'
                    : !cdrStripedRows || index % 2 === 0
                    ? 'bg-white dark:bg-slate-900'
                    : 'bg-slate-50/60 dark:bg-slate-800/25'
              }`}
            >
              {/* Column 1: TIME AND ID */}
              <CDRTimeCell
                calldate={call.calldate}
                uniqueid={call.uniqueid}
                isIncoming={isIncoming}
                isOutgoing={isOutgoing}
                fetchChronology={fetchChronology}
                dateTimeFormat={cdrDateTimeFormat}
                showSeconds={cdrShowSeconds}
                useBrowserTimezone={cdrUseBrowserTimezone}
                hourCycle={cdrHourCycle}
              />

              {/* Column 2: WHO CALLED (Кто звонил) */}
              <CDRCallerCell
                callerName={callerName}
                callerDirectoryName={callerDirectoryName}
                callerType={callerType}
                displayedSrc={displayedSrc}
                copiedKey={`${call.uniqueid}:${displayedSrc}`}
                copiedNumber={copiedNumber}
                isFound={isFound}
                handleCopy={handleCopy}
                triggerClickToCall={triggerClickToCall}
                openAddFromCall={openAddFromCall}
                filterCallsByNumber={filterCallsByNumber}
                openDirectoryByName={openDirectoryByName}
              />

              {/* Column 3: Callee display (Куда звонил) */}
              <CDRCalleeCell
                call={displayCall}
                calleeName={calleeName}
                calleeDirectoryName={calleeDirectoryName}
                calleeType={calleeType}
                displayedDst={displayedDst}
                isFoundDst={isFoundDst}
                triggerClickToCall={triggerClickToCall}
                openAddFromCall={openAddFromCall}
                filterCallsByNumber={filterCallsByNumber}
                openDirectoryByName={openDirectoryByName}
              />

              {/* Column 4: REKHEM (СТАТУС) */}
              <CDRStatusCell
                isMissed={isMissed}
                callDisp={callDisp}
                processed={call.processed}
                wasCallbacked={call.wasCallbacked}
                wasKpiResolved={call.wasKpiResolved}
                callbackTime={call.callbackTime}
                callbackStatus={call.callbackStatus}
                logicalStatus={call.logicalStatus}
                onShowProcessingEvent={() => showProcessingEvent(call)}
              />

              {/* Column 5: ЗАПИСЬ */}
              <CDRRecordingCell
                call={call}
                playingCallId={playingCallId}
                isAudioPaused={isAudioPaused}
                playRecording={playRecording}
              />

              {/* Column 5b: ДЛИТЕЛЬНОСТЬ */}
              <CDRDurationCell
                duration={call.duration}
                billsec={call.billsec}
                aiTalkDuration={call.logicalCall ? call.aiTalkDuration : undefined}
                humanTalkDuration={call.logicalCall ? call.humanTalkDuration : undefined}
                formatSeconds={formatSeconds}
              />

              {/* Column 6: COMMENT */}
              <CDRCommentCell
                comment={call.comment}
                processedBy={call.processedBy}
                processedAt={call.processedAt}
              />

              <td className="px-4 py-3 text-xs">
                {call.siteFormLeadId ? <a href={`/?tab=marketing&marketingTab=site-forms&leadId=${call.siteFormLeadId}`} className="font-black text-blue-600 hover:underline" title={call.siteFormName || 'Заявка с сайта'}>#{call.siteFormLeadId}{call.siteFormExternalResultId ? ` · ${call.siteFormExternalResultId}` : ''}</a> : <span className="text-slate-300">—</span>}
              </td>

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
