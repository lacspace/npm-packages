# @lacspace/postal-code

**Postal codes for 130 countries, in the right shape.** Validate and normalise ZIP codes, postcodes, PINs and CEPs with the national spacing and casing: `sw1a1aa` → `SW1A 1AA`, `k1a0b1` → `K1A 0B1`, `01310100` → `01310-100`. Knows which countries have no postal codes at all. Zero dependencies, isomorphic, fully typed.

```sh
npm i @lacspace/postal-code
```

```ts
import { validatePostalCode, isValidPostalCode, formatPostalCode, hasPostalCodes } from "@lacspace/postal-code";

validatePostalCode("sw1a 1aa", "GB");   // { valid: true, country: "GB", normalized: "SW1A 1AA" }
formatPostalCode("902101234", "US");    // "90210-1234"
formatPostalCode("１００－０００１", "JP"); // "100-0001"
isValidPostalCode("012345", "IN");      // false — Indian PINs never start with 0
hasPostalCodes("AE");                   // false
validatePostalCode("", "AE");           // { valid: true, normalized: "" }
```

## API

| Function | Notes |
|---|---|
| `validatePostalCode(code, country)` | `{ valid, country, normalized, reason }`; reasons `unknown-country` `no-postal-codes` `format` `empty` |
| `isValidPostalCode` · `formatPostalCode` | Boolean and string forms; `formatPostalCode` returns the input unchanged when invalid |
| `hasPostalCodes(country)` | False for AE, HK, QA, UG and other countries without a system |
| `examplePostalCode("GB")` → `"SW1A 1AA"` | Placeholders for forms |
| `postalCodeCountries()` | Covered countries |

Validation is structural: it checks the national format (length, letters vs digits, forbidden letters such as D, F, I, O, Q, U in Canadian codes), not whether a specific code is in use.

## The Lacspace Developer Platform

This package is part of the [Lacspace developer platform](https://developer.lacspace.com): 150+ zero-dependency packages, one CLI, real docs. Browse the [Global Data Kit](https://developer.lacspace.com/packages?kit=global-data) or every package at [developer.lacspace.com/packages](https://developer.lacspace.com/packages).

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**.
