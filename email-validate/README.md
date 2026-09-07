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

> **New in 1.1.0** — a stronger, superset RFC-5322 syntax check (`isValidEmailRFC5322`) that accepts **quoted local parts** and **IP-literal domains**; whole-address `isDisposableEmail()` / `isRoleAccount()` wrappers; and `normalizeEmail(email, opts?)` with per-rule toggles. All additive — every existing export is unchanged.

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

## Advanced syntax & helpers (v1.1.0)

```ts
import {
  isValidEmailRFC5322, isDisposableEmail, isRoleAccount, normalizeEmail,
} from "@lacspace/email-validate";

// Stronger RFC-5322 syntax — a SUPERSET of isValidEmail:
isValidEmailRFC5322('"john doe"@example.com');   // true  (quoted local part)
isValidEmailRFC5322("user@[192.168.0.1]");        // true  (IPv4 literal)
isValidEmailRFC5322("user@[IPv6:2001:db8::1]");   // true  (IPv6 literal)
isValidEmailRFC5322("a..b@example.com");          // false (consecutive dots)
isValidEmailRFC5322("a".repeat(65) + "@x.com");   // false (local > 64)

// Whole-address convenience wrappers:
isDisposableEmail("x@mailinator.com");            // true
isRoleAccount("support+ticket@acme.com");         // true  (ignores +tag)

// normalizeEmail now takes optional per-rule toggles (defaults = v1.0 behaviour):
normalizeEmail("Foo.Bar@gmail.com", { gmailRemoveDots: false });  // "foo.bar@gmail.com"
normalizeEmail("a.b+x@Acme.com",   { removeSubaddress: false });  // "a.b+x@acme.com"
```

### API

| Export | Signature | What it does |
| --- | --- | --- |
| `isValidEmailRFC5322` | `(email, opts?: { allowQuoted?; allowIpLiteral? }) → boolean` | Stronger, superset syntax check: quoted local parts + IP-literal (IPv4/IPv6) domains, RFC length limits (local ≤64, domain ≤255, total ≤254), consecutive/edge-dot rejection. No network. |
| `isDisposableEmail` | `(email, extra?: string[]) → boolean` | Disposable check taking the **whole address** (companion to `isDisposable(domain)`). |
| `isRoleAccount` | `(email) → boolean` | Role-mailbox check taking the **whole address**, `+tag`-aware (companion to `isRoleAddress(local)`). |
| `normalizeEmail` | `(email, opts?: NormalizeOptions) → string` | Canonical form. New optional `opts`: `gmailRemoveDots`, `gmailRemoveSubaddress`, `removeSubaddress`, `lowercaseLocal` (all default `true` — v1.0 behaviour unchanged). |

## The Lacspace MailKit

| Package | For |
| --- | --- |
| [`@lacspace/mailer`](https://www.npmjs.com/package/@lacspace/mailer) | Send email over SMTP |
| [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) | Build responsive HTML emails |
| **`@lacspace/email-validate`** | Validate & normalize addresses (this package) |
| [`@lacspace/email-verify`](https://www.npmjs.com/package/@lacspace/email-verify) | MX + SMTP deliverability checks |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/email-validate` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/email-validate
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

