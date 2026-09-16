# Merge the electricvehicle.life article's styling into the About page

## Goal

Two changes, requested together:

1. Rename "Catalogue" to "Directory" in the one remaining visible spot that still says
   "Catalogue" (the site already calls itself "Directory" everywhere else — `<title>`,
   meta descriptions, `data/catalogue.json`'s `meta.name`).
2. Replace the About page's current look (shared with `index.html`: `.crumb`/`.panel`/
   `.about-body` on the site's app-like design system) with the visual language of the
   electricvehicle.life blog post that covers this same project — `i-tried-to-build-a-
   complete-list-of-every-electric-car-sold-in-australia.html` (a local copy was reviewed
   at `/Users/halans/Downloads/i-tried-to-build-a-complete-list-of-every-electric-car-
   sold-in-australia.html`) — and pull in specific content from that article, adapted to
   use live computed data rather than the article's fixed numbers.

This builds on the narrative redesign already shipped
(`docs/superpowers/specs/2026-09-16-about-page-narrative-design.md`), which this
supersedes for `about.html`'s markup and CSS (not for `index.html`, which is unaffected
except for the one heading rename).

## Non-goals

- No change to `index.html`'s design system, layout, or `STYLES` beyond the single `<h1>`
  text rename. `index.html` keeps its existing app/tool look.
- No rename of internal code identifiers (`catalogue.json`, `loadCatalogue()`,
  `CATALOGUE_PATH`, the `catalogue` parameter name, code comments) or of `README.md`/
  `package.json` — confirmed with the user: site-visible text only.
- No copying of the article's fixed numbers (276 variants, 79%/21%/0% provenance mix,
  etc.) as static strings — anything numeric is computed from the live catalogue at build
  time, the same as the rest of this page already does. Where the article's own prose
  makes a specific numeric claim, the About page states the *current, real* number in the
  same rhetorical spot, even though it may drift from the article's (dated) figures.
- No copying of the article's first-person voice ("I checked...", "I built..."). The
  About page stays in the neutral project voice already established.
- No copying of the article's masthead-only elements that only make sense for a
  standalone blog post: the `.kicker` byline date ("September 2026"), the external CTA
  link to the hosted explorer, and the broken-image-handling `<script>` at the bottom of
  the reference file (a quirk of that page's hosting platform, unrelated to this site).
- No change to `src/coverage.js` or any other source-of-truth module. The one new figure
  used (provenance mix as percentages) is derived entirely from data `coverage.js`
  already computes and returns (`report.provenanceMix`, `totals.populatedFields`) — the
  percentage conversion happens in `build-html.js`'s existing `computeCoverageSections()`
  helper, alongside the other view-layer formatting it already does.

## Part 1: Catalogue → Directory

`src/build-html.js:852`, inside `buildHtml()`:

```diff
- <h1>Australian BEV Catalogue</h1>
+ <h1>Australian BEV Directory</h1>
```

Nothing else in `buildHtml()` changes (confirmed via grep: this is the only user-visible
"Catalogue" left in `src/build-html.js`; every other occurrence of the string
`catalogue`/`Catalogue` in that file is a code identifier — `catalogue` parameter names,
`computeCoverageSections(catalogue)`, `compactPayload(catalogue, meta)`, the `CATALOGUE`
JS variable holding the embedded payload, and two code comments — none of which are
user-visible page text).

`about.html`'s own two "back to the catalogue" links are handled as part of the full
rewrite in Part 2 (they become "back to the directory").

## Part 2: About page redesign

### New computed value: provenance mix percentages

Add to `computeCoverageSections()`'s return value (`src/build-html.js`, alongside the
existing `totals`/`emptyBrandList`/`licenceList`/`worstFields`):

```js
const mix = catalogue.coverage?.provenanceMix || {};
const populatedFields = totals.populatedFields || 0;
const pct = (n) => (populatedFields ? Math.round((n / populatedFields) * 1000) / 10 : 0);
const manufacturerPct = pct(mix.manufacturer || 0);
const pressPct = pct(mix.press || 0);
const governmentPct = pct((mix['green-vehicle-guide'] || 0) + (mix['overseas-regulator'] || 0));
```

