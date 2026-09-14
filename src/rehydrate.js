'use strict';

/**
 * Inverse of build-html.js `compactPayload`.
 *
 * The HTML page embeds records with their provenance strings interned into a
 * shared table, purely to keep the page small. This module expands them back
 * into the exact shape reconcile() produced, and runs BEFORE the engine sees
 * anything — so compaction stays invisible to the query layer.
 *
 * Like engine.js this is inlined verbatim into the page, so it must stay free
 * of Node built-ins and of require() calls.
 */

/**
 * Expand an interned payload in place and return it.
 * Idempotent: a payload with no `strings` table is returned untouched, so
 * calling this on an already-expanded catalogue is harmless.
 *
 * @param {{strings?:Array<string>, records:Array<object>}} payload
 */
function rehydrate(payload) {
  if (!payload || !payload.records) return payload;
  var strings = payload.strings;
  if (!strings) return payload;

  function str(at) {
    return (at == null || at < 0) ? null : strings[at];
  }

  for (var i = 0; i < payload.records.length; i += 1) {
    var record = payload.records[i];
    var packed = record.p;
    if (!packed) continue;

    var provenance = {};
    var fields = Object.keys(packed);
    for (var f = 0; f < fields.length; f += 1) {
      var row = packed[fields[f]];
      provenance[fields[f]] = {
        sourceKind: str(row[0]),
        url: str(row[1]),
        publisher: str(row[2]),
        licence: str(row[3]),
        fetchedAt: str(row[4]),
        confidence: str(row[5]),
        adapter: str(row[6]),
      };
    }
    record.provenance = provenance;
    delete record.p;
  }

  return payload;
}

module.exports = { rehydrate };
