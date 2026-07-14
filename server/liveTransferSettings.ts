import { getPBXPulsSetting } from './pbxpulsSettings.js';

export const LIVE_TRANSFER_ALLOW_EXTERNAL_DIRECTORY_NUMBERS_SETTING = 'transfer.allow_external_directory_numbers';

export async function isExternalDirectoryTransferAllowed(): Promise<boolean> {
  const value = await getPBXPulsSetting<unknown>(LIVE_TRANSFER_ALLOW_EXTERNAL_DIRECTORY_NUMBERS_SETTING, true);
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  return !['0', 'false', 'no', 'off', 'нет'].includes(normalized);
}
