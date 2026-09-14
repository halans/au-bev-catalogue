# Australian BEV Catalogue

Every battery-electric vehicle sold new in Australia — 276 variants across 50 brands —
reconciled from multiple published sources, with provenance recorded **per field**.

Zero runtime dependencies. One shared engine drives three surfaces: a CLI, a
self-contained offline HTML explorer, and a JSON data bundle.

```
npm run build      # snapshots -> data/catalogue.json + dist/index.html
npm test           # 94 tests
npm run validate   # lint the data; exit 1 on errors
npm run coverage   # measured completeness, per field and per brand
```

---

## The honest answer to "can this be complete, from open data, kept current?"

Two of those three, yes. The third needs qualifying, so here is what an audit of the
actual endpoints found (September 2026):

| Source | Status | Verdict |
| --- | --- | --- |
| **Green Vehicle Guide** | SOAP service at `greenvehicleguide.gov.au/VehicleDataService/GVGDataService.svc`, live — but access needs a signed Third Party User Licence Agreement (email gvg@infrastructure.gov.au) | **Not open.** Also carries energy consumption and ADR figures, not battery kWh, DC charge rate or price |
| **data.gov.au** | Queried the CKAN API directly | **No vehicle-spec dataset exists.** Only EV charger locations |
| **RAV / RVCS** | `rover.infrastructure.gov.au/RAVPublicSearch/` | **VIN-only lookup.** No bulk export, no API |
| **VFACTS / FCAI** | Subscription | **Paywalled.** Cut off even the Electric Vehicle Council in 2024–2026 |
| **Electric Vehicle Council** | PDF reports | No machine-readable feed |
| **ev-database.org** | Richest field coverage anywhere | **Terms prohibit automated collection.** Bulk access is a paid commercial licence. Not used here |
| **Wikidata** | CC0, SPARQL endpoint | Genuinely open, but AU-market coverage is sparse and inconsistent |
| **EU EAFO / NZ MVR / UK VCA** | Genuinely open | Wrong market — useful only to cross-check shared global models |

So there is **no open Australian dataset of BEV models**. This project's primary source is
therefore each manufacturer's own Australian website — the authoritative public statement
of what is actually sold here — with Australian motoring press filling documented gaps.

That has a consequence worth stating plainly: **the code is open, the data is mixed.**
Specification figures are restated facts attributed to their publisher, not open-licensed
data. Each record carries its licence in its provenance.

### What "complete" means here

Complete is defined as: *every BEV variant offered new by a brand with an Australian
distributor, at a stated snapshot date* — including runout and announced models.

Under that definition, model coverage is the goal and **per-field completeness is
measured, not claimed**. Current build: **89.9% of core fields populated**, ranging from
100% (brand, model, body, availability) down to 22.8% (published consumption figures).
The full matrix is in [docs/COVERAGE.md](docs/COVERAGE.md).

Six brands were checked and found to sell no BEV — Citroën, Foton, Isuzu, Jaguar,
Mahindra, Ram. They ship as files with empty variant arrays, because a recorded negative
is different from an omission.

---

## Quick start

```bash
node bin/bev.js build          # build the catalogue and the page
node bin/bev.js list --help
```

Cheap long-range cars:

```
$ bev list --max price=45000 --min range=400 -s priceAud

BRAND         MODEL          VARIANT                     kWh  RANGE  DC kW   kW    PRICE  AVAIL
------------  -------------  ------------------------  -----  -----  -----  ---  -------  -------
Aion          UT             Premium                      60    430     87  150  $31,990  current
GWM           Ora 5 SUV      Lux                           —    435    120  150  $32,490  current
Aion          UT             Luxury                       60    430     87  150  $35,990  current
Leapmotor     B05            BEV                           —    482      —    —  $35,990  current
BYD           Dolphin        Premium                    60.5    427      —  150  $36,990  current
MG            MG4 EV         Essence 64                   64    452      —  140  $36,990  current
```

`—` means the publisher does not state the figure. It never means zero, and it is never
filled with an estimate.

More real output: [list](docs/examples/list.md) · [show](docs/examples/show.md) ·
[coverage](docs/examples/coverage.md) · [validate](docs/examples/validate.md)

---

## Commands

| Command | Purpose |
| --- | --- |
| `bev build` | Reconcile snapshots into `data/catalogue.json` and `dist/index.html` |
| `bev list` | Search, filter, sort. `-f pretty\|json\|csv` |
| `bev show <id>` | One vehicle, every field, with the source of each |
| `bev compare <id> <id>…` | Spec table; `--only-diff` hides fields that agree |
| `bev validate` | Lint the data. `-f pretty\|json\|ci\|sarif` |
| `bev coverage` | Measured completeness per field and per brand |
| `bev brands` | Every brand checked, including those with no BEV |
| `bev sources` | Attribution URLs per brand |
| `bev fields` | The schema, with units and plausibility envelopes |

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, or validation found no errors |
| 1 | Validation found at least one error-severity finding |
| 2 | Usage error — bad flag, unknown command, unknown reporter |
| 3 | Environment error — catalogue not built, sources unreadable |

