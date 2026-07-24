export type AiHandoffMetadata = {
  handoffId: number;
  voiceSessionId: number;
  linkedid: string;
  aiExtension: string;
  agentId: number;
  agentName: string;
  agentVersionId: number;
  destinationType: string;
  destinationId: string;
  destinationName: string;
  state: string;
  dialStatus: string | null;
  outcome: string | null;
  requestedAt: string | null;
  announcementFinishedAt: string | null;
  dialingAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
};

export type AiHandoffLogicalStatus =
  | 'human_handoff_answered'
  | 'human_handoff_no_answer'
  | 'human_handoff_busy'
  | 'human_handoff_failed'
  | 'human_handoff_declined'
  | 'human_handoff_returned_to_ai';

const dateMs = (value: unknown): number => {
  const ms = new Date(String(value || '').replace(' ', 'T')).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const addSeconds = (value: unknown, seconds: unknown): number =>
  dateMs(value) + Math.max(0, Number(seconds || 0)) * 1000;

const normalizedDialStatus = (metadata: AiHandoffMetadata): string =>
  String(metadata.dialStatus || '').trim().toUpperCase();

export function getAiHandoffLogicalStatus(metadata: AiHandoffMetadata): AiHandoffLogicalStatus {
  const state = String(metadata.state || '').toLowerCase();
  const outcome = String(metadata.outcome || '').toLowerCase();
  const dialStatus = normalizedDialStatus(metadata);
  if (state === 'completed' || outcome === 'transferred_to_human' || dialStatus === 'ANSWER') return 'human_handoff_answered';
  if (dialStatus === 'NOANSWER' || dialStatus === 'NO ANSWER') return outcome === 'returned_to_ai' ? 'human_handoff_returned_to_ai' : 'human_handoff_no_answer';
  if (dialStatus === 'BUSY') return outcome === 'returned_to_ai' ? 'human_handoff_returned_to_ai' : 'human_handoff_busy';
  if (outcome === 'declined' || state === 'declined' || state === 'cancelled') return 'human_handoff_declined';
  if (outcome === 'returned_to_ai') return 'human_handoff_returned_to_ai';
  return 'human_handoff_failed';
}

export const isAiHandoffTechnicalLeg = (leg: any): boolean => {
  const channel = `${leg?.channel || ''} ${leg?.dstchannel || ''}`;
  const context = String(leg?.dcontext || '').toLowerCase();
  const destination = String(leg?.dst || '');
  const application = String(leg?.lastapp || '').toLowerCase();
  const data = String(leg?.lastdata || '');
  return /^AudioSocket\//i.test(String(leg?.channel || ''))
    || /Local\/handoff-[a-f0-9]+@pbxpuls-ai-handoff-target/i.test(channel)
    || /^handoff-[a-f0-9]+$/i.test(destination)
    || context === 'pbxpuls-ai-handoff'
    || context === 'pbxpuls-ai-handoff-target'
    || context === 'sub-record-check'
    || destination === 'recordcheck'
    || (destination === 's' && (application === 'stasis' || /pbxpuls-ai-control/i.test(data)));
};

export function aggregateAiHandoffLogicalCall(legs: any[], metadata: AiHandoffMetadata): any | null {
  if (!legs.length || !metadata) return null;
  const sorted = [...legs].sort((a, b) => dateMs(a.calldate) - dateMs(b.calldate));
  const linkedid = String(metadata.linkedid || sorted[0]?.linkedid || sorted[0]?.uniqueid || '');
  const aiLeg = sorted.find(leg =>
    String(leg.dcontext || '').toLowerCase() === 'pbxpuls-ai'
    || /pbxpuls-ai-control/i.test(String(leg.lastdata || ''))
    || String(leg.dst || '') === String(metadata.aiExtension)
  );
  if (!aiLeg) return null;

  const callerLeg = sorted.find(leg =>
    String(leg.uniqueid || '') === linkedid
    && !isAiHandoffTechnicalLeg(leg)
  ) || aiLeg;
  const destinationLeg = sorted.find(leg =>
    String(leg.dst || '') === String(metadata.destinationId)
    && !/AudioSocket\//i.test(String(leg.channel || ''))
  );
  const recordingLeg = sorted.find(leg =>
    String(leg.recordingfile || '').trim()
    && String(leg.dst || '') === String(metadata.destinationId)
  ) || sorted.find(leg => String(leg.recordingfile || '').trim());

  const startMs = Math.min(...sorted.map(leg => dateMs(leg.calldate)).filter(Boolean));
  const cdrEndMs = Math.max(...sorted.map(leg => addSeconds(leg.calldate, leg.duration)));
  const metadataEndMs = Math.max(
    dateMs(metadata.endedAt),
    dateMs(metadata.answeredAt),
    dateMs(metadata.dialingAt),
    dateMs(metadata.requestedAt)
  );
  const metadataCloseToCdr = metadataEndMs >= cdrEndMs && metadataEndMs - cdrEndMs <= 2000;
  const endMs = destinationLeg
    ? (metadataCloseToCdr ? metadataEndMs : cdrEndMs)
    : Math.max(cdrEndMs, metadataEndMs);
  const requestedMs = dateMs(metadata.requestedAt || metadata.dialingAt);
  const status = getAiHandoffLogicalStatus(metadata);
  const answered = status === 'human_handoff_answered';
  const answeredMs = answered && destinationLeg
    ? addSeconds(destinationLeg.calldate, Math.max(0, Number(destinationLeg.duration || 0) - Number(destinationLeg.billsec || 0)))
    : dateMs(metadata.answeredAt);
  const humanTalkDuration = answered
    ? Math.max(0, Number(destinationLeg?.billsec || (answeredMs && endMs ? Math.round((endMs - answeredMs) / 1000) : 0)))
    : 0;
  const humanRingDuration = requestedMs && answeredMs ? Math.max(0, Math.round((answeredMs - requestedMs) / 1000)) : 0;
  const aiTalkDuration = Math.max(0, Number(aiLeg?.billsec || 0));
  const aiPhaseDuration = requestedMs && startMs
    ? Math.max(0, Math.round((requestedMs - startMs) / 1000))
    : Math.max(0, Number(aiLeg?.duration || 0));
  const totalDuration = startMs && endMs ? Math.max(0, Math.round((endMs - startMs) / 1000)) : 0;
  const hiddenTechnicalLegs = sorted.filter(isAiHandoffTechnicalLeg);

  return {
    ...callerLeg,
    uniqueid: linkedid,
    linkedid,
    calldate: callerLeg.calldate || sorted[0].calldate,
    src: String(callerLeg.src || aiLeg.src || ''),
    dst: String(metadata.aiExtension || aiLeg.dst || ''),
    disposition: answered || String(aiLeg.disposition || '').toUpperCase() === 'ANSWERED' ? 'ANSWERED' : (destinationLeg?.disposition || aiLeg.disposition || 'NO ANSWER'),
    duration: totalDuration,
    billsec: aiTalkDuration + humanTalkDuration,
    recordingfile: String(recordingLeg?.recordingfile || ''),
    answered,
    missed: false,
    lost: false,
    processed: true,
    logicalCall: true,
    logicalStatus: status,
    initialDestination: String(metadata.aiExtension || aiLeg.dst || ''),
    finalDestination: String(metadata.destinationId || destinationLeg?.dst || ''),
    aiExtension: String(metadata.aiExtension || ''),
    aiAgentId: metadata.agentId,
    aiAgentName: metadata.agentName,
    aiAgentVersionId: metadata.agentVersionId,
    handoffId: metadata.handoffId,
    handoffAnswered: answered,
    handoffOutcome: metadata.outcome,
    handoffDialStatus: metadata.dialStatus,
    handoffDestinationType: metadata.destinationType,
    handoffDestinationId: metadata.destinationId,
    handoffDestinationName: metadata.destinationName,
    wasTransferred: answered,
    transferType: 'ai_handoff',
    transferTargetExt: metadata.destinationId,
    transferTargetLabel: metadata.destinationName,
    aiPhaseDuration,
    aiTalkDuration,
    transferSetupDuration: requestedMs && dateMs(metadata.dialingAt)
      ? Math.max(0, Math.round((dateMs(metadata.dialingAt) - requestedMs) / 1000))
      : 0,
    humanRingDuration,
    humanTalkDuration,
    totalLogicalDuration: totalDuration,
    technicalLegsCount: hiddenTechnicalLegs.length,
    technicalLegs: hiddenTechnicalLegs,
    cdrLegsCount: sorted.length
  };
}

export function buildAiHandoffTimeline(legs: any[], metadata: AiHandoffMetadata) {
  const sorted = [...legs].sort((a, b) => dateMs(a.calldate) - dateMs(b.calldate));
  const aiLeg = sorted.find(leg => /pbxpuls-ai-control/i.test(String(leg.lastdata || '')) || String(leg.dst || '') === metadata.aiExtension);
  const destinationLeg = sorted.find(leg => String(leg.dst || '') === metadata.destinationId && !/^AudioSocket\//i.test(String(leg.channel || '')));
  const startAt = aiLeg?.calldate || sorted[0]?.calldate;
  const aiAnsweredAt = aiLeg
    ? new Date(addSeconds(aiLeg.calldate, Math.max(0, Number(aiLeg.duration || 0) - Number(aiLeg.billsec || 0)))).toISOString()
    : null;
  const destinationAnsweredAt = destinationLeg
    ? new Date(addSeconds(destinationLeg.calldate, Math.max(0, Number(destinationLeg.duration || 0) - Number(destinationLeg.billsec || 0)))).toISOString()
    : metadata.answeredAt;
  const completedAt = destinationLeg
    ? new Date(addSeconds(destinationLeg.calldate, destinationLeg.duration)).toISOString()
    : metadata.endedAt;
  const events = [
    startAt && { at: startAt, type: 'ai_call_started', title: `Внутренний звонок ${aiLeg?.src || '—'} → AI ${metadata.aiExtension}` },
    aiAnsweredAt && { at: aiAnsweredAt, type: 'ai_answered', title: `${metadata.agentName || 'AI-сотрудник'} ответил` },
    metadata.requestedAt && { at: metadata.requestedAt, type: 'handoff_requested', title: `AI начал перевод на ${metadata.destinationId}` },
    metadata.dialingAt && { at: metadata.dialingAt, type: 'handoff_dialing', title: `Вызов направлен на ${metadata.destinationName || metadata.destinationId}` },
    destinationAnsweredAt && getAiHandoffLogicalStatus(metadata) === 'human_handoff_answered'
      ? { at: destinationAnsweredAt, type: 'handoff_answered', title: `Сотрудник ${metadata.destinationId} ответил` }
      : null,
    completedAt && { at: completedAt, type: 'call_completed', title: 'Разговор завершён' }
  ].filter(Boolean);
  return {
    events,
    technicalEvents: sorted.map(leg => ({ ...leg, technical: isAiHandoffTechnicalLeg(leg) }))
  };
}
