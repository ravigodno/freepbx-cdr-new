import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isValidSiteFormPhone, normalizeSiteFormPhone } from '../shared/siteFormPhone.js';
import { normalizeIntegrationInput, normalizeWebhookPayload } from '../server/siteForms/validation.js';
import { generateWebhookToken, hashWebhookToken, verifyWebhookToken } from '../server/siteForms/tokenSecurity.js';

for (const [raw,expected] of [
  ['+7 978 123-45-67','79781234567'],['8 (978) 123-45-67','79781234567'],['79781234567','79781234567'],['+7 495 123-45-67','74951234567'],['12345','12345']
]) assert.equal(normalizeSiteFormPhone(raw).normalized,expected);
assert.deepEqual(normalizeSiteFormPhone('+7 978 123-45-67 доб. 123'),{raw:'+7 978 123-45-67 доб. 123',normalized:'79781234567',extension:'123'});
assert.equal(isValidSiteFormPhone('100'),false);

const secret='test-installation-secret',id='11111111-1111-4111-8111-111111111111',token=generateWebhookToken(),hash=hashWebhookToken(id,token,secret);
assert.equal(hash.length,64);assert.equal(verifyWebhookToken(hash,id,token,secret),true);assert.equal(verifyWebhookToken(hash,id,`${token}x`,secret),false);

const integration=normalizeIntegrationInput({name:'Основной сайт',provider:'bitrix_site',siteUrl:'https://example.ru',slaMinutes:15,allowedIps:['203.0.113.10'],allowedFormIds:['12']});
assert.equal(integration.provider,'bitrix_site');assert.equal(integration.slaMinutes,15);
const payload=normalizeWebhookPayload({eventId:'site-1-form-12-result-4581',siteId:'s1',siteUrl:'https://example.ru',formId:'12',resultId:'4581',createdAt:'2026-08-03T16:40:00+03:00',pageUrl:'https://example.ru/services/',utm:{source:'yandex',medium:'cpc'},fields:{name:'Иван Петров',phone:'+7 978 123-45-67',email:'EXAMPLE@example.ru'},rawFields:{PHONE:'+7 978 123-45-67'}});
assert.equal(payload.phoneNormalized,'79781234567');assert.equal(payload.email,'example@example.ru');assert.equal(payload.externalFormId,'12');assert.equal(payload.createdAt,'2026-08-03 16:40:00');
const bitrix=normalizeWebhookPayload({event:'onCrmFormResultAdd',data:{FORM_ID:'19',RESULT_ID:'501',FIELDS:{NAME:'Анна',PHONE:'+7 999 111-22-33',EMAIL:'ANNA@example.ru',UTM_SOURCE:'direct'}}},'bitrix24');
assert.equal(bitrix.eventId,'onCrmFormResultAdd');assert.equal(bitrix.externalFormId,'19');assert.equal(bitrix.externalResultId,'501');assert.equal(bitrix.phoneNormalized,'79991112233');assert.equal(bitrix.email,'anna@example.ru');assert.equal(bitrix.utmSource,'direct');
assert.throws(()=>normalizeWebhookPayload({eventId:'x',formId:'12',fields:{phone:''}}),/телефон/i);

