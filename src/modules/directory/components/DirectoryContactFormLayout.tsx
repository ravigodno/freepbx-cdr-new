import React from 'react';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Contact,
  Loader2,
  Phone,
  Save,
  Settings2,
  ShieldCheck,
  UserRound
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

const primarySections = [
  {
    title: 'Основное',
    description: 'Ключевые данные контакта',
    icon: UserRound,
    fields: ['type', 'fullName', 'phone']
  },
  {
    title: 'Контакты',
    description: 'Дополнительные способы связи',
    icon: Phone,
    fields: ['phone2', 'email']
  },
  {
    title: 'Организация',
    description: 'Компания и роль сотрудника',
    icon: Building2,
    fields: ['organization', 'position']
  },
  {
    title: 'Видимость',
    description: 'Доступ и служебные признаки',
    icon: ShieldCheck,
    fields: ['visibility', 'isSpam']
  }
] as const;

const advancedSections = [
  {
    title: 'Организация и связь',
    fields: ['website', 'department', 'group', 'internalExtension', 'linkedExternalNumber', 'responsibleUserId']
  },
  {
    title: 'Реквизиты и примечания',
    fields: ['inn', 'kpp', 'ogrn', 'address', 'tags', 'comment']
  }
] as const;

function FormSection({
  title,
  description,
  icon: Icon,
  fields,
  renderField
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  fields: readonly string[];
  renderField: (fieldKey: string) => React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="mb-3 flex items-start gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2.5 md:grid-cols-2">
        {fields.map(fieldKey => <React.Fragment key={fieldKey}>{renderField(fieldKey)}</React.Fragment>)}
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
  const advancedCount = advancedSections.reduce((count, section) => count + section.fields.length, 0) + customFieldKeys.length;

  return (
    <section className="mx-auto min-w-0 max-w-5xl space-y-3">
      <header className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm sm:px-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Contact className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-slate-900">
                {mode === 'edit' ? 'Редактирование контакта' : 'Новый контакт'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {mode === 'edit' ? 'Измените данные и сохраните контакт.' : 'Заполните основные данные нового контакта.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" />
            К справочнику
          </button>
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">{warning}</div>}
        {error && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700">{error}</div>}

        <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
          {primarySections.map(section => (
            <FormSection key={section.title} {...section} renderField={renderField} />
          ))}
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={onToggleAdvanced}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Settings2 className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black text-slate-800">Дополнительные поля</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{advancedCount} реквизитов и дополнительных параметров</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-blue-700">
              {showAdvanced ? 'Скрыть' : 'Показать'}
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 p-3">
              {advancedSections.map(section => (
                <FormSection key={section.title} title={section.title} fields={section.fields} renderField={renderField} />
              ))}
              {customFieldKeys.length > 0 && (
                <FormSection title="Пользовательские поля" fields={customFieldKeys} renderField={renderField} />
              )}
            </div>
          )}
        </section>

        <div className="sticky bottom-3 z-20 flex flex-col-reverse gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            Отмена
          </button>
          <button type="submit" disabled={isSaving} className="inline-flex min-h-10 min-w-[150px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Сохранение…' : mode === 'edit' ? 'Сохранить изменения' : 'Создать контакт'}
          </button>
        </div>
      </form>
    </section>
  );
}
