import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.PBXPULS_TEST_JSDOM || 'jsdom');
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UnsavedChangesProvider, useUnsavedSource, useUnsavedChanges, draftFingerprint } from './src/components/settings/UnsavedChanges';
function Fixture() {
  const {saveChanges} = useUnsavedChanges();
  const [value, setValue] = useState('saved'), [saved, setSaved] = useState('saved');
  const [role, setRole] = useState(false), [savedRole, setSavedRole] = useState(false);
  const [screen, setScreen] = useState('settings');
  const save = async () => { window.saves++; if(window.waitSave) await window.waitSave; if(window.fail) return false; setSaved(value); return true; };
  window.same = draftFingerprint({a:1,b:{c:2}}) === draftFingerprint({b:{c:2},a:1});
  useUnsavedSource({label:'настройки',dirty:value!==saved,save,discard:()=>setValue(saved)});
  useUnsavedSource({label:'права доступа',dirty:role!==savedRole,save:async()=>{window.roleSaves++;setSavedRole(role);return true;},discard:()=>setRole(savedRole)});
  return <><aside data-unsaved-navigation><button id="leave" onClick={()=>{window.navigations++;setScreen('other');}}>Уйти</button><button id="theme" data-unsaved-ignore onClick={()=>window.themes++}>Тема</button></aside>
  <span id="screen">{screen}</span><input id="field" value={value} onChange={e=>setValue(e.target.value)}/><input id="role" type="checkbox" checked={role} onChange={e=>setRole(e.target.checked)}/>
  <button id="all" onClick={()=>void saveChanges()}>Сохранить настройки</button><button id="manual" onClick={()=>void save()}>Сохранить вручную</button><button id="reset-screen" onClick={()=>setScreen('settings')}>Назад</button></>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><UnsavedChangesProvider><Fixture/></UnsavedChangesProvider></React.StrictMode>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const dom = new JSDOM('<div id="root"></div>', { url: 'http://fixture.invalid', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.saves = 0; w.roleSaves = 0; w.navigations = 0; w.themes = 0;
w.eval(bundle.outputFiles[0].text);
const wait = async (fn, label) => { for (let i=0;i<100;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,10)); } throw Error(label); };
const click = id => d.getElementById(id).click();
const modal = () => d.querySelector('[role="dialog"]');
const button = label => [...modal().querySelectorAll('button')].find(b=>b.textContent===label);
const value = text => { const input=d.getElementById('field'); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new w.Event('input',{bubbles:true})); };
const unload = () => {const event=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(event);return event.defaultPrevented;};
await wait(()=>d.getElementById('field'),'mounted');assert.equal(w.same,true);
click('leave');await wait(()=>w.navigations===1,'clean navigation');assert.equal(modal(),null);assert.equal(unload(),false);click('reset-screen');
value('edited');await wait(()=>unload(),'dirty unload guard');click('theme');assert.equal(w.themes,1);assert.equal(modal(),null);
click('leave');await wait(modal,'dialog opens');assert.equal(w.navigations,1);assert.equal(d.activeElement.textContent,'Остаться');button('Остаться').click();await wait(()=>!modal(),'stay');assert.equal(d.getElementById('field').value,'edited');
value('saved');await wait(()=>!unload(),'undo edit is clean');click('leave');await wait(()=>w.navigations===2,'undo navigation');click('reset-screen');
value('discard');click('role');await wait(()=>unload(),'two dirty drafts');click('leave');await wait(modal,'discard dialog');assert.match(modal().textContent,/права доступа/);button('Не сохранять').click();await wait(()=>w.navigations===3,'discard navigation');assert.equal(d.getElementById('field').value,'saved');assert.equal(d.getElementById('role').checked,false);assert.equal(w.saves,0);assert.equal(unload(),false);click('reset-screen');
value('failure');await wait(()=>unload(),'failure draft');w.fail=true;click('leave');await wait(modal,'failure dialog');button('Сохранить').click();await wait(()=>d.querySelector('[role="alert"]'),'failure visible');assert.equal(w.navigations,3);assert.equal(d.getElementById('field').value,'failure');assert.equal(unload(),true);
w.fail=false;button('Сохранить').click();await wait(()=>w.navigations===4,'retry succeeds');assert.equal(unload(),false);click('reset-screen');
value('slow save');click('role');await wait(()=>unload(),'slow draft');let complete;w.waitSave=new Promise(resolve=>{complete=resolve;});click('leave');await wait(modal,'slow dialog');button('Сохранить').click();await wait(()=>modal().getAttribute('aria-busy')==='true','saving locked');assert.equal([...modal().querySelectorAll('button')].every(b=>b.disabled),true);assert.equal(w.navigations,4);complete();await wait(()=>w.navigations===5,'saved both drafts');assert.equal(w.roleSaves,1);assert.equal(unload(),false);w.waitSave=null;click('reset-screen');
value('manual save');await wait(()=>unload(),'manual dirty');click('manual');await wait(()=>!unload(),'manual baseline');click('leave');await wait(()=>w.navigations===6,'no prompt after manual save');assert.equal(modal(),null);
value('save all');click('role');await wait(()=>unload(),'save all dirty');const oldRoleSaves=w.roleSaves;click('all');await wait(()=>!unload(),'save all completed');assert.equal(w.roleSaves,oldRoleSaves+1);assert.equal(modal(),null);
dom.window.close();
console.log('PASS unsaved settings: clean/undo, stay, discard, multiple drafts, save failure/retry, pending save, manual save, navigation capture and beforeunload');
