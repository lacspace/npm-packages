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
| `id(prefix, size=16)` | prefixed id |
| `isUuid(s)` · `uuidVersion(s)` | validation |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
