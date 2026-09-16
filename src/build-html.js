'use strict';

/**
 * HTML surface builder.
 *
 * The critical design property: this builder does NOT reimplement search,
 * filtering, sorting, comparison or value formatting. It inlines src/schema.js
 * and src/engine.js verbatim behind a six-line CommonJS shim and calls the same
 * exported functions the CLI calls. The page's view layer is the only code that
 * exists solely for the browser.
 *
 * If you are tempted to add query logic here, add it to engine.js instead —
 * test/equivalence.test.js will fail otherwise, by design.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** Read a module's source text for verbatim inlining. */
function moduleSource(relative) {
  return fs.readFileSync(path.join(__dirname, relative), 'utf8');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Guards against `</script>` inside embedded JSON terminating the block. */
function embedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const STYLES = `
:root{
  --ink:#12131a; --ink-soft:#5b5f70; --ink-faint:#8b8fa0;
  --paper:#ffffff; --wash:#f4f5f8; --line:#e3e5ec;
  --accent:#0b5cff; --accent-soft:#e8efff;
  --warn:#b45309; --warn-soft:#fef3c7;
  --bad:#b42318; --good:#067647;
  --radius:10px;
  --shadow:0 1px 2px rgba(18,19,26,.06),0 8px 24px rgba(18,19,26,.06);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--wash); color:var(--ink);
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:15px; line-height:1.5;
  -webkit-text-size-adjust:100%;
}
h1,h2,h3{font-family:Caprasimo,Inter,system-ui,sans-serif;font-weight:400;letter-spacing:-.01em;margin:0}
.num{font-variant-numeric:tabular-nums}
a{color:var(--accent)}

.wrap{max-width:1400px;margin:0 auto;padding:0 20px}
@media(max-width:640px){.wrap{padding:0 18px}}

header.top{background:var(--paper);border-bottom:1px solid var(--line)}
.top-inner{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;padding:22px 18px}
h1{font-size:clamp(24px,4.2vw,38px);line-height:1.05}
.sub{color:var(--ink-soft);font-size:13px;margin-top:6px;max-width:62ch}
.stats{display:flex;gap:22px;flex-wrap:wrap}
.stat{min-width:62px}
.stat b{display:block;font-size:21px;font-family:Caprasimo,Inter,sans-serif;font-weight:400;line-height:1.1}
.stat span{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-faint)}

.notice{
  background:var(--warn-soft);border-bottom:1px solid #f0d9a0;
  font-size:12.5px;color:#6b4708;padding:9px 0;
}
.notice p{margin:0;max-width:110ch}

main{padding:20px 0 120px}
.layout{display:grid;grid-template-columns:255px 1fr;gap:22px;align-items:start}
@media(max-width:900px){.layout{grid-template-columns:1fr}}

.panel{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}

aside .panel{padding:16px}

/* Base state: the collapse control only exists on narrow screens. This rule
   must come BEFORE the media query that reveals it — an equally specific
   display:none placed afterwards would win the cascade and leave the filter
   panel permanently unopenable on a phone. */
#filter-toggle{
  display:none;width:100%;align-items:center;justify-content:space-between;
  background:none;border:0;padding:14px 16px;font:inherit;font-weight:600;cursor:pointer;color:var(--ink)
}
@media(max-width:900px){
  /* aside is sticky to top:0, so once the open panel's content is taller than
     the viewport its lower chips and the reset button sit below the fold —
     the sticky box stays pinned and never scrolls far enough to reveal them.
     Capping the whole card to the viewport height and laying it out as a
     column lets #filter-body claim exactly the space left under the toggle
     and scroll internally for the rest — no guessing the toggle's rendered
     height (it changes with system font-size/zoom), the flex box measures it. */
  aside{position:sticky;top:0;z-index:20;max-height:100vh;max-height:100dvh}
  aside .panel{
    padding:0;border-radius:var(--radius);
    display:flex;flex-direction:column;max-height:inherit;overflow:hidden
  }
  #filter-body{display:none;padding:16px;border-top:1px solid var(--line)}
  #filter-body.open{
    display:block;flex:1 1 auto;min-height:0;
    overflow-y:auto;-webkit-overflow-scrolling:touch
  }
  #filter-toggle{display:flex;flex:none}
  /* Comfortable touch targets — the desktop sizes are too small for a thumb. */
  .chip{padding:8px 12px;font-size:13px;min-height:36px}
  .rowbtn{padding:8px 12px;font-size:12.5px;min-height:36px}
  .reset{min-height:44px}
  select,.viewbtn{min-height:40px}
  .x{min-height:44px;min-width:44px}
}
#filter-toggle .chev{transition:transform .15s}
#filter-toggle[aria-expanded="true"] .chev{transform:rotate(180deg)}

.search{position:relative;margin-bottom:16px}
.search input{
  width:100%;padding:11px 12px 11px 34px;font:inherit;
  border:1px solid var(--line);border-radius:8px;background:var(--wash)
}
.search input:focus{outline:2px solid var(--accent);outline-offset:-1px;background:var(--paper)}
.search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--ink-faint)}

.fgroup{border-top:1px solid var(--line);padding:13px 0 4px}
.fgroup:first-of-type{border-top:0}
.fgroup h3{font-family:Inter,sans-serif;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-faint);margin-bottom:9px}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{
  border:1px solid var(--line);background:var(--paper);border-radius:99px;
  padding:4px 9px;font-size:12px;cursor:pointer;color:var(--ink-soft);
  font-family:inherit;display:inline-flex;gap:5px;align-items:center
}
.chip:hover{border-color:var(--ink-faint)}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.chip em{font-style:normal;opacity:.6;font-size:11px}
.chip[aria-pressed="true"] em{opacity:.8}
.more{background:none;border:0;color:var(--accent);font:inherit;font-size:12px;cursor:pointer;padding:4px 0}

.range{display:flex;gap:8px;align-items:center}
.range input{
  width:100%;padding:7px 8px;font:inherit;font-size:13px;
  border:1px solid var(--line);border-radius:6px;background:var(--wash)
}
.range span{color:var(--ink-faint);font-size:12px}

.reset{
  width:100%;margin-top:14px;padding:9px;font:inherit;font-size:13px;cursor:pointer;
  background:var(--wash);border:1px solid var(--line);border-radius:8px;color:var(--ink-soft)
}
.reset:hover{background:var(--paper);color:var(--ink)}

.toolbar{
  display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;
  padding:13px 16px;margin-bottom:14px
}
.count{font-size:13px;color:var(--ink-soft)}
.count b{color:var(--ink)}
.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
select,.viewbtn{
  font:inherit;font-size:13px;padding:7px 10px;border:1px solid var(--line);
  border-radius:7px;background:var(--paper);color:var(--ink);cursor:pointer
}
.viewbtn[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}

table{width:100%;border-collapse:collapse;font-size:13.5px}
thead th{
  position:sticky;top:0;background:var(--paper);z-index:5;
  text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--ink-faint);font-weight:600;padding:11px 10px;border-bottom:1px solid var(--line);
  white-space:nowrap;cursor:pointer;user-select:none
}
thead th[aria-sort]{color:var(--accent)}
thead th.nosort{cursor:default}
tbody td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:hover{background:var(--wash)}
td.name{min-width:200px}
td.name b{display:block;font-weight:600}
td.name small{color:var(--ink-faint);font-size:12px}
td.r{text-align:right}
.flag{
  display:inline-block;font-size:10px;padding:1px 5px;border-radius:4px;
  background:var(--warn-soft);color:var(--warn);margin-left:5px;vertical-align:middle
}
.flag.runout{background:#fee2e2;color:var(--bad)}
.flag.announced{background:var(--accent-soft);color:var(--accent)}
.unk{color:var(--ink-faint)}
.cyclepill{font-size:10px;color:var(--ink-faint);display:block}

.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:12px}
.card{padding:14px}
.card h3{font-family:Inter,sans-serif;font-size:14.5px;font-weight:600;margin-bottom:2px}
.card .brandline{font-size:12px;color:var(--ink-faint);margin-bottom:10px}
.card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0;font-size:12.5px}
.card dt{color:var(--ink-faint)}
.card dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}

.rowbtn{
  background:none;border:1px solid var(--line);border-radius:6px;cursor:pointer;
  font:inherit;font-size:11px;padding:3px 7px;color:var(--ink-soft);white-space:nowrap
}
.rowbtn:hover{border-color:var(--accent);color:var(--accent)}
.rowbtn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}

.empty{padding:56px 20px;text-align:center;color:var(--ink-soft)}
.empty b{display:block;font-size:16px;color:var(--ink);margin-bottom:6px}

.tray{
  position:fixed;left:0;right:0;bottom:0;background:var(--paper);
  border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(18,19,26,.10);
  z-index:40;transform:translateY(100%);transition:transform .18s ease;max-height:76vh;overflow:auto
}
.tray.open{transform:translateY(0)}
.tray-head{
  display:flex;gap:12px;align-items:center;justify-content:space-between;
  padding:12px 0;position:sticky;top:0;background:var(--paper);border-bottom:1px solid var(--line)
}
.tray-head h2{font-size:17px}
.tray table{font-size:13px}
.tray td,.tray th{padding:8px 10px}
.tray tbody tr.differs{background:#fffbeb}
.tray .fieldname{color:var(--ink-soft);white-space:nowrap}
.x{background:none;border:0;font-size:20px;line-height:1;cursor:pointer;color:var(--ink-faint);padding:4px 8px}
.x:hover{color:var(--ink)}

dialog{
  border:0;border-radius:var(--radius);padding:0;max-width:min(560px,92vw);
  box-shadow:0 24px 70px rgba(18,19,26,.28)
}
dialog::backdrop{background:rgba(18,19,26,.45)}
.dlg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px 10px;border-bottom:1px solid var(--line)}
.dlg-head h2{font-size:18px}
.dlg-head p{margin:4px 0 0;font-size:12px;color:var(--ink-faint)}
.dlg-body{padding:14px 18px 20px;max-height:64vh;overflow:auto}
.prov{width:100%;border-collapse:collapse;font-size:12.5px}
.prov th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);padding:6px 8px;border-bottom:1px solid var(--line)}
.prov td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.prov td a{word-break:break-all;font-size:11.5px}
.conf{font-size:10px;padding:1px 5px;border-radius:4px;background:var(--wash);color:var(--ink-soft)}
.conf.low{background:var(--warn-soft);color:var(--warn)}
.conf.medium{background:#e0f2fe;color:#075985}
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
`;

/* ------------------------------------------------------------------ *
 * View layer — browser-only presentation code.
 * ------------------------------------------------------------------ */

const VIEW = `
var BEV = require('./engine');
var SCHEMA = require('./schema');
var UrlState = require('./url-state');

// Expand the interned provenance table BEFORE the engine sees the records, so
// compaction stays a transport detail and the engine operates on exactly the
// objects reconcile() produced.
require('./rehydrate').rehydrate(CATALOGUE);

var INDEX = BEV.buildIndex(CATALOGUE);
var FACETS = BEV.facets(INDEX);

var TABLE_COLUMNS = [
  'batteryUsableKwh','rangeKm','dcChargeKw','powerKw','zeroTo100s','seats','priceAud'
];
var FACET_ORDER = ['brand','bodyType','drive','availability','rangeCycle','segment','v2l'];
var RANGE_FILTERS = [
  { key:'priceAud', label:'Price (AUD)' },
  { key:'rangeKm', label:'Range (km)' },
  { key:'batteryUsableKwh', label:'Battery (kWh)' }
];

var state = { q:'', facets:{}, ranges:{}, sort:'name', direction:'asc', view:'table', compare:[], open:null };
var expanded = {};

function el(id){ return document.getElementById(id); }
function fieldLabel(key){
  var f = SCHEMA.FIELD_BY_KEY.get(key);
  return f ? f.label : key;
}
function esc(text){
  return String(text == null ? '' : text)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------- filters ---------- */

function renderFilters(){
  var html = '';

  for (var i=0;i<FACET_ORDER.length;i++){
    var key = FACET_ORDER[i];
    var values = FACETS[key] || [];
    if (!values.length) continue;
    var active = state.facets[key] || [];
    var isOpen = expanded[key];
    var limit = (key === 'brand' && !isOpen) ? 8 : values.length;

    html += '<div class="fgroup"><h3>' + esc(fieldLabel(key)) + '</h3><div class="chips">';
    for (var v=0; v<Math.min(limit, values.length); v++){
      var row = values[v];
      var on = active.indexOf(row.value) !== -1;
      html += '<button class="chip" type="button" aria-pressed="' + (on?'true':'false') +
        '" data-facet="' + esc(key) + '" data-value="' + esc(row.value) + '">' +
        esc(row.value) + ' <em class="num">' + row.count + '</em></button>';
    }
    html += '</div>';
    if (values.length > limit || (key === 'brand' && isOpen && values.length > 8)){
      html += '<button class="more" type="button" data-expand="' + esc(key) + '">' +
        (isOpen ? 'Show fewer' : 'Show all ' + values.length) + '</button>';
    }
    html += '</div>';
  }

  for (var r=0;r<RANGE_FILTERS.length;r++){
    var spec = RANGE_FILTERS[r];
    var bound = state.ranges[spec.key] || {};
    html += '<div class="fgroup"><h3>' + esc(spec.label) + '</h3><div class="range">' +
      '<input type="number" inputmode="numeric" placeholder="min" aria-label="Minimum ' + esc(spec.label) + '"' +
        ' data-range="' + esc(spec.key) + '" data-edge="min" value="' + (bound.min != null ? esc(bound.min) : '') + '">' +
      '<span>to</span>' +
      '<input type="number" inputmode="numeric" placeholder="max" aria-label="Maximum ' + esc(spec.label) + '"' +
        ' data-range="' + esc(spec.key) + '" data-edge="max" value="' + (bound.max != null ? esc(bound.max) : '') + '">' +
      '</div></div>';
  }

  html += '<button class="reset" type="button" id="reset">Clear all filters</button>';
  el('filters').innerHTML = html;
}

/* ---------- results ---------- */

function availabilityFlag(record){
  if (record.availability === 'runout') return '<span class="flag runout">runout</span>';
  if (record.availability === 'announced') return '<span class="flag announced">announced</span>';
  return '';
}

function cellValue(record, key){
  var text = BEV.formatValue(key, record[key]);
  if (text === '—') return '<span class="unk" title="not published by the source">—</span>';
  var cycle = '';
  if (key === 'rangeKm' && record.rangeCycle){
    cycle = '<span class="cyclepill">' + esc(record.rangeCycle) + '</span>';
  }
  return '<span class="num">' + esc(text) + '</span>' + cycle;
}

function renderTable(records){
  var html = '<table><thead><tr>' +
    '<th class="nosort">Vehicle</th>';
  for (var c=0;c<TABLE_COLUMNS.length;c++){
    var key = TABLE_COLUMNS[c];
    var sorted = state.sort === key;
    html += '<th class="r" data-sort="' + esc(key) + '"' +
      (sorted ? ' aria-sort="' + (state.direction === 'asc' ? 'ascending' : 'descending') + '"' : '') +
      '>' + esc(fieldLabel(key)) + (sorted ? (state.direction === 'asc' ? ' ↑' : ' ↓') : '') + '</th>';
  }
  html += '<th class="nosort"></th></tr></thead><tbody>';

  for (var i=0;i<records.length;i++){
    var record = records[i];
    var picked = state.compare.indexOf(record.id) !== -1;
    html += '<tr><td class="name"><b>' + esc(record.model || '') + ' ' + esc(record.variant || '') +
      availabilityFlag(record) + '</b><small>' + esc(record.brand || '') +
      (record.bodyType ? ' · ' + esc(record.bodyType) : '') +
      (record.drive ? ' · ' + esc(record.drive) : '') + '</small></td>';
    for (var c2=0;c2<TABLE_COLUMNS.length;c2++){
      html += '<td class="r">' + cellValue(record, TABLE_COLUMNS[c2]) + '</td>';
    }
    html += '<td class="r" style="white-space:nowrap">' +
      '<button class="rowbtn" type="button" data-prov="' + esc(record.id) + '">Sources</button> ' +
      '<button class="rowbtn" type="button" aria-pressed="' + (picked?'true':'false') +
        '" data-compare="' + esc(record.id) + '">' + (picked ? 'Added' : 'Compare') + '</button>' +
      '</td></tr>';
  }
  return html + '</tbody></table>';
}

function renderCards(records){
  var html = '<div class="cards">';
  for (var i=0;i<records.length;i++){
    var record = records[i];
    var picked = state.compare.indexOf(record.id) !== -1;
    html += '<article class="panel card"><h3>' + esc(record.model || '') + ' ' + esc(record.variant || '') +
      availabilityFlag(record) + '</h3><div class="brandline">' + esc(record.brand || '') +
      (record.bodyType ? ' · ' + esc(record.bodyType) : '') + '</div><dl>';
    for (var c=0;c<TABLE_COLUMNS.length;c++){
      var key = TABLE_COLUMNS[c];
      html += '<dt>' + esc(fieldLabel(key)) + '</dt><dd>' + cellValue(record, key) + '</dd>';
    }
    html += '</dl><div style="margin-top:11px;display:flex;gap:6px">' +
      '<button class="rowbtn" type="button" data-prov="' + esc(record.id) + '">Sources</button>' +
      '<button class="rowbtn" type="button" aria-pressed="' + (picked?'true':'false') +
        '" data-compare="' + esc(record.id) + '">' + (picked ? 'Added' : 'Compare') + '</button>' +
      '</div></article>';
  }
  return html + '</div>';
}

/**
 * Renders results/count/sort-controls/compare-tray and syncs the URL, but
 * deliberately does NOT touch #filters. renderFilters() rebuilds that whole
 * subtree's innerHTML, which destroys and recreates every chip and range
 * input in it — fine for a click (nothing was focused inside it), fatal for a
 * keystroke (it destroys the very input the user is mid-typing into, losing
 * focus and cursor position). Range/query edits call this instead of render()
 * for exactly that reason; see the 'input' listener below.
 */
function renderResults(){
  var result = BEV.query(INDEX, {
    q: state.q,
    facets: state.facets,
    ranges: state.ranges,
    sort: state.sort,
    direction: state.direction
  });

  el('count').innerHTML = '<b class="num">' + result.total + '</b> of <span class="num">' +
    INDEX.size + '</span> variants';

  if (!result.total){
    el('results').innerHTML = '<div class="panel empty"><b>Nothing matches those filters</b>' +
      'Note that an active numeric filter also excludes vehicles whose figure is unpublished.</div>';
  } else {
    el('results').innerHTML = state.view === 'cards'
      ? renderCards(result.records)
      : renderTable(result.records);
  }

  el('sort').value = state.sort;
  el('dir').value = state.direction;
  renderTray();
  syncUrl();
}

function render(){
  renderResults();
  renderFilters();
}

/* ---------- shareable links ---------- */

/**
 * Keeps the address bar a live, accurate, shareable link for the current
 * state — search text, active filters, sort, view, compare selection and any
 * open vehicle detail. Always replaceState, never pushState: interacting with
 * search/filters must not spam browser history on every keystroke or click.
 */
function syncUrl(){
  var hash = UrlState.encodeState(state);
  var url = location.pathname + location.search + (hash ? '#' + hash : '');
  history.replaceState(null, '', url);
}

/* ---------- compare tray ---------- */

function renderTray(){
  var tray = el('tray');
  if (!state.compare.length){ tray.classList.remove('open'); tray.innerHTML=''; return; }

  var result = BEV.compare(INDEX, state.compare);
  var html = '<div class="wrap"><div class="tray-head"><h2>Compare ' +
    result.vehicles.length + '</h2><div>' +
    '<button class="rowbtn" type="button" id="onlydiff" aria-pressed="' +
      (state.onlyDiff ? 'true':'false') + '">Only differences</button> ' +
    '<button class="x" type="button" id="closetray" aria-label="Close comparison">×</button>' +
    '</div></div><table><thead><tr><th></th>';

  for (var v=0;v<result.vehicles.length;v++){
    html += '<th>' + esc(BEV.displayName(result.vehicles[v])) + '</th>';
  }
  html += '</tr></thead><tbody>';

  for (var r=0;r<result.rows.length;r++){
    var row = result.rows[r];
    if (row.key === 'brand' || row.key === 'model' || row.key === 'variant') continue;
    if (state.onlyDiff && !row.differs) continue;
    html += '<tr class="' + (row.differs ? 'differs' : '') + '"><td class="fieldname">' + esc(row.label) + '</td>';
    for (var c=0;c<row.values.length;c++){
      var text = BEV.formatValue(row.key, row.values[c]);
      html += '<td class="num">' + (text === '—' ? '<span class="unk">—</span>' : esc(text)) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  tray.innerHTML = html;
  tray.classList.add('open');
}

/* ---------- provenance dialog ---------- */

function showProvenance(id){
  var record = BEV.byId(INDEX, id);
  if (!record){ state.open = null; syncUrl(); return; }
  state.open = id;
  syncUrl();
  var provenance = record.provenance || {};
  var keys = Object.keys(provenance).sort();

  var html = '<table class="prov"><thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead><tbody>';
  for (var i=0;i<keys.length;i++){
    var key = keys[i];
    var entry = provenance[key];
    var link = entry.url
      ? '<a href="' + esc(entry.url) + '" target="_blank" rel="noopener noreferrer">' + esc(entry.publisher || entry.sourceKind) + '</a>'
      : esc(entry.publisher || entry.sourceKind);
    html += '<tr><td class="fieldname">' + esc(fieldLabel(key)) + '</td>' +
      '<td class="num">' + esc(BEV.formatValue(key, record[key])) + '</td>' +
      '<td>' + link + ' <span class="conf ' + esc(entry.confidence) + '">' + esc(entry.confidence) + '</span>' +
      (entry.fetchedAt ? '<br><span class="unk" style="font-size:11px">fetched ' + esc(entry.fetchedAt) + '</span>' : '') +
      '</td></tr>';
  }
  html += '</tbody></table>';
  if (record.brandNotes){
    html += '<p style="margin-top:14px;font-size:12px;color:var(--ink-soft)"><b>Brand note:</b> ' +
      esc(record.brandNotes) + '</p>';
  }

  el('dlg-title').textContent = BEV.displayName(record);
  el('dlg-sub').textContent = 'Every populated field, with the publisher it came from.';
  el('dlg-body').innerHTML = html;
  el('dlg').showModal();
}

/* ---------- events ---------- */

function toggleFacet(key, value){
  var active = state.facets[key] ? state.facets[key].slice() : [];
  var at = active.indexOf(value);
  if (at === -1) active.push(value); else active.splice(at,1);
  if (active.length) state.facets[key] = active; else delete state.facets[key];
}

document.addEventListener('click', function(event){
  var target = event.target.closest('[data-facet],[data-expand],[data-sort],[data-compare],[data-prov],[data-copy-link],#reset,#closetray,#onlydiff,#filter-toggle,.viewbtn');
  if (!target) return;

  if (target.hasAttribute('data-copy-link')){ copyCurrentLink(target); return; }

  if (target.hasAttribute('data-facet')){
    toggleFacet(target.getAttribute('data-facet'), target.getAttribute('data-value'));
    render(); return;
  }
  if (target.hasAttribute('data-expand')){
    var key = target.getAttribute('data-expand');
    expanded[key] = !expanded[key];
    renderFilters(); return;
  }
  if (target.hasAttribute('data-sort')){
    var sortKey = target.getAttribute('data-sort');
    if (state.sort === sortKey){
      state.direction = state.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort = sortKey;
      state.direction = (sortKey === 'priceAud' || sortKey === 'zeroTo100s') ? 'asc' : 'desc';
    }
    render(); return;
  }
  if (target.hasAttribute('data-compare')){
    var id = target.getAttribute('data-compare');
    var at = state.compare.indexOf(id);
    if (at === -1){
      if (state.compare.length >= 4){ state.compare.shift(); }
      state.compare.push(id);
    } else {
      state.compare.splice(at,1);
    }
    render(); return;
  }
  if (target.hasAttribute('data-prov')){ showProvenance(target.getAttribute('data-prov')); return; }
  if (target.id === 'reset'){
    state.q=''; state.facets={}; state.ranges={};
    el('q').value='';
    render(); return;
  }
  if (target.id === 'closetray'){ state.compare=[]; render(); return; }
  if (target.id === 'onlydiff'){ state.onlyDiff = !state.onlyDiff; renderTray(); return; }
  if (target.id === 'filter-toggle'){
    var body = el('filter-body');
    var open = body.classList.toggle('open');
    target.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open){
      // The panel's max-height budget is sized against the viewport (100dvh),
      // which only matches what's actually on screen once the sticky aside is
      // pinned flush to the top. On a page that hasn't been scrolled yet, the
      // unpinned aside sits further down, so part of a tall filter list would
      // land below the fold — outside both the page's scroll (aside is stuck)
      // and the panel's own internal scroll (already at its end). Scrolling
      // the toggle to the top on open keeps the whole list reachable.
      target.scrollIntoView({ block: 'start' });
    }
    return;
  }
  if (target.classList.contains('viewbtn')){
    state.view = target.getAttribute('data-view');
    var buttons = document.querySelectorAll('.viewbtn');
    for (var b=0;b<buttons.length;b++){
      buttons[b].setAttribute('aria-pressed', buttons[b] === target ? 'true':'false');
    }
    render(); return;
  }
});

document.addEventListener('input', function(event){
  var node = event.target;
  if (node.id === 'q'){ state.q = node.value; render(); return; }
  if (node.hasAttribute && node.hasAttribute('data-range')){
    var key = node.getAttribute('data-range');
    var edge = node.getAttribute('data-edge');
    var bound = state.ranges[key] || {};
    var raw = node.value.trim();
    if (raw === '') delete bound[edge]; else bound[edge] = Number(raw);
    if (bound.min == null && bound.max == null) delete state.ranges[key];
    else state.ranges[key] = bound;
    // renderResults(), not render(): render() also calls renderFilters(),
    // which rebuilds #filters' innerHTML and would destroy this very input on
    // every keystroke, dropping focus and cursor position mid-type. Nothing
    // in #filters needs to change here — the box already shows what was typed.
    renderResults();
    return;
  }
});

document.addEventListener('change', function(event){
  if (event.target.id === 'sort'){ state.sort = event.target.value; render(); }
  if (event.target.id === 'dir'){ state.direction = event.target.value; render(); }
});

el('dlg-close').addEventListener('click', function(){ el('dlg').close(); });
// Listening on the dialog's own native 'close' event, rather than only the
// button click, covers every dismissal path (button, Escape key) in one
// place — so state.open can't go stale no matter how the dialog was closed.
el('dlg').addEventListener('close', function(){ state.open = null; syncUrl(); });

/* ---------- copy link ---------- */

function fallbackCopy(text, done){
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    done(ok);
  } catch (err) {
    done(false);
  }
}

/**
 * navigator.clipboard.writeText needs a secure context and is commonly
 * blocked when this page is opened as a plain file:// download — a realistic
 * way to view an "offline explorer" — so it falls back to the older
 * execCommand('copy') path, which still works there.
 */
function copyCurrentLink(button){
  var url = location.href;
  var original = button.textContent;
  function done(ok){
    button.textContent = ok ? 'Copied!' : 'Copy failed — select & copy manually';
    setTimeout(function(){ button.textContent = original; }, 1600);
  }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){ done(true); }, function(){ fallbackCopy(url, done); });
  } else {
    fallbackCopy(url, done);
  }
}

if (window.matchMedia('(max-width: 640px)').matches){ state.view = 'cards'; }

// Restore state from a shared link BEFORE the first render. decodeState only
// returns keys actually present in the hash, so this layers "the link says"
// on top of the defaults above rather than replacing them wholesale.
var restored = UrlState.decodeState(location.hash);
if (restored.q != null) state.q = restored.q;
if (restored.facets) state.facets = restored.facets;
if (restored.ranges) state.ranges = restored.ranges;
if (restored.sort) state.sort = restored.sort;
if (restored.direction) state.direction = restored.direction;
if (restored.view) state.view = restored.view; // an explicit link wins over the mobile default above
if (restored.compare) state.compare = restored.compare;
if (restored.open) state.open = restored.open;

render();
if (state.q) el('q').value = state.q;
// Opening the dialog for a shared vehicle link. showProvenance() itself
// no-ops (and clears state.open) if the id no longer matches a vehicle —
// a stale link still restores the rest of the state cleanly.
if (state.open) showProvenance(state.open);
`;

/* ------------------------------------------------------------------ *
 * Payload compaction
 * ------------------------------------------------------------------ */

/**
 * Intern provenance strings into a shared table and encode each field's
 * provenance as a small array of indices. Purely a transport concern: the view
 * rehydrates records into exactly the shape reconcile() produced before the
 * engine ever sees them, so no query code is aware this happened.
 *
 * Encoding per field:
 *   [sourceKindIdx, urlIdx, publisherIdx, licenceIdx, fetchedAtIdx, confidenceIdx, adapterIdx]
 *
 * Every provenance key must appear here — the round-trip test in
 * test/equivalence.test.js asserts byte-equality with the reconciled records,
 * so a field omitted from this encoding fails the build rather than silently
 * disappearing from the page.
 */
function compactPayload(catalogue, meta) {
  const strings = [];
  const lookup = new Map();

  function intern(value) {
    if (value == null) return -1;
    const text = String(value);
    if (lookup.has(text)) return lookup.get(text);
    const at = strings.length;
    strings.push(text);
    lookup.set(text, at);
    return at;
  }

  const records = catalogue.records.map((record) => {
    const copy = {};
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === 'provenance') continue;
      copy[key] = record[key];
    }

    const provenance = record.provenance || {};
    const packed = {};
    const fields = Object.keys(provenance);
    for (let f = 0; f < fields.length; f += 1) {
      const entry = provenance[fields[f]];
      packed[fields[f]] = [
        intern(entry.sourceKind),
        intern(entry.url),
        intern(entry.publisher),
        intern(entry.licence),
        intern(entry.fetchedAt),
        intern(entry.confidence),
        intern(entry.adapter),
      ];
    }
    copy.p = packed;
    return copy;
  });

  return {
    meta: {
      builtAt: meta.builtAt,
      recordCount: meta.recordCount,
      disclaimer: meta.disclaimer,
    },
    strings,
    records,
  };
}

