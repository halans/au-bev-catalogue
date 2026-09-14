'use strict';

/**
 * Adapter: cached brand snapshots.
 *
 * Reads the per-brand JSON files under data/sources/ and emits field-level
 * OBSERVATIONS. An observation is a single claim about a single field, tagged
 * with where it came from, when, and how much we trust it. The reconciler
 * turns observations into records; this adapter never decides anything.
 *
 * Adding a new data source means adding a sibling module that emits the same
 * observation shape — see docs/EXTENDING.md.
 */

const fs = require('fs');
const path = require('path');
const schema = require('../schema');

const ADAPTER_ID = 'snapshot';

/** Hosts we treat as motoring press rather than a manufacturer. */
const PRESS_HOSTS = [
  'carexpert', 'drive.com.au', 'whichcar', 'evcentral', 'carsguide',
  'chasingcars', 'carsales', 'goauto', 'thebeep', 'ev-wiki', 'carsorted',
  'aeva', 'motoring', 'caradvice', 'ccarprice', 'zecar', 'riz.com',
];

function sourceKindForUrl(url) {
  if (!url) return 'manufacturer';
  const lower = String(url).toLowerCase();
  for (let i = 0; i < PRESS_HOSTS.length; i += 1) {
    if (lower.indexOf(PRESS_HOSTS[i]) !== -1) return 'press';
  }
  if (lower.indexOf('wikidata') !== -1 || lower.indexOf('wikipedia') !== -1) return 'wikidata';
  if (lower.indexOf('greenvehicleguide') !== -1) return 'green-vehicle-guide';
  return 'manufacturer';
}

/**
 * Snapshots are hand-authored, so a `fieldSources` entry occasionally arrives
 * as an array of URLs (or as a URL with a parenthetical note appended). A
 * provenance URL has to be a single string the page can put in an href, so
 * flatten to the first entry here rather than letting an array reach the
 * record — stringifying an array downstream produced a comma-joined
 * pseudo-URL that was neither clickable nor round-trip safe.
 */
function normaliseSourceUrl(value) {
  if (value == null) return null;
  const first = Array.isArray(value) ? value[0] : value;
  if (first == null) return null;
  const text = String(first).trim();
  return text || null;
}

function confidenceFor(sourceKind, flaggedLowConfidence) {
  if (flaggedLowConfidence) return 'low';
  if (sourceKind === 'green-vehicle-guide') return 'high';
  if (sourceKind === 'manufacturer') return 'high';
  if (sourceKind === 'press') return 'medium';
  return 'low';
}

/** All non-derived canonical field keys, in schema order. */
const FIELD_KEYS = schema.FIELDS.map((f) => f.key);

/**
 * Normalise a raw value into the schema's type, without inventing anything.
 * Returns undefined when the value is absent or unusable, so the field simply
 * yields no observation rather than an observation of garbage.
 */
function coerce(key, raw) {
  const field = schema.FIELD_BY_KEY.get(key);
  if (!field) return undefined;
  if (schema.isBlank(raw)) return undefined;

  if (field.type === 'number') {
    // Tolerate "64.2 kWh", "1,600", "approx 480" from hand-authored snapshots.
    const num = typeof raw === 'number'
      ? raw
      : Number(String(raw).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(num)) return undefined;
    return num;
  }

  if (field.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const text = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].indexOf(text) !== -1) return true;
    if (['false', 'no', 'n', '0'].indexOf(text) !== -1) return false;
    return undefined;
  }

  if (field.type === 'enum') {
    const domain = schema.ENUMS[field.enum] || [];
    const text = String(raw).trim();
    for (let i = 0; i < domain.length; i += 1) {
      if (domain[i].toLowerCase() === text.toLowerCase()) return domain[i];
    }
    // Out-of-domain values are preserved verbatim so the validator can report
    // them as errors rather than having them silently vanish here.
    return text;
  }

  return String(raw).trim();
}

/**
 * @param {object} snapshot parsed brand file
 * @param {string} filename for diagnostics
 * @returns {Array<object>} one entry per variant, each carrying observations
 */
