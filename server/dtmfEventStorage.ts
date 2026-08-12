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
