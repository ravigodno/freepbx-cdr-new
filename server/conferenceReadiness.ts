export const CONFERENCE_CONTEXTS = ['pbxpuls-conference', 'pbxpuls-conference-initiator', 'pbxpuls-conference-participant'] as const;

export function hasLoadedConferenceContext(context: string, result: { success: boolean; message: string }): boolean {
  const output = result.message.replace(/\x1b\[[0-9;]*m/g, '');
  return result.success && output.includes(`Context '${context}'`)
    && /['_]X!/.test(output) && /\bConfBridge\(/.test(output);
}
