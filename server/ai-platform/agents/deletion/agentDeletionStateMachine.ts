export type AgentDeletionState='active'|'disabling'|'disabled'|'archiving'|'archived'|'delete_preview_ready'|'deleting'|'removing_freepbx_objects'|'reloading'|'verifying'|'deleted'|'delete_failed';
const transitions:Record<AgentDeletionState,ReadonlySet<AgentDeletionState>>={
 active:new Set(['disabling','archiving']),disabling:new Set(['disabled','delete_failed']),disabled:new Set(['archiving','delete_preview_ready']),
 archiving:new Set(['archived','delete_failed']),archived:new Set(['disabled','delete_preview_ready']),delete_preview_ready:new Set(['deleting']),
 deleting:new Set(['removing_freepbx_objects','delete_failed']),removing_freepbx_objects:new Set(['reloading','delete_failed']),
 reloading:new Set(['verifying','delete_failed']),verifying:new Set(['deleted','delete_failed']),deleted:new Set(),delete_failed:new Set(['delete_preview_ready','deleting']),
};
export function assertAgentDeletionTransition(from:AgentDeletionState,to:AgentDeletionState){if(!transitions[from]?.has(to))throw new Error(`invalid_agent_deletion_transition:${from}:${to}`)}
