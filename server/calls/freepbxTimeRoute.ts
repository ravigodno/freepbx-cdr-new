import type { WorkingRule, WorkingSchedule } from './freepbxWorkingSchedule.js';
type Query = (sql: string, params: any[]) => Promise<any[]>;
type Path = { extensions: string[]; rules: WorkingRule[] };

/** REST on older FreePBX exposes TC state, but not Time Group expressions.
 * Read verified configuration tables through the existing readonly CDR provider.
 * Configuration is reread per request: editing FreePBX needs no Pulse restart.
 */
export async function resolveTimeRoute(rows: any[], read: Query, resolvePeople: (dest: string) => Promise<string[]>): Promise<{
  extensions: string[]; schedule?: WorkingSchedule; unknown?: boolean;
} | null> {
  const dids = [...new Set(rows.map(row => String(row.inboundDid || row.did || '').split('→')[0].trim()).filter(Boolean))];
  if (dids.length !== 1) return null;
  const candidates = await read('SELECT extension,cidnum,destination FROM asterisk.incoming WHERE extension=?', [dids[0]]);
  const caller = String(rows[0]?.cnum || rows[0]?.src || '');
  const exact = candidates.filter(row => String(row.cidnum || '') === caller);
  const routes = exact.length ? exact : candidates.filter(row => !row.cidnum);
  if (routes.length !== 1) return null;
  let foundCondition = false;
  let unknown = false;
  async function walk(destination: string, rules: WorkingRule[], visited: Set<string>): Promise<Path[]> {
    if (visited.has(destination) || visited.size >= 16) { unknown = true; return []; }
    visited = new Set([...visited, destination]);
    const [context, id] = destination.split(',');
    if (context === 'timeconditions') {
      foundCondition = true;
      const tc = (await read('SELECT timeconditions_id,time,truegoto,falsegoto,timezone,mode FROM asterisk.timeconditions WHERE timeconditions_id=? LIMIT 1', [id]))[0];
      if (!tc || (tc.mode && tc.mode !== 'time-group')) { unknown = true; return []; }
      const times = (await read('SELECT time FROM asterisk.timegroups_details WHERE timegroupid=?', [tc.time])).map(row => String(row.time));
      if (!times.length) { unknown = true; return []; }
      const timezone = !tc.timezone || tc.timezone === 'default' ? Intl.DateTimeFormat().resolvedOptions().timeZone : String(tc.timezone);
      const yes = await walk(String(tc.truegoto || ''), [...rules, { times, timezone, match: true, conditionId: id }], visited);
      const no = await walk(String(tc.falsegoto || ''), [...rules, { times, timezone, match: false, conditionId: id }], visited);
      return [...yes, ...no];
    }
    const announcement = context.match(/^app-announcement-(\d+)$/)?.[1] || (context === 'app-announcement' ? id : '');
    if (announcement) {
      const row = (await read('SELECT post_dest,return_ivr FROM asterisk.announcement WHERE announcement_id=? LIMIT 1', [announcement]))[0];
      if (!row || Number(row.return_ivr)) { unknown = true; return []; }
      return walk(String(row.post_dest || ''), rules, visited);
    }
    if (context === 'app-blackhole') return [];
    // Unselected IVR branches cannot identify a responsible department.
    if (/^ivr-/.test(context)) { unknown = true; return []; }
    const extensions = [...new Set(await resolvePeople(destination))].sort();
    if (!extensions.length) { unknown = true; return []; }
    return [{ extensions, rules }];
  }
  const paths = await walk(String(routes[0].destination || ''), [], new Set());
  if (!foundCondition) return null;
  const owners = new Set(paths.map(path => path.extensions.join(',')));
  if (unknown || owners.size !== 1) return { extensions: [], unknown: true };
  return { extensions: paths[0].extensions, schedule: paths.map(path => path.rules) };
}
