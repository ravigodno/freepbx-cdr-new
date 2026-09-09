// DOM interaction tests: optional jsdom outside the production dependency tree.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.PBXPULS_TEST_JSDOM || 'jsdom');
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Matrix from './src/modules/access/components/PermissionsMatrixTab';
import Dialer from './src/modules/softphone/components/UnifiedDialer';
function Fixture(){const [roles,setRoles]=useState([{id:'fixture',name:'Fixture',permissions:{view_calls:true,own_calls_only:true,view_balance:false}}]);
const [canCall,setCanCall]=useState(true);window.setCanCall=setCanCall;window.roles=roles;
return <><Matrix roles={roles} isLoadingRoles={false} isSavingRoles={false} onRolesChange={setRoles} onSaveRoles={()=>window.saved=roles} isSu={window.fixtureSu} showSuPermissionsToAdmin={true}/>
<Dialer sidebarExpanded={false} extension="781" mode="desk_phone" canCall={canCall} isCalling={false} headsetReady={false} onDeskPhoneCall={number=>window.calls.push(number)} onHeadsetCall={()=>{throw Error('Unexpected headset call')}}/></>}
createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
const wait=async(predicate,message)=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error(message);};
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://fixture.invalid',runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=w.document;w.fixtureSu=true;w.calls=[];w.localStorage.setItem('asterisk_cdr_session',JSON.stringify({token:'fixture-not-a-token'}));
let visibility={ai_platform:true};let failSave=false;let ignoreSave=false;let saves=0;
w.fetch=async(_url,init={})=>{if(init.method==='PUT'){saves++;if(failSave)return {ok:false,json:async()=>({error:'Fixture failure'})};if(!ignoreSave)visibility=JSON.parse(init.body).moduleVisibility;}return {ok:true,json:async()=>({moduleVisibility:visibility})};};
w.eval(bundle.outputFiles[0].text);
await wait(()=>d.querySelector('input[aria-label="Поиск прав"]'),'matrix mounted');
const inputValue=(input,value)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));};
const search=d.querySelector('input[aria-label="Поиск прав"]');
inputValue(search,'аналитика баланса');
await wait(()=>d.querySelectorAll('section').length===1,'search narrows section');
assert.match(d.querySelector('section').textContent,/Аналитика баланса/);
d.querySelector('input[aria-label="Все права раздела Баланс"]').click();
await wait(()=>w.roles[0].permissions.view_balance===true,'whole group toggle');
assert.equal(w.roles[0].permissions.view_balance_alerts,true,'filtered-out permission toggled');
assert.equal(w.roles[0].permissions.view_calls,true,'other section unchanged');
inputValue(search,'Реестр звонков');await wait(()=>d.querySelector('input[aria-label="Все права раздела Реестр звонков"]'),'calls search');
const callsGroup=d.querySelector('input[aria-label="Все права раздела Реестр звонков"]');assert.equal(callsGroup.indeterminate,true);
callsGroup.click();await wait(()=>w.roles[0].permissions.delete_records===true,'grant section');
assert.equal(w.roles[0].permissions.own_calls_only,true);
d.querySelector('input[aria-label="Все права раздела Реестр звонков"]').click();await wait(()=>w.roles[0].permissions.view_calls===false,'revoke section');assert.equal(w.roles[0].permissions.own_calls_only,true);
inputValue(search,'нет-такого-права');await wait(()=>d.querySelectorAll('section').length===0,'empty search');assert.match(d.body.textContent,/Права не найдены/);
const visibilityCheckbox=()=>[...d.querySelectorAll('label')].find(l=>l.textContent.trim()==='AI Platform').querySelector('input');
await wait(()=>!visibilityCheckbox().disabled,'visibility loaded');failSave=true;visibilityCheckbox().click();await wait(()=>!visibilityCheckbox().disabled && saves===1,'failed save settled');assert.equal(visibilityCheckbox().checked,true,'failed save reverted');
failSave=false;visibilityCheckbox().click();await wait(()=>!visibilityCheckbox().disabled && saves===2,'save settled');assert.equal(visibility.ai_platform,false);
ignoreSave=true;visibilityCheckbox().click();await wait(()=>!visibilityCheckbox().disabled && saves===3,'ignored save settled');assert.equal(visibilityCheckbox().checked,false,'ignored save reverted');assert.match(d.body.textContent,/Сервер не применил изменение/);ignoreSave=false;
const sectionCheckboxes=[...d.querySelectorAll('label')].filter(label=>label.querySelector('input')?.classList.contains('h-3.5')).map(label=>label.querySelector('input'));
assert.equal(sectionCheckboxes.length,15);
for(const checkbox of sectionCheckboxes){const before=checkbox.checked;const expected=saves+1;checkbox.click();await wait(()=>!checkbox.disabled && saves===expected,'section save settled');assert.equal(checkbox.checked,!before);assert.match(d.body.textContent,/Видимость разделов сохранена/);}
const dialer=d.querySelector('button[aria-label="Телефон"]');assert.ok(dialer);dialer.click();await wait(()=>d.querySelector('[role="dialog"]'),'dialer opens');assert.equal(w.calls.length,0);
inputValue(d.querySelector('input[inputmode="tel"]'),'15550001234');await wait(()=>![...d.querySelectorAll('button')].find(b=>b.textContent==='Позвонить через телефон').disabled,'number ready');
[...d.querySelectorAll('button')].find(b=>b.textContent==='Позвонить через телефон').click();await wait(()=>w.calls.length===1,'mock call handler');assert.equal(w.calls[0],'15550001234');
d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(()=>!d.querySelector('[role="dialog"]'),'closed');w.setCanCall(false);await wait(()=>dialer.disabled,'call permission revoked');dialer.click();assert.equal(d.querySelector('[role="dialog"]'),null);assert.equal(w.calls.length,1);
dom.window.close();
const adminDom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://fixture.invalid',runScripts:'dangerously',pretendToBeVisual:true});
const aw=adminDom.window,ad=aw.document;aw.fixtureSu=false;aw.calls=[];aw.localStorage.setItem('asterisk_cdr_session',JSON.stringify({token:'fixture'}));aw.fetch=async()=>({ok:true,json:async()=>({moduleVisibility:{}})});
aw.eval(bundle.outputFiles[0].text);
await wait(()=>ad.querySelector('input[aria-label="Все права раздела Управление"]'),'admin matrix');
assert.doesNotMatch(ad.body.textContent,/SU: видимость разделов системы/);
const trunks=[...ad.querySelectorAll('label')].find(label=>label.textContent.includes('Управление SIP-транками')).querySelector('input');assert.equal(trunks.disabled,true);
ad.querySelector('input[aria-label="Все права раздела Управление"]').click();await wait(()=>aw.roles[0].permissions.view_management===true,'admin section enable');assert.notEqual(aw.roles[0].permissions.manage_trunks,true);
adminDom.window.close();
console.log('PASS DOM search, empty state, mixed/full section toggle, restriction preservation, visibility save rollback, sidebar dialer and exact mock number (no calls)');
