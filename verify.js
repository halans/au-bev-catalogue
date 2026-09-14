#!/usr/bin/env node
'use strict';
// Offline integrity check: recompute every checksum in SHA256SUMS.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname;
let bad = 0, checked = 0;
for (const line of fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
  const [expected, file] = line.split(/\s\s+/);
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { console.error('MISSING  ' + file); bad++; continue; }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  checked++;
  if (actual !== expected) { console.error('CHANGED  ' + file); bad++; }
}
console.log(checked + ' files verified, ' + bad + ' problem(s)');
process.exitCode = bad ? 1 : 0;
