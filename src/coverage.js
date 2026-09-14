'use strict';

/**
 * Coverage and freshness reporting.
 *
 * The whole point of this module: "is the catalogue complete?" is not a yes/no
 * claim, it is a measurement. Completeness is reported per field and per brand,
 * alongside how much of the data is manufacturer-sourced versus press-sourced
 * and how old the snapshots are. A consumer can then decide whether the
 * catalogue is good enough for their purpose instead of trusting an assertion.
 */

const schema = require('./schema');

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * @param {object} catalogue result of reconcile()
 * @param {object} [options]
 * @param {string} [options.now] ISO date, injectable for deterministic tests
 */
function coverage(catalogue, options) {
  const opts = options || {};
  const now = opts.now || new Date().toISOString().slice(0, 10);
  const records = catalogue.records || [];
  const total = records.length;

  // --- per-field completeness ----------------------------------------
  const byField = schema.FIELDS.map((field) => {
    let present = 0;
    const bySourceKind = {};
    let lowConfidence = 0;

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      if (schema.isBlank(record[field.key])) continue;
      present += 1;
      const provenance = (record.provenance || {})[field.key];
      const kind = provenance ? provenance.sourceKind : 'unknown';
      bySourceKind[kind] = (bySourceKind[kind] || 0) + 1;
      if (provenance && provenance.confidence === 'low') lowConfidence += 1;
    }

    return {
      field: field.key,
      label: field.label,
      core: Boolean(field.core),
      present,
      missing: total - present,
      completeness: pct(present, total),
      lowConfidence,
      bySourceKind,
    };
  });

  // --- per-brand completeness ----------------------------------------
  const brandMap = new Map();
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const key = record.brand || '(unknown)';
    if (!brandMap.has(key)) {
      brandMap.set(key, {
        brand: key,
        variants: 0,
        coreFieldsPresent: 0,
        coreFieldsPossible: 0,
        lowConfidenceFields: 0,
        availability: {},
        fetchedAt: null,
      });
    }
    const bucket = brandMap.get(key);
    bucket.variants += 1;

    for (let c = 0; c < schema.CORE_FIELDS.length; c += 1) {
      bucket.coreFieldsPossible += 1;
      if (!schema.isBlank(record[schema.CORE_FIELDS[c]])) bucket.coreFieldsPresent += 1;
    }

    bucket.lowConfidenceFields += (record.lowConfidenceFields || []).length;

    const availability = record.availability || 'unknown';
    bucket.availability[availability] = (bucket.availability[availability] || 0) + 1;

    const provenance = record.provenance || {};
    const keys = Object.keys(provenance);
    for (let p = 0; p < keys.length; p += 1) {
      const fetchedAt = provenance[keys[p]].fetchedAt;
      if (!fetchedAt) continue;
      if (!bucket.fetchedAt || fetchedAt > bucket.fetchedAt) bucket.fetchedAt = fetchedAt;
    }
  }

  const byBrand = Array.from(brandMap.values()).map((bucket) => ({
    brand: bucket.brand,
    variants: bucket.variants,
    coreCompleteness: pct(bucket.coreFieldsPresent, bucket.coreFieldsPossible),
    lowConfidenceFields: bucket.lowConfidenceFields,
    availability: bucket.availability,
    fetchedAt: bucket.fetchedAt,
  })).sort((a, b) => b.variants - a.variants || (a.brand < b.brand ? -1 : 1));

  // --- brands checked but carrying no variants -----------------------
  // These matter as much as the populated ones: they are evidence the brand was
  // examined and found to have no BEV on sale, rather than simply forgotten.
  const emptyBrands = (catalogue.brands || [])
    .filter((brand) => !brand.variantCount)
    .map((brand) => ({ brand: brand.brand, notes: brand.notes, sourceFile: brand.sourceFile }));

  // --- provenance mix ------------------------------------------------
  const provenanceMix = {};
  let populatedFields = 0;
  for (let i = 0; i < records.length; i += 1) {
    const provenance = records[i].provenance || {};
    const keys = Object.keys(provenance);
    for (let p = 0; p < keys.length; p += 1) {
      const kind = provenance[keys[p]].sourceKind || 'unknown';
      provenanceMix[kind] = (provenanceMix[kind] || 0) + 1;
      populatedFields += 1;
    }
  }

  // --- freshness -----------------------------------------------------
  const fetchDates = byBrand.map((b) => b.fetchedAt).filter(Boolean).sort();
  const oldest = fetchDates.length ? fetchDates[0] : null;
  const newest = fetchDates.length ? fetchDates[fetchDates.length - 1] : null;

  const coreCompletenessOverall = (() => {
    let present = 0;
    let possible = 0;
    for (let i = 0; i < records.length; i += 1) {
      for (let c = 0; c < schema.CORE_FIELDS.length; c += 1) {
        possible += 1;
        if (!schema.isBlank(records[i][schema.CORE_FIELDS[c]])) present += 1;
      }
    }
    return pct(present, possible);
  })();

  const availabilityTotals = {};
  for (let i = 0; i < records.length; i += 1) {
    const key = records[i].availability || 'unknown';
    availabilityTotals[key] = (availabilityTotals[key] || 0) + 1;
  }

  return {
    generatedAt: now,
    totals: {
      variants: total,
      brandsWithVariants: byBrand.length,
      brandsChecked: (catalogue.brands || []).length,
      brandsWithNoBev: emptyBrands.length,
      populatedFields,
      coreCompleteness: coreCompletenessOverall,
      conflicts: (catalogue.conflicts || []).length,
    },
    availability: availabilityTotals,
    freshness: { oldestSnapshot: oldest, newestSnapshot: newest },
    provenanceMix,
    byField,
    byBrand,
    emptyBrands,
  };
}

module.exports = { coverage, pct };
