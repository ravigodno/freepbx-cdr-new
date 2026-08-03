export type DirectorySingleContactMode = 'legacy' | 'sql';

export async function loadDirectorySingleContact(input: {
  mode: DirectorySingleContactMode;
  id: string;
  legacyContacts: any[];
  loadSql: (id: string) => Promise<any | null>;
  canReadLegacy: (entry: any) => boolean;
}): Promise<any | null> {
  if (input.mode === 'sql') return input.loadSql(input.id);
  const entry = input.legacyContacts.find(item => String(item?.id || '') === input.id) || null;
  return entry && input.canReadLegacy(entry) ? entry : null;
}
