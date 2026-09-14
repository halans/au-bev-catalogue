'use strict';

/**
 * Cross-surface equivalence.
 *
 * The claim this file defends: the CLI and the HTML page do not merely behave
 * similarly, they execute the SAME code over the SAME data. Two checks enforce
 * that from different directions:
 *
 *   1. Byte identity — the module sources embedded in the page are character
 *      for character the files in src/. A divergent copy fails immediately.
 *   2. Behavioural identity — the page's modules are reconstructed inside a VM
 *      from the built HTML, then real queries are run through both that
 *      instance and the Node one, and the results are diffed.
 *
 * Check 2 is the one that matters. Byte identity could be satisfied by a page
 * that never calls the module; running the page's own instance proves the code
 * embedded in the artefact actually produces the answers users see.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { build } = require('../src/build');
const { buildHtml, compactPayload } = require('../src/build-html');
const nodeEngine = require('../src/engine');
const { rehydrate } = require('../src/rehydrate');

const ROOT = path.resolve(__dirname, '..');
const INLINED_MODULES = ['schema.js', 'engine.js', 'rehydrate.js', 'url-state.js'];

/** Build once and share across tests — the real catalogue, not a fixture. */
const catalogue = build({ now: '2026-09-13' });
const html = buildHtml(catalogue);

/**
 * Reconstruct the page's module graph inside a VM, without executing the view
 * layer (which needs a DOM). This deliberately uses the HTML's OWN text as the
 * source of the modules and of the data, so nothing is smuggled in from src/.
 */
function pageRuntime() {
  // Pull the embedded payload straight out of the artefact.
  const payloadMatch = html.match(/var CATALOGUE = (\{[\s\S]*?\});\n/);
  assert.ok(payloadMatch, 'could not locate the embedded CATALOGUE in the built page');

  // Pull each module body out of its define() wrapper in the artefact.
  const sources = {};
  for (const file of INLINED_MODULES) {
    const name = './' + file.replace(/\.js$/, '');
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      "define\\('" + escaped + "', function\\(module, exports, require\\)\\{\\n([\\s\\S]*?)\\n  \\}\\);",
      'm'
    );
    const found = html.match(pattern);
    assert.ok(found, 'could not locate the inlined module ' + name + ' in the built page');
    sources[name] = found[1];
  }

  const sandbox = { console };
  vm.createContext(sandbox);

  const bootstrap = `
    var registry = {}, cache = {};
    function define(name, factory){ registry[name] = factory; }
    function require(name){
      if (cache[name]) return cache[name].exports;
      var factory = registry[name];
      if (!factory) throw new Error('module not found: ' + name);
      var module = { exports: {} };
      cache[name] = module;
      factory(module, module.exports, require);
      return module.exports;
    }
  `;
  vm.runInContext(bootstrap, sandbox);

  for (const name of Object.keys(sources)) {
    vm.runInContext(
      'define(' + JSON.stringify(name) + ', function(module, exports, require){\n' +
        sources[name] + '\n});',
      sandbox
    );
  }

  vm.runInContext('var CATALOGUE = ' + payloadMatch[1] + ';', sandbox);
  vm.runInContext("require('./rehydrate').rehydrate(CATALOGUE);", sandbox);
  vm.runInContext("var BEV = require('./engine'); var INDEX = BEV.buildIndex(CATALOGUE);", sandbox);

  return {
    run(expression) {
      return JSON.parse(vm.runInContext('JSON.stringify(' + expression + ')', sandbox));
    },
  };
}

const page = pageRuntime();
const nodeIndex = nodeEngine.buildIndex(catalogue);

/* ------------------------------------------------------------------ *
 * 1. Byte identity
 * ------------------------------------------------------------------ */

test('the page inlines src modules verbatim, byte for byte', () => {
  for (const file of INLINED_MODULES) {
    const source = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    assert.ok(
      html.includes(source),
      file + ' is not present in the built page byte-for-byte — the page has a divergent copy'
    );
  }
});

test('the page contains no second implementation of the query verbs', () => {
  // The view may CALL these; it must not DEFINE them.
  const viewOnly = html.slice(html.indexOf("var BEV = require('./engine');"));
  for (const verb of ['function query(', 'function compare(', 'function buildIndex(', 'function formatValue(']) {
    assert.ok(
      !viewOnly.includes(verb),
      'the view layer defines ' + verb + ' — query logic belongs in engine.js only'
    );
  }
});

/* ------------------------------------------------------------------ *
 * 2. Behavioural identity
 * ------------------------------------------------------------------ */

test('both surfaces index the same number of records', () => {
  assert.strictEqual(page.run('INDEX.size'), nodeIndex.size);
  assert.strictEqual(page.run('INDEX.size'), catalogue.records.length);
});

