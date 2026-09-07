<div align="center">

# @lacspace/redact

**Redact secrets & PII from strings and objects before you log them.**

[![npm version](https://img.shields.io/npm/v/@lacspace/redact?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/redact)
[![install size](https://packagephobia.com/badge?p=@lacspace/redact)](https://packagephobia.com/result?p=@lacspace/redact)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/redact?label=minzip)](https://bundlephobia.com/package/@lacspace/redact)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/redact)
[![license](https://img.shields.io/npm/l/@lacspace/redact?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The last line of defence against leaking secrets into CloudWatch, Mongo logs or your error tracker. Masks values by **sensitive key name** (`password`, `token`, `authorization`…) and by **pattern** (JWTs, API keys, emails, credit cards, IPs) — deeply, on strings and objects.

- 🕵️ `redact()` — deep, clones input, masks keys + patterns
- 🧵 `redactString()` — scrub a single log line
- 🎭 `maskEmail` / `maskString`
- 🔧 Custom keys, disable specific patterns, custom mask
- ⚡ Zero dependencies · 🌍 isomorphic · fully typed

> **New in 1.1.0** — an extended, individually-toggleable detector set (Luhn-validated cards, SSN, phone E.164/US, IPv4/IPv6, JWT, AWS/GitHub/Slack/Stripe keys, private-key blocks, MAC, IBAN), a hardened **cycle-safe** deep redactor `redactObject()` (key denylist + allowlist, value patterns, custom regexes + replacer, partial masking, guaranteed never to throw on circular refs / symbols / bigint / functions), plus `scrubString`, `createObjectRedactor`, `luhnValid`, `ibanValid`, `maskKeepLast`, `maskCardNumber`, `maskEmailPartial`. **Everything below is unchanged** — the original `redact`/`redactString` keep their exact behaviour and defaults.

```ts
import { redactObject, createObjectRedactor, luhnValid } from "@lacspace/redact";

// deep, cycle-safe, key + value redaction with partial masking
redactObject(
  { user: { email: "jane@example.com", card: "4242 4242 4242 4242" }, token: "sk_live_x" },
  { partial: { keepEnd: 4 } },
);
// { user: { email: "j***@example.com", card: "**** **** **** 4242" }, token: "[REDACTED]" }

// force-keep a key + a custom pattern with a custom replacer
const scrub = createObjectRedactor({
  keyAllowlist: ["public_token"],
  customPatterns: [{ name: "order", pattern: /ORDER-[A-Z0-9]+/g }],
  replacer: (m, name) => `<${name}>`,
});

luhnValid("4242 4242 4242 4241"); // false → NOT flagged as a card
```

## Install

```bash
npm install @lacspace/redact
```

## Usage

```ts
import { redact, redactString, createRedactor } from "@lacspace/redact";

redact({
  email: "jane@example.com",
  password: "hunter2",
  headers: { authorization: "Bearer eyJhbG.eyJz.sig" },
  card: "4242 4242 4242 4242",
});
// { email: "j•••@example.com", password: "[REDACTED]",
//   headers: { authorization: "[REDACTED]" }, card: "[REDACTED]" }

redactString("token=eyJhbG.eyJz.sig for user a@b.com");
// "token=[REDACTED_JWT] for user a•••@b.com"

// bind once, use as a logger serializer
const scrub = createRedactor({ keys: ["x-internal-token"] });
logger.info(scrub(requestContext));
```

## API

| Export | Description |
| --- | --- |
| `redact(input, opts?)` | deep-redact a string or object |
| `redactString(str, opts?)` | pattern-scrub a string |
| `createRedactor(opts?)` | pre-bound redactor |
| `maskEmail` / `maskString` | targeted masks |
| `SENSITIVE_KEYS` | the default key list (extend via `opts.keys`) |
| `redactObject(input, opts?)` | **1.1.0** cycle-safe deep redactor (keys + values), never throws |
| `scrubString(str, opts?)` | **1.1.0** scrub a string with the extended detector set |
| `createObjectRedactor(opts?)` | **1.1.0** pre-bound `redactObject` |
| `DETECTORS` / `DETECTOR_NAMES` | **1.1.0** the extended, toggleable detector set |
| `luhnValid` / `ibanValid` | **1.1.0** checksum validators (cut false positives) |
| `maskKeepLast` / `maskCardNumber` / `maskEmailPartial` | **1.1.0** partial-masking helpers |

### `redactObject` options

| Option | Description |
| --- | --- |
| `mask` | replacement for key-masked values (default `"[REDACTED]"`) |
| `keys` | extra sensitive key names (case-insensitive) |
| `keyAllowlist` | keys to force-keep even if they'd match the denylist |
| `detectors` | `DetectorName[]` whitelist, or `{ name: boolean }` toggle map (default: all) |
| `customPatterns` | `{ name?, pattern, replace? }[]` user regexes |
| `replacer` | `(match, name) => string` global custom replacement |
| `partial` | `true` or `{ keepEnd?, maskChar? }` — keep last N visible instead of full redaction |
| `maxDepth` | max recursion depth (default 8) |
| `scrubStrings` | also pattern-scrub plain string values (default true) |

## The Lacspace Security Kit

| Package | For |
| --- | --- |
| [`@lacspace/crypto`](https://www.npmjs.com/package/@lacspace/crypto) | AES encryption & hashing |
| [`@lacspace/password`](https://www.npmjs.com/package/@lacspace/password) | Password hashing |
| [`@lacspace/jwt`](https://www.npmjs.com/package/@lacspace/jwt) | JWTs & tokens |
| [`@lacspace/apikey`](https://www.npmjs.com/package/@lacspace/apikey) | API keys |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/webauthn`](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric |
| [`@lacspace/mfa`](https://www.npmjs.com/package/@lacspace/mfa) | 2FA/3FA orchestration |
| [`@lacspace/lock`](https://www.npmjs.com/package/@lacspace/lock) | Account lockout |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| **`@lacspace/redact`** | Log redaction (this package) |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/redact` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/redact
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

