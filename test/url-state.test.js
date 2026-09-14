'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { encodeState, decodeState } = require('../src/url-state');

test('an unfiltered, default state encodes to an empty hash', () => {
  const state = { q: '', facets: {}, ranges: {}, sort: 'name', direction: 'asc', view: 'table', compare: [], open: null };
  assert.strictEqual(encodeState(state), '');
});

test('encodeState only emits params that differ from the default', () => {
  const state = { q: '', facets: {}, ranges: {}, sort: 'name', direction: 'asc', view: 'table', compare: [], open: null };
  const hash = encodeState(Object.assign({}, state, { sort: 'rangeKm' }));
  assert.strictEqual(hash, 'sort=rangeKm');
});

test('encodeState round-trips query, facets, ranges, sort, view, compare and open', () => {
  const state = {
    q: 'ioniq',
    facets: { brand: ['Kia', 'BYD'] },
    ranges: { priceAud: { max: 35000 }, rangeKm: { min: 300, max: 500 } },
    sort: 'rangeKm',
    direction: 'desc',
    view: 'cards',
    compare: ['kia__ev5__air', 'byd__atto-3__standard'],
    open: 'kia__ev5__air',
  };

  const restored = decodeState(encodeState(state));

  assert.strictEqual(restored.q, 'ioniq');
  assert.deepStrictEqual(restored.facets, { brand: ['Kia', 'BYD'] });
  assert.deepStrictEqual(restored.ranges, { priceAud: { max: 35000 }, rangeKm: { min: 300, max: 500 } });
  assert.strictEqual(restored.sort, 'rangeKm');
  assert.strictEqual(restored.direction, 'desc');
  assert.strictEqual(restored.view, 'cards');
  assert.deepStrictEqual(restored.compare, ['kia__ev5__air', 'byd__atto-3__standard']);
  assert.strictEqual(restored.open, 'kia__ev5__air');
});

test('decodeState returns a sparse object: absent params are simply not set', () => {
  const restored = decodeState('q=tesla');
  assert.strictEqual(restored.q, 'tesla');
  assert.strictEqual('facets' in restored, false);
  assert.strictEqual('ranges' in restored, false);
  assert.strictEqual('sort' in restored, false);
  assert.strictEqual('compare' in restored, false);
  assert.strictEqual('open' in restored, false);
});

test('decodeState accepts a hash with or without the leading #', () => {
  assert.deepStrictEqual(decodeState('#q=hello'), decodeState('q=hello'));
});

test('decodeState drops unknown facet fields, unknown range fields and bad sort keys', () => {
  const restored = decodeState('notareal=field&min-notareal=100&sort=notasortablefield');
  assert.strictEqual('facets' in restored, false);
  assert.strictEqual('ranges' in restored, false);
  assert.strictEqual('sort' in restored, false);
});

test('decodeState drops a non-finite range value instead of throwing', () => {
  const restored = decodeState('min-priceAud=notanumber&max-priceAud=40000');
  assert.deepStrictEqual(restored.ranges, { priceAud: { max: 40000 } });
});

test('decodeState rejects an invalid dir or view rather than accepting anything', () => {
  const restored = decodeState('dir=sideways&view=grid');
  assert.strictEqual('direction' in restored, false);
  assert.strictEqual('view' in restored, false);
});

test('decodeState caps a restored compare list at 4 ids', () => {
  const restored = decodeState('compare=a,b,c,d,e,f');
  assert.deepStrictEqual(restored.compare, ['a', 'b', 'c', 'd']);
});

test('an empty string and an empty hash both decode to an empty object', () => {
  assert.deepStrictEqual(decodeState(''), {});
  assert.deepStrictEqual(decodeState('#'), {});
  assert.deepStrictEqual(decodeState(null), {});
});
