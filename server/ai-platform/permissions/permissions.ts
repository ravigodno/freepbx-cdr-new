export const AI_PLATFORM_PERMISSIONS = [
  'view_ai_platform', 'manage_ai_agents', 'manage_ai_providers', 'view_ai_tools',
  'manage_ai_tools', 'view_ai_audit', 'execute_ai_read_tools', 'approve_ai_actions',
  'manage_ai_platform'
] as const;

export type AiPlatformPermission = typeof AI_PLATFORM_PERMISSIONS[number];
