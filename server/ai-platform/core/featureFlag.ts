import { getPBXPulsSetting } from '../../pbxpulsSettings.js';

export const AI_PLATFORM_CORE_FLAG = 'ai.platform_core_enabled';
export const AI_WRITE_TOOLS_FLAG = 'ai.write_tools_enabled';
export async function isAiPlatformCoreEnabled(): Promise<boolean> {
  return (await getPBXPulsSetting<boolean>(AI_PLATFORM_CORE_FLAG, false)) === true;
}

export async function areAiWriteToolsEnabled(): Promise<boolean> {
  return (await getPBXPulsSetting<boolean>(AI_WRITE_TOOLS_FLAG, false)) === true;
}

export function featureGateAllowsExecution(enabled: boolean): boolean { return enabled === true; }
