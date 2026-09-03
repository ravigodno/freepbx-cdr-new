export function getDirectoryEmployeeDepartments(directory: any[]): string[] {
  const departments = new Map<string, string>();

  (directory || []).forEach(entry => {
    if (String(entry?.type || '').trim().toLowerCase() !== 'internal') return;
    const department = String(entry?.department || '').trim();
    if (!department) return;
    const key = department.toLocaleLowerCase('ru-RU');
    if (!departments.has(key)) departments.set(key, department);
  });

  return Array.from(departments.values()).sort((left, right) => left.localeCompare(right, 'ru-RU'));
}
