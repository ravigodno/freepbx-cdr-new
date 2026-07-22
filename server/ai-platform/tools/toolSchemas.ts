const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: 'object', additionalProperties: false, properties, required });
const stringSchema = { type: 'string' };
const nullableString = { type: 'string', nullable: true };
const nullableNumber = { type: 'number', nullable: true };
const limit = { type: 'integer', minimum: 1, maximum: 100 };
const list = (items: unknown) => objectSchema({ items: { type: 'array', items } }, ['items']);

export const TOOL_SCHEMAS: Record<string, { input: any; output: any }> = {
  'pbx.get_active_calls': {
    input: objectSchema(),
    output: list(objectSchema({ callIdHash:stringSchema,direction: stringSchema, state: stringSchema, extension: nullableString,
      remotePartyMasked: stringSchema, startedAt: nullableString, durationSeconds: { type: 'number' }, queue: nullableString,participantsCount:nullableNumber },
    ['callIdHash','direction', 'state', 'extension', 'remotePartyMasked', 'startedAt', 'durationSeconds', 'queue','participantsCount']))
  },
  'pbx.get_sip_registrations': {
    input: objectSchema(),
    output: list(objectSchema({ technology: stringSchema, endpoint: stringSchema,role:stringSchema,state: stringSchema,
      contactMasked: nullableString, lastSeen: nullableString, latencyMs: nullableNumber,registered:{type:'boolean'},reachable:{type:'boolean'} },
    ['technology', 'endpoint','role','state', 'contactMasked', 'lastSeen', 'latencyMs','registered','reachable']))
  },
  'pbx.get_trunks_status': {
    input: objectSchema(),
    output: list(objectSchema({ trunkKey: stringSchema,displayName:nullableString, technology: stringSchema, registrationState: stringSchema,
      reachable: { type: 'boolean' }, latencyMs: nullableNumber,lastErrorSafe:nullableString, safeSummary: stringSchema },
    ['trunkKey','displayName', 'technology', 'registrationState', 'reachable', 'latencyMs','lastErrorSafe', 'safeSummary']))
  },
  'pbx.get_extensions_status': {
    input: objectSchema({ query: { ...stringSchema, maxLength: 100 }, limit }),
    output: list(objectSchema({ extension: stringSchema, displayName: stringSchema, state: stringSchema,
      registered: { type: 'boolean' },reachable:{type:'boolean'}, deviceType: nullableString,technology:nullableString,latencyMs:nullableNumber },
    ['extension', 'displayName', 'state', 'registered','reachable', 'deviceType','technology','latencyMs']))
  },
  'pbx.get_missed_calls': {
    input: objectSchema({ periodHours: { type: 'integer', minimum: 1, maximum: 720 }, limit, extension: { ...stringSchema, maxLength: 20 } }),
    output: list(objectSchema({callIdHash:stringSchema, occurredAt: stringSchema, callerMasked: stringSchema, calledExtension: stringSchema,
      status: stringSchema,queue:nullableString, callbackStatus: nullableString },
    ['callIdHash','occurredAt', 'callerMasked', 'calledExtension', 'status','queue', 'callbackStatus']))
  },
  'pbx.get_call_statistics': {
    input: objectSchema({ period: { type: 'string', enum: ['today', 'yesterday', 'last_7_days', 'last_30_days'] },
      extension: { ...stringSchema, maxLength: 20 }, queue: { ...stringSchema, maxLength: 64 } }, ['period']),
    output: objectSchema({ total: { type: 'number' }, answered: { type: 'number' }, missed: { type: 'number' },
      abandoned:nullableNumber,averageDurationSeconds: { type: 'number' },averageTalkSeconds:nullableNumber, averageWaitSeconds: nullableNumber,serviceLevelPercent:nullableNumber },
    ['total', 'answered', 'missed','abandoned', 'averageDurationSeconds','averageTalkSeconds', 'averageWaitSeconds','serviceLevelPercent'])
  },
  'directory.search_contacts': {
    input: objectSchema({ query: { ...stringSchema, maxLength: 100 }, limit }, ['query']),
    output: list(objectSchema({ contactId: stringSchema, name: stringSchema, company: nullableString, type: stringSchema,
      phonesMasked: { type: 'array', items: stringSchema }, owner: nullableString, isSpam: { type: 'boolean' } },
    ['contactId', 'name', 'company', 'type', 'phonesMasked', 'owner', 'isSpam']))
  },
  'calls.search_history': {
    input: objectSchema({ query: { ...stringSchema, maxLength: 100 }, extension: { ...stringSchema, maxLength: 20 },
      direction: { type: 'string', enum: ['inbound', 'outbound', 'internal'] }, dateFrom: { ...stringSchema, maxLength: 32 },
      dateTo: { ...stringSchema, maxLength: 32 }, limit }),
    output: list(objectSchema({ callId: stringSchema, occurredAt: stringSchema, direction: stringSchema,
      sourceMasked: stringSchema, destinationMasked: stringSchema, disposition: stringSchema,
      durationSeconds: { type: 'number' },billsecSeconds:nullableNumber,queue:nullableString, linkedIdHash: nullableString },
    ['callId', 'occurredAt', 'direction', 'sourceMasked', 'destinationMasked', 'disposition', 'durationSeconds','billsecSeconds','queue', 'linkedIdHash']))
  }
};
