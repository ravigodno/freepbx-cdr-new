const eventMillis = (value:any):number => value instanceof Date ? value.getTime() : new Date(/^\d{4}-\d{2}-\d{2} /.test(String(value)) ? String(value).replace(' ','T') : String(value)).getTime();
/** Historical evidence only. Route configuration is never proof of a dial/answer. */
export function endpointExtension(channel: unknown): string {
  return String(channel || '').match(/^(?:SIP|PJSIP)\/(\d{2,6})-[^/]+$/i)?.[1] || '';
}
export function resolveCallAnswerEvidence(legs: any[] = [], cel: any[] = [], routeNumbers: string[] = []) {
  const excluded = new Set(routeNumbers.map(String));
  for (const row of legs) if (/^(ext-group|ext-queues)$/.test(String(row.dcontext)) || String(row.lastapp).toUpperCase() === 'QUEUE') excluded.add(String(row.dst));
  const ext = (channel: unknown) => { const value = endpointExtension(channel); return excluded.has(value) ? '' : value; };
  const linkedids = new Set(legs.map(row => String(row.linkedid || '')).filter(Boolean));
  const events = cel.filter(row => !linkedids.size || !row.linkedid || linkedids.has(String(row.linkedid)))
    .slice().sort((a,b) => (eventMillis(a.eventtime)-eventMillis(b.eventtime)) || Number(a.id || 0)-Number(b.id || 0));
  const observed = new Set<string>();
  for (const row of legs) { const value = ext(row.dstchannel); if (value) observed.add(value); }
  for (const row of events) { const value = ext(row.channame); if (value) observed.add(value); }
  const callerChannels = new Set(legs.map(row=>String(row.channel||'')));
  const destinations = new Set(legs.map(row=>String(row.dstchannel||'')));
  const answers: Array<{extension:string;channel:string;source:'cel_bridge'|'cdr';connectedSeconds:number|null}> = [];
  for (const row of events) {
    if (String(row.eventtype).toUpperCase() !== 'BRIDGE_ENTER') continue;
    const extension = ext(row.channame);
    if (!extension || (callerChannels.has(String(row.channame)) && !destinations.has(String(row.channame)))) continue;
    // The endpoint must share the bridge with another observed channel (or explicit peer).
    const peer = row.peer || events.find(other => other !== row && other.eventtype === 'BRIDGE_ENTER' && eventMillis(other.eventtime) === eventMillis(row.eventtime) && other.channame !== row.channame)?.channame;
    if (!peer || peer === row.channame) continue;
    const end = events.find(other => other.channame === row.channame && ['BRIDGE_EXIT','HANGUP','CHAN_END'].includes(String(other.eventtype).toUpperCase()) && eventMillis(other.eventtime) >= eventMillis(row.eventtime));
    const elapsed = end ? (eventMillis(end.eventtime)-eventMillis(row.eventtime))/1000 : NaN;
    answers.push({extension,channel:row.channame,source:'cel_bridge',connectedSeconds:Number.isFinite(elapsed)?Math.max(0,elapsed):null});
  }
  // CEL with a bridge is authoritative. Incomplete/no bridge CEL permits explicitly labelled CDR evidence.
  if (!answers.length) for (const row of legs) {
    if (String(row.disposition).toUpperCase() !== 'ANSWERED') continue;
    const extension = ext(row.dstchannel);
    if (!extension) continue; // announcement, IVR, trunk and Local wrappers are not employee answers
    answers.push({extension,channel:row.dstchannel,source:'cdr',connectedSeconds:null});
  }
  return { answeredExt:answers[0]?.extension || '', source:answers[0]?.source || 'unknown', connectedSeconds:answers[0]?.connectedSeconds ?? null,
    observedExtensions:[...observed], answeredExtensions:[...new Set(answers.map(row=>row.extension))], answers,
    uncertainty:answers[0]?.source === 'cel_bridge' ? null : 'Нет подтверждённого соединения каналов CEL' };
}
export function historicalMemberStatus(extension: unknown, evidence: ReturnType<typeof resolveCallAnswerEvidence>): string {
  const value=String(extension);
  if(evidence.answeredExtensions.includes(value))return 'Ответил';
  if(!evidence.observedExtensions.includes(value))return 'Нет данных о вызове';
  return evidence.answeredExt ? 'Вызван; ответил другой участник' : 'Вызван; ответ не подтверждён';
}
