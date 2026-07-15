export type LiveCallDirection = 'incoming' | 'outgoing' | 'internal';

export interface LiveCallDirectionResolution {
  direction: LiveCallDirection;
  internalCaller: string;
  destinationNumber: string;
  trunkNumber: string;
}

export function stripLiveTechnicalAddresses(value: unknown): string {
  return String(value ?? '').replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, ' ');
}

export function selectLiveOutgoingDestination(
  resolution: LiveCallDirectionResolution,
  candidates: unknown[]
): string {
  const internalCaller = normalizeNumber(resolution.internalCaller);
  const trunkNumber = normalizeNumber(resolution.trunkNumber);
  return [resolution.destinationNumber, ...candidates]
    .flatMap(value => numberCandidates(value))
    .find(number => isExternal(number) && number !== internalCaller && number !== trunkNumber) || '';
}

function normalizeNumber(value: string): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits;
}

function numberCandidates(...values: unknown[]): string[] {
  const result: string[] = [];
  values.forEach(value => {
    const matches = stripLiveTechnicalAddresses(value).match(/\+?\d{2,15}/g) || [];
    matches.map(normalizeNumber).filter(Boolean).forEach(number => {
      if (!result.includes(number)) result.push(number);
    });
  });
  return result;
}

function isInternal(number: string): boolean {
  return number.length >= 2 && number.length <= 5;
}

function isExternal(number: string): boolean {
  return number.length >= 7 && number.length <= 15;
}

function isTrunkCandidate(number: string): boolean {
  return number.length >= 6 && number.length <= 15;
}

function read(row: any, ...fields: string[]): unknown {
  for (const field of fields) {
    if (row?.[field] !== undefined && row?.[field] !== null && String(row[field]).trim()) return row[field];
  }
  return '';
}

function rowContext(row: any): string {
  return String(read(row, 'Context', 'context', 'dcontext')).toLowerCase();
}

function rowChannel(row: any): string {
  return String(read(row, 'Channel', 'channel', 'channame'));
}

function endpointExtension(row: any): string {
  const channel = rowChannel(row);
  const endpoint = channel.match(/(?:SIP|PJSIP)\/([0-9]{2,5})-/i)?.[1] ||
    channel.match(/Local\/([0-9]{2,5})@/i)?.[1] || '';
  return isInternal(endpoint) ? endpoint : '';
}

function explicitCallerExtension(row: any): string {
  return numberCandidates(read(row, 'CallerIDNum', 'callerId', 'caller', 'cid', 'cid_num', 'src', 'cnum'))
    .find(isInternal) || '';
}

function directDestinationCandidates(row: any): string[] {
  return numberCandidates(
    read(row, 'Exten', 'exten', 'dst'),
    read(row, 'ApplicationData', 'appData', 'applicationData', 'lastdata')
  );
}

function explicitDestinationCandidates(row: any): string[] {
  return numberCandidates(read(row, 'Exten', 'exten', 'dst'));
}

function followMePrimaryDestination(row: any): string {
  const evidence = [
    rowChannel(row),
    read(row, 'ApplicationData', 'appData', 'applicationData', 'lastdata')
  ].map(String).join(' ');
  const extension = evidence.match(/(?:Local\/)?FMPR-([0-9]{2,5})(?:@|\b)/i)?.[1] || '';
  return isInternal(extension) ? extension : '';
}

function isOutboundContext(context: string): boolean {
  return context.includes('from-internal') || context.includes('outbound') ||
    context.includes('dialout') || context.includes('macro-dialout');
}

function isInboundContext(context: string): boolean {
  return context.includes('from-trunk') || context.includes('from-pstn') || context.includes('from-did') ||
    context.includes('sip-external') || context.includes('from-digital') || context.includes('from-outside');
}

function isInboundTrunkChannel(row: any): boolean {
  return /(?:SIP|PJSIP)\/[^/\s]*-in-[0-9a-f]+/i.test(rowChannel(row));
}

function inboundTrunkNumber(row: any): string {
  const raw = rowChannel(row).match(/(?:SIP|PJSIP)\/([^/\s]+?)-in-[0-9a-f]+/i)?.[1] || '';
  const number = normalizeNumber(raw);
  return isTrunkCandidate(number) ? number : '';
}

function isInboundRouteContext(context: string): boolean {
  return context === 'ext-queues' || context === 'ext-group' || context === 'ext-local' || context.startsWith('ivr-');
}

