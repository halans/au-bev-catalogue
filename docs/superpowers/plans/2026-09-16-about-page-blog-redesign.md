# About Page Blog-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the one remaining visible "Catalogue" to "Directory" on the main page, and replace the About page's current app-style look with the visual language of the electricvehicle.life article that covers this project, pulling in specific content from that article (dead-end source audit, provenance-mix stat, "what it caught in itself" defects, pull-quote) using live computed data rather than the article's fixed numbers.

**Architecture:** All changes are inside `src/build-html.js`. `buildHtml()` gets a one-line text change. `computeCoverageSections()` gains a small percentage derivation from data `src/coverage.js` already computes (no changes to `coverage.js`). A new `ABOUT_STYLES` constant (lifted from the reference article's CSS) sits alongside the existing `STYLES`. `buildAboutHtml()` is fully rewritten to use `ABOUT_STYLES` instead of `STYLES`, dropping the now-dead `.about-body`/`.panel`-inside-about-page CSS from `STYLES`.

**Tech Stack:** Plain Node.js template literals producing static HTML/CSS. No test framework changes — copy/markup plus a three-line arithmetic derivation of already-computed data, no new business logic.

**Spec:** `docs/superpowers/specs/2026-09-16-about-page-blog-redesign-design.md`

**Reference file (read-only, do not modify or ship):** `/Users/halans/Downloads/i-tried-to-build-a-complete-list-of-every-electric-car-sold-in-australia.html`

---

### Task 1: Rename "Catalogue" to "Directory" on the main page

**Files:**
- Modify: `src/build-html.js` — the `buildHtml()` function's `<h1>`

- [ ] **Step 1: Change the heading text**

Find this exact line:

```js
      <h1>Australian BEV Catalogue</h1>
```

Replace with:

```js
      <h1>Australian BEV Directory</h1>
```

This line is inside `buildHtml()`'s `<header class="top">` block (has `<p class="crumb">Part of the <a href="https://electricvehicle.life">electricvehicle.life</a> blog</p>` immediately above it and `<p class="sub">Every battery-electric model and variant sold new in Australia...` immediately below it — use that surrounding context to confirm you're editing the right occurrence if the string match isn't unique). Do not change anything else on that line or nearby lines.

- [ ] **Step 2: Sanity-check the file still parses**

Run: `node -e "require('./src/build-html.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/build-html.js
git commit -m "$(cat <<'EOF'
Rename Catalogue to Directory in the main page heading

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add provenance-mix percentages to `computeCoverageSections()`

**Files:**
- Modify: `src/build-html.js` — the `computeCoverageSections()` function

- [ ] **Step 1: Add the derivation and extend the return value**

Find this exact block:

```js
  const worstFields = (report.byField || [])
    .filter((f) => f.completeness < 100)
    .sort((a, b) => a.completeness - b.completeness)
    .slice(0, 8)
    .map((f) => `<li>${escapeHtml(f.label)} — <span class="num">${f.completeness}%</span> populated</li>`)
    .join('');

  return { totals, emptyBrandList, licenceList, worstFields };
}
```

Replace with:

```js
  const worstFields = (report.byField || [])
    .filter((f) => f.completeness < 100)
    .sort((a, b) => a.completeness - b.completeness)
    .slice(0, 8)
    .map((f) => `<li>${escapeHtml(f.label)} — <span class="num">${f.completeness}%</span> populated</li>`)
    .join('');

  // Aggregate figures for the About page's provenance-mix stat. `provenanceMix` and
  // `populatedFields` already come straight out of coverage.js's own totals — this is
  // percentage formatting, not a new measurement.
  const mix = report.provenanceMix || {};
  const populatedFields = totals.populatedFields || 0;
  const pctOf = (n) => (populatedFields ? Math.round((n / populatedFields) * 1000) / 10 : 0);
  const manufacturerPct = pctOf(mix.manufacturer || 0);
  const pressPct = pctOf(mix.press || 0);
  const governmentPct = pctOf((mix['green-vehicle-guide'] || 0) + (mix['overseas-regulator'] || 0));

  return {
    totals, emptyBrandList, licenceList, worstFields,
    manufacturerPct, pressPct, governmentPct,
  };
}
```

`buildHtml()`'s existing `const { totals } = computeCoverageSections(catalogue);` needs no change — destructuring a subset of a larger return object is valid JS and the extra fields are simply unused there.

- [ ] **Step 2: Sanity-check the file still parses**

Run: `node -e "require('./src/build-html.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Verify the numbers against live data**