const migration=fs.readFileSync('server/pbxpulsMigrations.ts','utf8'),router=fs.readFileSync('server/siteForms/router.ts','utf8');
const setupGuide=fs.readFileSync('src/components/marketing/siteForms/SiteFormsSetupGuide.tsx','utf8');
const server=fs.readFileSync('server.ts','utf8');
const registryTable=fs.readFileSync('src/modules/cdr/components/LegacyCDRTable.tsx','utf8');
const pullEditor=fs.readFileSync('src/components/marketing/siteForms/BitrixPullEditor.tsx','utf8');
const pairing=fs.readFileSync('integrations/bitrix-pull/local/php_interface/lib/PbxpulsPairing.php','utf8'),injector=fs.readFileSync('integrations/bitrix-pull/local/php_interface/lib/PbxpulsTrackerInjector.php','utf8'),remotePairing=fs.readFileSync('server/siteForms/remotePairing.ts','utf8'),bitrixSetup=fs.readFileSync('src/components/marketing/siteForms/BitrixPullSetup.tsx','utf8');
for(const table of ['site_form_integrations','site_form_leads','site_form_lead_calls','site_form_lead_history','site_form_webhook_log'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
for(const permission of ['view_site_form_leads','manage_site_form_leads','call_site_form_leads','assign_site_form_leads','export_site_form_leads','view_site_form_reports','manage_site_form_integrations','view_site_form_webhook_logs'])assert.match(migration,new RegExp(permission));
for(const endpoint of ['/api/integrations/site-forms/:integrationId/webhook','/api/site-forms/leads','/api/site-forms/reports/overview','/api/site-forms/export.csv','/api/site-forms/integrations/:id/delete-preview','/api/site-forms/integrations/:id/delete-apply'])assert.ok(router.includes(endpoint));
assert.match(router,/event_already_processed/);assert.match(router,/beginTransaction|withPBXPulsTransaction/);assert.doesNotMatch(router,/console\.(log|info).*token/i);
assert.match(router,/if\(result\.created\).*site_forms\.lead_received/);
assert.match(migration,/20260811_080_site_form_integration_soft_delete/);assert.match(migration,/20260811_081_site_form_bitrix_multisite/);assert.match(migration,/selected_site_ids_json/);assert.match(router,/preservedLeads:true/);
for(const text of ['Как подключить сайт','Webhook','1С-Битрикс Pull API','Authorization: Bearer','Пример curl','Пример PHP'])assert.ok(setupGuide.includes(text));
assert.match(setupGuide,/pbxpuls-bitrix-connector-v5\.8\.3\.zip/);
for(const endpoint of ['bitrix-pair-preview','bitrix-pair-apply'])assert.ok(router.includes(endpoint));
assert.match(pairing,/random_int\(10000000, 99999999\)/);assert.match(pairing,/PAIR_ATTEMPTS/);assert.match(pairing,/ensureClickTable/);assert.match(pairing,/ensureTrackerHandler/);
assert.match(injector,/OnEndBufferContent|data-pbxpuls-tracker/);assert.match(injector,/pbxpuls_tracking_site_ids/);assert.match(remotePairing,/assertDnsSafe/);assert.match(remotePairing,/pairingVersion!==1/);
for(const text of ['Одноразовый код','Сайты, веб-формы и клики по телефонам','Собирать клики по телефонам','trackingEnabled','Можно выбрать несколько','siteIds:selectedSites'])assert.ok(bitrixSetup.includes(text));
assert.match(injector,/data-site-id/);assert.match(fs.readFileSync('integrations/bitrix-pull/local/api/pbxpuls/tracker.js','utf8'),/siteId:siteId/);assert.match(fs.readFileSync('integrations/bitrix-pull/local/php_interface/lib/PbxpulsClickCollector.php','utf8'),/event_id,site_id,event_time/);
const pullService=fs.readFileSync('server/siteForms/pullService.ts','utf8'),pullApi=fs.readFileSync('integrations/bitrix-pull/local/php_interface/lib/PbxpulsPullApi.php','utf8');
assert.match(pullService,/alreadyRunning:true/);assert.match(pullService,/pull_invalid_response/);
assert.match(pullApi,/catch \(Throwable \$error\)/);assert.match(pullApi,/'skipped' => \$skipped/);
assert.match(router,/const sqlNow=.*timeZone:'Europe\/Moscow'/);
assert.match(server,/showMixedRegistry/);assert.match(server,/callsTotal: sortedCalls\.length/);assert.match(server,/totalCount=sortedCalls\.length\+siteFormLeadsTotal/);
assert.match(server,/EXISTS\(SELECT 1 FROM site_form_lead_calls lc WHERE lc\.lead_id=l\.id AND \(lc\.linkedid=\? OR lc\.uniqueid=\?\)\)/);
assert.match(fs.readFileSync('src\/App.tsx','utf8'),/Показаны заявка и связанный с ней звонок/);
assert.match(registryTable,/answeredLate/);assert.doesNotMatch(registryTable,/Обработано вне SLA/);
for(const text of ['selectedSiteIds','selectedFormIds','trackingEnabled'])assert.ok(router.includes(text));
for(const text of ['Сайты Bitrix','Формы выбранных сайтов','Выбрать все с телефоном','Обновить из Bitrix'])assert.ok(pullEditor.includes(text));
console.log(JSON.stringify({phoneNormalization:'ok',tokenSecurity:'ok',payloadValidation:'ok',migrationTables:5,permissions:8,apiContracts:'ok'}));
