# Shareable links for the HTML explorer

## Goal

Let someone share a URL that opens `dist/index.html` directly into a particular
state: one specific vehicle's detail dialog, and/or the current search/filter/sort/
compare selection. Today the page has no URL/hash/history handling at all — every
session starts from the same blank state.

## Non-goals

- No change to the CLI. `bev show <id>` / `bev list --filter ...` already address a
  vehicle or a query directly by argument; there is no analogous "link" concept for a
  terminal command.
- No change to `engine.js` or `schema.js`'s query semantics. This is purely a view-layer
  concern for the HTML surface.
- No server-side routing. The page is a single static file that may be opened over
  `file://` or from any static host, so all of this must work with zero server
  cooperation.

## Architecture

One new module, `src/url-state.js`, follows the same discipline already established
by `schema.js` / `engine.js` / `rehydrate.js`:

- No DOM globals, no `Date.now()`, no `Math.random()`.
- The only `require()` is `./schema` (for `FACET_FIELDS`, `FIELD_BY_KEY`,
  `SORTABLE_FIELDS`), matching engine.js's own stated constraint.
- Uses the global `URLSearchParams`, which exists in plain Node (no DOM needed) as
  well as every browser — so the module is unit-testable directly and needs no new
  dependency (the project has none, deliberately).
- Inlined verbatim into the built page via the existing `define()`/`require()` shim in
  `build-html.js`, exactly like the other three modules.
- Added to `INLINED_MODULES` in `test/equivalence.test.js`, so it gets the same
  byte-identity guarantee ("the page cannot silently diverge from src/") that
  schema/engine/rehydrate already have.

Everything that touches `document`/`location`/`history`/`navigator.clipboard` stays in
the page's view-layer script inside `build-html.js` (the `VIEW` template literal) —
never in `url-state.js` itself.

## `src/url-state.js` API

### `encodeState(state) -> string`

Builds a hash string (no leading `#`) from the page's `state` object. Only emits
params that differ from the default, so a plain unfiltered view produces an empty
string:

| Param | Present when | Example |
|---|---|---|
| `q` | `state.q` is non-empty | `q=ioniq` |
| `<facetField>` | that facet has active values | `brand=Kia,BYD` |
| `min-<field>` / `max-<field>` | that range bound is set | `min-priceAud=0` |
| `sort` | `state.sort !== 'name'` | `sort=rangeKm` |
| `dir` | `state.direction !== 'asc'` | `dir=desc` |
| `view` | `state.view !== 'table'` | `view=cards` |
| `compare` | `state.compare.length` | `compare=id1,id2` |
| `v` | `state.open` is set | `v=kia__ev5__air` |

Facet field names are exactly the schema field key (`schema.FACET_FIELDS`), so the
format is self-documenting and stable across rebuilds.

### `decodeState(hash) -> object`

Parses a hash string (with or without the leading `#`) into a **sparse** object —
it only sets a key when that param was actually present and valid. It never fills in
defaults; that's the caller's job. This lets the page layer "URL says X" on top of
"app default Y" instead of one wholesale-replacing the other.

Validation rules, all fail-silent (drop the param, never throw):
- A facet param is only honoured if its name is in `schema.FACET_FIELDS`.
- A `min-`/`max-` param is only honoured if the stripped field name is a real schema
  field and the value parses as a finite number.
- `sort` is only honoured if it's `'name'` or in `schema.SORTABLE_FIELDS`.
- `dir` must be exactly `'asc'` or `'desc'`.
- `view` must be exactly `'table'` or `'cards'`.
- `compare` is comma-split, empty entries dropped, truncated to 4 ids (the existing
  compare-tray cap).
- `v` is passed through as-is; whether it's a real vehicle id is checked later by
  `BEV.byId`, not by this module — `url-state.js` doesn't know about the catalogue.

This means a stale or hand-edited link degrades gracefully: unknown keys are ignored,
a dead vehicle id just doesn't open a dialog, and the rest of the state still restores.

## View-layer changes (`build-html.js`'s `VIEW` script)

1. **State shape.** Add `open: null` to the initial `state` object.

2. **`syncUrl()`** — new function:
   ```js
   function syncUrl(){
     var hash = UrlState.encodeState(state);
     var url = location.pathname + location.search + (hash ? '#' + hash : '');
     history.replaceState(null, '', url);
   }
   ```
   Always `replaceState`, never `pushState` — interacting with search/filters must not
   spam browser history. The address bar is kept accurate; the back button leaves the
   page, which is the standard behavior for this class of live-filtered UI.

3. **Call sites.** `syncUrl()` runs at the end of `render()` (covers query, facets,
   ranges, sort, direction, view, compare — everything `render()` already reacts to),
   and directly inside the dialog open/close paths, which don't call `render()`.

