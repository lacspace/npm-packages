<div align="center">

# @lacspace/money

**Money without the floating-point bugs — integer cents, safe math, localized formatting.**

[![npm version](https://img.shields.io/npm/v/@lacspace/money?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/money)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/money?label=minzip)](https://bundlephobia.com/package/@lacspace/money)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/money)
[![license](https://img.shields.io/npm/l/@lacspace/money?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `0.1 + 0.2 !== 0.3` — so never store money as a float. `@lacspace/money` keeps amounts as **integer minor units**, refuses to add different currencies, splits a bill without losing a cent, and formats with `Intl`. Tiny, typed, isomorphic.

> **New in 1.1.0** — explicit rounding modes (`half-up` · `half-down` · `half-even`/`bankers` · `floor` · `ceil` · `trunc`) on scalar math, `percentage`, `compare`/`minMoney`/`maxMoney`, an `Intl`-free `formatBasic`, `parseMoney(str) → integer minor units`, `currencyExponent`/`currencySymbol`, and injected-rate `convert(m, toCurrency, rate)`. All additive — every existing export is unchanged.

- 🪙 **Integer minor units** — no floating-point cent bugs, ever
- 🧮 Currency-checked arithmetic — adding `USD` to `EUR` throws
- ➗ `allocate` / `split` distribute without losing a cent (remainder-preserving)
- 🌍 Localized `Intl` formatting · zero-decimal (JPY) & 3-decimal (BHD) currencies handled
- 🧊 Immutable — every operation returns a new `Money`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

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

### New in 1.1.0

```ts
import {
  divide, percentage, compare, minMoney, maxMoney,
  formatBasic, parseMoney, convert,
  currencyExponent, currencySymbol,
} from "@lacspace/money";

// Explicit, tested rounding modes for the paths that produce fractions
divide(money(0.05, "USD"), 2, "half-even").toMinor(); // 2  (banker's rounding of 2.5)
divide(money(0.05, "USD"), 2, "half-up").toMinor();   // 3
percentage(money(100, "USD"), 8.5).format();          // "$8.50"

// Compare / min / max
compare(money(5, "USD"), money(9, "USD"));            // -1
maxMoney(money(5, "USD"), money(9, "USD")).format();  // "$9.00"

// Intl-free formatting + parse back to integer minor units
formatBasic(money(1234.56, "USD"));                   // "$1,234.56"  (no Intl)
parseMoney("$1,234.56", "USD");                        // 123456  (integer minor units)

// Currency metadata
currencyExponent("BHD");                               // 3
currencySymbol("NPR");                                 // "रू"

// Convert with an injected rate (never hits the network); honours exponents + rounding
convert(money(100, "USD"), "EUR", 0.92).format();     // "€92.00"
convert(money(100, "USD"), "JPY", 150).format();      // "¥15,000"
```

> **How `parseMoney` / `Money.parse()` reads separators** (1.2.0+). When both
> `.` and `,` appear, the last one is the decimal point. A lone separator followed
> by exactly three digits is a thousands separator, because a two-decimal currency
> can't carry a third decimal: `"1,234"` USD → `$1,234.00`, `"1.234"` EUR →
> `€1,234.00`. Three-decimal currencies (BHD, KWD, …) keep it as decimals. Western
> (`1,234,567`) and Indian (`12,34,567`) grouping both parse; anything else throws
> rather than guessing. Arabic-Indic, Devanagari and full-width digits, accounting
> `($5.00)` and trailing `5.00-` negatives all work. The digits are turned into
> minor units directly — no float in between. When you know the locale, say so:
>
> ```ts
> parseMoney("1,234", "USD", { decimalSeparator: "," }); // 123 (1.234 → $1.23)
> ```

## What's new in 1.2.0

- **`parseMoney("$1,234", "USD")` now returns `123400`.** It used to return `123` — a
  lone comma was read as a decimal point, so round amounts came out 1000× too
  small. `"¥1,234,567"` and `"₹1,23,456"` used to throw; both parse now. See the
  separator rules above, and the new `{ decimalSeparator }` option.
- **`money(1.005, "USD")` is now `101` cents, not `100`.** `1.005 × 100` is
  `100.49999999999999` in binary floating point; rounding now snaps to the
  decimal you wrote first. Same fix in `roundMinor`, `multiply`, `percentage`
  and `convert`.
- **ISO 4217 exponents corrected** for BIF, DJF, KMF, PYG, UYI, VUV (0 decimals,
  were 2) and CLF, UYW (4, were 2). HUF stays at 0 as before (ISO says 2) so
  stored forint amounts don't silently rescale.

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
| `sumMoney(list, ccy?)` / `sum` · `decimalsFor(ccy)` | helpers |
| `add` · `subtract` · `multiply(m, f, mode?)` · `divide(m, d, mode?)` · `percentage(m, pct, mode?)` | free-function math with rounding modes |
| `compare(a, b)` · `minMoney(...)` · `maxMoney(...)` · `equals(a, b)` · `allocate(m, r)` · `split(m, n)` | free-function compare / distribute |
| `roundMinor(n, mode)` — `RoundingMode` = `half-up` \| `half-down` \| `half-even` \| `bankers` \| `floor` \| `ceil` \| `trunc` | explicit rounding |
| `formatBasic(m, opts?)` · `parseMoney(str, ccy) → minor units` | Intl-free format + parse |
| `currencyExponent(ccy)` · `currencySymbol(ccy)` | currency metadata |
| `convert(m, toCcy, rate, mode?)` | conversion with an injected rate |

All operations return a new `Money` — instances are immutable.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/money` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/money
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

