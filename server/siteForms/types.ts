export type SiteFormProvider = 'bitrix_site' | 'bitrix24' | 'universal' | 'bitrix_pull';
export type SiteFormLeadStatus = 'new'|'in_progress'|'call_scheduled'|'contact_attempted'|'contacted'|'completed'|'rejected'|'spam'|'duplicate';
export const SITE_FORM_LEAD_STATUSES = new Set<SiteFormLeadStatus>(['new','in_progress','call_scheduled','contact_attempted','contacted','completed','rejected','spam','duplicate']);
export const SITE_FORM_PROVIDERS = new Set<SiteFormProvider>(['bitrix_site','bitrix24','universal','bitrix_pull']);

export class SiteFormError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
