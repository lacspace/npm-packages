<div align="center">

# @lacspace/settlement

**Settlement, netting & reconciliation for multi-party payouts — net a ledger, reconcile expected vs actual, list what's payable.**

[![npm version](https://img.shields.io/npm/v/@lacspace/settlement?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/settlement)
[![install size](https://packagephobia.com/badge?p=@lacspace/settlement)](https://packagephobia.com/result?p=@lacspace/settlement)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/settlement?label=minzip)](https://bundlephobia.com/package/@lacspace/settlement)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/settlement)
[![license](https://img.shields.io/npm/l/@lacspace/settlement?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A pile of signed ledger entries — credits and debits across many accounts — needs to become three answers: what does each account net to, does that match what we expected, and who actually gets paid out? This does exactly that, purely, in integer minor units.

- 🧮 **Netting** — collapse a ledger to one balance per account
- 🔍 **Reconciliation** — compare expected vs actual, surface only the mismatches
- 💸 **Payouts** — filter to accounts with money owed (positive balance)
- 🔢 **Signed minor units** — `+` credit, `-` debit; no floats anywhere
- ⚡ Isomorphic & pure — Node, edge & browsers · 📦 ESM + CJS · zero dependencies · fully typed

## Install

```bash
npm install @lacspace/settlement      # or pnpm add / yarn add / bun add
```

## Netting a ledger

```ts
import { settle, netFor } from "@lacspace/settlement";

const ledger = [
  { account: "alice", amount: 1000, type: "sale" },
  { account: "alice", amount: -300, type: "fee" },
  { account: "bob", amount: 500, type: "sale" },
  { account: "bob", amount: -500, type: "chargeback" },
];

settle(ledger);
// → [ { account: "alice", balance: 700 }, { account: "bob", balance: 0 } ]

netFor(ledger, "alice"); // → 700
```

## Reconciliation

```ts
import { reconcile } from "@lacspace/settlement";

reconcile(
  { alice: 700, bob: 0 },        // expected
  { alice: 700, bob: 50 },       // actual
);
// only mismatches → [ { account: "bob", expected: 0, actual: 50, diff: 50 } ]

reconcile({ alice: 700 }, { alice: 700 }, { all: true });
// → [ { account: "alice", expected: 700, actual: 700, diff: 0 } ]
```

## Who gets paid

```ts
import { payouts } from "@lacspace/settlement";

payouts([
  { account: "alice", amount: 700 },
  { account: "bob", amount: 0 },
  { account: "carol", amount: -200 },
]);
// positive balances only → [ { account: "alice", payable: 700 } ]
```

## API

| Function | Description |
| --- | --- |
| `settle(entries)` | `{ account, balance }[]` — net per account, sorted by account |
| `netFor(entries, account)` | `number` — net balance of a single account |
| `reconcile(expected, actual, opts?)` | `{ account, expected, actual, diff }[]` — `diff = actual - expected`; mismatches only unless `{ all: true }` |
| `payouts(entries)` | `{ account, payable }[]` — accounts with a positive balance |

An **entry** is `{ account; amount /* signed minor units: + credit, - debit */; type?; ref? }`. Every function is pure and never mutates its input.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/settlement` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
