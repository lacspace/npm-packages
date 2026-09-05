<div align="center">

# @lacspace/inventory

**A stock-tracking engine that prevents overselling — reserve, commit & restock over a plain state object.**

[![npm version](https://img.shields.io/npm/v/@lacspace/inventory?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/inventory)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/inventory?label=minzip)](https://bundlephobia.com/package/@lacspace/inventory)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/inventory)
[![license](https://img.shields.io/npm/l/@lacspace/inventory?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Overselling is one bug: you let two orders take the last unit. This is the maths that stops it — pure, immutable functions over a plain `{ onHand, reserved }` state. **Bring your own store** (a DB row, a cache, a signal); this decides what's allowed.

- 🚫 **No overselling** — `reserve`/`commit` throw an `InventoryError` before they'd go negative
- 🧊 **Immutable** — every op returns a new `Stock`; your input is never mutated
- 🧠 **available = onHand − reserved** — the one invariant, enforced everywhere
- 🧩 **Headless** — persist the state however you like; this is just the rules
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

## Install

```bash
npm i @lacspace/inventory      # or pnpm add / yarn add / bun add
```

## Reserve → commit

```ts
import { createStock, reserve, commit, available } from "@lacspace/inventory";

let stock = createStock(10); // { onHand: 10, reserved: 0 }

stock = reserve(stock, 3); // hold 3 for a pending order
available(stock); // 7

stock = commit(stock, 3); // ship them
stock; // { onHand: 7, reserved: 0 }
```

## Overselling throws

```ts
import { createStock, reserve, InventoryError } from "@lacspace/inventory";

const stock = createStock(2);

try {
  reserve(stock, 5); // only 2 available
} catch (e) {
  e instanceof InventoryError; // true — nothing was oversold
}
```

## Restock, release & low-stock alerts

```ts
import { createStock, reserve, release, restock, isLow, isOutOfStock } from "@lacspace/inventory";

let stock = restock(createStock(0), 20); // delivery arrives
stock = reserve(stock, 18);

isLow(stock, 5); // true  — 2 available
isOutOfStock(stock); // false

stock = release(stock, 18); // cart abandoned → put them back
```

## API

| Function | Description |
| --- | --- |
| `createStock(onHand?)` | new `{ onHand, reserved: 0 }` (default `0`) |
| `available(stock)` | `onHand - reserved` |
| `reserve(stock, qty)` | hold `qty`; **throws** if `qty > available` |
| `release(stock, qty)` | free a reservation (never below `0`) |
| `commit(stock, qty)` | fulfil: `onHand -= qty`, `reserved -= qty`; **throws** if `qty > reserved` |
| `restock(stock, qty)` | add `qty` to `onHand` |
| `adjust(stock, delta)` | signed correction to `onHand` (clamped at `0`) |
| `isLow(stock, threshold)` | `available <= threshold` |
| `isOutOfStock(stock)` | `available <= 0` |
| `InventoryError` | thrown on oversell / invalid quantity |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/inventory` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
