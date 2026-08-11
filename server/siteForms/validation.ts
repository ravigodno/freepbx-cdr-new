import { isValidSiteFormPhone, normalizeSiteFormPhone } from '../../shared/siteFormPhone.js';
import { SITE_FORM_PROVIDERS, SiteFormError, type SiteFormProvider } from './types.js';

const text = (value: unknown, max = 255) => String(value ?? '').trim().slice(0, max);
const optional = (value: unknown, max = 255) => text(value, max) || null;
const url = (value: unknown) => { const result=optional(value,2048); if(!result)return null; try{const parsed=new URL(result);return ['http:','https:'].includes(parsed.protocol)?result:null}catch{return null} };
const sqlDateInMoscow=(value:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(value);
export const jsonArray = (value: unknown, max=100): string[] => Array.isArray(value) ? value.map(item=>text(item,191)).filter(Boolean).slice(0,max) : [];

export function normalizeIntegrationInput(input:any){
  const provider=text(input?.provider,30) as SiteFormProvider;
  if(!SITE_FORM_PROVIDERS.has(provider))throw new SiteFormError(400,'invalid_provider','Неизвестный тип источника');
  const name=text(input?.name,191);if(!name)throw new SiteFormError(400,'name_required','Укажите название сайта');
  const sla=Math.max(1,Math.min(10080,Number(input?.slaMinutes)||30));
  const duplicate=Math.max(0,Math.min(525600,Number(input?.duplicateWindowMinutes)||1440));
  return{name,provider,siteId:optional(input?.siteId,100),siteUrl:url(input?.siteUrl),isEnabled:input?.isEnabled!==false,allowedIps:jsonArray(input?.allowedIps),allowedFormIds:jsonArray(input?.allowedFormIds),defaultUserId:Number(input?.defaultUserId)||null,defaultDepartmentId:optional(input?.defaultDepartmentId,100),slaMinutes:sla,duplicateDetectionEnabled:input?.duplicateDetectionEnabled!==false,duplicateWindowMinutes:duplicate,callMatchWindowDays:Math.max(1,Math.min(90,Number(input?.callMatchWindowDays)||7)),minimumAnsweredSeconds:Math.max(1,Math.min(300,Number(input?.minimumAnsweredSeconds)||3))};
}

function firstValue(...values: unknown[]) { return values.find(value => value !== undefined && value !== null && String(value).trim() !== ''); }
function providerPayload(input: any, provider: SiteFormProvider) {
  if (provider === 'universal') return input;
  const data = input?.data && typeof input.data === 'object' ? input.data : {};
  const fields = data.FIELDS || data.fields || input.FIELDS || input.fields || {};
  const formId = firstValue(input.formId, input.FORM_ID, data.FORM_ID, data.formId, fields.FORM_ID);
  const resultId = firstValue(input.resultId, input.RESULT_ID, data.RESULT_ID, data.resultId, fields.RESULT_ID, data.ID);
  const eventId = firstValue(input.eventId, input.EVENT_ID, input.event, input.EVENT, data.eventId, formId && resultId ? `${provider}-form-${formId}-result-${resultId}` : undefined);
  return {...input,eventId,formId,resultId,
    formCode:firstValue(input.formCode,input.FORM_CODE,data.FORM_CODE,data.formCode),formName:firstValue(input.formName,input.FORM_NAME,data.FORM_NAME,data.formName),
    siteId:firstValue(input.siteId,input.SITE_ID,data.SITE_ID,data.siteId),siteUrl:firstValue(input.siteUrl,input.SITE_URL,data.SITE_URL,data.siteUrl),pageUrl:firstValue(input.pageUrl,input.PAGE_URL,data.PAGE_URL,data.pageUrl),
    pageTitle:firstValue(input.pageTitle,input.PAGE_TITLE,data.PAGE_TITLE,data.pageTitle),referer:firstValue(input.referer,input.REFERER,data.REFERER,data.referer),createdAt:firstValue(input.createdAt,input.CREATED_AT,data.CREATED_AT,data.DATE_CREATE,data.createdAt),
    fields:{name:firstValue(input?.fields?.name,fields.name,fields.NAME,fields.CONTACT_NAME,fields.FIO),phone:firstValue(input?.fields?.phone,fields.phone,fields.PHONE,fields.PHONE_NUMBER,fields.PHONE_VALUE),email:firstValue(input?.fields?.email,fields.email,fields.EMAIL,fields.EMAIL_VALUE),company:firstValue(input?.fields?.company,fields.company,fields.COMPANY,fields.COMPANY_TITLE),comment:firstValue(input?.fields?.comment,fields.comment,fields.COMMENT,fields.COMMENTS,fields.MESSAGE),preferredTime:firstValue(input?.fields?.preferredTime,fields.preferredTime,fields.PREFERRED_TIME)},
    utm:{source:firstValue(input?.utm?.source,fields.UTM_SOURCE,data.UTM_SOURCE),medium:firstValue(input?.utm?.medium,fields.UTM_MEDIUM,data.UTM_MEDIUM),campaign:firstValue(input?.utm?.campaign,fields.UTM_CAMPAIGN,data.UTM_CAMPAIGN),content:firstValue(input?.utm?.content,fields.UTM_CONTENT,data.UTM_CONTENT),term:firstValue(input?.utm?.term,fields.UTM_TERM,data.UTM_TERM)}};
}

export function normalizeWebhookPayload(input:any, provider:SiteFormProvider='universal'){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new SiteFormError(400,'invalid_json','Ожидается JSON-объект');
  input=providerPayload(input,provider);
  const eventId=text(input.eventId,191),formId=text(input.formId,100),phone=input?.fields?.phone;
  if(!eventId)throw new SiteFormError(400,'event_id_required','eventId обязателен');
  if(!formId)throw new SiteFormError(400,'form_id_required','formId обязателен');
  if(!isValidSiteFormPhone(phone))throw new SiteFormError(400,'phone_required','Корректный телефон обязателен');
  const normalized=normalizeSiteFormPhone(phone),created=new Date(input.createdAt||Date.now());
  if(Number.isNaN(created.getTime()))throw new SiteFormError(400,'invalid_created_at','Некорректная дата createdAt');
  return{eventId,externalResultId:optional(input.resultId,191),externalFormId:formId,formCode:optional(input.formCode,100),formName:optional(input.formName,191),siteId:optional(input.siteId,100),siteUrl:url(input.siteUrl),pageUrl:url(input.pageUrl),pageTitle:optional(input.pageTitle,500),referer:url(input.referer),customerName:optional(input?.fields?.name,191),phoneRaw:normalized.raw,phoneNormalized:normalized.normalized,phoneExtension:normalized.extension,email:optional(input?.fields?.email,191)?.toLowerCase()||null,company:optional(input?.fields?.company,191),comment:optional(input?.fields?.comment,4000),preferredTime:optional(input?.fields?.preferredTime,191),utmSource:optional(input?.utm?.source,191),utmMedium:optional(input?.utm?.medium,191),utmCampaign:optional(input?.utm?.campaign,191),utmContent:optional(input?.utm?.content,191),utmTerm:optional(input?.utm?.term,191),visitorClientId:optional(input?.visitor?.clientId,191),visitorSessionId:optional(input?.visitor?.sessionId,191),visitorIp:optional(input?.visitor?.ip,64),visitorUserAgent:optional(input?.visitor?.userAgent,500),createdAt:sqlDateInMoscow(created),rawPayload:JSON.stringify(input)};
}
