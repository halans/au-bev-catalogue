#!/usr/bin/env node
'use strict';

/**
 * Build an offline-complete distributable.
 *
 * The zip must be verifiable by a recipient with no network access: it carries
 * the cached source snapshots, a checksum manifest, the prebuilt artefacts, the
 * full test suite, and instructions to rebuild everything from scratch. If a
 * recipient can only read it but not reproduce it, the package has failed.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, 'build', 'au-bev-catalogue');
const OUT = path.join(ROOT, 'build');

const INCLUDE = [
  'package.json',
  'README.md',
  'bin/bev.js',
  'src/schema.js',
  'src/engine.js',
  'src/rehydrate.js',
  'src/reconcile.js',
  'src/validate.js',
  'src/coverage.js',
  'src/reporters.js',
  'src/build.js',
  'src/build-html.js',
  'src/index.js',
  'src/adapters/snapshot.js',
  'scripts/coverage-report.js',
  'scripts/package.js',
  'docs/SCHEMA.md',
  'docs/EXTENDING.md',
  'docs/COVERAGE.md',
  'docs/RECREATING.md',
  'docs/examples/list.md',
  'docs/examples/show.md',
  'docs/examples/coverage.md',
  'docs/examples/validate.md',
  'data/catalogue.json',
  'dist/index.html',
  'dist/about.html',
];

const INCLUDE_DIRS = ['data/sources', 'test'];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function copy(relative) {
  const from = path.join(ROOT, relative);
  const to = path.join(STAGE, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return sha256(fs.readFileSync(from));
}

function main() {
  // Pin the build date and ship it, so a recipient can reproduce the exact
  // artefacts. Without this, their rebuild stamps THEIR date into the
  // catalogue and the integrity check reports a false mismatch.
  const buildDate = new Date().toISOString().slice(0, 10);

  console.log('rebuilding before packaging (build date ' + buildDate + ')…');
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'bev.js'), 'build', '--now', buildDate], {
    cwd: ROOT, stdio: 'inherit',
  });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'coverage-report.js')], {
    cwd: ROOT, stdio: 'inherit',
  });

  console.log('running the suite before packaging…');
  execFileSync(process.execPath, ['--test', 'test/*.test.js'], { cwd: ROOT, stdio: 'inherit' });

  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  fs.writeFileSync(path.join(STAGE, 'BUILD_DATE'), buildDate + '\n', 'utf8');

  const manifest = {};

  for (const relative of INCLUDE) {
    if (!fs.existsSync(path.join(ROOT, relative))) {
      throw new Error('packaging expected ' + relative + ' but it is missing');
    }
    manifest[relative] = copy(relative);
  }

  for (const dir of INCLUDE_DIRS) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).sort()) {
      const relative = path.posix.join(dir, name);
      if (fs.statSync(path.join(ROOT, relative)).isDirectory()) continue;
      manifest[relative] = copy(relative);
    }
  }

  // Checksum manifest, so the recipient can verify nothing was altered.
  manifest['BUILD_DATE'] = sha256(fs.readFileSync(path.join(STAGE, 'BUILD_DATE')));

  const manifestLines = Object.keys(manifest).sort()
    .map((file) => manifest[file] + '  ' + file);
  fs.writeFileSync(path.join(STAGE, 'SHA256SUMS'), manifestLines.join('\n') + '\n', 'utf8');

  // A verifier that works with nothing but Node.
  fs.writeFileSync(path.join(STAGE, 'verify.js'), `#!/usr/bin/env node
'use strict';
// Offline integrity check: recompute every checksum in SHA256SUMS.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname;
let bad = 0, checked = 0;
for (const line of fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trim().split('\\n')) {
  const [expected, file] = line.split(/\\s\\s+/);
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { console.error('MISSING  ' + file); bad++; continue; }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  checked++;
  if (actual !== expected) { console.error('CHANGED  ' + file); bad++; }
}
console.log(checked + ' files verified, ' + bad + ' problem(s)');
process.exitCode = bad ? 1 : 0;
`, 'utf8');

  const count = Object.keys(manifest).length;
  console.log('staged ' + count + ' files with checksums');

  const zipName = 'au-bev-catalogue.zip';
  const zipPath = path.join(OUT, zipName);
  fs.rmSync(zipPath, { force: true });
  try {
    execFileSync('zip', ['-r', '-q', zipName, 'au-bev-catalogue'], { cwd: OUT });
    const size = Math.round(fs.statSync(zipPath).size / 1024);
    console.log('wrote build/' + zipName + ' (' + size + ' KB)');
  } catch (err) {
    console.error('zip unavailable; the staged directory is at ' + STAGE);
  }
}

if (require.main === module) main();
