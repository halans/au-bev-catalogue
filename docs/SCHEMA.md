# Record schema and data formats

Generated shapes are defined once in `src/schema.js`. This document describes what the
consumer sees.

---

## A reconciled record

Every record in `data/catalogue.json` has the same shape. Unknown fields are `null` —
present as keys, never omitted, so a consumer can distinguish "unknown" from "not a field".

```json
{
  "id": "kia__ev5__air-standard-range-2wd",
  "brand": "Kia",
  "model": "EV5",
  "variant": "Air Standard Range (2WD)",
  "bodyType": "suv",
  "segment": "suv-medium",
  "availability": "current",
  "batteryUsableKwh": 64.2,
  "batteryGrossKwh": null,
  "rangeKm": 400,
  "rangeCycle": "WLTP",
  "consumptionWhPerKm": null,
  "acChargeKw": 6.6,
  "dcChargeKw": 102,
  "drive": "FWD",
  "powerKw": 160,
  "torqueNm": 310,
  "zeroTo100s": 8.5,
  "seats": 5,
  "towingBrakedKg": 300,
  "v2l": true,
  "priceAud": 49990,
  "priceBasis": "Drive-away (Kia AU offers page)",

  "efficiencyWhPerKm": 161,
  "dollarsPerKmRange": 124.98,

  "brandSlug": "kia",
  "brandNotes": "EV5 data is high-confidence, sourced from Kia's official MY26 brochure…",
  "lowConfidenceFields": ["dcChargeKw", "towingBrakedKg"],

  "provenance": {
    "rangeKm": {
      "sourceKind": "manufacturer",
      "url": "https://www.kia.com/content/dam/kwcms/au/en/images/pdf/ev5/kia-ev5-brochure.pdf",
      "publisher": "Kia Australia",
      "licence": "proprietary-factual (specification facts restated with attribution)",
      "fetchedAt": "2026-09-13",
      "confidence": "high",
      "adapter": "snapshot"
    }
  }
}
```

### Identity

`id` is `brand__model__variant`, slugged. It is stable across builds as long as those
three strings are stable. Renaming a variant changes its id — treat ids as stable
references, not permanent ones.

### Derived fields

Computed by the reconciler, never sourced, `null` unless both inputs exist:

| Field | Definition |
| --- | --- |
| `efficiencyWhPerKm` | `batteryUsableKwh × 1000 ÷ rangeKm` — implied consumption |
| `dollarsPerKmRange` | `priceAud ÷ rangeKm` — crude value metric |

`efficiencyWhPerKm` is *implied*, not measured. Where a manufacturer also publishes
`consumptionWhPerKm` and the two disagree by more than 35%, `derived-inconsistent` fires.

### Provenance

One entry per **populated** field. Absent fields have no provenance entry, because there
is nothing to attribute. `confidence` is `high` (manufacturer or government),
`medium` (press), or `low` (flagged by the author, or a weak source).

---

## Field reference

| Field | Type | Unit | Core | Envelope | Notes |
| --- | --- | --- | --- | --- | --- |
| `brand` | string | | ✓ | | Identity |
| `model` | string | | ✓ | | Identity |
| `variant` | string | | ✓ | | Identity |
| `bodyType` | enum | | ✓ | | hatch, sedan, wagon, suv, coupe, ute, van, people-mover |
| `segment` | enum | | | | light, small, medium, large, suv-small, suv-medium, suv-large, ute, van, sports, luxury |
| `availability` | enum | | ✓ | | current, runout, announced |
| `batteryUsableKwh` | number | kWh | ✓ | 10–250 | Usable, not gross, where both are published |
| `batteryGrossKwh` | number | kWh | | 10–250 | Must be ≥ usable |
| `rangeKm` | number | km | ✓ | 50–1200 | Only comparable within one cycle |
| `rangeCycle` | enum | | ✓ | | WLTP, ADR 81/02, NEDC, CLTC, WLTC |
| `consumptionWhPerKm` | number | Wh/km | | 80–400 | As published, not derived |
| `acChargeKw` | number | kW | | 1–50 | On-board charger |
| `dcChargeKw` | number | kW | ✓ | 10–1500 | Peak, not sustained |
| `drive` | enum | | ✓ | | FWD, RWD, AWD |
| `powerKw` | number | kW | ✓ | 20–1500 | Combined where multi-motor |
| `torqueNm` | number | Nm | | 50–2000 | Null where only a front/rear split is published |
| `zeroTo100s` | number | s | | 1.5–30 | |
| `seats` | number | | | 2–23 | Up to 23 for minibuses and crew vans |
| `towingBrakedKg` | number | kg | | 0–4500 | Braked capacity |
| `v2l` | boolean | | | | Vehicle-to-load |
| `priceAud` | number | AUD | ✓ | 15000–1000000 | See `priceBasis` |
| `priceBasis` | string | | | | Free text. Anything not matching MSRP/before on-road/excl trips a warning |

