<div align="center">

# @lacspace/refund

**A returns / RMA workflow and refund-calculation engine — pure, immutable & serializable.**

[![npm version](https://img.shields.io/npm/v/@lacspace/refund?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/refund)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/refund?label=minzip)](https://bundlephobia.com/package/@lacspace/refund)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/refund)
[![license](https://img.shields.io/npm/l/@lacspace/refund?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The returns logic every store re-implements badly. A tiny set of **pure functions** over plain data — compute partial refunds with the correct tax portion, decide what goes back on the shelf, and drive a return through an explicit state machine. No React, no store, no floats.

- 🧊 **Immutable** — every op returns a brand-new object; your input is never mutated
- 💾 **Serializable** — `ReturnRequest` is plain data, safe to `JSON.stringify` and persist
- 🪙 **Exact money** — integer **minor units** everywhere, with tax apportioned per line
- 🔁 **State machine** — a small, explicit `requested → … → closed` lifecycle you can trust
- ⚡ Isomorphic — Node, edge runtimes & browsers · 📦 ESM + CJS · fully typed · zero deps

## Install

```bash
npm i @lacspace/refund      # or pnpm add / yarn add / bun add
```

## Calculate a refund

```ts
import { refundAmount } from "@lacspace/refund";

const breakdown = refundAmount(
  [{ lineId: "l1", sku: "TEE", qty: 2, unitPrice: 1999, taxRate: 0.2 }], // return 2 units
  { restockingPct: 0.1, refundShipping: 500 },
);
// { subtotal, tax, restockingFee, shipping, total } — all integer minor units
// total = subtotal + tax + shipping - restockingFee, clamped to never go below 0
```

## Drive the return lifecycle

```ts
import { createReturn, transition } from "@lacspace/refund";

let ret = createReturn({
  orderId: "ord_123",
  items: [{ lineId: "l1", sku: "TEE", qty: 2, unitPrice: 1999 }],
});
// ret.status === "requested", history seeded

ret = transition(ret, "approved", { note: "photos look fine" });
ret = transition(ret, "received");
ret = transition(ret, "refunded");
// each step validates the move and appends to ret.history
```

The allowed moves (`RETURN_TRANSITIONS`):

```
requested → approved | rejected | cancelled
approved  → received | cancelled
received  → refunded | closed
refunded  → closed
rejected · closed · cancelled → (terminal)
```

An illegal jump throws a `RefundError` (`code: "ILLEGAL_TRANSITION"`).

## Restock what came back

```ts
import { restockItems } from "@lacspace/refund";

const list = restockItems([
  { lineId: "1", sku: "TEE", qty: 2, unitPrice: 1999 },
  { lineId: "2", sku: "TEE", qty: 1, unitPrice: 1999 },
  { lineId: "3", sku: "MUG", qty: 1, unitPrice: 999, restock: false }, // damaged
]);
// [{ sku: "TEE", qty: 3 }] — merged by sku, restock:false dropped

// ready to feed @lacspace/inventory:
// for (const { sku, qty } of list) stock[sku] = restock(stock[sku], qty);
```

## Validate against the order

```ts
import { validateReturn } from "@lacspace/refund";

const { ok, errors } = validateReturn(
  { lines: [{ id: "l1", sku: "TEE", qty: 3 }] },
  [{ lineId: "l1", sku: "TEE", qty: 5, unitPrice: 1999 }],
);
// ok === false — "returns 5 but only 3 were ordered"
```

## API

| Function | Description |
| --- | --- |
| `createReturn(input)` | new `ReturnRequest`; `status` defaults to `"requested"`, history seeded |
| `transition(ret, to, opts?)` | validate + move status, append history, immutable |
| `refundAmount(items, opts?)` | `{ subtotal, tax, restockingFee, shipping, total }` in minor units |
| `restockItems(items)` | `{ sku, qty }[]` merged by sku, dropping `restock:false` lines |
| `validateReturn(order, items)` | `{ ok, errors }` — each `lineId` exists & `qty` ≤ ordered |
| `canTransition(from, to)` | `true` when the status move is allowed |
| `isTerminal(status)` | `true` when the status has no outgoing transitions |
| `RETURN_TRANSITIONS` | the transition map |
| `RefundError` | thrown on illegal transitions / invalid input (optional `code`) |

`refundAmount` options: `restockingFee` (flat, minor units) **or** `restockingPct` (`0..1` of subtotal), and `refundShipping` (flat, minor units). Tax is apportioned per line using each item's `taxRate`. All amounts are integers; `total` is clamped so it is never negative.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/refund` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
