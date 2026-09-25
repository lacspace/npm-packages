# @lacspace/phone

**Phone numbers people actually type.** Parse any spelling into E.164, national and international formats, detect the country from the calling code (including the shared +1 and +44 codes), drop trunk prefixes, read extensions, and validate lengths and leading digits per country. Zero dependencies beyond `@lacspace/country`, isomorphic, fully typed.

```sh
npm i @lacspace/phone
```

```ts
import { parsePhone, isValidPhone, formatPhone, phoneCountry } from "@lacspace/phone";

parsePhone("+977 980-123-4567");
// { valid: true, country: "NP", callingCode: "977", national: "9801234567", e164: "+9779801234567",
//   international: "+977 980 123 4567", nationalFormat: "0980 123 4567", type: "mobile" }
parsePhone("(202) 456-1111", { defaultCountry: "US" }).e164;   // "+12024561111"
parsePhone("07911 123456", { defaultCountry: "GB" }).type;      // "mobile"
phoneCountry("+1 416 555 0123");                                // "CA"
formatPhone("+442079460958", "national");                       // "02079 460958"
parsePhone("+977 980123456");                                   // { valid: false, reason: "length", country: "NP", … }
```

## API

| Function | Notes |
|---|---|
| `parsePhone(input, { defaultCountry? })` | Accepts `+`, `00`, brackets, dots, dashes, full-width and Arabic/Devanagari digits, `ext.`/`x` extensions |
| `isValidPhone(input, defaultCountry?)` | Boolean form |
| `formatPhone(input, "e164" \| "international" \| "national", defaultCountry?)` | Returns the input unchanged when it cannot be parsed |
| `phoneCountry("+…")` | Alpha-2, or `undefined` |
| `RULED_COUNTRIES` | The 80+ countries with specific length / leading-digit / grouping rules; others use the generic E.164 limits |

Failure reasons: `empty` `characters` `no-country` `unknown-calling-code` `length` `leading-digits`. `type` is `mobile`, `fixed-or-mobile` or `unknown`, based on the leading digits where the country's plan makes that distinction.

## What "valid" means

That the number has a possible structure for its country: a known calling code, an allowed length, no trunk prefix after the country code, and leading digits that exist in the plan. It does not mean the number is assigned or reachable. Grouping follows each country's common display; it is not a carrier-grade formatter.

## The Lacspace Developer Platform

This package is part of the [Lacspace developer platform](https://developer.lacspace.com): 150+ zero-dependency packages, one CLI, real docs. Browse the [Global Data Kit](https://developer.lacspace.com/packages?kit=global-data) or every package at [developer.lacspace.com/packages](https://developer.lacspace.com/packages).

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**.
