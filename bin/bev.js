#!/usr/bin/env node
'use strict';

/**
 * bev — command line interface to the Australian BEV catalogue.
 *
 * Exit codes (stable contract for CI):
 *   0  success, or validation completed with no errors
 *   1  validation found at least one 'error'-severity finding
 *   2  usage error — bad flag, unknown command, unknown reporter
 *   3  environment error — catalogue not built, unreadable sources
 */

const fs = require('fs');
const path = require('path');

const { build, writeCatalogue, loadCatalogue, CATALOGUE_PATH, ROOT } = require('../src/build');
const { writeHtml, writeAboutHtml } = require('../src/build-html');
const { validate, DEFAULT_RULES, SEVERITIES } = require('../src/validate');
const { report } = require('../src/reporters');
const { coverage } = require('../src/coverage');
const engine = require('../src/engine');
const schema = require('../src/schema');

const EXIT = { OK: 0, LINT: 1, USAGE: 2, ENV: 3 };

class UsageError extends Error {
  constructor(message) { super(message); this.code = 'EUSAGE'; }
}

/* ------------------------------------------------------------------ *
 * Argument parsing
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        out.flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        out.flags[body] = argv[i + 1];
        i += 1;
      } else {
        out.flags[body] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const short = { q: 'query', s: 'sort', l: 'limit', f: 'format', h: 'help' };
      const name = short[arg.slice(1)] || arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        out.flags[name] = argv[i + 1];
        i += 1;
      } else {
        out.flags[name] = true;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

/** `--filter brand=Kia --filter drive=AWD` and `--filter brand=Kia,BYD` */
function collectFilters(raw) {
  const facets = {};
  if (!raw) return facets;
  const items = Array.isArray(raw) ? raw : [raw];
  for (let i = 0; i < items.length; i += 1) {
    const text = String(items[i]);
    const eq = text.indexOf('=');
    if (eq === -1) throw new UsageError('--filter expects key=value, got "' + text + '"');
    const key = text.slice(0, eq).trim();
    if (schema.FACET_FIELDS.indexOf(key) === -1) {
      throw new UsageError(
        'not a filterable field: "' + key + '" (available: ' + schema.FACET_FIELDS.join(', ') + ')'
      );
    }
    const values = text.slice(eq + 1).split(',').map((v) => v.trim()).filter(Boolean);
    facets[key] = (facets[key] || []).concat(values);
  }
  return facets;
}

/** `--min price=40000 --max range=500` — accepts field keys or short aliases. */
const RANGE_ALIASES = {
  price: 'priceAud', range: 'rangeKm', battery: 'batteryUsableKwh',
  power: 'powerKw', dc: 'dcChargeKw', seats: 'seats',
};

function collectRanges(minRaw, maxRaw) {
  const ranges = {};
  function apply(raw, edge) {
    if (!raw) return;
    const items = Array.isArray(raw) ? raw : [raw];
    for (let i = 0; i < items.length; i += 1) {
      const text = String(items[i]);
      const eq = text.indexOf('=');
      if (eq === -1) throw new UsageError('--' + edge + ' expects field=number, got "' + text + '"');
      const alias = text.slice(0, eq).trim();
      const key = RANGE_ALIASES[alias] || alias;
      if (!schema.FIELD_BY_KEY.has(key)) {
        throw new UsageError('unknown field for --' + edge + ': "' + alias + '"');
      }
      const num = Number(text.slice(eq + 1));
      if (!isFinite(num)) throw new UsageError('--' + edge + ' ' + alias + ' needs a number');
      ranges[key] = ranges[key] || {};
      ranges[key][edge] = num;
    }
  }
  apply(minRaw, 'min');
  apply(maxRaw, 'max');
  return ranges;
}

function parseRuleOverrides(raw) {
  const rules = {};
  if (!raw) return rules;
  const items = Array.isArray(raw) ? raw : [raw];
  for (let i = 0; i < items.length; i += 1) {
    const text = String(items[i]);
    const colon = text.lastIndexOf(':');
    if (colon === -1) throw new UsageError('--rule expects id:severity, got "' + text + '"');
    const id = text.slice(0, colon);
    const severity = text.slice(colon + 1);
    if (SEVERITIES.indexOf(severity) === -1) {
      throw new UsageError('severity must be one of ' + SEVERITIES.join('|') + ', got "' + severity + '"');
    }
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_RULES, id)) {
      throw new UsageError('unknown rule "' + id + '" (known: ' + Object.keys(DEFAULT_RULES).join(', ') + ')');
    }
    rules[id] = severity;
  }
  return rules;
}

