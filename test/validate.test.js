'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { validate, DEFAULT_RULES } = require('../src/validate');
const { reconcile } = require('../src/reconcile');
const snapshotAdapter = require('../src/adapters/snapshot');
const { report } = require('../src/reporters');
const fixtures = require('./fixtures');

function catalogueFromFixtures() {
  const dir = fixtures.makeSourcesDir();
  try {
    return reconcile([snapshotAdapter.load(dir)]);
  } finally {
    fixtures.cleanup(dir);
  }
}

const NOW = '2026-09-13';

function rulesTriggered(result) {
  return Array.from(new Set(result.findings.map((f) => f.rule))).sort();
}

test('the invalid fixture trips exactly the rules it was built to trip', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  const triggered = rulesTriggered(result);
  for (const expected of [
    'enum-out-of-domain',
    'value-out-of-envelope',
    'derived-inconsistent',
    'range-cycle-not-wltp',
    'price-basis-not-msrp',
    'stale-snapshot',
  ]) {
    assert.ok(triggered.includes(expected), 'expected rule ' + expected + ', got ' + triggered.join(', '));
  }
});

test('errors and warnings are counted separately and ok reflects errors only', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  assert.ok(result.errorCount > 0);
  assert.ok(result.warningCount > 0);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(
    result.errorCount + result.warningCount,
    result.findings.length,
    'every finding must be an error or a warning'
  );
});

test('a rule set to off produces no findings at all', () => {
  const catalogue = catalogueFromFixtures();
  const before = validate(catalogue, { now: NOW });
  const after = validate(catalogue, { now: NOW, rules: { 'range-cycle-not-wltp': 'off' } });
  assert.ok(before.findings.some((f) => f.rule === 'range-cycle-not-wltp'));
  assert.ok(!after.findings.some((f) => f.rule === 'range-cycle-not-wltp'));
});

test('a warning promoted to error changes ok and the error count', () => {
  const catalogue = catalogueFromFixtures();
  const promoted = validate(catalogue, { now: NOW, rules: { 'price-basis-not-msrp': 'error' } });
  const finding = promoted.findings.find((f) => f.rule === 'price-basis-not-msrp');
  assert.strictEqual(finding.severity, 'error');
  assert.strictEqual(promoted.ok, false);
});

test('an error demoted to warning clears ok', () => {
  const catalogue = catalogueFromFixtures();
  const demoted = validate(catalogue, {
    now: NOW,
    rules: {
      'enum-out-of-domain': 'warn',
      'value-out-of-envelope': 'warn',
      'derived-inconsistent': 'warn',
      'duplicate-identity': 'warn',
      'missing-identity-field': 'warn',
      'unparseable-source': 'warn',
    },
  });
  assert.strictEqual(demoted.errorCount, 0);
  assert.strictEqual(demoted.ok, true);
});

test('staleness is measured against the injected date, not the wall clock', () => {
  const catalogue = catalogueFromFixtures();
  const asOfFetch = validate(catalogue, { now: '2020-01-02' });
  const stale = asOfFetch.findings.filter((f) => f.rule === 'stale-snapshot');
  assert.strictEqual(stale.length, 0, 'nothing is stale the day after it was fetched');

  const later = validate(catalogue, { now: '2021-01-01' });
  assert.ok(later.findings.some((f) => f.rule === 'stale-snapshot'));
});

test('every finding carries a rule id, severity and human message', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  for (const finding of result.findings) {
    assert.ok(finding.rule, 'missing rule id');
    assert.ok(['warn', 'error'].includes(finding.severity), 'bad severity ' + finding.severity);
    assert.ok(finding.message && finding.message.length > 5, 'unhelpful message');
    assert.ok(Object.prototype.hasOwnProperty.call(DEFAULT_RULES, finding.rule),
      'finding references undeclared rule ' + finding.rule);
  }
});

test('a clean catalogue produces no findings', () => {
  const clean = reconcile([{ entries: [], brands: [], problems: [] }]);
  const result = validate(clean, { now: NOW });
  assert.deepStrictEqual(result.findings, []);
  assert.strictEqual(result.ok, true);
});

/* ---------------- reporters ---------------- */

test('all four reporters accept the same findings and emit non-empty output', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  for (const name of ['pretty', 'json', 'ci', 'sarif']) {
    const text = report(name, result, { colour: false });
    assert.ok(typeof text === 'string' && text.length > 0, name + ' produced nothing');
  }
});

test('the json reporter emits parseable JSON matching the result', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  const parsed = JSON.parse(report('json', result));
  assert.strictEqual(parsed.errorCount, result.errorCount);
  assert.strictEqual(parsed.warningCount, result.warningCount);
  assert.strictEqual(parsed.findings.length, result.findings.length);
});

test('the sarif reporter emits valid SARIF 2.1.0 with a rule per finding', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  const sarif = JSON.parse(report('sarif', result));
  assert.strictEqual(sarif.version, '2.1.0');
  assert.strictEqual(sarif.runs.length, 1);
  assert.strictEqual(sarif.runs[0].results.length, result.findings.length);
  const declared = new Set(sarif.runs[0].tool.driver.rules.map((r) => r.id));
  for (const row of sarif.runs[0].results) {
    assert.ok(declared.has(row.ruleId), 'SARIF result cites undeclared rule ' + row.ruleId);
    assert.ok(['error', 'warning'].includes(row.level));
  }
});

test('the ci reporter emits GitHub workflow commands', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  const text = report('ci', result);
  assert.match(text, /^::(error|warning) title=/m);
  assert.match(text, /::notice title=bev-validate::/);
});

test('the pretty reporter omits ANSI codes when colour is off', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  const text = report('pretty', result, { colour: false });
  assert.ok(!/\[/.test(text), 'found ANSI escapes with colour disabled');
});

test('an unknown reporter is a usage error, not a crash', () => {
  const result = validate(catalogueFromFixtures(), { now: NOW });
  assert.throws(() => report('nonsense', result), (err) => err.code === 'EUSAGE');
});
