import type { PBXPulsSettingValueType } from './pbxpulsSettings.js';

export interface LegacySettingFlatItem {
  key: string;
  value: unknown;
}

export interface LegacySettingClassification {
  setting_key: string;
  value_type: PBXPulsSettingValueType;
  category: string;
  is_secret: boolean;
  description: string;
}

export interface LegacySettingSeedRow extends LegacySettingClassification {
  setting_value: string | null;
  willSeed: boolean;
  skippedReason?: string;
}

const SENSITIVE_LEGACY_SETTING_PATTERN = /password|pass|token|secret|apikey|api_key|authorization|clientsecret|refreshtoken|accesstoken/i;

const LEGACY_SETTINGS_ROOTS = [
  'settings',
  'directoryColumnSettings',
  'contactSyncAccounts',
  'contactSyncMappings',
  'yandexOAuthStates',
  'calltrackingSites',
  'calltrackingPhoneNumbers',
  'calltrackingReplacementRules',
  'marketingAggregateStatus',
  'yandexMetrikaIntegrations',
  'ai_pbx_settings',
  'aiAssistants',
  'aiAssistantRoutes',
  'aiKnowledgeSources'
];

export function flattenLegacySettings(input: unknown): LegacySettingFlatItem[] {
  const result: LegacySettingFlatItem[] = [];

  function visit(value: unknown, path: string): void {
    if (!path) return;

    if (Array.isArray(value)) {
      result.push({ key: path, value });
      return;
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        result.push({ key: path, value });
        return;
      }

      for (const [childKey, childValue] of entries) {
        visit(childValue, path ? `${path}.${childKey}` : childKey);
      }
      return;
    }

    result.push({ key: path, value });
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      visit(value, key);
    }
  }

  return result.sort((left, right) => left.key.localeCompare(right.key));
}

export function classifyLegacySettingKey(key: string, value: unknown): LegacySettingClassification {
  const settingKey = normalizeLegacySettingKey(key);
  const isSecret = isSensitiveLegacySettingKey(settingKey);
  const valueType: PBXPulsSettingValueType = isSecret
    ? 'secret'
    : inferLegacySettingValueType(value);

  return {
    setting_key: settingKey,
    value_type: valueType,
    category: inferLegacySettingCategory(settingKey),
    is_secret: isSecret,
    description: `Legacy data/db.json setting: ${settingKey}`
  };
}

export function isSensitiveLegacySettingKey(key: string): boolean {
  return SENSITIVE_LEGACY_SETTING_PATTERN.test(String(key || ''));
}

export function maskSensitiveValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return '***MASKED***';
}

export function buildLegacySettingsSeedRows(localDb: Record<string, unknown> | null | undefined): LegacySettingSeedRow[] {
  const source = localDb && typeof localDb === 'object' ? localDb : {};
  const flatItems: LegacySettingFlatItem[] = [];

  for (const rootKey of LEGACY_SETTINGS_ROOTS) {
    if (Object.prototype.hasOwnProperty.call(source, rootKey)) {
      flatItems.push(...flattenLegacySettings({ [rootKey]: source[rootKey] }));
    }
  }

  const seen = new Set<string>();
  const rows: LegacySettingSeedRow[] = [];

  for (const item of flatItems) {
    const classification = classifyLegacySettingKey(item.key, item.value);
    if (!classification.setting_key || seen.has(classification.setting_key)) continue;
    seen.add(classification.setting_key);

    const secret = classification.is_secret || classification.value_type === 'secret';
    rows.push({
      ...classification,
      setting_value: secret ? null : serializeLegacySettingValue(item.value, classification.value_type),
      willSeed: !secret,
      skippedReason: secret ? 'secret_value_skipped' : undefined
    });
  }

  return rows.sort((left, right) => left.setting_key.localeCompare(right.setting_key));
}

function normalizeLegacySettingKey(key: string): string {
  return String(key || '').trim();
}

function inferLegacySettingValueType(value: unknown): PBXPulsSettingValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (value && typeof value === 'object') return 'json';
  return 'string';
}

function serializeLegacySettingValue(value: unknown, valueType: PBXPulsSettingValueType): string | null {
  if (value === null || value === undefined) return null;
  if (valueType === 'json') return JSON.stringify(value);
  if (valueType === 'boolean') return value === true ? '1' : '0';
  if (valueType === 'number') return Number.isFinite(Number(value)) ? String(Number(value)) : null;
  return String(value);
}

function inferLegacySettingCategory(settingKey: string): string {
  const normalized = settingKey.replace(/^settings\./, '');
  const lower = normalized.toLowerCase();

  if (lower.startsWith('ami')) return 'ami';
  if (lower.startsWith('ari')) return 'ari';
  if (lower.startsWith('db')) return 'database';
  if (lower.startsWith('freepbx')) return 'freepbx';
  if (lower.startsWith('modulevisibility')) return 'app';
  if (lower.startsWith('allowadmin') || lower.startsWith('showsu') || lower.startsWith('custom')) return 'app';
  if (lower.startsWith('directory') || lower.startsWith('contactsync') || lower.startsWith('yandexoauthstates')) return 'directory';
  if (lower.startsWith('google') || lower.startsWith('fileimport') || lower.startsWith('yandexcarddav') || lower.startsWith('mailrucarddav')) return 'directory';
  if (lower.startsWith('norm')) return 'directory';
  if (lower.startsWith('calltracking')) return 'calltracking';
  if (lower.startsWith('marketing') || lower.startsWith('yandexmetrika')) return 'marketing';
  if (lower.startsWith('ai_') || lower.startsWith('aiassistants') || lower.startsWith('aiassistantroutes') || lower.startsWith('aiknowledgesources')) return 'ai';
  if (lower.includes('sla') || lower.includes('callback')) return 'calls';
  if (lower.includes('recording')) return 'recordings';
  return normalized.split('.')[0] || 'app';
}