Run:
```bash
node -e "
const { build } = require('./src/build');
const { buildHtml } = require('./src/build-html');
const catalogue = build({ now: '2026-09-16' });
const mix = catalogue.coverage.provenanceMix;
const total = catalogue.coverage.totals.populatedFields;
console.log('manufacturer', Math.round((mix.manufacturer||0)/total*1000)/10);
console.log('press', Math.round((mix.press||0)/total*1000)/10);
console.log('government', Math.round(((mix['green-vehicle-guide']||0)+(mix['overseas-regulator']||0))/total*1000)/10);
"
```
Expected: three numbers that look like plausible percentages (roughly manufacturer ~78, press ~22, government ~0 as of the last check — exact figures will drift as the underlying data changes, that's expected and correct). This is a manual cross-check, not an automated test — just confirm the arithmetic isn't inverted or off by a factor of 100 (i.e. not printing `0.78` or `7800`).

- [ ] **Step 4: Commit**

```bash
git add src/build-html.js
git commit -m "$(cat <<'EOF'
Add provenance-mix percentage derivation for the About page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Remove dead About-page CSS and add the new `ABOUT_STYLES` block

**Files:**
- Modify: `src/build-html.js` — end of the `STYLES` constant, and a new constant added after it

- [ ] **Step 1: Confirm `.about-body` will become fully dead after Task 4**

Run: `grep -n "about-body" src/build-html.js`

Expected: every match is either inside the `STYLES` constant (the CSS rules being removed in Step 2 below) or inside the current `buildAboutHtml()` function (`<main class="wrap about-body">`), which Task 4 rewrites. If you find `about-body` referenced anywhere else, STOP and re-read before continuing — this task's CSS removal assumes nothing else uses it.

Also run: `grep -n '"crumb"' src/build-html.js` — confirm `buildHtml()` still has `<p class="crumb">Part of the ... blog</p>` (added in an earlier, already-shipped task). The `.crumb` CSS rule must NOT be removed — only the `.about-body` rules are dead. `about.html` will use its own `.byline` class after Task 4, not `.crumb`.

- [ ] **Step 2: Remove the dead `.about-body` CSS**

Find this exact block:

```css
.crumb{font-size:12px;margin-bottom:8px}
.about-body section{max-width:70ch;margin:0 0 36px}
.about-body section:last-child{margin-bottom:0}
.about-body h2{font-size:20px;margin-bottom:10px}
.about-body p{color:var(--ink-soft);margin:0 0 12px}
.about-body p:last-child{margin-bottom:0}
.about-body ul{margin:0;padding-left:16px}
.about-body li{margin-bottom:4px}
.about-body .panel{padding:18px;margin-top:14px}
.about-body .panel h3{font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-faint);margin-bottom:8px}
`;
```

Replace with (keeping `.crumb`, removing everything else, keeping the closing backtick-semicolon that ends the `STYLES` template literal):

```css
.crumb{font-size:12px;margin-bottom:8px}
`;
```

- [ ] **Step 3: Add the new `ABOUT_STYLES` constant immediately after `STYLES`**

Immediately after the line you just edited (the `` `; `` that closes `STYLES`), insert this new constant. Find this anchor (the start of the next section of the file):

```js
`;

/* ------------------------------------------------------------------ *
 * View layer — browser-only presentation code.
 * ------------------------------------------------------------------ */
```

Replace with (inserting `ABOUT_STYLES` between the two):

```js
`;

/* ------------------------------------------------------------------ *
 * About page — a self-contained editorial stylesheet, deliberately NOT
 * shared with STYLES above. The About page reads as a standalone article
 * (styling merged from the electricvehicle.life post that covers this
 * project), not as another screen of the app-like catalogue UI, so it gets
 * its own design tokens/typography/layout rather than reusing the wrap
 * width, panel cards, or colour values the main page uses.
 * ------------------------------------------------------------------ */

const ABOUT_STYLES = `
:root{
  --ink:#12131a; --ink-soft:#4a4e5e; --ink-faint:#8b8fa0;
  --paper:#ffffff; --wash:#f4f5f8; --line:#e3e5ec;
  --accent:#0b5cff; --accent-soft:#e8efff;
  --warn:#b45309; --warn-soft:#fef8e7;
  --bad:#b42318; --good:#067647;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:17px; line-height:1.65;
}
h1,h2,h3{font-family:Caprasimo,Inter,system-ui,sans-serif;font-weight:400;letter-spacing:-.015em;margin:0}
.num{font-variant-numeric:tabular-nums}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:2px}

