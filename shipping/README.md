<div align="center">

# @lacspace/shipping

**A checkout-time shipping-rate calculator — rate tables by zone, free-shipping thresholds, surcharges & handling.**

[![npm version](https://img.shields.io/npm/v/@lacspace/shipping?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/shipping)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/shipping?label=minzip)](https://bundlephobia.com/package/@lacspace/shipping)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/shipping)
[![license](https://img.shields.io/npm/l/@lacspace/shipping?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The "how much is postage?" logic every store re-implements badly. A tiny set of **pure functions** over plain rate rules — resolve a destination zone, compute `flat` / `weight` / `price` / `item` rate tables, apply free-shipping thresholds, surcharges and handling, and hand back sorted method quotes. No floats, no carrier SDK, no framework.

- 🧭 **Zone-aware** — match a destination by region (specific) then country
- 🪜 **Four strategies** — flat, weight-banded, price-banded, or item-count-banded rate tables
- 🎁 **Free-shipping** — threshold-based free shipping + "spend X more" helper
- 🪙 **Exact money** — integer **minor units** everywhere, weight in grams
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

> **Rates, not tracking.** This package computes prices at checkout. For carrier tracking / label events, see **`@lacspace/courier`**.

> **🆕 New in 1.2.0** — all additive, fully backward compatible: **dimensional / volumetric weight** (`billableWeight`), **origin→destination zone rate tables** (`rateFromZoneTable`), **discounted** (not just free) order-value thresholds (`applyThreshold`), an itemised **surcharge/handling breakdown** (`rateBreakdown`), and **multi-method quotes with estimated-days ETA + dim pricing** (`quoteMethods`). Every existing export is unchanged.

## Install

```bash
npm i @lacspace/shipping      # or pnpm add / yarn add / bun add
```

## Resolve a zone

```ts
import { resolveZone } from "@lacspace/shipping";

const zones = [
  { id: "us", countries: ["US"] },
  { id: "ca-on", countries: ["CA"], regions: ["ON"] },
];

resolveZone({ country: "US" }, zones);              // → { id: "us", ... }
resolveZone({ country: "CA", region: "ON" }, zones); // → region wins → { id: "ca-on", ... }
```

## Quote shipping methods

```ts
import { quoteShipping, cheapestQuote } from "@lacspace/shipping";

const methods = [
  { id: "std", label: "Standard", zoneId: "us", strategy: "weight",
    bands: [{ min: 0, max: 500, cost: 300 }, { min: 501, cost: 600 }],
    freeOver: 5000 },
  { id: "express", label: "Express", zoneId: "us", strategy: "flat", flat: 1500 },
  { id: "global", label: "Global", strategy: "flat", flat: 900 }, // no zoneId → everywhere
];

quoteShipping(methods, { zoneId: "us", weight: 300, subtotal: 4000 });
// → sorted ascending: [{ methodId: "std", cost: 300, free: false }, ... ]

cheapestQuote(methods, { zoneId: "us", weight: 300, subtotal: 5000 });
// → std is free (subtotal ≥ freeOver) → { methodId: "std", cost: 0, free: true }

// skip zero-cost methods (store pickup / a hit free-shipping threshold) to show a real rate:
cheapestQuote(methods, { zoneId: "us", weight: 300, subtotal: 5000 }, { excludeFree: true });
// → cheapest method that actually charges → { methodId: "global", cost: 900, free: false }
```

## Free-shipping nudge

```ts
import { freeShippingRemaining } from "@lacspace/shipping";

const std = { id: "std", label: "Standard", strategy: "flat", flat: 600, freeOver: 5000 };
freeShippingRemaining(std, 3800); // → 1200  ("spend $12.00 more for free shipping")
```

## Dimensional weight (new in 1.2.0)

Carriers bill the **greater** of actual and volumetric weight. Compute the billable weight and feed it straight into rate selection:

```ts
import { billableWeight, rateForMethod } from "@lacspace/shipping";

const dims = { length: 30, width: 20, height: 10 }; // cm
billableWeight(400, dims, { divisor: 5 }); // → 1200 (volumetric 1200 g > actual 400 g)

// A bulky-but-light parcel is now rated by the space it occupies:
rateForMethod(weightMethod, { weight: billableWeight(400, dims, { divisor: 5 }) });
```

`volumetricWeight(dims, { divisor, scale })` = `ceil(l×w×h×scale ÷ divisor)`, rounded **up**. Default divisor `5000` (cm→kg); pass `divisor: 5` to work in grams.

## Zone rate tables (new in 1.2.0)

An origin → destination "zone chart": pick the lane, then read the cost off its weight bracket (or a flat / per-item rate). A specific `from` lane beats a wildcard-origin lane.

```ts
import { rateFromZoneTable } from "@lacspace/shipping";

const lanes = [
  { to: "us", strategy: "weight", bands: [{ min: 0, max: 500, cost: 400 }, { min: 501, cost: 800 }] },
  { from: "eu-hub", to: "us", strategy: "flat", flat: 250 }, // cheaper from the hub
];

rateFromZoneTable(lanes, { toZone: "us", weight: 501 });                 // → 800 (bracket boundary)
rateFromZoneTable(lanes, { fromZone: "eu-hub", toZone: "us", weight: 999 }); // → 250 (specific lane wins)
```

`selectBand(bands, value)` and `baseCost(method, input)` are exported too, for building custom pipelines.

## Discounted thresholds & breakdowns (new in 1.2.0)

`applyThreshold` adds a *discounted* tier below the free one; `rateBreakdown` shows every part of a quote and they sum exactly.

```ts
import { applyThreshold, rateBreakdown } from "@lacspace/shipping";

applyThreshold(800, 4999, { freeOver: 5000, discountOver: 3000, discountBps: 5000 });
// → { cost: 400, free: false, discounted: true }  (50% off; free wins at ≥ 5000)

rateBreakdown(method, { weight: 300 }, { fuelBps: 1000, remoteAreaFee: 200 });
// → { base, handling, surcharges: [{label:"fuel",…},…], surchargeTotal, discount, total, free }
```

## Multi-method quotes with ETA (new in 1.2.0)

```ts
import { quoteMethods } from "@lacspace/shipping";

quoteMethods(methods, { zoneId: "us" });                 // cost-sorted; each has estimatedDays (ETA midpoint)
quoteMethods(methods, { zoneId: "us" }, { sortBy: "speed" });          // fastest first
quoteMethods(methods, { weight: 400 }, { dimensions: dims, divisor: 5 }); // rates on billable weight
```

## API

| Export | Description |
| --- | --- |
| `resolveZone(dest, zones)` | match a destination to a zone — region first, then country, case-insensitive |
| `rateForMethod(method, input)` | compute one method's `ShippingQuote` (base by strategy + surcharge + handling, clamped, free-over applied) |
| `quoteShipping(methods, input)` | filter by zone & quote every applicable method, sorted by cost ascending |
| `cheapestQuote(methods, input, { excludeFree? })` | the single lowest quote, or `undefined`; `{ excludeFree: true }` skips zero-cost methods and returns the cheapest that actually charges |
| `freeShippingRemaining(method, subtotal)` | minor units still needed to hit `freeOver` (`0` if none / already free) |
| `ShippingError` | thrown when a method can't be rated (no matching band or missing metric) |
| `volumetricWeight(dims, { divisor?, scale? })` | volumetric weight `ceil(l×w×h×scale ÷ divisor)`, rounded up |
| `billableWeight(actual, dims, opts?)` | `max(actual, volumetric)` — feed as the `weight` metric |
| `selectBand(bands, value)` | the bracket covering `value` (min/max inclusive, open-ended top), or `undefined` |
| `baseCost(method, input)` | a method's strategy base cost before surcharge/handling/clamp/free |
| `resolveLane(lanes, input)` / `rateFromZoneTable(lanes, input)` | resolve an origin→destination lane (specific `from` first) and read its rate |
| `applyThreshold(cost, subtotal, rule)` | apply a free / discounted order-value threshold → `{ cost, free, discounted }` |
| `rateBreakdown(method, input, opts?)` | itemised `{ base, handling, surcharges[], surchargeTotal, discount, total, free }` (fuel bps / remote-area / custom surcharges) |
| `quoteMethods(methods, input, opts?)` | multi-method quotes each with `estimatedDays`; sort by `cost`/`speed`, optional `dimensions` for dim pricing |
| `estimatedDays(etaDays)` | rounded midpoint of an `[min, max]` ETA window |

**Strategies** — `flat` uses `method.flat`; `weight` uses `input.weight` (grams); `price` uses `input.subtotal`; `item` uses `input.itemCount`. Band-based strategies read `method.bands` where `min` is inclusive, `max` is inclusive, and an undefined `max` is the open-ended top tier.

**Types** — `ShippingZone`, `RateStrategy`, `RateBand`, `ShippingMethod`, `ShipmentInput`, `ShippingQuote` are all exported, plus (1.2.0) `Dimensions`, `DimWeightOptions`, `ZoneLane`, `LaneInput`, `ThresholdRule`, `ThresholdResult`, `SurchargeItem`, `SurchargeLine`, `BreakdownOptions`, `QuoteBreakdown`, `MethodQuote`, `QuoteMethodsOptions`.

All amounts are integer **minor units**; a method with no `zoneId` applies to every zone, and `freeOver` zeroes the cost when `subtotal ≥ freeOver`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/shipping` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