(Exact variable-destructuring mechanics are an implementation detail for the plan; the
important part is: this reads `catalogue.coverage.provenanceMix` and
`catalogue.coverage.totals.populatedFields`, both of which `src/coverage.js` already
computes and returns today — verified directly against a live build:
`{ manufacturer: 3712, press: 1046 }` out of 4758 populated field-instances, i.e.
manufacturer 78%, press 22%, government 0% currently. No changes to `coverage.js`.)

`buildHtml()` doesn't use these three values (only `buildAboutHtml()` does) — no change
to `buildHtml()`'s existing destructuring of `computeCoverageSections()`.

### New stylesheet: `ABOUT_STYLES`

A new template-literal constant in `src/build-html.js`, alongside the existing `STYLES`,
used only by `buildAboutHtml()` (which stops using the shared `STYLES` — and therefore
stops using `.crumb`/`.panel`/`.about-body`, all of which were added across the prior
narrative-redesign task and are now About-page-only anyway, so nothing else references
them). Content: the design CSS from the reference article's `<style>` block — `:root`
custom properties through `footer p{...}` (roughly lines 12–143 of the reference file) —
carried over essentially verbatim: `.kicker`, `.top-inner`, `.standfirst`, `.byline`,
`article`/`article h2`/`article h3`/`article ul`/`article li`, `hr.rule`, `.stats`/`.stat`,
`.deadends`/`.deadend`/`.verdict`, `.rules`, `.defect`, `.pull`, `.cta`, `footer`/`footer p`.

Excluded from the copy: the reference file's second `<style>` block
(`.ha-img-placeholder`/`@keyframes ha-img-pulse`) and the closing broken-image-handling
`<script>` and `postMessage`/Escape-key script — these exist only because that page is
hosted on a third-party publishing platform (pub.hyperagent.com) with its own embed
conventions; they have no purpose on this project's own static site.

### `buildAboutHtml()` rewrite

Full replacement of the function's markup (head through `</html>`), reusing
`computeCoverageSections(catalogue)` for `totals`, `emptyBrandList`, `licenceList`,
`worstFields`, and the three new percentage values above.

**`<head>`:** same `<title>`/meta description as today, `<style>${ABOUT_STYLES}</style>`
instead of `${STYLES}`.

**`<header class="top">`:**

```html
<div class="wrap top-inner">
  <span class="kicker">Methodology · Australia</span>
  <h1>About this directory</h1>
  <p class="standfirst">Comparing battery-electric cars sold in Australia usually means
  a dozen browser tabs of manufacturer marketing copy, each using its own test cycle,
  its own definition of "usable" battery capacity, and its own idea of what counts as
  on sale. This directory puts that in one place — and instead of asking you to take
  any number on trust, it names the publisher behind every figure and is upfront about
  where the data is thin.</p>
  <p class="byline"><a href="index.html">← Back to the directory</a> · Part of the
  <a href="https://electricvehicle.life">electricvehicle.life</a> blog</p>
</div>
```

**`<article class="wrap">`**, in order:

