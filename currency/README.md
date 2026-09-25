# @lacspace/currency

**ISO 4217, with the minor units right.** Codes, numeric codes, minor units (0 for JPY, 3 for BHD, 4 for CLF), names, symbols, and a formatter that gives the same answer on every runtime. Zero dependencies, isomorphic, fully typed.

```sh
npm i @lacspace/currency
```

```ts
import { currency, minorUnits, toMinor, formatCurrency, currencies } from "@lacspace/currency";

currency("npr");                               // { code: "NPR", numeric: "524", minorUnits: 2, name: "Nepalese Rupee", symbol: "रू", kind: "currency" }
minorUnits("JPY");                             // 0
toMinor(19.99, "USD");                         // 1999  — rounds the decimal you wrote, so toMinor(1.005, "USD") is 101
formatCurrency(1234.5, "USD");                 // "$1,234.50"
formatCurrency(1234.5, "EUR", { locale: "de" }); // "1.234,50 €"
formatCurrency(1234567.89, "INR", { locale: "in" }); // "₹12,34,567.89"
currencies({ special: false, funds: false });  // money in circulation only
```

## API

| Function | Notes |
|---|---|
| `currency(code \| numeric)` | Any case; `undefined` when unknown |
| `currencies({ special?, funds? })` | All codes; `special: false` drops metals/bond units/test codes, `funds: false` drops fund codes (CLF, MXV, USN …) |
| `isCurrencyCode(x)` · `currencyName` · `currencySymbol` | Helpers |
| `minorUnits(code)` | 0 / 2 / 3 / 4 per ISO; unknown codes default to 2 |
| `toMinor(major, code)` · `fromMinor(minor, code)` | Integer minor units, float-safe |
| `formatCurrency(amount, code, { locale, display, decimals })` | Locales `en` `de` `fr` `ch` `in`; `display`: symbol / code / none |
| `FUND_CODES` | The ISO fund codes |

## How it was checked

Every code is cross-checked against ICU's currency list and names, and the minor-unit column is asserted to match the ISO 4217 list exactly: 0 for BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF, 3 for BHD IQD JOD KWD LYD OMR TND, 4 for CLF UYW, 2 for everything else. ICU's own rounding is *cash* rounding (it rounds AFN, IDR and COP to 0) and is deliberately not used. ANG is not listed: the Caribbean guilder XCG replaced it in 2025.

## The Lacspace Developer Platform

This package is part of the [Lacspace developer platform](https://developer.lacspace.com): 150+ zero-dependency packages, one CLI, real docs. Browse the [Global Data Kit](https://developer.lacspace.com/packages?kit=global-data) or every package at [developer.lacspace.com/packages](https://developer.lacspace.com/packages).

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**.