.wrap{max-width:720px;margin:0 auto;padding:0 24px}
@media(max-width:600px){ .wrap{padding:0 18px} body{font-size:16.5px} }

header.top{border-bottom:1px solid var(--line);background:var(--wash)}
.kicker{
  display:inline-block;font-size:11px;font-weight:600;letter-spacing:.09em;
  text-transform:uppercase;color:var(--accent);margin-bottom:14px
}
.top-inner{padding:52px 0 40px}
@media(max-width:600px){ .top-inner{padding:34px 0 28px} }
h1{font-size:clamp(30px,6.2vw,50px);line-height:1.08}
.standfirst{
  font-size:clamp(17px,2.2vw,20px);line-height:1.55;color:var(--ink-soft);
  margin:20px 0 0;max-width:34em
}
.byline{
  margin-top:24px;padding-top:18px;border-top:1px solid var(--line);
  font-size:13px;color:var(--ink-faint)
}

article{padding:44px 0 20px}
article > p{margin:0 0 1.35em}
article h2{
  font-size:clamp(22px,3.4vw,30px);line-height:1.18;
  margin:2.4em 0 .7em;
}
article h3{
  font-family:Inter,sans-serif;font-weight:700;font-size:17px;letter-spacing:0;
  margin:2em 0 .5em
}
article ul{margin:0 0 1.35em;padding-left:22px}
article li{margin-bottom:.6em}
strong{font-weight:600}

hr.rule{border:0;border-top:1px solid var(--line);margin:3em 0}

.stats{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));
  gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:10px;overflow:hidden;margin:2em 0
}
.stat{background:var(--paper);padding:16px 18px}
.stat b{
  display:block;font-family:Caprasimo,Inter,sans-serif;font-weight:400;
  font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums
}
.stat span{
  display:block;margin-top:4px;font-size:11px;text-transform:uppercase;
  letter-spacing:.07em;color:var(--ink-faint);line-height:1.35
}

.deadends{margin:2em 0;border-top:1px solid var(--line)}
.deadend{
  display:grid;grid-template-columns:200px 1fr;gap:4px 24px;
  padding:16px 0;border-bottom:1px solid var(--line)
}
@media(max-width:600px){ .deadend{grid-template-columns:1fr;gap:2px} }
.deadend dt{font-weight:600;font-size:15.5px}
.deadend dd{margin:0;font-size:15.5px;color:var(--ink-soft)}
.verdict{
  display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;padding:2px 7px;border-radius:4px;
  background:#fee2e2;color:var(--bad);margin-top:6px
}

.rules{
  background:var(--wash);border:1px solid var(--line);border-radius:10px;
  padding:6px 24px;margin:2em 0
}
.rules h3{margin:1.4em 0 .4em}
.rules p{font-size:15.5px;color:var(--ink-soft);margin:0 0 1.4em}

.defect{
  display:flex;gap:18px;padding:20px 0;border-top:1px solid var(--line)
}
.defect:last-of-type{border-bottom:1px solid var(--line)}
.defect .n{
  flex:0 0 34px;height:34px;border-radius:50%;background:var(--warn-soft);
  color:var(--warn);font-weight:700;font-size:15px;
  display:flex;align-items:center;justify-content:center
}
.defect div.body{flex:1;min-width:0}
.defect h3{margin:0 0 .3em}
.defect p{margin:0;font-size:15.5px;color:var(--ink-soft)}

.pull{
  margin:2.2em 0;padding:0 0 0 22px;border-left:3px solid var(--accent);
  font-size:clamp(18px,2.4vw,21px);line-height:1.45;color:var(--ink)
}

