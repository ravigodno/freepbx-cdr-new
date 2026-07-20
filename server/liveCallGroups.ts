function endpointExtension(value: unknown): string {
  const text = String(value || '');
  return text.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i)?.[1]
    || text.match(/Local\/([0-9]{2,5})@/i)?.[1]
    || '';
}

function digits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function liveChannelGroupHasOperator(group: Record<string, any>[], operatorExt: unknown): boolean {
  const ext = digits(operatorExt);
  if (!ext) return false;
  return group.some(channel => {
    const appData = String(channel.ApplicationData || '');
    return endpointExtension(channel.Channel) === ext
      || appData.includes(`SIP/${ext}`)
      || appData.includes(`PJSIP/${ext}`)
      || appData.includes(`Local/${ext}@`)
      || digits(channel.CallerIDNum) === ext
      || digits(channel.ConnectedLineNum) === ext
      || digits(channel.Exten) === ext;
  });
}

export function groupLiveChannelsForOperator<T extends Record<string, any>>(channels: T[], operatorExt: unknown): T[][] {
  const grouped = new Map<string, T[]>();
  channels.forEach(channel => {
    const key = String(channel.Linkedid || channel.Uniqueid || channel.Channel || '').trim();
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(channel);
  });
  return Array.from(grouped.values()).filter(group => liveChannelGroupHasOperator(group, operatorExt));
}

export function preserveLiveCallCandidate<T extends Record<string, any>>(raw: T, enriched: T | null | undefined): T {
  if (!enriched || enriched.active !== true) return raw;
  return { ...raw, ...enriched };
}
