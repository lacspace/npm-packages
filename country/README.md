# @lacspace/country

**Every country, by any name.** ISO 3166-1 alpha-2, alpha-3 and numeric codes, English names, calling codes, currencies, top-level domains, continents and flag emoji for all 249 assigned codes. Look up by code, name or everyday alias. Zero dependencies, isomorphic, fully typed.

```sh
npm i @lacspace/country
```

```ts
import { country, countries, countriesUsing, searchCountries, flagEmoji } from "@lacspace/country";

country("np");           // { alpha2: "NP", alpha3: "NPL", numeric: "524", name: "Nepal", callingCodes: ["977"], currencies: ["NPR"], tld: ".np", region: "Asia", flag: "🇳🇵" }
country("Nepal");        // same
country(524);            // same
country("UK");           // United Kingdom — aliases like UK, USA, Holland, South Korea, Côte d'Ivoire in any spelling
countriesUsing("EUR");   // 35 countries
searchCountries("uni");  // United Arab Emirates, United Kingdom, United States … ranked
flagEmoji("in");         // "🇮🇳"
```

## API

| Function | Returns |
|---|---|
| `country(codeOrName)` | The country for an alpha-2, alpha-3, numeric code, English name, ICU name or alias, or `undefined` |
| `countries()` | All 249, sorted by alpha-2 |
| `isCountryCode(x)` | Type guard for an assigned alpha-2 |
| `countryName(code)` · `alpha2ToAlpha3` · `alpha3ToAlpha2` · `numericToAlpha2` | Code conversions |
| `callingCode("IN")` → `"91"` · `countriesByCallingCode("+44")` → GB, GG, IM, JE · `callingCodes()` | ITU E.164 |
| `countriesUsing("INR")` → IN, BT · `countriesInRegion("Asia")` | Groupings |
| `searchCountries("guin", 10)` | Ranked partial matches (prefix > word prefix > substring), aliases included |
| `flagEmoji("NP")` · `normalizeName(s)` | Helpers |

Names are the ISO English short names ("Korea, Republic of"); lookups also accept the natural order ("Republic of Korea"), ICU's names ("South Korea", "St. Kitts & Nevis") and common aliases.

## How it was checked

The table is verified in the test suite against the ICU data built into Node: every alpha-2 is a region ICU knows, and ICU's English name for each of the 249 regions resolves back to the same country. Every currency is an ISO 4217 code, every code column is unique, and the continent totals add up to 249.

## The Lacspace Developer Platform

This package is part of the [Lacspace developer platform](https://developer.lacspace.com): 150+ zero-dependency packages, one CLI, real docs. Browse the [Global Data Kit](https://developer.lacspace.com/packages?kit=global-data) or every package at [developer.lacspace.com/packages](https://developer.lacspace.com/packages).

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**.
