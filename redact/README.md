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

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
