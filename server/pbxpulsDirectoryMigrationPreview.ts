type DirectoryMigrationPreviewIssue = {
  code: string;
  count: number;
};

type DirectoryMigrationPreviewField = {
  field_key: string;
  contactsCount: number;
};

const LEGACY_DIRECTORY_KNOWN_FIELDS = new Set([
  'id',
  'name',
  'number',
  'phone',
  'phone1',
  'phone2',
  'phone3',
  'phones',
  'fio',
  'fullname',
  'contact',
  'type',
  'visibility',
  'ownerUserId',
  'ownerId',
  'userId',
  'company',
  'organization',
  'org',
  'position',
  'job',
  'title',
  'department',
  'group',
  'team',
  'email',
  'website',
  'site',
  'inn',
  'ИНН',
  'kpp',
  'КПП',
  'ogrn',
  'ОГРН',
  'address',
  'адрес',
  'internalExtension',
  'extension',
  'internal_number',
  'linkedExternalNumber',
  'externalNumber',
  'linked_external_number',
  'responsibleUserId',
  'responsible',
  'tags',
  'tag',
  'isSpam',
  'is_spam',
  'isBlacklisted',
  'is_blacklisted',
  'comment',
  'notes',
  'createdAt',
  'updatedAt'
]);

const DIRECTORY_ALLOWED_TYPES = new Set(['internal', 'client', 'supplier', 'government']);

const onlyDirectoryDigits = (value: any): string => String(value ?? '').replace(/\D+/g, '');

const normalizePreviewVisibility = (entry: any): 'shared' | 'private' => {
  const raw = String(entry?.visibility || '').trim().toLowerCase();
  return raw === 'private' || raw === 'личный' ? 'private' : 'shared';
};

const isTruthyDirectoryFlag = (value: any): boolean => {
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || ['1', 'true', 'yes', 'да', 'y'].includes(raw);
};

const getPreviewDirectoryPhones = (entry: any): string[] => {
  const values = [
    ...(Array.isArray(entry?.phones) ? entry.phones : []),
    entry?.number,
    entry?.phone,
    entry?.phone1,
    entry?.phone2,
    entry?.phone3
  ];
  const out: string[] = [];
  values.forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    raw.split(/[;,|\n]+/).forEach((part) => {
      const phone = String(part || '').trim();
      if (phone && !out.includes(phone)) out.push(phone);
    });
  });
  return out;
};

export function buildDirectoryMigrationPreview(localDb: any) {
  const rawDirectory = Array.isArray(localDb?.directory) ? localDb.directory : [];
  const ownerIds = new Set<string>();
  const customFieldCounts = new Map<string, number>();
  const phoneCounts = new Map<string, number>();
  const issues: DirectoryMigrationPreviewIssue[] = [];
  const issueCounts: Record<string, number> = {};

  let common = 0;
  let personal = 0;
  let contactsWithoutOwner = 0;
  let totalPhones = 0;
  let emptyPhones = 0;
  let invalidVisibility = 0;
  let missingVisibility = 0;
  let invalidType = 0;
  let missingType = 0;
  let spam = 0;
  let blacklist = 0;
  let multiPhoneContacts = 0;
  let customFieldValueCells = 0;

  const addIssue = (code: string) => {
    issueCounts[code] = (issueCounts[code] || 0) + 1;
  };

  rawDirectory.forEach((entry: any) => {
    const rawVisibility = String(entry?.visibility || '').trim().toLowerCase();
    const visibility = normalizePreviewVisibility(entry);
    if (!rawVisibility) missingVisibility += 1;
    if (rawVisibility && !['shared', 'private', 'личный'].includes(rawVisibility)) {
      invalidVisibility += 1;
      addIssue('invalid_visibility');
    }

    if (visibility === 'private') {
      personal += 1;
      const ownerUserId = String(entry?.ownerUserId || entry?.ownerId || entry?.userId || '').trim();
      if (ownerUserId) {
        ownerIds.add(ownerUserId);
      } else {
        contactsWithoutOwner += 1;
        addIssue('personal_contact_without_owner');
      }
    } else {
      common += 1;
    }

    const rawType = String(entry?.type || '').trim().toLowerCase();
    if (!rawType) {
      missingType += 1;
    } else if (!DIRECTORY_ALLOWED_TYPES.has(rawType)) {
      invalidType += 1;
      addIssue('invalid_contact_type');
    }

    const phones = getPreviewDirectoryPhones(entry);
    const normalizedPhones = phones.map(onlyDirectoryDigits).filter(Boolean);
    totalPhones += normalizedPhones.length;
    if (!normalizedPhones.length) {
      emptyPhones += 1;
      addIssue('contact_without_phone');
    }
    if (normalizedPhones.length > 1) multiPhoneContacts += 1;
    normalizedPhones.forEach((phone) => {
      phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
    });

    const tags = Array.isArray(entry?.tags) ? entry.tags : [];
    const spamFromTags = tags.some((tag: any) => {
      const normalized = String(tag || '').trim().toLowerCase();
      return normalized === 'spam' || normalized === 'спам';
    });
    if (isTruthyDirectoryFlag(entry?.isSpam ?? entry?.is_spam) || spamFromTags) spam += 1;
    if (isTruthyDirectoryFlag(entry?.isBlacklisted ?? entry?.is_blacklisted)) blacklist += 1;

    Object.keys(entry || {}).forEach((fieldKey) => {
      if (LEGACY_DIRECTORY_KNOWN_FIELDS.has(fieldKey)) return;
      customFieldCounts.set(fieldKey, (customFieldCounts.get(fieldKey) || 0) + 1);
      customFieldValueCells += 1;
    });
  });

  Object.entries(issueCounts).forEach(([code, count]) => {
    issues.push({ code, count });
  });

  const duplicatePhones = Array.from(phoneCounts.values()).filter((count) => count > 1).length;
  const customFields: DirectoryMigrationPreviewField[] = Array.from(customFieldCounts.entries())
    .map(([field_key, contactsCount]) => ({ field_key, contactsCount }))
    .sort((a, b) => a.field_key.localeCompare(b.field_key));

  return {
    ok: true,
    source: 'data/db.json',
    safe: true,
    contacts: {
      total: rawDirectory.length,
      common,
      personal
    },
    owners: {
      ownersCount: ownerIds.size,
      contactsWithoutOwner
    },
    phones: {
      totalPhones,
      emptyPhones,
      duplicatePhones
    },
    customFields: {
      count: customFields.length,
      valueCells: customFieldValueCells,
      fields: customFields
    },
    checks: {
      visibility: {
        missing: missingVisibility,
        invalid: invalidVisibility
      },
      ownerUserId: {
        missingForPersonal: contactsWithoutOwner
      },
      phones: {
        multiPhoneContacts,
        contactsWithoutPhones: emptyPhones
      },
      type: {
        missing: missingType,
        invalid: invalidType
      },
      flags: {
        spam,
        blacklist
      }
    },
    plannedMapping: {
      sharedVisibilityToContactType: 'common',
      privateVisibilityToContactType: 'personal',
      ownerField: 'owner_user_id',
      customFieldsTarget: 'directory_contact_metadata',
      valuesReturned: false
    },
    issues
  };
}
