# Coverage report

Generated from `data/catalogue.json` on 2026-09-14. Regenerate with `node scripts/coverage-report.js` (or read it live via `bev coverage`).

This file exists because "is the catalogue complete?" is a measurement, not a claim.

## Totals

| Metric | Value |
| --- | --- |
| Variants | 276 |
| Brands with at least one BEV | 50 |
| Brands checked | 56 |
| Brands checked, selling no BEV | 6 |
| Populated fields | 4685 |
| Core-field completeness | 89.9% |
| Recorded source conflicts | 5 |
| Snapshot dates | 2026-09-13 to 2026-09-13 |

## Availability mix

The catalogue includes runout and announced models, not only current order books.

- **announced** — 18
- **current** — 248
- **runout** — 10

## Where the data comes from

| Source kind | Populated fields | Share |
| --- | --- | --- |
| manufacturer | 3699 | 79% |
| press | 986 | 21% |

No field in this catalogue comes from an Australian government source. The Green
Vehicle Guide is the only official per-model dataset and it sits behind a signed
third-party licence agreement, so every figure here is either the manufacturer's own
Australian publication or Australian motoring press. See README for the full audit.

## Field completeness

| Field | Core | Present | Missing | Complete | Low confidence |
| --- | --- | --- | --- | --- | --- |
| Brand | yes | 276 | 0 | 100% | 0 |
| Model | yes | 276 | 0 | 100% | 0 |
| Variant | yes | 276 | 0 | 100% | 3 |
| Body | yes | 276 | 0 | 100% | 0 |
| Segment |  | 276 | 0 | 100% | 3 |
| Availability | yes | 276 | 0 | 100% | 7 |
| Battery (usable) | yes | 191 | 85 | 69.2% | 47 |
| Battery (gross) |  | 88 | 188 | 31.9% | 26 |
| Range | yes | 222 | 54 | 80.4% | 50 |
| Range cycle | yes | 244 | 32 | 88.4% | 4 |
| Consumption |  | 63 | 213 | 22.8% | 11 |
| AC charge |  | 200 | 76 | 72.5% | 44 |
| DC charge | yes | 198 | 78 | 71.7% | 60 |
| Drive | yes | 267 | 9 | 96.7% | 5 |
| Power | yes | 246 | 30 | 89.1% | 36 |
| Torque |  | 208 | 68 | 75.4% | 40 |
| 0–100 km/h |  | 157 | 119 | 56.9% | 24 |
| Seats |  | 263 | 13 | 95.3% | 23 |
| Towing (braked) |  | 111 | 165 | 40.2% | 33 |
| V2L |  | 93 | 183 | 33.7% | 10 |
| Price | yes | 231 | 45 | 83.7% | 77 |
| Price basis |  | 247 | 29 | 89.5% | 0 |

## Per-brand completeness

