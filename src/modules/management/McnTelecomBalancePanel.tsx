import BalancePackageCells from './BalancePackageCells';
import React,{useEffect,useState} from 'react';
import {Activity,KeyRound,RefreshCw,Save} from 'lucide-react';
type Props={token:string;canManage:boolean;canSync:boolean;mode:'summary'|'settings';refreshKey?:number};
const labels:Record<string,string>={disabled:'Выключено',pending:'Ожидает проверки',success:'Подключено',error:'Ошибка подключения'};
export default function McnTelecomBalancePanel({token,canManage,canSync,mode,refreshKey}:Props){
  const [data,setData]=useState<any>(null),[apiToken,setApiToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const request=async(path:string,method='GET',body?:any)=>{const r=await fetch(`/api/balance/providers/mcn-telecom/${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok||!j.success)throw Error(j.safeMessage||'Не удалось загрузить MCN Telecom');return j.data};
  const load=async()=>{try{setData(await request(mode==='settings'?'settings':'summary'));setError('')}catch(e:any){setError(e.message)}};
  useEffect(()=>{void load()},[token,mode,refreshKey]);
  const action=async(kind:'save'|'diagnose'|'sync')=>{if(busy)return;setBusy(true);setError('');setNotice('');try{
    if(kind==='save'){setData(await request('settings','PUT',{enabled:data.enabled,accountId:data.accountId||null,syncIntervalMinutes:Number(data.syncIntervalMinutes),...(apiToken?{token:apiToken}:{})}));setApiToken('');setNotice('Настройки сохранены');}
    else{const result=await request(kind,'POST');setNotice(kind==='diagnose'?`API доступен. Баланс: ${money(result.balance,result.currency)}. Проверка не сохраняет снимок.`:'Баланс обновлён');if(kind==='sync')await load();}
  }catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const money=(v:number|null,currency='RUB')=>v===null||v===undefined?'Нет данных':new Intl.NumberFormat('ru-RU',{style:'currency',currency}).format(v);
  const button='btn disabled:opacity-50';
  const statusTone=data?.status==='success'?'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300':data?.status==='error'?'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300':'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800';
  if(mode==='settings'&&!canManage)return null;
  if(mode==='summary')return <section className="grid gap-4 border-t border-slate-200 px-4 py-3 sm:grid-cols-2 2xl:grid-cols-[minmax(200px,1.4fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(150px,1fr)] 2xl:items-center dark:border-slate-700">
    <div><div className="text-[10px] uppercase text-slate-400">Оператор</div><div className="mt-1 font-black">MCN Telecom</div>
      <div className={`mt-1 inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${statusTone}`}>{busy?'Обновление':data?labels[data.status]||data.status:error?'Ошибка загрузки':'Загрузка…'}</div>
      {data?.accountNumberMasked&&<div className="mt-1 text-xs text-slate-600 dark:text-slate-300">Лицевой счёт: <span className="font-mono font-bold">{data.accountNumberMasked}</span></div>}</div>
    <div><div className="text-[10px] uppercase text-slate-400">Источник данных</div><div className="mt-1 text-xs font-bold">MCN Telecom · API ЛК</div></div>
    <div className="min-w-0"><div className="text-[10px] uppercase text-slate-400">Текущий баланс</div><div className="mt-1 whitespace-nowrap font-mono text-lg font-black" title="Баланс без кредитного лимита">{money(data?.balance,data?.currency||'RUB')}</div>
      <div className="mt-1 text-[10px] text-slate-500">Кредитный лимит: {money(data?.creditLimit,data?.currency||'RUB')}</div></div>
    <BalancePackageCells />
    <div className="min-w-0 border-slate-200 text-[10px] text-slate-500 sm:text-right 2xl:border-l 2xl:pl-4 dark:border-slate-700">Обновлено:<br/><span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">{data?.measuredAt?new Date(data.measuredAt).toLocaleString('ru-RU'):'Нет данных'}</span>
      {canSync&&<div className="mt-2 flex sm:justify-end"><button type="button" className={button} disabled={busy||!data?.enabled||!data?.configured} onClick={()=>void action('sync')}><RefreshCw className={`h-3.5 w-3.5 ${busy?'animate-spin':''}`}/>Обновить</button></div>}</div>
    {data?.safeErrorCode&&<div className="text-[11px] text-red-600 sm:col-span-2 2xl:col-span-6">{data.safeErrorCode}{data.measuredAt&&' · Показан последний успешный снимок'}</div>}
    {error&&<div role="alert" className="text-[11px] text-red-600 sm:col-span-2 2xl:col-span-6">{error}</div>}{notice&&<div role="status" className="text-[11px] text-slate-500 sm:col-span-2 2xl:col-span-6">{notice}</div>}
  </section>;
  return <section className="space-y-4 rounded-3xl border border-violet-200 bg-violet-50/40 p-5 text-xs dark:border-violet-900 dark:bg-violet-950/10">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-black"><KeyRound className="h-4 w-4 text-violet-600"/>MCN Telecom</h3><p className="mt-1 text-[11px] text-slate-500">Баланс лицевого счёта · API ЛК</p></div>
      {data&&<label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={data.enabled} onChange={e=>setData({...data,enabled:e.target.checked})}/>Включён</label>}</div>
    {!data&&!error&&<p>Загрузка…</p>}
    {data&&<div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label>Токен API<input aria-label="Токен MCN" type="password" autoComplete="new-password" value={apiToken} placeholder={data.hasToken?'Сохранён · оставьте пустым без изменения':'Введите токен'} onChange={e=>setApiToken(e.target.value)} className="input mt-1 w-full"/></label>
        <label>Лицевой счёт<input value={data.accountId||''} inputMode="numeric" placeholder="Определить по токену" onChange={e=>setData({...data,accountId:e.target.value})} className="input mt-1 w-full"/></label>
        <label>Автосинхронизация, минут<input type="number" min="5" max="1440" value={data.syncIntervalMinutes} onChange={e=>setData({...data,syncIntervalMinutes:e.target.value})} className="input mt-1 w-full"/></label>
      </div>
      <p className="text-xs text-slate-500">Токен хранится зашифрованным. Без номера лицевого счёта используется аккаунт токена по умолчанию. Сначала сохраните изменения, затем проверьте подключение. Детализация звонков пока не подключена.</p>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy||!data.hasToken} onClick={()=>void action('diagnose')}><Activity className="h-4 w-4"/>Проверить подключение</button><button type="button" className={`${button} bg-violet-600 text-white`} disabled={busy} onClick={()=>void action('save')}><Save className="h-4 w-4"/>Сохранить</button></div>
    </div>}
    {error&&<div role="alert" className="rounded-xl bg-white p-3 text-red-600 dark:bg-slate-900">{error}</div>}{notice&&<div role="status" className="rounded-xl bg-white p-3 dark:bg-slate-900">{notice}</div>}
  </section>;
}
