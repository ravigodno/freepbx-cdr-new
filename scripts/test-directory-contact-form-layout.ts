import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync('src/modules/directory/components/DirectoryContactFormLayout.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

for (const section of ['Основное', 'Контакты', 'Организация', 'Видимость', 'Дополнительные поля']) {
  assert(layout.includes(section), `contact form section is missing: ${section}`);
}

for (const primaryField of ['type', 'fullName', 'phone', 'phone2', 'email', 'organization', 'position', 'visibility', 'isSpam']) {
  assert(layout.includes(`'${primaryField}'`), `primary contact field is missing: ${primaryField}`);
}

for (const advancedField of ['inn', 'kpp', 'ogrn', 'address', 'comment', 'tags', 'internalExtension', 'linkedExternalNumber', 'responsibleUserId']) {
  assert(layout.includes(`'${advancedField}'`), `advanced contact field is missing: ${advancedField}`);
}

assert(layout.includes('md:grid-cols-2'), 'tablet/desktop two-column layout is missing');
assert(layout.includes('grid-cols-1'), 'mobile one-column layout is missing');
assert(layout.includes('sticky bottom-3'), 'sticky action bar is missing');
assert(layout.includes('aria-expanded={showAdvanced}'), 'advanced fields toggle accessibility state is missing');
assert(layout.includes("mode === 'edit' ? 'Сохранить изменения' : 'Создать контакт'"), 'create/edit primary action labels are missing');
assert(app.includes('<DirectoryContactFormLayout'), 'App must delegate the form layout to the directory module');
assert(app.includes('onSubmit={handleSaveDirEntry}'), 'existing contact save handler must remain connected');
assert(app.includes('renderDirectoryContactFormField(fieldKey as DirectoryVisibleColumnKey)'), 'existing field renderer must remain connected');

console.log('directory contact form layout tests: OK');
