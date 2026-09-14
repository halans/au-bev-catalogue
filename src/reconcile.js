'use strict';

/**
 * Reconciler: observations -> canonical records + provenance + conflicts.
 *
 * Rules, in order:
 *   1. Group observations by vehicle identity (brand + model + variant).
 *   2. For each field, pick the winner by source precedence, then by
 *      confidence, then by recency of fetch. Ties keep the first seen, so the
 *      result is deterministic for a given input set.
 *   3. A losing observation that DISAGREES materially with the winner is
 *      recorded as a conflict. It is never silently discarded.
 *   4. A field the winner left absent can still be filled by a lower
 *      precedence source — that is a fill, not a conflict.
 *
 * The output carries provenance for every populated field, which is what lets
 * the surfaces show "where did this number come from" rather than asserting
 * specs on no authority.
 */

const schema = require('./schema');

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

function precedenceOf(observation) {
  const value = schema.SOURCE_PRECEDENCE[observation.sourceKind];
  return typeof value === 'number' ? value : 10;
}

function confidenceRankOf(observation) {
  return CONFIDENCE_RANK[observation.confidence] || 0;
}

function fetchedRankOf(observation) {
  if (!observation.fetchedAt) return 0;
  const time = Date.parse(observation.fetchedAt);
  return isFinite(time) ? time : 0;
}

/** Strictly better = wins. Returns >0 if a beats b. */
function observationRank(a, b) {
  const byPrecedence = precedenceOf(a) - precedenceOf(b);
  if (byPrecedence !== 0) return byPrecedence;
  const byConfidence = confidenceRankOf(a) - confidenceRankOf(b);
  if (byConfidence !== 0) return byConfidence;
  const byRecency = fetchedRankOf(a) - fetchedRankOf(b);
  if (byRecency !== 0) return byRecency;
  return 0;
}

/**
 * Is the difference between two values worth reporting?
 * Numbers get a 2% tolerance because published specs legitimately round
 * (e.g. 64 vs 64.2 kWh); anything larger is a real disagreement.
 */
function materiallyDifferent(field, a, b) {
  if (a === b) return false;
  const definition = schema.FIELD_BY_KEY.get(field);
  if (definition && definition.type === 'number') {
    const an = Number(a);
    const bn = Number(b);
    if (!isFinite(an) || !isFinite(bn)) return String(a) !== String(b);
    const scale = Math.max(Math.abs(an), Math.abs(bn));
    if (scale === 0) return false;
    return Math.abs(an - bn) / scale > 0.02;
  }
  if (definition && definition.type === 'boolean') return Boolean(a) !== Boolean(b);
  return String(a).trim().toLowerCase() !== String(b).trim().toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Derived fields
 * ------------------------------------------------------------------ */

function deriveFields(record) {
  const derived = {};

  // Real-world-ish efficiency implied by the vehicle's own claimed figures.
  // Only computed when both inputs are present and on the same claim basis.
  if (record.batteryUsableKwh != null && record.rangeKm != null && record.rangeKm > 0) {
    derived.efficiencyWhPerKm = Math.round((record.batteryUsableKwh * 1000) / record.rangeKm);
  } else {
    derived.efficiencyWhPerKm = null;
  }

  // Dollars per kilometre of claimed range — a crude but honest value metric.
  if (record.priceAud != null && record.rangeKm != null && record.rangeKm > 0) {
    derived.dollarsPerKmRange = Math.round((record.priceAud / record.rangeKm) * 100) / 100;
  } else {
    derived.dollarsPerKmRange = null;
  }

  return derived;
}

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

/**
 * @param {Array<object>} adapterResults results from adapter load() calls
 * @returns {{records:Array<object>, conflicts:Array<object>, brands:Array<object>, duplicates:Array<object>, problems:Array<object>, meta:object}}
 */
function reconcile(adapterResults) {
  const results = Array.isArray(adapterResults) ? adapterResults : [adapterResults];

  const groups = new Map();
  const brands = [];
  const problems = [];
  let meta = {};

  for (let r = 0; r < results.length; r += 1) {
    const result = results[r];
    if (!result) continue;
    if (result.problems) {
      for (let p = 0; p < result.problems.length; p += 1) problems.push(result.problems[p]);
    }
    if (result.brands) {
      for (let b = 0; b < result.brands.length; b += 1) brands.push(result.brands[b]);
    }
    if (result.meta) meta = Object.assign({}, meta, result.meta);

    const entries = result.entries || [];
    for (let e = 0; e < entries.length; e += 1) {
      const entry = entries[e];
      if (!groups.has(entry.identity)) {
        groups.set(entry.identity, {
          identity: entry.identity,
          identityRecord: entry.identityRecord,
          sourceFiles: [],
          brandSlug: entry.brandSlug,
          brandNotes: entry.brandNotes,
          observations: [],
        });
      }
      const group = groups.get(entry.identity);
      if (group.sourceFiles.indexOf(entry.sourceFile) === -1) {
        group.sourceFiles.push(entry.sourceFile);
      }
      for (let o = 0; o < entry.observations.length; o += 1) {
        group.observations.push(entry.observations[o]);
      }
    }
  }

  const records = [];
  const conflicts = [];
  const duplicates = [];

  const identities = Array.from(groups.keys()).sort();

  for (let i = 0; i < identities.length; i += 1) {
    const group = groups.get(identities[i]);

    if (group.sourceFiles.length > 1) {
      duplicates.push({
        identity: group.identity,
        sourceFiles: group.sourceFiles.slice(),
        message: 'same vehicle identity supplied by more than one source file',
      });
    }

    const byField = new Map();
    for (let o = 0; o < group.observations.length; o += 1) {
      const observation = group.observations[o];
      if (!byField.has(observation.field)) byField.set(observation.field, []);
      byField.get(observation.field).push(observation);
    }

    const record = { id: group.identity };
    const provenance = {};

    for (let f = 0; f < schema.FIELDS.length; f += 1) {
      const key = schema.FIELDS[f].key;
      const candidates = byField.get(key);
      if (!candidates || !candidates.length) {
        record[key] = null;
        continue;
      }

      let winner = candidates[0];
      for (let c = 1; c < candidates.length; c += 1) {
        if (observationRank(candidates[c], winner) > 0) winner = candidates[c];
      }

      record[key] = winner.value;
      provenance[key] = {
        sourceKind: winner.sourceKind,
        url: winner.url,
        publisher: winner.publisher,
        licence: winner.licence,
        fetchedAt: winner.fetchedAt,
        confidence: winner.confidence,
        adapter: winner.adapter,
      };

      for (let c = 0; c < candidates.length; c += 1) {
        const other = candidates[c];
        if (other === winner) continue;
        if (materiallyDifferent(key, other.value, winner.value)) {
          conflicts.push({
            identity: group.identity,
            field: key,
            chosen: { value: winner.value, sourceKind: winner.sourceKind, url: winner.url },
            rejected: { value: other.value, sourceKind: other.sourceKind, url: other.url },
          });
        }
      }
    }

    Object.assign(record, deriveFields(record));

    record.provenance = provenance;
    record.brandSlug = group.brandSlug;
    record.brandNotes = group.brandNotes || null;
    record.lowConfidenceFields = Object.keys(provenance)
      .filter((key) => provenance[key].confidence === 'low')
      .sort();

    records.push(record);
  }

  brands.sort((a, b) => (a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : 0));

  return { records, conflicts, brands, duplicates, problems, meta };
}

module.exports = {
  reconcile,
  deriveFields,
  materiallyDifferent,
  observationRank,
  precedenceOf,
};
