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
- 🧰 Validators: `str` · `num` · `int` · `port` · `bool` · `url` · `email` · `oneOf` · `json`
- 🎚️ `default`, `optional`, `min`/`max` per field
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

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

## Not just `process.env`

```ts
createEnv(schema, import.meta.env); // Vite
createEnv(schema, Deno.env.toObject());
```

## The Lacspace WebKit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| **`@lacspace/env`** | Typed env variables (this package) |
| [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) | Rate limiting |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/next`](https://www.npmjs.com/package/@lacspace/next) | Next.js SDK integration |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
