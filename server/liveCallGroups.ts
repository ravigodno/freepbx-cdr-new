function endpointExtension(value: unknown): string {
  const text = String(value || '');
  return text.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i)?.[1]
    || text.match(/Local\/([0-9]{2,5})@/i)?.[1]
    || '';
}

function digits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function channelTimestamp(channel: Record<string, any>): number {
  const value = String(channel.Uniqueid || channel.Linkedid || '').split('.')[0];
  return /^\d{9,}$/.test(value) ? Number(value) : 0;
}

function isInboundRingGroupRoot(channel: Record<string, any>, operatorExt: string): boolean {
  const caller = digits(channel.CallerIDNum);
  const appData = String(channel.ApplicationData || '');
  return caller.length >= 7
    && digits(channel.Exten).length >= 2
    && /(?:SIP|PJSIP)\//i.test(appData)
    && appData.includes('&')
    && (appData.includes(`SIP/${operatorExt}`) || appData.includes(`PJSIP/${operatorExt}`));
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
  const ext = digits(operatorExt);
  const grouped = new Map<string, T[]>();
  channels.forEach(channel => {
    const key = String(channel.Linkedid || channel.Uniqueid || channel.Channel || '').trim();
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(channel);
  });
  const groups = Array.from(grouped.values());
  const consumed = new Set<T[]>();
  const correlated: T[][] = [];

  groups.forEach(rootGroup => {
    const root = rootGroup.find(channel => isInboundRingGroupRoot(channel, ext));
    if (!root) return;
    const ringGroup = digits(root.Exten);
    const rootTime = channelTimestamp(root);
    const operatorBranches = groups.filter(group => group !== rootGroup && group.some(channel => {
      const timestamp = channelTimestamp(channel);
      return endpointExtension(channel.Channel) === ext
        && digits(channel.Exten) === ringGroup
        && (!rootTime || !timestamp || Math.abs(timestamp - rootTime) <= 10);
    }));
    correlated.push([...rootGroup, ...operatorBranches.flat()]);
    consumed.add(rootGroup);
    operatorBranches.forEach(group => consumed.add(group));
  });

  return [
    ...correlated,
    ...groups.filter(group => !consumed.has(group) && liveChannelGroupHasOperator(group, ext))
  ];
}

export function preserveLiveCallCandidate<T extends Record<string, any>>(raw: T, enriched: T | null | undefined): T {
  if (!enriched || enriched.active !== true) return raw;
  return { ...raw, ...enriched };
}

export function synchronizeIncomingCallerIdentity<T extends Record<string, any>>(
  banner: T,
  resolveContact: (number: string) => Record<string, any>
): T {
  if (banner.active !== true || banner.direction !== 'incoming') return banner;

  const technicalNumbers = new Set([digits(banner.did), digits(banner.trunkNumber)].filter(Boolean));
  const callerNumber = [banner.externalCallerNumber, banner.sourceNumber, banner.callerNumber, banner.displayNumber, banner.number]
    .map(digits)
    .find(value => value.length >= 7 && !technicalNumbers.has(value)) || '';
  if (!callerNumber) return banner;

  const contact = resolveContact(callerNumber) || {};
  const displayName = String(contact.name || '').trim();
  return {
    ...banner,
    number: callerNumber,
    callerNumber,
    externalCallerNumber: callerNumber,
    internalCaller: '',
    sourceNumber: callerNumber,
    displayNumber: callerNumber,
    displayName,
    callerDisplayName: displayName,
    callerCompany: String(contact.company || ''),
    callerPosition: String(contact.position || ''),
    callerDirectoryFields: contact.fields || {},
    contactType: String(contact.type || ''),
    contactComment: String(contact.comment || ''),
    isSpam: contact.isSpam === true,
    isBlacklisted: contact.isBlacklisted === true,
    company: String(contact.company || ''),
    position: String(contact.position || '')
  };
}
