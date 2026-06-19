import type {
  FreepbxRouteTraceStep,
  QueryFreePBXCDR,
} from './types';

function extractRingGroupIdsFromLegs(legs: any[]): string[] {
  return Array.from(new Set(
    legs
      .filter((l: any) => String(l.dcontext || '') === 'ext-group' && l.dst)
      .map((l: any) => String(l.dst))
      .filter(Boolean)
  ));
}

export async function analyzeRingGroups({
  settings,
  legs,
  queryFreePBXCDR,
}: {
  settings: any;
  legs: any[];
  queryFreePBXCDR: QueryFreePBXCDR;
}): Promise<FreepbxRouteTraceStep[]> {

  const steps: FreepbxRouteTraceStep[] = [];

  const ringGroupIds =
    extractRingGroupIdsFromLegs(legs);

  for (const groupId of ringGroupIds) {
    try {

      const rgRows = await queryFreePBXCDR(
        settings,
        false,
        `SELECT
           grpnum,
           description,
           strategy,
           grptime,
           grplist,
           postdest,
           annmsg_id,
           ringing,
           recording
         FROM asterisk.ringgroups
         WHERE grpnum=?
         LIMIT 1`,
        [groupId]
      );

      if (!rgRows?.length) {
        continue;
      }

      const rg: any = rgRows[0];

      const members = String(
        rg.grplist || ''
      )
        .split('-')
        .map((x: string) => x.trim())
        .filter(Boolean);

      let users: any[] = [];

      if (members.length > 0) {

        const placeholders =
          members.map(() => '?').join(',');

        users = await queryFreePBXCDR(
          settings,
          false,
          `SELECT
             extension,
             name,
             outboundcid,
             ringtimer,
             noanswer_dest,
             busy_dest,
             chanunavail_dest
           FROM asterisk.users
           WHERE extension IN (${placeholders})
           ORDER BY extension ASC`,
          members
        );
      }

      steps.push({
        type: 'ring_group',
        title:
          rg.description ||
          `Группа обзвона ${groupId}`,
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

        members:
          users.length > 0
            ? users.map((u: any) => ({
                extension: u.extension,
                name: u.name || '',
                outboundcid: u.outboundcid || '',
                ringtimer: u.ringtimer || '',
                noanswerDest: u.noanswer_dest || '',
                busyDest: u.busy_dest || '',
                unavailableDest:
                  u.chanunavail_dest || '',
              }))
            : members.map((ext: string) => ({
                extension: ext,
                name: '',
              })),
      });

    } catch (e: any) {

      steps.push({
        type: 'ring_group_error',
        title:
          `Ошибка чтения группы ${groupId}`,
        label: 'Ring Group',
        number: groupId,
        error: e.message,
      });

    }
  }

  return steps;
}
