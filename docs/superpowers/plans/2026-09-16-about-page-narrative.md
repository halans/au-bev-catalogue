# About Page Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `dist/about.html` from a bare heading over a raw 4-column stats grid into a landing-page-style narrative that explains the data-honesty story, with the existing completeness stats and lists woven into the sections that explain them.

**Architecture:** Pure content/markup change inside `src/build-html.js`: rewrite the `buildAboutHtml()` template and add a small set of scoped CSS rules to `STYLES`. No new data, no new computed fields, no changes to `index.html`, `bin/bev.js`, or `scripts/package.js` — those are already wired up from the prior change that split the About page out.

**Tech Stack:** Plain Node.js template literals producing static HTML/CSS. No test framework changes — this is copy/markup with no new logic branch, per the spec's testing section.

**Spec:** `docs/superpowers/specs/2026-09-16-about-page-narrative-design.md`

---

### Task 1: Replace the dead 4-column footer CSS with About-page narrative styles

**Files:**
- Modify: `src/build-html.js:253-261` (inside the `STYLES` template literal)

- [ ] **Step 1: Confirm `.fcols`, `footer h3`, `footer ul`, `footer li` are unused**

Run: `grep -n "fcols\|<footer\|</footer" src/build-html.js`

Expected output includes exactly these lines (line numbers may shift slightly but the shape must match — two `<footer>...</footer>` blocks, each containing only a `<p>`, and the `.fcols` CSS rule with no other `class="...fcols..."` or `<h3>`/`<ul>` inside either `<footer>`):

```
257:.fcols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px}
912:<footer>
916:</footer>
993:  <div class="panel fcols" style="padding:20px">
1015:<footer>
1019:</footer>
```

If either `<footer>` block contains an `<h3>` or `<ul>`, or `.fcols` is referenced anywhere other than line 993, STOP — the codebase has diverged from this plan's assumptions and the CSS in this task must not be deleted blind. Re-read `src/build-html.js` around both footers before continuing.

- [ ] **Step 2: Replace the CSS block**

Find this exact block (current lines 253-261):

```css
.conf.high{background:#dcfce7;color:var(--good)}

footer{border-top:1px solid var(--line);background:var(--paper);padding:26px 0 40px;font-size:12.5px;color:var(--ink-soft)}
footer h3{font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-faint);margin-bottom:8px}
.fcols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px}
footer ul{margin:0;padding-left:16px}
footer li{margin-bottom:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
```

Replace with:

```css
.conf.high{background:#dcfce7;color:var(--good)}

footer{border-top:1px solid var(--line);background:var(--paper);padding:26px 0 40px;font-size:12.5px;color:var(--ink-soft)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

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
```

Use the Edit tool with the old block as `old_string` and the new block as `new_string` (both include the unchanged `.conf.high` and `.sr` lines as anchors, so the match is unambiguous).

- [ ] **Step 3: Sanity-check the file still parses**

Run: `node -e "require('./src/build-html.js'); console.log('ok')"`
Expected: `ok` (a template literal syntax error would throw here immediately)

- [ ] **Step 4: Commit**

```bash
git add src/build-html.js
git commit -m "$(cat <<'EOF'
Replace dead footer-grid CSS with About-page narrative styles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewrite `buildAboutHtml()` with the narrative structure

**Files:**
- Modify: `src/build-html.js` — the `buildAboutHtml()` function (currently spans from `/** The methodology/coverage page...` to the closing `` ` ``/`}` before `function writeHtml`)

- [ ] **Step 1: Replace the header + main block**

Find this exact block:

```js
<header class="top">
  <div class="wrap top-inner">
    <div>
      <h1>About this directory</h1>
      <p class="sub"><a href="index.html">← Back to the catalogue</a></p>
    </div>
  </div>
</header>

<main class="wrap">
  <div class="panel fcols" style="padding:20px">
    <div>
      <h3>What "complete" means here</h3>
      <p>Every brand with an Australian distributor was checked, including those that turned out to sell no BEV. Model coverage is the goal; per-field completeness is measured, not claimed.</p>
      <p class="num">${totals.brandsChecked || 0} brands checked · ${totals.brandsWithNoBev || 0} with no BEV on sale · ${totals.conflicts || 0} source conflicts recorded</p>
    </div>
    <div>
      <h3>Least complete fields</h3>
      <ul>${worstFields || '<li>All fields fully populated.</li>'}</ul>
    </div>
    <div>
      <h3>Checked, no BEV on sale</h3>
      <ul>${emptyBrandList || '<li>None.</li>'}</ul>
    </div>
    <div>
      <h3>Source licences</h3>
      <ul>${licenceList}</ul>
      <p>Figures are restated facts attributed to each publisher. This page is not affiliated with any manufacturer.</p>
    </div>
  </div>
</main>
```

Replace with:

```js
<header class="top">
  <div class="wrap top-inner">
    <div>
      <p class="crumb"><a href="index.html">← Back to the catalogue</a></p>
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
```

Use the Edit tool with the old block as `old_string` and the new block as `new_string`.

Note: `totals`, `emptyBrandList`, `licenceList`, `worstFields` are already destructured at the top of `buildAboutHtml()` from `computeCoverageSections(catalogue)` — no change needed there.

- [ ] **Step 2: Sanity-check the file still parses**

Run: `node -e "require('./src/build-html.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/build-html.js
git commit -m "$(cat <<'EOF'
Rewrite About page as a narrative landing page

Interleaves the data-honesty story (condensed from README) with the
existing completeness stats/lists, instead of showing them as a bare
4-column grid with no context.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Build, run the suite, and visually verify

**Files:** none (verification only)

- [ ] **Step 1: Rebuild the catalogue and both HTML pages**

Run: `node bin/bev.js build`
Expected: three lines of output ending in `... core fields 90% populated` (or similar), with no errors. Confirms `dist/about.html` was regenerated.

- [ ] **Step 2: Run the full test suite**

Run: `node --test test/*.test.js`
Expected: `# fail 0` in the summary. `test/equivalence.test.js` only exercises `buildHtml()` (the catalogue page), so it is not expected to be affected by this change — a failure here would mean something outside the intended scope broke.

- [ ] **Step 3: Visually verify `dist/about.html` in a browser**

Serve the `dist/` directory and open `about.html` (e.g. `python3 -m http.server <port> --directory dist`, then navigate to `http://localhost:<port>/about.html`). Confirm:
- The page reads top-to-bottom as a coherent narrative: hero paragraph, then four sections, each with its heading, prose, and (where applicable) its `.panel` list directly beneath.
- The "Source licences" list sits inside the "Why there's no single official dataset" section; "Checked, no BEV on sale" sits inside "What 'complete' means here"; "Least complete fields" sits inside "Where the gaps are"; "Rules the data obeys" has no list, just four bullets.
- The breadcrumb "← Back to the catalogue" above the `<h1>` and the footer link both navigate to `index.html`.
- At a narrow viewport (~400px wide), no section or panel overflows horizontally.
- From `index.html`, the "About this directory & methodology →" link in the header and the footer link both still navigate to `about.html` correctly (unchanged from the prior change, but confirm nothing regressed).

- [ ] **Step 4: Stop any server started for verification**

If a local HTTP server was started for Step 3, stop it (e.g. `kill <pid>`).

No commit needed for this task — it's verification only, no file changes.
