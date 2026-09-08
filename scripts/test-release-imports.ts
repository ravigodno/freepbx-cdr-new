import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as XLSX from 'xlsx';
const require = createRequire(import.meta.url);
const expressRequire = createRequire(require.resolve('express'));
const qs = expressRequire('qs');

const rows = [
  ['Артикул', 'Город', 'Размещение', 'Цена'],
  ['1002260', 'Коктебель', 'ЛИДЕР; 4 вых/час; 30 дней', 19440],
];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Прайс');
const restored = XLSX.read(XLSX.write(workbook, {type:'buffer', bookType:'xlsx'}), {type:'buffer'});
assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets['Прайс'], {header:1}), rows);
assert.deepEqual(qs.parse('filter[city]=Ялта&tags[]=a&tags[]=b'), {filter:{city:'Ялта'}, tags:['a','b']});
assert.deepEqual(qs.parse('__proto__[polluted]=yes&safe=1'), {safe:'1'});
assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
console.log('Release spreadsheet import and HTTP query parsing tests passed');
