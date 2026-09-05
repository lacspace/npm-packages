# @lacspace/coupon

A small, dependable **discount / coupon engine** — percent, fixed and free-shipping codes with validity windows, minimum-subtotal thresholds, discount caps and usage limits. All money is in **integer minor units** (e.g. cents), so there is no floating-point drift.

- **Zero runtime dependencies**
- **Isomorphic** — Node, edge runtimes and browsers
- **TypeScript-first**, strict types

```bash
npm install @lacspace/coupon
```

## Quick start

```ts
import { applyCoupon, validateCoupon, type Coupon } from "@lacspace/coupon";

const coupon: Coupon = {
  code: "SAVE20",
  type: "percent",
  value: 20,          // 20%
  maxDiscount: 500,   // never more than $5.00
  minSubtotal: 1000,  // order must be at least $10.00
};

applyCoupon(coupon, { subtotal: 3000, shipping: 400 });
// { valid: true, discount: 500, shippingDiscount: 0, total: 2900 }
```

## API

### `validateCoupon(coupon, { subtotal, now? }): { valid, reason? }`

Checks the validity window (`not-yet-started` / `expired`), `minSubtotal` (`below-min-subtotal`) and `usageLimit` vs `used` (`usage-limit-reached`). Does not compute a discount.

### `applyCoupon(coupon, { subtotal, shipping?, now? }): CouponResult`

Validates, then computes the discount:

| type            | discount                                             |
| --------------- | ---------------------------------------------------- |
| `percent`       | `round(subtotal * value / 100)`, capped by `maxDiscount` and the subtotal |
| `fixed`         | `min(value, subtotal)`, capped by `maxDiscount`      |
| `free-shipping` | `shippingDiscount = shipping`                        |

```
total = max(0, subtotal - discount + shipping - shippingDiscount)
```

When the coupon is invalid, discounts are `0` and the total is the untouched `subtotal + shipping`.

```ts
applyCoupon({ code: "FREESHIP", type: "free-shipping" }, { subtotal: 1000, shipping: 300 });
// { valid: true, discount: 0, shippingDiscount: 300, total: 1000 }
```

## Types

```ts
interface Coupon {
  code: string;
  type: "percent" | "fixed" | "free-shipping";
  value?: number;        // percent 0..100, or minor units for fixed
  minSubtotal?: number;
  maxDiscount?: number;
  startsAt?: string;     // ISO-8601
  endsAt?: string;       // ISO-8601
  usageLimit?: number;
  used?: number;
  currency?: string;
}
```

---

## The Lacspace Developer Platform

`@lacspace/coupon` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