**Envelopes are error thresholds, not filters.** A value outside the range is treated as a
transcription mistake, not an unusual car. `dcChargeKw` reaches 1500 because BYD genuinely
publishes that figure for FLASH Charging — a real published ceiling, reachable only on a
China-market connector.

---

## Catalogue envelope

```json
{
  "meta": {
    "builtAt": "2026-09-13",
    "schemaVersion": 1,
    "recordCount": 276,
    "brandsChecked": 56,
    "adapters": ["snapshot"],
    "sourceFileCount": 57,
    "snapshotChecksums": { "kia.json": "<sha256>" },
    "licences": { "manufacturer": "proprietary-factual …" },
    "sourcePrecedence": { "green-vehicle-guide": 100, "manufacturer": 80 },
    "disclaimer": "…",
    "gapSweep": { }
  },
  "fields": [ ],
  "derivedFields": [ ],
  "enums": { },
  "records": [ ],
  "brands": [ ],
  "conflicts": [ ],
  "duplicates": [ ],
  "problems": [ ],
  "coverage": { }
}
```

`snapshotChecksums` lets a rebuild prove which inputs produced it. `brands` includes
brands with zero variants — a recorded negative result.

### Conflict entry

```json
{
  "identity": "honda__super-one__super-one",
  "field": "rangeKm",
  "chosen":   { "value": 206, "sourceKind": "press",        "url": "https://…" },
  "rejected": { "value": 253, "sourceKind": "manufacturer", "url": "https://…" }
}
```

---

## Library use

```js
const bev = require('au-bev-catalogue');

const catalogue = bev.loadCatalogue();
const index = bev.buildIndex(catalogue);

const affordable = bev.query(index, {
  ranges: { priceAud: { max: 50000 }, rangeKm: { min: 400 } },
  facets: { availability: ['current'] },
  sort: 'rangeKm',
  direction: 'desc'
});

console.log(affordable.total, affordable.records.map(bev.displayName));
```

`query` returns `{ total, offset, limit, records }`. `total` is the match count before
pagination. The records are the same objects the catalogue holds — treat them as
read-only.

Other exports: `facets(index)`, `byId(index, id)`, `compare(index, ids)`,
`formatValue(key, value)`, `validate(catalogue, opts)`, `coverage(catalogue, opts)`,
`report(name, result)`, `build(opts)`, `buildHtml(catalogue)`.

---

## CSV output

`bev list --format csv` emits `id` followed by every schema field in declaration order.
Unknowns are empty cells. Fields containing a comma, quote or newline are quoted with
doubled internal quotes.

## JSON reporter output

`bev validate --format json`:

```json
{
  "ok": false,
  "errorCount": 0,
  "warningCount": 877,
  "findings": [
    {
      "rule": "missing-core-field",
      "severity": "warn",
      "message": "core field \"priceAud\" is unknown",
      "id": "kia__ev9__gt-line",
      "field": "priceAud"
    }
  ]
}
```

`bev validate --format sarif` emits SARIF 2.1.0 with every rule declared in
`tool.driver.rules`, suitable for a code-scanning dashboard.