4. **Dialog open/close.**
   - `showProvenance(id)`: on finding a record, set `state.open = id` and call
     `syncUrl()`. On a missing record (stale id), clear `state.open` and sync instead
     of leaving a dangling reference.
   - Replace the single close-button listener with a listener on the dialog's own
     native `close` event (`el('dlg').addEventListener('close', ...)`), which fires for
     the close button, the Escape key, and any other native dismissal in one place. It
     sets `state.open = null` and calls `syncUrl()`.

5. **Page load / restore.** Before the first `render()`:
   ```js
   var restored = UrlState.decodeState(location.hash);
   if (restored.q != null) state.q = restored.q;
   if (restored.facets) state.facets = restored.facets;
   if (restored.ranges) state.ranges = restored.ranges;
   if (restored.sort) state.sort = restored.sort;
   if (restored.direction) state.direction = restored.direction;
   if (window.matchMedia('(max-width: 640px)').matches){ state.view = 'cards'; }
   if (restored.view) state.view = restored.view; // explicit URL wins over the mobile default
   if (restored.compare) state.compare = restored.compare;
   if (restored.open) state.open = restored.open;
   render();
   if (state.open) showProvenance(state.open); // no-ops cleanly if the id no longer exists
   ```

6. **Copy-link.** One shared helper:
   ```js
   function copyCurrentLink(button){
     var url = location.href;
     function done(ok){
       var original = button.textContent;
       button.textContent = ok ? 'Copied!' : 'Copy failed — select & copy manually';
       setTimeout(function(){ button.textContent = original; }, 1600);
     }
     if (navigator.clipboard && navigator.clipboard.writeText) {
       navigator.clipboard.writeText(url).then(function(){ done(true); }, function(){ fallbackCopy(url, done); });
     } else {
       fallbackCopy(url, done);
     }
   }
   function fallbackCopy(text, done){
     try {
       var ta = document.createElement('textarea');
       ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
       document.body.appendChild(ta); ta.focus(); ta.select();
       var ok = document.execCommand('copy');
       document.body.removeChild(ta);
       done(ok);
     } catch (err) { done(false); }
   }
   ```
   `navigator.clipboard.writeText` requires a secure context and is commonly blocked
   over `file://` (a realistic way this offline page gets opened), hence the
   `execCommand('copy')` fallback via a hidden textarea, which works in that context.
   Wired into the existing single delegated click handler via a new `data-copy-link`
   attribute, added to its `closest(...)` selector list alongside the existing
   `data-*` hooks.

7. **Two buttons reuse it, both marked `data-copy-link`:**
   - Toolbar (`.toolbar .tools`), next to the Table/Cards view buttons — copies
     whatever's currently on screen (filters, sort, view, open comparison).
   - Dialog head (`.dlg-head`), next to the close button — copies the same live URL,
     which already contains `v=<id>` while that dialog is open.

## Error handling / edge cases

- Unknown/removed vehicle id in `v=`: `showProvenance` already no-ops on a missing
  record; the load-time restore just doesn't open anything, filters still apply.
- Unknown facet/sort/range keys (old link from a build with different fields, or
  hand-edited): dropped silently by `decodeState`'s validation, never thrown.
- More than 4 ids in `compare=`: truncated to 4, matching the existing compare-tray
  cap.
- Clipboard permission denied / `file://` / old browser: `fallbackCopy` handles it;
  if even that throws, the button says "Copy failed — select & copy manually" and the
  address bar itself is still accurate for a manual copy.

## Testing

- `test/url-state.test.js` (new, plain Node, no DOM): round-trip encode→decode for
  query, facets, ranges, sort/direction, view, compare, and open-vehicle id;
  unknown-key rejection; malformed-number rejection; empty state → empty string.
- `test/equivalence.test.js`: add `url-state.js` to `INLINED_MODULES` so the built
  page's copy is checked byte-for-byte against `src/url-state.js`.
- Full suite (`npm test`) must stay green.
- **Not covered by automated tests:** the DOM/clipboard glue in the `VIEW` script
  itself (dialog open/close wiring, button click handling, actual clipboard behavior).
  This would need jsdom or a browser harness, which the project doesn't have and this
  feature doesn't justify adding. I'll do a manual check in a real browser
  (`bev build` then open `dist/index.html`) covering: open a vehicle → address bar
  updates → reload with that URL → dialog reopens; set filters/sort/view → copy link →
  open in a new tab → same state restores; compare 2+ vehicles → copy link → restores
  the tray; Copy-link button on a `file://`-opened copy of the page.

## Risks / open questions

- None outstanding — both architectural forks (scope: vehicle + search state; sync
  behavior: live-synced address bar) were confirmed with the user before this spec was
  written.
