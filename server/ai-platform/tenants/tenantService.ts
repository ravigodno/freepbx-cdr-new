import { AiPlatformError } from '../core/errors.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';

export const INSTALLATION_TENANT_KEY = 'installation';
export interface InstallationTenant { id: number; tenantKey: string; name: string; mode: 'installation'; status: 'active' }

export async function getInstallationTenant(store: AiPlatformStore): Promise<InstallationTenant> {
  const rows = await store.query('SELECT id,tenant_key,name,mode,status FROM ai_tenants WHERE tenant_key=? LIMIT 1', [INSTALLATION_TENANT_KEY]);
  const row = rows[0];
  if (!row) throw new AiPlatformError('storage_unavailable', 503, 'Installation tenant is not ready');
  return { id: Number(row.id), tenantKey: String(row.tenant_key), name: String(row.name), mode: 'installation', status: 'active' };
}