| Brand | Variants | Core complete | Low-confidence fields | Availability |
| --- | --- | --- | --- | --- |
| Mercedes-Benz | 22 | 90.9% | 77 | current: 18, announced: 4 |
| Porsche | 19 | 79.4% | 39 | current: 19 |
| Hyundai | 15 | 96.7% | 33 | current: 12, runout: 3 |
| Kia | 12 | 97.2% | 58 | current: 12 |
| BMW | 11 | 88.6% | 15 | current: 10, announced: 1 |
| Audi | 10 | 81.7% | 31 | current: 9, announced: 1 |
| BYD | 10 | 98.3% | 5 | runout: 1, current: 9 |
| MG | 10 | 90.8% | 11 | current: 10 |
| Mini | 9 | 96.3% | 19 | current: 9 |
| Skoda | 9 | 93.5% | 10 | current: 8, announced: 1 |
| Polestar | 8 | 97.9% | 6 | current: 8 |
| Volkswagen | 8 | 100% | 11 | current: 8 |
| XPENG | 8 | 81.3% | 6 | current: 6, announced: 2 |
| Zeekr | 8 | 94.8% | 0 | current: 8 |
| Tesla | 7 | 98.8% | 4 | current: 7 |
| IM Motors | 6 | 100% | 2 | current: 6 |
| LDV | 6 | 80.6% | 6 | current: 6 |
| Lotus | 6 | 86.1% | 8 | current: 6 |
| Smart | 6 | 88.9% | 10 | current: 6 |
| Leapmotor | 5 | 95% | 8 | current: 5 |
| Nissan | 5 | 100% | 15 | current: 3, runout: 2 |
| Volvo | 5 | 70% | 7 | current: 5 |
| Aion | 4 | 100% | 2 | current: 4 |
| Deepal | 4 | 91.7% | 7 | current: 3, runout: 1 |
| Geely | 4 | 93.8% | 6 | current: 4 |
| Genesis | 4 | 83.3% | 8 | current: 3, announced: 1 |
| KGM | 4 | 91.7% | 4 | current: 4 |
| Lexus | 4 | 87.5% | 12 | current: 3, announced: 1 |
| Mitsubishi | 4 | 41.7% | 0 | announced: 4 |
| Cupra | 3 | 100% | 16 | current: 3 |
| Denza | 3 | 97.2% | 8 | current: 2, announced: 1 |
| Ford | 3 | 100% | 8 | current: 3 |
| Jeep | 3 | 97.2% | 3 | current: 3 |
| Mazda | 3 | 80.6% | 4 | current: 2, announced: 1 |
| Peugeot | 3 | 86.1% | 11 | current: 3 |
| Renault | 3 | 88.9% | 8 | current: 2, announced: 1 |
| Toyota | 3 | 97.2% | 1 | current: 3 |
| Abarth | 2 | 100% | 2 | runout: 2 |
| Farizon | 2 | 54.2% | 3 | current: 2 |
| GWM | 2 | 83.3% | 6 | current: 2 |
| Maserati | 2 | 62.5% | 2 | current: 2 |
| Skywell | 2 | 75% | 1 | current: 2 |
| Subaru | 2 | 100% | 0 | current: 2 |
| Alfa Romeo | 1 | 100% | 0 | current: 1 |
| Cadillac | 1 | 83.3% | 1 | current: 1 |
| Chery | 1 | 91.7% | 1 | current: 1 |
| Fiat | 1 | 91.7% | 2 | runout: 1 |
| Fuso | 1 | 75% | 0 | current: 1 |
| Honda | 1 | 83.3% | 4 | current: 1 |
| Omoda Jaecoo | 1 | 91.7% | 2 | current: 1 |

## Recorded source conflicts

Where two sources disagreed by more than 2%, the higher-precedence value was kept
and the rejected value recorded rather than discarded.

| Vehicle | Field | Kept | Rejected |
| --- | --- | --- | --- |
| nissan__ariya__advance | variant | Advance (press) | Advance+ (press) |
| nissan__ariya__advance | batteryUsableKwh | 63 (press) | 87 (press) |
| nissan__ariya__advance | rangeKm | 385 (press) | 504 (press) |
| nissan__ariya__advance | powerKw | 160 (press) | 178 (press) |
| nissan__ariya__advance | priceAud | 59840 (press) | 63840 (press) |

## Brands checked that sell no BEV in Australia

These are evidence of a negative result, not omissions. A brand missing from both
this list and the table above has not been checked.

