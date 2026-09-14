'use strict';

/**
 * Validation layer.
 *
 * Rules are declared with an id and a default severity, and every severity can
 * be overridden to 'off' | 'warn' | 'error' by config — the same convention as
 * ESLint, so `bev validate --rule missing-core-field:error` behaves the way a
 * developer already expects.
 *
 * Severity drives the process exit code, which is what makes this usable in CI:
 * a warning is information, an error is a broken build.
 */

const schema = require('./schema');

const SEVERITIES = ['off', 'warn', 'error'];

/** Default rule configuration. Override per-run via config. */
const DEFAULT_RULES = {
  'unparseable-source': 'error',
  'duplicate-identity': 'error',
  'enum-out-of-domain': 'error',
  'value-out-of-envelope': 'error',
  'derived-inconsistent': 'error',
  'missing-identity-field': 'error',
  'missing-core-field': 'warn',
  'source-conflict': 'warn',
  'low-confidence-field': 'warn',
  'stale-snapshot': 'warn',
  'price-basis-not-msrp': 'warn',
  'range-cycle-not-wltp': 'warn',
  'no-provenance-url': 'warn',
};

/** A snapshot older than this many days is considered stale. */
const STALE_AFTER_DAYS = 45;

function severityOf(rules, id) {
  const configured = rules && rules[id];
  if (configured && SEVERITIES.indexOf(configured) !== -1) return configured;
  return DEFAULT_RULES[id] || 'off';
}

function daysBetween(aIso, bIso) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * @param {object} catalogue result of reconcile()
 * @param {object} [options]
 * @param {object} [options.rules]  rule id -> 'off'|'warn'|'error'
 * @param {string} [options.now]    ISO date used for staleness, injectable for tests
 * @returns {{findings:Array<object>, errorCount:number, warningCount:number, ok:boolean}}
 */
function validate(catalogue, options) {
  const opts = options || {};
  const rules = opts.rules || {};
  const now = opts.now || new Date().toISOString().slice(0, 10);
  const findings = [];

  function report(id, message, context) {
    const severity = severityOf(rules, id);
    if (severity === 'off') return;
    findings.push(Object.assign({ rule: id, severity, message }, context || {}));
  }

  // --- source-level problems -----------------------------------------
  const problems = catalogue.problems || [];
  for (let i = 0; i < problems.length; i += 1) {
    report('unparseable-source', problems[i].message, { file: problems[i].file });
  }

  const duplicates = catalogue.duplicates || [];
  for (let i = 0; i < duplicates.length; i += 1) {
    report('duplicate-identity', duplicates[i].message, {
      id: duplicates[i].identity,
      detail: duplicates[i].sourceFiles.join(', '),
    });
  }

  const conflicts = catalogue.conflicts || [];
  for (let i = 0; i < conflicts.length; i += 1) {
    const conflict = conflicts[i];
    report(
      'source-conflict',
      'sources disagree on ' + conflict.field + ': kept ' + conflict.chosen.value +
        ' (' + conflict.chosen.sourceKind + ') over ' + conflict.rejected.value +
        ' (' + conflict.rejected.sourceKind + ')',
      { id: conflict.identity, field: conflict.field }
    );
  }

  // --- record-level rules --------------------------------------------
  const records = catalogue.records || [];
  for (let r = 0; r < records.length; r += 1) {
    const record = records[r];
    const provenance = record.provenance || {};

    for (let i = 0; i < schema.IDENTITY_FIELDS.length; i += 1) {
      const key = schema.IDENTITY_FIELDS[i];
      if (schema.isBlank(record[key])) {
        report('missing-identity-field', 'identity field "' + key + '" is empty', {
          id: record.id, field: key,
        });
      }
    }

    for (let f = 0; f < schema.FIELDS.length; f += 1) {
      const field = schema.FIELDS[f];
      const value = record[field.key];

      if (schema.isBlank(value)) {
        if (field.core) {
          report('missing-core-field', 'core field "' + field.key + '" is unknown', {
            id: record.id, field: field.key,
          });
        }
        continue;
      }

      if (field.type === 'enum') {
        const domain = schema.ENUMS[field.enum] || [];
        if (domain.indexOf(value) === -1) {
          report('enum-out-of-domain',
            '"' + value + '" is not a valid ' + field.key + ' (expected one of: ' + domain.join(', ') + ')',
            { id: record.id, field: field.key });
        }
      }

      if (field.type === 'number') {
        const num = Number(value);
        if (!isFinite(num)) {
          report('value-out-of-envelope', field.key + ' is not a finite number: ' + value, {
            id: record.id, field: field.key,
          });
        } else if ((field.min != null && num < field.min) || (field.max != null && num > field.max)) {
          report('value-out-of-envelope',
            field.key + ' = ' + num + ' is outside the plausible range ' +
              field.min + '–' + field.max + ' ' + (field.unit || ''),
            { id: record.id, field: field.key });
        }
      }

      const fieldProvenance = provenance[field.key];
      if (fieldProvenance) {
        if (!fieldProvenance.url) {
          report('no-provenance-url', field.key + ' has no source URL', {
            id: record.id, field: field.key,
          });
        }
        if (fieldProvenance.confidence === 'low') {
          report('low-confidence-field', field.key + ' is flagged low confidence', {
            id: record.id, field: field.key,
          });
        }
        if (fieldProvenance.fetchedAt) {
          const age = daysBetween(fieldProvenance.fetchedAt, now);
          if (age != null && age > STALE_AFTER_DAYS) {
            report('stale-snapshot',
              field.key + ' was fetched ' + age + ' days ago (threshold ' + STALE_AFTER_DAYS + ')',
              { id: record.id, field: field.key });
          }
        }
      }
    }

    // Gross must never be smaller than usable.
    if (record.batteryGrossKwh != null && record.batteryUsableKwh != null &&
        Number(record.batteryGrossKwh) < Number(record.batteryUsableKwh)) {
      report('derived-inconsistent',
        'gross battery (' + record.batteryGrossKwh + ' kWh) is smaller than usable (' +
          record.batteryUsableKwh + ' kWh)',
        { id: record.id, field: 'batteryGrossKwh' });
    }

    // A published consumption figure should roughly agree with battery/range.
    if (record.consumptionWhPerKm != null && record.efficiencyWhPerKm != null) {
      const published = Number(record.consumptionWhPerKm);
      const implied = Number(record.efficiencyWhPerKm);
      if (published > 0 && Math.abs(published - implied) / published > 0.35) {
        report('derived-inconsistent',
          'published consumption ' + published + ' Wh/km disagrees with the ' + implied +
            ' Wh/km implied by battery and range',
          { id: record.id, field: 'consumptionWhPerKm' });
      }
    }

    if (record.priceAud != null && record.priceBasis &&
        !/msrp|before on-road|excl/i.test(String(record.priceBasis))) {
      report('price-basis-not-msrp',
        'price basis is "' + record.priceBasis + '" rather than MSRP before on-road costs',
        { id: record.id, field: 'priceAud' });
    }

    if (record.rangeKm != null && record.rangeCycle && record.rangeCycle !== 'WLTP') {
      report('range-cycle-not-wltp',
        'range is quoted on the ' + record.rangeCycle + ' cycle, which is not comparable to WLTP',
        { id: record.id, field: 'rangeCycle' });
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warn').length;

  return { findings, errorCount, warningCount, ok: errorCount === 0 };
}

module.exports = { validate, DEFAULT_RULES, SEVERITIES, STALE_AFTER_DAYS, severityOf };
