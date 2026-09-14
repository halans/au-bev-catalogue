'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { reconcile, materiallyDifferent, observationRank, deriveFields } = require('../src/reconcile');
const snapshotAdapter = require('../src/adapters/snapshot');
const fixtures = require('./fixtures');

function observation(field, value, sourceKind, extra) {
  return Object.assign({
    field, value, sourceKind, adapter: 'test',
    url: 'https://example.test/' + sourceKind,
    publisher: sourceKind, licence: null,
    fetchedAt: '2026-09-13', confidence: 'high', flaggedByAuthor: false,
  }, extra || {});
}

function entry(observations) {
  return {
    identity: 'x__y__z',
    identityRecord: { brand: 'X', model: 'Y', variant: 'Z' },
    sourceFile: 'x.json',
    brandSlug: 'x',
    brandNotes: null,
    observations,
  };
}

test('higher source precedence wins a disagreement', () => {
  const result = reconcile([{ entries: [entry([
    observation('rangeKm', 400, 'press'),
    observation('rangeKm', 450, 'manufacturer'),
  ])] }]);
  assert.strictEqual(result.records[0].rangeKm, 450);
  assert.strictEqual(result.records[0].provenance.rangeKm.sourceKind, 'manufacturer');
});

test('government data outranks the manufacturer', () => {
  const result = reconcile([{ entries: [entry([
    observation('consumptionWhPerKm', 160, 'manufacturer'),
    observation('consumptionWhPerKm', 178, 'green-vehicle-guide'),
  ])] }]);
  assert.strictEqual(result.records[0].consumptionWhPerKm, 178);
});

test('a losing observation is recorded as a conflict, never dropped silently', () => {
  const result = reconcile([{ entries: [entry([
    observation('powerKw', 150, 'press'),
    observation('powerKw', 200, 'manufacturer'),
  ])] }]);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].field, 'powerKw');
  assert.strictEqual(result.conflicts[0].chosen.value, 200);
  assert.strictEqual(result.conflicts[0].rejected.value, 150);
});

test('a lower-precedence source may FILL a field the winner lacks', () => {
  const result = reconcile([{ entries: [entry([
    observation('rangeKm', 450, 'manufacturer'),
    observation('torqueNm', 300, 'press'),
  ])] }]);
  assert.strictEqual(result.records[0].torqueNm, 300, 'press filled a gap');
  assert.strictEqual(result.records[0].provenance.torqueNm.sourceKind, 'press');
  assert.strictEqual(result.conflicts.length, 0, 'filling a gap is not a conflict');
});

test('rounding differences within 2 per cent are not treated as conflicts', () => {
  assert.strictEqual(materiallyDifferent('batteryUsableKwh', 64, 64.2), false);
  assert.strictEqual(materiallyDifferent('batteryUsableKwh', 64, 70), true);
  assert.strictEqual(materiallyDifferent('rangeKm', 500, 505), false, '1 per cent apart is rounding');
  assert.strictEqual(materiallyDifferent('rangeKm', 500, 560), true, '12 per cent apart is a real disagreement');
});

test('string and boolean comparison is exact, ignoring case and padding', () => {
  assert.strictEqual(materiallyDifferent('drive', 'AWD', ' awd '), false);
  assert.strictEqual(materiallyDifferent('drive', 'AWD', 'RWD'), true);
  assert.strictEqual(materiallyDifferent('v2l', true, false), true);
});

test('confidence then recency break a precedence tie, deterministically', () => {
  const high = observation('rangeKm', 1, 'press', { confidence: 'high' });
  const low = observation('rangeKm', 2, 'press', { confidence: 'low' });
  assert.ok(observationRank(high, low) > 0);

  const older = observation('rangeKm', 1, 'press', { fetchedAt: '2026-01-01' });
  const newer = observation('rangeKm', 2, 'press', { fetchedAt: '2026-09-13' });
  assert.ok(observationRank(newer, older) > 0);
});

test('absent fields become explicit nulls, not missing keys', () => {
  const result = reconcile([{ entries: [entry([observation('rangeKm', 400, 'manufacturer')])] }]);
  const record = result.records[0];
  assert.ok('priceAud' in record);
  assert.strictEqual(record.priceAud, null);
});

test('derived fields compute only when both inputs are present', () => {
  assert.strictEqual(deriveFields({ batteryUsableKwh: 60, rangeKm: 400 }).efficiencyWhPerKm, 150);
  assert.strictEqual(deriveFields({ batteryUsableKwh: 60, rangeKm: null }).efficiencyWhPerKm, null);
  assert.strictEqual(deriveFields({ priceAud: 50000, rangeKm: 500 }).dollarsPerKmRange, 100);
  assert.strictEqual(deriveFields({ priceAud: null, rangeKm: 500 }).dollarsPerKmRange, null);
});

test('derived fields never divide by zero', () => {
  const derived = deriveFields({ batteryUsableKwh: 60, rangeKm: 0, priceAud: 1000 });
  assert.strictEqual(derived.efficiencyWhPerKm, null);
  assert.strictEqual(derived.dollarsPerKmRange, null);
});

test('the same identity from two files is reported as a duplicate', () => {
  const a = entry([observation('rangeKm', 400, 'manufacturer')]);
  const b = entry([observation('rangeKm', 400, 'manufacturer')]);
  b.sourceFile = 'other.json';
  const result = reconcile([{ entries: [a, b] }]);
  assert.strictEqual(result.records.length, 1, 'merged into one vehicle');
  assert.strictEqual(result.duplicates.length, 1);
  assert.deepStrictEqual(result.duplicates[0].sourceFiles.sort(), ['other.json', 'x.json']);
});