function observationsFromSnapshot(snapshot, filename) {
  const out = [];
  const brand = snapshot.brand;
  const primaryUrl = (snapshot.sourceUrls || [])[0] || null;
  const fetchedAt = snapshot.fetchedAt || null;
  const variants = snapshot.variants || [];

  for (let v = 0; v < variants.length; v += 1) {
    const raw = variants[v];
    const lowConfidence = raw.lowConfidenceFields || [];
    const fieldSources = raw.fieldSources || {};
    // A brand file often bundles several models under one sourceUrls array
    // (one URL per model, not one URL per file). Falling back to sourceUrls[0]
    // unconditionally would attribute every unlisted field of every OTHER
    // model to the first model's page. A variant names its own page here to
    // override that; variants that don't still fall back to sourceUrls[0], so
    // single-model brand files need no change.
    const variantUrl = normaliseSourceUrl(raw.sourceUrl) || normaliseSourceUrl(primaryUrl);
    const identityRecord = {
      brand,
      model: raw.model,
      variant: raw.variant,
    };

    const observations = [];
    for (let f = 0; f < FIELD_KEYS.length; f += 1) {
      const key = FIELD_KEYS[f];
      const value = key === 'brand' ? brand : coerce(key, raw[key]);
      if (value === undefined) continue;

      const fieldOverride = normaliseSourceUrl(fieldSources[key]);
      const fieldUrl = fieldOverride || variantUrl;
      const sourceKind = sourceKindForUrl(fieldUrl);
      const flagged = lowConfidence.indexOf(key) !== -1;

      observations.push({
        field: key,
        value,
        adapter: ADAPTER_ID,
        sourceKind,
        url: fieldUrl,
        publisher: snapshot.publisher || null,
        licence: schema.SOURCE_LICENCES[sourceKind] || snapshot.licence || null,
        fetchedAt,
        confidence: confidenceFor(sourceKind, flagged),
        flaggedByAuthor: flagged,
      });
    }

    out.push({
      identity: schema.identityKey(identityRecord),
      identityRecord,
      sourceFile: filename,
      brandSlug: snapshot.brandSlug || schema.slug(brand || ''),
      brandNotes: snapshot.notes || null,
      observations,
    });
  }

  return out;
}

/** Brand-level metadata, including brands that are in-market-checked but empty. */
function brandMetaFromSnapshot(snapshot, filename) {
  return {
    brand: snapshot.brand,
    brandSlug: snapshot.brandSlug || schema.slug(snapshot.brand || ''),
    publisher: snapshot.publisher || null,
    sourceUrls: snapshot.sourceUrls || [],
    fetchedAt: snapshot.fetchedAt || null,
    licence: snapshot.licence || null,
    notes: snapshot.notes || null,
    variantCount: (snapshot.variants || []).length,
    sourceFile: filename,
  };
}

/**
 * Load every snapshot in a directory.
 * Files beginning with '_' are treated as metadata, not brands.
 */
function load(dir) {
  const entries = [];
  const brands = [];
  const problems = [];
  const meta = {};

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

  for (let i = 0; i < files.length; i += 1) {
    const filename = files[i];
    const full = path.join(dir, filename);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      problems.push({ file: filename, message: 'unparseable JSON: ' + err.message });
      continue;
    }

    if (filename.charAt(0) === '_') {
      meta[filename.replace(/^_|\.json$/g, '')] = parsed;
      continue;
    }

    if (!parsed.brand) {
      problems.push({ file: filename, message: 'missing required "brand"' });
      continue;
    }

    brands.push(brandMetaFromSnapshot(parsed, filename));
    const observed = observationsFromSnapshot(parsed, filename);
    for (let j = 0; j < observed.length; j += 1) entries.push(observed[j]);
  }

  return { adapter: ADAPTER_ID, entries, brands, problems, meta, fileCount: files.length };
}

module.exports = { load, ADAPTER_ID, coerce, sourceKindForUrl, normaliseSourceUrl, observationsFromSnapshot };