/** Queries chosen to exercise every branch of the engine against real data. */
const QUERIES = [
  {},
  { q: 'kia' },
  { q: 'ioniq 5' },
  { q: 'model' },
  { q: 'zzzzz-no-such-vehicle' },
  { facets: { brand: ['Tesla'] } },
  { facets: { brand: ['BYD', 'Kia'], drive: ['AWD'] } },
  { facets: { availability: ['runout'] } },
  { facets: { v2l: ['yes'] } },
  { facets: { bodyType: ['van', 'ute'] } },
  { ranges: { priceAud: { max: 50000 } } },
  { ranges: { priceAud: { min: 100000 } } },
  { ranges: { rangeKm: { min: 400, max: 550 } } },
  { ranges: { batteryUsableKwh: { min: 80 } } },
  { sort: 'priceAud', direction: 'asc' },
  { sort: 'priceAud', direction: 'desc' },
  { sort: 'rangeKm', direction: 'desc' },
  { sort: 'zeroTo100s', direction: 'asc' },
  { sort: 'dcChargeKw', direction: 'desc' },
  { sort: 'seats', direction: 'desc' },
  { q: 'suv', facets: { drive: ['AWD'] }, ranges: { priceAud: { max: 90000 } }, sort: 'rangeKm', direction: 'desc' },
  { limit: 10, offset: 5 },
  { limit: 3, offset: 0, sort: 'powerKw', direction: 'desc' },
];

test('every query returns identical results on both surfaces', () => {
  for (const spec of QUERIES) {
    const fromNode = nodeEngine.query(nodeIndex, spec);
    const fromPage = page.run('BEV.query(INDEX, ' + JSON.stringify(spec) + ')');

    const label = JSON.stringify(spec);
    assert.strictEqual(fromPage.total, fromNode.total, 'total differs for ' + label);
    assert.deepStrictEqual(
      fromPage.records.map((r) => r.id),
      fromNode.records.map((r) => r.id),
      'result order or membership differs for ' + label
    );
  }
});

test('the query set actually exercises the data, not just empty results', () => {
  const totals = QUERIES.map((spec) => nodeEngine.query(nodeIndex, spec).total);
  const nonEmpty = totals.filter((t) => t > 0).length;
  assert.ok(nonEmpty >= QUERIES.length - 1, 'too many queries return nothing to be a real test');
  assert.ok(Math.max.apply(null, totals) > 100, 'expected at least one broad query');
});

test('facet counts are identical on both surfaces', () => {
  const fromNode = nodeEngine.facets(nodeIndex);
  const fromPage = page.run('BEV.facets(INDEX)');
  assert.deepStrictEqual(fromPage, fromNode);
});

test('comparison tables are identical on both surfaces', () => {
  const ids = catalogue.records.slice(0, 4).map((r) => r.id);
  const fromNode = nodeEngine.compare(nodeIndex, ids);
  const fromPage = page.run('BEV.compare(INDEX, ' + JSON.stringify(ids) + ')');
  assert.deepStrictEqual(
    fromPage.rows.map((r) => ({ key: r.key, differs: r.differs, missing: r.missing })),
    fromNode.rows.map((r) => ({ key: r.key, differs: r.differs, missing: r.missing }))
  );
  assert.deepStrictEqual(
    fromPage.vehicles.map((v) => v.id),
    fromNode.vehicles.map((v) => v.id)
  );
});

test('value formatting is identical on both surfaces for every populated field', () => {
  const sample = catalogue.records.slice(0, 40);
  for (const record of sample) {
    for (const field of catalogue.fields) {
      const fromNode = nodeEngine.formatValue(field.key, record[field.key]);
      const fromPage = page.run(
        'BEV.formatValue(' + JSON.stringify(field.key) + ', ' + JSON.stringify(record[field.key] === undefined ? null : record[field.key]) + ')'
      );
      assert.strictEqual(fromPage, fromNode,
        'formatting differs for ' + record.id + '.' + field.key);
    }
  }
});

/* ------------------------------------------------------------------ *
 * Payload round trip
 * ------------------------------------------------------------------ */

test('compaction then rehydration reproduces the reconciled records exactly', () => {
  const original = JSON.parse(JSON.stringify(catalogue.records));
  const packed = compactPayload(JSON.parse(JSON.stringify(catalogue)), catalogue.meta);
  const expanded = rehydrate(packed).records;

  assert.strictEqual(expanded.length, original.length);
  for (let i = 0; i < original.length; i += 1) {
    assert.deepStrictEqual(expanded[i], original[i],
      'record ' + original[i].id + ' did not survive the compaction round trip');
  }
});

test('the page carries full provenance for every record, not a lossy summary', () => {
  const fromPage = page.run('CATALOGUE.records.map(function(r){ return Object.keys(r.provenance||{}).length; })');
  const fromNode = catalogue.records.map((r) => Object.keys(r.provenance || {}).length);
  assert.deepStrictEqual(fromPage, fromNode);
  assert.ok(fromNode.reduce((a, b) => a + b, 0) > 1000, 'expected substantial provenance data');
});

test('interning actually shrinks the payload it is there to shrink', () => {
  const naive = JSON.stringify({ records: catalogue.records }).length;
  const packed = JSON.stringify(compactPayload(JSON.parse(JSON.stringify(catalogue)), catalogue.meta)).length;
  assert.ok(packed < naive * 0.6,
    'interning saved only ' + Math.round((1 - packed / naive) * 100) + '% — check the encoder');
});
