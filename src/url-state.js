'use strict';

/**
 * Pure state <-> URL-hash (de)serialisation for the HTML explorer.
 *
 * Like schema.js and engine.js, this module is inlined verbatim into the built
 * page, so it must stay free of DOM globals, Date.now() and Math.random(). It
 * uses the global URLSearchParams, which needs no DOM and exists in plain Node
 * too — that's what makes it directly unit-testable without a browser.
 *
 * Consequences to preserve when editing:
 *   - no require() other than './schema'
 *   - no document/window/location/history/navigator references here — those
 *     stay in the page's view-layer script, which calls this module
 */

const schema = require('./schema');

const DEFAULTS = { sort: 'name', direction: 'asc', view: 'table' };

/**
 * @param {object} state page state: {q, facets, ranges, sort, direction, view, compare, open}
 * @returns {string} a hash string (no leading '#'); empty for a plain, unfiltered view
 */
function encodeState(state) {
  const params = new URLSearchParams();
  const s = state || {};

  if (s.q) params.set('q', s.q);

  const facetKeys = Object.keys(s.facets || {}).sort();
  for (let i = 0; i < facetKeys.length; i += 1) {
    const key = facetKeys[i];
    const values = s.facets[key];
    if (values && values.length) params.set(key, values.join(','));
  }

  const rangeKeys = Object.keys(s.ranges || {}).sort();
  for (let i = 0; i < rangeKeys.length; i += 1) {
    const key = rangeKeys[i];
    const bound = s.ranges[key] || {};
    if (bound.min != null) params.set('min-' + key, String(bound.min));
    if (bound.max != null) params.set('max-' + key, String(bound.max));
  }

  if (s.sort && s.sort !== DEFAULTS.sort) params.set('sort', s.sort);
  if (s.direction && s.direction !== DEFAULTS.direction) params.set('dir', s.direction);
  if (s.view && s.view !== DEFAULTS.view) params.set('view', s.view);
  if (s.compare && s.compare.length) params.set('compare', s.compare.join(','));
  if (s.open) params.set('v', s.open);

  return params.toString();
}

/**
 * @param {string} hash a location.hash value, with or without the leading '#'
 * @returns {object} a SPARSE object — only keys actually present and valid in
 *   the hash are set. Never fills in defaults; the caller layers those on.
 *   Invalid or unknown params (a stale link, a hand-edited one, one from a
 *   build with different fields) are dropped rather than thrown.
 */
function decodeState(hash) {
  const out = {};
  const text = String(hash == null ? '' : hash).replace(/^#/, '');
  if (!text) return out;

  const params = new URLSearchParams(text);
  const facets = {};
  const ranges = {};
  const entries = Array.from(params.entries());

  for (let i = 0; i < entries.length; i += 1) {
    const key = entries[i][0];
    const value = entries[i][1];
    if (!value) continue;

    if (key === 'q') { out.q = value; continue; }
    if (key === 'sort') {
      if (value === 'name' || schema.SORTABLE_FIELDS.indexOf(value) !== -1) out.sort = value;
      continue;
    }
    if (key === 'dir') {
      if (value === 'asc' || value === 'desc') out.direction = value;
      continue;
    }
    if (key === 'view') {
      if (value === 'table' || value === 'cards') out.view = value;
      continue;
    }
    if (key === 'compare') {
      out.compare = value.split(',').filter(Boolean).slice(0, 4);
      continue;
    }
    if (key === 'v') { out.open = value; continue; }

    if (key.indexOf('min-') === 0 || key.indexOf('max-') === 0) {
      const edge = key.slice(0, 3);
      const field = key.slice(4);
      if (!schema.FIELD_BY_KEY.has(field)) continue;
      const num = Number(value);
      if (!isFinite(num)) continue;
      ranges[field] = ranges[field] || {};
      ranges[field][edge] = num;
      continue;
    }

    if (schema.FACET_FIELDS.indexOf(key) !== -1) {
      facets[key] = value.split(',').filter(Boolean);
    }
  }

  if (Object.keys(facets).length) out.facets = facets;
  if (Object.keys(ranges).length) out.ranges = ranges;

  return out;
}

module.exports = { encodeState, decodeState };