- **Citroen** — WITHDRAWN FROM MARKET: Citroen Australia (importer Inchcape) formally ceased all new-vehicle sales in Australia effective 1 November 2024, ending a 101+ year presence, after sales collapsed to just 87 units in H1 2024 (down 35% year-on-year, versus a 2007 peak of 3803 annual deliveries). Existing orders placed before 1 November 2024 were fulfilled, and Citroen's ~35 dealer network transitioned to a service-and-maintenance-only operation; the importer refocused on its sibling brand Peugeot. At the time of withdrawal Citroen's Australian range was petrol/diesel only (C3, C4, C5 Aircross, C5 X) -- no BEV was part of the final local lineup. Search results also surfaced ccarprice.com listings claiming current Australian availability and pricing for an e-C4 X, e-Berlingo and e-SpaceTourer; ccarprice.com is a low-reliability, seemingly auto-generated aggregator that explicitly disclaims guaranteed accuracy, and its claims directly conflict with the official Citroen Australia market-exit announcement and multiple corroborating reputable press sources (carsales, WhichCar, Drive, CarExpert), so those listings are treated as incorrect/not credible and excluded. As of September 2026, Citroen sells no new vehicles of any powertrain in Australia, BEV or otherwise.
- **Foton** — Foton's current Australian passenger/light-commercial lineup (Tunland V7 and Tunland V9 utes, priced approx. $39,990-$49,990) is confirmed across multiple 2025/2026 sources to be diesel or diesel mild-hybrid only, with no battery-electric variant offered new in Australia. No evidence was found this session of an on-sale Foton or Foton-affiliated (e.g. 'Asiastar') BEV in the Australian market; a prior research pass had flagged a possible 'Tunland G7 EV' but this could not be corroborated this session against any dealer, press, or manufacturer source and is treated as unconfirmed/likely incorrect. Foton does sell electric light trucks/buses in some overseas markets, but none were verified as available for retail new-vehicle purchase in Australia within the 4.5-tonne GVM passenger/LCV scope of this dataset.
- **Isuzu** — Isuzu does not currently sell a battery-electric vehicle in Australia as of September 2026. The Isuzu D-Max EV (battery-electric dual-cab ute) has been confirmed by Isuzu as planned for the Australian market, and has appeared in various global/regional launches, but multiple 2025 reports indicate no confirmed Australian on-sale date, with local timing reportedly linked to New Vehicle Efficiency Standard (NVES) policy settings and light commercial vehicle CO2 targets. No Isuzu BEV is currently orderable new in Australia.
- **Jaguar** — REAL DOUBT / LIKELY WITHDRAWN: Jaguar's I-Pace was, as of a November 2024 review, sellable in Australia on remaining stock only ('sufficient stock... to carry us through to 2025'), following JLR's July 2024 global decision to axe the I-Pace and E-Pace as 'zero-profitability products'. CarExpert's own 2026 I-Pace pricing page (published 20 Aug 2026) shows 'Price not available' and zero year-to-date sales for 2026, and the official jaguar.com/en-au I-Pace specifications page itself returned a broken/unavailable content block at fetch time. Given no confirmed current price, zero 2026 sales, and a global discontinuation decision from mid-2024, the I-Pace is judged to be effectively no longer orderable new in Australia as of September 2026 and is therefore NOT listed as a current variant (an empty variants array is used) rather than assumed still on sale. Note also: a March 2026 CarExpert report described a recall affecting ~270 older (2017-2021 build) I-Pace units for a battery overheating/fire risk, capping charging at 90% pending a permanent fix -- this affects existing fleet vehicles, not new-vehicle orderability, and is unrelated to the withdrawal finding above. No other Jaguar BEV (e.g. a Jaguar 'Type 00' successor GT) has been confirmed as launched or orderable in Australia.
- **Mahindra** — Mahindra Australia sells ZERO battery-electric vehicles as of September 2026. The current retail lineup is exclusively internal-combustion: Scorpio (diesel), XUV3XO (petrol), XUV700 (petrol/diesel), plus an upcoming diesel-only Lifestyler dual-cab ute - none of these are electrified. AU press (carsales.com.au, 2026-09-02; Drive.com.au, 2026-09-02; GoAuto, 2026-08-18) reports Mahindra is evaluating a trio of EVs (XEV 9e, XEV 9S, BE 6) for possible future Australian launch - a single XEV 9e demonstrator has been imported on temporary plates for internal dealer display, and Australian trademark filings exist for 'XEV 9E' and 'BE 6' - but none has a confirmed launch date, Australian specification, or pricing. This does not meet the bar for 'announced' status (which requires a confirmed AU launch), so no variants are listed. Revisit this brand as these EVs progress toward a firm Australian launch commitment.
- **Ram** — Ram does not currently sell any battery-electric vehicle in Australia as of September 2026. The Ram 1500 REV, a planned full-BEV version of the Ram 1500, was cancelled by Stellantis/RAM globally in September 2025 before reaching an Australian right-hand-drive conversion or launch. The Ram Ramcharger (an extended-range electric vehicle / EREV with a petrol generator providing extended range) is out of scope for this dataset because it is not a pure battery-electric vehicle. No other Ram BEV model is confirmed for the Australian market.

## Known limits

- **Prices are indicative.** Some brands publish only drive-away pricing; those records
  say so in `priceBasis` and trip the `price-basis-not-msrp` warning. Drive-away figures
  vary by state and are not comparable with MSRP.
- **Range is only comparable within a cycle.** WLTP, NEDC and CLTC figures are stored
  with the cycle named and are never merged. Non-WLTP records trip `range-cycle-not-wltp`.
- **A missing value is a real answer.** Every unknown is `null` and renders as an em dash.
  Numeric filters exclude unknowns rather than assuming a value.
