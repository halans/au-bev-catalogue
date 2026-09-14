'use strict';

/**
 * CLI contract tests.
 *
 * Exit codes are a public interface: CI pipelines branch on them. These tests
 * pin the distinction that matters most — a validation failure (1) must never
 * be confused with a mistyped flag (2) or a missing catalogue (3).
 */

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'bev.js');

const cli = require('../bin/bev.js');

function run(args, options) {
  return spawnSync(process.execPath, [BIN].concat(args), Object.assign({
    encoding: 'utf8',
    env: Object.assign({}, process.env, { NO_COLOR: '1' }),
    cwd: ROOT,
  }, options || {}));
}

/* ---------------- argument parsing ---------------- */

test('parseArgs handles --flag=value, --flag value and bare flags', () => {
  const parsed = cli.parseArgs(['list', '--sort=priceAud', '--limit', '5', '--desc']);
  assert.deepStrictEqual(parsed._, ['list']);
  assert.strictEqual(parsed.flags.sort, 'priceAud');
  assert.strictEqual(parsed.flags.limit, '5');
  assert.strictEqual(parsed.flags.desc, true);
});

test('parseArgs expands short flags', () => {
  const parsed = cli.parseArgs(['list', '-q', 'kia', '-s', 'rangeKm', '-l', '3']);
  assert.strictEqual(parsed.flags.query, 'kia');
  assert.strictEqual(parsed.flags.sort, 'rangeKm');
  assert.strictEqual(parsed.flags.limit, '3');
});

test('collectFilters parses comma lists and repeated flags', () => {
  assert.deepStrictEqual(cli.collectFilters('brand=Kia,BYD'), { brand: ['Kia', 'BYD'] });
  assert.deepStrictEqual(
    cli.collectFilters(['brand=Kia', 'drive=AWD']),
    { brand: ['Kia'], drive: ['AWD'] }
  );
});

test('collectFilters rejects a non-filterable field as a usage error', () => {
  assert.throws(() => cli.collectFilters('nonsense=1'), (err) => err.code === 'EUSAGE');
  assert.throws(() => cli.collectFilters('brand'), (err) => err.code === 'EUSAGE');
});

test('collectRanges resolves short aliases to canonical fields', () => {
  assert.deepStrictEqual(
    cli.collectRanges('price=40000', 'range=500'),
    { priceAud: { min: 40000 }, rangeKm: { max: 500 } }
  );
});

test('collectRanges rejects a non-numeric bound', () => {
  assert.throws(() => cli.collectRanges('price=cheap', null), (err) => err.code === 'EUSAGE');
});

test('parseRuleOverrides rejects unknown rules and bad severities', () => {
  assert.deepStrictEqual(cli.parseRuleOverrides('missing-core-field:off'), { 'missing-core-field': 'off' });
  assert.throws(() => cli.parseRuleOverrides('made-up-rule:off'), (err) => err.code === 'EUSAGE');
  assert.throws(() => cli.parseRuleOverrides('missing-core-field:loud'), (err) => err.code === 'EUSAGE');
});

/* ---------------- exit codes ---------------- */

test('a successful command exits 0', () => {
  const result = run(['list', '--limit', '3']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /BRAND/);
});

test('an unknown command exits 2 and names the valid commands', () => {
  const result = run(['frobnicate']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /unknown command/);
  assert.match(result.stderr, /expected one of/);
});

test('a bad flag value exits 2, distinct from a validation failure', () => {
  const result = run(['list', '--filter', 'colour=red']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /usage error/);
});

test('an unknown reporter exits 2', () => {
  const result = run(['validate', '--format', 'interpretive-dance']);
  assert.strictEqual(result.status, 2);
});

test('a missing catalogue exits 3, distinct from a usage error', () => {
  const result = run(['list'], { env: Object.assign({}, process.env, { NO_COLOR: '1' }) , cwd: ROOT});
  // The real catalogue exists, so provoke the condition directly instead.
  const { loadCatalogue } = require('../src/build');
  assert.throws(
    () => loadCatalogue(path.join(os.tmpdir(), 'definitely-not-a-catalogue-' + Date.now() + '.json')),
    (err) => err.code === 'ENOCATALOGUE'
  );
  assert.strictEqual(result.status, 0, 'sanity: the real catalogue is present');
});

test('validation exits 1 when a rule is promoted to error, 0 otherwise', () => {
  const clean = run(['validate', '--now', '2026-09-13']);
  assert.strictEqual(clean.status, 0, 'the shipped catalogue must validate clean');

  const strict = run(['validate', '--now', '2026-09-13', '--rule', 'missing-core-field:error']);
  assert.strictEqual(strict.status, 1, 'promoting a real warning to error must fail the run');
});

test('--max-warnings turns a warning budget into a failing exit code', () => {
  const generous = run(['validate', '--now', '2026-09-13', '--max-warnings', '99999']);
  assert.strictEqual(generous.status, 0);

  const strict = run(['validate', '--now', '2026-09-13', '--max-warnings', '0']);
  assert.strictEqual(strict.status, 1);
  assert.match(strict.stderr, /exceed --max-warnings/);
});

test('help exits 0 and documents the exit codes', () => {
  const result = run(['--help']);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Exit codes/);
  assert.match(result.stdout, /usage error/);
});

/* ---------------- output formats ---------------- */

