<div align="center">

# @lacspace/cart

**A headless, framework-agnostic shopping-cart engine — pure, immutable & serializable.**

[![npm version](https://img.shields.io/npm/v/@lacspace/cart?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/cart)
[![install size](https://packagephobia.com/badge?p=@lacspace/cart)](https://packagephobia.com/result?p=@lacspace/cart)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/cart?label=minzip)](https://bundlephobia.com/package/@lacspace/cart)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/cart)
[![license](https://img.shields.io/npm/l/@lacspace/cart?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The cart logic every store re-implements badly. A tiny set of **pure functions** over a plain `Cart` object — add & merge lines, set quantities, and compute tax / discount / shipping totals. No React, no store, no floats.

> **New in 1.1.0** — per-line **options / add-ons** (each with a price delta), **line & cart discounts** (percentage or fixed), **injectable tax hooks** (inclusive / exclusive), a richer **`cartTotals`** breakdown (`subtotal · discountTotal · taxTotal · shippingTotal · total`), and **`serializeCart` / `hydrateCart` / `mergeCarts` / `clampQty`**. All additive — every existing export is unchanged, and money stays in integer minor units.

- 🧊 **Immutable** — every op returns a brand-new cart; your input is never mutated
- 💾 **Serializable** — `Cart` is plain data, safe to `JSON.stringify` and persist
- 🪙 **Exact money** — integer **minor units** everywhere, so you never lose a penny
- 🧩 **Headless** — pair it with React, Zustand, signals, or a database column
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

## Install

```bash
npm i @lacspace/cart      # or pnpm add / yarn add / bun add
```

## Build a cart

```ts
import { createCart, addItem, setQty, totals } from "@lacspace/cart";

let cart = createCart({ currency: "USD" });

cart = addItem(cart, { id: "tshirt", name: "Tee", unitPrice: 1999, qty: 1 }); // $19.99
cart = addItem(cart, { id: "tshirt", unitPrice: 1999, qty: 2 }); // merges → qty 3
cart = setQty(cart, "tshirt", 2); // absolute quantity

cart.items; // [{ id: "tshirt", name: "Tee", unitPrice: 1999, qty: 2 }]
```

## Compute totals

```ts
import { totals } from "@lacspace/cart";

const t = totals(cart, { taxRate: 0.2, discount: 500, shipping: 999 });
// { subtotal, discount, tax, shipping, total, itemCount } — all integer minor units
// total = subtotal - discount + tax + shipping, clamped to never go below 0
```

## Line-item options / add-ons

Attach per-line `options` — each `priceDelta` (in minor units, may be negative) rolls into the line's effective unit price and the cart subtotal.

```ts
import { addItem, effectiveUnitPrice, cartTotals } from "@lacspace/cart";

let cart = addItem(createCart(), {
  id: "tee", unitPrice: 1999, qty: 2,
  options: [{ id: "xl", priceDelta: 200 }, { id: "engrave", priceDelta: 150 }],
});

effectiveUnitPrice(cart.items[0]); // 2349  (1999 + 200 + 150)
cartTotals(cart).subtotal;         // 4698  (2349 × 2)
```

## Discounts, tax hooks & full breakdown

`cartTotals(cart, opts?)` returns `{ subtotal, discountTotal, taxTotal, shippingTotal, total, itemCount }` — every field an integer, remainder-safe.

```ts
import { cartTotals } from "@lacspace/cart";

const t = cartTotals(cart, {
  lineDiscounts: { tee: { type: "percentage", rate: 0.1 } }, // per-line, clamped to the line
  discount: 250,                          // whole-cart (fixed minor units, or a Discount)
  tax: { rate: 0.13 },                    // exclusive by default; { rate, inclusive: true } extracts
  shipping: 499,
});
// discounts are integer-safe & clamped; tax is computed on the post-discount amount
```

Discounts are `{ type: "percentage", rate }` (rate `0..1`) or `{ type: "fixed", amount }`, or just a bare integer (flat amount). For **inclusive** tax the tax is extracted from the amount and *not* added again. Prefer your own tax engine? Inject a calculator:

```ts
import type { TaxCalculator } from "@lacspace/cart";

const myTax: TaxCalculator = ({ amount, cart }) => Math.round(amount * 0.05);
cartTotals(cart, { discount: 400, tax: myTax }); // calc gets the post-discount `amount`
```

## Serialize, hydrate & merge

```ts
import { serializeCart, hydrateCart, mergeCarts, clampQty } from "@lacspace/cart";

const json = serializeCart(cart);      // versioned JSON string, safe to persist
const back = hydrateCart(json);        // tolerant round-trip → a normalised Cart

const combined = mergeCarts(guest, user); // sums quantities of matching lines
const clamped = clampQty(cart, "tee", { min: 1, max: 10 });
```

## Immutable by design

```ts
import { createCart, addItem, removeItem } from "@lacspace/cart";

const a = addItem(createCart(), { id: "x", unitPrice: 100, qty: 1 });
const b = removeItem(a, "x");

a === b; // false — a is untouched, b is a new object
```

## API

| Function | Description |
| --- | --- |
| `createCart(init?)` | new cart from a partial state (items merged & normalised) |
| `addItem(cart, item)` | add a line, summing `qty` if `id` already exists |
| `setQty(cart, id, qty)` | set an absolute quantity; `qty <= 0` removes the line |
| `removeItem(cart, id)` | remove a line by id |
| `clear(cart)` | empty the cart (keeps `currency`) |
| `findItem(cart, id)` | look up a line, or `undefined` |
| `itemCount(cart)` | total units across all lines |
| `totals(cart, opts?)` | `{ subtotal, discount, tax, shipping, total, itemCount }` |
| `effectiveUnitPrice(item)` | unit price + sum of option `priceDelta`s (minor units) |
| `lineTotal(item)` | `effectiveUnitPrice(item) × qty` |
| `cartTotals(cart, opts?)` | full breakdown: `{ subtotal, discountTotal, taxTotal, shippingTotal, total, itemCount }` |
| `lineDiscount(item, discount)` | a single line's discount, clamped to its total |
| `serializeCart(cart)` | versioned JSON string of the cart |
| `hydrateCart(input)` | rebuild a `Cart` from a string / object (tolerant, re-normalised) |
| `mergeCarts(a, b)` | combine two carts, summing quantities of matching lines |
| `clampQty(cart, id, { min?, max? })` | clamp a line's quantity into a range |

`cartTotals` options: `lineDiscounts` (per-id `Discount`/int), `discount` (whole-cart `Discount`/int, applied after line discounts), `tax` (a fraction rate, a `{ rate, inclusive? }` rule, or an injected `TaxCalculator`), and `shipping` (flat, minor units). Discounts clamp to their base; tax is computed on the post-discount amount; `total` is never negative. The original `totals` and all other functions are unchanged.

`totals` options: `taxRate` (`0..1`, applied after discount), `shipping` and `discount` (flat, minor units). All amounts are integers; `discount` is clamped to the subtotal and `total` is never negative.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/cart` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
