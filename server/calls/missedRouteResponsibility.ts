import { announcementId, normalizeAutomatedAnswer } from '../../shared/automatedCallDestination.js';
import { resolveCallAnswerEvidence } from '../../shared/callAnswerEvidence.js';
import { resolveTimeRoute } from './freepbxTimeRoute.js';

type Query = (sql: string, params: any[]) => Promise<any[]>;
type Person = { extension: string; name: string };

/** Responsibility from current routing is deliberately separate from observed ringing. */
export async function enrichMissedRouteResponsibility(calls: any[], query: Query): Promise<void> {
  const cache = new Map<string, Promise<any[]>>();
  const read: Query = (sql, params) => {
    const key = JSON.stringify([sql, params]);
    if (!cache.has(key)) cache.set(key, query(sql, params).catch(() => []));
    return cache.get(key)!;
  };
  async function resolve(destination: string, visited = new Set<string>()): Promise<string[]> {
    const parts = destination.split(',');
    const context = parts[0].toLowerCase();
    const id = parts[1] || '';
    if (visited.has(destination) || visited.size >= 12) return [];
    visited = new Set([...visited, destination]);
    if (['from-did-direct', 'ext-local', 'ext-findmefollow'].includes(context)) return /^\d{2,6}$/.test(id) ? [id] : [];
    if (context === 'app-announcement') {
      const row = (await read('SELECT post_dest,return_ivr FROM asterisk.announcement WHERE announcement_id=? LIMIT 1', [id]))[0];
      return row && !Number(row.return_ivr) ? resolve(String(row.post_dest || ''), visited) : [];
    }
    if (context === 'ext-group') {
      const row = (await read('SELECT grplist FROM asterisk.ringgroups WHERE grpnum=? LIMIT 1', [id]))[0];
      return String(row?.grplist || '').split('-').map(v => v.replace(/#$/, '')).filter(v => /^\d{2,6}$/.test(v));
    }
    if (context === 'ext-queues') {
      const rows = await read("SELECT data FROM asterisk.queues_details WHERE id=? AND keyword='member'", [id]);
      return rows.map(row => String(row.data || '').match(/^(?:SIP|PJSIP|Local)\/(\d{2,6})(?:[@,\/]|$)/i)?.[1] || '').filter(Boolean);
    }
    const ivr = context.match(/^ivr-(\d+)$/)?.[1];
    if (ivr) {
      if (/^\d+$/.test(id)) {
        const row = (await read('SELECT dest FROM asterisk.ivr_entries WHERE ivr_id=? AND selection=? LIMIT 1', [ivr, id]))[0];
        return row ? resolve(String(row.dest || ''), visited) : [];
      }
      const row = (await read('SELECT timeout_destination,timeout_ivr_ret FROM asterisk.ivr_details WHERE id=? LIMIT 1', [ivr]))[0];
      return row && !Number(row.timeout_ivr_ret) ? resolve(String(row.timeout_destination || ''), visited) : [];
    }
    // Time conditions, unselected IVR branches and unknown destinations are not guesses.
    return [];
  }
  const groups = new Map<string, any[]>();
  calls.forEach((call, index) => {
    const key = String(call.linkedid || call.uniqueid || `row-${index}`);
    groups.set(key, [...(groups.get(key) || []), call]);
  });
  for (const rows of groups.values()) {
    const timeRoute = await resolveTimeRoute(rows, read, resolve);
    if (timeRoute) for (const row of rows) {
      row.callbackWorkingSchedule = timeRoute.schedule;
      row.callbackScheduleUnknown = timeRoute.unknown === true;
    }
    if (resolveCallAnswerEvidence(rows).answeredExt || rows.some(row => row.answeredExts?.length || row.missedExts?.length || row.logicalCall || row.phoneMeeting)) continue;
    if (rows.some(row => String(row.dstchannel || '').trim())) continue;
    const terminal = [...rows].sort((a, b) => String(a.calldate || '').localeCompare(String(b.calldate || ''))).reverse()
      .find(row => announcementId(row.dcontext) || /^ivr-\d+$/i.test(String(row.dcontext || '')));
    if (!terminal || !['NO ANSWER', 'BUSY', 'FAILED'].includes(String(normalizeAutomatedAnswer(terminal).disposition).toUpperCase())) continue;
    if (![terminal.src, terminal.cnum, terminal.externalCallerNumber].some(value => String(value || '').replace(/\D/g, '').length >= 7)) continue;
    const id = announcementId(terminal.dcontext);
    const destination = id ? `app-announcement,${id},1` : `${terminal.dcontext},${/^\d+$/.test(String(terminal.dst)) ? terminal.dst : 's'},1`;
    const extensions = [...new Set(timeRoute ? timeRoute.extensions : await resolve(destination))].slice(0, 100);
    if (!extensions.length) continue;
    const users = await read(`SELECT extension,name FROM asterisk.users WHERE extension IN (${extensions.map(() => '?').join(',')})`, extensions);
    const people: Person[] = users.map(row => ({ extension: String(row.extension), name: String(row.name || '') }));
    if (!people.length) continue;
    for (const row of rows) {
      row.routeResponsibleExts = people.map(person => person.extension);
      row.routeResponsiblePeople = people;
      row.routeResponsibilitySource = 'current_route';
      row.routeResponsibilityDestination = destination;
    }
  }
}
