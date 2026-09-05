<div align="center">

# @lacspace/ledger

**A tiny double-entry ledger / wallet — balanced transactions, per-account balances and a trial balance that always sums to zero.**

[![npm version](https://img.shields.io/npm/v/@lacspace/ledger?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/ledger)
[![install size](https://packagephobia.com/badge?p=@lacspace/ledger)](https://packagephobia.com/result?p=@lacspace/ledger)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/ledger?label=minzip)](https://bundlephobia.com/package/@lacspace/ledger)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/ledger)
[![license](https://img.shields.io/npm/l/@lacspace/ledger?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Wallets and internal balances are usually a single mutable number that silently drifts. This is **double-entry** in a few bytes: every transaction is a set of signed lines that sum to **zero**, so the books can't go out of balance. Integer minor units, immutable operations, crypto-random ids.

- ⚖️ **Always balanced** — a transaction's lines must sum to `0`, or it throws
- 💯 **Integer minor units** — cents / paisa, never floats
- 🧊 **Immutable** — every op returns a new ledger
- 📒 `balance`, `statement` and a `trialBalance` that totals zero
- ⚡ Isomorphic (Web Crypto ids) · zero dependencies · fully typed

## Install

```bash
npm install @lacspace/ledger      # or pnpm add / yarn add / bun add
```

## Usage

```ts
import { createLedger, post, postMany, balance, statement, trialBalance } from "@lacspace/ledger";

let book = createLedger();

// Simple two-line posting: +amount to `debit`, -amount to `credit`
book = post(book, { debit: "cash", credit: "sales", amount: 10000, ref: "INV-1" });

// Multi-line posting — throws unless the signed amounts sum to 0
book = postMany(book, [
  { account: "cash",  amount: 9700 },
  { account: "fees",  amount: 300 },
  { account: "sales", amount: -10000 },
], { memo: "sale less processor fee" });

balance(book, "cash");       // 19700
statement(book, "cash");     // [{ at, amount, ref?, memo? }, …]
trialBalance(book);          // [{ account, balance }, …] — always sums to 0
```

## Sign convention

An account's balance is the **sum of its signed line amounts**. A **debit is positive**, a **credit is negative**. So `post({ debit, credit, amount })` books `+amount` to `debit` and `-amount` to `credit`. Under this rule an asset/expense account rises when debited; a liability/income/equity account rises when credited (its balance goes further negative).

## API

| Function | Description |
| --- | --- |
| `createLedger()` | a new empty ledger |
| `post(ledger, { debit, credit, amount, ref?, memo? })` | two-line balanced entry (`amount` positive) |
| `postMany(ledger, lines[], meta?)` | arbitrary entry — **throws** if lines don't sum to 0 |
| `balance(ledger, account)` | sum of that account's signed lines |
| `statement(ledger, account)` | rows `{ at, amount, ref?, memo? }` for entries touching the account |
| `trialBalance(ledger)` | `{ account, balance }[]`, sorted, always sums to 0 |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/ledger` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
