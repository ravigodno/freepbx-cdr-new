export const EMPTY_THREAT_FILTERS={groupBy:'',minutes:'60',severity:'',category:'',sourceIp:'',service:'',result:'',search:'',blocked:false,external:false} as const;

export function resetSecurityThreatFilters(){return{...EMPTY_THREAT_FILTERS};}

export function activeSecurityThreatFilters(filters:Record<string,unknown>){
  return Object.entries(filters).filter(([key,value])=>key==='minutes'||value===true||Boolean(value)).map(([key,value])=>({key,value:String(value)}));
}
