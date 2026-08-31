export type CdrSqlScope = {
  whereSql: string;
  params: unknown[];
  applied: boolean;
};

const exactNumberColumns = ['src', 'dst', 'did', 'cnum', 'outbound_cnum'];
const tokenNumberColumns = ['clid', 'channel', 'dstchannel', 'lastdata'];

export function buildCdrLogicalNumberScope(baseWhereSql: string, baseParams: unknown[], rawNumber: unknown): CdrSqlScope {
  const number = String(rawNumber || '').replace(/\D/g, '');
  if (!number) return { whereSql: baseWhereSql, params: [...baseParams], applied: false };

  const exactSql = exactNumberColumns.map(column => `${column} = ?`);
  const tokenSql = tokenNumberColumns.map(column => `${column} LIKE ?`);
  const numberSql = [...exactSql, ...tokenSql].join(' OR ');
  const numberParams = [
    ...exactNumberColumns.map(() => number),
    ...tokenNumberColumns.map(() => `%${number}%`)
  ];
  const logicalIdSql = "COALESCE(NULLIF(linkedid, ''), uniqueid)";

  return {
    whereSql: `${baseWhereSql} AND ${logicalIdSql} IN (`
      + `SELECT DISTINCT ${logicalIdSql} FROM cdr WHERE ${baseWhereSql} AND (${numberSql}))`,
    params: [...baseParams, ...baseParams, ...numberParams],
    applied: true
  };
}
