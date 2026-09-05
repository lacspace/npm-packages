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

## API

| Function | Description |
| --- | --- |
| `commission(rule, amount)` | `{ commission, net, effectiveRate }` — charge for `amount` under `rule` |
| `split(amount, shares)` | `{ party, amount }[]` — proportional split whose parts sum to `amount` exactly |

**Rule** is `{ type: "flat"; amount }` \| `{ type: "percent"; rate /*0..1*/ }` \| `{ type: "tiered"; tiers }`, each optionally with `{ min?, max? }`. Tiers are marginal brackets `{ upTo: number \| null; rate }`, the last with `upTo: null` for infinity. All money is in **integer minor units**; the raw commission is rounded to the nearest unit then clamped into `[min, max]`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/commission` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
