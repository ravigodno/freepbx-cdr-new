import React,{useEffect,useMemo,useState}from'react';
import{BookOpen,MessageSquare,Phone,Settings2,TestTube2}from'lucide-react';

const roleLabel:Record<string,string>={receptionist:'Администратор',telephony_admin:'Администратор телефонии',sales_manager:'Менеджер продаж'};
const extensionOf=(value:any)=>String(value||'').split(',')[0]?.split(':')[0]||'—';

export default function AiPlatformAgentList({token,canEdit}:{token:string;canEdit:boolean}){
 const headers=useMemo(()=>({Authorization:`Bearer ${token}`}),[token]),[agents,setAgents]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{void fetch('/api/ai-platform/voice-agents',{headers}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Не удалось загрузить AI-сотрудников');setAgents(body.rows||[])}).catch(e=>setError(e.message))},[headers]);
 return <section><div className="mb-4"><h1 className="text-2xl font-black text-slate-900">AI-сотрудники</h1><p className="mt-1 text-sm text-slate-500">Настройте голос, телефонный номер, навыки и передачу сотруднику.</p></div>
  {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
  <div className="grid gap-4 xl:grid-cols-2">{agents.map(agent=>{const extension=extensionOf(agent.telephony),working=agent.status==='active'&&agent.ready;return <article key={agent.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{agent.name}</h2><p className="text-sm text-slate-500">{roleLabel[agent.agent_type]||agent.agent_type||'AI-сотрудник'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${working?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>{working?'Работает':'Требует внимания'}</span></div>
   <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
    <div className="rounded-xl bg-slate-50 p-3"><Phone className="mb-1 h-4 w-4 text-blue-600"/><b>{extension}</b><div className="text-xs text-slate-500">Внутренний номер</div></div>
    <div className="rounded-xl bg-slate-50 p-3"><b>{agent.publishedVoice||agent.voice||'—'}</b><div className="text-xs text-slate-500">Голос</div></div>
    <div className="rounded-xl bg-slate-50 p-3"><b>{Number(agent.skill_count||0)}</b><div className="text-xs text-slate-500">Навыков</div></div>
    <div className="rounded-xl bg-slate-50 p-3"><BookOpen className="mb-1 h-4 w-4 text-blue-600"/><b>{agent.knowledge_connected?'Подключена':'Не подключена'}</b><div className="text-xs text-slate-500">База знаний</div></div>
    <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2"><b>{agent.handoff_destination||'Не настроено'}</b><div className="text-xs text-slate-500">Передача сотруднику</div></div>
   </div>
   <div className="mt-3 text-xs text-slate-500">Последняя публикация: {agent.published_at?new Date(agent.published_at).toLocaleString():'—'}</div>
   <div className="mt-4 flex flex-wrap gap-2">{canEdit&&<a href={`/ai-platform/agents/${agent.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white"><Settings2 className="h-4 w-4"/>Настроить</a>}<a href={`/ai-platform/agents/${agent.id}?step=test`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold"><TestTube2 className="h-4 w-4"/>Протестировать</a><a href="/ai-platform/conversations" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold"><MessageSquare className="h-4 w-4"/>Разговоры</a></div>
  </article>})}</div>
 </section>
}
