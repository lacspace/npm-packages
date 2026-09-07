<div align="center">

# @lacspace/id

**Unique IDs done right — UUID v4, time-sortable UUID v7, Nano-ID-style & short codes.**

[![npm version](https://img.shields.io/npm/v/@lacspace/id?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/id)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/id?label=minzip)](https://bundlephobia.com/package/@lacspace/id)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/id)
[![license](https://img.shields.io/npm/l/@lacspace/id?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every ID kind you actually need, in one tiny package — including **UUID v7**, the time-sortable UUID that makes a fantastic database primary key. Cryptographically random (Web Crypto), monotonic within a millisecond, zero-dependency.

- 🆔 `uuidv4()` — classic random UUID
- ⏱️ `uuidv7()` — **time-sortable** UUID (great index-friendly primary key)
- 🔤 `nanoid()` / `shortId()` — URL-safe random strings
- 🏷️ `id("user")` — prefixed ids like `user_9f8c…`

### ✨ New in 1.1.0

More formats and building blocks, all zero-dep and CSPRNG-backed:

- 🧭 `ulid()` — Crockford base32, **time-sortable & monotonic** (26 chars)
- 🧵 `cuid2()` — collision-resistant, letter-leading id
- ❄️ `snowflakeFactory()` — 64-bit sortable id with injectable epoch / machine id / clock
- 🔡 `customId({ alphabet, size })` — any alphabet, **unbiased** (rejection sampling) + `ALPHABETS` presets + `base62Id()` / `base58Id()`
- 🏷️ `prefixedId("user")` / `parsePrefixedId()` — Stripe-style typed ids, round-trippable
- 🕒 `decodeTime(id)` — read the timestamp back out of a ULID or UUID v7
- ✅ `isUlid` / `isCuid2` / `isSnowflake` validators

```ts
import { ulid, cuid2, snowflakeFactory, customId, prefixedId, decodeTime, ALPHABETS } from "@lacspace/id";

ulid();                                   // "01JR8Z3C2F6ABM7Q9K…"  ← sorts by time
cuid2();                                  // "k3f9x2q7z1m8..."
customId({ alphabet: ALPHABETS.base58, size: 12 });  // unbiased over any alphabet
prefixedId("user");                       // "user_9f8c1a3e…"  → parsePrefixedId() splits it back
decodeTime(ulid());                       // 1757… (ms since epoch)

const nextId = snowflakeFactory({ machineId: 7 });
nextId();                                 // "72057594037…"  (64-bit, JSON-safe string)
```

## Install

```bash
npm install @lacspace/id      # or pnpm add / yarn add / bun add
```

## Use

```ts
import { uuidv4, uuidv7, nanoid, shortId, id } from "@lacspace/id";

uuidv4();          // "f47ac10b-58cc-4372-a567-0e02b2c3d479"
uuidv7();          // "0192e7a1-3c2f-7abc-8def-1234567890ab"  ← sorts by time
nanoid();          // "V1StGXR8_Z5jdHi6B-myT"
shortId();         // "Ab3xK9_p"
id("user");        // "user_9f8c1a3e7b2d4f6a"
```

Why v7? Because random UUIDs (v4) scatter across a database index, hurting insert performance. **v7 is lexicographically sortable by creation time** — index-friendly *and* globally unique — and `uuidv7Time(id)` reads the timestamp back out.

## API

| Export | Description |
| --- | --- |
| `uuidv4()` | random UUID |
| `uuidv7(now?)` · `uuidv7Time(id)` | time-sortable UUID + timestamp extract |
| `nanoid(size=21)` · `shortId(size=8)` | URL-safe random strings |
| `id(prefix, size=16)` | prefixed id (uses nanoid) |
| `ulid(now?)` · `ulidTime(id)` | Crockford base32, time-sortable + monotonic |
| `cuid2(length=24)` | collision-resistant, letter-leading id |
| `snowflakeFactory({ epoch?, machineId?, now? })` · `snowflake()` · `snowflakeTime(id, epoch?)` | 64-bit sortable numeric id (decimal string) |
| `customId({ alphabet, size })` | any alphabet, unbiased (rejection sampling) |
| `base62Id(size=12)` · `base58Id(size=12)` · `ALPHABETS` | ready-made short-id helpers + alphabet presets |
| `prefixedId(prefix, opts?)` · `parsePrefixedId(value, sep?)` | Stripe-style typed ids, round-trippable |
| `decodeTime(id)` | timestamp from a ULID or UUID v7 |
| `isUuid(s)` · `uuidVersion(s)` · `isUlid(s)` · `isCuid2(s)` · `isSnowflake(s)` | validation |

`ALPHABETS` presets: `numeric`, `base36`, `hex`, `lowercase`, `base32Crockford`, `base58`, `base62`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/id` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/id
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

