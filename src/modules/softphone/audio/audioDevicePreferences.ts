export interface AudioDevicePreferences {
  microphoneId: string;
  speakerId: string;
  ringtoneId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

const STORAGE_KEY = 'pbxpuls_softphone_audio_devices_v1';

export const DEFAULT_AUDIO_DEVICE_PREFERENCES: AudioDevicePreferences = {
  microphoneId: 'default',
  speakerId: 'default',
  ringtoneId: 'default',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

export function loadAudioDevicePreferences(): AudioDevicePreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_AUDIO_DEVICE_PREFERENCES, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch {
    return { ...DEFAULT_AUDIO_DEVICE_PREFERENCES };
  }
}

export function saveAudioDevicePreferences(preferences: AudioDevicePreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
