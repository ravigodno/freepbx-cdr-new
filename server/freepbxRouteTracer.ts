export type FreepbxRouteTraceStep = {
  type: string;
  title: string;
  label: string;
  number?: string;
  destination?: string;
  pattern?: string;
  error?: string;
  details?: any;
  members?: any[];
};

export type FreepbxRouteTraceResult = {
  did: string;
  direction: 'inbound' | 'outbound' | 'internal' | 'unknown';
  steps: FreepbxRouteTraceStep[];
};

export function extractExtFromChannel(channel: string): string {
  const match = String(channel || '').match(/\/(\d{2,6})-/);
  return match?.[1] || '';
}

export function detectCallDirection(first: any): 'inbound' | 'outbound' | 'internal' | 'unknown' {
  const dcontext = String(first?.dcontext || '');
  const src = String(first?.src || '');
  const dst = String(first?.dst || '');

  if (
    dcontext.includes('from-trunk') ||
    dcontext.includes('from-pstn') ||
    dcontext.includes('from-digital') ||
    dcontext.includes('from-outside') ||
    first?.did
  ) {
    return 'inbound';
  }

  if (dcontext === 'from-internal' && /^\d{2,6}$/.test(extractExtFromChannel(first?.channel || ''))) {
    return 'outbound';
  }

  if (/^\d{2,6}$/.test(src) && /^\d{2,6}$/.test(dst)) {
    return 'internal';
  }

  return 'unknown';
}

export function getRealCallerExtFromCall(first: any): string {
  return String(
    extractExtFromChannel(first?.channel || '') ||
    first?.cnum ||
    first?.src ||
    ''
  );
}

export function isOutboundCall(first: any): boolean {
  return String(first?.dcontext || '') === 'from-internal' && Boolean(first?.dst);
}

export function extractRingGroupIdsFromLegs(legs: any[]): string[] {
  return Array.from(new Set(
    legs
      .filter((l: any) => l.dcontext === 'ext-group' && l.dst)
      .map((l: any) => String(l.dst))
  ));
}

export async function analyzeRingGroups({
  settings,
  legs,
  queryFreePBXCDR,
}: {
  settings: any;
  legs: any[];
  queryFreePBXCDR: (settings: any, useFreepbxDb: boolean, sql: string, params?: any[]) => Promise<any[]>;
}): Promise<FreepbxRouteTraceStep[]> {
  const steps: FreepbxRouteTraceStep[] = [];
  const ringGroupIds = extractRingGroupIdsFromLegs(legs);

  for (const groupId of ringGroupIds) {
    try {
      const rgRows = await queryFreePBXCDR(
        settings,
        false,
        'SELECT grpnum, description, strategy, grptime, grplist, postdest, annmsg_id, ringing, recording FROM asterisk.ringgroups WHERE grpnum = ? LIMIT 1',
        [groupId]
      );

      if (rgRows && rgRows.length > 0) {
        const rg: any = rgRows[0];
        const cdrMembers = legs
          .filter((l: any) => String(l.dcontext || '') === 'ext-group' && String(l.dst || '') === String(groupId))
          .flatMap((l: any) => extractDialedExtsFromLastdata(l.lastdata || ''));

        const members = Array.from(new Set([
          ...String(rg.grplist || '')
            .split('-')
            .map((x: string) => x.trim())
            .filter(Boolean),
          ...cdrMembers,
        ]));

        let users: any[] = [];
        if (members.length > 0) {
          const placeholders = members.map(() => '?').join(',');
          users = await queryFreePBXCDR(
            settings,
            false,
            `SELECT extension, name, outboundcid, ringtimer, noanswer_dest, busy_dest, chanunavail_dest FROM asterisk.users WHERE extension IN (${placeholders}) ORDER BY extension ASC`,
            members
          );
        }

        const normalizedMembers = Array.isArray(members)
          ? members
          : String(members || '')
              .split(/[-,&\s]+/)
              .map((x: string) => x.trim())
              .filter(Boolean);

        steps.push({
          type: 'ring_group',
          title: rg.description || `Группа обзвона ${groupId}`,
          label: 'Ring Group',
          number: groupId,
          destination: rg.postdest || '',
          details: {
            grpnum: rg.grpnum,
            description: rg.description || '',
            strategy: rg.strategy || '',
            ringTime: rg.grptime || '',
            members: normalizedMembers,
            postDestination: rg.postdest || '',
            announcementId: rg.annmsg_id || null,
            ringing: rg.ringing || '',
            recording: rg.recording || '',
          },
          members: normalizedMembers.map((ext: string) => {
            const u = Array.isArray(users)
              ? users.find((row: any) => String(row.extension) === String(ext))
              : null;

            return {
              extension: ext,
              name: u?.name || '',
              outboundcid: u?.outboundcid || '',
              ringtimer: u?.ringtimer || '',
              noanswerDest: u?.noanswer_dest || '',
              busyDest: u?.busy_dest || '',
              unavailableDest: u?.chanunavail_dest || '',
            };
          }),
        });
      }
    } catch (e: any) {
      steps.push({
        type: 'ring_group_error',
        title: `Ошибка чтения группы ${groupId}`,
        label: 'Ring Group',
        number: groupId,
        error: e.message,
      });
    }
  }

  return steps;
}

