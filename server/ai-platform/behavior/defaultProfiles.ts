export const NATURAL_RECEPTIONIST_DEFAULT = {
  profileKey: 'natural_receptionist_default',
  name: 'Natural Receptionist Default',
  language: 'ru',
  style: { responseLength: 'short', naturalStyle: true },
  voiceRules: { bargeInSupported: true, multilingualEnabled: true, voiceEnabled: false },
  transferRules: { humanTransferPriority: 'highest' }
} as const;

export const RECEPTIONIST_DEFAULT_DRAFT = {
  agentKey: 'receptionist_default', name: 'AI Receptionist', agentType: 'receptionist',
  config: { language: 'ru', multilingual: true, behaviorProfile: 'natural_receptionist_default', autonomyLevel: 'safe_autonomous',
    voiceEnabled: false, humanTransferPriority: 'highest', toolIds: [] }
} as const;
