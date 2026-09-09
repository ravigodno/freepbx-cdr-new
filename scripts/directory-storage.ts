import { getDirectoryWriteRuntimeDecision } from '../server/pbxpulsDirectoryWriteRouter.js';
import '../server/pbxpulsConfig.js';
import fs from 'fs';
import mysql from 'mysql2/promise';
import {getPBXPulsDbConnectionOptions} from '../server/pbxpulsDbConfig.js';
import {previewDirectoryStorage,applyDirectoryStorage} from '../server/directoryStorageRecovery.js';
async function main(){
 const legacy=fs.existsSync('data/db.json')?JSON.parse(fs.readFileSync('data/db.json','utf8')):{};
 const connection=await mysql.createConnection(getPBXPulsDbConnectionOptions());
 try {
  const preview=await previewDirectoryStorage(connection,legacy);
  if(process.argv.includes('--verify-active')){
   const ready=await getDirectoryWriteRuntimeDecision('update','maintenance');
   console.log(JSON.stringify({...preview,activeSqlReady:ready.useSql&&!ready.blocked}));
   if(!ready.useSql||ready.blocked)process.exitCode=1;
  }else if(process.argv.includes('--apply')){
   if(process.env.PBXPULS_MAINTENANCE!=='1')throw new Error('Stop PBXPuls and set PBXPULS_MAINTENANCE=1 before apply');
   const expected=process.argv[process.argv.indexOf('--expect')+1];
   console.log(JSON.stringify(await applyDirectoryStorage(connection,legacy,expected)));
  }else {console.log(JSON.stringify(preview));if(!preview.canApply)process.exitCode=2;}
 }finally{await connection.end();}
}
main().then(()=>process.exit(process.exitCode||0)).catch(()=>{console.error('Directory recovery failed. Resolve preview conflicts; data was not overwritten.');process.exit(1)});
