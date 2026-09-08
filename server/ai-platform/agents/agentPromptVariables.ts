export interface AgentPromptVariable { key:string;value:string;description?:string }

const VARIABLE_KEY=/^[a-z][a-z0-9_]{1,63}$/;
const PLACEHOLDER=/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

export function normalizeAgentPromptVariables(value:unknown):AgentPromptVariable[]{
  if(!Array.isArray(value))return[];
  const seen=new Set<string>(),result:AgentPromptVariable[]=[];
  for(const item of value){
    const key=String(item?.key||'').trim().toLowerCase(),text=String(item?.value??'').trim();
    if(!VARIABLE_KEY.test(key)||seen.has(key)||!text||text.length>1000)continue;
    seen.add(key);result.push({key,value:text,description:String(item?.description||'').trim().slice(0,191)});
    if(result.length>=50)break;
  }
  return result;
}

export function validateAgentPromptVariables(prompt:unknown,value:unknown):string[]{
  const source=Array.isArray(value)?value:[],errors:string[]=[],keys=new Set<string>();
  for(const item of source){
    const key=String(item?.key||'').trim().toLowerCase(),text=String(item?.value??'').trim();
    if(!VARIABLE_KEY.test(key))errors.push('variable_key_invalid');
    if(keys.has(key))errors.push('variable_key_duplicate');
    if(!text||text.length>1000)errors.push('variable_value_invalid');
    keys.add(key);
  }
  const referenced=[...String(prompt||'').matchAll(PLACEHOLDER)].map(match=>String(match[1]).toLowerCase());
  if(referenced.some(key=>!keys.has(key)))errors.push('variable_unresolved');
  return [...new Set(errors)];
}

export function renderAgentPromptVariables(prompt:unknown,value:unknown):string{
  const variables=new Map(normalizeAgentPromptVariables(value).map(item=>[item.key,item.value]));
  return String(prompt||'').replace(PLACEHOLDER,(original,key)=>variables.get(String(key).toLowerCase())??original);
}
