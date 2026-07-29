import assert from 'node:assert/strict';
import { buildDirectorySortSql } from '../server/directoryPerformance.js';

const alphabetical = buildDirectorySortSql({
  sortBy: 'name',
  sortDirection: 'asc',
  favoriteContactIds: ['contact-9', 'contact-2', 'contact-9', '', null]
}, '');

assert.match(alphabetical.sql, /^CASE WHEN c\.id IN \(\?,\?\) THEN 0 ELSE 1 END,c\.name ASC,c\.id ASC$/);
assert.deepEqual(alphabetical.params, ['contact-9', 'contact-2']);

const searched = buildDirectorySortSql({
  favoriteContactIds: ['favorite-contact']
}, 'Иванов');

assert.match(searched.sql, /^CASE WHEN c\.id IN \(\?\) THEN 0 ELSE 1 END,CASE/);
assert.equal(searched.params[0], 'favorite-contact');
assert.equal(searched.params.length, 6);

const withoutFavorites = buildDirectorySortSql({ sortBy: 'name' }, '');
assert.equal(withoutFavorites.sql, 'c.name ASC,c.id ASC');
assert.deepEqual(withoutFavorites.params, []);

console.log('directory favorite ordering tests: OK');