function allGroupNumbers(group: any[]): string[] {
  return numberCandidates(...group.flatMap(row => [
    read(row, 'CallerIDNum', 'callerId', 'caller', 'cid', 'src', 'cnum'),
    read(row, 'ConnectedLineNum', 'connectedLineNum', 'callerid'),
    read(row, 'Exten', 'exten', 'dst'),
    read(row, 'ApplicationData', 'appData', 'applicationData', 'lastdata')
  ]));
}

export function detectLiveCallDirection(group: any[], operatorExt = ''): LiveCallDirectionResolution {
  const rows = Array.isArray(group) ? group.filter(Boolean) : [];
  const operator = normalizeNumber(operatorExt);

  // Follow Me places its parallel external destinations into ApplicationData.
  // A direct internal Exten/dst remains the authoritative dialed destination.
  for (const row of rows) {
    const explicitCaller = explicitCallerExtension(row);
    const endpoint = endpointExtension(row);
    const internalCaller = explicitCaller || endpoint;
    const internalDestination = explicitDestinationCandidates(row)
      .find(number => isInternal(number) && number !== internalCaller)
      || followMePrimaryDestination(row);
    if (internalCaller && internalDestination) {
      return { direction: 'internal', internalCaller, destinationNumber: internalDestination, trunkNumber: '' };
    }
  }

  for (const row of rows) {
    const context = rowContext(row);
    const explicitCaller = explicitCallerExtension(row);
    const endpoint = endpointExtension(row);
    const destination = directDestinationCandidates(row).find(isExternal) || '';
    const internalCaller = explicitCaller || (isOutboundContext(context) ? endpoint : '');

    if (internalCaller && destination && (isOutboundContext(context) || internalCaller === operator)) {
      const trunkNumber = allGroupNumbers(rows).find(number => isTrunkCandidate(number) && number !== destination) || '';
      return { direction: 'outgoing', internalCaller, destinationNumber: destination, trunkNumber };
    }
  }

  // During a real inbound call FreePBX may already move the trunk leg to
  // macro-dial-one. The original SIP/<trunk>-in-* channel remains the reliable
  // inbound evidence. Outgoing is checked above first, because this PBX also
  // uses a trunk name ending in "-in" for outbound calls.
  const hasExplicitInboundContext = rows.some(row => isInboundContext(rowContext(row)) || isInboundTrunkChannel(row));
  const hasInboundRouteWithExternalCaller = rows.some(row => {
    const context = rowContext(row);
    const caller = numberCandidates(read(row, 'CallerIDNum', 'callerId', 'caller', 'cid', 'cid_num', 'src', 'cnum')).find(isExternal);
    return isInboundRouteContext(context) && Boolean(caller);
  });

  if (hasExplicitInboundContext || hasInboundRouteWithExternalCaller) {
    const destinationNumber = rows.flatMap(directDestinationCandidates).find(isInternal) || '';
    const trunkNumber = rows.map(inboundTrunkNumber).find(Boolean) || '';
    return { direction: 'incoming', internalCaller: '', destinationNumber, trunkNumber };
  }

  for (const row of rows) {
    const explicitCaller = explicitCallerExtension(row);
    const endpoint = endpointExtension(row);
    const internalCaller = explicitCaller || endpoint;
    const destination = directDestinationCandidates(row).find(number => isInternal(number) && number !== internalCaller) || '';
    if (internalCaller && destination) {
      return { direction: 'internal', internalCaller, destinationNumber: destination, trunkNumber: '' };
    }
  }

  const externalDestination = rows.flatMap(directDestinationCandidates).find(isExternal) || '';
  if (externalDestination) {
    const internalCaller = rows.map(row => explicitCallerExtension(row) || endpointExtension(row)).find(Boolean) || '';
    const trunkNumber = allGroupNumbers(rows).find(number => isTrunkCandidate(number) && number !== externalDestination) || '';
    return { direction: 'outgoing', internalCaller, destinationNumber: externalDestination, trunkNumber };
  }

  const internalCaller = rows.map(row => explicitCallerExtension(row) || endpointExtension(row)).find(Boolean) || '';
  const destinationNumber = allGroupNumbers(rows).find(number => isInternal(number) && number !== internalCaller) || '';
  return { direction: 'internal', internalCaller, destinationNumber, trunkNumber: '' };
}
