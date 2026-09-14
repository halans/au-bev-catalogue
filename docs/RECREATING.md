# Rebuilding and verifying this package

Everything here works with **Node 18+ and no network access**. There are no runtime
dependencies and nothing to install.

---

## 1. Verify the package is intact

```bash
node verify.js
```

Recomputes the SHA-256 of every file against `SHA256SUMS` and reports anything missing or
altered. Exit code 1 if any file fails.

Expected output:

```
90 files verified, 0 problem(s)
```

---

## 2. Run the test suite

```bash
node --test "test/*.test.js"
```

94 tests, all offline. They cover the query engine, the reconciler, the validator and its
four reporters, the CLI's exit-code contract, and cross-surface equivalence.

The equivalence tests rebuild the HTML page in memory, extract the module sources and the
embedded data back out of it, execute them in a VM, and diff the results against the Node
engine. They are the reason you can trust that the offline page and the CLI agree.

---

## 3. Rebuild every artefact from source

```bash
node bin/bev.js build
```

Reads `data/sources/*.json` and regenerates:

- `data/catalogue.json` — the reconciled catalogue every surface consumes
- `dist/index.html` — the self-contained offline explorer

Then regenerate the coverage document:

```bash
node scripts/coverage-report.js
```

### Confirming the rebuild is faithful

Builds are deterministic: identical inputs produce byte-identical output. The one input
that is not a file is the build date, which is stamped into the catalogue and the page.
The date this package was built with ships in `BUILD_DATE`, so pass it back:

```bash
node bin/bev.js build --now "$(cat BUILD_DATE)"
node verify.js
```

That reproduces `data/catalogue.json` and `dist/index.html` exactly, and `verify.js`
should report 0 problems. If it does not, either a source snapshot was edited or the
build stopped being deterministic — both are worth investigating.

Omitting `--now` stamps *today's* date instead, which legitimately changes those two files
and will make `verify.js` flag them. That is expected, not a fault.

---

## 4. Use it

```bash
node bin/bev.js list --max price=60000 --min range=400 -s priceAud
node bin/bev.js show kia__ev5__air-standard-range-2wd
node bin/bev.js compare tesla__model-y__rear-wheel-drive byd__sealion-7__premium --only-diff
node bin/bev.js coverage
node bin/bev.js validate
```

Open `dist/index.html` in any browser — double-click it, no server needed. It carries all
276 vehicles and their provenance inline.

One online-only nicety: the page links Google Fonts for its display typeface. Offline it
falls back to the system sans-serif stack and is otherwise fully functional — search,
filters, sorting, comparison and the source dialog are all local.

### Install the CLI globally (optional)

```bash
npm link          # from the package root, no network needed
bev --help
```

---

## What is in the package

| Path | Purpose |
| --- | --- |
| `bin/bev.js` | CLI |
| `src/schema.js` | Field definitions — the single source of truth |
| `src/engine.js` | Search, filter, sort, compare. Shared by both surfaces verbatim |
| `src/rehydrate.js` | Expands the page's interned provenance table |
| `src/adapters/snapshot.js` | Reads brand snapshots, emits observations |
| `src/reconcile.js` | Precedence merge, conflict capture, derived fields |
| `src/validate.js` | Rule engine with off/warn/error severities |
| `src/coverage.js` | Completeness and freshness measurement |
| `src/reporters.js` | pretty / json / ci / sarif output |
| `src/build.js`, `src/build-html.js` | Artefact builders |
| `data/sources/*.json` | **Cached upstream snapshots** — the raw inputs, 57 files |
| `data/catalogue.json` | Prebuilt catalogue |
| `dist/index.html` | Prebuilt offline explorer |
| `test/` | The full suite |
| `docs/` | Schema, extending guide, coverage report, this file |
| `SHA256SUMS`, `verify.js` | Integrity manifest and offline verifier |
| `BUILD_DATE` | The date this package was built, for reproducing the artefacts exactly |

The cached snapshots are what make this reproducible without a network. Refreshing them
requires re-checking manufacturer websites — see `docs/EXTENDING.md`.

---

## Troubleshooting

**`catalogue not built`** (exit 3) — run `node bin/bev.js build` first.

**`usage error`** (exit 2) — a flag or value was rejected; the message names the valid
options. Distinct from exit 1, which means the data itself failed validation.

**Validation reports ~877 warnings** — expected, and not a fault. They record unpublished
fields, low-confidence values, drive-away prices and non-WLTP range figures. Errors should
be 0; if you see errors, the data has a genuine defect.

**The page shows em dashes** — that is a figure the publisher does not state. It is not a
rendering failure, and it is deliberately not filled with an estimate.
