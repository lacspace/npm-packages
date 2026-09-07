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

> **New in 1.1.0** — a full marketplace-payout layer, all additive and integer-safe: **batch settlement** per payee (`settleBatch`), **commission/fee/tax deduction** with a transparent breakdown (`applyDeductions`), **rolling reserves** with an injectable clock (`holdReserve` / `reserveBalance`), a **payout schedule** that skips weekends & holidays (`nextPayoutDate`), and **settled reconciliation + render-ready statements** (`reconcileSettlement` / `buildStatement`). Every existing export is unchanged.

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

## Marketplace payouts (new in 1.1.0)

### Batch settlement — one payout per payee

```ts
import { settleBatch } from "@lacspace/settlement";

settleBatch([
  { payee: "shop_a", kind: "capture", amount: 10_000 },
  { payee: "shop_a", kind: "commission", amount: 1_500 },
  { payee: "shop_a", kind: "refund", amount: 2_000 },
  { payee: "shop_b", kind: "capture", amount: 5_000 },
]);
// → { settlements: [
//      { payee: "shop_a", gross: 10000, deductions: 3500, net: 6500, lines: [...] },
//      { payee: "shop_b", gross: 5000,  deductions: 0,    net: 5000, lines: [...] },
//    ], totalNet: 11500 }
```

`kind` is one of `capture` (+), `refund` / `chargeback` / `fee` / `commission` (−), or `adjustment` (signed). `net` clamps at `0` unless `{ allowNegative: true }` (carry-forward).

### Fee / commission / tax deduction — `gross → deductions → net`

```ts
import { applyDeductions } from "@lacspace/settlement";

applyDeductions(10_000, [
  { label: "Commission", kind: "commission", bps: 1500 }, // 15%
  { label: "Gateway fee", kind: "fee", amount: 30, bps: 290 }, // 30 + 2.9%
  { label: "VAT", kind: "tax", bps: 1300 }, // 13%
]);
// → { gross: 10000, totalDeductions: 3120, net: 6880, deductions: [...] }
```

Rates are **basis points** (1% = 100 bps) and floor to whole minor units. Pass `{ rateBase: "running" }` to charge each rate on the balance left after prior deductions.

### Rolling reserve — held then released, injectable clock

```ts
import { holdReserve, reserveBalance } from "@lacspace/settlement";

const clock = () => Date.parse("2026-01-01T00:00:00Z");
const r = holdReserve(10_000, { bps: 1000, releaseAfterDays: 7 }, clock); // holds 1000
reserveBalance([r], () => clock() + 6 * 86_400_000); // { held: 1000, available: 0 }
reserveBalance([r], () => clock() + 7 * 86_400_000); // { held: 0, available: 1000 }
```

### Payout schedule — skips weekends & holidays

```ts
import { nextPayoutDate } from "@lacspace/settlement";

nextPayoutDate({ kind: "tplus", days: 2, holidays: ["2026-01-05"] }, "2026-01-01");
// 2026-01-01 (Thu) + 2 = Sat → skip weekend & the 5th holiday → 2026-01-06
nextPayoutDate({ kind: "weekly", weekday: 5 }, "2026-01-01"); // next Friday
```

### Reconcile settled amounts & build a statement

```ts
import { reconcileSettlement, buildStatement } from "@lacspace/settlement";

reconcileSettlement({ shop_a: 6500 }, { shop_a: 6400 });
// → { matched: false, discrepancies: [{ account: "shop_a", ..., diff: -100 }] }

const [settlement] = settleBatch([
  { payee: "shop_a", kind: "capture", amount: 10_000 },
  { payee: "shop_a", kind: "commission", amount: 1_500 },
]).settlements;

buildStatement(settlement, { opening: 0, reserve: 500, period: { from: "2026-01-01", to: "2026-01-07" } });
// → { payee, opening, lines: [...], gross, deductions, reserve, net, closing, generatedAt }
```

## API

| Function | Description |
| --- | --- |
| `settle(entries)` | `{ account, balance }[]` — net per account, sorted by account |
| `netFor(entries, account)` | `number` — net balance of a single account |
| `reconcile(expected, actual, opts?)` | `{ account, expected, actual, diff }[]` — `diff = actual - expected`; mismatches only unless `{ all: true }` |
| `payouts(entries)` | `{ account, payable }[]` — accounts with a positive balance |
| `settleBatch(txns, opts?)` | `{ settlements, totalNet }` — net transactions into one payout per payee, with a per-kind line breakdown |
| `applyDeductions(gross, specs, opts?)` | `{ gross, deductions, totalDeductions, net }` — deduct commission/fees/tax (flat + bps), integer-safe |
| `reserveAmount(base, spec)` | `number` — reserve to withhold (`bps` + `flat`, floored, capped at base) |
| `holdReserve(base, spec, clock?, ref?)` | `ReserveEntry` — withhold a reserve stamped with a release date from an injected clock |
| `isReleased(entry, clock?)` | `boolean` — has the reserve reached its release time |
| `reserveBalance(entries, clock?)` | `{ held, available }` — split reserves by the injected clock |
| `nextPayoutDate(schedule, from)` | `Date` — next `daily` / `weekly` / `tplus` payout date (UTC midnight), skipping weekends & holidays |
| `reconcileSettlement(expected, actual, opts?)` | `{ discrepancies, matched }` — reconcile settled amounts per payee |
| `buildStatement(settlement, opts?)` | `Statement` — render-ready `opening → lines → net → closing` structure (no PDF dep) |

An **entry** is `{ account; amount /* signed minor units: + credit, - debit */; type?; ref? }`. A **transaction** is `{ payee; kind; amount; ref?; currency? }`. Every function is pure and never mutates its input; all money is integer minor units (no floats).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://developer.lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/settlement` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
