import { AiPlatformError } from '../core/errors.js';
import type { ToolDefinition } from '../core/contracts.js';

const objectSchema = { type: 'object', additionalProperties: false } as const;

export const STAGE_ONE_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  ['pbx.get_active_calls', 'Read active PBX calls'],
  ['pbx.get_sip_registrations', 'Read SIP and PJSIP registration status'],
  ['pbx.get_trunks_status', 'Read trunk status'],
  ['pbx.get_extensions_status', 'Read extension status'],
  ['pbx.get_missed_calls', 'Read missed calls'],
  ['pbx.get_call_statistics', 'Read aggregated call statistics'],
  ['directory.search_contacts', 'Search permitted directory contacts'],
  ['calls.search_history', 'Search permitted call history']
].map(([key, description]) => ({ key, version: 1, description, riskLevel: 'read', inputSchema: objectSchema, outputSchema: { type: 'object' },
  executorKey: key, enabled: true, executorStatus: 'unavailable' })) as ToolDefinition[];

export class ToolRegistry {
  private readonly definitions = new Map<string, ToolDefinition>();
  register(definition: ToolDefinition): void {
    if (!/^[a-z][a-z0-9_.-]{2,100}$/.test(definition.key)) throw new Error('Invalid tool key');
    if (definition.riskLevel !== 'read') throw new AiPlatformError('invalid_request', 400, 'Stage 1 accepts read-only tool definitions');
    this.definitions.set(`${definition.key}@${definition.version}`, Object.freeze({ ...definition }));
  }
  list(): ToolDefinition[] { return Array.from(this.definitions.values()).map(item => ({ ...item })); }
  hasId(_toolId: number): boolean { return false; }
}

let singleton: ToolRegistry | null = null;
export function getToolRegistry(): ToolRegistry {
  if (!singleton) {
    singleton = new ToolRegistry();
    for (const definition of STAGE_ONE_TOOL_DEFINITIONS) singleton.register(definition);
  }
  return singleton;
}