export function getAnsweredExtFromLegs(legs: any[]): string {
  const answered = legs.find((l: any) =>
    String(l.disposition || '').toUpperCase() === 'ANSWERED' &&
    Number(l.billsec || 0) > 0
  );

  if (!answered) return '';

  const dstChannelExt = extractExtFromChannel(answered.dstchannel || '');
  if (dstChannelExt) return dstChannelExt;

  const channelExt = extractExtFromChannel(answered.channel || '');
  if (channelExt) return channelExt;

  const dst = String(answered.dst || '');
  if (/^\d{2,6}$/.test(dst)) return dst;

  return '';
}

export function extractDialedExtsFromLastdata(lastdata: string): string[] {
  const firstPart = String(lastdata || '').split(',')[0] || '';
  return Array.from(new Set(
    firstPart
      .split('&')
      .map((part) => {
        const m = part.match(/\/(\d{2,6})(?:-|$)/);
        return m?.[1] || '';
      })
      .filter(Boolean)
  ));
}

function escapeFreepbxPatternChar(ch: string): string {
  return '\\^$.*+?()[]{}|'.includes(ch) ? '\\' + ch : ch;
}

function freepbxDialPatternMatches(number: string, prefix: string, pattern: string): boolean {
  const n = String(number || '').trim();
  const pref = String(prefix || '').trim();
  const pat = String(pattern || '').trim() || '.';

  if (pref && !n.startsWith(pref)) return false;

  const rest = pref ? n.slice(pref.length) : n;
  let rx = '';

  for (const ch of pat) {
    if (ch === 'X') rx += '\\d';
    else if (ch === 'Z') rx += '[1-9]';
    else if (ch === 'N') rx += '[2-9]';
    else if (ch === '.') rx += '\\d+';
    else if (ch === '!') rx += '\\d*';
    else rx += escapeFreepbxPatternChar(ch);
  }

  return new RegExp('^' + rx + '$').test(rest);
}

export async function analyzeOutboundRoute({
  settings,
  dialedNumber,
  queryFreePBXCDR,
}: {
  settings: any;
  dialedNumber: string;
  queryFreePBXCDR: (settings: any, useFreepbxDb: boolean, sql: string, params?: any[]) => Promise<any[]>;
}): Promise<FreepbxRouteTraceStep[]> {
  const rows = await queryFreePBXCDR(
    settings,
    false,
    `SELECT
      r.route_id,
      r.name AS route_name,
      p.match_pattern_prefix,
      p.match_pattern_pass,
      p.prepend_digits,
      rt.trunk_id,
      rt.seq,
      t.name AS trunk_name,
      t.tech AS trunk_tech,
      t.channelid AS trunk_channelid,
      t.outcid AS trunk_outcid,
      t.disabled AS trunk_disabled
    FROM asterisk.outbound_routes r
    LEFT JOIN asterisk.outbound_route_patterns p ON p.route_id = r.route_id
    LEFT JOIN asterisk.outbound_route_trunks rt ON rt.route_id = r.route_id
    LEFT JOIN asterisk.trunks t ON t.trunkid = rt.trunk_id
    ORDER BY r.route_id ASC, rt.seq ASC`,
    []
  );

  console.log('OUTBOUND_ROUTE_ROWS');
  console.log(JSON.stringify(rows.slice(0, 10), null, 2));
  console.log('DIALED_NUMBER', dialedNumber);

  const matched = rows.find((r: any) =>
    freepbxDialPatternMatches(
      dialedNumber,
      r.match_pattern_prefix || '',
      r.match_pattern_pass || ''
    )
  ) || rows[0];

  console.log('OUTBOUND ROUTES DEBUG');
  console.log(JSON.stringify(rows.slice(0, 10), null, 2));
  console.log('MATCHED ROUTE');
  console.log(JSON.stringify(matched, null, 2));

  if (!matched) {
    return [{
      type: 'outbound_route_not_found',
      title: 'Исходящее правило не найдено',
      label: 'Outbound Route',
      destination: dialedNumber,
      details: { dialedNumber },
    }];
  }

  const routeRows = rows.filter((r: any) => r.route_id === matched.route_id);

  return [{
    type: 'outbound_route',
    title: `Исходящее правило: ${matched.route_name || matched.route_id}`,
    label: 'Outbound Route',
    number: String(matched.route_id),
    destination: dialedNumber,
    pattern: `${matched.match_pattern_prefix || ''}${matched.match_pattern_pass || ''}`,
    details: {
      routeId: matched.route_id,
      routeName: matched.route_name || '',
      patternPrefix: matched.match_pattern_prefix || '',
      patternPass: matched.match_pattern_pass || '',
      prependDigits: matched.prepend_digits || '',
      trunks: routeRows
        .filter((r: any) => r.trunk_id !== null && r.trunk_id !== undefined)
        .map((r: any) => ({
          seq: r.seq,
          trunkId: r.trunk_id,
          name: r.trunk_name || '',
          tech: r.trunk_tech || '',
          channelid: r.trunk_channelid || '',
          outcid: r.trunk_outcid || '',
          disabled: r.trunk_disabled || '',
        })),
    },
  }];
}
