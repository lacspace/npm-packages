<div align="center">

# @lacspace/humanize

**Turn machine values into human-readable text — bytes, durations, relative time, ordinals, plurals, compact numbers & lists.**

[![npm version](https://img.shields.io/npm/v/@lacspace/humanize?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/humanize)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/humanize?label=minzip)](https://bundlephobia.com/package/@lacspace/humanize)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/humanize)
[![license](https://img.shields.io/npm/l/@lacspace/humanize?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> All the little "make it readable" helpers you reach for on every UI — instead of installing `pretty-bytes` + `ms` + `humanize-duration` + a pluralize lib, get them as one tiny, typed, dependency-free package.

- 💾 `bytes` / `parseBytes` — `1536 → "1.5 KB"` (and IEC KiB)
- ⏱️ `duration` — `90061000 → "1d 1h"` (or long form)
- 🕒 `relativeTime` — `"3 hours ago"` / `"in 2 days"`
- 🔢 `ordinal`, `compact` (`1.2M`), `number` (grouping)
- ✍️ `pluralize`, `list` (`"a, b and c"`), `truncate`, `titleCase`

## Install

```bash
npm install @lacspace/humanize      # or pnpm add / yarn add / bun add
```

## Use

```ts
import { bytes, duration, relativeTime, compact, ordinal, pluralize, list } from "@lacspace/humanize";

bytes(1536);                       // "1.5 KB"
duration(90061000);                // "1d 1h"
relativeTime(Date.now() - 3.6e6);  // "1 hour ago"
compact(1234567);                  // "1.2M"
ordinal(21);                       // "21st"
pluralize(3, "city");              // "3 cities"
list(["red", "green", "blue"]);    // "red, green and blue"
```

## API

| Group | Functions |
| --- | --- |
| Size | `bytes`, `parseBytes` |
| Time | `duration`, `relativeTime` |
| Numbers | `ordinal`, `compact`, `number` |
| Words | `pluralize`, `plural`, `list`, `truncate`, `titleCase` |

Options let you switch to IEC units, long durations, more precision, Oxford commas and custom separators.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/humanize` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/humanize
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

