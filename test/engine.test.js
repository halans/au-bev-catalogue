'use strict';

const test = require('node:test');
const assert = require('node:assert');

const engine = require('../src/engine');
const schema = require('../src/schema');

const RECORDS = [
  {
    id: 'a', brand: 'Kia', model: 'EV5', variant: 'Air', bodyType: 'suv',
    drive: 'FWD', availability: 'current', rangeKm: 400, rangeCycle: 'WLTP',
    batteryUsableKwh: 64.2, priceAud: 56770, powerKw: 160, seats: 5, v2l: true,
  },
  {
    id: 'b', brand: 'Kia', model: 'EV9', variant: 'GT-Line', bodyType: 'suv',
    drive: 'AWD', availability: 'current', rangeKm: 505, rangeCycle: 'WLTP',
    batteryUsableKwh: 99.8, priceAud: null, powerKw: 283, seats: 7, v2l: true,
  },
  {
    id: 'c', brand: 'BYD', model: 'Dolphin', variant: 'Premium', bodyType: 'hatch',
    drive: 'FWD', availability: 'current', rangeKm: 427, rangeCycle: 'WLTP',
    batteryUsableKwh: 60.5, priceAud: 36990, powerKw: 150, seats: 5, v2l: null,
  },
  {
    id: 'd', brand: 'Nissan', model: 'Leaf', variant: 'e+', bodyType: 'hatch',
    drive: 'FWD', availability: 'runout', rangeKm: 385, rangeCycle: 'WLTP',
    batteryUsableKwh: 59, priceAud: 61490, powerKw: 160, seats: 5, v2l: false,
  },
];

const index = engine.buildIndex({ records: RECORDS });

test('buildIndex does not mutate the records it is given', () => {
  const original = JSON.parse(JSON.stringify(RECORDS));
  engine.buildIndex({ records: RECORDS });
  assert.deepStrictEqual(RECORDS, original);
});

test('free-text search matches on prefix across brand, model and variant', () => {
  assert.deepStrictEqual(engine.query(index, { q: 'kia' }).records.map((r) => r.id), ['a', 'b']);
  assert.deepStrictEqual(engine.query(index, { q: 'dolph' }).records.map((r) => r.id), ['c']);
  // multi-token: every token must hit
  assert.deepStrictEqual(engine.query(index, { q: 'kia gt' }).records.map((r) => r.id), ['b']);
  assert.strictEqual(engine.query(index, { q: 'kia porsche' }).total, 0);
});

test('search is case and punctuation insensitive', () => {
  assert.strictEqual(engine.query(index, { q: 'GT-LINE' }).total, 1);
  assert.strictEqual(engine.query(index, { q: 'e+' }).total, 1);
});

test('facet filter accepts a single value or a list', () => {
  assert.strictEqual(engine.query(index, { facets: { brand: 'Kia' } }).total, 2);
  assert.strictEqual(engine.query(index, { facets: { brand: ['Kia', 'BYD'] } }).total, 3);
});

test('facets combine as AND across fields, OR within a field', () => {
  const result = engine.query(index, { facets: { bodyType: ['suv'], drive: ['AWD'] } });
  assert.deepStrictEqual(result.records.map((r) => r.id), ['b']);
});

test('boolean facets coerce yes/no', () => {
  assert.strictEqual(engine.query(index, { facets: { v2l: ['yes'] } }).total, 2);
  assert.strictEqual(engine.query(index, { facets: { v2l: ['no'] } }).total, 1);
});

test('range filter EXCLUDES records whose value is unknown', () => {
  // The EV9 has no price. A price ceiling must not silently include it.
  const result = engine.query(index, { ranges: { priceAud: { max: 100000 } } });
  assert.deepStrictEqual(result.records.map((r) => r.id).sort(), ['a', 'c', 'd']);
  assert.ok(!result.records.some((r) => r.id === 'b'));
});

test('range filter respects both bounds', () => {
  const result = engine.query(index, { ranges: { rangeKm: { min: 400, max: 450 } } });
  assert.deepStrictEqual(result.records.map((r) => r.id).sort(), ['a', 'c']);
});

