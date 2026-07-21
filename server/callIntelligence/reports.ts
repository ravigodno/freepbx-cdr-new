import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { buildCallIntelligenceInsights, type InsightPeriod, type ProblemInsight } from './insights.js';
import type { CallIntelligenceDeps } from './service.js';

export type ReportType = 'daily' | 'weekly' | 'technical' | 'management';
export interface ReportRecommendation { text: string; reason: string; source: string; confidence: string }
export interface CallIntelligenceReport {
  type: ReportType; period: InsightPeriod; from: string; to: string; generatedAt: string;
  summary: { state: 'good'|'attention'|'critical'|'insufficient_data'; title: string; description: string };
  calls: { total: number; incoming: number; outgoing: number; internal: number; answered: number; missed: number; failed: number; problemRate: number|null };
  sla: { available: boolean; targetSeconds: number; targetPercent: number; averageWaitSeconds: number|null; answeredWithinTargetPercent: number|null; lostAfterTarget: number|null; status: 'ok'|'warning'|'insufficient_data' };
  problems: ProblemInsight[];
  quality: { available: boolean; averageMos: number|null; averageJitterMs: number|null; averageLossPercent: number|null; affectedEndpoints: string[]; reason: string|null };
  security: { eventCount: number; groups: ProblemInsight[] };
  recommendations: ReportRecommendation[];
  health: { partial: boolean; unavailableSources: string[] };
  exportCapabilities: { json: true; pdf: false; email: false; telegram: false };
  profile: { durationMs: number; cacheHit: boolean; cacheAgeMs: number; ttlMs: number; responseBytes?: number };
}

const PERIOD: Record<ReportType,{insight:InsightPeriod,ms:number}>={daily:{insight:'24h',ms:86400000},weekly:{insight:'7d',ms:604800000},technical:{insight:'24h',ms:86400000},management:{insight:'24h',ms:86400000}};
const TTL=120000,MAX=24,cache=new Map<string,{created:number,value:CallIntelligenceReport}>();
const sqlDate=(d:Date)=>d.toISOString().slice(0,19).replace('T',' '), internal=(v:any)=>/^\d{2,6}$/.test(String(v||''));
export function normalizeReportType(value:unknown):ReportType{return ['daily','weekly','technical','management'].includes(String(value))?String(value) as ReportType:'daily'}
function getCache(key:string){const row=cache.get(key);if(!row||Date.now()-row.created>TTL){if(row)cache.delete(key);return null}cache.delete(key);cache.set(key,row);return{...row.value,profile:{...row.value.profile,cacheHit:true,cacheAgeMs:Date.now()-row.created,ttlMs:TTL}}}
function setCache(key:string,value:CallIntelligenceReport){cache.set(key,{created:Date.now(),value});while(cache.size>MAX)cache.delete(cache.keys().next().value!)}

export function calculateCallStatistics(rows:any[]){
  const grouped=new Map<string,any[]>();for(const row of rows){const id=String(row.linkedid||row.uniqueid||'');if(id)grouped.set(id,[...(grouped.get(id)||[]),row])}
  const calls=[...grouped.values()];let incoming=0,outgoing=0,inside=0,answered=0,missed=0,failed=0;
  for(const group of calls){const first=group.slice().sort((a,b)=>Date.parse(a.calldate)-Date.parse(b.calldate))[0],ok=group.some(r=>String(r.disposition).toUpperCase()==='ANSWERED'&&Number(r.billsec)>0),dispositions=new Set(group.map(r=>String(r.disposition).toUpperCase()));if(internal(first.src)&&internal(first.dst))inside++;else if(first.did||/from-trunk|from-pstn|ext-did/i.test(String(first.dcontext)))incoming++;else outgoing++;if(ok)answered++;else if(dispositions.has('FAILED')||dispositions.has('CHANUNAVAIL')||dispositions.has('CONGESTION'))failed++;else missed++}
  return{total:calls.length,incoming,outgoing,internal:inside,answered,missed,failed,problemRate:calls.length?Number((((missed+failed)/calls.length)*100).toFixed(2)):null};
}

export function calculateSla(rows:any[],targetSeconds=20,targetPercent=80){const queue=rows.filter(r=>/queue/i.test(`${r.lastapp} ${r.dcontext}`));if(!queue.length)return{available:false,targetSeconds,targetPercent,averageWaitSeconds:null,answeredWithinTargetPercent:null,lostAfterTarget:null,status:'insufficient_data' as const};const answered=queue.filter(r=>String(r.disposition).toUpperCase()==='ANSWERED'&&Number(r.billsec)>0),waits=answered.map(r=>Math.max(0,Number(r.duration||0)-Number(r.billsec||0))),within=waits.filter(v=>v<=targetSeconds).length,pct=waits.length?Number((within/waits.length*100).toFixed(2)):null,avg=waits.length?Number((waits.reduce((a,b)=>a+b,0)/waits.length).toFixed(2)):null,lost=queue.filter(r=>String(r.disposition).toUpperCase()!=='ANSWERED'&&Number(r.duration||0)>targetSeconds).length;return{available:true,targetSeconds,targetPercent,averageWaitSeconds:avg,answeredWithinTargetPercent:pct,lostAfterTarget:lost,status:pct!==null&&pct>=targetPercent?'ok' as const:'warning' as const}}

