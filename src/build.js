'use strict';

/**
 * Catalogue build: snapshots -> reconciled catalogue.json
 *
 * The built catalogue is the single artefact every surface consumes. The CLI
 * reads it, the HTML page embeds it, the JSON bundle IS it. Nothing downstream
 * re-reads the raw snapshots, so there is exactly one reconciliation result in
 * play at any time.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const snapshotAdapter = require('./adapters/snapshot');
const { reconcile } = require('./reconcile');
const { coverage } = require('./coverage');
const schema = require('./schema');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_DIR = path.join(ROOT, 'data', 'sources');
const CATALOGUE_PATH = path.join(ROOT, 'data', 'catalogue.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Checksums of every raw snapshot, so a rebuild can prove its inputs. */
function snapshotChecksums(dir) {
  const out = {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (let i = 0; i < files.length; i += 1) {
    out[files[i]] = sha256(fs.readFileSync(path.join(dir, files[i]), 'utf8'));
  }
  return out;
}

/**
 * @param {object} [options]
 * @param {string} [options.sourcesDir]
 * @param {string} [options.now] ISO date for deterministic builds in tests
 */
function build(options) {
  const opts = options || {};
  const sourcesDir = opts.sourcesDir || SOURCES_DIR;
  const now = opts.now || new Date().toISOString().slice(0, 10);

  const loaded = snapshotAdapter.load(sourcesDir);
  const reconciled = reconcile([loaded]);
  const report = coverage(reconciled, { now });

  const catalogue = {
    meta: {
      name: 'Australian Battery-Electric Vehicle Directory',
      builtAt: now,
      schemaVersion: 1,
      recordCount: reconciled.records.length,
      brandsChecked: reconciled.brands.length,
      adapters: [loaded.adapter],
      sourceFileCount: loaded.fileCount,
      snapshotChecksums: snapshotChecksums(sourcesDir),
      licences: schema.SOURCE_LICENCES,
      sourcePrecedence: schema.SOURCE_PRECEDENCE,
      disclaimer:
        'Specifications are restated from the publishers named in each record\'s provenance. ' +
        'Prices are indicative and exclude on-road costs unless the record says otherwise. ' +
        'Range figures are only comparable within the same test cycle.',
      gapSweep: reconciled.meta['gap-sweep'] || null,
    },
    fields: schema.FIELDS,
    derivedFields: schema.DERIVED_FIELDS,
    enums: schema.ENUMS,
    records: reconciled.records,
    brands: reconciled.brands,
    conflicts: reconciled.conflicts,
    duplicates: reconciled.duplicates,
    problems: reconciled.problems,
    coverage: report,
  };

  return catalogue;
}

function writeCatalogue(catalogue, target) {
  const dest = target || CATALOGUE_PATH;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');
  return dest;
}

function loadCatalogue(source) {
  const src = source || CATALOGUE_PATH;
  if (!fs.existsSync(src)) {
    const err = new Error(
      'catalogue not built: ' + src + '\nRun `npm run build` (or `bev build`) first.'
    );
    err.code = 'ENOCATALOGUE';
    throw err;
  }
  return JSON.parse(fs.readFileSync(src, 'utf8'));
}

module.exports = {
  build,
  writeCatalogue,
  loadCatalogue,
  sha256,
  ROOT,
  SOURCES_DIR,
  CATALOGUE_PATH,
};
