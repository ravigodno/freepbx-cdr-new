import React from 'react';
import {
  ArrowLeft,
  Building2,
  Contact,
  FileText,
  Loader2,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound
} from 'lucide-react';

type ContactFormMode = 'create' | 'edit';

interface DirectoryContactFormLayoutProps {
  mode: ContactFormMode;
  warning?: string;
  error?: string;
  showAdvanced: boolean;
  customFieldKeys: string[];
  isSaving: boolean;
  renderField: (fieldKey: string) => React.ReactNode;
  onToggleAdvanced: () => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

interface ContactFormSection {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: readonly string[];
  advanced?: boolean;
}

const leftSections: ContactFormSection[] = [
  {
    title: 'Основное',
    description: 'Тип, имя и основные номера контакта',
    icon: UserRound,
    fields: ['type', 'fullName', 'phone', 'phone2']
  },
  {
    title: 'Организация',
    description: 'Компания, должность и подразделение',
    icon: Building2,
    fields: ['organization', 'position', 'department', 'group']
  },
  {
    title: 'Номера и ответственный',
    description: 'Внутренняя связь и закреплённый сотрудник',
    icon: UsersRound,
    fields: ['internalExtension', 'linkedExternalNumber', 'responsibleUserId'],
    advanced: true
  }
];

const rightSections: ContactFormSection[] = [
  {
    title: 'Контакты',
    description: 'Электронная почта, сайт и примечание',
    icon: Phone,
    fields: ['email', 'website', 'comment']
  },
  {
    title: 'Дополнительные реквизиты',
    description: 'Юридические данные, адрес и теги',
    icon: FileText,
    fields: ['inn', 'kpp', 'ogrn', 'address', 'tags'],
    advanced: true
  },
  {
    title: 'Системные поля / видимость',
    description: 'Доступ к контакту и признак спама',
    icon: ShieldCheck,
    fields: ['visibility', 'isSpam']
  }
];

function FormSection({
  section,
  fields,
  renderField
}: {
  section: ContactFormSection;
  fields?: readonly string[];
  renderField: (fieldKey: string) => React.ReactNode;
}) {
  const visibleFields = fields || section.fields;
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <section.icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-900">{section.title}</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{section.description}</p>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleFields.map(fieldKey => <React.Fragment key={fieldKey}>{renderField(fieldKey)}</React.Fragment>)}
      </div>
    </section>
  );
}

export default function DirectoryContactFormLayout({
  mode,
  warning,
  error,
  showAdvanced,
  customFieldKeys,
  isSaving,
  renderField,
  onToggleAdvanced,
  onCancel,
  onSubmit
}: DirectoryContactFormLayoutProps) {
  const standardFields = [...leftSections, ...rightSections].flatMap(section => [...section.fields]);
  const basicCount = [...leftSections, ...rightSections]
    .filter(section => !section.advanced)
    .reduce((count, section) => count + section.fields.length, 0);
  const totalCount = standardFields.length + customFieldKeys.length;
  const shownCount = showAdvanced ? totalCount : basicCount;
  const visibleLeftSections = leftSections.filter(section => showAdvanced || !section.advanced);
  const visibleRightSections = rightSections.filter(section => showAdvanced || !section.advanced);

  return (
    <section className="mx-auto min-w-0 w-full max-w-[1280px] space-y-3 px-0">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:px-6 lg:py-5">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Contact className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-black tracking-tight text-slate-900">
                {mode === 'edit' ? 'Редактирование контакта' : 'Новый контакт'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {mode === 'edit' ? 'Проверьте изменения и сохраните обновлённые данные контакта.' : 'Заполните данные, необходимые для работы со справочником PBXPuls.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Назад к справочнику
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-600">
              Показано полей: <b className="text-slate-900">{shownCount} из {totalCount}</b>
            </span>
            <button type="button" onClick={onToggleAdvanced} aria-expanded={showAdvanced} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100">
              {showAdvanced ? 'Скрыть дополнительные поля' : 'Показать все поля'}
            </button>
          </div>
          <p className="text-[11px] font-medium text-slate-500">Основные данные и хотя бы один способ связи обязательны для сохранения.</p>
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        {warning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{warning}</div>}
        {error && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">{error}</div>}

        <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-4">
          <div className="min-w-0 space-y-3 lg:space-y-4">
            {visibleLeftSections.map(section => <FormSection key={section.title} section={section} renderField={renderField} />)}
          </div>
          <div className="min-w-0 space-y-3 lg:space-y-4">
            {visibleRightSections.map(section => {
              const fields = section.title === 'Дополнительные реквизиты'
                ? [...section.fields, ...customFieldKeys]
                : section.fields;
              return <FormSection key={section.title} section={section} fields={fields} renderField={renderField} />;
            })}
          </div>
        </div>

        <footer className="sticky bottom-0 z-30 -mx-1 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur sm:flex-row sm:items-center sm:justify-end lg:px-6">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Отмена
          </button>
          <button type="submit" disabled={isSaving} className="inline-flex min-h-11 min-w-[190px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Сохранение…' : mode === 'edit' ? 'Сохранить изменения' : 'Сохранить контакт'}
          </button>
        </footer>
      </form>
    </section>
  );
}