function recommendations(problems:ProblemInsight[]):ReportRecommendation[]{return problems.flatMap(p=>p.recommendations.map(r=>({text:r.text,reason:r.reason,source:`${p.category}:${p.type}`,confidence:p.confidence}))).filter((r,i,a)=>a.findIndex(x=>x.text===r.text&&x.source===r.source)===i).slice(0,12)}
function reportState(problems:ProblemInsight[],total:number){if(!total)return{state:'insufficient_data' as const,title:'Недостаточно данных',description:'За выбранный период звонки не найдены.'};if(problems.some(p=>p.severity==='critical'))return{state:'critical' as const,title:'Требуется внимание',description:'Обнаружены критические повторяющиеся проблемы телефонии.'};if(problems.length)return{state:'attention' as const,title:'Есть отклонения',description:'Обнаружены повторяющиеся проблемы, требующие проверки.'};return{state:'good' as const,title:'Состояние хорошее',description:'Подтверждённые повторяющиеся проблемы не обнаружены.'}}

export async function buildCallIntelligenceReport(deps:CallIntelligenceDeps,requested:unknown):Promise<CallIntelligenceReport>{
  const type=normalizeReportType(requested),hit=getCache(type);if(hit)return hit;const started=Date.now(),cfg=PERIOD[type],to=new Date(),from=new Date(to.getTime()-cfg.ms),unavailable:string[]=[];
  const [insights,cdr,qualityRows]=await Promise.all([
    buildCallIntelligenceInsights(deps,cfg.insight),
    deps.queryCdr(`SELECT calldate,src,dst,dcontext,lastapp,duration,billsec,disposition,uniqueid,linkedid,did FROM cdr WHERE calldate BETWEEN ? AND ? ORDER BY calldate DESC LIMIT 10000`,[sqlDate(from),sqlDate(to)]).catch(()=>{unavailable.push('cdr');return[]}),
    queryPBXPulsDb(`SELECT AVG(mos) average_mos,AVG(jitter_ms) average_jitter,AVG(rtp_loss) average_loss,COUNT(*) samples FROM quality_rtcp_history WHERE sampled_at BETWEEN ? AND ?`,[sqlDate(from),sqlDate(to)]).catch(()=>{unavailable.push('quality_rtcp_history');return[]})
  ]);
  if(cdr.length>=10000)unavailable.push('cdr_limit');const calls=calculateCallStatistics(cdr),sla=calculateSla(cdr),q=qualityRows[0]||{},qualityProblems=insights.insights.filter(p=>p.category==='quality'),qualityAvailable=Number(q.samples||0)>0;
  const allProblems=type==='management'?insights.insights.slice(0,5):type==='technical'?insights.insights:insights.insights.slice(0,10),securityGroups=insights.insights.filter(p=>p.category==='security'),criticalFirst=allProblems.slice().sort((a,b)=>(b.severity==='critical'?1:0)-(a.severity==='critical'?1:0)||b.count-a.count);
  const report:any={type,period:cfg.insight,from:from.toISOString(),to:to.toISOString(),generatedAt:new Date().toISOString(),summary:reportState(allProblems,calls.total),calls,sla,problems:criticalFirst,quality:{available:qualityAvailable,averageMos:qualityAvailable?Number(Number(q.average_mos).toFixed(2)):null,averageJitterMs:qualityAvailable?Number(Number(q.average_jitter).toFixed(2)):null,averageLossPercent:qualityAvailable?Number(Number(q.average_loss).toFixed(2)):null,affectedEndpoints:[...new Set(qualityProblems.flatMap(p=>p.affectedObjects.map(o=>o.name)))].slice(0,20),reason:qualityAvailable?null:'rtcp_unavailable'},security:{eventCount:securityGroups.reduce((s,p)=>s+p.count,0),groups:securityGroups},recommendations:recommendations(criticalFirst),health:{partial:insights.partial||unavailable.length>0,unavailableSources:[...new Set([...insights.unavailableSources,...unavailable])]},exportCapabilities:{json:true,pdf:false,email:false,telegram:false},profile:{durationMs:Date.now()-started,cacheHit:false,cacheAgeMs:0,ttlMs:TTL}};
  report.profile.responseBytes=Buffer.byteLength(JSON.stringify(report));setCache(type,report);return report;
}
