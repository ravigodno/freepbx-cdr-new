import { monitorEventLoopDelay, performance, PerformanceObserver } from "node:perf_hooks";

type Category="media_callback"|"sql"|"transcript"|"audit"|"sse"|"http_request"|"post_call"|"crypto"|"gc"|"unknown";
const histogram=monitorEventLoopDelay({resolution:10});
let started=false,lastTick=performance.now(),utilization=performance.eventLoopUtilization(),gcPauseMaxMs=0;
const stalls:Record<Category,{count:number;maxMs:number}>={} as any;
for(const key of ["media_callback","sql","transcript","audit","sse","http_request","post_call","crypto","gc","unknown"] as Category[])stalls[key]={count:0,maxMs:0};
let activeCategory:Category="unknown";

export function startMainEventLoopDiagnostics(){
  if(started)return;started=true;histogram.enable();
  const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())gcPauseMaxMs=Math.max(gcPauseMaxMs,entry.duration)});
  observer.observe({entryTypes:["gc"]});
  const timer=setInterval(()=>{const now=performance.now(),delay=Math.max(0,now-lastTick-50);lastTick=now;if(delay>100){const bucket=stalls[activeCategory]||stalls.unknown;bucket.count++;bucket.maxMs=Math.max(bucket.maxMs,delay)}},50);
  timer.unref();
}
export async function measured<T>(category:Category,operation:()=>Promise<T>|T){
  const prior=activeCategory,start=performance.now();activeCategory=category;
  try{return await operation()}finally{const elapsed=performance.now()-start;if(elapsed>100){stalls[category].count++;stalls[category].maxMs=Math.max(stalls[category].maxMs,elapsed)}activeCategory=prior}
}
export function mainEventLoopMetrics(){
  const current=performance.eventLoopUtilization(utilization);utilization=performance.eventLoopUtilization();
  return{eventLoopDelayP95Ms:Number(histogram.percentile(95)/1e6),eventLoopDelayMaxMs:Number(histogram.max/1e6),
    eventLoopUtilization:current.utilization,gcPauseMaxMs,stallCategories:stalls};
}
