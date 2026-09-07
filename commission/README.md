<div align="center">

# @lacspace/commission

**A commission & payout calculation engine — flat, percentage and marginal-tiered rules, plus exact proportional splits.**

[![npm version](https://img.shields.io/npm/v/@lacspace/commission?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/commission)
[![install size](https://packagephobia.com/badge?p=@lacspace/commission)](https://packagephobia.com/result?p=@lacspace/commission)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/commission?label=minzip)](https://bundlephobia.com/package/@lacspace/commission)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/commission)
[![license](https://img.shields.io/npm/l/@lacspace/commission?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every marketplace and sales tool re-implements the same money maths badly: what commission does this sale earn, what's left for the seller, and how do you split a payout across several parties **without losing a cent**? This does all three, correctly, in integer minor units — no floats, no rounding drift.

- 💰 **Three rule kinds** — `flat` fee, `percent`, or `tiered` marginal brackets
- 🧢 **Bounds** — optional `min` (floor) and `max` (cap) on any rule
- ✂️ **Exact splits** — proportional allocation where the parts always sum to the total
- 🔢 **Integer minor units** — cents / paisa in, cents / paisa out, never a float
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · zero dependencies · fully typed

> **New in 1.1.0** — all additive, fully backward compatible:
> - 🪜 **Progressive slabs with a breakdown** — `slabCommission` charges each slab marginally and returns a per-slab line item; `volumeTier` / `volumeCommission` pick one whole-amount rate by threshold.
> - 🧱 **Composite & per-category rules** — `compositeCommission` combines flat + percent (+ slabs) with `floor`/`cap`; `categoryCommission` applies per-category rates.
> - 🏷️ **Tax on commission** — `taxOnCommission` computes GST/tax inclusive or exclusive as a separate, reconciling line.
> - 🛒 **Marketplace split** — `marketplaceSplit` takes a platform take-rate (+ optional tax) and shares the remainder among seller/affiliate, with lines that sum to the gross **exactly**.
> - 🎯 **Explicit rounding modes** — `roundMinor` with `half-up` / `half-even` (banker's) / `half-down` / `ceil` / `floor` / `trunc` …, applied consistently. (The original `commission`/`split` are untouched.)

## Install

```bash
npm install @lacspace/commission      # or pnpm add / yarn add / bun add
```

## Commission rules

```ts
import { commission } from "@lacspace/commission";

// 15% of a $10.00 sale (amounts are in cents)
commission({ type: "percent", rate: 0.15 }, 1000);
// → { commission: 150, net: 850, effectiveRate: 0.15 }

// flat fee, floored to at least 50c and capped at $1.00
commission({ type: "flat", amount: 5, min: 50, max: 100 }, 1000);
// → { commission: 50, net: 950, effectiveRate: 0.05 }
```

## Marginal tiers

```ts
import { commission } from "@lacspace/commission";

const rule = {
  type: "tiered" as const,
  tiers: [
    { upTo: 1000, rate: 0.1 },   // first $10.00  @ 10%
    { upTo: 5000, rate: 0.05 },  // next  $40.00  @ 5%
    { upTo: null, rate: 0.02 },  // remainder     @ 2%
  ],
};

commission(rule, 6000);
// 0..1000 → 100, 1000..5000 → 200, 5000..6000 → 20
// → { commission: 320, net: 5680, effectiveRate: 0.0533… }
```

## Splitting a payout

```ts
import { split } from "@lacspace/commission";

// share $10.00 70/30 — the parts always sum to exactly the total
split(1000, [
  { party: "seller", rate: 0.7 },
  { party: "platform", rate: 0.3 },
]);
// → [ { party: "seller", amount: 700 }, { party: "platform", amount: 300 } ]

// awkward thirds: the leftover cent is handed to the largest remainder
split(100, [
  { party: "a", rate: 1 },
  { party: "b", rate: 1 },
  { party: "c", rate: 1 },
]);
// → [ { party: "a", amount: 34 }, { party: "b", amount: 33 }, { party: "c", amount: 33 } ]
```

## Progressive slabs (with breakdown)

```ts
import { slabCommission } from "@lacspace/commission";

// 5% up to ₹1,00,000, 3% above — amounts in paisa
const slabs = [
  { upTo: 100_000, rate: 0.05, label: "up to 1L" },
  { upTo: null,    rate: 0.03, label: "above 1L" },
];

slabCommission(slabs, 150_000);
// → { commission: 6500, net: 143500, effectiveRate: 0.0433…,
//     breakdown: [
//       { label:"up to 1L", from:0,      to:100000, portion:100000, rate:0.05, commission:5000 },
//       { label:"above 1L", from:100000, to:150000, portion:50000,  rate:0.03, commission:1500 },
//     ] }
```

`volumeCommission(tiers, amount)` instead picks ONE rate for the whole amount by the highest threshold it reaches (`{ from, rate }[]`).

## Composite & per-category rates

```ts
import { compositeCommission, categoryCommission } from "@lacspace/commission";

// flat 30c + 2%, capped at 40c
compositeCommission({ flat: 30, percent: 0.02, cap: 40 }, 1000);
// → { commission: 40, net: 960, components: [...], clamped: true, ... }

// different rate per category (grouped by category, `default` used as fallback)
categoryCommission(
  { electronics: { percent: 0.05 }, grocery: { percent: 0.02, cap: 50 }, default: { percent: 0.1 } },
  [{ category: "electronics", amount: 10_000 }, { category: "books", amount: 1000 }],
);
// → { commission: 600, breakdown: [ {category:"electronics", amount:10000, commission:500}, {category:"books", amount:1000, commission:100} ] }
```

## Tax on commission

```ts
import { taxOnCommission } from "@lacspace/commission";

taxOnCommission(1000, 0.18);                    // exclusive: added on top
// → { base: 1000, tax: 180, total: 1180, rate: 0.18, inclusive: false }

taxOnCommission(1180, 0.18, { inclusive: true }); // inclusive: backed out
// → { base: 1000, tax: 180, total: 1180, rate: 0.18, inclusive: true }
// base + tax === total, always exactly.
```

## Marketplace split

```ts
import { marketplaceSplit } from "@lacspace/commission";

// platform takes 20%, then seller/affiliate share the rest — lines sum to gross exactly
marketplaceSplit(10_000, {
  platform: { type: "percent", rate: 0.2 },
  tax: { rate: 0.18 }, // optional GST on the commission (exclusive)
  parties: [ { party: "seller", rate: 0.9 }, { party: "affiliate", rate: 0.1 } ],
});
// → { gross: 10000, platformCommission: 2000, tax: 360, distributable: 7640,
//     parties: [ {party:"seller", amount:6876}, {party:"affiliate", amount:764} ],
//     lines: [ platform 2000, tax 360, seller 6876, affiliate 764 ] }  // Σ lines === 10000
```

## Rounding modes

```ts
import { roundMinor, slabCommission } from "@lacspace/commission";

roundMinor(2.5, "half-up");    // 3   (away from zero)
roundMinor(2.5, "half-even");  // 2   (banker's)
roundMinor(2.5, "half-down");  // 2   (toward zero)

// every additive helper accepts an explicit mode:
slabCommission(slabs, amount, { rounding: "half-even" });
```

## API

| Function | Description |
| --- | --- |
| `commission(rule, amount)` | `{ commission, net, effectiveRate }` — charge for `amount` under `rule` |
| `split(amount, shares)` | `{ party, amount }[]` — proportional split whose parts sum to `amount` exactly |
| `slabCommission(slabs, amount, opts?)` | progressive marginal slabs → total + per-slab `breakdown` |
| `volumeTier(tiers, amount)` / `volumeCommission(tiers, amount, opts?)` | pick / apply one whole-amount rate by threshold |
| `compositeCommission(rule, amount)` | flat + percent (+ slabs) with `floor`/`cap` → total + `components` |
| `categoryCommission(rules, items)` | per-category composite rates, grouped and summed |
| `taxOnCommission(commission, rate, opts?)` | `{ base, tax, total }` GST/tax, inclusive or exclusive |
| `marketplaceSplit(gross, config)` | platform take-rate (+ tax) + party split; lines sum to `gross` exactly |
| `roundMinor(value, mode?)` | explicit rounding to a whole minor unit |

**Rule** is `{ type: "flat"; amount }` \| `{ type: "percent"; rate /*0..1*/ }` \| `{ type: "tiered"; tiers }`, each optionally with `{ min?, max? }`. Tiers are marginal brackets `{ upTo: number \| null; rate }`, the last with `upTo: null` for infinity. All money is in **integer minor units**; the raw commission is rounded to the nearest unit then clamped into `[min, max]`. The 1.1.0 helpers accept a `rounding` mode — one of `half-up` (default) · `half-down` · `half-even` · `half-odd` · `half-ceil` · `half-floor` · `ceil` · `floor` · `trunc`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/commission` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
