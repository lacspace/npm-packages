<div align="center">

# @lacspace/order

**A headless order-lifecycle engine — an immutable order model with a state machine, price snapshotting & timestamped history.**

[![npm version](https://img.shields.io/npm/v/@lacspace/order?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/order)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/order?label=minzip)](https://bundlephobia.com/package/@lacspace/order)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/order)
[![license](https://img.shields.io/npm/l/@lacspace/order?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The order spine between a cart and a courier. A tiny set of **pure functions** over a plain `Order` object — snapshot line prices, drive a status **state machine**, mint order numbers, and keep a **timestamped history**. No React, no store, no floats.

> **New in 1.1.0** — all additive, fully backward compatible: **partial fulfillment** tracking with a derived fulfillment status, **refund tracking** (partial → full, remaining refundable, derived refund status), an on-demand **totals recompute** (`orderTotals`) plus a remainder-safe `allocate`, and a typed **event timeline** with an injectable clock for a clean audit trail. Nothing existing changed.

- 🧊 **Immutable** — every op returns a brand-new order; your input is never mutated
- 🔁 **State machine** — a validated status graph (`pending → placed → paid → … → completed`)
- 📸 **Snapshotted** — line prices are frozen at order time, so catalogue changes never rewrite history
- 🪙 **Exact money** — integer **minor units** everywhere, so you never lose a penny
- 💾 **Serializable** — `Order` is plain data, safe to `JSON.stringify` and persist
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

## Install

```bash
npm i @lacspace/order      # or pnpm add / yarn add / bun add
```

## Create an order

```ts
import { createOrder } from "@lacspace/order";

const order = createOrder({
  currency: "USD",
  customer: { id: "u_1", name: "Ada", email: "ada@example.com" },
  lines: [
    { sku: "tee", name: "Tee", unitPrice: 1999, qty: 2, taxRate: 0.2 }, // $19.99
    { sku: "cap", name: "Cap", unitPrice: 999, qty: 1, taxRate: 0.2 },
  ],
  discount: 500, // minor units
  shipping: 999,
});

order.totals; // { subtotal, discount, tax, shipping, total } — all integer minor units
order.status; // "pending"
order.lines[0].total; // 3998 — snapshotted at order time
```

`total = subtotal - discount + tax + shipping`, clamped to never go below `0`. Tax defaults to the sum of `round(line.total * line.taxRate)` per line, or you can pass an explicit `tax` in minor units.

## Drive the lifecycle

```ts
import { transition } from "@lacspace/order";

let o = createOrder({ currency: "USD", lines });
o = transition(o, "placed", { note: "checkout complete" });
o = transition(o, "paid", { at: Date.now() });
o = transition(o, "processing");
// illegal jumps throw:
transition(o, "delivered"); // OrderError { code: "invalid-transition" }

o.history; // [{ status, at, note? }, …] — one event per hop
```

### The status graph

`pending → placed → paid → processing → fulfilled → shipped → delivered → completed`, with `on_hold`, `cancelled` and `refunded` branches. `completed`, `cancelled` and `refunded` are terminal.

## Edit before payment, lock after

```ts
import { addLine, updateQty, removeLine } from "@lacspace/order";

let o = transition(createOrder({ currency: "USD", lines }), "placed");
o = addLine(o, { sku: "sticker", unitPrice: 100, qty: 3 }); // totals recomputed
o = updateQty(o, "sticker", 1); // qty 0 removes the line

o = transition(o, "paid");
addLine(o, { sku: "x", unitPrice: 1, qty: 1 }); // OrderError { code: "locked" }
```

## Partial fulfillment · New in 1.1.0

```ts
import { fulfillLine, fulfillItems, fulfillmentStatus } from "@lacspace/order";

let o = createOrder({ currency: "USD", lines: [
  { sku: "tee", unitPrice: 1000, qty: 3 },
  { sku: "cap", unitPrice: 500, qty: 2 },
]});

fulfillmentStatus(o);              // "unfulfilled"
o = fulfillLine(o, "tee", 1);      // ship 1 of 3
fulfillmentStatus(o);              // "partially_fulfilled"
o = fulfillItems(o, [{ lineId: "tee", qty: 2 }, { lineId: "cap", qty: 2 }]);
fulfillmentStatus(o);              // "fulfilled"
```

Fulfilled quantity lives on `line.fulfilledQty` (absent = unfulfilled). Over-fulfilling a line throws `OrderError { code: "fulfillment-exceeds-qty" }`; a `fulfillItems` batch is all-or-nothing.

## Refund tracking · New in 1.1.0

```ts
import { recordRefund, refundedTotal, refundableRemaining, refundStatus } from "@lacspace/order";

let o = createOrder({ currency: "USD", lines: [{ sku: "tee", unitPrice: 1000, qty: 1 }] });

o = recordRefund(o, 300, { reason: "damaged" });
refundStatus(o);          // "partially_refunded"
refundableRemaining(o);   // 700
o = recordRefund(o, 700);
refundStatus(o);          // "refunded"  (refundedTotal === order total)
recordRefund(o, 1);       // OrderError { code: "refund-exceeds-total" }
```

## Totals recompute · New in 1.1.0

```ts
import { orderTotals, allocate } from "@lacspace/order";

orderTotals(order);          // { subtotal, discount, tax, shipping, total } re-derived from lines
allocate(100, [1, 1, 1]);    // [34, 33, 33] — split minor units with no rounding drift
```

## Timeline / audit trail · New in 1.1.0

```ts
import { appendEvent, orderTimeline } from "@lacspace/order";

const clock = () => Date.now();                     // injectable — pass a fixed fn in tests
let o = appendEvent(order, { type: "payment", data: { amount: 2850 } }, { clock });
o = appendEvent(o, { type: "note", note: "left with neighbour" }, { at: 1_700_000_000_000 });
orderTimeline(o); // [{ type, at, data?, note? }, …]
```

`fulfillLine`/`fulfillItems`/`recordRefund` append their own `fulfillment`/`refund` events automatically (pass `event: false` to opt out).

## Numbering

```ts
import { orderNumber, randomOrderId } from "@lacspace/order";

orderNumber(1); // "ORD-20260905-0001" (deterministic given seq + date)
orderNumber(42, { prefix: "INV", pad: 6, separator: "/" }); // "INV/20260905/000042"
randomOrderId({ prefix: "ord" }); // "ord_k3f9x1a7q2mz" — crypto-random short id
```

## API

| Export | Description |
| --- | --- |
| `createOrder(input)` | build an immutable order; snapshots line totals, computes totals, seeds history |
| `transition(order, to, opts?)` | validated status change; appends a history event; throws on illegal moves |
| `addLine` / `removeLine` / `updateQty` | edit lines & recompute totals — allowed only while `pending`/`placed` |
| `canTransition(from, to)` / `isTerminal(s)` | raw state-machine queries |
| `canCancel` / `canRefund` / `canShip` / `canFulfill` | convenience predicates over an order |
| `orderNumber(seq, opts?)` | deterministic human order number, e.g. `"ORD-20260905-0001"` |
| `randomOrderId(opts?)` | crypto-random short id (falls back to `Math.random` with a warning) |
| `ORDER_TRANSITIONS` | the status → allowed-next-statuses map |
| `OrderError` | thrown with codes `"invalid-transition"` / `"locked"` / `"invalid-fulfillment"` / `"line-not-found"` / `"fulfillment-exceeds-qty"` / `"invalid-refund"` / `"refund-exceeds-total"` |
| `fulfillLine` / `fulfillItems` | **1.1.0** — ship units of a line / a batch of lines; clamped to ordered qty, appends a `fulfillment` event |
| `fulfillmentStatus` / `lineFulfillmentStatus` / `lineFulfilledQty` / `lineRemainingQty` / `isFullyFulfilled` | **1.1.0** — derive partial-fulfillment state |
| `recordRefund` | **1.1.0** — record a refund (minor units), clamped to the refundable remaining, appends a `refund` event |
| `refundedTotal` / `refundableRemaining` / `refundStatus` | **1.1.0** — refund math + derived `none`/`partially_refunded`/`refunded` status |
| `orderTotals(order)` | **1.1.0** — recompute `{ subtotal, discount, tax, shipping, total }` from lines, remainder-safe |
| `allocate(amount, weights)` | **1.1.0** — split integer minor units across weights with no drift (largest-remainder) |
| `appendEvent` / `orderTimeline` | **1.1.0** — append a typed timeline event (injectable clock) / read the trail |

Types exported: `OrderStatus`, `OrderLine`, `OrderLineInput`, `StatusEvent`, `OrderTotals`, `Order`, `CreateOrderInput`, `FulfillmentStatus`, `RefundStatus`, `RefundRecord`, `OrderEvent`, `OrderEventType`, `Clock`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/order` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
