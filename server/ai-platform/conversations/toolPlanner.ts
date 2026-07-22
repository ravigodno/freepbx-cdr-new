import { redactAiPlatformValue } from '../core/redaction.js';
import { validateToolInput } from '../tools/toolInputValidator.js';
import type { ProviderToolCall,ProviderToolDefinition } from '../core/contracts.js';

export interface AvailableSandboxTool extends ProviderToolDefinition{id:number;executorKey:string}
export interface ToolDecision{decision:'respond'|'tool';toolKey:string|null;arguments:Record<string,unknown>;reasonCode:string}

export function composeToolPlannerPrompt(message:string,identity:{name:string;type:string},tools:AvailableSandboxTool[],priorResults:string[]=[]):string{
  const safe=redactAiPlatformValue({message,identity,tools:tools.map(({toolKey,description,inputSchema})=>({toolKey,description,inputSchema})),priorResults}).value as any;
  return ['You are a read-only tool decision planner. Return one strict JSON object and nothing else.',
    'Schema: {"decision":"respond|tool","toolKey":"string|null","arguments":{},"reasonCode":"short_code"}.',
    'Choose a tool only when current facts are required. Never invent arguments. Never choose write actions. Human transfer was handled before this step.',
    `Agent: ${safe.identity.name}; role: ${safe.identity.type}.`,`User message: ${safe.message}`,
    `Available read tools: ${JSON.stringify(safe.tools)}`,priorResults.length?`Already collected results: ${JSON.stringify(safe.priorResults)}`:'No prior tool results.'].join('\n');
}

export function validateStructuredDecision(raw:unknown,tools:AvailableSandboxTool[]):ToolDecision{
  const text=String(raw??'').trim();if(!text||text.length>8000||text.startsWith('```'))throw new Error('invalid_planner_output');
  let value:any;try{value=JSON.parse(text)}catch{throw new Error('invalid_planner_output')}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_planner_output');
  if(Object.keys(value).some(key=>!['decision','toolKey','arguments','reasonCode'].includes(key)))throw new Error('invalid_planner_output');
  if(!['respond','tool'].includes(value.decision)||typeof value.reasonCode!=='string'||value.reasonCode.length>64||!/^[a-z0-9_.-]*$/i.test(value.reasonCode))throw new Error('invalid_planner_output');
  if(value.decision==='respond'){if(value.toolKey!==null||!value.arguments||Object.keys(value.arguments).length)throw new Error('invalid_planner_output');return value}
  const tool=tools.find(item=>item.toolKey===value.toolKey);if(!tool)throw new Error('unknown_or_unassigned_tool');
  validateToolInput(tool.inputSchema,value.arguments);return value;
}

export function validateNativeCalls(calls:ProviderToolCall[]|undefined,tools:AvailableSandboxTool[]):ToolDecision[]{
  if(!Array.isArray(calls))return[];return calls.slice(0,2).map(call=>{const tool=tools.find(item=>item.toolKey===call.toolKey);if(!tool)throw new Error('unknown_or_unassigned_tool');validateToolInput(tool.inputSchema,call.arguments);return{decision:'tool' as const,toolKey:call.toolKey,arguments:call.arguments,reasonCode:'native_tool_call'}})
}
