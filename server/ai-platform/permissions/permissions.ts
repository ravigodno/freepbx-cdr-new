export const AI_PLATFORM_PERMISSIONS = [
  'view_ai_platform', 'manage_ai_agents', 'manage_ai_providers', 'view_ai_tools',
  'manage_ai_tools', 'view_ai_audit', 'execute_ai_read_tools', 'approve_ai_actions',
  'manage_ai_platform', 'create_ai_agents', 'clone_ai_agents', 'publish_ai_agents',
  'manage_ai_templates', 'manage_ai_behavior_profiles', 'manage_ai_policies', 'run_ai_test_sessions'
] as const;

export type AiPlatformPermission = typeof AI_PLATFORM_PERMISSIONS[number];
