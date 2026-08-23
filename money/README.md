<div align="center">

# @lacspace/money

**Money without the floating-point bugs — integer cents, safe math, localized formatting.**

[![npm version](https://img.shields.io/npm/v/@lacspace/money?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/money)
[![license](https://img.shields.io/npm/l/@lacspace/money?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `0.1 + 0.2 !== 0.3` — so never store money as a float. `@lacspace/money` keeps amounts as **integer minor units**, refuses to add different currencies, splits a bill without losing a cent, and formats with `Intl`. Tiny, typed, isomorphic.

## Install

```bash
npm i @lacspace/money
```

## Use it

```ts
import { money, Money } from "@lacspace/money";

const price = money(19.99, "USD");   // 1999 minor units, exact
price.multiply(3).format();          // "$59.97"
price.add(money(5, "USD"));          // $24.99
money(9.99, "USD").add(money(1, "EUR")); // ❌ throws: currency mismatch

// Split a bill three ways — the cent doesn't vanish
money(10, "USD").allocate([1, 1, 1]).map((m) => m.format());
// ["$3.34", "$3.33", "$3.33"]   (sum is exactly $10.00)

// Zero-decimal & 3-decimal currencies handled automatically
money(1000, "JPY").format("ja-JP"); // "￥1,000"
money(1.5, "BHD").toMinor();        // 1500  (BHD has 3 decimals)
```

## Why minor units

```ts
Money.fromMinor(1999, "USD");   // exact, no rounding surprises
Money.of(19.99, "USD");         // convenience: rounds major → minor once
money(19.99, "USD").toMinor();  // 1999
```

## API

| | |
| --- | --- |
| `money(major, ccy)` / `Money.of` / `Money.fromMinor` / `Money.zero` / `Money.parse` | construct |
| `.add` · `.subtract` · `.multiply` · `.divide` · `.negate` · `.abs` | arithmetic (currency-checked) |
| `.allocate(ratios)` · `.split(n)` | remainder-preserving distribution |
| `.equals` · `.greaterThan` · `.lessThan` · `.greaterThanOrEqual` · `.lessThanOrEqual` | compare |
| `.isZero` · `.isPositive` · `.isNegative` | predicates |
| `.format(locale?, opts?)` · `.toString` · `.toMajor` · `.toMinor` · `.toJSON` | output |
| `sumMoney(list, ccy?)` · `decimalsFor(ccy)` | helpers |

All operations return a new `Money` — instances are immutable.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
