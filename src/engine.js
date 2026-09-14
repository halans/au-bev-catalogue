'use strict';

/**
 * Search / filter / sort / compare engine for the Australian BEV catalogue.
 *
 * This module is deliberately free of Node built-ins and of any I/O. The HTML
 * builder inlines this file VERBATIM into the offline page behind a tiny
 * CommonJS shim, so the browser executes exactly the same bytes the CLI does.
 * That is what makes the cross-surface equivalence test meaningful: there is no
 * second implementation to drift.
 *
 * Consequences to preserve when editing:
 *   - no require() other than './schema'
 *   - no Date.now(), Math.random() or other non-determinism in query paths
 *   - no mutation of the records passed in
 */

const schema = require('./schema');

const { FIELD_BY_KEY, SORTABLE_FIELDS, FACET_FIELDS, isBlank } = schema;

/* ------------------------------------------------------------------ *
 * Text search
 * ------------------------------------------------------------------ */

function normaliseText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9.+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Searchable haystack for a record. Precomputed once by buildIndex. */
function haystack(record) {
  return normaliseText(
    [
      record.brand,
      record.model,
      record.variant,
      record.bodyType,
      record.segment,
      record.drive,
      record.availability,
    ].join(' ')
  );
}

function tokenise(query) {
  const text = normaliseText(query);
  return text ? text.split(' ').filter(Boolean) : [];
}

/**
 * Every token must appear as a prefix of some word in the haystack.
 * Prefix matching means "ioniq 5" finds "Ioniq 5 Dynamiq" and "mod 3"
 * finds "Model 3", without pulling in a fuzzy-match dependency.
 */
