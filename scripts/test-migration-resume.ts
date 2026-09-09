import '../server/pbxpulsConfig.js';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import {getPBXPulsDbConnectionOptions} from '../server/pbxpulsDbConfig.js';
import {ensureMysqlAccount} from '../server/mysqlAccount.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=(flag:string,env:any={})=>spawnSync(process.execPath,[root+'/node_modules/tsx/dist/cli.mjs',root+'/scripts/pbxpuls-db.ts',flag],{env:{...process.env,...env},encoding:'utf8',timeout:120000});
async function main(){
 assert.equal(process.env.PBXPULS_DB_NAME,'pbxpuls_release_test');assert.notEqual(process.env.PBXPULS_DB_PORT,'3306');
 const c=await mysql.createConnection(getPBXPulsDbConnectionOptions());
 assert.equal(cli('--check').status,0);
 await c.query("DELETE FROM schema_migrations WHERE migration_key='20260908_096_mcn_balance_source'");
 const incomplete=cli('--check');assert.equal(incomplete.status,1);assert.match(incomplete.stdout,/20260908_096_mcn_balance_source/);
 assert.equal(cli('--setup').status,0);assert.equal(cli('--setup').status,0);
 // DDL was committed but its journal marker was lost: repeated ADD COLUMN must resume.
 const [rows]=await c.query<any[]>("SELECT migration_key FROM schema_migrations WHERE migration_key LIKE '%094%' LIMIT 1");
 if(rows.length){await c.query('DELETE FROM schema_migrations WHERE migration_key=?',[rows[0].migration_key]);assert.equal(cli('--setup').status,0);}
 assert.equal(cli('--check',{PBXPULS_DB_PASSWORD:'intentionally-invalid'}).status,1);
 assert.equal(cli('--setup',{PBXPULS_DB_PORT:'13317',PBXPULS_DB_ADMIN_SOCKET:'/nonexistent/isolated.sock'}).status,1);
 assert.ok(process.env.PBXPULS_TEST_ADMIN_SOCKET?.includes('release-testdb'));
 const admin=await mysql.createConnection({user:'root',socketPath:process.env.PBXPULS_TEST_ADMIN_SOCKET});
 await ensureMysqlAccount(admin,'fixture_account','127.0.0.1','original-fixture');
 const [before]=await admin.query<any[]>("SELECT Password FROM mysql.user WHERE User='fixture_account' AND Host='127.0.0.1'");
 assert.equal(await ensureMysqlAccount(admin,'fixture_account','127.0.0.1','different-fixture'),false);
 const [after]=await admin.query<any[]>("SELECT Password FROM mysql.user WHERE User='fixture_account' AND Host='127.0.0.1'");assert.deepEqual(after,before);
 // Account exists with a different password: setup must fail without losing its generated secret.
 const envDir=fs.mkdtempSync(path.join(os.tmpdir(),'pbxpuls-env-retry-'));
 const envFile=path.join(envDir,'.env');fs.writeFileSync(envFile,'PBXPULS_DB_PASSWORD=\n',{mode:0o600});
 const retryEnv={PBXPULS_ENV_FILE:envFile,PBXPULS_DB_USER:'fixture_account',PBXPULS_DB_PASSWORD:undefined,PBXPULS_DB_PASS:undefined,PBXPULS_DB_ADMIN_SOCKET:process.env.PBXPULS_TEST_ADMIN_SOCKET};
 try {
  assert.equal(cli('--setup',retryEnv).status,1);
  const saved=dotenv.parse(fs.readFileSync(envFile));assert.ok(saved.PBXPULS_DB_PASSWORD.length>=24);
  assert.equal(fs.statSync(envFile).mode & 0o777,0o600);
  assert.equal(cli('--setup',retryEnv).status,1);
  assert.equal(dotenv.parse(fs.readFileSync(envFile)).PBXPULS_DB_PASSWORD,saved.PBXPULS_DB_PASSWORD);
  const [unchanged]=await admin.query<any[]>("SELECT Password FROM mysql.user WHERE User='fixture_account' AND Host='127.0.0.1'");assert.deepEqual(unchanged,before);
 } finally {fs.rmSync(envDir,{recursive:true,force:true});}
 await admin.query("DROP USER 'fixture_account'@'127.0.0.1'");
 await admin.query("DROP USER 'fixture_account'@'localhost'");
 await admin.end();await c.end();console.log('PASS CLI incomplete-migration rejection, repeated setup, partial DDL recovery, failed connection exit, existing account password preserved');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
