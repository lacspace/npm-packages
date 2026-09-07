<div align="center">

# @lacspace/coupon

**A discount / coupon engine — percent, fixed & free-shipping codes with validity windows, minimum-subtotal thresholds, discount caps and usage limits.**

[![npm version](https://img.shields.io/npm/v/@lacspace/coupon?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/coupon)
[![install size](https://packagephobia.com/badge?p=@lacspace/coupon)](https://packagephobia.com/result?p=@lacspace/coupon)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/coupon?label=minzip)](https://bundlephobia.com/package/@lacspace/coupon)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/coupon)
[![license](https://img.shields.io/npm/l/@lacspace/coupon?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The discount logic every checkout re-implements badly: is this code valid right now, and what does it actually take off the total? A tiny set of **pure functions** over a plain `Coupon` object — validate the window / threshold / usage limit / scope, then compute `percent`, `fixed`, `free-shipping`, `bogo` or `tiered` discounts, stack several coupons safely, and generate codes with a CSPRNG. Integer **minor units** throughout, so there's no floating-point drift.

> **New in 1.1.0** — `bogo` (buy-X-get-Y) and `tiered` discount types · per-user / first-order / product & category scope / currency constraints · `applyCoupons` stacking · `generateCode` / `generateCodes` / `normalizeCode`. Fully backward compatible — every 1.0 export is unchanged.

- 🏷️ **Five code kinds** — `percent`, `fixed` (flat amount), `free-shipping`, `bogo` (buy-X-get-Y) and `tiered` (threshold)
- ⏱️ **Validity window** — `startsAt` / `endsAt` (or `validFrom` / `validUntil`), `minSubtotal`, `usageLimit`, `perUserLimit`, `firstOrderOnly`, product / category scope and a `currency` guard
- 🧢 **Discount caps** — `maxDiscount`, and the discount is never more than the eligible subtotal
- 🧱 **Stacking** — combine coupons by `priority` with a `stackable` flag; combined discount never goes negative
- 🎲 **Code generation** — CSPRNG `generateCode` / bulk `generateCodes` (configurable charset / length / prefix) + `normalizeCode`
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

`validateCoupon` checks the window (`not-yet-started` / `expired`), `minSubtotal` (`below-min-subtotal`), `usageLimit` vs `used` (`usage-limit-reached`), `perUserLimit` vs `ctx.userUsed` (`per-user-limit-reached`), `firstOrderOnly` (`not-first-order`), the `currency` guard (`currency-mismatch`) and product/category scope (`out-of-scope`) — it does **not** compute a discount. `applyCoupon` runs it first; when a coupon is invalid it returns zero discounts and the untouched `subtotal + shipping`.

## BOGO, tiered, scope & stacking

```ts
import { applyCoupon, applyCoupons, generateCode, type Coupon } from "@lacspace/coupon";

// buy-1-get-1: the cheapest unit per pair is free (needs line items)
applyCoupon(
  { code: "BOGO", type: "bogo", buyQuantity: 1, getQuantity: 1 },
  { subtotal: 2800, items: [
    { productId: "a", unitPrice: 1000, quantity: 2 },
    { productId: "b", unitPrice: 400, quantity: 2 },
  ] },
);
// → discount 800 (the two 400-unit items are the free ones)

// tiered / threshold: highest matching tier applies ($10 off over $100)
applyCoupon(
  { code: "TIER", type: "tiered", tiers: [
    { minSubtotal: 5000, type: "fixed", value: 300 },
    { minSubtotal: 10000, type: "fixed", value: 1000 },
  ] },
  { subtotal: 12000 },
); // → discount 1000

// stack several coupons — highest priority first, never negative
applyCoupons(
  [{ code: "TEN", type: "percent", value: 10 }, { code: "FIVE", type: "fixed", value: 100 }],
  { subtotal: 1000 },
);
// → { discount: 200, total: 800, applied: [...], skipped: [...] }

// random codes (CSPRNG)
generateCode({ length: 8, prefix: "SUMMER-" }); // → "SUMMER-K7QMR2X4"
```

Product/category scope narrows the eligible base: `includeProducts` / `includeCategories` (allow-list) and `excludeProducts` / `excludeCategories` (deny-list) are matched against `ctx.items`; `percent` / `fixed` / `tiered` then discount only the in-scope lines and are clamped to that eligible subtotal.

## API

| Function | Description |
| --- | --- |
| `validateCoupon(coupon, ctx)` | `{ valid, reason? }` — window, `minSubtotal`, usage & per-user limits, first-order, scope, currency; no discount computed |
| `applyCoupon(coupon, ctx)` | `{ valid, reason?, discount, shippingDiscount, total, breakdown? }` in minor units |
| `applyCoupons(coupons, ctx)` | Stack many coupons: `{ discount, shippingDiscount, total, applied, skipped }` |
| `normalizeCode(code)` | Trim + upper-case a code (`""` for nullish) |
| `generateCode(opts?)` | One CSPRNG code — `{ length?, charset?, prefix? }` |
| `generateCodes(count, opts?)` | `count` unique CSPRNG codes |

`ctx` is `{ subtotal, shipping?, now?, currency?, userUsed?, isFirstOrder?, items? }`.

| `type` | discount |
| --- | --- |
| `percent` | `round(eligibleSubtotal * value / 100)`, capped by `maxDiscount` and the eligible subtotal |
| `fixed` | `min(value, eligibleSubtotal)`, capped by `maxDiscount` |
| `free-shipping` | `shippingDiscount = shipping` |
| `bogo` | cheapest `getQuantity` units per `buyQuantity + getQuantity` group, `getDiscountPercent` off (default 100); needs `items` |
| `tiered` | highest matching `tiers` entry (each `{ minSubtotal, type, value }`) |

`total = max(0, subtotal - discount + shipping - shippingDiscount)`. `eligibleSubtotal` equals the full `subtotal` when no `items` / scope are given. Types exported: `Coupon`, `CouponType`, `CouponTier`, `OrderItem`, `OrderContext`, `CouponValidation`, `CouponBreakdown`, `CouponResult`, plus `GenerateCodeOptions`, `AppliedCoupon`, `SkippedCoupon`, `StackResult`.

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
