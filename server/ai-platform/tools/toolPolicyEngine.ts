import { ToolExecutionError } from './toolErrors.js';

export function enforceToolPolicy(input: { risk:string;enabled:boolean;assigned:boolean;permissions:readonly string[] }): void {
  if (!input.assigned || !input.enabled) throw new ToolExecutionError('permission_denied', 403, 'Tool is not assigned or enabled');
  if (input.risk !== 'read') throw new ToolExecutionError('permission_denied', 403, 'Only read tools are allowed');
  if (!input.permissions.includes('execute_ai_read_tools')) throw new ToolExecutionError('permission_denied', 403, 'Tool permission denied');
}
