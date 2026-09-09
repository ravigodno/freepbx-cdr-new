import '../server/pbxpulsConfig.js';
import assert from 'node:assert/strict';
import fs from 'fs';
import mysql from 'mysql2/promise';
import {getPBXPulsDbConnectionOptions} from '../server/pbxpulsDbConfig.js';
import {previewDirectoryStorage,applyDirectoryStorage} from '../server/directoryStorageRecovery.js';
import {getDirectoryContactSql} from '../server/directoryPerformance.js';
async function main(){
 assert.equal(process.env.PBXPULS_DB_NAME,'pbxpuls_release_test');assert.notEqual(process.env.PBXPULS_DB_PORT,'3306');
 const c=await mysql.createConnection(getPBXPulsDbConnectionOptions());
 const original=fs.readFileSync('data/db.json','utf8'),legacy=JSON.parse(original);
 legacy.directory=[{id:'legacy-fixture',name:'Legacy Fixture',number:'783',phones:['783','15550004000'],visibility:'private',ownerUserId:'fixture-operator',type:'internal',internalExtension:'783',linkedExternalNumber:'15550005000',department:'Fixture',email:'legacy@example.invalid',comment:'Preserve'}];
 fs.writeFileSync('data/db.json',JSON.stringify(legacy));
 try {
  const p=await previewDirectoryStorage(c,legacy);assert.equal(p.canApply,true);assert.equal(p.missingCount,1);
  await assert.rejects(()=>applyDirectoryStorage(c,legacy,'stale-digest'));
  const after=await applyDirectoryStorage(c,legacy,p.digest);assert.equal(after.sqlCount,p.sqlCount+1);assert.equal(after.missingCount,0);
  const contact=await getDirectoryContactSql('legacy-fixture',{privileged:false,userId:'fixture-operator'});assert.equal(contact?.linkedExternalNumber,'15550005000');assert.equal(contact?.visibility,'private');
  await applyDirectoryStorage(c,legacy,after.digest);assert.equal((await previewDirectoryStorage(c,legacy)).sqlCount,after.sqlCount);
  const conflict={...legacy,directory:[{...legacy.directory[0],ownerUserId:'other'}]};const bad=await previewDirectoryStorage(c,conflict);assert.equal(bad.canApply,false);await assert.rejects(()=>applyDirectoryStorage(c,conflict,bad.digest));
  const duplicate={...legacy,directory:[{...legacy.directory[0],id:'different-id'}]};assert.equal((await previewDirectoryStorage(c,duplicate)).canApply,false);
  const changed={...legacy,directory:[{...legacy.directory[0],linkedExternalNumber:'15550006000'}]};assert.equal((await previewDirectoryStorage(c,changed)).canApply,false);
 }finally{await c.query("DELETE FROM directory_contact_metadata WHERE contact_id='legacy-fixture'");await c.query("DELETE FROM directory_contacts WHERE id='legacy-fixture'");fs.writeFileSync('data/db.json',original);await c.end();}
 console.log('PASS reviewed migration, owner and metadata preservation, stale preview and conflict refusal, repeated apply without duplicates');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
