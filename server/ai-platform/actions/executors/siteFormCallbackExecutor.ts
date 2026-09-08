import type { ActionExecutor, ActionExecutorContext, CallbackActionInput } from '../actionTypes.js';
import { AiCallbackLeadService } from '../../../siteForms/aiCallbackLeadService.js';

// Keep consent, policy, audit and encryption in the existing action pipeline.
// A failed registry write must never produce a successful spoken confirmation.
export class SiteFormCallbackExecutor implements ActionExecutor {
  constructor(private readonly callback: ActionExecutor, private readonly leads = new AiCallbackLeadService()) {}
  async execute(context: ActionExecutorContext, input: CallbackActionInput) {
    if (context.sourceChannel === 'voice' && context.tenantId !== 1)
      throw new Error('AI leads require installation tenant mapping');
    const result = await this.callback.execute(context, input);
    if (context.sourceChannel === 'voice') await this.leads.sync(context.tenantId, result.callbackRequestId, context.signal);
    return result;
  }
}
