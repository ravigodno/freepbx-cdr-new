import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {loadModuleVisibility,saveModuleVisibility} from '../server/moduleVisibility.js';
import {normalizeModuleVisibilitySettings} from '../shared/accessCatalog.js';
const socket=process.env.PBXPULS_TEST_ADMIN_SOCKET;
assert.ok(socket?.includes('/pbxpuls-release-testdb/'),'An isolated test database socket is required');
const connection=await mysql.createConnection({user:'root',socketPath:socket,database:'pbxpuls_release_test'});
const query=async(sql:string,params:any[]=[])=>{const [rows]=await connection.execute(sql,params);return rows as any[];};
const previous=await query("SELECT * FROM settings WHERE setting_key='access.module_visibility'");
try {
 await saveModuleVisibility(normalizeModuleVisibilitySettings({ai_platform:false,dialer:false,monitoring:false,gsm_gateways:true}),query);
 const actual=await loadModuleVisibility({ai_platform:true,dialer:true},query);
 assert.equal(actual.ai_platform,false);assert.equal(actual.dialer,false);assert.equal(actual.gsm_gateways,true);
 await saveModuleVisibility({...actual,dialer:true},query);
 assert.equal((await loadModuleVisibility({},query)).dialer,true);
 const rows=await query("SELECT setting_value,value_type FROM settings WHERE setting_key='access.module_visibility'");
 assert.equal(rows.length,1);assert.equal(rows[0].value_type,'json');assert.equal(JSON.parse(rows[0].setting_value).ai_platform,false);
 console.log('PASS MariaDB visibility insert/update/read and legacy precedence; no live database used');
} finally {
 if(previous.length)await query("UPDATE settings SET setting_value=?,value_type=?,category=? WHERE setting_key='access.module_visibility'",[previous[0].setting_value,previous[0].value_type,previous[0].category]);
 else await query("DELETE FROM settings WHERE setting_key='access.module_visibility'");
 await connection.end();
}