function matchesTokens(hay, tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (hay.indexOf(token) === -1) return false;
    const words = hay.split(' ');
    let hit = false;
    for (let w = 0; w < words.length; w += 1) {
      if (words[w].indexOf(token) === 0) { hit = true; break; }
    }
    if (!hit) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Index
 * ------------------------------------------------------------------ */

/**
 * Wraps the catalogue in a queryable index. Pure: `records` is not mutated.
 * @param {{records: Array<object>, meta?: object}|Array<object>} catalogue
 */
function buildIndex(catalogue) {
  const records = Array.isArray(catalogue) ? catalogue : (catalogue.records || []);
  const meta = Array.isArray(catalogue) ? {} : (catalogue.meta || {});
  const entries = records.map((record, ordinal) => ({
    record,
    ordinal,
    hay: haystack(record),
  }));
  return { entries, meta, size: entries.length };
}

/** Distinct values per facet field, with counts, sorted for stable display. */
function facets(index) {
  const out = {};
  for (let f = 0; f < FACET_FIELDS.length; f += 1) {
    const key = FACET_FIELDS[f];
    const counts = new Map();
    for (let i = 0; i < index.entries.length; i += 1) {
      const value = index.entries[i].record[key];
      if (isBlank(value)) continue;
      const label = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    out[key] = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (b.count - a.count) || (a.value < b.value ? -1 : 1));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

function coerceFacetValue(field, raw) {
  if (field && field.type === 'boolean') {
    const text = String(raw).toLowerCase();
    if (text === 'yes' || text === 'true') return true;
    if (text === 'no' || text === 'false') return false;
    return null;
  }
  return String(raw);
}

function facetMatches(record, key, wanted) {
  const field = FIELD_BY_KEY.get(key);
  const value = record[key];
  if (isBlank(value)) return false;
  const actual = typeof value === 'boolean' ? value : String(value);
  for (let i = 0; i < wanted.length; i += 1) {
    const want = coerceFacetValue(field, wanted[i]);
    if (want === null) continue;
    if (typeof actual === 'boolean') {
      if (actual === want) return true;
    } else if (actual.toLowerCase() === String(want).toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Range predicate. A record whose value is null is EXCLUDED by an active
 * range filter — a missing number cannot be asserted to satisfy a bound.
 * This is deliberate: silently keeping unknowns would let a filtered list
 * imply specs the catalogue does not actually have.
 */
function rangeMatches(record, key, bound) {
  const value = record[key];
  if (isBlank(value)) return false;
  const num = Number(value);
  if (!isFinite(num)) return false;
  if (bound.min != null && num < Number(bound.min)) return false;
  if (bound.max != null && num > Number(bound.max)) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

/**
 * Nulls always sort last regardless of direction, so that "cheapest first"
 * does not present unpriced vehicles as free.
 */
function compareBy(key, direction) {
  const dir = direction === 'desc' ? -1 : 1;
  const field = FIELD_BY_KEY.get(key);
  const numeric = field && field.type === 'number';
  return (a, b) => {
    const av = a.record[key];
    const bv = b.record[key];
    const aBlank = isBlank(av);
    const bBlank = isBlank(bv);
    if (aBlank && bBlank) return a.ordinal - b.ordinal;
    if (aBlank) return 1;
    if (bBlank) return -1;
    let cmp;
    if (numeric) {
      cmp = Number(av) - Number(bv);
    } else {
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      cmp = as < bs ? -1 : as > bs ? 1 : 0;
    }
    if (cmp === 0) return a.ordinal - b.ordinal;
    return cmp * dir;
  };
}

/* ------------------------------------------------------------------ *
 * Query
 * ------------------------------------------------------------------ */

/**
 * Run a query against an index.
 *
 * @param {object} index      from buildIndex()
 * @param {object} [query]
 * @param {string} [query.q]           free-text search
 * @param {object} [query.facets]      { brand: ['Kia'], drive: ['AWD'] }
 * @param {object} [query.ranges]      { priceAud: {min: 0, max: 60000} }
 * @param {string} [query.sort]        sortable field key
 * @param {string} [query.direction]   'asc' | 'desc'
 * @param {number} [query.limit]
 * @param {number} [query.offset]
 * @returns {{total:number, offset:number, limit:(number|null), records:Array<object>}}
 */
function query(index, q) {
  const spec = q || {};
  const tokens = tokenise(spec.q || '');
  const facetSpec = spec.facets || {};
  const rangeSpec = spec.ranges || {};

  let rows = index.entries;

  if (tokens.length) {
    rows = rows.filter((entry) => matchesTokens(entry.hay, tokens));
  }

  const facetKeys = Object.keys(facetSpec);
  for (let i = 0; i < facetKeys.length; i += 1) {
    const key = facetKeys[i];
    let wanted = facetSpec[key];
    if (isBlank(wanted)) continue;
    if (!Array.isArray(wanted)) wanted = [wanted];
    if (!wanted.length) continue;
    rows = rows.filter((entry) => facetMatches(entry.record, key, wanted));
  }

  const rangeKeys = Object.keys(rangeSpec);
  for (let i = 0; i < rangeKeys.length; i += 1) {
    const key = rangeKeys[i];
    const bound = rangeSpec[key];
    if (!bound || (bound.min == null && bound.max == null)) continue;
    rows = rows.filter((entry) => rangeMatches(entry.record, key, bound));
  }

  const sortKey = spec.sort && SORTABLE_FIELDS.indexOf(spec.sort) !== -1
    ? spec.sort
    : null;

  if (sortKey) {
    rows = rows.slice().sort(compareBy(sortKey, spec.direction));
  } else if (spec.sort === 'name' || !spec.sort) {
    rows = rows.slice().sort((a, b) => {
      const an = (a.record.brand + ' ' + a.record.model + ' ' + a.record.variant).toLowerCase();
      const bn = (b.record.brand + ' ' + b.record.model + ' ' + b.record.variant).toLowerCase();
      if (an === bn) return a.ordinal - b.ordinal;
      return an < bn ? -1 : 1;
    });
  }

  const total = rows.length;
  const offset = Math.max(0, Number(spec.offset) || 0);
  const limit = spec.limit == null ? null : Math.max(0, Number(spec.limit));
  const page = limit == null ? rows.slice(offset) : rows.slice(offset, offset + limit);

  return {
    total,
    offset,
    limit,
    records: page.map((entry) => entry.record),
  };
}

/** Look up one record by its identity id. */
function byId(index, id) {
  for (let i = 0; i < index.entries.length; i += 1) {
    if (index.entries[i].record.id === id) return index.entries[i].record;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Compare
 * ------------------------------------------------------------------ */

/**
 * Build a comparison table for a set of ids.
 * Rows are fields; `differs` marks fields where the chosen vehicles disagree,
 * which is the only interesting part of a spec comparison.
 */
function compare(index, ids) {
  const chosen = (ids || []).map((id) => byId(index, id)).filter(Boolean);
  const rows = [];
  for (let i = 0; i < schema.FIELDS.length; i += 1) {
    const field = schema.FIELDS[i];
    const values = chosen.map((record) => (isBlank(record[field.key]) ? null : record[field.key]));
    const present = values.filter((v) => v !== null);
    const uniq = new Set(present.map((v) => String(v)));
    rows.push({
      key: field.key,
      label: field.label,
      unit: field.unit || '',
      values,
      differs: uniq.size > 1,
      missing: values.length - present.length,
    });
  }
  return { vehicles: chosen, rows };
}

/* ------------------------------------------------------------------ *
 * Formatting — shared so CLI and HTML render identical strings
 * ------------------------------------------------------------------ */

function formatNumber(num) {
  const rounded = Math.round(Number(num) * 100) / 100;
  const parts = String(rounded).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** Renders a field value for display. Returns '—' for unknown, never a guess. */
function formatValue(key, value) {
  if (isBlank(value)) return '—';
  const field = FIELD_BY_KEY.get(key) || {};
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'priceAud') return '$' + formatNumber(value);
  if (field.type === 'number') {
    const unit = field.unit ? ' ' + field.unit : '';
    return formatNumber(value) + unit;
  }
  return String(value);
}

/** Full display name for a record. */
function displayName(record) {
  return [record.brand, record.model, record.variant].filter(Boolean).join(' ');
}

module.exports = {
  buildIndex,
  facets,
  query,
  byId,
  compare,
  formatValue,
  formatNumber,
  displayName,
  tokenise,
  normaliseText,
  matchesTokens,
  compareBy,
};
