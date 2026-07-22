import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, ShieldCheck, X } from 'lucide-react';
import AgentKnowledgeTrainingPage from './AgentKnowledgeTrainingPage';
import AgentSandboxPanel from './AgentSandboxPanel';
import TransferRequestsPanel from './TransferRequestsPanel';
import BusinessActionsPanel from './BusinessActionsPanel';
import VoiceGatewayPanel from './VoiceGatewayPanel';
import VoiceMediaPanel from './VoiceMediaPanel';
import RealtimeVoicePanel from './RealtimeVoicePanel';
import LiveVoiceTestPanel from './LiveVoiceTestPanel';

interface Props { token:string; canCreate:boolean;canViewKnowledge:boolean;canViewTraining:boolean;canViewTransfers:boolean;canTestTransfer:boolean;canViewCallbacks:boolean;canManageCallbacks:boolean;canAssignActions:boolean;canViewVoice:boolean;canManageVoice:boolean;canTestVoice:boolean;canViewMedia:boolean;canTestMedia:boolean;canViewRealtime:boolean;canTestRealtime:boolean;canViewLive:boolean;canConfigureLive:boolean;canEnableLive:boolean;canCheckLive:boolean }
interface Template { id:number;template_key:string;name:string;description:string;agent_type:string }
const FALLBACK_TEMPLATES:Template[]=[
  {id:0,template_key:'receptionist_default',name:'AI Receptionist',description:'Виртуальный администратор компании, принимающий обращения клиентов',agent_type:'receptionist'},
  {id:0,template_key:'pbx_admin_default',name:'AI PBXPuls Administrator',description:'Помощник администратора телефонии PBXPuls',agent_type:'telephony_admin'},
  {id:0,template_key:'sales_manager_default',name:'AI Sales Manager',description:'AI менеджер первичных продаж',agent_type:'sales_manager'}
];

export default function AiAgentBuilderPage({token,canCreate,canViewKnowledge,canViewTraining,canViewTransfers,canTestTransfer,canViewCallbacks,canManageCallbacks,canAssignActions,canViewVoice,canManageVoice,canTestVoice,canViewMedia,canTestMedia,canViewRealtime,canTestRealtime,canViewLive,canConfigureLive,canEnableLive,canCheckLive}:Props){
  const [templates,setTemplates]=useState<Template[]>([]),[enabled,setEnabled]=useState(false),[wizard,setWizard]=useState(false),[step,setStep]=useState(1),[selected,setSelected]=useState<Template|null>(null),[name,setName]=useState(''),[role,setRole]=useState(''),[message,setMessage]=useState('');
  const headers=useMemo(()=>({Authorization:`Bearer ${token}`,'Content-Type':'application/json'}),[token]);
  useEffect(()=>{void fetch('/api/ai-platform/status',{headers}).then(r=>r.json()).then(data=>{setEnabled(Boolean(data.enabled));if(data.enabled)return fetch('/api/ai-platform/templates',{headers}).then(r=>r.json()).then(value=>setTemplates(value.rows||[]))}).catch(()=>setEnabled(false))},[headers]);
  const cards=templates.length?templates:FALLBACK_TEMPLATES;
  const choose=(item:Template)=>{setSelected(item);setName(item.name);setRole(item.agent_type);setStep(2)};
  const create=async()=>{if(!selected?.id)return;setMessage('');const agentKey=`${selected.agent_type}_${Date.now()}`;const response=await fetch('/api/ai-platform/agents/from-template',{method:'POST',headers,body:JSON.stringify({templateId:selected.id,agentKey,name,role})});const body=await response.json();if(!response.ok){setMessage(body.error||'Не удалось создать draft');return}setMessage('Draft агента создан');setWizard(false)};
  const knowledgeRoute=window.location.pathname.match(/^\/ai-platform\/agents\/(\d+)\/knowledge$/),agentId=knowledgeRoute?Number(knowledgeRoute[1]):0;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div><h2 className="text-xl font-black text-slate-900 dark:text-white">AI Platform</h2><p className="mt-1 text-sm text-slate-500">Конструктор конфигураций AI-сотрудников без запуска runtime</p></div>
      <button disabled={!enabled||!canCreate} onClick={()=>{setWizard(true);setStep(1)}} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4"/>Создать агента</button>
    </div>
    {!enabled&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">AI Platform Core выключен настройкой <code>ai.platform_core_enabled=false</code>. Шаблоны показаны только для ознакомления.</div>}
    {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    {agentId>0&&<><AgentKnowledgeTrainingPage token={token} agentId={agentId} enabled={enabled} canViewKnowledge={canViewKnowledge} canViewTraining={canViewTraining}/><AgentSandboxPanel token={token} agentId={agentId}/><TransferRequestsPanel token={token} enabled={enabled} canView={canViewTransfers} canTest={canTestTransfer}/><BusinessActionsPanel token={token} enabled={enabled} agentId={agentId} canView={canViewCallbacks} canManage={canManageCallbacks} canAssign={canAssignActions}/><VoiceGatewayPanel token={token} canView={canViewVoice} canManage={canManageVoice} canTest={canTestVoice}/><VoiceMediaPanel token={token} canView={canViewMedia} canTest={canTestMedia}/><RealtimeVoicePanel token={token} canView={canViewRealtime} canTest={canTestRealtime}/><LiveVoiceTestPanel token={token} canView={canViewLive} canConfigure={canConfigureLive} canEnable={canEnableLive} canCheck={canCheckLive}/></>}
    {!agentId&&<>
    <div className="grid gap-4 md:grid-cols-3">{cards.map(item=><article key={item.template_key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"><Bot className="mb-4 h-8 w-8 text-blue-600"/><h3 className="font-black text-slate-900 dark:text-white">{item.name}</h3><p className="mt-2 min-h-12 text-sm text-slate-500">{item.description}</p><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4"/>Draft only · runtime off</div></article>)}</div>
    {wizard&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800"><div className="flex items-center justify-between"><h3 className="text-lg font-black">Создание AI-сотрудника · шаг {step}/6</h3><button onClick={()=>setWizard(false)}><X/></button></div>
      {step===1&&<div className="mt-5 space-y-2">{templates.map(item=><button key={item.id} onClick={()=>choose(item)} className="w-full rounded-xl border p-3 text-left hover:border-blue-500"><b>{item.name}</b><div className="text-xs text-slate-500">{item.description}</div></button>)}</div>}
      {step===2&&<label className="mt-5 block text-sm font-bold">Имя<input value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>}
      {step===3&&<label className="mt-5 block text-sm font-bold">Роль<input value={role} onChange={e=>setRole(e.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>}
      {step===4&&<div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">Поведение: natural_receptionist_default · короткие естественные ответы · human-first transfer.</div>}
      {step===5&&<div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">Права и tools берутся из системного шаблона и повторно проверяются backend.</div>}
      {step===6&&<div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><b>{name}</b><br/>{selected?.name} · {role}<br/>Будет создан только draft без запуска AI.</div>}
      {step>1&&<div className="mt-6 flex justify-between"><button onClick={()=>setStep(step-1)} className="rounded-xl border px-4 py-2 text-sm font-bold">Назад</button>{step<6?<button disabled={(step===2&&!name.trim())||(step===3&&!role.trim())} onClick={()=>setStep(step+1)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Далее</button>:<button onClick={()=>void create()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Создать draft</button>}</div>}
    </div></div>}</>}
  </section>
}
