import { runAsteriskCliCommand } from '../asteriskCli.js';
let cached: Promise<Set<string> | null> | undefined;
let expires = 0;
export function parseTimeConditionOverrides(output: string): Set<string> {
  const ids = new Set<string>();
  for (const line of output.split('\n')) {
    const match = line.match(/^\/TC\/(\d+)\s*:\s*(\S+)/);
    if (match) ids.add(match[1]);
  }
  return ids;
}
/** A current override cannot reconstruct historical opening intervals. Suspend
 * automatic SLA penalties on affected lines instead of treating it as a timetable. */
export async function readTimeConditionOverrides(): Promise<Set<string> | null> {
  if (!cached || Date.now() >= expires) {
    expires = Date.now() + 15000;
    cached = runAsteriskCliCommand('database show TC', 3000).then(result =>
      result.success && /results? found/.test(result.message) ? parseTimeConditionOverrides(result.message) : null);
  }
  return cached;
}
