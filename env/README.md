<div align="center">

# @lacspace/env

**Typed, validated environment variables — fail fast at boot, not in production.**

[![npm version](https://img.shields.io/npm/v/@lacspace/env?color=%230ea5e9&label=npm)](https://www.npmjs.com/package/@lacspace/env)
[![install size](https://packagephobia.com/badge?p=@lacspace/env)](https://packagephobia.com/result?p=@lacspace/env)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/env?label=minzip)](https://bundlephobia.com/package/@lacspace/env)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/env)
[![license](https://img.shields.io/npm/l/@lacspace/env?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Declare a schema, validate `process.env` once at startup, and get a **typed, frozen** object. Missing or malformed variables throw **one clear error listing everything wrong** — so a bad deploy fails immediately instead of 500-ing at 2am. A zero-dependency [t3-env](https://env.t3.gg) / [envalid](https://github.com/af/envalid) alternative.

- 🔒 Types inferred from the schema — `env.PORT` is a `number`, guaranteed present
- 💥 Fail-fast with an aggregated, readable error
- 🧰 Validators: `str` · `num` · `int` · `port` · `bool` · `url` · `email` · `oneOf` · `json` · `duration` · `bytes` · `list`/`array` · `enums` · `host`
- 🎚️ `default`, `optional`, `min`/`max` per field
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

### New in 1.1.0

Everything above still works byte-for-byte. Added, all opt-in:

- **More coercers** — `duration` (`"30s"`→ms), `bytes` (`"10mb"`→number), `list`/`array` (comma-separated, per-item typed), `enums(...values)` (variadic), `host`, plus `coerce()` to build your own.
- **`parseEnv` / `safeParse`** — validate without throwing: `{ success, data | errors }`.
- **Secret redaction** — values of secret-looking vars (`*_KEY`, `*_SECRET`, `TOKEN`, `PASSWORD`…) are redacted in the aggregated error; mark any var with `.secret()`.
- **`${VAR}` expansion** — opt in with `createEnv(schema, source, { expand: true })`; supports `${VAR:-fallback}` and detects cycles.
- **`.describe()` / `.example()`** per var + **`generateEnvExample(schema)`** to render a `.env.example`.

## Install

```bash
npm install @lacspace/env      # or pnpm add / yarn add / bun add
```

## Define once, use everywhere

```ts
// env.ts
import { createEnv, str, port, url, bool, oneOf } from "@lacspace/env";

export const env = createEnv({
  NODE_ENV: oneOf(["development", "production", "test"], { default: "development" }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: url(),
  SMTP_HOST: str(),
  SMTP_PORT: port({ default: 587 }),
  DEBUG: bool({ default: false }),
  ADMIN_EMAILS: str({ optional: true }),
});
```

```ts
import { env } from "./env";

env.PORT;      // number — 3000 unless set
env.DEBUG;     // boolean
env.NODE_ENV;  // "development" | "production" | "test"
```

If `DATABASE_URL` is missing and `SMTP_PORT` is `"abc"`, startup throws:

```
EnvError: Invalid environment variables:
  • "DATABASE_URL" is required but was not set
  • "SMTP_PORT" must be a number, got "abc"
```

## Validators

| Validator | Parses to | Options |
| --- | --- | --- |
| `str(opts?)` | string | `default`, `optional`, `allowEmpty` |
| `num` / `int` | number | `default`, `optional`, `min`, `max` |
| `port(opts?)` | number (1–65535) | `default`, `optional` |
| `bool(opts?)` | boolean | accepts `true/1/yes/on`, `false/0/no/off` |
| `url` / `email` | validated string | `default`, `optional` |
| `oneOf(values, opts?)` | union of literals | `default`, `optional` |
| `json<T>(opts?)` | parsed JSON | `default`, `optional` |
| `duration(opts?)` | number (ms) — `"30s"` `"5m"` `"1h"` | `default`, `optional` |
| `bytes(opts?)` | number (bytes) — `"10mb"` `"512kb"` | `default`, `optional` |
| `list(item?, opts?)` / `array` | `T[]` from comma-separated (`separator` option) | `default`, `optional` |
| `enums(...values)` | union of literals (variadic) | — |
| `host(opts?)` | validated host / IP `[:port]` | `default`, `optional` |
| `coerce(type, cast, opts?)` | your own coercer | `default`, `optional` |

Every validator is chainable with `.describe(text)`, `.example(value)`, and `.secret()`.

## Not just `process.env`

```ts
createEnv(schema, import.meta.env); // Vite
createEnv(schema, Deno.env.toObject());
```

## Non-throwing, expansion & docs

```ts
import { parseEnv, generateEnvExample, port, url } from "@lacspace/env";

const schema = {
  PORT: port({ default: 3000 }).describe("HTTP port"),
  DATABASE_URL: url().example("postgres://localhost/app"),
  API_SECRET: str().secret(), // redacted in error output
};

// Never throws — great for tests
const res = parseEnv(schema, { DATABASE_URL: "https://db" });
if (!res.success) console.error(res.errors);

// ${VAR} expansion (opt-in), with ${VAR:-fallback} + cycle detection
createEnv(schema, { HOST: "db", DATABASE_URL: "postgres://${HOST}/app" }, { expand: true });

// Generate a .env.example straight from the schema
generateEnvExample(schema);
```

## The Lacspace WebKit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| **`@lacspace/env`** | Typed env variables (this package) |
| [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) | Rate limiting |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/next`](https://www.npmjs.com/package/@lacspace/next) | Next.js SDK integration |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/env` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/env
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

