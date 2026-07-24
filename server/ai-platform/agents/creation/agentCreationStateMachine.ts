import type{AgentCreationState}from'./agentCreationTypes.js';
const transitions:Record<AgentCreationState,ReadonlySet<AgentCreationState>>={
 draft:new Set(['validating']),validating:new Set(['draft','preview_ready','creation_failed']),
 preview_ready:new Set(['draft','applying']),applying:new Set(['publishing','creating_extension','creation_failed']),
 publishing:new Set(['creating_extension','creation_failed']),creating_extension:new Set(['reloading','creation_failed']),
 reloading:new Set(['verifying','active','creation_failed']),verifying:new Set(['active','creation_failed']),
 active:new Set(),creation_failed:new Set(['validating','preview_ready','applying']),
};
export function assertAgentCreationTransition(from:AgentCreationState,to:AgentCreationState){if(!transitions[from]?.has(to))throw new Error(`invalid_agent_creation_transition:${from}:${to}`)}
export function isAgentCreationTerminal(state:AgentCreationState){return state==='active'}
