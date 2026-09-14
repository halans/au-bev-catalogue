# Extending the catalogue

Three kinds of change, in increasing order of effort.

---

## 1. Add or refresh a brand

Create or edit `data/sources/<brand-slug>.json`. One file per brand, lowercase hyphenated
filename. Nothing else needs touching — the adapter globs the directory.

```json
{
  "brand": "Kia",
  "brandSlug": "kia",
  "publisher": "Kia Australia",
  "sourceUrls": ["https://www.kia.com/au/showroom/ev5/specifications.html"],
  "fetchedAt": "2026-09-13",
  "licence": "proprietary-factual",
  "notes": "Anything a reader needs to know to trust or distrust this brand's data.",
  "variants": [
    {
      "model": "EV5",
      "variant": "Air Standard Range",
      "bodyType": "suv",
      "segment": "suv-medium",
      "batteryUsableKwh": 64.2,
      "rangeKm": 400,
      "rangeCycle": "WLTP",
      "dcChargeKw": 101,
      "drive": "FWD",
      "powerKw": 160,
      "seats": 5,
      "priceAud": 56770,
      "priceBasis": "MSRP before on-road costs",
      "availability": "current",
      "fieldSources": { "dcChargeKw": "https://www.carexpert.com.au/..." },
      "lowConfidenceFields": ["dcChargeKw"]
    }
  ]
}
```

### Authoring rules

- **A field you cannot verify is `null` or absent.** Never a guess, never an estimate,
  never a figure lifted from the overseas-market version of the same model. A null is a
  correct answer; a plausible invention is a defect the validator cannot catch.
- **`fieldSources`** cites a URL for any field that did not come from the variant's
  source page (`sourceUrls[0]`, or the variant's own `sourceUrl` — see below). The
  adapter reads the host to classify it as manufacturer or press, which sets its
  precedence and confidence. Pass a single URL string — an array is flattened to its
  first entry.
- **`sourceUrl`** (optional, per variant) names that variant's own page when a brand
  file bundles several models under one `sourceUrls` array. Without it, every field
  that isn't listed in `fieldSources` is attributed to `sourceUrls[0]` — correct for a
  single-model file, wrong for every model after the first in a multi-model one. Set
  `sourceUrl` on each variant to the URL that actually describes it, and reserve
  `fieldSources` for individual fields that came from somewhere else again (e.g. a
  press article filling one gap in an otherwise manufacturer-sourced variant).
- **`lowConfidenceFields`** lists fields you are unsure about. They are surfaced in the
  UI, counted in coverage, and trip `low-confidence-field`.
- **`rangeCycle`** records the cycle actually quoted. Never convert between cycles.
- **`availability`** is `current`, `runout` or `announced`.
- **A brand with no BEV still gets a file** with `"variants": []` and a `notes` field
  explaining what you checked. This is how the catalogue distinguishes "checked, sells
  nothing" from "never looked at".

Then:

```bash
node bin/bev.js build
node bin/bev.js validate
node scripts/coverage-report.js
```

---

## 2. Add a field

Edit `src/schema.js` only. Everything downstream reads from `FIELDS`.

```js
{ key: 'groundClearanceMm', label: 'Ground clearance', type: 'number',
  unit: 'mm', min: 80, max: 400, sortable: true }
```

| Property | Effect |
| --- | --- |
| `type` | `string` \| `number` \| `boolean` \| `enum` — drives coercion and formatting |
| `enum` | Key into `ENUMS`; out-of-domain values become `enum-out-of-domain` errors |
| `unit` | Display suffix on both surfaces |
| `min` / `max` | Plausibility envelope. Outside it is an **error**, since it signals a transcription mistake rather than an unusual car |
| `core` | Counted in core-field completeness; absence triggers `missing-core-field` |
| `sortable` | Offered as a CLI `--sort` value and a clickable column header |
| `facet` | Offered as a CLI `--filter` key and a sidebar chip group |
| `identity` | Participates in the record id — changing this renumbers every vehicle |

Set the envelope from the real physical range, not the range you happen to have.
A too-narrow envelope produces false errors; the 12-seat Skywell van was rejected
by exactly that mistake.

Rebuild and run the suite. `test/engine.test.js` asserts every sortable and facetable
key resolves to a defined field, so a typo fails immediately.

---

## 3. Add a data source

Write a module under `src/adapters/` that exports `load()` returning **observations**.
An observation is one claim about one field, tagged with its origin:

```js
{
  field: 'consumptionWhPerKm',
  value: 178,
  adapter: 'green-vehicle-guide',
  sourceKind: 'green-vehicle-guide',   // must exist in schema.SOURCE_PRECEDENCE
  url: 'https://greenvehicleguide.gov.au/...',
  publisher: 'Department of Infrastructure',
  licence: 'Commonwealth of Australia, third-party licence agreement required',
  fetchedAt: '2026-09-13',
  confidence: 'high',                  // high | medium | low
  flaggedByAuthor: false
}
```

`load()` returns:

```js
{ adapter, entries, brands, problems, meta, fileCount }
```

where each `entry` is `{ identity, identityRecord, sourceFile, brandSlug, brandNotes, observations }`.
Use `schema.identityKey({ brand, model, variant })` so records from different adapters
merge onto the same vehicle rather than duplicating it.

Register it in `src/build.js`:

```js
const gvg = require('./adapters/green-vehicle-guide');
const reconciled = reconcile([snapshotAdapter.load(sourcesDir), gvg.load(options)]);
```

The reconciler handles the rest: precedence, conflict capture, gap filling, provenance.
Your adapter makes claims; it never decides between them.

### The Green Vehicle Guide adapter

The design already reserves the highest precedence (100) for `green-vehicle-guide`,
so wiring it in requires no changes to the reconciler. What it needs is access: email
gvg@infrastructure.gov.au and sign the Department's Third Party User Licence Agreement.
The service is SOAP (`GVGDataService.svc`), with one useful operation,
`GetAllManufacturersVehicleReportData`, taking `login`/`password`.

Adding it would give the catalogue its first government-sourced fields — energy
consumption and ADR-cycle figures. It will not supply battery capacity, DC charge rate
or price; those remain manufacturer-sourced.

---

## Invariants the tests defend

Breaking any of these fails `npm test`:

1. **`src/engine.js` requires nothing but `./schema`.** It is inlined into the browser;
   a Node built-in would break the page.
2. **The page inlines `schema.js`, `engine.js` and `rehydrate.js` verbatim.** Byte
   equality is asserted against the files in `src/`.
3. **The view layer must not define `query`, `compare`, `buildIndex` or `formatValue`.**
   Query logic lives in the engine, once.
4. **Both surfaces return identical results** for 23 real queries, all facet counts,
   comparison tables and every formatted value.
5. **Payload compaction round-trips exactly.** Every provenance key must be in the
   interning encoding; omit one and the round-trip test catches it.
6. **Builds are deterministic** — same inputs, byte-identical catalogue and page.
7. **Every source file has a recorded SHA-256** in the build metadata.
