import { redactAiPlatformValue } from '../core/redaction.js';

const MAX_ITEMS=10,MAX_CHARS=6000;
function compact(value:any,state:{truncated:boolean}):any{
  if(Array.isArray(value)){if(value.length>MAX_ITEMS)state.truncated=true;return value.slice(0,MAX_ITEMS).map(item=>compact(item,state))}
  if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const[key,item]of Object.entries(value))out[key]=compact(item,state);return out}
  if(typeof value==='string'&&value.length>500){state.truncated=true;return value.slice(0,500)}return value;
}
export function projectToolResult(toolKey:string,data:unknown,ok=true,errorCode:string|null=null){
  const state={truncated:false};let safe=compact(redactAiPlatformValue(data).value,state),serialized=JSON.stringify(safe);
  if(serialized.length>MAX_CHARS){state.truncated=true;safe={summary:'Tool result exceeded context budget'}}
  const count=Array.isArray((safe as any)?.items)?(safe as any).items.length:null;
  return{toolKey,ok,summary:ok?(count===null?'Read-only data received':`${count} result items`):'Read-only tool unavailable',data:safe,errorCode,metadata:{truncated:state.truncated,itemLimit:MAX_ITEMS}};
}
