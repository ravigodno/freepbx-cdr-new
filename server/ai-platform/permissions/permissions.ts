export const AI_PLATFORM_PERMISSIONS = [
  'view_ai_platform', 'manage_ai_agents', 'manage_ai_providers', 'view_ai_tools',
  'manage_ai_tools', 'view_ai_audit', 'execute_ai_read_tools', 'approve_ai_actions',
  'manage_ai_platform', 'create_ai_agents', 'clone_ai_agents', 'publish_ai_agents',
  'manage_ai_templates', 'manage_ai_behavior_profiles', 'manage_ai_policies', 'run_ai_test_sessions',
  'manage_ai_knowledge', 'view_ai_knowledge', 'publish_ai_knowledge', 'manage_ai_training',
  'view_ai_training', 'publish_ai_training', 'view_ai_context_preview', 'execute_ai_sandbox',
  'view_ai_tool_executions', 'test_ai_tools', 'view_ai_transfer_requests',
  'manage_ai_transfer_policies', 'test_ai_human_transfer'
  ,'view_ai_actions','manage_ai_actions','execute_ai_low_risk_actions','view_ai_callback_requests','manage_ai_callback_requests','assign_ai_actions'
  ,'view_ai_voice_status','view_ai_voice_sessions','manage_ai_voice_bindings','control_ai_voice_gateway','test_ai_voice_gateway'
  ,'view_ai_voice_media_status','view_ai_voice_media_sessions','test_ai_voice_media','manage_ai_voice_media'
  ,'view_ai_realtime_voice_status','view_ai_realtime_voice_sessions','test_ai_realtime_voice','manage_ai_realtime_voice'
  ,'view_ai_voice_live_test','configure_ai_voice_live_test','enable_ai_voice_live_test','execute_ai_voice_live_test_checks'
  ,'view_ai_voice_agents','manage_ai_voice_agents','test_ai_voice_agents','manage_ai_voice_routes','view_ai_voice_transcripts','export_ai_voice_transcripts'
  ,'view_ai_voice_profiles','manage_ai_voice_profiles','view_ai_voice_catalog','manage_ai_voice_catalog','generate_ai_voice_preview'
  ,'view_ai_extensions','create_ai_extensions','update_ai_extensions','publish_ai_extensions','delete_ai_extensions'
  ,'view_ai_handoff','configure_ai_handoff','test_ai_handoff','publish_ai_handoff'
  ,'view_ai_agents','edit_ai_agents','view_ai_telephony','configure_ai_telephony','ai_platform_expert_mode'
  ,'preview_ai_agents','apply_ai_agents'
] as const;

export type AiPlatformPermission = typeof AI_PLATFORM_PERMISSIONS[number];
