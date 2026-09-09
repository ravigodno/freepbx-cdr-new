import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { buildCdrRowViewModel } from '../src/modules/cdr/utils/CDRRowHelpers.js';

async function main() {
const employee = { id: 'employee', name: 'Сотрудник', phone: '74950000001', phone_normalized: '74950000001', phone2: '8 (916) 111-22-33', type: 'internal' };
const client = { id: 'client', name: 'Клиент', phone: '+79161112233', phone_normalized: '79161112233', type: 'client' };
const metadata = [
  { contact_id: 'employee', metadata_key: 'internalExtension', metadata_value: '15' },
  { contact_id: 'employee', metadata_key: 'phones', metadata_json: '["+7 (916) 222-33-44"]' },
  { contact_id: 'employee', metadata_key: 'linkedExternalNumber', metadata_value: '+79163334455' },
];
let secondaryOnly = false;
const queries: string[] = [];
(globalThis as any).__directoryTestQuery = async (sql: string, params: any[]) => {
  queries.push(sql);
  if (sql.includes('SELECT contact_id')) return metadata;
  assert(sql.includes('c.owner_user_id = ?'), 'Every contact query must enforce access');
  assert.equal(params[0], 'user1');
  if (sql.includes('REGEXP')) return [employee];
  return secondaryOnly ? [] : [client];
};
try {
const compiled = await build({
  stdin: { contents: "export {bulkLookupDirectoryPhonesSql} from './server/directoryPerformance';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'test-db', setup(build) {
    build.onResolve({ filter: /\/pbxpulsDb\.js$/ }, () => ({ path: 'db', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const queryPBXPulsDb = (...args) => globalThis.__directoryTestQuery(...args);' }));
  } }]
});
const module = { exports: {} as any };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(process.cwd() + '/package.json'), module, module.exports);
const lookup = module.exports.bulkLookupDirectoryPhonesSql;
const result = await lookup(['15', '8 (916) 111-22-33', '9162223344', '+79163334455', '1112233'], { privileged: false, userId: 'user1' });
assert.equal(result.matches['15'].name, employee.name);
assert.equal(result.matches['79161112233'].name, client.name, 'Main number takes precedence');
assert.equal(result.matches['79162223344'].name, employee.name);
assert.equal(result.matches['79163334455'].name, employee.name);
assert.equal(result.matches['1112233'], undefined, 'Partial suffix cannot identify a contact');
secondaryOnly = true;
const secondary = await lookup(['89161112233'], { privileged: false, userId: 'user1' });
assert.equal(secondary.matches['79161112233'].name, employee.name, 'phone2 matches without opening directory');
const outgoing = buildCdrRowViewModel({ registryDirection: 'outgoing', callerExtension: '15', src: '74950000001', dst: '+79161112233', callerDirectoryContact: result.matches['15'], dstDirectoryContact: client }, []);
assert.equal(outgoing.callerName, 'Сотрудник · 15');
assert.equal(outgoing.calleeName, 'Клиент');
const incoming = buildCdrRowViewModel({ registryDirection: 'incoming', src: '+79161112233', dst: '15', srcDirectoryContact: client, dstDirectoryContact: result.matches['15'] }, []);
assert.equal(incoming.callerName, 'Клиент');
assert.equal(incoming.calleeName, 'Сотрудник');
const server = readFileSync('server.ts', 'utf8');
assert.match(server, /offset < phones.length; offset \+= 500/);
assert.match(server, /call\?\.callerExtension, call\?\.externalCallerNumber/);
console.log('CDR directory: empty browser directory, employee, incoming/outgoing, secondary numbers, precedence and SQL access checks passed');
} finally { delete (globalThis as any).__directoryTestQuery; }
}
void main();