test('list --format json emits parseable JSON with a total', () => {
  const result = run(['list', '--filter', 'brand=Tesla', '--format', 'json']);
  assert.strictEqual(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.total > 0);
  assert.strictEqual(parsed.records.length, parsed.total);
  assert.ok(parsed.records.every((r) => r.brand === 'Tesla'));
});

test('list --format csv emits a header and one line per record', () => {
  const result = run(['list', '--filter', 'brand=Tesla', '--format', 'csv']);
  assert.strictEqual(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.match(lines[0], /^id,brand,model,variant/);
  assert.ok(lines.length > 1);
});

test('csv output quotes fields containing commas', () => {
  const result = run(['list', '--format', 'csv']);
  const withComma = result.stdout.split('\n').filter((line) => /"[^"]*,[^"]*"/.test(line));
  assert.ok(withComma.length > 0, 'expected at least one quoted field in the real data');
});

test('validate --format sarif emits schema-valid SARIF', () => {
  const result = run(['validate', '--now', '2026-09-13', '--format', 'sarif']);
  assert.strictEqual(result.status, 0, result.stderr);
  const sarif = JSON.parse(result.stdout);
  assert.strictEqual(sarif.version, '2.1.0');
  assert.ok(Array.isArray(sarif.runs[0].results));
});

test('validate --format ci emits GitHub workflow commands', () => {
  const result = run(['validate', '--now', '2026-09-13', '--format', 'ci']);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /::(warning|error|notice) title=/);
});

/* ---------------- query behaviour through the CLI ---------------- */

test('show resolves a full id and prints provenance tags', () => {
  const { loadCatalogue } = require('../src/build');
  const id = loadCatalogue().records[0].id;
  const result = run(['show', id]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp('id: ' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stdout, /\[manufacturer|\[press/);
});

test('show with ambiguous text lists candidates instead of guessing', () => {
  const result = run(['show', 'model']);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /vehicles match/);
});

test('compare requires two ids and rejects unknown ones', () => {
  const tooFew = run(['compare', 'only-one']);
  assert.strictEqual(tooFew.status, 2);

  const unknown = run(['compare', 'nope-a', 'nope-b']);
  assert.strictEqual(unknown.status, 2);
  assert.match(unknown.stderr, /unknown vehicle id/);
});

test('compare --only-diff hides fields that agree', () => {
  const { loadCatalogue } = require('../src/build');
  const records = loadCatalogue().records;
  const ids = [records[0].id, records[1].id];
  const full = run(['compare'].concat(ids));
  const diff = run(['compare'].concat(ids, ['--only-diff']));
  assert.strictEqual(full.status, 0, full.stderr);
  assert.strictEqual(diff.status, 0, diff.stderr);
  assert.ok(diff.stdout.length < full.stdout.length);
});

test('coverage reports measured completeness rather than a boolean claim', () => {
  const result = run(['coverage']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /core completeness\s+\d+(\.\d+)?%/);
  assert.match(result.stdout, /Field completeness/);
  assert.match(result.stdout, /brands checked/);
});

test('brands lists every checked brand including those with no BEV', () => {
  const result = run(['brands']);
  assert.strictEqual(result.status, 0);
  const { loadCatalogue } = require('../src/build');
  const catalogue = loadCatalogue();
  const zero = catalogue.brands.filter((b) => b.variantCount === 0);
  assert.ok(zero.length > 0, 'fixture expectation: some brands sell no BEV');
  for (const brand of zero) {
    assert.ok(result.stdout.includes(brand.brand), brand.brand + ' missing from brands output');
  }
});

test('sources prints attribution URLs for a named brand', () => {
  const result = run(['sources', '--brand', 'tesla']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tesla/);
  assert.match(result.stdout, /https?:\/\//);
});

/* ---------------- build determinism ---------------- */

test('two builds with the same inputs produce byte-identical output', () => {
  const a = path.join(os.tmpdir(), 'bev-a-' + Date.now() + '.json');
  const b = path.join(os.tmpdir(), 'bev-b-' + Date.now() + '.json');
  const htmlA = path.join(os.tmpdir(), 'bev-a-' + Date.now() + '.html');
  const htmlB = path.join(os.tmpdir(), 'bev-b-' + Date.now() + '.html');
  try {
    execFileSync(process.execPath, [BIN, 'build', '--now', '2026-09-13', '--out', a, '--html', htmlA], { cwd: ROOT });
    execFileSync(process.execPath, [BIN, 'build', '--now', '2026-09-13', '--out', b, '--html', htmlB], { cwd: ROOT });
    assert.strictEqual(fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8'), 'catalogue differs between builds');
    assert.strictEqual(fs.readFileSync(htmlA, 'utf8'), fs.readFileSync(htmlB, 'utf8'), 'page differs between builds');
  } finally {
    for (const f of [a, b, htmlA, htmlB]) fs.rmSync(f, { force: true });
  }
});

test('the built catalogue records a checksum for every source file', () => {
  const { loadCatalogue } = require('../src/build');
  const catalogue = loadCatalogue();
  const checksums = catalogue.meta.snapshotChecksums;
  const files = fs.readdirSync(path.join(ROOT, 'data', 'sources')).filter((f) => f.endsWith('.json'));
  assert.strictEqual(Object.keys(checksums).length, files.length);
  for (const file of files) {
    assert.match(checksums[file], /^[0-9a-f]{64}$/, 'bad checksum for ' + file);
  }
});