A mistyped flag and a data failure are deliberately different codes, so CI can tell a
broken pipeline from broken data.

---

## How it works

```
data/sources/*.json          one hand-verified snapshot per brand
        │
        ▼  src/adapters/snapshot.js      emits field-level OBSERVATIONS
        │
        ▼  src/reconcile.js              precedence merge + conflict capture
        │
        ▼  data/catalogue.json           the single artefact every surface reads
        │
        ├─▶ bin/bev.js                   CLI
        ├─▶ dist/index.html              offline explorer (engine inlined verbatim)
        └─▶ data/catalogue.json          JSON bundle / API payload
```

### One engine, three surfaces

`src/engine.js` implements search, filtering, sorting, comparison and value formatting.
The CLI requires it. The HTML builder **inlines it byte-for-byte** into the page behind a
small CommonJS shim, so the browser executes the same code rather than a parallel
implementation.

`test/equivalence.test.js` enforces this from two directions: it asserts the page contains
the module sources verbatim, then reconstructs the page's own modules inside a VM from the
built HTML and diffs 23 real queries, all facet counts, comparison tables and every
formatted value against the Node results. Adding query logic to the view layer fails the
suite by design.

### Source precedence

When two sources disagree by more than 2%, the higher-precedence value wins and the
rejected value is **recorded as a conflict**, never silently dropped. A lower-precedence
source may still *fill* a field the winner left empty — that is a fill, not a conflict.

| Precedence | Source kind |
| --- | --- |
| 100 | Green Vehicle Guide (adapter ready; needs a licence) |
| 80 | Manufacturer's Australian site |
| 50 | Australian motoring press |
| 30 | Wikidata |
| 20 | Overseas regulator (UK VCA, EU EAFO) |

### Rules the data obeys

- **A missing value is `null`.** Never zero, never an estimate, never carried over from an
  overseas-spec version of the same model.
- **Range cycles are never merged.** WLTP, NEDC and CLTC are stored with the cycle named.
  A Chinese-market CLTC figure is not comparable to WLTP and is flagged.
- **Numeric filters exclude unknowns.** Filtering to "under $50,000" will not quietly
  include a car whose price is unpublished — that would let a filtered list imply specs
  the catalogue does not have.
- **Sorting puts unknowns last** in both directions, so "cheapest first" never presents an
  unpriced car as free.

---

## Validation

ESLint-style rules with `off` / `warn` / `error` severities, overridable per run:

```bash
bev validate --rule missing-core-field:error --rule range-cycle-not-wltp:off
bev validate --format sarif > bev.sarif      # code-scanning dashboards
bev validate --format ci                     # GitHub workflow commands
bev validate --max-warnings 500              # budget warnings in CI
```

| Rule | Default |
| --- | --- |
| `unparseable-source` | error |
| `duplicate-identity` | error |
| `enum-out-of-domain` | error |
| `value-out-of-envelope` | error |
| `derived-inconsistent` | error |
| `missing-identity-field` | error |
| `missing-core-field` | warn |
| `source-conflict` | warn |
| `low-confidence-field` | warn |
| `stale-snapshot` | warn |
| `price-basis-not-msrp` | warn |
| `range-cycle-not-wltp` | warn |
| `no-provenance-url` | warn |

The current build is **0 errors, 877 warnings**. The warnings are the honest signal: 502
low-confidence fields, 333 unpublished core fields, 32 drive-away prices, 5 source
conflicts, 4 non-WLTP range figures. They are not noise to be suppressed — they are the
catalogue telling you where it is weak.

Two genuine defects were caught by these rules during the first build and fixed:
a 12-seat Skywell van rejected by a too-narrow seat envelope (the envelope was wrong),
and Denza's 1,500 kW FLASH Charging figure (the figure is real, but it is BYD's
China-connector ceiling and unreachable on Australian CCS2 — now recorded with that
caveat).

---

## Keeping it current

`bev build` re-reconciles from the snapshots and records a SHA-256 of every source file in
the build metadata, so a rebuild can prove which inputs produced it. Builds are
deterministic: same inputs, byte-identical output (asserted by a test).

Refreshing the underlying data means re-verifying brand pages and updating
`data/sources/<brand>.json`. Because adapters are isolated per brand, one brand going
stale cannot corrupt the rest, and `stale-snapshot` warnings surface it.

See [docs/EXTENDING.md](docs/EXTENDING.md) for adding a brand, a field, or a new data
source, and [docs/SCHEMA.md](docs/SCHEMA.md) for the record format.

---

## Licence and attribution

Code: **CC BY-NC-SA 4.0**.

Data: mixed, and recorded per field. Specification figures are restated facts attributed
to the publisher named in each record's provenance — most often the manufacturer's
Australian website. This project is not affiliated with any manufacturer. Prices are
indicative, exclude on-road costs unless the record says otherwise, and change frequently.
