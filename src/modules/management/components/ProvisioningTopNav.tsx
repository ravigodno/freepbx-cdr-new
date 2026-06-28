import React from 'react';
import { ui } from '../../../locales/ru';
import { MANAGEMENT_SECTIONS, ManagementSectionId } from './provisioningSections';

export function ProvisioningTopNav({ activeSection, onChange }: { activeSection: ManagementSectionId; onChange: (section: ManagementSectionId) => void }) {
  return (
    <nav className="min-w-0 flex-1 overflow-x-auto" aria-label={ui.management.navAriaLabel}>
      <div className="flex min-w-max items-center gap-1.5">
        {MANAGEMENT_SECTIONS.map(section => {
          const Icon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onChange(section.id)}
              className={active
                ? 'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-3 text-xs font-black text-white'
                : 'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {section.label}
              {section.status === 'ready' && <span className={active ? 'text-[9px] uppercase text-blue-100' : 'text-[9px] uppercase text-emerald-600 dark:text-emerald-300'}>{ui.status.ready}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
