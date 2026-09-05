<div align="center">

# @lacspace/cart

**A headless, framework-agnostic shopping-cart engine — pure, immutable & serializable.**

[![npm version](https://img.shields.io/npm/v/@lacspace/cart?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/cart)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/cart?label=minzip)](https://bundlephobia.com/package/@lacspace/cart)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/cart)
[![license](https://img.shields.io/npm/l/@lacspace/cart?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The cart logic every store re-implements badly. A tiny set of **pure functions** over a plain `Cart` object — add & merge lines, set quantities, and compute tax / discount / shipping totals. No React, no store, no floats.

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

`totals` options: `taxRate` (`0..1`, applied after discount), `shipping` and `discount` (flat, minor units). All amounts are integers; `discount` is clamped to the subtotal and `total` is never negative.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/cart` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
