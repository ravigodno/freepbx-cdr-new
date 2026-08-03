const VALID_DIALPLAN_CONTEXT = /^[A-Za-z0-9_.-]+$/;

function safeContext(value: unknown): string {
  const context = String(value ?? '').trim();
  return VALID_DIALPLAN_CONTEXT.test(context) ? context : '';
}

export function resolveClickToCallContext(configuredContext: unknown, environmentContext: unknown = process.env.CLICK2CALL_CONTEXT): string {
  return safeContext(environmentContext) || safeContext(configuredContext) || 'from-internal';
}
