<div align="center">

# @lacspace/email-validate

**Email validation that goes beyond a regex — disposable detection, typo suggestions, normalization.**

[![npm version](https://img.shields.io/npm/v/@lacspace/email-validate?color=%23e11d48&label=npm)](https://www.npmjs.com/package/@lacspace/email-validate)
[![install size](https://packagephobia.com/badge?p=@lacspace/email-validate)](https://packagephobia.com/result?p=@lacspace/email-validate)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/email-validate?label=minzip)](https://bundlephobia.com/package/@lacspace/email-validate)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/email-validate)
[![license](https://img.shields.io/npm/l/@lacspace/email-validate?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A regex tells you an address is *shaped* right. This tells you it's a **mailinator throwaway**, that `gmial.com` should be `gmail.com`, that `info@` is a role mailbox, and gives you a normalized canonical form for de-duping users.

- ✅ Robust syntax + length checks (RFC-5321-ish)
- 🗑️ **Disposable / temp-mail** detection
- 💡 **"Did you mean?"** typo suggestions (`gmial.com` → `gmail.com`)
- 👥 Role-address (`info@`, `admin@`) & free-provider flags
- 🔤 `normalizeEmail` — Gmail dots/`+tags` stripped, lowercased (great for de-dupe)
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/email-validate      # or pnpm add / yarn add / bun add
```

## One call, everything you need

```ts
import { validateEmail } from "@lacspace/email-validate";

validateEmail("john.doe+news@gmial.com");
// {
//   valid: true,
//   normalized: "john.doe@gmial.com",
//   local: "john.doe+news",
//   domain: "gmial.com",
//   disposable: false,
//   role: false,
//   free: false,
//   suggestion: "john.doe+news@gmail.com"   // ← typo caught
// }

validateEmail("test@mailinator.com").disposable; // true
validateEmail("info@lacspace.com").role;          // true
validateEmail("nope@@bad").valid;                 // false
```

## Individual helpers

```ts
import {
  isValidEmail, normalizeEmail, isDisposable, isRoleAddress, isFreeProvider, suggestEmail,
} from "@lacspace/email-validate";

isValidEmail("a@b.co");                       // true
normalizeEmail("John.Doe+promo@GMAIL.com");   // "johndoe@gmail.com"
isDisposable("guerrillamail.com");            // true
isRoleAddress("support");                      // true
isFreeProvider("yahoo.com");                   // true
suggestEmail("me@yahho.com");                  // "me@yahoo.com"
```

## Real-world: clean a signup form

```ts
const r = validateEmail(input);
if (!r.valid) return fail("Please enter a valid email.");
if (r.suggestion) return confirm(`Did you mean ${r.suggestion}?`);
if (r.disposable) return fail("Please use a permanent email address.");
await createUser({ email: r.normalized }); // store the canonical form
```

## Customize

```ts
validateEmail(input, {
  extraDisposable: ["mycompany-temp.com"], // add your own throwaway domains
  suggestions: false,                       // turn off typo suggestions
});
```

You can also read/extend the exported sets: `DISPOSABLE_DOMAINS`, `FREE_PROVIDERS`, `ROLE_LOCALS`.

## The Lacspace MailKit

| Package | For |
| --- | --- |
| [`@lacspace/mailer`](https://www.npmjs.com/package/@lacspace/mailer) | Send email over SMTP |
| [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) | Build responsive HTML emails |
| **`@lacspace/email-validate`** | Validate & normalize addresses (this package) |
| [`@lacspace/email-verify`](https://www.npmjs.com/package/@lacspace/email-verify) | MX + SMTP deliverability checks |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/email-validate` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/email-validate
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

