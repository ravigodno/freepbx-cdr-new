export type LiveCallDirection = 'incoming' | 'outgoing' | 'internal';

export interface LiveCallDirectionResolution {
  direction: LiveCallDirection;
  internalCaller: string;
  destinationNumber: string;
  trunkNumber: string;
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
    const matches = String(value ?? '').match(/\+?\d{2,15}/g) || [];
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
  return numberCandidates(read(row, 'CallerIDNum', 'callerId', 'caller', 'cid', 'src', 'cnum'))
    .find(isInternal) || '';
}

function directDestinationCandidates(row: any): string[] {
  return numberCandidates(
    read(row, 'Exten', 'exten', 'dst'),
    read(row, 'ApplicationData', 'appData', 'applicationData', 'lastdata')
  );
}

function isOutboundContext(context: string): boolean {
  return context.includes('from-internal') || context.includes('outbound') ||
    context.includes('dialout') || context.includes('macro-dialout');
}

function isInboundContext(context: string): boolean {
  return context.includes('from-trunk') || context.includes('from-pstn') || context.includes('from-did') ||
    context.includes('sip-external') || context.includes('from-digital') || context.includes('from-outside');
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

  for (const row of rows) {
    const context = rowContext(row);
    const explicitCaller = explicitCallerExtension(row);
    const endpoint = endpointExtension(row);
    const destination = directDestinationCandidates(row).find(isExternal) || '';
    const internalCaller = explicitCaller || (isOutboundContext(context) ? endpoint : '');

    if (internalCaller && destination && (isOutboundContext(context) || internalCaller === operator)) {
      const trunkNumber = allGroupNumbers(rows).find(number => isExternal(number) && number !== destination) || '';
      return { direction: 'outgoing', internalCaller, destinationNumber: destination, trunkNumber };
    }
  }

  const hasExplicitInboundContext = rows.some(row => isInboundContext(rowContext(row)));
  const hasInboundRouteWithExternalCaller = rows.some(row => {
    const context = rowContext(row);
    const caller = numberCandidates(read(row, 'CallerIDNum', 'callerId', 'caller', 'cid', 'src', 'cnum')).find(isExternal);
    return isInboundRouteContext(context) && Boolean(caller);
  });

  if (hasExplicitInboundContext || hasInboundRouteWithExternalCaller) {
    const destinationNumber = rows.flatMap(directDestinationCandidates).find(isInternal) || operator;
    return { direction: 'incoming', internalCaller: '', destinationNumber, trunkNumber: '' };
  }

  for (const row of rows) {
    const explicitCaller = explicitCallerExtension(row);
    const endpoint = endpointExtension(row);
    const internalCaller = explicitCaller || endpoint || operator;
    const destination = directDestinationCandidates(row).find(number => isInternal(number) && number !== internalCaller) || '';
    if (internalCaller && destination) {
      return { direction: 'internal', internalCaller, destinationNumber: destination, trunkNumber: '' };
    }
  }

  const externalDestination = rows.flatMap(directDestinationCandidates).find(isExternal) || '';
  if (externalDestination) {
    const internalCaller = rows.map(row => explicitCallerExtension(row) || endpointExtension(row)).find(Boolean) || operator;
    const trunkNumber = allGroupNumbers(rows).find(number => isExternal(number) && number !== externalDestination) || '';
    return { direction: 'outgoing', internalCaller, destinationNumber: externalDestination, trunkNumber };
  }

  const internalCaller = rows.map(row => explicitCallerExtension(row) || endpointExtension(row)).find(Boolean) || operator;
  const destinationNumber = allGroupNumbers(rows).find(number => isInternal(number) && number !== internalCaller) || '';
  return { direction: 'internal', internalCaller, destinationNumber, trunkNumber: '' };
}
