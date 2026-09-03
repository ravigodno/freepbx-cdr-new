export type ThemePreference = 'light' | 'dark' | 'system';
export type CdrDateTimeFormat = 'dmy-dash' | 'dmy-short-dash' | 'dmy-dot' | 'dmy-slash' | 'ymd-dash';
export type SearchEnginePreference = 'yandex' | 'google';
export type CallDeviceMode = 'desk_phone' | 'browser_headset';

export interface InterfacePreferences {
  theme: ThemePreference;
  uiScale: 90 | 100 | 110;
  reduceMotion: boolean;
  highContrast: boolean;
  accentColor: 'blue' | 'indigo' | 'emerald';
  rememberLastView: boolean;
  sidebarExpanded: boolean;
  showSidebarLabels: boolean;
  directoryNewTab: boolean;
  cdrDensity: 'compact' | 'standard' | 'comfortable';
  cdrTextScale: 90 | 100 | 110;
  cdrStickyHeader: boolean;
  cdrStripedRows: boolean;
  cdrShowSeconds: boolean;
  cdrHourCycle: 12 | 24;
  cdrDateTimeFormat: CdrDateTimeFormat;
  cdrUseBrowserTimezone: boolean;
  cdrPageSize: 25 | 50 | 100;
  cdrNumberClickFilter: boolean;
  livePopupEnabled: boolean;
  livePopupSize: 'compact' | 'standard';
  livePopupShowCompanyPosition: boolean;
  livePopupDirectoryFieldSlot1: string;
  livePopupDirectoryFieldSlot2: string;
  livePopupShowStartedAt: boolean;
  livePopupShowSearch: boolean;
  livePopupRememberPosition: boolean;
  livePopupHideAfterEndSeconds: 0 | 3 | 5 | 10;
  searchEngine: SearchEnginePreference;
  callDeviceMode: CallDeviceMode;
}

export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = {
  theme: 'light', uiScale: 100, reduceMotion: false, highContrast: false, accentColor: 'blue',
  rememberLastView: true, sidebarExpanded: false, showSidebarLabels: true, directoryNewTab: false,
  cdrDensity: 'standard', cdrTextScale: 100, cdrStickyHeader: true, cdrStripedRows: true,
  cdrShowSeconds: true, cdrHourCycle: 24, cdrDateTimeFormat: 'dmy-dash', cdrUseBrowserTimezone: false,
  cdrPageSize: 25, cdrNumberClickFilter: true,
  livePopupEnabled: true, livePopupSize: 'standard', livePopupShowCompanyPosition: true,
  livePopupDirectoryFieldSlot1: 'company', livePopupDirectoryFieldSlot2: 'position',
  livePopupShowStartedAt: true, livePopupShowSearch: true, livePopupRememberPosition: true,
  livePopupHideAfterEndSeconds: 0, searchEngine: 'yandex', callDeviceMode: 'desk_phone'
};

const STORAGE_KEY = 'pbxpuls_interface_preferences_v1';

export function loadInterfacePreferences(): InterfacePreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const legacyTheme = localStorage.getItem('asterisk_cdr_dark_mode') === 'true' ? 'dark' : 'light';
    const legacyDate = localStorage.getItem('pbxpuls_cdr_date_time_format');
    const next = {
      ...DEFAULT_INTERFACE_PREFERENCES,
      theme: legacyTheme,
      sidebarExpanded: localStorage.getItem('asterisk_cdr_sidebar_expanded') === 'true',
      ...(legacyDate === 'dmy-dot' || legacyDate === 'ymd-dash' ? { cdrDateTimeFormat: legacyDate } : {}),
      ...(stored && typeof stored === 'object' ? stored : {})
    };
    return {
      ...next,
      callDeviceMode: next.callDeviceMode === 'browser_headset' ? 'browser_headset' : 'desk_phone'
    };
  } catch {
    return { ...DEFAULT_INTERFACE_PREFERENCES };
  }
}

export function saveInterfacePreferences(preferences: InterfacePreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
