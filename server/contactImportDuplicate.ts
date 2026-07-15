export type ContactImportDuplicateReason = 'phone' | 'email' | 'name_organization';

export interface ContactImportDuplicateMatch {
  reason: ContactImportDuplicateReason;
}

export function findContactImportDuplicate(candidate: any, existingContacts: any[], userId: string, normalizeContact: (entry: any) => any): ContactImportDuplicateMatch | null {
  const phones = contactPhones(candidate);
  const email = normalizedText(candidate?.email);
  const fullName = normalizedText(candidate?.name);
  const organization = normalizedText(candidate?.company);
  for (const rawExisting of existingContacts || []) {
    const existing = normalizeContact(rawExisting);
    if (existing?.visibility === 'private' && String(existing?.ownerUserId || '') !== userId) continue;
    const existingPhones = contactPhones(existing);
    if (phones.length && existingPhones.some(phone => phones.includes(phone))) return { reason: 'phone' };
    if (email && normalizedText(existing?.email) === email) return { reason: 'email' };
    if (fullName && organization && normalizedText(existing?.name) === fullName && normalizedText(existing?.company) === organization) return { reason: 'name_organization' };
  }
  return null;
}

export function getContactImportDuplicateWarning(reason: ContactImportDuplicateReason): string {
  if (reason === 'phone') return 'Возможный дубль: такой телефон уже есть в доступном справочнике.';
  if (reason === 'email') return 'Возможный дубль: такой email уже есть в доступном справочнике.';
  return 'Возможный дубль: совпадают ФИО и организация.';
}

export function getContactImportDuplicateResultReason(reason: ContactImportDuplicateReason): string {
  if (reason === 'phone') return 'Possible duplicate by phone';
  if (reason === 'email') return 'Possible duplicate by email';
  return 'Possible duplicate by name and organization';
}

function contactPhones(contact: any): string[] {
  const values = [contact?.number, contact?.phone, contact?.phone2, ...(Array.isArray(contact?.phones) ? contact.phones : [])];
  return Array.from(new Set(values.map(value => String(value ?? '').replace(/\D/g, '')).filter(Boolean)));
}

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
