'use strict';

/**
 * Library entry point.
 *
 * Consumers embedding the catalogue in their own code should use this rather
 * than reaching into individual modules, so the internal layout can change
 * without breaking them.
 *
 *   const bev = require('au-bev-catalogue');
 *   const catalogue = bev.loadCatalogue();
 *   const index = bev.buildIndex(catalogue);
 *   const cheap = bev.query(index, { ranges: { priceAud: { max: 50000 } } });
 */

const schema = require('./schema');
const engine = require('./engine');
const reconcile = require('./reconcile');
const validate = require('./validate');
const coverage = require('./coverage');
const build = require('./build');
const buildHtml = require('./build-html');
const reporters = require('./reporters');
const snapshotAdapter = require('./adapters/snapshot');

module.exports = {
  // schema
  FIELDS: schema.FIELDS,
  ENUMS: schema.ENUMS,
  CORE_FIELDS: schema.CORE_FIELDS,
  SORTABLE_FIELDS: schema.SORTABLE_FIELDS,
  FACET_FIELDS: schema.FACET_FIELDS,
  identityKey: schema.identityKey,
  slug: schema.slug,

  // query engine
  buildIndex: engine.buildIndex,
  query: engine.query,
  facets: engine.facets,
  byId: engine.byId,
  compare: engine.compare,
  formatValue: engine.formatValue,
  displayName: engine.displayName,

  // pipeline
  loadSnapshots: snapshotAdapter.load,
  reconcile: reconcile.reconcile,
  validate: validate.validate,
  coverage: coverage.coverage,
  build: build.build,
  loadCatalogue: build.loadCatalogue,
  writeCatalogue: build.writeCatalogue,
  buildHtml: buildHtml.buildHtml,
  writeHtml: buildHtml.writeHtml,
  report: reporters.report,

  // rule metadata
  DEFAULT_RULES: validate.DEFAULT_RULES,
  SEVERITIES: validate.SEVERITIES,
};
