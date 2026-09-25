# @lacspace/tax-id

**Tax and business numbers, with the real check digits.** EU VAT for all 27 member states plus the UK and Northern Ireland, Indian GSTIN and PAN, Australian ABN/ACN/TFN, New Zealand IRD, Canadian BN, US EIN, Brazilian CPF/CNPJ, Argentine CUIT, Chilean RUT, Mexican RFC, Nepali PAN, Singapore UEN, Indonesian NPWP, Korean BRN, Japanese corporate number and South African tax number. Zero dependencies, isomorphic, fully typed.

```sh
npm i @lacspace/tax-id
```

```ts
import { validateTaxId, isValidVat, isValidGstin, isValidAbn, isValidCnpj } from "@lacspace/tax-id";

validateTaxId("DE136695976");
// { valid: true, country: "DE", type: "vat", strength: "checksum", normalized: "DE136695976" }
validateTaxId("27AAPFU0939F1ZV", { country: "IN" });   // { valid: true, type: "gstin", strength: "checksum", … }
validateTaxId("51 824 753 556", { country: "AU" });     // { valid: true, type: "abn", … }
isValidVat("BE 0428.759.497");                          // true
isValidCnpj("11.222.333/0001-81");                      // true
```

`strength` tells you how much was verified: `"checksum"` when the scheme has check digits and they passed, `"format"` when only the structure is defined (Cypriot and Latvian VAT, Indian PAN, US EIN, Mexican RFC, Nepali PAN, Singapore UEN, Indonesian NPWP).

## API

`validateTaxId(value, { country?, type? })` tries every scheme for the country (or the VAT prefix when no country is given) and returns `{ valid, country, type, strength, normalized, reason }`. `isValidTaxId` is the boolean form. `TAX_ID_COUNTRIES` lists what is covered.

Per scheme: `validateVat` / `isValidVat(value, country?)` (`VAT_COUNTRIES`), `isValidGstin`, `isValidPan`, `isValidAbn`, `isValidAcn`, `isValidTfn`, `isValidIrd`, `isValidBn`, `isValidEin`, `isValidCpf`, `isValidCnpj`, `isValidCuit`, `isValidRut`, `isValidRfc`, `isValidNepalPan`, `isValidUen`, `isValidNpwp`, `isValidKrBrn`, `isValidJpCorporateNumber`, `isValidZaTaxNumber`, and the shared `luhn`.

## What it does and does not tell you

A valid result means the number is *well-formed* for its scheme, including its check digits. It does not mean the number is registered or belongs to whoever gave it to you: for that, use the issuer's lookup (VIES for EU VAT, the GST portal, the Australian Business Register, and so on). Separators, spaces and case are ignored on input; `normalized` is the canonical spelling.

## How it was checked

The tests use tax authorities' own examples and public companies' numbers (35 VAT numbers, the ATO's ABN/ACN/TFN examples, the IRD's test numbers, Toyota's corporate number, Samsung's BRN, the standard CPF/CNPJ examples), and require that changing one digit fails every checksum scheme.

## The Lacspace Developer Platform

This package is part of the [Lacspace developer platform](https://developer.lacspace.com): 150+ zero-dependency packages, one CLI, real docs. Browse the [Global Data Kit](https://developer.lacspace.com/packages?kit=global-data) or every package at [developer.lacspace.com/packages](https://developer.lacspace.com/packages).

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**.
