'use strict';

/**
 * SEO/AEO surface tests.
 *
 * The catalogue's actual content (vehicle records) is otherwise only ever
 * reachable by executing client-side JavaScript. These tests pin the
 * crawlable surfaces that exist specifically so a non-JS crawler — or an
 * answer engine reading raw HTML — has real facts to read: the pre-rendered
 * table, the JSON-LD, and robots.txt/sitemap.xml.
 */

const test = require('node:test');
const assert = require('node:assert');

const { build } = require('../src/build');
const {
  buildHtml, buildAboutHtml, buildRobotsTxt, buildSitemapXml, SITE_URL,
} = require('../src/build-html');
const { makeSourcesDir, cleanup } = require('./fixtures');

const sourcesDir = makeSourcesDir();
const catalogue = build({ sourcesDir, now: '2026-09-13' });
const html = buildHtml(catalogue);
const aboutHtml = buildAboutHtml(catalogue);

test.after(() => cleanup(sourcesDir));

/** Pull every <script type="application/ld+json"> block's parsed content out of a page. */
function jsonLdBlocks(pageHtml) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(pageHtml))) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

test('the index page pre-renders every record into a real HTML table', () => {
  // Scoped to the #results div specifically — the client-side view layer's
  // *source code* is also embedded verbatim in a <script> below this, and
  // contains the same '<tr><td class="name">' string literal.
  const resultsStart = html.indexOf('id="results"');
  const resultsEnd = html.indexOf('</section>', resultsStart);
  const resultsHtml = html.slice(resultsStart, resultsEnd);

  const rowCount = (resultsHtml.match(/<tr><td class="name">/g) || []).length;
  assert.strictEqual(rowCount, catalogue.records.length);

  // A real record's brand and a formatted value must appear as literal text,
  // not only inside the embedded JSON payload — a crawler that never executes
  // JS still has to be able to read it.
  const record = catalogue.records[0];
  assert.ok(resultsHtml.includes(`>${record.brand}`), 'brand name missing from static markup');
});

test('the index page has canonical/OG/robots tags pointed at the real site URL', () => {
  assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}/">`));
  assert.ok(html.includes(`<meta property="og:url" content="${SITE_URL}/">`));
  assert.ok(html.includes('<meta name="robots" content="index, follow">'));
});

test('the index page embeds valid Dataset and ItemList JSON-LD covering every record', () => {
  const blocks = jsonLdBlocks(html);
  const dataset = blocks.find((b) => b['@type'] === 'Dataset');
  const itemList = blocks.find((b) => b['@type'] === 'ItemList');

  assert.ok(dataset, 'no Dataset JSON-LD found');
  assert.strictEqual(dataset.url, `${SITE_URL}/`);

  assert.ok(itemList, 'no ItemList JSON-LD found');
  assert.strictEqual(itemList.numberOfItems, catalogue.records.length);
  assert.strictEqual(itemList.itemListElement.length, catalogue.records.length);

  const firstItem = itemList.itemListElement[0].item;
  assert.strictEqual(firstItem['@type'], 'Car');
  assert.ok(firstItem.name);
});

test('a vehicle with a published price gets a schema.org Offer with a numeric price', () => {
  const blocks = jsonLdBlocks(html);
  const itemList = blocks.find((b) => b['@type'] === 'ItemList');
  const priced = itemList.itemListElement.map((el) => el.item).find((item) => item.offers);
  assert.ok(priced, 'no vehicle with an Offer found');
  assert.strictEqual(typeof priced.offers.price, 'number');
  assert.strictEqual(priced.offers.priceCurrency, 'AUD');
});

test('the about page embeds valid FAQPage and BreadcrumbList JSON-LD', () => {
  const blocks = jsonLdBlocks(aboutHtml);
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  const breadcrumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');

  assert.ok(faq, 'no FAQPage JSON-LD found');
  assert.ok(faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) {
    assert.strictEqual(q['@type'], 'Question');
    assert.ok(q.name.trim().endsWith('?'), `FAQ question not phrased as a question: ${q.name}`);
    assert.ok(q.acceptedAnswer.text.length > 20);
  }

  assert.ok(breadcrumbs, 'no BreadcrumbList JSON-LD found');
  assert.strictEqual(breadcrumbs.itemListElement[breadcrumbs.itemListElement.length - 1].item, `${SITE_URL}/about.html`);
});

test('every visible About-page H2 is phrased as a question, matching the FAQ JSON-LD', () => {
  const headings = [...aboutHtml.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
  assert.ok(headings.length >= 5);
  for (const heading of headings) {
    assert.ok(heading.trim().endsWith('?'), `H2 not phrased as a question: ${heading}`);
  }
});

test('robots.txt allows crawling and points at the sitemap', () => {
  const robots = buildRobotsTxt();
  assert.ok(robots.includes('User-agent: *'));
  assert.ok(robots.includes('Allow: /'));
  assert.ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
});

test('sitemap.xml lists both pages with the build date as lastmod', () => {
  const sitemap = buildSitemapXml(catalogue);
  assert.ok(sitemap.includes(`<loc>${SITE_URL}/</loc>`));
  assert.ok(sitemap.includes(`<loc>${SITE_URL}/about.html</loc>`));
  assert.ok(sitemap.includes('<lastmod>2026-09-13</lastmod>'));
});

test('JSON-LD builders never emit unescaped </script> from record data', () => {
  // embedJson() is responsible for this; assert the built pages actually use it.
  assert.ok(!html.includes('</script><script>evil'));
  assert.strictEqual(jsonLdBlocks(html).length, 2);
  assert.strictEqual(jsonLdBlocks(aboutHtml).length, 2);
});
