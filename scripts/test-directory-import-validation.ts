import assert from'node:assert/strict';import fs from'node:fs';
import{diagnoseDirectoryExtension,diagnoseDirectoryPhone,normalizeDirectoryPhoneInput,parseDirectoryCsv,validateDirectoryPhone}from'../shared/directoryImportValidation.js';
for(const value of['+79781000000','79781000000','9781000000','+7 (978) 100-00-00','+7\u00A0978\u00A0100-00-00','\uFEFF+79781000000','+7\u200B9781000000'])assert.equal(validateDirectoryPhone(value).valid,true,value);
for(const value of['','','   ']){assert.equal(diagnoseDirectoryPhone(value,'phone2',2),null);assert.equal(diagnoseDirectoryExtension(value,2),null)}
assert.equal(diagnoseDirectoryExtension('200',2),null);assert.equal(diagnoseDirectoryPhone('7.9781E+10','phone',2)?.reason,'scientific_notation');
assert.equal(diagnoseDirectoryPhone('+123456789012','phone',2)?.reason,'invalid_length');assert.equal(normalizeDirectoryPhoneInput('+7\u200B978').digits,'7978');
const special=parseDirectoryCsv('\uFEFFfullName,phone,tags,comment\r\n"Иван, Иван",+79781000000,VIP;Клиент,"строка 1\nстрока 2"\r\n\r\n');
assert.equal(special.delimiter,',');assert.equal(special.rows.length,2);assert.equal(special.rows[1].values.length,4);assert.equal(special.rows[1].values[2],'VIP;Клиент');
const lines=['fullName,phone,phone2,internalExtension,linkedExternalNumber'];for(let index=0;index<100000;index++)lines.push(`Контакт ${index},+${79781000000+index},,,`);
const parsed=parseDirectoryCsv(lines.join('\r\n')+'\r\n');assert.equal(parsed.rows.length,100001);let errors=0;const seen=new Set<string>();for(const row of parsed.rows.slice(1)){const result=validateDirectoryPhone(row.values[1]);if(!result.valid)errors++;assert.equal(seen.has(result.digits),false);seen.add(result.digits)}assert.equal(errors,0);assert.equal(seen.size,100000);
for(const boundary of[9999,10000,19999,20000,99999])assert.equal(validateDirectoryPhone(parsed.rows[boundary+1].values[1]).valid,true);
const frontend=fs.readFileSync('src/App.tsx','utf8'),backend=fs.readFileSync('server.ts','utf8');assert.match(frontend,/validateDirectoryPhone\(value\)/);assert.match(backend,/validateSharedDirectoryPhone\(value\)/);
console.log(JSON.stringify({ok:true,rows:100000,valid:100000,errors:0,delimiter:parsed.delimiter,chunkBoundaries:'ok',frontendBackendParity:true}));
