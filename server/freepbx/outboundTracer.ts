import type {
  FreepbxRouteTraceStep,
  QueryFreePBXCDR,
} from './types';

function escapeFreepbxPatternChar(ch: string): string {
  return '\\^$.*+?()[]{}|'.includes(ch) ? '\\' + ch : ch;
}

export function freepbxDialPatternMatches(
  number: string,
  prefix: string,
  pattern: string
): boolean {
  const n = String(number || '').trim();
  const pref = String(prefix || '').trim();
  const pat = String(pattern || '').trim() || '.';

  if (pref && !n.startsWith(pref)) return false;

  const rest = pref ? n.slice(pref.length) : n;
  let rx = '';

  for (let index = 0; index < pat.length; index += 1) {
    const ch = pat[index];
    if (ch === 'X') rx += '\\d';
    else if (ch === 'Z') rx += '[1-9]';
    else if (ch === 'N') rx += '[2-9]';
    else if (ch === '.') rx += '\\d+';
    else if (ch === '!') rx += '\\d*';
    else if (ch === '[') {
      const closingIndex = pat.indexOf(']', index + 1);
      const content = closingIndex > index ? pat.slice(index + 1, closingIndex) : '';
      if (content && /^[0-9-]+$/.test(content)) {
        rx += `[${content}]`;
        index = closingIndex;
      } else {
        rx += '\\[';
      }
    }
    else rx += escapeFreepbxPatternChar(ch);
  }

  return new RegExp('^' + rx + '$').test(rest);
}

export function extractOutboundTrunkChannelId(legs: any[]): string {
  const rows = Array.isArray(legs) ? legs : [];
  for (const row of rows) {
    const dstChannel = String(row?.dstchannel || row?.DstChannel || '').trim();
    const channelMatch = dstChannel.match(/^(?:SIP|PJSIP)\/(.+?)-[0-9a-f]+$/i);
    if (channelMatch?.[1]) return channelMatch[1];

    const dialData = String(row?.lastdata || row?.ApplicationData || '').trim();
    const endpointMatch = dialData.match(/^(?:SIP|PJSIP)\/[^,@/]+@([^,/)]+)/i)
      || dialData.match(/^(?:SIP|PJSIP)\/([^,/)]+)\//i);
    if (endpointMatch?.[1]) return endpointMatch[1];
  }
  return '';
}

export async function analyzeOutboundRoute({
  settings,
  dialedNumber,
  actualTrunkChannelId = '',
  queryFreePBXCDR,
}: {
  settings: any;
  dialedNumber: string;
  actualTrunkChannelId?: string;
  queryFreePBXCDR: QueryFreePBXCDR;
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

  const matchingRows = rows.filter((r: any) =>
    freepbxDialPatternMatches(
      dialedNumber,
      r.match_pattern_prefix || '',
      r.match_pattern_pass || ''
    )
  );
  const normalizedActualTrunk = String(actualTrunkChannelId || '').trim().toLowerCase();
  const actualTrunkRows = normalizedActualTrunk
    ? rows.filter((row: any) => String(row.trunk_channelid || '').trim().toLowerCase() === normalizedActualTrunk)
    : [];
  const matched = matchingRows.find((row: any) => actualTrunkRows.some((actual: any) => actual.route_id === row.route_id))
    || matchingRows[0]
    || actualTrunkRows[0]
    || rows[0];

  if (!matched) {
    return [{
      type: 'outbound_route_not_found',
      title: 'Исходящее правило не найдено',
      label: 'Outbound Route',
      destination: dialedNumber,
      details: { dialedNumber },
    }];
  }

  const routeRows = rows.filter(
    (r: any) => r.route_id === matched.route_id
  ).sort((left: any, right: any) => {
    const leftActual = String(left.trunk_channelid || '').trim().toLowerCase() === normalizedActualTrunk ? 0 : 1;
    const rightActual = String(right.trunk_channelid || '').trim().toLowerCase() === normalizedActualTrunk ? 0 : 1;
    return leftActual - rightActual || Number(left.seq || 0) - Number(right.seq || 0);
  });

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
      actualTrunkChannelId,
      trunks: routeRows
        .filter((r: any) =>
          r.trunk_id !== null &&
          r.trunk_id !== undefined
        )
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
