<div align="center">

# @lacspace/coupon

**A discount / coupon engine — percent, fixed & free-shipping codes with validity windows, minimum-subtotal thresholds, discount caps and usage limits.**

[![npm version](https://img.shields.io/npm/v/@lacspace/coupon?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/coupon)
[![install size](https://packagephobia.com/badge?p=@lacspace/coupon)](https://packagephobia.com/result?p=@lacspace/coupon)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/coupon?label=minzip)](https://bundlephobia.com/package/@lacspace/coupon)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/coupon)
[![license](https://img.shields.io/npm/l/@lacspace/coupon?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The discount logic every checkout re-implements badly: is this code valid right now, and what does it actually take off the total? A tiny pair of **pure functions** over a plain `Coupon` object — validate the window / threshold / usage limit, then compute `percent`, `fixed` or `free-shipping` discounts. Integer **minor units** throughout, so there's no floating-point drift.

- 🏷️ **Three code kinds** — `percent`, `fixed` (flat amount) and `free-shipping`
- ⏱️ **Validity window** — `startsAt` / `endsAt` (ISO-8601), plus `minSubtotal` threshold and `usageLimit`
- 🧢 **Discount caps** — `maxDiscount`, and the discount is never more than the subtotal
- 🪙 **Exact money** — integer **minor units** (cents / paisa) everywhere, never a float
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

## Install

```bash
npm install @lacspace/coupon      # or pnpm add / yarn add / bun add
```

## Apply a coupon

```ts
import { applyCoupon, type Coupon } from "@lacspace/coupon";

const coupon: Coupon = {
  code: "SAVE20",
  type: "percent",
  value: 20,          // 20%
  maxDiscount: 500,   // never more than $5.00
  minSubtotal: 1000,  // order must be at least $10.00
};

applyCoupon(coupon, { subtotal: 3000, shipping: 400 });
// → { valid: true, discount: 500, shippingDiscount: 0, total: 2900 }
// 20% of 3000 is 600, but maxDiscount caps it at 500
// total = max(0, subtotal - discount + shipping - shippingDiscount)
```

`percent` is `round(subtotal * value / 100)`, `fixed` is `min(value, subtotal)` — both capped by `maxDiscount` and clamped to the subtotal:

```ts
// flat $5.00 off (value is in minor units)
applyCoupon({ code: "FIVER", type: "fixed", value: 500 }, { subtotal: 1200 });
// → { valid: true, discount: 500, shippingDiscount: 0, total: 700 }

// free shipping zeroes the shipping line only
applyCoupon({ code: "FREESHIP", type: "free-shipping" }, { subtotal: 1000, shipping: 300 });
// → { valid: true, discount: 0, shippingDiscount: 300, total: 1000 }
```

## Validate before applying

```ts
import { validateCoupon } from "@lacspace/coupon";

validateCoupon(
  { code: "XMAS", type: "percent", value: 10, endsAt: "2025-12-26T00:00:00Z" },
  { subtotal: 5000, now: new Date("2026-01-01") },
);
// → { valid: false, reason: "expired" }
```

`validateCoupon` checks the window (`not-yet-started` / `expired`), `minSubtotal` (`below-min-subtotal`) and `usageLimit` vs `used` (`usage-limit-reached`) — it does **not** compute a discount. `applyCoupon` runs it first; when a coupon is invalid it returns zero discounts and the untouched `subtotal + shipping`.

## API

| Function | Description |
| --- | --- |
| `validateCoupon(coupon, { subtotal, now? })` | `{ valid, reason? }` — checks window, `minSubtotal`, `usageLimit`; no discount computed |
| `applyCoupon(coupon, { subtotal, shipping?, now? })` | `{ valid, reason?, discount, shippingDiscount, total }` in minor units |

| `type` | discount |
| --- | --- |
| `percent` | `round(subtotal * value / 100)`, capped by `maxDiscount` and the subtotal |
| `fixed` | `min(value, subtotal)`, capped by `maxDiscount` |
| `free-shipping` | `shippingDiscount = shipping` |

`total = max(0, subtotal - discount + shipping - shippingDiscount)`. `value` is a whole percent `0..100` for `percent`, or an amount in minor units for `fixed` (ignored for `free-shipping`). Types exported: `Coupon`, `CouponValidation`, `CouponResult`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/coupon` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
