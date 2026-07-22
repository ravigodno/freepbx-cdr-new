import type { PBXReadServices } from '../../../services/pbxReadServices.js';
import { ReadOnlyExecutorRegistry } from './readOnlyExecutors.js';

export function createPBXReadExecutorRegistry(services: PBXReadServices): ReadOnlyExecutorRegistry {
  const registry = new ReadOnlyExecutorRegistry();
  const executors = {
    'pbx.get_active_calls': services.activeCalls,
    'pbx.get_sip_registrations': services.sipRegistrations,
    'pbx.get_trunks_status': services.trunksStatus,
    'pbx.get_extensions_status': services.extensionsStatus,
    'pbx.get_missed_calls': services.missedCalls,
    'pbx.get_call_statistics': services.callStatistics,
    'directory.search_contacts': services.searchContacts,
    'calls.search_history': services.searchHistory
  };
  for (const [key, executor] of Object.entries(executors)) registry.register(key, executor);
  return registry;
}
