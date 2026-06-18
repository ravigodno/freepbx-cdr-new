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
        true,
        'SELECT grpnum, description, strategy, grptime, grplist, postdest, annmsg_id, ringing, recording FROM ringgroups WHERE grpnum = ? LIMIT 1',
        [groupId]
      );

      if (rgRows && rgRows.length > 0) {
        const rg: any = rgRows[0];
        const members = String(rg.grplist || '')
          .split('-')
          .map((x: string) => x.trim())
          .filter(Boolean);

        let users: any[] = [];
        if (members.length > 0) {
          const placeholders = members.map(() => '?').join(',');
          users = await queryFreePBXCDR(
            settings,
            true,
            `SELECT extension, name, outboundcid, ringtimer, noanswer_dest, busy_dest, chanunavail_dest FROM users WHERE extension IN (${placeholders}) ORDER BY extension ASC`,
            members
          );
        }

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
            members,
            postDestination: rg.postdest || '',
            announcementId: rg.annmsg_id || null,
            ringing: rg.ringing || '',
            recording: rg.recording || '',
          },
          members: users.map((u: any) => ({
            extension: u.extension,
            name: u.name || '',
            outboundcid: u.outboundcid || '',
            ringtimer: u.ringtimer || '',
            noanswerDest: u.noanswer_dest || '',
            busyDest: u.busy_dest || '',
            unavailableDest: u.chanunavail_dest || '',
          })),
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
