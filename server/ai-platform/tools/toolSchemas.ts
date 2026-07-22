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
    output: list(objectSchema({ direction: stringSchema, state: stringSchema, extension: stringSchema,
      remotePartyMasked: stringSchema, startedAt: nullableString, durationSeconds: { type: 'number' }, queue: nullableString },
    ['direction', 'state', 'extension', 'remotePartyMasked', 'startedAt', 'durationSeconds', 'queue']))
  },
  'pbx.get_sip_registrations': {
    input: objectSchema(),
    output: list(objectSchema({ technology: stringSchema, endpoint: stringSchema, state: stringSchema,
      contactMasked: nullableString, lastSeen: nullableString, latencyMs: nullableNumber },
    ['technology', 'endpoint', 'state', 'contactMasked', 'lastSeen', 'latencyMs']))
  },
  'pbx.get_trunks_status': {
    input: objectSchema(),
    output: list(objectSchema({ trunkKey: stringSchema, technology: stringSchema, registrationState: stringSchema,
      reachable: { type: 'boolean' }, latencyMs: nullableNumber, safeSummary: stringSchema },
    ['trunkKey', 'technology', 'registrationState', 'reachable', 'latencyMs', 'safeSummary']))
  },
  'pbx.get_extensions_status': {
    input: objectSchema({ query: { ...stringSchema, maxLength: 100 }, limit }),
    output: list(objectSchema({ extension: stringSchema, displayName: stringSchema, state: stringSchema,
      registered: { type: 'boolean' }, deviceType: nullableString },
    ['extension', 'displayName', 'state', 'registered', 'deviceType']))
  },
  'pbx.get_missed_calls': {
    input: objectSchema({ periodHours: { type: 'integer', minimum: 1, maximum: 720 }, limit, extension: { ...stringSchema, maxLength: 20 } }),
    output: list(objectSchema({ occurredAt: stringSchema, callerMasked: stringSchema, calledExtension: stringSchema,
      status: stringSchema, callbackStatus: nullableString },
    ['occurredAt', 'callerMasked', 'calledExtension', 'status', 'callbackStatus']))
  },
  'pbx.get_call_statistics': {
    input: objectSchema({ period: { type: 'string', enum: ['today', 'yesterday', 'last_7_days', 'last_30_days'] },
      extension: { ...stringSchema, maxLength: 20 }, queue: { ...stringSchema, maxLength: 64 } }, ['period']),
    output: objectSchema({ total: { type: 'number' }, answered: { type: 'number' }, missed: { type: 'number' },
      averageDurationSeconds: { type: 'number' }, averageWaitSeconds: nullableNumber },
    ['total', 'answered', 'missed', 'averageDurationSeconds', 'averageWaitSeconds'])
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
      durationSeconds: { type: 'number' }, linkedIdHash: nullableString },
    ['callId', 'occurredAt', 'direction', 'sourceMasked', 'destinationMasked', 'disposition', 'durationSeconds', 'linkedIdHash']))
  }
};
