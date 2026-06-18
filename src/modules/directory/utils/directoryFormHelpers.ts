export function resetDirFormFieldsHelper(setters: any, defaultType = 'internal') {
  setters.setEditingDirEntry(null);
  setters.setDirName('');
  setters.setDirNumber('');
  setters.setDirPhonesText('');
  setters.setDirCompany('');
  setters.setDirPosition('');
  setters.setDirDepartment('');
  setters.setDirEmail('');
  setters.setDirWebsite('');
  setters.setDirTagsText('');
  setters.setDirIsSpam(false);
  setters.setDirIsBlacklisted(false);
  setters.setDirType(defaultType);
  setters.setDirComment('');
  setters.setDirError('');
}

export function openEditDirEntryHelper(setters: any, entry: any, helpers: any) {
  const phones = helpers.getEntryPhones(entry);

  setters.setEditingDirEntry(entry);
  setters.setDirName(entry.name);
  setters.setDirNumber(phones[0] || entry.number || '');
  setters.setDirPhonesText(phones.slice(1).join('\n'));
  setters.setDirCompany(entry.company || '');
  setters.setDirPosition(entry.position || '');
  setters.setDirDepartment(entry.department || '');
  setters.setDirEmail(entry.email || '');
  setters.setDirWebsite(entry.website || '');
  setters.setDirTagsText(helpers.getDirectoryEntryTags(entry).join('; '));
  setters.setDirIsSpam(!!entry.isSpam);
  setters.setDirIsBlacklisted(!!entry.isBlacklisted);
  setters.setDirType(entry.type);
  setters.setDirComment(entry.comment || '');
  setters.setDirError('');
  setters.setIsDirFormOpen(true);
}

export function openCreateDirEntryHelper(setters: any) {
  resetDirFormFieldsHelper(setters, 'internal');
  setters.setIsDirFormOpen(true);
}

export function openAddFromCallHelper(setters: any, number: string, initialName?: string) {
  resetDirFormFieldsHelper(setters, 'internal');
  setters.setDirName(initialName || '');
  setters.setDirNumber(number);
  setters.setDirType('client');
  setters.setDirComment('Добавлен из реестра звонков');
  setters.setIsDirFormOpen(true);
}
