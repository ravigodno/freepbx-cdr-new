export function selectAiVoiceCallerLeg(group: any[]): any | null {
  if (!Array.isArray(group) || group.length < 2) return null;

  const callerLeg = group.find(c =>
    String(c?.dcontext || '').toLowerCase() === 'pbxpuls-ai'
    && /^(?:SIP|PJSIP|IAX2)\/[0-9]{2,5}-/i.test(String(c?.channel || ''))
    && /(?:^|,)ai_extension:[0-9]{2,8}(?:,|$)/i.test(String(c?.lastdata || ''))
  );
  if (!callerLeg) return null;

  const containsMediaLeg = group.some(c => /^AudioSocket\//i.test(String(c?.channel || '')));
  const containsOnlyCallerAndMediaLegs = group.every(c =>
    c === callerLeg
    || (
      /^AudioSocket\//i.test(String(c?.channel || ''))
      && /(?:^|,)pbxpuls-ai-control(?:,|$)/i.test(String(c?.lastdata || ''))
    )
  );

  return containsMediaLeg && containsOnlyCallerAndMediaLegs ? callerLeg : null;
}

export function selectAiVoiceEvaluationLeg(group: any[]): any | null {
  if (!Array.isArray(group) || group.length < 3) return null;
  const callerLeg = group.find(c =>
    ['pbxpuls-ai', 'pbxpuls-ai-evaluation'].includes(String(c?.dcontext || '').toLowerCase())
    && /^Local\/[0-9]{2,8}@pbxpuls-ai-/i.test(String(c?.channel || ''))
    && /^[0-9]{2,8}$/.test(String(c?.dst || ''))
    && /(?:^|,)pbxpuls-ai-control(?:,|$)/i.test(String(c?.lastdata || ''))
  );
  const evaluatorMedia = group.some(c =>
    /^AudioSocket\//i.test(String(c?.channel || ''))
    && /(?:^|,)pbxpuls-dima-evaluator-[0-9]+(?:,|$)/i.test(String(c?.lastdata || ''))
  );
  const agentMedia = group.some(c =>
    /^AudioSocket\//i.test(String(c?.channel || ''))
    && /(?:^|,)pbxpuls-ai-control(?:,|$)/i.test(String(c?.lastdata || ''))
  );
  return callerLeg && evaluatorMedia && agentMedia
    ? { ...callerLeg, src: '998', callerid: 'AI Quality <998>' }
    : null;
}
