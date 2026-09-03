import crypto from 'crypto';
import { queryPBXPulsDb } from './pbxpulsDb.js';

export type DtmfEventRecord = {
  ts: string;
  linkedid: string;
  uniqueid: string;
  channel: string;
  digit: string;
  direction: string;
  event: string;
};

export type OutboundDtmfSequence = {
  digits: string;
  startedAt: string;
  endedAt: string;
  offsetSeconds: number;
};

function eventKey(event: DtmfEventRecord): string {
  return crypto.createHash('sha256').update([
    event.ts, event.linkedid, event.uniqueid, event.channel,
    event.digit, event.direction, event.event
  ].join('|')).digest('hex');
}

export async function recordDtmfEventSql(event: DtmfEventRecord): Promise<void> {
  await queryPBXPulsDb(
    `INSERT IGNORE INTO dtmf_events
      (source_event_key,event_time,linkedid,uniqueid,channel,digit,direction,event_name)
     VALUES (?,?,?,?,?,?,?,?)`,
    [eventKey(event), new Date(event.ts), event.linkedid, event.uniqueid, event.channel,
      event.digit, event.direction, event.event]
  );
}

export async function findLatestDtmfEndByLinkedId(linkedid: string): Promise<DtmfEventRecord | null> {
  const normalizedLinkedid = String(linkedid || '').trim();
  if (!normalizedLinkedid) return null;
  const rows = await queryPBXPulsDb(
    `SELECT event_time AS ts,linkedid,uniqueid,channel,digit,direction,event_name AS event
     FROM dtmf_events
     WHERE linkedid=? AND event_name='DTMFEnd'
     ORDER BY event_time DESC,id DESC LIMIT 1`,
    [normalizedLinkedid]
  );
  const row: any = rows[0];
  if (!row) return null;
  return {
    ts: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts || ''),
    linkedid: String(row.linkedid || ''), uniqueid: String(row.uniqueid || ''),
    channel: String(row.channel || ''), digit: String(row.digit || ''),
    direction: String(row.direction || ''), event: String(row.event || '')
  };
}

export async function findDtmfEndEventsByLinkedId(linkedid: string): Promise<DtmfEventRecord[]> {
  const normalizedLinkedid = String(linkedid || '').trim();
  if (!normalizedLinkedid) return [];
  const rows = await queryPBXPulsDb(
    `SELECT event_time AS ts,linkedid,uniqueid,channel,digit,direction,event_name AS event
     FROM dtmf_events
     WHERE linkedid=? AND event_name='DTMFEnd'
     ORDER BY event_time ASC,id ASC`,
    [normalizedLinkedid]
  );
  return rows.map((row: any) => ({
    ts: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts || ''),
    linkedid: String(row.linkedid || ''), uniqueid: String(row.uniqueid || ''),
    channel: String(row.channel || ''), digit: String(row.digit || ''),
    direction: String(row.direction || ''), event: String(row.event || '')
  }));
}

export function buildOutboundDtmfSequences(
  events: DtmfEventRecord[],
  employeeExtension: string,
  answeredAt: Date,
  endedAt: Date,
  maxGapMs = 3000
): OutboundDtmfSequence[] {
  const extension = String(employeeExtension || '').replace(/\D/g, '');
  const answeredMs = answeredAt.getTime();
  const endedMs = endedAt.getTime();
  if (!extension || !Number.isFinite(answeredMs) || !Number.isFinite(endedMs) || endedMs < answeredMs) return [];

  const internalChannel = new RegExp(`^(?:PJSIP|SIP)/${extension}(?:-|$)`, 'i');
  const filtered = events.filter(event => {
    const time = Date.parse(event.ts);
    const direction = String(event.direction || '').toLowerCase();
    return Number.isFinite(time)
      && time >= answeredMs
      && time <= endedMs + 2000
      && internalChannel.test(String(event.channel || ''))
      && (!direction || direction === 'received')
      && /^[0-9A-D*#]$/i.test(String(event.digit || ''));
  });

  const sequences: OutboundDtmfSequence[] = [];
  for (const event of filtered) {
    const eventMs = Date.parse(event.ts);
    const previous = sequences[sequences.length - 1];
    if (previous && eventMs - Date.parse(previous.endedAt) <= maxGapMs) {
      previous.digits += event.digit.toUpperCase();
      previous.endedAt = new Date(eventMs).toISOString();
      continue;
    }
    sequences.push({
      digits: event.digit.toUpperCase(),
      startedAt: new Date(eventMs).toISOString(),
      endedAt: new Date(eventMs).toISOString(),
      offsetSeconds: Math.max(0, Math.round((eventMs - answeredMs) / 1000))
    });
  }
  return sequences;
}
