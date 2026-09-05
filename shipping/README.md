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
```

## Free-shipping nudge

```ts
import { freeShippingRemaining } from "@lacspace/shipping";

const std = { id: "std", label: "Standard", strategy: "flat", flat: 600, freeOver: 5000 };
freeShippingRemaining(std, 3800); // → 1200  ("spend $12.00 more for free shipping")
```

## API

| Export | Description |
| --- | --- |
| `resolveZone(dest, zones)` | match a destination to a zone — region first, then country, case-insensitive |
| `rateForMethod(method, input)` | compute one method's `ShippingQuote` (base by strategy + surcharge + handling, clamped, free-over applied) |
| `quoteShipping(methods, input)` | filter by zone & quote every applicable method, sorted by cost ascending |
| `cheapestQuote(methods, input)` | the single lowest quote, or `undefined` |
| `freeShippingRemaining(method, subtotal)` | minor units still needed to hit `freeOver` (`0` if none / already free) |
| `ShippingError` | thrown when a method can't be rated (no matching band or missing metric) |

**Strategies** — `flat` uses `method.flat`; `weight` uses `input.weight` (grams); `price` uses `input.subtotal`; `item` uses `input.itemCount`. Band-based strategies read `method.bands` where `min` is inclusive, `max` is inclusive, and an undefined `max` is the open-ended top tier.

**Types** — `ShippingZone`, `RateStrategy`, `RateBand`, `ShippingMethod`, `ShipmentInput`, `ShippingQuote` are all exported.

All amounts are integer **minor units**; a method with no `zoneId` applies to every zone, and `freeOver` zeroes the cost when `subtotal ≥ freeOver`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/shipping` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