test('output ordering is deterministic regardless of input order', () => {
  const one = entry([observation('rangeKm', 1, 'manufacturer')]);
  const two = entry([observation('rangeKm', 2, 'manufacturer')]);
  two.identity = 'a__b__c';
  const forward = reconcile([{ entries: [one, two] }]).records.map((r) => r.id);
  const backward = reconcile([{ entries: [two, one] }]).records.map((r) => r.id);
  assert.deepStrictEqual(forward, backward);
  assert.deepStrictEqual(forward, ['a__b__c', 'x__y__z']);
});

test('low-confidence fields are listed on the record', () => {
  const result = reconcile([{ entries: [entry([
    observation('rangeKm', 400, 'manufacturer'),
    observation('torqueNm', 300, 'press', { confidence: 'low' }),
  ])] }]);
  assert.deepStrictEqual(result.records[0].lowConfidenceFields, ['torqueNm']);
});

/* ---------------- adapter behaviour ---------------- */

test('the adapter classifies press URLs as press and brand URLs as manufacturer', () => {
  assert.strictEqual(snapshotAdapter.sourceKindForUrl('https://www.kia.com/au/x'), 'manufacturer');
  assert.strictEqual(snapshotAdapter.sourceKindForUrl('https://www.carexpert.com.au/x'), 'press');
  assert.strictEqual(snapshotAdapter.sourceKindForUrl('https://www.drive.com.au/x'), 'press');
  assert.strictEqual(snapshotAdapter.sourceKindForUrl('https://greenvehicleguide.gov.au/x'), 'green-vehicle-guide');
});

test('the adapter tolerates units and separators in hand-authored numbers', () => {
  assert.strictEqual(snapshotAdapter.coerce('batteryUsableKwh', '64.2 kWh'), 64.2);
  assert.strictEqual(snapshotAdapter.coerce('towingBrakedKg', '1,600'), 1600);
  assert.strictEqual(snapshotAdapter.coerce('rangeKm', ''), undefined);
  assert.strictEqual(snapshotAdapter.coerce('rangeKm', null), undefined);
});

test('the adapter normalises enum casing but preserves invalid values for the validator', () => {
  assert.strictEqual(snapshotAdapter.coerce('drive', 'awd'), 'AWD');
  assert.strictEqual(snapshotAdapter.coerce('bodyType', 'spaceship'), 'spaceship');
});

test('field-level sources override the brand-level source kind', () => {
  const dir = fixtures.makeSourcesDir();
  try {
    const loaded = snapshotAdapter.load(dir);
    const result = reconcile([loaded]);
    const bolt = result.records.find((r) => r.model === 'Bolt');
    assert.strictEqual(bolt.provenance.rangeKm.sourceKind, 'manufacturer');
    assert.strictEqual(bolt.provenance.torqueNm.sourceKind, 'press',
      'torqueNm was cited to CarExpert, so it must be tagged press');
    assert.strictEqual(bolt.provenance.torqueNm.confidence, 'low',
      'the author flagged it low confidence');
  } finally {
    fixtures.cleanup(dir);
  }
});

test('a variant-level sourceUrl overrides sourceUrls[0] for multi-model brand files', () => {
  const dir = fixtures.makeSourcesDir({
    'multibrand.json': {
      brand: 'Multibrand',
      brandSlug: 'multibrand',
      publisher: 'Multibrand Australia',
      sourceUrls: [
        'https://www.multibrand.example/au/model-a',
        'https://www.multibrand.example/au/model-b',
      ],
      fetchedAt: '2026-09-13',
      licence: 'proprietary-factual',
      notes: 'Synthetic fixture: two models sharing one brand file and sourceUrls array.',
      variants: [
        {
          model: 'Model A',
          variant: 'Base',
          bodyType: 'hatch',
          segment: 'small',
          drive: 'FWD',
          seats: 5,
          availability: 'current',
          fieldSources: {},
          lowConfidenceFields: [],
        },
        {
          model: 'Model B',
          variant: 'Base',
          bodyType: 'suv',
          segment: 'suv-small',
          drive: 'AWD',
          seats: 7,
          sourceUrl: 'https://www.multibrand.example/au/model-b',
          availability: 'current',
          fieldSources: {},
          lowConfidenceFields: [],
        },
      ],
    },
  });
  try {
    const loaded = snapshotAdapter.load(dir);
    const result = reconcile([loaded]);
    const a = result.records.find((r) => r.model === 'Model A');
    const b = result.records.find((r) => r.model === 'Model B');

    assert.strictEqual(a.provenance.seats.url, 'https://www.multibrand.example/au/model-a',
      'a variant with no sourceUrl falls back to sourceUrls[0], unchanged from before');
    assert.strictEqual(b.provenance.seats.url, 'https://www.multibrand.example/au/model-b',
      'a variant-level sourceUrl must win, so the second model in the file is not ' +
      "mis-attributed to the first model's page");
  } finally {
    fixtures.cleanup(dir);
  }
});

test('brands with no variants still appear in the brand list', () => {
  const dir = fixtures.makeSourcesDir();
  try {
    const result = reconcile([snapshotAdapter.load(dir)]);
    const empty = result.brands.find((b) => b.brand === 'Notinmarket');
    assert.ok(empty, 'a checked brand with no BEV must still be recorded');
    assert.strictEqual(empty.variantCount, 0);
  } finally {
    fixtures.cleanup(dir);
  }
});

test('an unparseable source file is reported rather than crashing the build', () => {
  const dir = fixtures.makeSourcesDir({ 'bad.json': '{ this is not json' });
  try {
    const loaded = snapshotAdapter.load(dir);
    assert.strictEqual(loaded.problems.length, 1);
    assert.match(loaded.problems[0].message, /unparseable/);
  } finally {
    fixtures.cleanup(dir);
  }
});
