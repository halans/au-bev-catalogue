# Narrative content for the About page

## Goal

Turn `dist/about.html` (currently a bare "About this directory" heading over a raw
4-column stats/lists grid, moved there from the old footer) into a proper landing page:
a short motivation hook, then a data-honesty narrative — condensed from the README's
"can this be complete, from open data, kept current?" investigation — with the existing
completeness stats and lists woven into the story they explain, instead of sitting
unexplained in a grid.

## Non-goals

- No change to `data/catalogue.json`, `src/coverage.js`, or any computed figures. This is
  a `buildAboutHtml()` template/copy change in `src/build-html.js` only.
- No change to `index.html`'s content or its existing link to `about.html`.
- No new data fields. "Rules the data obeys" (new section 5 below) is static prose
  copied from README.md, not derived from the catalogue at build time.
- No architecture/engine explanation (the README's "one engine, three surfaces"
  section) — confirmed out of scope; this page stays about the data, not the code.

## Content source

Condensed/rewritten from `README.md`'s "The honest answer to..." section and "Rules the
data obeys" list, in neutral project voice (not first person), for a general reader
rather than a developer.

## Page structure

Replaces the current `<header>` + single `.panel.fcols` grid in `buildAboutHtml()` with:

1. **Header** — breadcrumb back-link above the `<h1>`, then a lede paragraph (new) as
   the `.sub`:

   > Comparing battery-electric cars sold in Australia usually means a dozen browser
   > tabs of manufacturer marketing copy, each using its own test cycle, its own
   > definition of "usable" battery capacity, and its own idea of what counts as on
   > sale. This directory puts that in one place — and instead of asking you to take
   > any number on trust, it names the publisher behind every figure and is upfront
   > about where the data is thin.

2. **Section — "Why there's no single official dataset"** (new heading + narrative,
   condensed from README):

   > The honest answer to "can this be complete, from open data, kept current?" is: two
   > of those three, yes. An audit of the actual Australian sources found no open
   > dataset of BEV models to build from. The Green Vehicle Guide's data service is
   > live, but access needs a signed third-party licence agreement — and it doesn't
   > carry battery capacity, DC charge rate or price anyway. data.gov.au has no
   > vehicle-specification dataset, only EV charger locations. The RAV/RVCS registry is
   > VIN-only, with no bulk export. VFACTS, the industry's own sales data, is paywalled
   > — cut off even from the Electric Vehicle Council. ev-database.org has the richest
   > field coverage anywhere, but its terms prohibit automated collection.
   >
   > So this project's primary source is each manufacturer's own Australian website —
   > the authoritative public statement of what is actually sold here — with Australian
   > motoring press filling documented gaps. That has a consequence worth stating
   > plainly: the code behind this directory is open, but the data is mixed.
   > Specification figures are restated facts attributed to their publisher, not
   > open-licensed data, and each record carries its licence in its provenance.

   Followed immediately by the existing **Source licences** list (`licenceList`,
   unchanged computation), in a `.panel`, now with context instead of sitting bare.

3. **Section — "What 'complete' means here"** (existing paragraph, kept verbatim) plus
   the existing totals line (`${totals.brandsChecked} brands checked · ...`).

   Followed immediately by the existing **Checked, no BEV on sale** list
   (`emptyBrandList`, unchanged computation, unchanged `'None.'` fallback).

4. **Section — "Where the gaps are"** (new short paragraph):

   > Coverage isn't uniform across fields. Some specifications — brand, model, body
   > type, availability — are published by every manufacturer and sit at 100%. Others,
   > like published energy consumption or gross battery capacity, are the fields
   > manufacturers most often leave out of their own marketing pages, so they're the
   > ones most likely to show as unknown here rather than guessed at.

   Followed immediately by the existing **Least complete fields** list (`worstFields`,
   unchanged computation, unchanged `'All fields fully populated.'` fallback).

5. **Section — "Rules the data obeys"** (new, static, not derived from the catalogue):

   > A few rules apply everywhere in this dataset, so a filtered list or a sorted
   > column never quietly implies more than the sources actually say:

   - A missing value is always recorded as unknown — never zero, and never an estimate
     carried over from an overseas-spec version of the same model.
   - Range figures from different test cycles (WLTP, NEDC, CLTC) are never merged into
     one number — a Chinese-market CLTC figure isn't comparable to a European WLTP one,
     and is flagged as such.
   - Numeric filters exclude unknowns rather than including them by default — filtering
     to "under $50,000" will never quietly include a car whose price isn't published.
   - Sorting always puts unknown values last in both directions, so "cheapest first"
     never presents an unpriced car as free.

6. **Footer** — unchanged: `Built ${meta.builtAt}. ← Back to the catalogue`.

The old `"Figures are restated facts attributed to each publisher. This page is not
affiliated with any manufacturer."` line currently appended after the source-licences
list is kept, moved to sit right after that list (end of section 2).

## Markup / CSS changes

- `buildAboutHtml()` rewritten: header gains a breadcrumb line and lede paragraph;
  the single `.panel.fcols` 4-column grid is replaced by five `<section>` blocks in one
  column, each an optional heading + paragraph(s) followed by a `.panel` card holding
  its list (sections 1–2 pair naturally; section 5 has no list).
- `computeCoverageSections()` in `src/build-html.js`: unchanged, still the single source
  of `totals` / `emptyBrandList` / `licenceList` / `worstFields` for both pages.
- `STYLES` in `src/build-html.js`:
  - Remove the `.fcols` rule — after this change nothing references it (`index.html`'s
    footer already stopped using it in the previous change; confirm with a repo-wide
    grep before deleting).
  - Add a small, scoped rule set for the About page's prose layout: a `.crumb` class for
    the back-link line above `<h1>`, and spacing/width rules for the new `<section>`
    blocks and their paragraphs (capped prose width, spacing between sections). Exact
    values are an implementation detail, not a design decision — follow the existing
    file's inline-style-for-one-offs convention where a named class isn't reused
    elsewhere, matching the codebase's existing pattern (e.g. `.notice`, `.sub`).
- No changes to `index.html`'s markup, `bin/bev.js`, or `scripts/package.js` — the About
  page's file path and generation entry points are already wired up from the previous
  change.

## Testing

- `node bin/bev.js build` then visually check `dist/about.html` in a browser: reads
  top-to-bottom as a coherent narrative, each list sits directly under the paragraph
  that explains it, back-link and footer link both work, mobile width (~400px) doesn't
  overflow.
- `npm test` must stay green — `test/equivalence.test.js` only exercises `buildHtml()`
  (the catalogue page), not `buildAboutHtml()`, so this change isn't expected to touch
  any existing assertion, but the full suite is the regression check.
- No new automated test is needed: this is static copy/markup with no new logic branch
  (the four data-driven lists already have existing fallback-string behavior, unchanged
  here).

## Risks / open questions

- None outstanding — content, voice, scope (data rules only, no architecture section),
  and layout (interleaved, not narrative-then-grid) were all confirmed with the user
  before this spec was written.
