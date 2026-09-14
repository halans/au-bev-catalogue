'use strict';

/**
 * Canonical schema for the Australian BEV catalogue.
 *
 * This module is the single definition of what a vehicle record contains.
 * The reconciler, validator, CLI, HTML builder and tests all read from here —
 * adding a field means editing this file and nothing else.
 */

/** Enumerated value domains. A value outside these is a validation error. */
const ENUMS = {
  bodyType: ['hatch', 'sedan', 'wagon', 'suv', 'coupe', 'ute', 'van', 'people-mover'],
  segment: [
    'light', 'small', 'medium', 'large',
    'suv-small', 'suv-medium', 'suv-large',
    'ute', 'van', 'sports', 'luxury',
  ],
  drive: ['FWD', 'RWD', 'AWD'],
  rangeCycle: ['WLTP', 'ADR 81/02', 'NEDC', 'CLTC', 'WLTC'],
  availability: ['current', 'runout', 'announced'],
};

/**
 * Field definitions.
 *
 *  key        canonical field name
 *  label      human label used by CLI and HTML surfaces
 *  type       'string' | 'number' | 'boolean' | 'enum'
 *  enum       enum domain key when type === 'enum'
 *  unit       display unit suffix
 *  min/max    plausibility envelope — outside this range is a validation error,
 *             not merely a warning, because it indicates a parsing mistake
 *  core       counted in the "core field completeness" coverage metric
 *  identity   participates in the record's stable identity key
 *  sortable   offered as a sort key on the CLI and HTML surfaces
 *  facet      offered as a filter facet
 */
const FIELDS = [
  { key: 'brand', label: 'Brand', type: 'string', identity: true, facet: true, core: true },
  { key: 'model', label: 'Model', type: 'string', identity: true, core: true },
  { key: 'variant', label: 'Variant', type: 'string', identity: true, core: true },
  { key: 'bodyType', label: 'Body', type: 'enum', enum: 'bodyType', facet: true, core: true },
  { key: 'segment', label: 'Segment', type: 'enum', enum: 'segment', facet: true },
  { key: 'availability', label: 'Availability', type: 'enum', enum: 'availability', facet: true, core: true },

  { key: 'batteryUsableKwh', label: 'Battery (usable)', type: 'number', unit: 'kWh', min: 10, max: 250, sortable: true, core: true },
  { key: 'batteryGrossKwh', label: 'Battery (gross)', type: 'number', unit: 'kWh', min: 10, max: 250 },
  { key: 'rangeKm', label: 'Range', type: 'number', unit: 'km', min: 50, max: 1200, sortable: true, core: true },
  { key: 'rangeCycle', label: 'Range cycle', type: 'enum', enum: 'rangeCycle', facet: true, core: true },
  { key: 'consumptionWhPerKm', label: 'Consumption', type: 'number', unit: 'Wh/km', min: 80, max: 400, sortable: true },

  { key: 'acChargeKw', label: 'AC charge', type: 'number', unit: 'kW', min: 1, max: 50, sortable: true },
  // Upper bound is 1500 kW because BYD/Denza genuinely publish that ceiling for
  // FLASH Charging. It is a real published figure, not a transcription error —
  // though it is only reachable on a China-market connector, which is why the
  // affected records carry a brand note saying so.
  { key: 'dcChargeKw', label: 'DC charge', type: 'number', unit: 'kW', min: 10, max: 1500, sortable: true, core: true },

  { key: 'drive', label: 'Drive', type: 'enum', enum: 'drive', facet: true, core: true },
  { key: 'powerKw', label: 'Power', type: 'number', unit: 'kW', min: 20, max: 1500, sortable: true, core: true },
  { key: 'torqueNm', label: 'Torque', type: 'number', unit: 'Nm', min: 50, max: 2000, sortable: true },
  { key: 'zeroTo100s', label: '0–100 km/h', type: 'number', unit: 's', min: 1.5, max: 30, sortable: true },

  // Up to 23 so that electric minibuses and 12-seat crew vans validate; the
  // catalogue includes light commercials, not just passenger cars.
  { key: 'seats', label: 'Seats', type: 'number', unit: '', min: 2, max: 23, sortable: true },
  { key: 'towingBrakedKg', label: 'Towing (braked)', type: 'number', unit: 'kg', min: 0, max: 4500, sortable: true },
  { key: 'v2l', label: 'V2L', type: 'boolean', facet: true },

  { key: 'priceAud', label: 'Price', type: 'number', unit: 'AUD', min: 15000, max: 1000000, sortable: true, core: true },
  { key: 'priceBasis', label: 'Price basis', type: 'string' },
];

const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

const CORE_FIELDS = FIELDS.filter((f) => f.core).map((f) => f.key);
const IDENTITY_FIELDS = FIELDS.filter((f) => f.identity).map((f) => f.key);
const SORTABLE_FIELDS = FIELDS.filter((f) => f.sortable).map((f) => f.key);
const FACET_FIELDS = FIELDS.filter((f) => f.facet).map((f) => f.key);

/** Derived fields are computed by the reconciler, never sourced. */
const DERIVED_FIELDS = [
  { key: 'id', label: 'ID', type: 'string' },
  { key: 'efficiencyWhPerKm', label: 'Efficiency (derived)', type: 'number', unit: 'Wh/km', sortable: true },
  { key: 'dollarsPerKmRange', label: 'Cost per km of range', type: 'number', unit: 'AUD/km', sortable: true },
];

/**
 * Source precedence. Higher wins when two sources disagree on a field.
 * A lower-precedence source can still FILL a field the winner left null.
 */
const SOURCE_PRECEDENCE = {
  'green-vehicle-guide': 100, // AU government, ADR-tested — authoritative where present
  manufacturer: 80, // brand's own Australian site
  press: 50, // reputable AU motoring press
  wikidata: 30, // CC0 but inconsistent
  'overseas-regulator': 20, // UK VCA / EU EAFO — different market spec
};

/** Licence metadata per source kind, surfaced in the built artefacts. */
const SOURCE_LICENCES = {
  'green-vehicle-guide': 'Commonwealth of Australia, third-party licence agreement required',
  manufacturer: 'proprietary-factual (specification facts restated with attribution)',
  press: 'proprietary-factual (specification facts restated with attribution)',
  wikidata: 'CC0-1.0',
  'overseas-regulator': 'Open Government Licence / EC reuse notice',
};

const CONFIDENCE = ['high', 'medium', 'low'];

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

/** Stable, deterministic slug used for identity keys and DOM ids. */
function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Identity key for a record: brand + model + variant, slugged. */
function identityKey(record) {
  return IDENTITY_FIELDS.map((k) => slug(record[k] == null ? '' : record[k])).join('__');
}

module.exports = {
  ENUMS,
  FIELDS,
  FIELD_BY_KEY,
  CORE_FIELDS,
  IDENTITY_FIELDS,
  SORTABLE_FIELDS,
  FACET_FIELDS,
  DERIVED_FIELDS,
  SOURCE_PRECEDENCE,
  SOURCE_LICENCES,
  CONFIDENCE,
  isBlank,
  slug,
  identityKey,
};
