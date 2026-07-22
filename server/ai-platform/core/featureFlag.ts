import { getPBXPulsSetting } from '../../pbxpulsSettings.js';

export const AI_PLATFORM_CORE_FLAG = 'ai.platform_core_enabled';
export async function isAiPlatformCoreEnabled(): Promise<boolean> {
  return (await getPBXPulsSetting<boolean>(AI_PLATFORM_CORE_FLAG, false)) === true;
}

export function featureGateAllowsExecution(enabled: boolean): boolean { return enabled === true; }
