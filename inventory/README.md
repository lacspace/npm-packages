<div align="center">

# @lacspace/inventory

**A stock-tracking engine that prevents overselling — reserve, commit & restock over a plain state object.**

[![npm version](https://img.shields.io/npm/v/@lacspace/inventory?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/inventory)
[![install size](https://packagephobia.com/badge?p=@lacspace/inventory)](https://packagephobia.com/result?p=@lacspace/inventory)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/inventory?label=minzip)](https://bundlephobia.com/package/@lacspace/inventory)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/inventory)
[![license](https://img.shields.io/npm/l/@lacspace/inventory?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Overselling is one bug: you let two orders take the last unit. This is the maths that stops it — pure, immutable functions over a plain `{ onHand, reserved }` state. **Bring your own store** (a DB row, a cache, a signal); this decides what's allowed.

> **New in 1.1.0** — all additive, zero new deps, existing API unchanged: 🏬 **multi-location** stock with conserving `transfer`s · 🔁 **reorder** point / safety stock + `needsReorder` & `suggestedOrderQuantity` · 📦 **lots & expiry** with **FIFO/FEFO** `allocate` · 📜 an append-only **movements ledger** with running balance + **low-stock / expiring-soon reports** (injectable clock).

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

## Multi-location (1.1.0)

```ts
import { createLocations, transfer, aggregate, totalAvailable } from "@lacspace/inventory";

let stock = createLocations({ nyc: 10, sfo: 5 }); // { nyc: {onHand:10,…}, sfo: {…} }

stock = transfer(stock, "nyc", "sfo", 4); // move 4 units — total is conserved
totalAvailable(stock); // 15
aggregate(stock); // { onHand: 15, reserved: 0 } — one combined view
```

`transfer` draws only from a location's **available** stock (never strands a reservation) and always conserves the grand total of `onHand`.

## Reorder logic (1.1.0)

```ts
import { createStock, needsReorder, suggestedOrderQuantity } from "@lacspace/inventory";

const item = createStock(4); // 4 available
const policy = { reorderPoint: 5, safetyStock: 3, reorderQuantity: 10, maxStock: 40 };

needsReorder(item, policy); // true (4 <= 5)
suggestedOrderQuantity(item, policy); // 40 — order up to maxStock, in whole 10-unit batches
```

## Lots, expiry & FIFO/FEFO (1.1.0)

```ts
import { allocate, expiringLots } from "@lacspace/inventory";

const lots = [
  { id: "A", qty: 5, expiresAt: Date.parse("2026-12-01") },
  { id: "B", qty: 3, expiresAt: Date.parse("2026-10-01") }, // sooner
];

const { allocations, remaining, lots: left } = allocate(lots, 4); // FEFO by default
// allocations: [{ id: "B", qty: 3 }, { id: "A", qty: 1 }]  — soonest-expiring first
// units are conserved: input === left + consumed
```

Pass `{ strategy: "fifo" }` to consume oldest-received first, or `{ now }` to skip already-expired lots.

## Movements ledger & reports (1.1.0)

```ts
import { recordMovement, runningBalances, reduceMovements, lowStockReport, expiringSoonReport } from "@lacspace/inventory";

let log = [];
log = recordMovement(log, { type: "receipt", qty: 100 }, Date.now()); // append-only, immutable
log = recordMovement(log, { type: "sale", qty: 20 }, Date.now());

reduceMovements(log); // { onHand: 80, reserved: 0 } — replay the whole log
runningBalances(log); // balance after every entry (for a stock statement)

// batch reports — pass an injected clock (`now`) so they stay deterministic
lowStockReport([{ sku: "A", stock: createStock(2), threshold: 5 }]); // [{ sku:"A", available:2, threshold:5 }]
expiringSoonReport([{ sku: "MILK", lots }], 7 * 86_400_000, Date.now());
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

### Multi-location (1.1.0)

| Function | Description |
| --- | --- |
| `createLocations(init?)` | build a `location → Stock` map from `{ location: onHand }` |
| `atLocation(ls, loc)` | the `Stock` at a location (empty if absent) |
| `setLocation(ls, loc, stock)` | new map with `loc` set (immutable) |
| `totalOnHand` / `totalReserved` / `totalAvailable(ls)` | aggregate sums across locations |
| `aggregate(ls)` | collapse to a single `{ onHand, reserved }` |
| `transfer(ls, from, to, qty)` | move units; **conserves total**, throws if `qty > available` at `from` |

### Reorder (1.1.0)

| Function | Description |
| --- | --- |
| `needsReorder(stock, policy)` | `available <= reorderPoint` |
| `suggestedOrderQuantity(stock, policy)` | qty to reach `maxStock` (or `reorderPoint + safetyStock`), in whole `reorderQuantity` batches; `0` if not needed |
| `ReorderPolicy` | `{ reorderPoint, safetyStock?, reorderQuantity?, maxStock? }` |

### Lots & expiry (1.1.0)

| Function | Description |
| --- | --- |
| `lotQuantity(lots)` | total units across lots |
| `sortLots(lots, strategy?)` | order for consumption (`"fefo"` default, or `"fifo"`) |
| `allocate(lots, qty, opts?)` | consume in FIFO/FEFO order → `{ allocations, remaining, lots }`; pure & unit-conserving; `opts.now` skips expired |
| `expiredLots(lots, now)` | lots with `expiresAt <= now` |
| `expiringLots(lots, withinMs, now)` | lots expiring within a window, soonest first |
| `Lot` | `{ id, qty, receivedAt?, expiresAt? }` |

### Movements ledger & reports (1.1.0)

| Function | Description |
| --- | --- |
| `applyMovement(stock, m)` | pure reducer for one `Movement` |
| `reduceMovements(movements, initial?)` | replay a log to the final `Stock` |
| `runningBalances(movements, initial?)` | balance after each entry (`{ movement, balance }[]`) |
| `recordMovement(log, m, now?)` | append immutably; stamps `at` from `now` if omitted |
| `lowStockReport(items)` | SKUs at/below their threshold |
| `expiringSoonReport(items, withinMs, now?)` | lots expiring within a window (injectable clock) |
| `Movement` / `MovementType` | `receipt` · `sale` · `adjustment` · `transfer` · `reservation` · `release` · `commit` |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/inventory` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
