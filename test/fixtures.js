'use strict';

/**
 * Deterministic fixtures. These are synthetic vehicles, not real ones — the
 * point is to pin reconciler and validator behaviour to known inputs, without
 * tests breaking every time a real price changes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** A brand file where the manufacturer and the press disagree on two fields. */
const CONFLICTING = {
  brand: 'Testla',
  brandSlug: 'testla',
  publisher: 'Testla Australia',
  sourceUrls: ['https://www.testla.example/au/specs'],
  fetchedAt: '2026-09-13',
  licence: 'proprietary-factual',
  notes: 'Synthetic fixture brand.',
  variants: [
    {
      model: 'Bolt',
      variant: 'Base',
      bodyType: 'hatch',
      segment: 'small',
      batteryUsableKwh: 50,
      rangeKm: 400,
      rangeCycle: 'WLTP',
      acChargeKw: 11,
      dcChargeKw: 100,
      drive: 'FWD',
      powerKw: 150,
      seats: 5,
      priceAud: 40000,
      priceBasis: 'MSRP before on-road costs',
      availability: 'current',
      // Sourced from press, so precedence should keep manufacturer values
      // where both exist, and accept press values where only press has one.
      fieldSources: {
        torqueNm: 'https://www.carexpert.com.au/testla-bolt',
        dcChargeKw: 'https://www.carexpert.com.au/testla-bolt',
      },
      torqueNm: 300,
      lowConfidenceFields: ['torqueNm'],
    },
  ],
};

/** A brand file that trips several validator rules on purpose. */
const INVALID = {
  brand: 'Brokenbrand',
  brandSlug: 'brokenbrand',
  publisher: 'Brokenbrand Australia',
  sourceUrls: ['https://www.brokenbrand.example/au'],
  fetchedAt: '2020-01-01', // stale
  licence: 'proprietary-factual',
  notes: 'Synthetic fixture for validator rules.',
  variants: [
    {
      model: 'Wrong',
      variant: 'Everything',
      bodyType: 'spaceship', // enum-out-of-domain
      segment: 'medium',
      batteryUsableKwh: 80,
      batteryGrossKwh: 60, // derived-inconsistent: gross < usable
      rangeKm: 9000, // value-out-of-envelope
      rangeCycle: 'CLTC', // range-cycle-not-wltp
      drive: 'AWD',
      powerKw: 200,
      seats: 5,
      priceAud: 50000,
      priceBasis: 'drive-away', // price-basis-not-msrp
      availability: 'current',
      lowConfidenceFields: [],
    },
  ],
};

/** A brand checked and found to sell no BEV. */
const EMPTY_BRAND = {
  brand: 'Notinmarket',
  brandSlug: 'notinmarket',
  publisher: 'Notinmarket Australia',
  sourceUrls: ['https://www.notinmarket.example/au'],
  fetchedAt: '2026-09-13',
  licence: 'proprietary-factual',
  notes: 'Confirmed to sell no battery-electric vehicle in Australia.',
  variants: [],
};

/** Write a throwaway sources directory and return its path. */
function makeSourcesDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bev-fixture-'));
  const contents = files || {
    'testla.json': CONFLICTING,
    'brokenbrand.json': INVALID,
    'notinmarket.json': EMPTY_BRAND,
  };
  const names = Object.keys(contents);
  for (let i = 0; i < names.length; i += 1) {
    fs.writeFileSync(
      path.join(dir, names[i]),
      typeof contents[names[i]] === 'string'
        ? contents[names[i]]
        : JSON.stringify(contents[names[i]], null, 2),
      'utf8'
    );
  }
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { CONFLICTING, INVALID, EMPTY_BRAND, makeSourcesDir, cleanup };
