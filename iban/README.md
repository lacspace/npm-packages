# @lacspace/iban

**IBAN, BIC and ISIN, verified by the maths.** ISO 13616 registry lengths and BBAN formats for 90 countries, ISO 7064 MOD 97-10 check digits, bank/branch/account extraction, SEPA flag, print formatting and IBAN generation. Plus BIC/SWIFT (ISO 9362) and ISIN (ISO 6166) checks. Zero dependencies, isomorphic, fully typed.

```sh
npm i @lacspace/iban
```

```ts
import { parseIban, isValidIban, generateIban, formatIban, parseBic, isValidIsin } from "@lacspace/iban";

parseIban("GB82 WEST 1234 5698 7654 32");
// { valid: true, country: "GB", checkDigits: "82", bban: "WEST12345698765432", bankCode: "WEST", branchCode: "123456",
//   accountNumber: "98765432", sepa: true, electronic: "GB82WEST12345698765432", formatted: "GB82 WEST 1234 5698 7654 32" }
parseIban("GB83WEST12345698765432");   // { valid: false, reason: "check-digits", country: "GB" }
generateIban("DE", "370400440532013000"); // "DE89370400440532013000"
parseBic("DEUTDEFF500");                 // { valid: true, bankCode: "DEUT", country: "DE", locationCode: "FF", branchCode: "500", … }
isValidIsin("US0378331005");             // true
```

## API

| Function | Notes |
|---|---|
| `parseIban(s)` | Reasons: `empty` `characters` `country` `length` `format` `check-digits` |
| `isValidIban(s)` · `formatIban(s)` · `electronicIban(s)` | Spaces and dashes are ignored on input |
| `generateIban(country, bban)` | Computes the check digits; throws for unknown countries or a BBAN in the wrong format |
| `ibanCountries()` · `ibanLength("NO")` · `exampleIban("DE")` · `SEPA` | Registry data |
| `parseBic(s)` · `isValidBic(s)` | 8 or 11 characters; primary-office and test-BIC flags |
| `isValidIsin(s)` · `isinCheckDigit(first11)` | Luhn over the digit expansion |
| `mod97(s)` | The bare ISO 7064 remainder |

## How it was checked

The registry's example IBAN for every one of the 90 countries must pass the check digits, so a typo in the table is caught by the algorithm itself. The tests also alter one character of every example and require it to fail, and check well-known account layouts (GB, DE, FR, IT, NL, SA) and ten published ISINs.

## The Lacspace Developer Platform

This package is part of the [Lacspace developer platform](https://developer.lacspace.com): 150+ zero-dependency packages, one CLI, real docs. Browse the [Global Data Kit](https://developer.lacspace.com/packages?kit=global-data) or every package at [developer.lacspace.com/packages](https://developer.lacspace.com/packages).

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**.
