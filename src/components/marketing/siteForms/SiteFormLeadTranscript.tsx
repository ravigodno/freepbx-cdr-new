import { useEffect, useState } from 'react';

export default function SiteFormLeadTranscript({leadId,request}:{leadId:number;request:(url:string,init?:RequestInit)=>Promise<any>}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setData(null);setError('');setLoading(true);
    request(`/api/site-forms/leads/${leadId}/transcript`,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setData(result.data);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause.message||'Не удалось загрузить расшифровку');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[leadId,request,revision]);
  return <section className="rounded-xl border p-3 dark:border-slate-700">
    <div className="flex items-center justify-between gap-2"><h3 className="font-black">Расшифровка звонка</h3>
      <button disabled={loading} onClick={()=>setRevision(value=>value+1)} className="text-xs font-bold text-blue-600 disabled:opacity-50">Обновить</button></div>
    {loading&&<p className="mt-2 text-sm text-slate-500">Загрузка…</p>}
    {error&&<p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
    {!loading&&!error&&data?.active&&<p className="mt-2 text-xs text-amber-700">Разговор ещё идёт. Здесь показаны сохранённые реплики; после звонка нажмите «Обновить».</p>}
    {!loading&&!error&&!data?.rows?.length&&<p className="mt-2 text-sm text-slate-500">Сохранённая расшифровка недоступна. Она могла ещё не появиться, быть отключена или удалена по сроку хранения.</p>}
    <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">
      {(data?.rows||[]).map((turn:any)=><div key={turn.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
        <div className="mb-1 flex justify-between gap-2 text-xs font-bold"><span>{turn.speaker==='caller'?'Клиент':data.agentName||'AI-сотрудник'}</span>
          <span className="text-slate-500">{turn.startedAt?new Date(String(turn.startedAt).replace(' ','T')).toLocaleTimeString('ru-RU'):''}</span></div>
        <p className="whitespace-pre-wrap break-words">{turn.text}</p>
        {(turn.interrupted||turn.incomplete)&&<p className="mt-1 text-xs text-amber-700">Реплика прервана или сохранена не полностью.</p>}
      </div>)}
    </div>
  </section>;
}
