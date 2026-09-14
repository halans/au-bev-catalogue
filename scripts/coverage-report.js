#!/usr/bin/env node
'use strict';

/**
 * Generate docs/COVERAGE.md from the built catalogue.
 *
 * Kept as a script rather than a hand-written document so the numbers can
 * never drift from the data. Run after every `bev build`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalogue.json'), 'utf8'));
const cov = catalogue.coverage;
const t = cov.totals;

const lines = [];
const w = (text) => lines.push(text == null ? '' : text);

w('# Coverage report');
w('');
w('Generated from `data/catalogue.json` on ' + cov.generatedAt +
  '. Regenerate with `node scripts/coverage-report.js` (or read it live via `bev coverage`).');
w('');
w('This file exists because "is the catalogue complete?" is a measurement, not a claim.');
w('');

w('## Totals');
w('');
w('| Metric | Value |');
w('| --- | --- |');
w('| Variants | ' + t.variants + ' |');
w('| Brands with at least one BEV | ' + t.brandsWithVariants + ' |');
w('| Brands checked | ' + t.brandsChecked + ' |');
w('| Brands checked, selling no BEV | ' + t.brandsWithNoBev + ' |');
w('| Populated fields | ' + t.populatedFields + ' |');
w('| Core-field completeness | ' + t.coreCompleteness + '% |');
w('| Recorded source conflicts | ' + t.conflicts + ' |');
w('| Snapshot dates | ' + cov.freshness.oldestSnapshot + ' to ' + cov.freshness.newestSnapshot + ' |');
w('');

w('## Availability mix');
w('');
w('The catalogue includes runout and announced models, not only current order books.');
w('');
Object.keys(cov.availability).sort().forEach((key) => {
  w('- **' + key + '** — ' + cov.availability[key]);
});
w('');

w('## Where the data comes from');
w('');
w('| Source kind | Populated fields | Share |');
w('| --- | --- | --- |');
Object.keys(cov.provenanceMix)
  .sort((a, b) => cov.provenanceMix[b] - cov.provenanceMix[a])
  .forEach((kind) => {
    const count = cov.provenanceMix[kind];
    w('| ' + kind + ' | ' + count + ' | ' +
      (Math.round((count / t.populatedFields) * 1000) / 10) + '% |');
  });
w('');
w('No field in this catalogue comes from an Australian government source. The Green');
w('Vehicle Guide is the only official per-model dataset and it sits behind a signed');
w('third-party licence agreement, so every figure here is either the manufacturer\'s own');
w('Australian publication or Australian motoring press. See README for the full audit.');
w('');

w('## Field completeness');
w('');
w('| Field | Core | Present | Missing | Complete | Low confidence |');
w('| --- | --- | --- | --- | --- | --- |');
cov.byField.forEach((f) => {
  w('| ' + f.label + ' | ' + (f.core ? 'yes' : '') + ' | ' + f.present + ' | ' +
    f.missing + ' | ' + f.completeness + '% | ' + f.lowConfidence + ' |');
});
w('');

w('## Per-brand completeness');
w('');
w('| Brand | Variants | Core complete | Low-confidence fields | Availability |');
w('| --- | --- | --- | --- | --- |');
cov.byBrand.forEach((b) => {
  const availability = Object.keys(b.availability)
    .map((k) => k + ': ' + b.availability[k]).join(', ');
  w('| ' + b.brand + ' | ' + b.variants + ' | ' + b.coreCompleteness + '% | ' +
    b.lowConfidenceFields + ' | ' + availability + ' |');
});
w('');

w('## Recorded source conflicts');
w('');
w('Where two sources disagreed by more than 2%, the higher-precedence value was kept');
w('and the rejected value recorded rather than discarded.');
w('');
if (catalogue.conflicts.length) {
  w('| Vehicle | Field | Kept | Rejected |');
  w('| --- | --- | --- | --- |');
  catalogue.conflicts.forEach((c) => {
    w('| ' + c.identity + ' | ' + c.field + ' | ' + c.chosen.value + ' (' + c.chosen.sourceKind +
      ') | ' + c.rejected.value + ' (' + c.rejected.sourceKind + ') |');
  });
} else {
  w('None recorded in this build.');
}
w('');

w('## Brands checked that sell no BEV in Australia');
w('');
w('These are evidence of a negative result, not omissions. A brand missing from both');
w('this list and the table above has not been checked.');
w('');
cov.emptyBrands.forEach((b) => {
  const note = (b.notes || 'No BEV on sale.').replace(/\s+/g, ' ').trim();
  w('- **' + b.brand + '** — ' + note);
});
w('');

w('## Known limits');
w('');
w('- **Prices are indicative.** Some brands publish only drive-away pricing; those records');
w('  say so in `priceBasis` and trip the `price-basis-not-msrp` warning. Drive-away figures');
w('  vary by state and are not comparable with MSRP.');
w('- **Range is only comparable within a cycle.** WLTP, NEDC and CLTC figures are stored');
w('  with the cycle named and are never merged. Non-WLTP records trip `range-cycle-not-wltp`.');
w('- **A missing value is a real answer.** Every unknown is `null` and renders as an em dash.');
w('  Numeric filters exclude unknowns rather than assuming a value.');

fs.writeFileSync(path.join(ROOT, 'docs', 'COVERAGE.md'), lines.join('\n') + '\n', 'utf8');
console.log('wrote docs/COVERAGE.md (' + lines.length + ' lines)');
