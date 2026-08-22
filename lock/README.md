<div align="center">

# @lacspace/lock

**Account lockout & brute-force protection — "server lock".**

[![npm version](https://img.shields.io/npm/v/@lacspace/lock?color=%23a855f7&label=npm)](https://www.npmjs.com/package/@lacspace/lock)
[![install size](https://packagephobia.com/badge?p=@lacspace/lock)](https://packagephobia.com/result?p=@lacspace/lock)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/lock?label=minzip)](https://bundlephobia.com/package/@lacspace/lock)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/lock)
[![license](https://img.shields.io/npm/l/@lacspace/lock?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Stop credential-stuffing and brute force at the door. Track failed attempts per key (user, email, IP), lock after N strikes with **exponential backoff**, auto-expire the window, and reset on success. In-memory store built in; implement `LockStore` for Redis/Mongo.

- 🔒 `record` / `check` / `reset` with a clear `LockStatus`
- 📈 Exponential backoff up to a cap · self-resetting window
- 🔌 Pluggable `LockStore` (memory included)
- ⚡ Zero dependencies · 🌍 isomorphic · fully typed

## Install

```bash
npm install @lacspace/lock
```

## Usage

```ts
import { lockout } from "@lacspace/lock";

const guard = lockout({ maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 });

// before checking the password
const status = await guard.check(email);
if (status.locked) throw new Error(`Too many attempts. Try again in ${Math.ceil(status.retryAfterMs / 1000)}s`);

if (await verifyPassword(input, stored)) {
  await guard.reset(email);          // success — clear strikes
} else {
  const s = await guard.record(email); // failure — may lock
  throw new Error(s.locked ? "Account temporarily locked." : `${s.remaining} attempts left`);
}
```

## API

| Export | Description |
| --- | --- |
| `lockout(opts?)` | `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `windowMs`, `store` |
| `.check(key)` | status without recording |
| `.record(key)` | record a failure → new status |
| `.reset(key)` | clear on success |
| `MemoryLockStore` / `LockStore` | storage (bring your own for Redis) |

`LockStatus` → `{ locked, attempts, remaining, retryAfterMs }`.

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
| **`@lacspace/lock`** | Account lockout (this package) |
| [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers) | Secure headers / CSP |
| [`@lacspace/redact`](https://www.npmjs.com/package/@lacspace/redact) | Log redaction |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
