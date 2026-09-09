import type { PermissionGroup, PermissionRow, PermissionKey } from '../../../shared/accessCatalog';
export function filterPermissionGroups(groups:PermissionGroup[],query:string):PermissionGroup[] {
  const terms=query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  return groups.map(group=>({...group,rows:group.rows.filter(row=>{
    const text=[group.title,group.description,row.label,row.hint,row.key].join(' ').toLocaleLowerCase('ru');
    return terms.every(term=>text.includes(term));
  })})).filter(group=>group.rows.length>0);
}
export function groupPermissionState(rows:PermissionRow[],permissions:Partial<Record<PermissionKey,boolean>>,canEdit:(row:PermissionRow)=>boolean) {
  const editable=rows.filter(row=>row.bulk!==false && canEdit(row));
  const count=editable.filter(row=>permissions[row.key]===true).length;
  return {disabled:editable.length===0,checked:editable.length>0 && count===editable.length,mixed:count>0 && count<editable.length};
}
export function toggleGroupPermissions(rows:PermissionRow[],permissions:Partial<Record<PermissionKey,boolean>>,checked:boolean,canEdit:(row:PermissionRow)=>boolean) {
  const next={...permissions};
  for(const row of rows)if(row.bulk!==false && canEdit(row))next[row.key]=checked;
  return next;
}
