import crypto from 'crypto';
import type { Connection } from 'mysql2/promise';
import { buildDirectorySeedRows, seedLegacyDirectory } from './pbxpulsDirectorySeed.js';
import { setDirectoryWriteMode, canEnableDirectorySqlWrite } from './pbxpulsDirectoryWriteMode.js';
const stable = (value:any):string => JSON.stringify(value, (_key,v)=>v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
export async function previewDirectoryStorage(connection:Connection, legacy:any) {
  const seed=buildDirectorySeedRows(legacy);
  const [contacts]=await connection.query<any[]>('SELECT * FROM directory_contacts ORDER BY id');
  const [metadata]=await connection.query<any[]>('SELECT contact_id,field_id,value,metadata_key,metadata_value,metadata_json FROM directory_contact_metadata ORDER BY contact_id,metadata_key,field_id');
  const [customFields]=await connection.query<any[]>('SELECT id,field_key,field_name,field_type FROM directory_custom_fields ORDER BY id');
  const [modes]=await connection.query<any[]>("SELECT setting_key,setting_value FROM settings WHERE setting_key IN ('directory.storage_mode','directory.write_mode','directory.production_sql_write_unlock') ORDER BY setting_key");
  const conflicts:string[]=[];let missing=0;
  for(const expected of seed.contacts){
    const row=contacts.find(row=>String(row.id)===expected.id);
    if(!row){
      if(contacts.some(row=>row.phone_normalized===expected.phone_normalized && expected.phone_normalized && String(row.owner_user_id||'')===String(expected.owner_user_id||'')))conflicts.push('phone_identity_conflict');
      else missing++;
      continue;
    }
    if(Object.keys(expected).filter(key=>!['created_at','updated_at'].includes(key)).some(key=>String(row[key]??'')!==String((expected as any)[key]??''))) conflicts.push('contact_field_conflict');
    for(const meta of seed.metadata.filter(meta=>meta.contact_id===expected.id)){
      const actual=metadata.find(m=>String(m.contact_id)===meta.contact_id && String(m.metadata_key)===meta.metadata_key && String(m.field_id||'')===String(meta.field_id||''));
      if(!actual || ['value','metadata_value','metadata_json'].some(key=>String(actual[key]??'')!==String((meta as any)[key]??'')))conflicts.push('metadata_conflict');
    }
  }
  for(const field of seed.customFields){const actual=customFields.find(f=>String(f.id)===field.id || f.field_key===field.field_key);if(actual && Object.keys(field).some(key=>String(actual[key]??'')!==String((field as any)[key]??'')))conflicts.push('custom_field_conflict');}
  if(seed.skippedCount)conflicts.push('invalid_legacy_contacts');
  if(new Set(seed.contacts.map(c=>c.id)).size!==seed.contacts.length)conflicts.push('duplicate_legacy_ids');
  const digest=crypto.createHash('sha256').update(stable({seed,contacts,metadata,customFields,modes})).digest('hex');
  return {legacyCount:seed.contacts.length,sqlCount:contacts.length,missingCount:missing,conflicts:[...new Set(conflicts)],canApply:conflicts.length===0,digest,modes};
}
export async function applyDirectoryStorage(connection:Connection,legacy:any,expectedDigest:string){
  const preview=await previewDirectoryStorage(connection,legacy);
  if(!preview.canApply||preview.digest!==expectedDigest)throw new Error('Directory preview changed or contains conflicts; no changes applied');
  await connection.beginTransaction();
  try {
    if(preview.missingCount) await seedLegacyDirectory(connection, legacy);
    const after=await previewDirectoryStorage(connection,legacy);
    if(after.missingCount||!after.canApply||after.sqlCount!==preview.sqlCount+preview.missingCount)throw new Error('Directory migration verification failed');
    await connection.commit();
  } catch(error){await connection.rollback();throw error;}
  // An explicit reviewed maintenance operation enables SQL, not a blanket runtime bypass.
  const set=async(key:string,value:string)=>connection.query('UPDATE settings SET setting_value=? WHERE setting_key=?',[value,key]);
  try {
    await set('directory.storage_mode','sql');await set('directory.production_sql_write_unlock','true');
    const ready=await canEnableDirectorySqlWrite();if(!ready.canEnable)throw new Error(ready.reason||'SQL not ready');
    const result=await setDirectoryWriteMode('sql','directory-storage-maintenance');if(!result.ok)throw new Error(result.reason||'SQL switch failed');
  } catch(error){for(const row of preview.modes)await set(row.setting_key,row.setting_value);throw error;}
  return previewDirectoryStorage(connection,legacy);
}
