import { queryPBXPulsDb } from './pbxpulsDb.js';
import { normalizeModuleVisibilitySettings, type ModuleVisibility } from '../shared/accessCatalog.js';
// Existing legacy values are used only until this setting is first explicitly saved to SQL.
export async function loadModuleVisibility(legacy:unknown,query= queryPBXPulsDb):Promise<ModuleVisibility> {
  const rows=await query("SELECT setting_value FROM settings WHERE setting_key='access.module_visibility' LIMIT 1",[]);
  if(!rows.length)return normalizeModuleVisibilitySettings(legacy);
  const stored=JSON.parse(String(rows[0].setting_value));
  if(!stored || typeof stored!=='object' || Array.isArray(stored))throw new Error('Invalid module visibility configuration');
  return normalizeModuleVisibilitySettings(stored);
}
export async function saveModuleVisibility(visibility:ModuleVisibility,query= queryPBXPulsDb):Promise<void> {
  await query(`INSERT INTO settings (setting_key,setting_value,value_type,category,is_secret,updated_at)
    VALUES ('access.module_visibility',?,'json','access',0,NOW())
    ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),value_type='json',updated_at=NOW()`,[JSON.stringify(visibility)]);
}
