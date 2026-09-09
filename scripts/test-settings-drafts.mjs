import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(import.meta.url), {JSDOM}=require(process.env.PBXPULS_TEST_JSDOM || 'jsdom');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {UnsavedChangesProvider} from './src/components/settings/UnsavedChanges';
import Notifications from './src/components/settings/NotificationCenterSettings';
import Wizard from './src/components/marketing/siteForms/BitrixPullSetup';
import {PhonebookProfilesPanel} from './src/modules/directory/components/PhonebookProfilesPanel';
createRoot(document.getElementById('root')).render(<React.StrictMode><UnsavedChangesProvider>
<button id="leave" data-unsaved-navigation onClick={()=>window.left++}>Уйти</button>
<div id="notifications"><Notifications token="fixture" canManage={true} canViewLog={false}/></div>
<div id="phonebook"><PhonebookProfilesPanel token="fixture"/></div><div id="wizard"><Wizard onChanged={async()=>{}}/></div>
</UnsavedChangesProvider></React.StrictMode>);`},bundle:true,write:false,format:'iife',platform:'browser'});
const dom=new JSDOM('<div id="root"></div>',{url:'http://fixture.invalid',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.left=0;let writes=0,config={global:{enabled:false},channel:{enabled:false},bitrix24:{enabled:false},rules:[],catalog:[]};
w.fetch=async(url,init={})=>{if(init.method==='PUT'){assert.equal(url,'/api/notifications/settings');writes++;const data=JSON.parse(init.body);config={...config,global:data.global,channel:{enabled:data.channel.enabled},bitrix24:{enabled:data.bitrix24.enabled}};}else assert.ok(!init.method||init.method==='GET');return {ok:true,json:async()=>url.includes('/notifications/')?config:{items:[]}};};
w.eval(bundle.outputFiles[0].text);
const wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error(label);};
const input=(node,value)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new w.Event('input',{bubbles:true}));};
const buttons=(scope=d)=>[...scope.querySelectorAll('button')];
const dialog=()=>d.querySelector('[role="dialog"]');
const choose=text=>buttons(dialog()).find(b=>b.textContent===text).click();
await wait(()=>d.querySelector('#notifications input[type="checkbox"]'),'notifications loaded');
d.getElementById('leave').click();assert.equal(w.left,1);assert.equal(dialog(),null);
d.querySelector('#notifications input[type="checkbox"]').click();
await new Promise(r=>setTimeout(r,20));d.getElementById('leave').click();await wait(dialog,'notification dirty');choose('Сохранить');await wait(()=>w.left===2,'notifications saved');assert.equal(writes,1);assert.equal(config.global.enabled,true);
const name=d.querySelector('#phonebook input');input(name,'Edited phonebook');await new Promise(r=>setTimeout(r,20));d.getElementById('leave').click();await wait(dialog,'phonebook dirty');choose('Не сохранять');await wait(()=>w.left===3,'phonebook discarded');assert.equal(name.value,'Общая телефонная книга');
buttons(d.getElementById('wizard')).find(b=>b.textContent==='Добавить интеграцию').click();await wait(()=>buttons(d.getElementById('wizard')).some(b=>b.textContent.includes('1С-Битрикс')),'wizard opens without hook error');
buttons(d.getElementById('wizard')).find(b=>b.textContent.includes('1С-Битрикс')).click();await wait(()=>d.querySelector('#wizard input'),'wizard site step');input(d.querySelector('#wizard input'),'https://example.invalid');await new Promise(r=>setTimeout(r,20));
buttons(d.getElementById('wizard')).find(b=>b.textContent==='Закрыть').click();await wait(dialog,'wizard close guarded');choose('Остаться');await wait(()=>!dialog(),'wizard stays');assert.equal(d.querySelector('#wizard input').value,'https://example.invalid');
buttons(d.getElementById('wizard')).find(b=>b.textContent==='Закрыть').click();await wait(dialog,'wizard discard dialog');choose('Не сохранять');await wait(()=>buttons(d.getElementById('wizard')).some(b=>b.textContent==='Добавить интеграцию'),'wizard reset');assert.equal(writes,1);
dom.window.close();console.log('PASS actual notification save, phonebook discard, Bitrix wizard hook lifecycle and guarded close; all APIs mocked');
