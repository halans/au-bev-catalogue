'use strict';

/**
 * Output reporters for validation findings.
 *
 *   pretty  human-readable, grouped by vehicle, colourised when on a TTY
 *   json    machine-readable, stable shape
 *   ci      GitHub Actions workflow commands (::error file=...)
 *   sarif   SARIF 2.1.0 for code-scanning dashboards
 *
 * All four consume the identical findings array, so a rule added to the
 * validator shows up in every reporter without further work.
 */

const { DEFAULT_RULES } = require('./validate');

const ANSI = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  red: '[31m',
  yellow: '[33m',
  green: '[32m',
  cyan: '[36m',
};

function paint(enabled, colour, text) {
  if (!enabled) return text;
  return ANSI[colour] + text + ANSI.reset;
}

/* ------------------------------------------------------------------ */

function pretty(result, options) {
  const opts = options || {};
  const colour = Boolean(opts.colour);
  const lines = [];
  const findings = result.findings || [];

  if (!findings.length) {
    lines.push(paint(colour, 'green', '✓ no findings'));
    return lines.join('\n');
  }

  const grouped = new Map();
  for (let i = 0; i < findings.length; i += 1) {
    const finding = findings[i];
    const key = finding.id || finding.file || '(catalogue)';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(finding);
  }

  const keys = Array.from(grouped.keys()).sort();
  for (let k = 0; k < keys.length; k += 1) {
    const key = keys[k];
    lines.push(paint(colour, 'bold', key));
    const group = grouped.get(key);
    for (let i = 0; i < group.length; i += 1) {
      const finding = group[i];
      const tag = finding.severity === 'error'
        ? paint(colour, 'red', 'error')
        : paint(colour, 'yellow', 'warn ');
      const rule = paint(colour, 'dim', finding.rule);
      lines.push('  ' + tag + '  ' + finding.message + '  ' + rule);
    }
    lines.push('');
  }

  const summary = result.errorCount + ' error(s), ' + result.warningCount + ' warning(s)';
  lines.push(paint(colour, result.errorCount ? 'red' : 'yellow', summary));
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */

function json(result) {
  return JSON.stringify({
    ok: result.ok,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    findings: result.findings,
  }, null, 2);
}

/* ------------------------------------------------------------------ */

function ci(result) {
  const lines = [];
  const findings = result.findings || [];
  for (let i = 0; i < findings.length; i += 1) {
    const finding = findings[i];
    const level = finding.severity === 'error' ? 'error' : 'warning';
    const title = finding.rule;
    const location = finding.file || finding.id || 'catalogue';
    lines.push(
      '::' + level + ' title=' + title + '::' + location + ': ' + finding.message
    );
  }
  lines.push(
    '::notice title=bev-validate::' + result.errorCount + ' error(s), ' +
    result.warningCount + ' warning(s)'
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */

function sarif(result) {
  const findings = result.findings || [];
  const ruleIds = Object.keys(DEFAULT_RULES);

  const document = {
    version: '2.1.0',
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'bev-validate',
          informationUri: 'https://github.com/localhost/au-bev-catalogue',
          rules: ruleIds.map((id) => ({
            id,
            shortDescription: { text: id.replace(/-/g, ' ') },
            defaultConfiguration: {
              level: DEFAULT_RULES[id] === 'error' ? 'error' : 'warning',
            },
          })),
        },
      },
      results: findings.map((finding) => ({
        ruleId: finding.rule,
        level: finding.severity === 'error' ? 'error' : 'warning',
        message: { text: finding.message },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: 'data/sources/' + (finding.file || (finding.id ? finding.id.split('__')[0] + '.json' : 'catalogue.json')),
            },
          },
          logicalLocations: finding.id
            ? [{ name: finding.id, kind: 'member' }]
            : undefined,
        }],
        properties: { field: finding.field || null },
      })),
    }],
  };

  return JSON.stringify(document, null, 2);
}

/* ------------------------------------------------------------------ */

const REPORTERS = { pretty, json, ci, sarif };

function report(name, result, options) {
  const reporter = REPORTERS[name];
  if (!reporter) {
    const err = new Error('unknown reporter "' + name + '" (expected: ' + Object.keys(REPORTERS).join(', ') + ')');
    err.code = 'EUSAGE';
    throw err;
  }
  return reporter(result, options);
}

module.exports = { report, REPORTERS, pretty, json, ci, sarif, ANSI };