/* ------------------------------------------------------------------ *
 * Output helpers
 * ------------------------------------------------------------------ */

const colour = process.stdout.isTTY && !process.env.NO_COLOR;

function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}
function padLeft(text, width) {
  const value = String(text);
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

function printTable(rows, columns) {
  if (!rows.length) { console.log('no matching vehicles'); return; }
  const widths = columns.map((col) => {
    let width = col.label.length;
    for (let i = 0; i < rows.length; i += 1) {
      const text = col.render(rows[i]);
      if (text.length > width) width = text.length;
    }
    return Math.min(width, col.max || 48);
  });

  const header = columns.map((col, i) => (col.right ? padLeft(col.label, widths[i]) : pad(col.label, widths[i]))).join('  ');
  console.log(colour ? '[1m' + header + '[0m' : header);
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));

  for (let r = 0; r < rows.length; r += 1) {
    console.log(columns.map((col, i) => {
      let text = col.render(rows[r]);
      if (text.length > widths[i]) text = text.slice(0, widths[i] - 1) + '…';
      return col.right ? padLeft(text, widths[i]) : pad(text, widths[i]);
    }).join('  '));
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

const HELP = `bev — Australian battery-electric vehicle directory

Usage
  bev build [--out <file>] [--html <file>] [--now <YYYY-MM-DD>]
  bev list [-q <text>] [--filter key=value]... [--min f=n] [--max f=n]
           [-s <field>] [--desc] [-l <n>] [-f pretty|json|csv]
  bev show <id|search text>
  bev compare <id> <id> [<id>...] [--only-diff] [-f pretty|json]
  bev validate [--rule id:off|warn|error]... [-f pretty|json|ci|sarif]
               [--max-warnings <n>] [--now <YYYY-MM-DD>]
  bev coverage [-f pretty|json]
  bev brands [-f pretty|json]
  bev fields
  bev sources [--brand <slug>]

Exit codes
  0 success   1 validation errors   2 usage error   3 environment error

Examples
  bev list --filter brand=Kia -s rangeKm --desc
  bev list --max price=60000 --min range=400 -f json
  bev compare kia__ev5__air-standard-range byd__atto-3-evo__premium
  bev validate -f sarif > bev.sarif
`;

function cmdBuild(args) {
  const now = typeof args.flags.now === 'string' ? args.flags.now : undefined;
  const catalogue = build({ now });

  const catalogueOut = typeof args.flags.out === 'string'
    ? path.resolve(args.flags.out)
    : CATALOGUE_PATH;
  writeCatalogue(catalogue, catalogueOut);

  const htmlOut = typeof args.flags.html === 'string'
    ? path.resolve(args.flags.html)
    : path.join(ROOT, 'dist', 'index.html');
  writeHtml(catalogue, htmlOut);

  const aboutOut = path.join(path.dirname(htmlOut), 'about.html');
  writeAboutHtml(catalogue, aboutOut);

  const totals = catalogue.coverage.totals;
  console.log('built catalogue: ' + path.relative(process.cwd(), catalogueOut));
  console.log('built html page: ' + path.relative(process.cwd(), htmlOut) +
    ' (' + Math.round(fs.statSync(htmlOut).size / 1024) + ' KB)');
  console.log('built about page: ' + path.relative(process.cwd(), aboutOut) +
    ' (' + Math.round(fs.statSync(aboutOut).size / 1024) + ' KB)');
  console.log(
    totals.variants + ' variants · ' + totals.brandsWithVariants + ' brands with BEVs · ' +
    totals.brandsChecked + ' brands checked · core fields ' + totals.coreCompleteness + '% populated'
  );
  if (catalogue.problems.length) {
    console.log('WARNING: ' + catalogue.problems.length + ' source file problem(s) — run `bev validate`');
  }
  return EXIT.OK;
}

function resolveQuery(args) {
  return {
    q: typeof args.flags.query === 'string' ? args.flags.query : '',
    facets: collectFilters(args.flags.filter),
    ranges: collectRanges(args.flags.min, args.flags.max),
    sort: typeof args.flags.sort === 'string' ? args.flags.sort : 'name',
    direction: args.flags.desc ? 'desc' : 'asc',
    limit: args.flags.limit ? Number(args.flags.limit) : null,
  };
}

function cmdList(args) {
  const catalogue = loadCatalogue();
  const index = engine.buildIndex(catalogue);
  const spec = resolveQuery(args);

  if (spec.sort !== 'name' && schema.SORTABLE_FIELDS.indexOf(spec.sort) === -1) {
    throw new UsageError(
      'not a sortable field: "' + spec.sort + '" (available: name, ' + schema.SORTABLE_FIELDS.join(', ') + ')'
    );
  }

  const result = engine.query(index, spec);
  const format = typeof args.flags.format === 'string' ? args.flags.format : 'pretty';

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return EXIT.OK;
  }

  if (format === 'csv') {
    const keys = ['id'].concat(schema.FIELDS.map((f) => f.key));
    console.log(keys.join(','));
    for (let i = 0; i < result.records.length; i += 1) {
      const record = result.records[i];
      console.log(keys.map((key) => {
        const value = record[key];
        if (value == null) return '';
        const text = String(value);
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(','));
    }
    return EXIT.OK;
  }

  if (format !== 'pretty') throw new UsageError('unknown --format "' + format + '" (pretty|json|csv)');

  printTable(result.records, [
    { label: 'BRAND', render: (r) => r.brand || '', max: 16 },
    { label: 'MODEL', render: (r) => r.model || '', max: 22 },
    { label: 'VARIANT', render: (r) => r.variant || '', max: 30 },
    { label: 'kWh', right: true, render: (r) => (r.batteryUsableKwh == null ? '—' : String(r.batteryUsableKwh)) },
    { label: 'RANGE', right: true, render: (r) => (r.rangeKm == null ? '—' : r.rangeKm + (r.rangeCycle && r.rangeCycle !== 'WLTP' ? '*' : '')) },
    { label: 'DC kW', right: true, render: (r) => (r.dcChargeKw == null ? '—' : String(r.dcChargeKw)) },
    { label: 'kW', right: true, render: (r) => (r.powerKw == null ? '—' : String(r.powerKw)) },
    { label: 'PRICE', right: true, render: (r) => (r.priceAud == null ? '—' : engine.formatValue('priceAud', r.priceAud)) },
    { label: 'AVAIL', render: (r) => r.availability || '' },
  ]);

  console.log('');
  console.log(result.total + ' of ' + index.size + ' variants' +
    (result.records.length < result.total ? ' (showing ' + result.records.length + ')' : ''));
  console.log('— = not published by the source.  * = range quoted on a non-WLTP cycle.');
  return EXIT.OK;
}

function cmdShow(args) {
  const needle = args._.slice(1).join(' ');
  if (!needle) throw new UsageError('show needs an id or search text');

  const catalogue = loadCatalogue();
  const index = engine.buildIndex(catalogue);

  let record = engine.byId(index, needle);
  if (!record) {
    const hits = engine.query(index, { q: needle, limit: 5 });
    if (!hits.total) { console.log('no vehicle matches "' + needle + '"'); return EXIT.OK; }
    if (hits.total > 1) {
      console.log(hits.total + ' vehicles match "' + needle + '":');
      for (let i = 0; i < hits.records.length; i += 1) {
        console.log('  ' + hits.records[i].id + '  ' + engine.displayName(hits.records[i]));
      }
      if (hits.total > hits.records.length) console.log('  …');
      console.log('\nPass a full id to see one vehicle.');
      return EXIT.OK;
    }
    record = hits.records[0];
  }

  if (args.flags.format === 'json') {
    console.log(JSON.stringify(record, null, 2));
    return EXIT.OK;
  }

  console.log(colour ? '[1m' + engine.displayName(record) + '[0m' : engine.displayName(record));
  console.log('id: ' + record.id);
  console.log('');

  const provenance = record.provenance || {};
  for (let i = 0; i < schema.FIELDS.length; i += 1) {
    const field = schema.FIELDS[i];
    if (schema.IDENTITY_FIELDS.indexOf(field.key) !== -1) continue;
    const value = engine.formatValue(field.key, record[field.key]);
    const source = provenance[field.key];
    const tail = source
      ? '  [' + source.sourceKind + (source.confidence !== 'high' ? '/' + source.confidence : '') + ']'
      : '';
    console.log('  ' + pad(field.label, 18) + padLeft(value, 16) + (colour ? '[2m' + tail + '[0m' : tail));
  }

  console.log('');
  console.log('  ' + pad('Efficiency (derived)', 18) + padLeft(engine.formatValue('consumptionWhPerKm', record.efficiencyWhPerKm), 16));
  console.log('  ' + pad('AUD per km range', 18) + padLeft(record.dollarsPerKmRange == null ? '—' : '$' + record.dollarsPerKmRange, 16));

  const urls = [];
  const keys = Object.keys(provenance);
  for (let i = 0; i < keys.length; i += 1) {
    const url = provenance[keys[i]].url;
    if (url && urls.indexOf(url) === -1) urls.push(url);
  }
  if (urls.length) {
    console.log('\nSources');
    for (let i = 0; i < urls.length; i += 1) console.log('  ' + urls[i]);
  }
  if (record.brandNotes) console.log('\nBrand note\n  ' + record.brandNotes);
  return EXIT.OK;
}

function cmdCompare(args) {
  const ids = args._.slice(1);
  if (ids.length < 2) throw new UsageError('compare needs at least two vehicle ids');

  const catalogue = loadCatalogue();
  const index = engine.buildIndex(catalogue);
  const result = engine.compare(index, ids);

  const missing = ids.filter((id) => !engine.byId(index, id));
  if (missing.length) throw new UsageError('unknown vehicle id(s): ' + missing.join(', '));

  if (args.flags.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return EXIT.OK;
  }

  const onlyDiff = Boolean(args.flags['only-diff']);
  const rows = result.rows.filter((row) => {
    if (schema.IDENTITY_FIELDS.indexOf(row.key) !== -1) return false;
    return onlyDiff ? row.differs : true;
  });

  const columns = [{ label: 'FIELD', render: (row) => row.label, max: 20 }];
  for (let v = 0; v < result.vehicles.length; v += 1) {
    const vehicle = result.vehicles[v];
    columns.push({
      label: (vehicle.model + ' ' + vehicle.variant).slice(0, 24),
      right: true,
      max: 26,
      render: (row) => engine.formatValue(row.key, row.values[v]),
    });
  }

  printTable(rows, columns);
  console.log('');
  console.log(result.vehicles.length + ' vehicles · ' +
    result.rows.filter((r) => r.differs).length + ' fields differ' +
    (onlyDiff ? ' (showing differences only)' : ''));
  return EXIT.OK;
}

function cmdValidate(args) {
  const catalogue = loadCatalogue();
  const rules = parseRuleOverrides(args.flags.rule);
  const now = typeof args.flags.now === 'string' ? args.flags.now : undefined;

  const result = validate(catalogue, { rules, now });
  const format = typeof args.flags.format === 'string' ? args.flags.format : 'pretty';

  console.log(report(format, result, { colour }));

  const maxWarnings = args.flags['max-warnings'] != null ? Number(args.flags['max-warnings']) : null;
  if (maxWarnings != null && isFinite(maxWarnings) && result.warningCount > maxWarnings) {
    console.error('\n' + result.warningCount + ' warnings exceed --max-warnings ' + maxWarnings);
    return EXIT.LINT;
  }
  return result.errorCount ? EXIT.LINT : EXIT.OK;
}

function cmdCoverage(args) {
  const catalogue = loadCatalogue();
  const report_ = catalogue.coverage || coverage(catalogue);

  if (args.flags.format === 'json') {
    console.log(JSON.stringify(report_, null, 2));
    return EXIT.OK;
  }

  const totals = report_.totals;
  console.log(colour ? '[1mCoverage[0m' : 'Coverage');
  console.log('  variants            ' + totals.variants);
  console.log('  brands with BEVs    ' + totals.brandsWithVariants);
  console.log('  brands checked      ' + totals.brandsChecked +
    ' (' + totals.brandsWithNoBev + ' with no BEV on sale)');
  console.log('  core completeness   ' + totals.coreCompleteness + '%');
  console.log('  source conflicts    ' + totals.conflicts);
  console.log('  snapshots           ' + report_.freshness.oldestSnapshot + ' … ' + report_.freshness.newestSnapshot);

  console.log('\nAvailability');
  const availabilityKeys = Object.keys(report_.availability).sort();
  for (let i = 0; i < availabilityKeys.length; i += 1) {
    console.log('  ' + pad(availabilityKeys[i], 20) + padLeft(report_.availability[availabilityKeys[i]], 5));
  }

  console.log('\nProvenance mix (populated fields by source kind)');
  const mixKeys = Object.keys(report_.provenanceMix).sort((a, b) => report_.provenanceMix[b] - report_.provenanceMix[a]);
  for (let i = 0; i < mixKeys.length; i += 1) {
    console.log('  ' + pad(mixKeys[i], 20) + padLeft(report_.provenanceMix[mixKeys[i]], 6));
  }

  console.log('\nField completeness');
  printTable(report_.byField, [
    { label: 'FIELD', render: (f) => f.label, max: 22 },
    { label: 'CORE', render: (f) => (f.core ? 'yes' : ''), max: 4 },
    { label: 'PRESENT', right: true, render: (f) => String(f.present) },
    { label: 'MISSING', right: true, render: (f) => String(f.missing) },
    { label: '%', right: true, render: (f) => String(f.completeness) },
    { label: 'LOW CONF', right: true, render: (f) => String(f.lowConfidence) },
  ]);

  console.log('\nPer brand');
  printTable(report_.byBrand, [
    { label: 'BRAND', render: (b) => b.brand, max: 20 },
    { label: 'VARIANTS', right: true, render: (b) => String(b.variants) },
    { label: 'CORE %', right: true, render: (b) => String(b.coreCompleteness) },
    { label: 'LOW CONF', right: true, render: (b) => String(b.lowConfidenceFields) },
    { label: 'FETCHED', render: (b) => b.fetchedAt || '—' },
  ]);

  if (report_.emptyBrands.length) {
    console.log('\nChecked, no BEV on sale');
    for (let i = 0; i < report_.emptyBrands.length; i += 1) {
      console.log('  ' + report_.emptyBrands[i].brand);
    }
  }
  return EXIT.OK;
}

function cmdBrands(args) {
  const catalogue = loadCatalogue();
  if (args.flags.format === 'json') {
    console.log(JSON.stringify(catalogue.brands, null, 2));
    return EXIT.OK;
  }
  printTable(catalogue.brands, [
    { label: 'BRAND', render: (b) => b.brand, max: 20 },
    { label: 'VARIANTS', right: true, render: (b) => String(b.variantCount) },
    { label: 'FETCHED', render: (b) => b.fetchedAt || '—' },
    { label: 'PUBLISHER', render: (b) => b.publisher || '—', max: 30 },
  ]);
  return EXIT.OK;
}

function cmdFields() {
  printTable(schema.FIELDS, [
    { label: 'FIELD', render: (f) => f.key, max: 22 },
    { label: 'TYPE', render: (f) => f.type },
    { label: 'UNIT', render: (f) => f.unit || '' },
    { label: 'CORE', render: (f) => (f.core ? 'yes' : '') },
    { label: 'SORT', render: (f) => (f.sortable ? 'yes' : '') },
    { label: 'FILTER', render: (f) => (f.facet ? 'yes' : '') },
    { label: 'RANGE', render: (f) => (f.min != null ? f.min + '–' + f.max : '') },
  ]);
  return EXIT.OK;
}

function cmdSources(args) {
  const catalogue = loadCatalogue();
  const wanted = typeof args.flags.brand === 'string' ? args.flags.brand.toLowerCase() : null;
  const brands = catalogue.brands.filter((b) => !wanted || b.brandSlug === wanted);
  if (!brands.length) throw new UsageError('no brand matches "' + wanted + '"');

  for (let i = 0; i < brands.length; i += 1) {
    const brand = brands[i];
    console.log((colour ? '[1m' : '') + brand.brand + (colour ? '[0m' : '') +
      '  (' + brand.variantCount + ' variants, fetched ' + (brand.fetchedAt || '—') + ')');
    console.log('  publisher: ' + (brand.publisher || '—'));
    console.log('  licence:   ' + (brand.licence || '—'));
    for (let u = 0; u < brand.sourceUrls.length; u += 1) console.log('  ' + brand.sourceUrls[u]);
    if (brand.notes) console.log('  note: ' + brand.notes);
    console.log('');
  }
  return EXIT.OK;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const COMMANDS = {
  build: cmdBuild,
  list: cmdList,
  show: cmdShow,
  compare: cmdCompare,
  validate: cmdValidate,
  coverage: cmdCoverage,
  brands: cmdBrands,
  fields: cmdFields,
  sources: cmdSources,
};

function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];

  if (!command || args.flags.help || command === 'help') {
    console.log(HELP);
    return command || args.flags.help ? EXIT.OK : EXIT.USAGE;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error('unknown command: ' + command);
    console.error('expected one of: ' + Object.keys(COMMANDS).join(', '));
    return EXIT.USAGE;
  }

  return handler(args);
}

if (require.main === module) {
  let code;
  try {
    code = main(process.argv.slice(2));
  } catch (err) {
    if (err && (err.code === 'EUSAGE')) {
      console.error('usage error: ' + err.message);
      code = EXIT.USAGE;
    } else if (err && err.code === 'ENOCATALOGUE') {
      console.error(err.message);
      code = EXIT.ENV;
    } else if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) {
      console.error('environment error: ' + err.message);
      code = EXIT.ENV;
    } else {
      throw err;
    }
  }
  // Set exitCode rather than calling process.exit(): a large report written to
  // a pipe (SARIF, JSON, CSV) is still being flushed asynchronously when the
  // command returns, and process.exit() truncates it mid-write. Letting the
  // event loop drain naturally guarantees the caller receives whole output.
  process.exitCode = code;
}

module.exports = { main, parseArgs, collectFilters, collectRanges, parseRuleOverrides, EXIT, HELP };