test('sorting puts unknown values last in BOTH directions', () => {
  const asc = engine.query(index, { sort: 'priceAud', direction: 'asc' });
  assert.strictEqual(asc.records[asc.records.length - 1].id, 'b');
  const desc = engine.query(index, { sort: 'priceAud', direction: 'desc' });
  assert.strictEqual(desc.records[desc.records.length - 1].id, 'b');
});

test('sorting is stable for equal keys', () => {
  const result = engine.query(index, { sort: 'powerKw', direction: 'asc' });
  const tied = result.records.filter((r) => r.powerKw === 160).map((r) => r.id);
  assert.deepStrictEqual(tied, ['a', 'd']);
});

test('unknown sort key falls back without throwing', () => {
  const result = engine.query(index, { sort: 'notAField' });
  assert.strictEqual(result.total, RECORDS.length);
});

test('default sort is alphabetical by full name', () => {
  const names = engine.query(index, {}).records.map((r) => engine.displayName(r));
  const sorted = names.slice().sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  assert.deepStrictEqual(names, sorted);
});

test('limit and offset paginate without changing the reported total', () => {
  const page = engine.query(index, { limit: 2, offset: 1 });
  assert.strictEqual(page.total, 4);
  assert.strictEqual(page.records.length, 2);
});

test('facets report counts and ignore blanks', () => {
  const computed = engine.facets(index);
  const brands = computed.brand.reduce((acc, row) => {
    acc[row.value] = row.count; return acc;
  }, {});
  assert.deepStrictEqual(brands, { Kia: 2, BYD: 1, Nissan: 1 });
  // 'c' has v2l null, so it must not appear under either bucket
  const v2lTotal = computed.v2l.reduce((sum, row) => sum + row.count, 0);
  assert.strictEqual(v2lTotal, 3);
});

test('formatValue renders an em dash for unknowns rather than guessing', () => {
  assert.strictEqual(engine.formatValue('priceAud', null), '—');
  assert.strictEqual(engine.formatValue('rangeKm', undefined), '—');
  assert.strictEqual(engine.formatValue('v2l', null), '—');
});

test('formatValue applies units, thousands separators and currency', () => {
  assert.strictEqual(engine.formatValue('priceAud', 56770), '$56,770');
  assert.strictEqual(engine.formatValue('rangeKm', 505), '505 km');
  assert.strictEqual(engine.formatValue('batteryUsableKwh', 64.2), '64.2 kWh');
  assert.strictEqual(engine.formatValue('v2l', true), 'Yes');
  assert.strictEqual(engine.formatValue('v2l', false), 'No');
});

test('compare marks differing fields and counts missing values', () => {
  const result = engine.compare(index, ['a', 'b']);
  assert.strictEqual(result.vehicles.length, 2);
  const byKey = result.rows.reduce((acc, row) => { acc[row.key] = row; return acc; }, {});
  assert.strictEqual(byKey.brand.differs, false, 'both are Kia');
  assert.strictEqual(byKey.drive.differs, true, 'FWD vs AWD');
  assert.strictEqual(byKey.priceAud.missing, 1, 'EV9 has no price');
});

test('compare ignores ids that do not exist', () => {
  const result = engine.compare(index, ['a', 'nope']);
  assert.strictEqual(result.vehicles.length, 1);
});

test('byId returns null rather than throwing for an unknown id', () => {
  assert.strictEqual(engine.byId(index, 'does-not-exist'), null);
});

test('every sortable and facetable field named in the schema exists as a field', () => {
  for (const key of schema.SORTABLE_FIELDS.concat(schema.FACET_FIELDS)) {
    assert.ok(schema.FIELD_BY_KEY.has(key), key + ' is referenced but not defined');
  }
});

test('engine holds no reference to Node built-ins', () => {
  // The HTML surface inlines this module verbatim; a Node require would break it.
  const source = require('fs').readFileSync(require.resolve('../src/engine.js'), 'utf8');
  const requires = source.match(/require\(['"]([^'"]+)['"]\)/g) || [];
  assert.deepStrictEqual(requires, ["require('./schema')"],
    'engine.js must only require ./schema so it stays browser-safe');
});