/* ------------------------------------------------------------------ */

/** Coverage/methodology figures shared by the catalogue header and the About page. */
function computeCoverageSections(catalogue) {
  const meta = catalogue.meta || {};
  const report = catalogue.coverage || { totals: {} };
  const totals = report.totals || {};

  const emptyBrandList = (report.emptyBrands || [])
    .map((b) => `<li><b>${escapeHtml(b.brand)}</b> — ${escapeHtml(b.notes || 'no BEV on sale')}</li>`)
    .join('');

  const licenceList = Object.keys(meta.licences || {})
    .map((kind) => `<li><b>${escapeHtml(kind)}</b> — ${escapeHtml(meta.licences[kind])}</li>`)
    .join('');

  const worstFields = (report.byField || [])
    .filter((f) => f.completeness < 100)
    .sort((a, b) => a.completeness - b.completeness)
    .slice(0, 8)
    .map((f) => `<li>${escapeHtml(f.label)} — <span class="num">${f.completeness}%</span> populated</li>`)
    .join('');

  return { totals, emptyBrandList, licenceList, worstFields };
}

function buildHtml(catalogue) {
  const meta = catalogue.meta || {};
  const { totals } = computeCoverageSections(catalogue);

  const sortOptions = catalogue.fields
    .filter((f) => f.sortable)
    .map((f) => `<option value="${f.key}">${escapeHtml(f.label)}</option>`)
    .join('');

  // The browser payload: records only. Coverage and conflict data stay out of
  // the embedded index, and provenance strings are interned into a lookup
  // table — the same publisher URL recurs across dozens of fields, so naive
  // embedding tripled the page weight for no added information.
  const payload = compactPayload(catalogue, meta);

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Australian Battery-Electric Vehicle Directory</title>
<meta name="description" content="Every battery-electric vehicle model and variant sold new in Australia, with per-field provenance. Built ${escapeHtml(meta.builtAt || '')}.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>

<header class="top">
  <div class="wrap top-inner">
    <div>
      <h1>Australian BEV Catalogue</h1>
      <p class="sub">Every battery-electric model and variant sold new in Australia. Each figure carries the publisher it came from, so you can check any number rather than take it on trust. <a href="about.html">About this directory &amp; methodology →</a></p>
    </div>
    <div class="stats">
      <div class="stat"><b class="num">${totals.variants || 0}</b><span>Variants</span></div>
      <div class="stat"><b class="num">${totals.brandsWithVariants || 0}</b><span>Brands</span></div>
      <div class="stat"><b class="num">${totals.coreCompleteness || 0}%</b><span>Core fields</span></div>
      <div class="stat"><b class="num">${escapeHtml(meta.builtAt || '')}</b><span>Built</span></div>
    </div>
  </div>
</header>

<div class="notice"><div class="wrap"><p>${escapeHtml(meta.disclaimer || '')}</p></div></div>

<main class="wrap">
  <div class="layout">
    <aside>
      <div class="panel">
        <button id="filter-toggle" type="button" aria-expanded="false" aria-controls="filter-body">
          <span>Search &amp; filters</span><span class="chev">▾</span>
        </button>
        <div id="filter-body">
          <div class="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
            <input id="q" type="search" placeholder="Search make, model, variant…" aria-label="Search vehicles" autocomplete="off">
          </div>
          <div id="filters"></div>
        </div>
      </div>
    </aside>

    <section>
      <div class="panel toolbar">
        <div class="count" id="count" aria-live="polite"></div>
        <div class="tools">
          <label class="sr" for="sort">Sort by</label>
          <select id="sort">
            <option value="name">Name</option>
            ${sortOptions}
          </select>
          <label class="sr" for="dir">Direction</label>
          <select id="dir">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button class="viewbtn" type="button" data-view="table" aria-pressed="true">Table</button>
          <button class="viewbtn" type="button" data-view="cards" aria-pressed="false">Cards</button>
          <button class="rowbtn" type="button" data-copy-link title="Copy a link to this search">Copy link</button>
        </div>
      </div>
      <div class="panel" id="results" style="overflow-x:auto"></div>
    </section>
  </div>
</main>

<div class="tray" id="tray" role="region" aria-label="Vehicle comparison"></div>

<dialog id="dlg">
  <div class="dlg-head">
    <div><h2 id="dlg-title"></h2><p id="dlg-sub"></p></div>
    <div style="display:flex;gap:8px;align-items:flex-start">
      <button class="rowbtn" type="button" data-copy-link title="Copy a link to this vehicle">Copy link</button>
      <button class="x" type="button" id="dlg-close" aria-label="Close">×</button>
    </div>
  </div>
  <div class="dlg-body" id="dlg-body"></div>
</dialog>

<footer>
  <div class="wrap">
    <p>This page is not affiliated with any manufacturer. <a href="about.html">Read about the methodology and data completeness →</a></p>
  </div>
</footer>

<script>
// Minimal CommonJS shim. The modules below are inlined VERBATIM from
// src/schema.js, src/rehydrate.js, src/engine.js and src/url-state.js so this
// page executes the same code as the command-line tool — there is no second
// implementation of the query logic or the link-sharing state encoding.
(function(){
  var registry = {};
  var cache = {};
  function define(name, factory){ registry[name] = factory; }
  function require(name){
    var key = name.replace(/^\\.\\//, './');
    if (cache[key]) return cache[key].exports;
    var factory = registry[key] || registry['./' + key.replace(/^\\.\\//, '')];
    if (!factory) throw new Error('module not found: ' + name);
    var module = { exports: {} };
    cache[key] = module;
    factory(module, module.exports, require);
    return module.exports;
  }

  var CATALOGUE = ${embedJson(payload)};

  define('./schema', function(module, exports, require){
${moduleSource('schema.js')}
  });

  define('./rehydrate', function(module, exports, require){
${moduleSource('rehydrate.js')}
  });

  define('./engine', function(module, exports, require){
${moduleSource('engine.js')}
  });

  define('./url-state', function(module, exports, require){
${moduleSource('url-state.js')}
  });

${VIEW}
})();
</script>
</body>
</html>
`;
}

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

function writeHtml(catalogue, target) {
  const dest = target || path.join(ROOT, 'dist', 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buildHtml(catalogue), 'utf8');
  return dest;
}

function writeAboutHtml(catalogue, target) {
  const dest = target || path.join(ROOT, 'dist', 'about.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buildAboutHtml(catalogue), 'utf8');
  return dest;
}

module.exports = {
  buildHtml, writeHtml, buildAboutHtml, writeAboutHtml, moduleSource, embedJson, compactPayload,
};