1. **Stat strip** (`.stats`, four `.stat` cells — live totals, not the article's numbers):
   Variants tracked (`totals.variants`), Brands checked (`totals.brandsChecked`), Core
   fields populated (`totals.coreCompleteness`%), Source conflicts recorded
   (`totals.conflicts`).

2. `<hr class="rule">`

3. **"Why there's no single official dataset"** (`h2`):
   - Paragraph: `The honest answer to "can this be complete, from open data, kept
     current?" is: two of those three, yes. An audit of the actual Australian sources
     found no open dataset of BEV models to build from.`
   - `<dl class="deadends">`, five `.deadend` entries (`dt`/`dd` + `.verdict` span),
     condensed/reworded from the article into neutral voice:

     | dt | dd | verdict |
     |---|---|---|
     | Green Vehicle Guide | The only official per-model source, and it has a live data service — but access needs a signed third-party licence agreement, and even then it carries energy consumption and ADR figures, not battery capacity, DC charge rate or price. | Licence-gated |
     | data.gov.au | No vehicle-specification dataset exists. Its catalogue API was queried directly — there are datasets for EV charger locations, nothing about the cars themselves. | Doesn't exist |
     | Register of Approved Vehicles | A VIN-at-a-time lookup, with no bulk export and no API. Useful for one car's record; no use for building a list. | VIN-only |
     | VFACTS | The industry's own sales data, held behind a subscription — cut off even from the Electric Vehicle Council in 2024. | Paywalled |
     | ev-database.org | The richest EV specification data anywhere, but its terms explicitly prohibit automated collection. Bulk access is a paid commercial licence. | Terms forbid it |

   - Paragraph: `That is the entire landscape: there is no open Australian dataset of
     battery-electric vehicle models. So this directory's primary source is each
     manufacturer's own Australian website — the authoritative public statement of what
     is actually sold here — with Australian motoring press filling documented gaps.
     That has a consequence worth stating plainly: the code behind this directory is
     open, but the data is mixed.`
   - Pull-quote: `<p class="pull">You don't have to trust the directory. You can check
     it.</p>`
   - Sub-heading `<h3>Source licences</h3>`, paragraph: `Specification figures are
     restated facts attributed to their publisher, not open-licensed data, and each
     record carries its licence in its provenance.`, then `<ul>${licenceList}</ul>`,
     then: `Figures are restated facts attributed to each publisher. This directory is
     not affiliated with any manufacturer.`

4. **"What 'complete' means here"** (`h2`):
   - Paragraph (existing, kept): `Every brand with an Australian distributor was
     checked, including those that turned out to sell no BEV. Model coverage is the
     goal; per-field completeness is measured, not claimed.`
   - Existing totals line: `${totals.brandsChecked} brands checked ·
     ${totals.brandsWithNoBev} with no BEV on sale · ${totals.conflicts} source
     conflicts recorded`
   - New line: `The provenance mix is worth stating plainly too:
     <strong>${manufacturerPct}% of populated fields come from manufacturers,
     ${pressPct}% from motoring press, and ${governmentPct}% from any government
     source.</strong>`
   - Sub-heading `<h3>Checked, no BEV on sale</h3>`, `<ul>${emptyBrandList}</ul>`

5. **"Where the gaps are"** (`h2`):
   - Paragraph (existing, kept): `Coverage isn't uniform across fields. Some
     specifications — brand, model, body type, availability — are published by every
     manufacturer and sit at 100%. Others, like published energy consumption or gross
     battery capacity, are the fields manufacturers most often leave out of their own
     marketing pages, so they're the ones most likely to show as unknown here rather
     than guessed at.`
   - Sub-heading `<h3>Least complete fields</h3>`, `<ul>${worstFields}</ul>`

6. **"Rules the data obeys"** (`h2`):
   - Paragraph: `A few rules apply everywhere in this dataset, so a filtered list or a
     sorted column never quietly implies more than the sources actually say:`
   - `<div class="rules">`, four `h3`+`p` pairs (all four of the current page's rules,
     restyled into the callout box instead of a plain bullet list):
     1. `A missing value is always unknown` — `Never zero, and never an estimate carried
        over from an overseas-spec version of the same model.`
     2. `Range figures are never merged across test cycles` — `WLTP, NEDC and CLTC
        produce different numbers for the same car — a Chinese-market CLTC figure isn't
        comparable to a European WLTP one, and is flagged as such.`
     3. `Numeric filters exclude unknowns` — `Filtering to "under $50,000" will never
        quietly include a car whose price isn't published.`
     4. `Sorting puts unknowns last` — `In both directions, so "cheapest first" never
        presents an unpriced car as free.`

7. **"What it caught in itself"** (`h2`, new section):
   - Paragraph: `A validator with ESLint-style severities checks the data on every
     build. It has caught real defects, which says more than any feature description
     could:`
   - Three `.defect` blocks (numbered `.n` circle + heading + paragraph), reworded to
     neutral voice:
     1. `A 12-seat Skywell van failed the seat-count check` — `The van was correct — the
        plausibility limit of 9 seats was wrong, because it was written with passenger
        cars in mind and the dataset also covers commercial vans.`
     2. `A Denza charging-speed figure tripped the 1,500 kW ceiling` — `Not a
        transcription error — BYD genuinely publishes that figure for its FLASH
        Charging system. It's only reachable on a China-market connector, though, so
        the record now carries that caveat instead of implying it's available here.`
     3. `The filter panel was impossible to open on a phone` — `A base CSS rule set the
        toggle to <code>display: none</code> after the media query meant to reveal it,
        so it lost the cascade at every screen size. Every automated test passed — only
        loading the page at 390 pixels wide caught it.`

8. **CTA** (`.cta`, replacing the article's external-explorer link with an internal one):
   ```html
   <div class="cta">
     <h3>Browse the directory</h3>
     <p>All ${totals.variants} variants. Search, filter, sort, compare vehicles side by
     side, and check the source of any figure.</p>
     <a class="btn" href="index.html">Open the directory →</a>
   </div>
   ```

**`<footer class="wrap">`** (article's flat footer pattern, not the shared site footer):
```html
<footer class="wrap">
  <p>Built ${escapeHtml(meta.builtAt || '')}. <a href="index.html">← Back to the
  directory</a></p>
</footer>
```

## Markup/CSS summary

- `src/build-html.js`: one-line `<h1>` text change in `buildHtml()`; a new `pct`-style
  derivation added to `computeCoverageSections()`; a new `ABOUT_STYLES` constant; full
  rewrite of `buildAboutHtml()`'s returned template to the structure above.
- No changes to `bin/bev.js`, `scripts/package.js`, `src/coverage.js`, or any other
  source module.
- The now-unused `.crumb`/`.about-body`(+descendants)/`.panel`-inside-about-page CSS in
  the shared `STYLES` constant becomes dead code once `buildAboutHtml()` stops using it.
  `.panel` itself stays (still used by `index.html`'s aside/toolbar/results panels).
  `.crumb` and `.about-body`(+descendants) become fully dead and should be removed from
  `STYLES` in the same pass that rewrites `buildAboutHtml()`, the same way the previous
  redesign removed the `.fcols` footer-grid CSS once nothing referenced it — confirm via
  grep before deleting, exactly as that prior task did.

## Testing

- `node bin/bev.js build` then visually check `dist/about.html`: reads as a single-column
  editorial article (matching the reference file's visual rhythm — kicker, standfirst,
  stat strip, dead-end list with red verdict pills, callout boxes, numbered defect cards,
  pull-quote, dark CTA box), at both desktop and ~400px mobile width (the reference CSS
  already has its own `@media(max-width:600px)` rules — confirm those still apply as-is).
- Confirm the provenance-mix percentages in the rendered page match a manual computation
  from `data/catalogue.json`'s `coverage.provenanceMix` and
  `coverage.totals.populatedFields` at the time of the build.
- Confirm `index.html`'s `<h1>` reads "Australian BEV Directory" and nothing else on that
  page changed (its own CSS/layout untouched).
- `npm test` must stay green — `test/equivalence.test.js` only exercises `buildHtml()`,
  unaffected by the `buildAboutHtml()` rewrite; the one-line `<h1>` change in `buildHtml()`
  doesn't touch anything an existing test asserts on.
- No new automated test needed for the provenance-mix percentage derivation: it's a
  three-line arithmetic conversion of numbers `coverage.js` already computes and already
  ships (verified against real output above), consistent with this page's established
  testing rationale (static view-layer formatting, no new business logic).

## Risks / open questions

- None outstanding — rename scope and which article content to reuse were both confirmed
  with the user before this spec was written (via explicit multiple-choice questions),
  and the design was presented and approved before writing this document.
