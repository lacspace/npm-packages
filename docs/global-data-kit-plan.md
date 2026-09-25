# Global Data Kit — plan

Six zero-dependency, isomorphic packages that answer the questions every
international product asks at signup, checkout and invoicing. Each one is built
from its standard, cross-checked against an independent source, and tested with
published known-answer vectors. Nothing is invented: a table row that cannot be
verified is left out rather than guessed.

| package | standard | independent cross-check | known answers |
|---|---|---|---|
| `@lacspace/country` | ISO 3166-1 (alpha-2/3, numeric), ITU E.164 calling codes, ISO 4217 currency per country, IANA ccTLD, UN M49 region | ICU region names via `Intl.DisplayNames`; flag emoji derived from alpha-2 | every code round-trips; ICU name match |
| `@lacspace/currency` | ISO 4217 | ICU: `Intl.supportedValuesOf("currency")`, `Intl.NumberFormat` minor units, `Intl.DisplayNames` names | exponents 0/2/3/4, symbols |
| `@lacspace/iban` | ISO 13616 (IBAN registry lengths + BBAN formats), ISO 7064 MOD 97-10; BIC (ISO 9362); ISIN (ISO 6166) | the check digit itself: a mistyped example fails MOD 97 | registry example IBAN per country |
| `@lacspace/tax-id` | EU VAT (VIES formats + national checksums), UK VAT mod 97/9755, IN GSTIN & PAN, AU ABN/ACN/TFN, NZ IRD, CA BN, US EIN, BR CPF/CNPJ, NP PAN, SG UEN, ZA, MX RFC, AR CUIT, CL RUT, ID NPWP, KR BRN, JP corporate number | checksum algorithms: published examples validate only if the algorithm is right | one published valid + one altered-digit invalid per scheme |
| `@lacspace/phone` | ITU E.164 (calling codes, number lengths) + national formats for major markets | ISO 3166 codes from `@lacspace/country`; length rules vs libphonenumber-known examples | parse/format/e164 round-trips |
| `@lacspace/postal-code` | national postal code formats (UPU) | real example codes per country | validate + normalise (UK spacing, CA A1A 1A1) |

Design rules
- Honest scope in the README: phone validates structure and length, not that a
  number is assigned; tax-id validates format and checksum, not registration.
- Lookups accept any spelling: `country("np")`, `country("NPL")`, `country(524)`,
  `country("Nepal")`.
- Formatting never depends on ICU, so results are identical on every runtime;
  ICU is used only in tests, as the cross-check.
- All six ship together as the "Global Data Kit" catalog group.