.cta{
  margin:2.5em 0 0;padding:26px;border-radius:10px;
  background:var(--ink);color:#fff
}
.cta h3{font-family:Caprasimo,Inter,sans-serif;font-weight:400;font-size:22px;color:#fff;margin-bottom:8px}
.cta p{margin:0 0 18px;color:#c7cad6;font-size:15.5px}
.cta a.btn{
  display:inline-block;background:#fff;color:var(--ink);text-decoration:none;
  font-weight:600;font-size:15px;padding:11px 20px;border-radius:7px
}
.cta a.btn:hover{background:var(--accent-soft)}

footer{
  border-top:1px solid var(--line);margin-top:56px;padding:26px 0 56px;
  font-size:13.5px;color:var(--ink-faint)
}
footer p{margin:0 0 .8em;max-width:60em}
`;

/* ------------------------------------------------------------------ *
 * View layer — browser-only presentation code.
 * ------------------------------------------------------------------ */
```

- [ ] **Step 4: Sanity-check the file still parses**

Run: `node -e "require('./src/build-html.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add src/build-html.js
git commit -m "$(cat <<'EOF'
Add ABOUT_STYLES and remove now-dead about-body CSS

The About page gets its own stylesheet (Task 4 wires up buildAboutHtml()
to use it) instead of sharing the catalogue page's design system.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewrite `buildAboutHtml()` in the article's visual style

**Files:**
- Modify: `src/build-html.js` — the entire `buildAboutHtml()` function

- [ ] **Step 1: Replace the whole function body**

Find this exact block (the complete current `buildAboutHtml()` function, from its doc comment through its closing brace):

```js
/** The methodology/coverage page the catalogue's footer links out to. */
function buildAboutHtml(catalogue) {
  const meta = catalogue.meta || {};
  const { totals, emptyBrandList, licenceList, worstFields } = computeCoverageSections(catalogue);

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About — Australian Battery-Electric Vehicle Directory</title>
<meta name="description" content="How completeness is measured and sourced for the Australian Battery-Electric Vehicle Directory.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>

<header class="top">
  <div class="wrap top-inner">
    <div>
      <p class="crumb"><a href="index.html">← Back to the catalogue</a> · Part of the <a href="https://electricvehicle.life">electricvehicle.life</a> blog</p>
      <h1>About this directory</h1>
      <p class="sub">Comparing battery-electric cars sold in Australia usually means a dozen browser tabs of manufacturer marketing copy, each using its own test cycle, its own definition of "usable" battery capacity, and its own idea of what counts as on sale. This directory puts that in one place — and instead of asking you to take any number on trust, it names the publisher behind every figure and is upfront about where the data is thin.</p>
    </div>
  </div>
</header>

<main class="wrap about-body">
  <section>
    <h2>Why there's no single official dataset</h2>
    <p>The honest answer to "can this be complete, from open data, kept current?" is: two of those three, yes. An audit of the actual Australian sources found no open dataset of BEV models to build from. The Green Vehicle Guide's data service is live, but access needs a signed third-party licence agreement — and it doesn't carry battery capacity, DC charge rate or price anyway. data.gov.au has no vehicle-specification dataset, only EV charger locations. The RAV/RVCS registry is VIN-only, with no bulk export. VFACTS, the industry's own sales data, is paywalled — cut off even from the Electric Vehicle Council. ev-database.org has the richest field coverage anywhere, but its terms prohibit automated collection.</p>
    <p>So this project's primary source is each manufacturer's own Australian website — the authoritative public statement of what is actually sold here — with Australian motoring press filling documented gaps. That has a consequence worth stating plainly: the code behind this directory is open, but the data is mixed. Specification figures are restated facts attributed to their publisher, not open-licensed data, and each record carries its licence in its provenance.</p>
    <div class="panel">
      <h3>Source licences</h3>
      <ul>${licenceList}</ul>
      <p>Figures are restated facts attributed to each publisher. This page is not affiliated with any manufacturer.</p>
    </div>
  </section>

  <section>
    <h2>What "complete" means here</h2>
    <p>Every brand with an Australian distributor was checked, including those that turned out to sell no BEV. Model coverage is the goal; per-field completeness is measured, not claimed.</p>
    <p class="num">${totals.brandsChecked || 0} brands checked · ${totals.brandsWithNoBev || 0} with no BEV on sale · ${totals.conflicts || 0} source conflicts recorded</p>
    <div class="panel">
      <h3>Checked, no BEV on sale</h3>
      <ul>${emptyBrandList || '<li>None.</li>'}</ul>
    </div>
  </section>

  <section>
    <h2>Where the gaps are</h2>
    <p>Coverage isn't uniform across fields. Some specifications — brand, model, body type, availability — are published by every manufacturer and sit at 100%. Others, like published energy consumption or gross battery capacity, are the fields manufacturers most often leave out of their own marketing pages, so they're the ones most likely to show as unknown here rather than guessed at.</p>
    <div class="panel">
      <h3>Least complete fields</h3>
      <ul>${worstFields || '<li>All fields fully populated.</li>'}</ul>
    </div>
  </section>

  <section>
    <h2>Rules the data obeys</h2>
    <p>A few rules apply everywhere in this dataset, so a filtered list or a sorted column never quietly implies more than the sources actually say:</p>
    <ul>
      <li>A missing value is always recorded as unknown — never zero, and never an estimate carried over from an overseas-spec version of the same model.</li>
      <li>Range figures from different test cycles (WLTP, NEDC, CLTC) are never merged into one number — a Chinese-market CLTC figure isn't comparable to a European WLTP one, and is flagged as such.</li>
      <li>Numeric filters exclude unknowns rather than including them by default — filtering to "under $50,000" will never quietly include a car whose price isn't published.</li>
      <li>Sorting always puts unknown values last in both directions, so "cheapest first" never presents an unpriced car as free.</li>
    </ul>
  </section>
</main>

<footer>
  <div class="wrap">
    <p>Built ${escapeHtml(meta.builtAt || '')}. <a href="index.html">← Back to the catalogue</a></p>
  </div>
</footer>

</body>
</html>
`;
}
```

Replace with:

```js
/** The methodology/coverage page the directory's footer links out to — styled as a
 *  standalone editorial article (merged from the electricvehicle.life post covering
 *  this project), not as another screen of the catalogue app UI. */
function buildAboutHtml(catalogue) {
  const meta = catalogue.meta || {};
  const {
    totals, emptyBrandList, licenceList, worstFields,
    manufacturerPct, pressPct, governmentPct,
  } = computeCoverageSections(catalogue);

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About — Australian Battery-Electric Vehicle Directory</title>
<meta name="description" content="How completeness is measured and sourced for the Australian Battery-Electric Vehicle Directory.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${ABOUT_STYLES}</style>
</head>
<body>

<header class="top">
  <div class="wrap top-inner">
    <span class="kicker">Methodology · Australia</span>
    <h1>About this directory</h1>
    <p class="standfirst">Comparing battery-electric cars sold in Australia usually means a dozen browser tabs of manufacturer marketing copy, each using its own test cycle, its own definition of "usable" battery capacity, and its own idea of what counts as on sale. This directory puts that in one place — and instead of asking you to take any number on trust, it names the publisher behind every figure and is upfront about where the data is thin.</p>
    <p class="byline"><a href="index.html">← Back to the directory</a> · Part of the <a href="https://electricvehicle.life">electricvehicle.life</a> blog</p>
  </div>
</header>

<article class="wrap">

  <div class="stats">
    <div class="stat"><b class="num">${totals.variants || 0}</b><span>Variants tracked</span></div>
    <div class="stat"><b class="num">${totals.brandsChecked || 0}</b><span>Brands checked</span></div>
    <div class="stat"><b class="num">${totals.coreCompleteness || 0}%</b><span>Core fields populated</span></div>
    <div class="stat"><b class="num">${totals.conflicts || 0}</b><span>Source conflicts recorded</span></div>
  </div>

  <hr class="rule">

  <h2>Why there's no single official dataset</h2>

  <p>The honest answer to "can this be complete, from open data, kept current?" is: two of those three, yes. An audit of the actual Australian sources found no open dataset of BEV models to build from.</p>

  <dl class="deadends">
    <div class="deadend">
      <dt>Green Vehicle Guide</dt>
      <dd>The only official per-model source, and it has a live data service — but access needs a signed third-party licence agreement, and even then it carries energy consumption and ADR figures, not battery capacity, DC charge rate or price.
      <span class="verdict">Licence-gated</span></dd>
    </div>
    <div class="deadend">
      <dt>data.gov.au</dt>
      <dd>No vehicle-specification dataset exists. Its catalogue API was queried directly — there are datasets for EV charger locations, nothing about the cars themselves.
      <span class="verdict">Doesn't exist</span></dd>
    </div>
    <div class="deadend">
      <dt>Register of Approved Vehicles</dt>
      <dd>A VIN-at-a-time lookup, with no bulk export and no API. Useful for one car's record; no use for building a list.
      <span class="verdict">VIN-only</span></dd>
    </div>
    <div class="deadend">
      <dt>VFACTS</dt>
      <dd>The industry's own sales data, held behind a subscription — cut off even from the Electric Vehicle Council in 2024.
      <span class="verdict">Paywalled</span></dd>
    </div>
    <div class="deadend">
      <dt>ev-database.org</dt>
      <dd>The richest EV specification data anywhere, but its terms explicitly prohibit automated collection. Bulk access is a paid commercial licence.
      <span class="verdict">Terms forbid it</span></dd>
    </div>
  </dl>

  <p>That is the entire landscape: there is no open Australian dataset of battery-electric vehicle models. So this directory's primary source is each manufacturer's own Australian website — the authoritative public statement of what is actually sold here — with Australian motoring press filling documented gaps. That has a consequence worth stating plainly: the code behind this directory is open, but the data is mixed.</p>

  <p class="pull">You don't have to trust the directory. You can check it.</p>

  <h3>Source licences</h3>
  <p>Specification figures are restated facts attributed to their publisher, not open-licensed data, and each record carries its licence in its provenance.</p>
  <ul>${licenceList}</ul>
  <p>Figures are restated facts attributed to each publisher. This directory is not affiliated with any manufacturer.</p>

  <h2>What "complete" means here</h2>

  <p>Every brand with an Australian distributor was checked, including those that turned out to sell no BEV. Model coverage is the goal; per-field completeness is measured, not claimed.</p>

  <p>${totals.brandsChecked || 0} brands checked · ${totals.brandsWithNoBev || 0} with no BEV on sale · ${totals.conflicts || 0} source conflicts recorded</p>

  <p>The provenance mix is worth stating plainly too: <strong>${manufacturerPct}% of populated fields come from manufacturers, ${pressPct}% from motoring press, and ${governmentPct}% from any government source.</strong></p>

  <h3>Checked, no BEV on sale</h3>
  <ul>${emptyBrandList || '<li>None.</li>'}</ul>

  <h2>Where the gaps are</h2>

  <p>Coverage isn't uniform across fields. Some specifications — brand, model, body type, availability — are published by every manufacturer and sit at 100%. Others, like published energy consumption or gross battery capacity, are the fields manufacturers most often leave out of their own marketing pages, so they're the ones most likely to show as unknown here rather than guessed at.</p>

  <h3>Least complete fields</h3>
  <ul>${worstFields || '<li>All fields fully populated.</li>'}</ul>

  <h2>Rules the data obeys</h2>

  <p>A few rules apply everywhere in this dataset, so a filtered list or a sorted column never quietly implies more than the sources actually say:</p>

  <div class="rules">
    <h3>A missing value is always unknown</h3>
    <p>Never zero, and never an estimate carried over from an overseas-spec version of the same model.</p>

    <h3>Range figures are never merged across test cycles</h3>
    <p>WLTP, NEDC and CLTC produce different numbers for the same car — a Chinese-market CLTC figure isn't comparable to a European WLTP one, and is flagged as such.</p>

    <h3>Numeric filters exclude unknowns</h3>
    <p>Filtering to "under $50,000" will never quietly include a car whose price isn't published.</p>

    <h3>Sorting puts unknowns last</h3>
    <p>In both directions, so "cheapest first" never presents an unpriced car as free.</p>
  </div>

  <h2>What it caught in itself</h2>

  <p>A validator with ESLint-style severities checks the data on every build. It has caught real defects, which says more than any feature description could:</p>

  <div class="defect">
    <div class="n">1</div>
    <div class="body">
      <h3>A 12-seat Skywell van failed the seat-count check</h3>
      <p>The van was correct — the plausibility limit of 9 seats was wrong, because it was written with passenger cars in mind and the dataset also covers commercial vans.</p>
    </div>
  </div>

  <div class="defect">
    <div class="n">2</div>
    <div class="body">
      <h3>A Denza charging-speed figure tripped the 1,500 kW ceiling</h3>
      <p>Not a transcription error — BYD genuinely publishes that figure for its FLASH Charging system. It's only reachable on a China-market connector, though, so the record now carries that caveat instead of implying it's available here.</p>
    </div>
  </div>

  <div class="defect">
    <div class="n">3</div>
    <div class="body">
      <h3>The filter panel was impossible to open on a phone</h3>
      <p>A base CSS rule set the toggle to <code>display: none</code> after the media query meant to reveal it, so it lost the cascade at every screen size. Every automated test passed — only loading the page at 390 pixels wide caught it.</p>
    </div>
  </div>

  <div class="cta">
    <h3>Browse the directory</h3>
    <p>All ${totals.variants || 0} variants. Search, filter, sort, compare vehicles side by side, and check the source of any figure.</p>
    <a class="btn" href="index.html">Open the directory →</a>
  </div>

</article>

<footer class="wrap">
  <p>Built ${escapeHtml(meta.builtAt || '')}. <a href="index.html">← Back to the directory</a></p>
</footer>

</body>
</html>
`;
}
```

Use the Edit tool with the old block as `old_string` and the new block as `new_string`.

- [ ] **Step 2: Sanity-check the file still parses**

Run: `node -e "require('./src/build-html.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/build-html.js
git commit -m "$(cat <<'EOF'
Rewrite About page in the electricvehicle.life article's visual style

Replaces the shared app-style layout with a standalone editorial look
(kicker, stat strip, dead-end source audit with verdict badges, rules
callout, numbered defect list, pull-quote, CTA), and adds a live
provenance-mix stat and a new "what it caught in itself" section
covering three real defects the project's own validator/testing found.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Build, run the suite, and visually verify

**Files:** none (verification only)

- [ ] **Step 1: Rebuild the catalogue and both HTML pages**

Run: `node bin/bev.js build`
Expected: three lines of output, no errors, confirming both `dist/index.html` and `dist/about.html` were regenerated.

- [ ] **Step 2: Run the full test suite**

Run: `node --test test/*.test.js`
Expected: `# fail 0`. `test/equivalence.test.js` only exercises `buildHtml()`; the one-line `<h1>` rename in that function doesn't touch anything an existing assertion checks, so this suite should be unaffected.

- [ ] **Step 3: Visually verify `dist/index.html`**

Serve `dist/` (e.g. `python3 -m http.server <port> --directory dist`) and open `index.html`. Confirm the `<h1>` now reads "Australian BEV Directory", and that nothing else on the page changed (layout, filters, table, footer all identical to before this plan).

- [ ] **Step 4: Visually verify `dist/about.html`**

Open `about.html` in the same server. Confirm:
- It reads as a single-column editorial article — kicker label, large heading, standfirst paragraph, byline/back-link line, stat strip, then the article body.
- The 5-entry dead-end source list renders with red "verdict" badges (Licence-gated, Doesn't exist, VIN-only, Paywalled, Terms forbid it).
- The pull-quote ("You don't have to trust the directory. You can check it.") renders as a large left-bordered callout.
- The provenance-mix sentence shows real numbers (not placeholders, not `NaN%`, not `undefined`).
- The "Rules the data obeys" section renders as a shaded callout box with 4 items, not a bullet list.
- The new "What it caught in itself" section shows 3 numbered defect cards.
- The dark CTA box at the end says "Browse the directory" and its button links to `index.html`.
- The footer links back to `index.html` with "← Back to the directory" text (not "catalogue").
- At a narrow viewport (~400px), the dead-end list's grid collapses to one column (per the `@media(max-width:600px)` rule already in `ABOUT_STYLES`) and nothing overflows horizontally.
- `index.html`'s existing "About this directory & methodology →" link and footer link still navigate to `about.html` correctly.

- [ ] **Step 5: Stop any server started for verification**

If a local HTTP server was started for Steps 3–4, stop it.

No commit needed for this task — it's verification only, no file changes.
